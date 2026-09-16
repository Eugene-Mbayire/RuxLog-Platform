// ==========================================================
// RuxLog Platform — Shared helpers
//
// Formatting/date/calculation helpers reused across pages, so
// each page's own script only has to hold page-specific logic.
// Load this before any page-specific script (after auth.js/nav.js).
// ==========================================================

const DAILY_EXPECTED_HOURS = 8;
const WEEKLY_EXPECTED_HOURS = 40;

function formatRWF(amount) {
  return new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(amount || 0) + " RWF";
}

function formatTime(isoString) {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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

// Worked hours for a raw work_sessions row: still-open sessions count up to now
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
  if (Math.abs(diff) < 0.01) return `<span class="status-pill status-ok">Complete: ${WEEKLY_EXPECTED_HOURS} hours</span>`;
  if (diff < 0) return `<span class="status-pill status-warning">Owed: ${Math.abs(diff).toFixed(1)} hours</span>`;
  return `<span class="status-pill status-ok">Extra: ${diff.toFixed(1)} hours</span>`;
}

function dailyStatusBadge(workedHours) {
  if (workedHours >= DAILY_EXPECTED_HOURS) return `<span class="status-pill status-ok">Complete</span>`;
  return `<span class="status-pill status-warning">Less than ${DAILY_EXPECTED_HOURS}h</span>`;
}

function card(title, bodyHtml) {
  return `<div class="card"><h3>${title}</h3>${bodyHtml}</div>`;
}
