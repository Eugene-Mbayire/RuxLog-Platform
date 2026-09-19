// ==========================================================
// RuxLog Platform — Dashboard
//
// Loads the logged-in user's profile, renders the nav bar, then
// shows role-specific summary cards using live Supabase data.
// ==========================================================

// Shared formatting/date helpers (formatRWF, formatTime, isSameDay,
// startOfWeek, sessionHours, daysUntil, expiryBadge, weeklyStatusBadge,
// card, DAILY_EXPECTED_HOURS, WEEKLY_EXPECTED_HOURS) live in js/utils.js.

// ---------- Page setup ----------

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireAuth();
  if (!profile) return; // requireAuth() already redirected to index.html

  renderNav(profile);

  document.getElementById("welcome-text").textContent =
    `Welcome, ${profile.full_name}!`;
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

  try {
    await renderDashboardSchedulePreview(document.getElementById("dashboard-schedule-container"));
  } catch (err) {
    console.error("Schedule preview failed to load:", err);
  }

  // If any of the data queries below fail, show the real error on the page
  // itself instead of leaving the cards silently blank.
  try {
    if (isHouseStaff(profile)) {
      await renderHouseStaffDashboard();
    } else if (isManagerOrAdmin(profile)) {
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

// ---------- House staff dashboard ----------
// Petty cash only. The day's schedule is already rendered above the
// cards for every role, which is the other half of what they see.

async function renderHouseStaffDashboard() {
  const { data: balances } = await supabaseClient.from("petty_cash_balance").select("*");

  const balancesHtml = (balances || []).length
    ? `<ul>${balances
        .map((b) => `<li><span>${b.make_model}</span><span>${formatRWF(b.current_balance)}</span></li>`)
        .join("")}</ul>`
    : `<p class="empty-note">No petty cash pools yet.</p>`;

  document.getElementById("cards-container").innerHTML = card("Petty Cash Balance", balancesHtml);
}

// ---------- Driver dashboard ----------

async function renderDriverDashboard(profile) {
  const container = document.getElementById("cards-container");

  const todayStr = toDateString(new Date());

  const [{ data: balances }, { data: sessions }, { data: weeklyRecords }, { data: offMarks }, { data: missingSupplies }] =
    await Promise.all([
      supabaseClient.from("petty_cash_balance").select("*"),
      supabaseClient
        .from("work_sessions_view")
        .select("*")
        .eq("driver_id", profile.id)
        .order("sign_in_at", { ascending: false })
        .limit(30),
      supabaseClient.from("weekly_work_hours").select("worked_hours").eq("driver_id", profile.id),
      supabaseClient.from("driver_day_off").select("day").eq("driver_id", profile.id).eq("day", todayStr),
      missingSuppliesQuery(),
    ]);

  const today = new Date();
  const todaySession = (sessions || []).find((s) => isSameDay(new Date(s.sign_in_at), today));
  const markedOffToday = (offMarks || []).length > 0;

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
    todayStatusHtml = markedOffToday
      ? `<p class="empty-note">You're marked OFF today.</p>`
      : `<p class="empty-note">Not signed in yet today.</p>`;
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

  const balancesHtml = (balances || []).length
    ? `<ul>${balances
        .map((b) => `<li><span>${b.make_model}</span><span>${formatRWF(b.current_balance)}</span></li>`)
        .join("")}</ul>`
    : `<p class="empty-note">No petty cash pools yet.</p>`;

  // Total owed/extra across every week on record, not just this one —
  // sum of (worked - 40) per week.
  const totalDiff = (weeklyRecords || []).reduce((sum, w) => sum + (Number(w.worked_hours) - WEEKLY_EXPECTED_HOURS), 0);

  container.innerHTML = [
    card("Petty Cash Balance", balancesHtml),
    card("Today's Status", todayStatusHtml),
    card(
      "This Week Drivers Worked Hours",
      `<p class="big-value">${weeklyHours.toFixed(1)} / ${WEEKLY_EXPECTED_HOURS} hrs</p>${weeklyStatusBadge(weeklyHours, true)}`
    ),
    card("Total Hours Owed / Extra", totalHoursStatusBadge(totalDiff, true)),
    card("Car Supplies", missingSuppliesHtml(missingSupplies)),
  ].join("");
}

// ---------- Car supplies (shown on every role's dashboard) ----------
// Only the missing ones matter here — anything an admin has unticked
// on the Vehicles page shows up as a flag, named with the car it
// belongs to, so nobody has to go looking for it.

function missingSuppliesQuery() {
  return supabaseClient
    .from("car_supplies")
    .select("name, vehicles(make_model)")
    .eq("is_available", false)
    .order("created_at");
}

function missingSuppliesHtml(missingSupplies) {
  if (!missingSupplies || missingSupplies.length === 0) {
    return `<p class="empty-note">All cars have every supply.</p>`;
  }

  return `<ul>${missingSupplies
    .map((s) => {
      // "BYD TANG" reads as just "TANG" here — the make is the same on
      // every car, so it's noise in a list this short.
      const carName = s.vehicles ? s.vehicles.make_model.replace(/^BYD\s+/i, "") : "Vehicle";
      return `<li>
        <span>${carName}: ${s.name}</span>
        <span class="status-pill status-danger">Missing</span>
      </li>`;
    })
    .join("")}</ul>`;
}

// ---------- Manager dashboard ----------

async function renderManagerDashboard() {
  const container = document.getElementById("cards-container");

  const todayStr = toDateString(new Date());

  const [
    { data: balances },
    { data: allSessions },
    { data: docs },
    { data: meds },
    { data: withdrawals },
    { data: weeklyRecords },
    { data: drivers },
    { data: offMarks },
    { data: missingSupplies },
  ] = await Promise.all([
    supabaseClient.from("petty_cash_balance").select("*"),
    supabaseClient
      .from("work_sessions")
      .select("*, profiles(full_name, role)")
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
    // weekly_work_hours is a view, so it can't reliably embed a driver
    // name — fetched separately and joined in JS below instead.
    supabaseClient.from("weekly_work_hours").select("driver_id, worked_hours"),
    supabaseClient.from("profiles").select("id, full_name").eq("role", "driver"),
    supabaseClient.from("driver_day_off").select("driver_id").eq("day", todayStr),
    missingSuppliesQuery(),
  ]);

  const today = new Date();

  // Only drivers' hours are tracked — a manager's own sessions (if any
  // exist from earlier testing) are excluded from these aggregates.
  const driverSessions = (allSessions || []).filter((s) => s.profiles && s.profiles.role === "driver");

  // One row per driver (never one row per sign-in/out event)
  const todaySessions = driverSessions.filter((s) => isSameDay(new Date(s.sign_in_at), today));
  const todayStatusHtml = (drivers || []).length
    ? `<ul>${(drivers || [])
        .map((d) => {
          const status = driverDayStatus(d.id, todaySessions, offMarks || []);
          return `<li><span>${d.full_name}</span><span>${driverDayStatusHtml(status)}</span></li>`;
        })
        .join("")}</ul>`
    : `<p class="empty-note">No drivers yet.</p>`;

  // This week's hours per driver
  const weekStart = startOfWeek(today);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weeklyTotals = {};
  driverSessions.forEach((s) => {
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

  // Total owed/extra per driver across every week on record, not just
  // this one — sum of (worked - 40) per week, grouped by driver.
  const totalDiffByDriver = {};
  (weeklyRecords || []).forEach((w) => {
    totalDiffByDriver[w.driver_id] =
      (totalDiffByDriver[w.driver_id] || 0) + (Number(w.worked_hours) - WEEKLY_EXPECTED_HOURS);
  });
  const totalHoursHtml = (drivers || []).length
    ? `<ul>${drivers
        .map((d) => `<li><span>${d.full_name}</span>${totalHoursStatusBadge(totalDiffByDriver[d.id] || 0, false)}</li>`)
        .join("")}</ul>`
    : `<p class="empty-note">No drivers yet.</p>`;

  container.innerHTML = [
    card("Petty Cash Balance", balancesHtml),
    card("Drivers On Duty", todayStatusHtml),
    card("This Week Drivers Worked Hours", weeklyHtml),
    card("Total Hours Owed / Extra", totalHoursHtml),
    card("Vehicle Documents Expiring Soon", expiringDocsHtml),
    card("Medicines Expiring Soon", expiringMedsHtml),
    card("Recent Petty Cash Withdrawals", withdrawalsHtml),
    card("Car Supplies", missingSuppliesHtml(missingSupplies)),
  ].join("");
}
