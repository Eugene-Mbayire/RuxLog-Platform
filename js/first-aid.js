// ==========================================================
// RuxLog Platform — First Aid Kit
//
// Everyone can view medicines and consume them; only a manager can
// add, edit, or delete a medicine — RLS enforces that at the database
// level regardless of what this page shows, a driver never even sees
// those buttons. Consuming reduces stock automatically via a database
// trigger that also blocks it from ever going negative (see
// consume_medicine() in supabase/schema.sql) — this page never does
// that math itself, it just inserts the consumption row.
// ==========================================================

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireAuth();
  if (!profile) return;

  renderNav(profile);

  const container = document.getElementById("first-aid-content");
  const isManager = profile.role === "manager";

  container.innerHTML = `
    ${isManager ? addMedicineFormHtml() : ""}
    ${isManager ? editMedicineFormHtml() : ""}

    <h3 class="section-title">Medicines</h3>
    <div class="table-responsive">
      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Quantity</th>
            <th>Expiry</th>
            <th>Description</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="medicines-body"></tbody>
      </table>
    </div>
    <div id="medicines-pagination" class="pagination"></div>

    ${
      isManager
        ? `
      <h3 class="section-title">Consumption History</h3>
      <div class="table-responsive">
        <table class="data-table">
          <thead><tr><th>Date/Time</th><th>Medicine</th><th>Consumed By</th><th>Quantity</th></tr></thead>
          <tbody id="consumption-body"></tbody>
        </table>
      </div>
      <div id="consumption-pagination" class="pagination"></div>
    `
        : ""
    }
  `;

  if (isManager) {
    wireAddForm(profile, container);
    wireEditForm(profile, container);
  }

  try {
    await loadMedicines(profile, container, isManager);
    if (isManager) await loadConsumptionHistory();
  } catch (err) {
    console.error("First aid failed to load:", err);
    container.innerHTML = `<div class="card"><h3>Something went wrong</h3><p class="empty-note">${err.message}</p></div>`;
  }
});

// ---------- Add / Edit forms (manager only) ----------

function addMedicineFormHtml() {
  return `
    <details class="form-card">
      <summary>Add Medicine</summary>
      <form id="add-medicine-form">
        <div class="field">
          <label for="add-name">Name</label>
          <input type="text" id="add-name" required />
        </div>
        <div class="field">
          <label for="add-quantity">Quantity</label>
          <input type="number" id="add-quantity" min="0" step="1" required />
        </div>
        <div class="field">
          <label for="add-expiry">Expiry Date (optional)</label>
          <input type="date" id="add-expiry" />
        </div>
        <div class="field">
          <label for="add-description">Description / Notes (optional)</label>
          <input type="text" id="add-description" />
        </div>
        <button type="submit" class="btn btn-auto">Add Medicine</button>
        <p class="error-message" id="add-medicine-message"></p>
      </form>
    </details>
  `;
}

function editMedicineFormHtml() {
  return `
    <div class="form-card" id="edit-medicine-card" hidden>
      <h3>Edit Medicine</h3>
      <form id="edit-medicine-form">
        <input type="hidden" id="edit-id" />
        <div class="field">
          <label for="edit-name">Name</label>
          <input type="text" id="edit-name" required />
        </div>
        <div class="field">
          <label for="edit-quantity">Quantity</label>
          <input type="number" id="edit-quantity" min="0" step="1" required />
        </div>
        <div class="field">
          <label for="edit-expiry">Expiry Date</label>
          <input type="date" id="edit-expiry" />
        </div>
        <div class="field">
          <label for="edit-description">Description / Notes</label>
          <input type="text" id="edit-description" />
        </div>
        <button type="submit" class="btn btn-auto">Save Changes</button>
        <button type="button" id="edit-medicine-cancel" class="btn btn-auto btn-off">Cancel</button>
        <p class="error-message" id="edit-medicine-message"></p>
      </form>
    </div>
  `;
}

function wireAddForm(profile, container) {
  const form = document.getElementById("add-medicine-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById("add-medicine-message");
    messageEl.textContent = "";

    const name = document.getElementById("add-name").value.trim();
    const quantity = Number(document.getElementById("add-quantity").value);
    const expiryDate = document.getElementById("add-expiry").value || null;
    const description = document.getElementById("add-description").value.trim() || null;

    const { error } = await supabaseClient.from("medicines").insert({
      name,
      quantity,
      expiry_date: expiryDate,
      description,
    });

    if (error) {
      messageEl.textContent = error.message;
      return;
    }

    form.reset();
    form.closest("details").open = false;
    await loadMedicines(profile, container, true);
  });
}

function wireEditForm(profile, container) {
  const form = document.getElementById("edit-medicine-form");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById("edit-medicine-message");
    messageEl.textContent = "";

    const id = document.getElementById("edit-id").value;
    const name = document.getElementById("edit-name").value.trim();
    const quantity = Number(document.getElementById("edit-quantity").value);
    const expiryDate = document.getElementById("edit-expiry").value || null;
    const description = document.getElementById("edit-description").value.trim() || null;

    const { error } = await supabaseClient
      .from("medicines")
      .update({ name, quantity, expiry_date: expiryDate, description })
      .eq("id", id);

    if (error) {
      messageEl.textContent = error.message;
      return;
    }

    document.getElementById("edit-medicine-card").hidden = true;
    await loadMedicines(profile, container, true);
  });

  document.getElementById("edit-medicine-cancel").addEventListener("click", () => {
    document.getElementById("edit-medicine-card").hidden = true;
  });
}

