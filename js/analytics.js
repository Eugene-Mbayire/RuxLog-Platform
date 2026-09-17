// ==========================================================
// RuxLog Platform — Analytics (manager only)
//
// This whole page is manager-only. RLS already lets a manager read
// everything (petty cash, sessions, consumption) across every driver
// and vehicle, so no special queries or grants were needed for this
// page — it just aggregates and charts data every other page already
// reads. Charts use Chart.js (from a CDN, see analytics.html) since
// hand-rolling trend lines and histograms in raw canvas would be a
// lot of reinvented, fragile code for something a small, well-
// established library already does reliably.
// ==========================================================

const WEEKS_TO_SHOW = 8;
const CHART_COLORS = ["#2f80ed", "#16a34a", "#dc2626", "#b45309", "#7c3aed"];

let pettyCashChartInstance = null;
let hoursChartInstance = null;
let medicineChartInstance = null;

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireAuth();
  if (!profile) return;

  // This page is manager/admin only — a driver is sent straight back
  // to their dashboard rather than seeing a broken/empty page.
  if (!isManagerOrAdmin(profile)) {
    window.location.href = "dashboard.html";
    return;
  }

  renderNav(profile);

  const container = document.getElementById("analytics-content");

  try {
    await loadAnalytics(container);
  } catch (err) {
    console.error("Analytics failed to load:", err);
    container.innerHTML = `<div class="card"><h3>Something went wrong</h3><p class="empty-note">${err.message}</p></div>`;
  }
});

async function loadAnalytics(container) {
  const [
    { data: vehicles, error: vehiclesError },
    { data: pettyCash, error: pettyCashError },
    { data: sessions, error: sessionsError },
    { data: drivers, error: driversError },
    { data: consumptions, error: consumptionsError },
    { data: docs, error: docsError },
  ] = await Promise.all([
    supabaseClient.from("vehicles").select("*").order("make_model"),
    supabaseClient.from("petty_cash_transactions").select("*").order("created_at"),
    supabaseClient.from("work_sessions").select("*, profiles(full_name)").order("sign_in_at"),
    supabaseClient.from("profiles").select("id, full_name").eq("role", "driver"),
    supabaseClient.from("medicine_consumptions").select("*, medicines(name), profiles(full_name)").order("consumed_at"),
    supabaseClient.from("vehicle_documents").select("*, vehicles(make_model)").not("expiry_date", "is", null),
  ]);

  if (vehiclesError) throw vehiclesError;
  if (pettyCashError) throw pettyCashError;
  if (sessionsError) throw sessionsError;
  if (driversError) throw driversError;
  if (consumptionsError) throw consumptionsError;
  if (docsError) throw docsError;

  const driverSessions = (sessions || []).filter((s) => s.profiles);

  container.innerHTML = scaffoldHtml();

  renderOverviewCards(pettyCash || [], driverSessions, consumptions || [], docs || []);
  renderPettyCashChart(vehicles || [], pettyCash || []);
  renderHoursChart(drivers || [], driverSessions);
  renderMedicineChart(consumptions || []);
  wireDownloads(pettyCash || [], driverSessions, consumptions || [], vehicles || []);
}

function scaffoldHtml() {
  return `
    <div id="overview-cards" class="card-grid card-section"></div>

    <h3 class="section-title">Petty Cash Trend — Withdrawals per Week</h3>
    <p class="text-muted">Last ${WEEKS_TO_SHOW} weeks, by vehicle.</p>
    <div class="chart-card"><canvas id="petty-cash-chart"></canvas></div>
    <button type="button" class="btn-page" id="download-petty-cash-chart">Download Chart as Image</button>

    <h3 class="section-title">Working Hours Trend</h3>
    <p class="text-muted">Last ${WEEKS_TO_SHOW} weeks, by driver, against the ${WEEKLY_EXPECTED_HOURS}h target.</p>
    <div class="chart-card"><canvas id="hours-chart"></canvas></div>
    <button type="button" class="btn-page" id="download-hours-chart">Download Chart as Image</button>

    <h3 class="section-title">Most Consumed Medicines</h3>
    <p class="text-muted">Top 10 by total units consumed, all-time.</p>
    <div class="chart-card"><canvas id="medicine-chart"></canvas></div>
    <button type="button" class="btn-page" id="download-medicine-chart">Download Chart as Image</button>

    <h3 class="section-title">Download Reports</h3>
    <p class="text-muted">Latest activity first, capped at 2 pages per report (PDF).</p>
    <div class="actions-cell">
      <button type="button" class="btn-page" id="download-petty-cash-pdf">Petty Cash Transactions (PDF)</button>
      <button type="button" class="btn-page" id="download-hours-pdf">Work Sessions (PDF)</button>
      <button type="button" class="btn-page" id="download-medicine-pdf">Medicine Consumption (PDF)</button>
    </div>
  `;
}

