// ==========================================================
// RuxLog Platform — Dashboard
//
// Loads the logged-in user's profile, renders the nav bar, then
// shows role-specific summary cards using live Supabase data.
// ==========================================================

const DAILY_EXPECTED_HOURS = 8;
const WEEKLY_EXPECTED_HOURS = 40;

// ---------- Small helpers ----------

function formatRWF(amount) {
  return new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(amount || 0) + " RWF";
}

function formatTime(isoString) {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Monday-based start of the week containing `date`
function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday ... 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

// Worked hours for a work_sessions row: still-open sessions count up to now
function sessionHours(session) {
  const start = new Date(session.sign_in_at);
  const end = session.sign_out_at ? new Date(session.sign_out_at) : new Date();
  return (end - start) / 3600000;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target - today) / 86400000);
}

function expiryBadge(dateStr) {
  const days = daysUntil(dateStr);
  if (days === null) return `<span class="status-pill">No date set</span>`;
  if (days < 0) return `<span class="status-pill status-danger">Expired</span>`;
  if (days === 0) return `<span class="status-pill status-danger">Expires today</span>`;
  if (days <= 7) return `<span class="status-pill status-danger">${days} days remaining</span>`;
  if (days <= 30) return `<span class="status-pill status-warning">${days} days remaining</span>`;
  return `<span class="status-pill status-ok">${days} days remaining</span>`;
}

function weeklyStatusBadge(hoursWorked) {
  const diff = hoursWorked - WEEKLY_EXPECTED_HOURS;
  if (Math.abs(diff) < 0.01) return `<span class="status-pill status-ok">Complete: 40 hours</span>`;
  if (diff < 0) return `<span class="status-pill status-warning">Owed: ${Math.abs(diff).toFixed(1)} hours</span>`;
  return `<span class="status-pill status-ok">Extra: ${diff.toFixed(1)} hours</span>`;
}

function card(title, bodyHtml) {
  return `<div class="card"><h3>${title}</h3>${bodyHtml}</div>`;
}

// ---------- Page setup ----------

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireAuth();
  if (!profile) return; // requireAuth() already redirected to index.html

  renderNav(profile);

  document.getElementById("welcome-text").textContent =
    `Welcome, ${profile.full_name} (${profile.role})`;
  document.getElementById("today-date").textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  if (profile.photo_path) {
    const img = document.getElementById("profile-photo");
    img.src = profile.photo_path;
    img.alt = profile.full_name;
    img.hidden = false;
  }

  // If any of the data queries below fail, show the real error on the page
  // itself instead of leaving the cards silently blank.
  try {
    if (profile.role === "manager") {
      await renderManagerDashboard();
    } else {
      await renderDriverDashboard(profile);
    }
  } catch (err) {
    console.error("Dashboard failed to load:", err);
    document.getElementById("cards-container").innerHTML =
      `<div class="card"><h3>Something went wrong</h3><p class="empty-note">${err.message}</p></div>`;
  }
});

// ---------- Driver dashboard ----------

async function renderDriverDashboard(profile) {
  const container = document.getElementById("cards-container");

  const [{ data: balances }, { data: sessions }, { data: vehicles }] = await Promise.all([
    supabaseClient.from("petty_cash_balance").select("*"),
    supabaseClient
      .from("work_sessions_view")
      .select("*")
      .eq("driver_id", profile.id)
      .order("sign_in_at", { ascending: false })
      .limit(30),
    supabaseClient.from("vehicles").select("*"),
  ]);

  const today = new Date();
  const todaySession = (sessions || []).find((s) => isSameDay(new Date(s.sign_in_at), today));

  const weekStart = startOfWeek(today);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekSessions = (sessions || []).filter((s) => {
    const signIn = new Date(s.sign_in_at);
    return signIn >= weekStart && signIn < weekEnd;
  });
  const weeklyHours = weekSessions.reduce((sum, s) => sum + Number(s.worked_hours), 0);

  let todayStatusHtml;
  if (!todaySession) {
    todayStatusHtml = `<p class="empty-note">Not signed in yet today.</p>`;
  } else {
    const workedToday = Number(todaySession.worked_hours);
    const lessThanExpected = todaySession.sign_out_at && workedToday < DAILY_EXPECTED_HOURS;
    todayStatusHtml = `
      <p class="big-value">${workedToday.toFixed(1)} hrs</p>
      <ul>
        <li><span>Sign in</span><span>${formatTime(todaySession.sign_in_at)}</span></li>
        <li><span>Sign out</span><span>${
          todaySession.sign_out_at ? formatTime(todaySession.sign_out_at) : "Still signed in"
        }</span></li>
      </ul>
      ${lessThanExpected ? `<span class="status-pill status-warning">Less than expected ${DAILY_EXPECTED_HOURS}h</span>` : ""}
    `;
  }

  const vehiclesHtml = (vehicles || []).length
    ? `<ul>${vehicles.map((v) => `<li><span>${v.make_model}</span><span>${v.plate_number}</span></li>`).join("")}</ul>`
    : `<p class="empty-note">No vehicles yet.</p>`;

  const balancesHtml = (balances || []).length
    ? `<ul>${balances
        .map((b) => `<li><span>${b.make_model}</span><span>${formatRWF(b.current_balance)}</span></li>`)
        .join("")}</ul>`
    : `<p class="empty-note">No petty cash pools yet.</p>`;

  container.innerHTML = [
    card("Petty Cash Balance", balancesHtml),
    card("Today's Status", todayStatusHtml),
    card(
      "This Week's Hours",
      `<p class="big-value">${weeklyHours.toFixed(1)} / ${WEEKLY_EXPECTED_HOURS} hrs</p>${weeklyStatusBadge(weeklyHours)}`
    ),
    card("Company Vehicles", vehiclesHtml),
  ].join("");
}

