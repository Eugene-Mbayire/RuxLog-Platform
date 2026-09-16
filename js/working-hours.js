// ==========================================================
// RuxLog Platform — Working Hours
//
// Sign In / Sign Out always use the server's clock (see the
// enforce_actual_times trigger in supabase/schema.sql) — there is
// no field anywhere on this page for a driver to type a time. The
// database also blocks a second open session and a double sign-out,
// so even a stale UI (e.g. two tabs open) can't corrupt anything —
// a conflict just comes back as an error message here.
// ==========================================================

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireAuth();
  if (!profile) return;

  renderNav(profile);

  const container = document.getElementById("working-hours-content");

  try {
    if (profile.role === "manager") {
      await renderManagerView(container);
    } else {
      await renderDriverView(container, profile);
    }
  } catch (err) {
    console.error("Working hours failed to load:", err);
    container.innerHTML = `<div class="card"><h3>Something went wrong</h3><p class="empty-note">${err.message}</p></div>`;
  }
});

// ---------- Driver view ----------

async function renderDriverView(container, profile) {
  container.innerHTML = `
    <div class="card-grid card-section">
      <div class="card">
        <h3>Status</h3>
        <p class="big-value" id="status-value">Loading...</p>
        <button type="button" id="sign-toggle-btn" class="btn btn-large" disabled>Loading...</button>
        <p class="error-message" id="sign-message"></p>
      </div>
      <div class="card">
        <h3>Today</h3>
        <div id="today-summary">Loading...</div>
      </div>
      <div class="card">
        <h3>This Week</h3>
        <div id="week-summary">Loading...</div>
      </div>
    </div>

    <h3 class="section-title">History</h3>
    <div class="table-responsive">
      <table class="data-table">
        <thead><tr><th>Date</th><th>Sign In</th><th>Sign Out</th><th>Worked</th><th>Status</th></tr></thead>
        <tbody id="history-body"></tbody>
      </table>
    </div>
    <div id="history-pagination" class="pagination"></div>
  `;

  document.getElementById("sign-toggle-btn").addEventListener("click", () => handleSignToggle(profile));

  await loadDriverData(profile);
}

// One query gives us everything this page needs: open-session state,
// today's card, this week's card, and the full paginated history.
async function loadDriverData(profile) {
  const { data: sessions, error } = await supabaseClient
    .from("work_sessions_view")
    .select("*")
    .eq("driver_id", profile.id)
    .order("sign_in_at", { ascending: false })
    .limit(500);

  if (error) throw error;

  renderSignToggle(sessions || []);
  renderTodaySummary(sessions || []);
  renderWeekSummary(sessions || []);
  renderDriverHistory(sessions || []);
}

function renderSignToggle(sessions) {
  const openSession = sessions.find((s) => !s.sign_out_at);
  const statusValueEl = document.getElementById("status-value");
  const btn = document.getElementById("sign-toggle-btn");

  if (openSession) {
    statusValueEl.textContent = `Signed in at ${formatTime(openSession.sign_in_at)}`;
    btn.textContent = "Sign Out";
    btn.classList.add("btn-signout");
    btn.dataset.action = "sign-out";
    btn.dataset.sessionId = openSession.id;
  } else {
    statusValueEl.textContent = "Not signed in";
    btn.textContent = "Sign In";
    btn.classList.remove("btn-signout");
    btn.dataset.action = "sign-in";
    btn.dataset.sessionId = "";
  }
  btn.disabled = false;
}

function renderTodaySummary(sessions) {
  const today = new Date();
  const todaySession = sessions.find((s) => isSameDay(new Date(s.sign_in_at), today));
  const el = document.getElementById("today-summary");

  if (!todaySession) {
    el.innerHTML = `<p class="empty-note">Not signed in yet today.</p>`;
    return;
  }

  const workedToday = Number(todaySession.worked_hours);
  el.innerHTML = `
    <p class="big-value">${workedToday.toFixed(1)} hrs</p>
    <ul>
      <li><span>Sign in</span><span>${formatTime(todaySession.sign_in_at)}</span></li>
      <li><span>Sign out</span><span>${
        todaySession.sign_out_at ? formatTime(todaySession.sign_out_at) : "Still signed in"
      }</span></li>
    </ul>
    ${todaySession.sign_out_at ? dailyStatusBadge(workedToday) : ""}
  `;
}

function renderWeekSummary(sessions) {
  const today = new Date();
  const weekStart = startOfWeek(today);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const weekSessions = sessions.filter((s) => {
    const signIn = new Date(s.sign_in_at);
    return signIn >= weekStart && signIn < weekEnd;
  });
  const weeklyHours = weekSessions.reduce((sum, s) => sum + Number(s.worked_hours), 0);

  document.getElementById("week-summary").innerHTML = `
    <p class="big-value">${weeklyHours.toFixed(1)} / ${WEEKLY_EXPECTED_HOURS} hrs</p>
    ${weeklyStatusBadge(weeklyHours)}
  `;
}

