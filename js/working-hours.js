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

  const pageTitle = profile.role === "manager" ? "Worked Hours" : "Check IN";
  document.getElementById("page-heading").textContent = pageTitle;
  document.title = `RuxLog - ${pageTitle}`;

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
        <button type="button" id="off-toggle-btn" class="btn btn-auto btn-off" hidden>OFF DAY</button>
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

    <h3 class="section-title">Weekly Record</h3>
    <p class="text-muted">
      Every week (Monday–Sunday) stays here permanently, so you can always
      check back and see whether you owed or had extra hours that week.
    </p>
    <div class="table-responsive">
      <table class="data-table">
        <thead><tr><th>Week</th><th>Worked</th><th>Status</th></tr></thead>
        <tbody id="weekly-record-body"></tbody>
      </table>
    </div>
    <div id="weekly-record-pagination" class="pagination"></div>

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
  document.getElementById("off-toggle-btn").addEventListener("click", () => handleOffToggle(profile));

  await loadDriverData(profile);
}

// One query gives us everything for the live cards + daily history; a
// second gets the permanent per-week record (see weekly_work_hours in
// supabase/weekly_work_hours.sql); a third checks whether today is
// already marked off (see supabase/driver_day_off.sql).
async function loadDriverData(profile) {
  const today = (new Date()).toISOString().slice(0, 10);
  const [
    { data: sessions, error },
    { data: weeklyRecords, error: weeklyError },
    { data: offMarks, error: offError },
  ] = await Promise.all([
    supabaseClient
      .from("work_sessions_view")
      .select("*")
      .eq("driver_id", profile.id)
      .order("sign_in_at", { ascending: false })
      .limit(500),
    supabaseClient
      .from("weekly_work_hours")
      .select("*")
      .eq("driver_id", profile.id)
      .order("week_start", { ascending: false }),
    supabaseClient.from("driver_day_off").select("day").eq("driver_id", profile.id).eq("day", today),
  ]);

  if (error) throw error;
  if (weeklyError) throw weeklyError;
  if (offError) throw offError;

  const markedOffToday = (offMarks || []).length > 0;

  renderSignToggle(sessions || [], markedOffToday);
  renderTodaySummary(sessions || [], markedOffToday);
  renderWeekSummary(sessions || []);
  renderWeeklyRecordTable("weekly-record-body", "weekly-record-pagination", weeklyRecords || [], false);
  renderDriverHistory(sessions || []);
}

function renderSignToggle(sessions, markedOffToday) {
  const openSession = sessions.find((s) => !s.sign_out_at);
  const statusValueEl = document.getElementById("status-value");
  const btn = document.getElementById("sign-toggle-btn");
  const offBtn = document.getElementById("off-toggle-btn");

  if (openSession) {
    statusValueEl.textContent = `Signed in at ${formatTime(openSession.sign_in_at)}`;
    btn.textContent = "Sign Out";
    btn.classList.add("btn-signout");
    btn.dataset.action = "sign-out";
    btn.dataset.sessionId = openSession.id;

    // OFF only makes sense before signing in — there's no "day off" once
    // you're actively working.
    offBtn.hidden = true;
  } else {
    statusValueEl.textContent = "Not signed in";
    btn.textContent = "Sign In";
    btn.classList.remove("btn-signout");
    btn.dataset.action = "sign-in";
    btn.dataset.sessionId = "";

    offBtn.hidden = markedOffToday;
    offBtn.textContent = "OFF DAY";
  }
  btn.disabled = false;
  offBtn.disabled = false;
}

async function handleOffToggle(profile) {
  const offBtn = document.getElementById("off-toggle-btn");
  const messageEl = document.getElementById("sign-message");
  messageEl.textContent = "";
  offBtn.disabled = true;

  // day is forced to today (Rwanda local time) by the database trigger
  // regardless of anything sent here, and the trigger also rejects this
  // if a session is currently open.
  const { error } = await supabaseClient.from("driver_day_off").insert({ driver_id: profile.id });

  // 23505 = already marked off today — treat that as success, not an error.
  if (error && error.code !== "23505") {
    messageEl.textContent = error.message;
    offBtn.disabled = false;
    return;
  }

  await loadDriverData(profile);
}