// ---------- Manager dashboard ----------

async function renderManagerDashboard() {
  const container = document.getElementById("cards-container");

  const [
    { count: driverCount },
    { count: vehicleCount },
    { data: balances },
    { data: allSessions },
    { data: docs },
    { data: meds },
    { data: withdrawals },
  ] = await Promise.all([
    supabaseClient.from("profiles").select("*", { count: "exact", head: true }).eq("role", "driver"),
    supabaseClient.from("vehicles").select("*", { count: "exact", head: true }),
    supabaseClient.from("petty_cash_balance").select("*"),
    supabaseClient
      .from("work_sessions")
      .select("*, profiles(full_name)")
      .order("sign_in_at", { ascending: false })
      .limit(100),
    supabaseClient
      .from("vehicle_documents")
      .select("*, vehicles(make_model, plate_number)")
      .not("expiry_date", "is", null)
      .order("expiry_date", { ascending: true }),
    supabaseClient.from("medicines").select("*").not("expiry_date", "is", null).order("expiry_date", { ascending: true }),
    supabaseClient
      .from("petty_cash_transactions")
      .select("*, profiles!user_id(full_name), vehicles(make_model)")
      .eq("type", "withdrawal")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const today = new Date();

  // Today's status per driver
  const todaySessions = (allSessions || []).filter((s) => isSameDay(new Date(s.sign_in_at), today));
  const todayStatusHtml = todaySessions.length
    ? `<ul>${todaySessions
        .map(
          (s) =>
            `<li><span>${s.profiles ? s.profiles.full_name : "Unknown"}</span><span>${
              s.sign_out_at ? "Signed out" : "Signed in"
            }</span></li>`
        )
        .join("")}</ul>`
    : `<p class="empty-note">No drivers signed in today yet.</p>`;

  // This week's hours per driver
  const weekStart = startOfWeek(today);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weeklyTotals = {};
  (allSessions || []).forEach((s) => {
    const signIn = new Date(s.sign_in_at);
    if (signIn >= weekStart && signIn < weekEnd) {
      const name = s.profiles ? s.profiles.full_name : "Unknown";
      weeklyTotals[name] = (weeklyTotals[name] || 0) + sessionHours(s);
    }
  });
  const weeklyHtml = Object.keys(weeklyTotals).length
    ? `<ul>${Object.entries(weeklyTotals)
        .map(([name, hours]) => `<li><span>${name}</span><span>${hours.toFixed(1)} hrs</span></li>`)
        .join("")}</ul>`
    : `<p class="empty-note">No hours logged this week yet.</p>`;

  // Vehicles with documents expiring within 30 days (or already expired)
  const expiringDocs = (docs || []).filter((d) => {
    const days = daysUntil(d.expiry_date);
    return days !== null && days <= 30;
  });
  const expiringDocsHtml = expiringDocs.length
    ? `<ul>${expiringDocs
        .slice(0, 5)
        .map(
          (d) =>
            `<li><span>${d.vehicles ? d.vehicles.make_model : "Vehicle"} — ${d.document_type}</span>${expiryBadge(
              d.expiry_date
            )}</li>`
        )
        .join("")}</ul>`
    : `<p class="empty-note">No documents expiring soon.</p>`;

  // Medicines expiring within 30 days
  const expiringMeds = (meds || []).filter((m) => {
    const days = daysUntil(m.expiry_date);
    return days !== null && days <= 30;
  });
  const expiringMedsHtml = expiringMeds.length
    ? `<ul>${expiringMeds.slice(0, 5).map((m) => `<li><span>${m.name}</span>${expiryBadge(m.expiry_date)}</li>`).join("")}</ul>`
    : `<p class="empty-note">No medicines expiring soon.</p>`;

  // Recent withdrawals (across both vehicles)
  const withdrawalsHtml = (withdrawals || []).length
    ? `<ul>${withdrawals
        .map((w) => {
          const vehicleName = w.vehicles ? w.vehicles.make_model : "Vehicle";
          const driverName = w.profiles ? w.profiles.full_name : "Unknown";
          return `<li><span>${driverName} — ${vehicleName} — ${w.reason || "No reason given"}</span><span>${formatRWF(
            w.amount
          )}</span></li>`;
        })
        .join("")}</ul>`
    : `<p class="empty-note">No withdrawals yet.</p>`;

  const balancesHtml = (balances || []).length
    ? `<ul>${balances
        .map((b) => `<li><span>${b.make_model}</span><span>${formatRWF(b.current_balance)}</span></li>`)
        .join("")}</ul>`
    : `<p class="empty-note">No petty cash pools yet.</p>`;

  container.innerHTML = [
    card("Drivers", `<p class="big-value">${driverCount || 0}</p>`),
    card("Vehicles", `<p class="big-value">${vehicleCount || 0}</p>`),
    card("Petty Cash Balance", balancesHtml),
    card("Today's Status", todayStatusHtml),
    card("This Week's Hours", weeklyHtml),
    card("Vehicle Documents Expiring Soon", expiringDocsHtml),
    card("Medicines Expiring Soon", expiringMedsHtml),
    card("Recent Petty Cash Withdrawals", withdrawalsHtml),
  ].join("");
}
