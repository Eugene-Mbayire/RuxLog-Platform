// ==========================================================
// RuxLog Platform — Petty Cash (per vehicle)
//
// Each vehicle has its own separate petty cash pool. Rather than
// duplicating this page's markup/logic once per vehicle, we fetch
// the vehicle list and render one identical, independent panel per
// vehicle from a single template — adding a third vehicle later
// needs no code change here at all.
//
// Business rules enforced by the database, not just this page
// (see supabase/schema.sql, supabase/per_vehicle_petty_cash.sql, and
// supabase/driver_refill_auto_approve.sql): a withdrawal larger than
// that vehicle's current balance is rejected, the transaction time is
// always server-set, and everyone can refill — but a manager/admin's
// refill stays "pending" until a driver confirms it actually arrived,
// while a driver's own refill is auto-approved immediately since
// there's no one else who needs to confirm it.
// ==========================================================

// formatRWF() lives in js/utils.js, shared with the dashboard.

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireAuth();
  if (!profile) return;

  renderNav(profile);

  const container = document.getElementById("vehicles-container");
  const { data: vehicles, error } = await supabaseClient.from("vehicles").select("*").order("make_model");

  if (error || !vehicles || vehicles.length === 0) {
    container.innerHTML = `<p class="empty-note">Could not load vehicles.</p>`;
    return;
  }

  container.innerHTML = vehicles.map((v) => vehiclePanelHtml(v, profile)).join("");
  vehicles.forEach((v) => wireVehiclePanel(v, profile));
});

function vehiclePanelHtml(vehicle, profile) {
  const id = vehicle.id;

  return `
    <section class="vehicle-panel">
      <h3 class="vehicle-panel-title">${vehicle.make_model} — ${vehicle.plate_number}</h3>

      <div class="card-grid card-section">
        <div class="card">
          <h3>Current Balance</h3>
          <p class="big-value" id="balance-${id}">Loading...</p>
        </div>
      </div>

      <div id="pending-refills-${id}"></div>

      <details class="form-card">
        <summary>Withdraw</summary>
        <form id="withdraw-form-${id}">
          <div class="field">
            <label for="withdraw-amount-${id}">Amount (RWF)</label>
            <input type="number" id="withdraw-amount-${id}" min="1" step="1" required />
          </div>
          <div class="field">
            <label for="withdraw-reason-${id}">Reason</label>
            <input type="text" id="withdraw-reason-${id}" required />
          </div>
          <button type="submit" class="btn btn-auto">Withdraw</button>
          <p class="error-message" id="withdraw-message-${id}"></p>
        </form>
      </details>

      <details class="form-card">
        <summary>Refill Petty Cash</summary>
        <form id="refill-form-${id}">
          <div class="field">
            <label for="refill-amount-${id}">Amount (RWF)</label>
            <input type="number" id="refill-amount-${id}" min="1" step="1" required />
          </div>
          <div class="field">
            <label for="refill-reason-${id}">Note (optional)</label>
            <input type="text" id="refill-reason-${id}" />
          </div>
          <button type="submit" class="btn btn-auto">Refill</button>
          <p class="error-message" id="refill-message-${id}"></p>
        </form>
      </details>

      <h4 class="section-title">Transaction History</h4>
      <div class="table-responsive">
        <table class="data-table">
          <thead><tr id="history-head-${id}"></tr></thead>
          <tbody id="history-body-${id}"></tbody>
        </table>
      </div>
      <div id="history-pagination-${id}" class="pagination"></div>
    </section>
  `;
}