function renderTodaySummary(sessions, markedOffToday) {
  const today = new Date();
  const todaySession = sessions.find((s) => isSameDay(new Date(s.sign_in_at), today));
  const el = document.getElementById("today-summary");

  if (!todaySession) {
    el.innerHTML = markedOffToday
      ? `<p class="empty-note">You're marked OFF today.</p>`
      : `<p class="empty-note">Not signed in yet today.</p>`;
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
    ${weeklyStatusBadge(weeklyHours, true)}
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

// Shared renderer for the Weekly Record table (see weekly_work_hours in
// supabase/weekly_work_hours.sql). Driver view passes its own rows;
// manager view passes rows with a driverName attached and withDriverColumn
// set, adding a Driver column.
function renderWeeklyRecordTable(bodyId, paginationId, rows, withDriverColumn) {
  const bodyEl = document.getElementById(bodyId);
  const paginationEl = document.getElementById(paginationId);
  const columnCount = withDriverColumn ? 4 : 3;

  if (rows.length === 0) {
    bodyEl.innerHTML = `<tr><td colspan="${columnCount}">No weekly records yet.</td></tr>`;
    paginationEl.innerHTML = "";
    return;
  }

  createPaginator(rows, paginationEl, (pageRows) => {
    bodyEl.innerHTML = pageRows
      .map((r) => {
        // week_start/week_end are plain dates (no time) — parse with an
        // explicit local time-of-day so the displayed day never shifts
        // depending on the viewer's timezone offset.
        const weekLabel = `${formatDate(r.week_start + "T00:00:00")} – ${formatDate(r.week_end + "T00:00:00")}`;
        const hours = Number(r.worked_hours);
        const driverCell = withDriverColumn ? `<td data-label="Driver">${r.driverName || "Unknown"}</td>` : "";
        return `<tr>
          <td data-label="Week">${weekLabel}</td>
          ${driverCell}
          <td data-label="Worked">${hours.toFixed(1)} hrs</td>
          <td data-label="Status">${weeklyStatusBadge(hours, !withDriverColumn)}</td>
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
        <h3>This Week Drivers Worked Hours</h3>
        <div id="week-by-driver">Loading...</div>
      </div>
    </div>

    <h3 class="section-title">Weekly Record</h3>
    <p class="text-muted">
      Every driver's week (Monday–Sunday) stays here permanently, so hours
      owed or extra from any past week are always available, not just the
      current one.
    </p>
    <div class="table-responsive">
      <table class="data-table">
        <thead><tr><th>Week</th><th>Driver</th><th>Worked</th><th>Status</th></tr></thead>
        <tbody id="weekly-record-body"></tbody>
      </table>
    </div>
    <div id="weekly-record-pagination" class="pagination"></div>

    <h3 class="section-title">All Sessions</h3>
    <div class="table-responsive">
      <table class="data-table">
        <thead><tr><th>Date</th><th>Driver</th><th>Sign In</th><th>Sign Out</th><th>Worked</th><th>Status</th></tr></thead>
        <tbody id="history-body"></tbody>
      </table>
    </div>
    <div id="history-pagination" class="pagination"></div>
  `;

  const today = (new Date()).toISOString().slice(0, 10);
  const [{ data: allSessions, error }, { data: drivers, error: driversError }, { data: offMarks, error: offError }] =
    await Promise.all([
      supabaseClient
        .from("work_sessions")
        .select("*, profiles(full_name, role)")
        .order("sign_in_at", { ascending: false })
        .limit(500),
      supabaseClient.from("profiles").select("id, full_name").eq("role", "driver"),
      supabaseClient.from("driver_day_off").select("driver_id").eq("day", today),
    ]);

  if (error) throw error;
  if (driversError) throw driversError;
  if (offError) throw offError;

  // Only drivers' hours are tracked — a manager's own sessions (if any
  // exist from earlier testing) are excluded everywhere on this page.
  const sessions = (allSessions || []).filter((s) => s.profiles && s.profiles.role === "driver");

  renderTodayByDriver(drivers || [], sessions, offMarks || []);
  renderWeekByDriver(sessions);
  renderManagerHistory(sessions);
  await renderWeeklyRecordManager();
}

// One row per driver (never one row per sign-in/out event), showing
// their current status right now: Signed in, Signed off, OFF, or
// nothing yet today.
function renderTodayByDriver(drivers, sessions, offMarks) {
  const today = new Date();
  const todaySessions = sessions.filter((s) => isSameDay(new Date(s.sign_in_at), today));
  const el = document.getElementById("today-by-driver");

  el.innerHTML = drivers.length
    ? `<ul>${drivers
        .map((d) => {
          const status = driverDayStatus(d.id, todaySessions, offMarks);
          return `<li><span>${d.full_name}</span><span>${driverDayStatusHtml(status)}</span></li>`;
        })
        .join("")}</ul>`
    : `<p class="empty-note">No drivers yet.</p>`;
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

// weekly_work_hours (a view) only has driver_id, not a name — embedding
// profiles through a view isn't reliably supported by PostgREST, so we
// fetch driver names separately and join them in JS instead.
async function renderWeeklyRecordManager() {
  const [{ data: weeklyRecords, error: weeklyError }, { data: drivers, error: driversError }] = await Promise.all([
    supabaseClient.from("weekly_work_hours").select("*").order("week_start", { ascending: false }),
    supabaseClient.from("profiles").select("id, full_name").eq("role", "driver"),
  ]);

  if (weeklyError) throw weeklyError;
  if (driversError) throw driversError;

  const nameById = {};
  (drivers || []).forEach((d) => {
    nameById[d.id] = d.full_name;
  });

  const rows = (weeklyRecords || []).map((r) => ({ ...r, driverName: nameById[r.driver_id] }));
  renderWeeklyRecordTable("weekly-record-body", "weekly-record-pagination", rows, true);
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