// ---------- Overview cards ----------

function renderOverviewCards(pettyCash, driverSessions, consumptions, docs) {
  const totalSpent = pettyCash
    .filter((t) => t.type === "withdrawal")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const now = new Date();
  const isThisMonth = (dateStr) => {
    const d = new Date(dateStr);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  };

  const hoursThisMonth = driverSessions
    .filter((s) => isThisMonth(s.sign_in_at))
    .reduce((sum, s) => sum + sessionHours(s), 0);

  const medsThisMonth = consumptions
    .filter((c) => isThisMonth(c.consumed_at))
    .reduce((sum, c) => sum + c.quantity_used, 0);

  const attentionCount = docs.filter((d) => {
    const days = daysUntil(d.expiry_date);
    return days !== null && days <= 30;
  }).length;

  document.getElementById("overview-cards").innerHTML = [
    card("Total Petty Cash Spent (All-Time)", `<p class="big-value">${formatRWF(totalSpent)}</p>`),
    card("Hours Logged This Month", `<p class="big-value">${hoursThisMonth.toFixed(1)} hrs</p>`),
    card("Medicines Consumed This Month", `<p class="big-value">${medsThisMonth}</p>`),
    card("Vehicle Documents Needing Attention", `<p class="big-value">${attentionCount}</p>`),
  ].join("");
}

// ---------- Shared week-bucketing helper ----------

// Last N Monday-based weeks (oldest first, ending with the current week).
function lastNWeeks(n) {
  const weeks = [];
  const thisWeekStart = startOfWeek(new Date());
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(thisWeekStart);
    start.setDate(start.getDate() - i * 7);
    weeks.push({ start, label: formatDate(toDateString(start) + "T00:00:00") });
  }
  return weeks;
}

function weekIndexFor(date, weeks) {
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (date >= weeks[i].start) return i;
  }
  return -1;
}

// ---------- Petty cash trend ----------

function renderPettyCashChart(vehicles, pettyCash) {
  const weeks = lastNWeeks(WEEKS_TO_SHOW);
  const labels = weeks.map((w) => w.label);

  const datasets = vehicles.map((v, idx) => {
    const weeklyTotals = new Array(weeks.length).fill(0);
    pettyCash
      .filter((t) => t.vehicle_id === v.id && t.type === "withdrawal")
      .forEach((t) => {
        const wi = weekIndexFor(new Date(t.created_at), weeks);
        if (wi >= 0) weeklyTotals[wi] += Number(t.amount);
      });

    const color = CHART_COLORS[idx % CHART_COLORS.length];
    return {
      label: v.make_model,
      data: weeklyTotals,
      borderColor: color,
      backgroundColor: color,
      tension: 0.25,
    };
  });

  pettyCashChartInstance = new Chart(document.getElementById("petty-cash-chart"), {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: { y: { beginAtZero: true, title: { display: true, text: "RWF withdrawn" } } },
    },
  });
}

// ---------- Working hours trend ----------

function renderHoursChart(drivers, driverSessions) {
  const weeks = lastNWeeks(WEEKS_TO_SHOW);
  const labels = weeks.map((w) => w.label);

  const barDatasets = drivers.map((d, idx) => {
    const weeklyTotals = new Array(weeks.length).fill(0);
    driverSessions
      .filter((s) => s.driver_id === d.id)
      .forEach((s) => {
        const wi = weekIndexFor(new Date(s.sign_in_at), weeks);
        if (wi >= 0) weeklyTotals[wi] += sessionHours(s);
      });

    return {
      type: "bar",
      label: d.full_name,
      data: weeklyTotals.map((h) => Number(h.toFixed(1))),
      backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
    };
  });

  const targetLine = {
    type: "line",
    label: `Target (${WEEKLY_EXPECTED_HOURS}h)`,
    data: new Array(weeks.length).fill(WEEKLY_EXPECTED_HOURS),
    borderColor: "#1f2937",
    borderDash: [6, 6],
    pointRadius: 0,
    fill: false,
  };

  hoursChartInstance = new Chart(document.getElementById("hours-chart"), {
    type: "bar",
    data: { labels, datasets: [...barDatasets, targetLine] },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: { y: { beginAtZero: true, title: { display: true, text: "Hours" } } },
    },
  });
}