function renderDriverHistory(sessions) {
  const bodyEl = document.getElementById("history-body");
  const paginationEl = document.getElementById("history-pagination");

  if (sessions.length === 0) {
    bodyEl.innerHTML = `<tr><td colspan="5">No sessions yet.</td></tr>`;
    paginationEl.innerHTML = "";
    return;
  }

  createPaginator(sessions, paginationEl, (pageRows) => {
    bodyEl.innerHTML = pageRows
      .map((s) => {
        const worked = Number(s.worked_hours);
        const statusCell = s.sign_out_at
          ? dailyStatusBadge(worked)
          : `<span class="status-pill status-warning">In progress</span>`;
        return `<tr>
          <td data-label="Date">${formatDate(s.sign_in_at)}</td>
          <td data-label="Sign In">${formatTime(s.sign_in_at)}</td>
          <td data-label="Sign Out">${s.sign_out_at ? formatTime(s.sign_out_at) : "Still signed in"}</td>
          <td data-label="Worked">${worked.toFixed(1)} hrs</td>
          <td data-label="Status">${statusCell}</td>
        </tr>`;
      })
      .join("");
  });
}

async function handleSignToggle(profile) {
  const btn = document.getElementById("sign-toggle-btn");
  const messageEl = document.getElementById("sign-message");
  messageEl.textContent = "";
  btn.disabled = true;

  let error;
  if (btn.dataset.action === "sign-in") {
    // sign_in_at is set by the database's own clock regardless of
    // anything sent here — there's no time field to fill in.
    ({ error } = await supabaseClient.from("work_sessions").insert({ driver_id: profile.id }));
  } else {
    // Same for sign_out_at: the trigger overwrites this with now().
    ({ error } = await supabaseClient
      .from("work_sessions")
      .update({ sign_out_at: new Date().toISOString() })
      .eq("id", btn.dataset.sessionId));
  }

  if (error) {
    messageEl.textContent = error.message;
    btn.disabled = false;
    return;
  }

  await loadDriverData(profile);
}

// ---------- Manager view (read-only overview of every driver) ----------

async function renderManagerView(container) {
  container.innerHTML = `
    <div class="card-grid card-section">
      <div class="card">
        <h3>Today's Status</h3>
        <div id="today-by-driver">Loading...</div>
      </div>
      <div class="card">
        <h3>This Week's Hours</h3>
        <div id="week-by-driver">Loading...</div>
      </div>
    </div>

    <h3 class="section-title">All Sessions</h3>
    <div class="table-responsive">
      <table class="data-table">
        <thead><tr><th>Date</th><th>Driver</th><th>Sign In</th><th>Sign Out</th><th>Worked</th><th>Status</th></tr></thead>
        <tbody id="history-body"></tbody>
      </table>
    </div>
    <div id="history-pagination" class="pagination"></div>
  `;

  const { data: sessions, error } = await supabaseClient
    .from("work_sessions")
    .select("*, profiles(full_name)")
    .order("sign_in_at", { ascending: false })
    .limit(500);

  if (error) throw error;

  renderTodayByDriver(sessions || []);
  renderWeekByDriver(sessions || []);
  renderManagerHistory(sessions || []);
}

function renderTodayByDriver(sessions) {
  const today = new Date();
  const todaySessions = sessions.filter((s) => isSameDay(new Date(s.sign_in_at), today));
  const el = document.getElementById("today-by-driver");

  el.innerHTML = todaySessions.length
    ? `<ul>${todaySessions
        .map((s) => {
          const name = s.profiles ? s.profiles.full_name : "Unknown";
          const status = s.sign_out_at
            ? `Signed out ${formatTime(s.sign_out_at)}`
            : `Signed in ${formatTime(s.sign_in_at)}`;
          return `<li><span>${name}</span><span>${status}</span></li>`;
        })
        .join("")}</ul>`
    : `<p class="empty-note">No drivers signed in today yet.</p>`;
}

function renderWeekByDriver(sessions) {
  const today = new Date();
  const weekStart = startOfWeek(today);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const totals = {};
  sessions.forEach((s) => {
    const signIn = new Date(s.sign_in_at);
    if (signIn >= weekStart && signIn < weekEnd) {
      const name = s.profiles ? s.profiles.full_name : "Unknown";
      totals[name] = (totals[name] || 0) + sessionHours(s);
    }
  });

  const el = document.getElementById("week-by-driver");
  el.innerHTML = Object.keys(totals).length
    ? `<ul>${Object.entries(totals)
        .map(([name, hours]) => `<li><span>${name}</span><span>${hours.toFixed(1)} / ${WEEKLY_EXPECTED_HOURS} hrs</span></li>`)
        .join("")}</ul>`
    : `<p class="empty-note">No hours logged this week yet.</p>`;
}

function renderManagerHistory(sessions) {
  const bodyEl = document.getElementById("history-body");
  const paginationEl = document.getElementById("history-pagination");

  if (sessions.length === 0) {
    bodyEl.innerHTML = `<tr><td colspan="6">No sessions yet.</td></tr>`;
    paginationEl.innerHTML = "";
    return;
  }

  createPaginator(sessions, paginationEl, (pageRows) => {
    bodyEl.innerHTML = pageRows
      .map((s) => {
        const worked = sessionHours(s);
        const statusCell = s.sign_out_at
          ? dailyStatusBadge(worked)
          : `<span class="status-pill status-warning">In progress</span>`;
        return `<tr>
          <td data-label="Date">${formatDate(s.sign_in_at)}</td>
          <td data-label="Driver">${s.profiles ? s.profiles.full_name : "Unknown"}</td>
          <td data-label="Sign In">${formatTime(s.sign_in_at)}</td>
          <td data-label="Sign Out">${s.sign_out_at ? formatTime(s.sign_out_at) : "Still signed in"}</td>
          <td data-label="Worked">${worked.toFixed(1)} hrs</td>
          <td data-label="Status">${statusCell}</td>
        </tr>`;
      })
      .join("");
  });
}