function wireVehiclePanel(vehicle, profile) {
  const id = vehicle.id;

  loadBalance(id);
  loadHistory(id);
  loadPendingRefills(id, profile);

  document.getElementById(`withdraw-form-${id}`).addEventListener("submit", async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById(`withdraw-message-${id}`);
    messageEl.textContent = "";

    const amount = Number(document.getElementById(`withdraw-amount-${id}`).value);
    const reason = document.getElementById(`withdraw-reason-${id}`).value.trim();

    const { error } = await supabaseClient.from("petty_cash_transactions").insert({
      user_id: profile.id,
      vehicle_id: id,
      type: "withdrawal",
      amount: amount,
      reason: reason,
    });

    if (error) {
      messageEl.textContent = error.message;
      return;
    }

    e.target.reset();
    e.target.closest("details").open = false;
    await loadBalance(id);
    await loadHistory(id);
  });

  document.getElementById(`refill-form-${id}`).addEventListener("submit", async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById(`refill-message-${id}`);
    messageEl.textContent = "";

    const amount = Number(document.getElementById(`refill-amount-${id}`).value);
    const reason = document.getElementById(`refill-reason-${id}`).value.trim();

    // Whether this needs a driver's confirmation before it counts
    // toward the balance is decided server-side (trg_driver_refill_auto_approve
    // in supabase/driver_refill_auto_approve.sql), not here.
    const { error } = await supabaseClient.from("petty_cash_transactions").insert({
      user_id: profile.id,
      vehicle_id: id,
      type: "refill",
      amount: amount,
      reason: reason || null,
    });

    if (error) {
      messageEl.textContent = error.message;
      return;
    }

    e.target.reset();
    e.target.closest("details").open = false;
    await loadBalance(id);
    await loadHistory(id);
    await loadPendingRefills(id, profile);
  });
}

// Refills don't affect the balance until a driver confirms them, so this
// shows what's waiting, and lets a driver (not the manager who submitted
// it) confirm they actually received the cash before it counts.
async function loadPendingRefills(vehicleId, profile) {
  const container = document.getElementById(`pending-refills-${vehicleId}`);

  const { data, error } = await supabaseClient
    .from("petty_cash_transactions")
    .select("*, profiles!user_id(full_name)")
    .eq("vehicle_id", vehicleId)
    .eq("type", "refill")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error || !data || data.length === 0) {
    container.innerHTML = "";
    return;
  }

  const canApprove = profile.role === "driver";

  container.innerHTML = `
    <div class="form-card">
      <h3>Pending Refill Confirmation</h3>
      <ul>
        ${data
          .map((r) => {
            const from = r.profiles ? r.profiles.full_name : "Unknown";
            const label = `${formatRWF(r.amount)} from ${from}${r.reason ? " — " + r.reason : ""}`;
            const action = canApprove
              ? `<button type="button" class="btn-page" data-approve-id="${r.id}">Confirm</button>`
              : `<span class="status-pill status-warning">Awaiting driver confirmation</span>`;
            return `<li><span>${label}</span>${action}</li>`;
          })
          .join("")}
      </ul>
    </div>
  `;

  container.querySelectorAll("[data-approve-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { error: approveError } = await supabaseClient
        .from("petty_cash_transactions")
        .update({ status: "approved" })
        .eq("id", btn.dataset.approveId);

      if (approveError) {
        alert("Could not confirm: " + approveError.message);
        return;
      }

      await loadBalance(vehicleId);
      await loadHistory(vehicleId);
      await loadPendingRefills(vehicleId, profile);
    });
  });
}

async function loadBalance(vehicleId) {
  const el = document.getElementById(`balance-${vehicleId}`);
  const { data, error } = await supabaseClient
    .from("petty_cash_balance")
    .select("current_balance")
    .eq("vehicle_id", vehicleId)
    .single();

  if (error) {
    el.textContent = "Could not load balance";
    console.error("Balance load failed:", error.message);
    return;
  }
  el.textContent = formatRWF(data.current_balance);
}

async function loadHistory(vehicleId) {
  document.getElementById(`history-head-${vehicleId}`).innerHTML =
    "<th>Date/Time</th><th>Name</th><th>Amount</th><th>Reason</th>";

  const { data, error } = await supabaseClient
    .from("petty_cash_transactions")
    .select("*, profiles!user_id(full_name)")
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: false });

  const bodyEl = document.getElementById(`history-body-${vehicleId}`);
  const paginationEl = document.getElementById(`history-pagination-${vehicleId}`);

  if (error) {
    bodyEl.innerHTML = `<tr><td colspan="4">Could not load history: ${error.message}</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    bodyEl.innerHTML = `<tr><td colspan="4">No transactions yet.</td></tr>`;
    paginationEl.innerHTML = "";
    return;
  }

  createPaginator(data, paginationEl, (pageRows) => {
    bodyEl.innerHTML = pageRows
      .map((row) => {
        const dateTime = new Date(row.created_at).toLocaleString();
        return `<tr>
          <td data-label="Date/Time">${dateTime}</td>
          <td data-label="Name">${row.profiles ? row.profiles.full_name : "Unknown"}</td>
          <td data-label="Amount">${formatRWF(row.amount)}</td>
          <td data-label="Reason">${row.reason || "—"}</td>
        </tr>`;
      })
      .join("");
  });
}