// ---------- Medicine consumption histogram ----------

function renderMedicineChart(consumptions) {
  const totals = {};
  consumptions.forEach((c) => {
    const name = c.medicines ? c.medicines.name : "Unknown";
    totals[name] = (totals[name] || 0) + c.quantity_used;
  });

  const sorted = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  medicineChartInstance = new Chart(document.getElementById("medicine-chart"), {
    type: "bar",
    data: {
      labels: sorted.map(([name]) => name),
      datasets: [{ label: "Units consumed", data: sorted.map(([, qty]) => qty), backgroundColor: CHART_COLORS[0] }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, title: { display: true, text: "Units consumed" } } },
    },
  });

  if (sorted.length === 0) {
    document
      .getElementById("medicine-chart")
      .insertAdjacentHTML("afterend", `<p class="empty-note">No consumption recorded yet.</p>`);
  }
}

// ---------- Downloads ----------

function wireDownloads(pettyCash, driverSessions, consumptions, vehicles) {
  document
    .getElementById("download-petty-cash-chart")
    .addEventListener("click", () => downloadChart(pettyCashChartInstance, "petty-cash-trend.png"));
  document
    .getElementById("download-hours-chart")
    .addEventListener("click", () => downloadChart(hoursChartInstance, "working-hours-trend.png"));
  document
    .getElementById("download-medicine-chart")
    .addEventListener("click", () => downloadChart(medicineChartInstance, "medicine-consumption.png"));

  const vehicleName = (id) => {
    const v = vehicles.find((veh) => veh.id === id);
    return v ? v.make_model : "Unknown";
  };

  document.getElementById("download-petty-cash-pdf").addEventListener("click", () => {
    downloadPdf(
      "petty-cash-transactions.pdf",
      "Petty Cash Transactions",
      ["Date", "Vehicle", "Type", "Amount (RWF)", "Status", "Reason"],
      // Newest first, same as the "latest first" rule for every report here.
      pettyCash
        .slice()
        .reverse()
        .map((t) => [
          new Date(t.created_at).toLocaleString(),
          vehicleName(t.vehicle_id),
          t.type,
          t.amount,
          t.status,
          t.reason || "",
        ])
    );
  });

  document.getElementById("download-hours-pdf").addEventListener("click", () => {
    downloadPdf(
      "work-sessions.pdf",
      "Work Sessions",
      ["Driver", "Sign In", "Sign Out", "Worked Hours"],
      driverSessions
        .slice()
        .reverse()
        .map((s) => [
          s.profiles ? s.profiles.full_name : "Unknown",
          new Date(s.sign_in_at).toLocaleString(),
          s.sign_out_at ? new Date(s.sign_out_at).toLocaleString() : "Still signed in",
          sessionHours(s).toFixed(2),
        ])
    );
  });

  document.getElementById("download-medicine-pdf").addEventListener("click", () => {
    downloadPdf(
      "medicine-consumption.pdf",
      "Medicine Consumption",
      ["Date/Time", "Medicine", "Consumed By", "Quantity"],
      consumptions
        .slice()
        .reverse()
        .map((c) => [
          new Date(c.consumed_at).toLocaleString(),
          c.medicines ? c.medicines.name : "Unknown",
          c.profiles ? c.profiles.full_name : "Unknown",
          c.quantity_used,
        ])
    );
  });
}

function downloadChart(chartInstance, filename) {
  if (!chartInstance) return;
  const link = document.createElement("a");
  link.download = filename;
  link.href = chartInstance.toBase64Image();
  link.click();
}

// PDF report via jsPDF + autotable (both from a CDN, see analytics.html).
// Rows must already be newest-first — this just renders them and then
// hard-caps the result at 2 pages, discarding anything that would have
// flowed further, so the most recent activity is always what's kept.
function downloadPdf(filename, title, headers, rows) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(14);
  doc.text(title, 14, 15);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated ${new Date().toLocaleString()} — most recent first`, 14, 21);

  doc.autoTable({
    head: [headers],
    body: rows,
    startY: 26,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 58, 95] }, // matches --ruxlog-primary
  });

  const totalPages = doc.internal.getNumberOfPages();
  for (let page = totalPages; page > 2; page--) {
    doc.deletePage(page);
  }

  doc.save(filename);
}
