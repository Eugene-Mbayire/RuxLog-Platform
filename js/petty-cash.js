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
//
// Admin only: past transactions can be edited or deleted. Editing an
// amount moves the balance with it (the balance is summed live from
// these rows), but deleting is a soft delete — the row stops showing
// in the history while still counting toward the balance, so the
// balance stays exactly as it was (see
// supabase/petty_cash_admin_edit_delete.sql).
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
  wirePanelToggles(container);
});

function vehiclePanelHtml(vehicle, profile) {
  const id = vehicle.id;
  const canManage = profile.role === "admin";

  return `
    <section class="vehicle-panel">
      <h3 class="vehicle-panel-title" data-panel-toggle>
        <span class="vehicle-panel-caret">&#9656;</span>
        ${vehicleThumbHtml(vehicle)}
        <span>${vehicle.make_model} — ${vehicle.plate_number}</span>
      </h3>

      <div class="vehicle-panel-body">
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

      ${canManage ? editTransactionFormHtml(id) : ""}

      <h4 class="section-title">Transaction History</h4>
      <div class="table-responsive">
        <table class="data-table">
          <thead><tr id="history-head-${id}"></tr></thead>
          <tbody id="history-body-${id}"></tbody>
        </table>
      </div>
      <div id="history-pagination-${id}" class="pagination"></div>
      <button type="button" class="btn-page" id="download-transactions-${id}">Download Petty Cash Report(PDF)</button>
      </div>
    </section>
  `;
}

// ---------- Edit a past transaction (admin only) ----------

function editTransactionFormHtml(vehicleId) {
  return `
    <div class="form-card" id="edit-transaction-card-${vehicleId}" hidden>
      <h3>Edit Transaction</h3>
      <form id="edit-transaction-form-${vehicleId}">
        <input type="hidden" id="edit-transaction-id-${vehicleId}" />
        <div class="field">
          <label for="edit-transaction-amount-${vehicleId}">Amount (RWF)</label>
          <input type="number" id="edit-transaction-amount-${vehicleId}" min="1" step="1" required />
        </div>
        <div class="field">
          <label for="edit-transaction-reason-${vehicleId}">Reason / Note</label>
          <input type="text" id="edit-transaction-reason-${vehicleId}" />
        </div>
        <button type="submit" class="btn btn-auto">Save Changes</button>
        <button type="button" id="edit-transaction-cancel-${vehicleId}" class="btn btn-auto btn-off">Cancel</button>
        <p class="error-message" id="edit-transaction-message-${vehicleId}"></p>
      </form>
    </div>
  `;
}

function wireEditTransactionForm(vehicleId, profile) {
  const form = document.getElementById(`edit-transaction-form-${vehicleId}`);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById(`edit-transaction-message-${vehicleId}`);
    messageEl.textContent = "";

    const transactionId = document.getElementById(`edit-transaction-id-${vehicleId}`).value;
    const amount = Number(document.getElementById(`edit-transaction-amount-${vehicleId}`).value);
    const reason = document.getElementById(`edit-transaction-reason-${vehicleId}`).value.trim();

    const { error } = await supabaseClient
      .from("petty_cash_transactions")
      .update({ amount: amount, reason: reason || null })
      .eq("id", transactionId);

    if (error) {
      messageEl.textContent = error.message;
      return;
    }

    document.getElementById(`edit-transaction-card-${vehicleId}`).hidden = true;
    await loadBalance(vehicleId);
    await loadHistory(vehicleId, profile);
  });

  document.getElementById(`edit-transaction-cancel-${vehicleId}`).addEventListener("click", () => {
    document.getElementById(`edit-transaction-card-${vehicleId}`).hidden = true;
  });
}

function openEditTransactionForm(vehicleId, transaction) {
  document.getElementById(`edit-transaction-id-${vehicleId}`).value = transaction.id;
  document.getElementById(`edit-transaction-amount-${vehicleId}`).value = transaction.amount;
  document.getElementById(`edit-transaction-reason-${vehicleId}`).value = transaction.reason || "";

  const card = document.getElementById(`edit-transaction-card-${vehicleId}`);
  card.hidden = false;
  card.scrollIntoView({ block: "center" });
}