function openEditForm(medicine) {
  document.getElementById("edit-id").value = medicine.id;
  document.getElementById("edit-name").value = medicine.name;
  document.getElementById("edit-quantity").value = medicine.quantity;
  document.getElementById("edit-expiry").value = medicine.expiry_date || "";
  document.getElementById("edit-description").value = medicine.description || "";

  const card = document.getElementById("edit-medicine-card");
  card.hidden = false;
  card.scrollIntoView({ block: "center" });
}

// ---------- Medicines table ----------

async function loadMedicines(profile, container, isManager) {
  const { data, error } = await supabaseClient.from("medicines").select("*").order("name");

  if (error) throw error;

  const bodyEl = document.getElementById("medicines-body");
  const paginationEl = document.getElementById("medicines-pagination");

  if (!data || data.length === 0) {
    bodyEl.innerHTML = `<tr><td colspan="5">No medicines yet.</td></tr>`;
    paginationEl.innerHTML = "";
    return;
  }

  createPaginator(data, paginationEl, (pageRows) => {
    bodyEl.innerHTML = pageRows.map((m) => medicineRowHtml(m, isManager)).join("");
    wireRowActions(pageRows, profile, container, isManager);
  });
}

function medicineRowHtml(medicine, isManager) {
  const expiry = medicine.expiry_date ? expiryBadge(medicine.expiry_date) : `<span class="status-pill">No expiry set</span>`;
  const outOfStock = medicine.quantity <= 0;

  const consumeAction = outOfStock
    ? `<span class="status-pill status-danger">Out of stock</span>`
    : `<button type="button" class="btn-page" data-consume-id="${medicine.id}">Consume</button>`;

  const managerActions = isManager
    ? `
      <button type="button" class="btn-page" data-edit-id="${medicine.id}">Edit</button>
      <button type="button" class="btn-delete" data-delete-id="${medicine.id}" title="Delete medicine" aria-label="Delete medicine">✕</button>
    `
    : "";

  return `<tr>
    <td data-label="Name">${medicine.name}</td>
    <td data-label="Quantity">${medicine.quantity}</td>
    <td data-label="Expiry">${expiry}</td>
    <td data-label="Description">${medicine.description || "—"}</td>
    <td data-label="Actions" class="actions-cell">${consumeAction}${managerActions}</td>
  </tr>`;
}

function wireRowActions(pageRows, profile, container, isManager) {
  document.querySelectorAll("[data-consume-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;

      // quantity_used defaults to 1 — one click consumes one unit.
      // The database trigger deducts stock and blocks going negative.
      const { error } = await supabaseClient.from("medicine_consumptions").insert({
        medicine_id: btn.dataset.consumeId,
        user_id: profile.id,
      });

      if (error) {
        alert("Could not consume: " + error.message);
        btn.disabled = false;
        return;
      }

      await loadMedicines(profile, container, isManager);
      if (isManager) await loadConsumptionHistory();
    });
  });

  if (!isManager) return;

  document.querySelectorAll("[data-edit-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const medicine = pageRows.find((m) => m.id === btn.dataset.editId);
      if (medicine) openEditForm(medicine);
    });
  });

  document.querySelectorAll("[data-delete-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const medicine = pageRows.find((m) => m.id === btn.dataset.deleteId);
      if (!confirm(`Delete "${medicine ? medicine.name : "this medicine"}"? This cannot be undone.`)) return;

      const { error } = await supabaseClient.from("medicines").delete().eq("id", btn.dataset.deleteId);

      if (error) {
        alert("Could not delete: " + error.message);
        return;
      }

      await loadMedicines(profile, container, isManager);
    });
  });
}

// ---------- Consumption history (manager only) ----------

async function loadConsumptionHistory() {
  const { data, error } = await supabaseClient
    .from("medicine_consumptions")
    .select("*, medicines(name), profiles(full_name)")
    .order("consumed_at", { ascending: false });

  if (error) throw error;

  const bodyEl = document.getElementById("consumption-body");
  const paginationEl = document.getElementById("consumption-pagination");

  if (!data || data.length === 0) {
    bodyEl.innerHTML = `<tr><td colspan="4">No consumption recorded yet.</td></tr>`;
    paginationEl.innerHTML = "";
    return;
  }

  createPaginator(data, paginationEl, (pageRows) => {
    bodyEl.innerHTML = pageRows
      .map(
        (c) => `<tr>
        <td data-label="Date/Time">${new Date(c.consumed_at).toLocaleString()}</td>
        <td data-label="Medicine">${c.medicines ? c.medicines.name : "Unknown"}</td>
        <td data-label="Consumed By">${c.profiles ? c.profiles.full_name : "Unknown"}</td>
        <td data-label="Quantity">${c.quantity_used}</td>
      </tr>`
      )
      .join("");
  });
}