function wireVehiclePanel(vehicle, profile) {
  const id = vehicle.id;

  loadBalance(id);
  loadHistory(id, profile);
  loadPendingRefills(id, profile);

  if (profile.role === "admin") wireEditTransactionForm(id, profile);

  document.getElementById(`download-transactions-${id}`).addEventListener("click", () => {
    const rows = historyCache[id] || [];
    if (rows.length === 0) {
      alert("There are no transactions to download yet.");
      return;
    }

    // Already newest-first from loadHistory, which is what downloadPdf expects.
    downloadPdf(
      `petty-cash-report-${vehicle.make_model.toUpperCase().replace(/\s+/g, "-")}.pdf`,
      `Petty Cash Transactions — ${vehicle.make_model} (${vehicle.plate_number})`,
      ["Date", "Name", "Type", "Amount (RWF)", "Status", "Reason"],
      rows.map((t) => [
        new Date(t.created_at).toLocaleString(),
        t.profiles ? t.profiles.full_name : "Unknown",
        t.type,
        t.amount,
        t.status,
        t.reason || "",
      ]),
      1 // one page only
    );
  });

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
    await loadHistory(id, profile);
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
    await loadHistory(id, profile);
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
    .is("deleted_at", null)
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
      await loadHistory(vehicleId, profile);
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

// Newest-first rows per vehicle, kept so the PDF button can render
// exactly what the table is showing without re-querying.
const historyCache = {};

async function loadHistory(vehicleId, profile) {
  const canManage = profile.role === "admin";
  const columnCount = canManage ? 5 : 4;

  document.getElementById(`history-head-${vehicleId}`).innerHTML =
    "<th>Date/Time</th><th>Name</th><th>Amount</th><th>Reason</th>" + (canManage ? "<th>Actions</th>" : "");

  // Deleted records stay in the table (so they keep counting toward the
  // balance) — they're just filtered out of the history everyone sees.
  const { data, error } = await supabaseClient
    .from("petty_cash_transactions")
    .select("*, profiles!user_id(full_name)")
    .eq("vehicle_id", vehicleId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const bodyEl = document.getElementById(`history-body-${vehicleId}`);
  const paginationEl = document.getElementById(`history-pagination-${vehicleId}`);

  if (error) {
    bodyEl.innerHTML = `<tr><td colspan="${columnCount}">Could not load history: ${error.message}</td></tr>`;
    return;
  }

  historyCache[vehicleId] = data || [];

  if (!data || data.length === 0) {
    bodyEl.innerHTML = `<tr><td colspan="${columnCount}">No transactions yet.</td></tr>`;
    paginationEl.innerHTML = "";
    return;
  }

  createPaginator(data, paginationEl, (pageRows) => {
    bodyEl.innerHTML = pageRows
      .map((row) => {
        const dateTime = new Date(row.created_at).toLocaleString();
        const actions = canManage
          ? `<td data-label="Actions" class="actions-cell">
               <button type="button" class="btn-page" data-edit-id="${row.id}">Edit</button>
               <button type="button" class="btn-delete" data-delete-id="${row.id}" title="Delete record" aria-label="Delete record">✕</button>
             </td>`
          : "";
        return `<tr>
          <td data-label="Date/Time">${dateTime}</td>
          <td data-label="Name">${row.profiles ? row.profiles.full_name : "Unknown"}</td>
          <td data-label="Amount">${formatRWF(row.amount)}</td>
          <td data-label="Reason">${row.reason || "—"}</td>
          ${actions}
        </tr>`;
      })
      .join("");

    if (canManage) wireHistoryRowActions(vehicleId, pageRows, profile);
  });
}

function wireHistoryRowActions(vehicleId, pageRows, profile) {
  const bodyEl = document.getElementById(`history-body-${vehicleId}`);

  bodyEl.querySelectorAll("[data-edit-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const transaction = pageRows.find((r) => r.id === btn.dataset.editId);
      if (transaction) openEditTransactionForm(vehicleId, transaction);
    });
  });

  bodyEl.querySelectorAll("[data-delete-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this record from the history? The balance will stay exactly as it is.")) return;

      // Soft delete — the real timestamp is set server-side by
      // trg_enforce_petty_cash_delete_time, this value just marks it
      // as "not null" so the trigger knows a delete was requested.
      const { error } = await supabaseClient
        .from("petty_cash_transactions")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", btn.dataset.deleteId);

      if (error) {
        alert("Could not delete: " + error.message);
        return;
      }

      await loadHistory(vehicleId, profile);
      await loadPendingRefills(vehicleId, profile);
    });
  });
}
