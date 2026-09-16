// ==========================================================
// RuxLog Platform — First Aid Kit (per vehicle)
//
// Each vehicle has its own separate first aid kit. Same approach as
// Petty Cash: fetch the vehicle list and render one identical,
// independent panel per vehicle from a single template — adding a
// third vehicle later needs no code change here at all.
//
// Everyone can view medicines and consume them; only a manager can
// add, edit, or delete a medicine — RLS enforces that at the database
// level regardless of what this page shows, a driver never even sees
// those buttons. Consuming calls consume_medicine_action() (see
// supabase/consume_medicine_rpc.sql), a single atomic database
// function that checks stock, deducts it, and records the
// consumption — this page never does that math itself.
// ==========================================================

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireAuth();
  if (!profile) return;

  renderNav(profile);

  const container = document.getElementById("first-aid-content");
  const isManager = profile.role === "manager";

  try {
    const { data: vehicles, error } = await supabaseClient.from("vehicles").select("*").order("make_model");
    if (error) throw error;

    if (!vehicles || vehicles.length === 0) {
      container.innerHTML = `<p class="empty-note">No vehicles yet.</p>`;
      return;
    }

    container.innerHTML = vehicles.map((v) => vehiclePanelHtml(v, isManager)).join("");

    for (const v of vehicles) {
      if (isManager) {
        wireAddForm(v.id, profile, isManager);
        wireEditForm(v.id, profile, isManager);
      }
      await loadMedicines(v.id, profile, isManager);
      await loadConsumptionHistory(v.id);
    }
  } catch (err) {
    console.error("First aid failed to load:", err);
    container.innerHTML = `<div class="card"><h3>Something went wrong</h3><p class="empty-note">${err.message}</p></div>`;
  }
});

function vehiclePanelHtml(vehicle, isManager) {
  const id = vehicle.id;

  return `
    <section class="vehicle-panel">
      <h3 class="vehicle-panel-title">${vehicle.make_model} — ${vehicle.plate_number}</h3>

      ${isManager ? addMedicineFormHtml(id) : ""}
      ${isManager ? editMedicineFormHtml(id) : ""}

      <h4 class="section-title">Medicines</h4>
      <p class="error-message" id="consume-message-${id}"></p>
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
          <tbody id="medicines-body-${id}"></tbody>
        </table>
      </div>
      <div id="medicines-pagination-${id}" class="pagination"></div>

      <h4 class="section-title">Consumption History</h4>
      <div class="table-responsive">
        <table class="data-table">
          <thead><tr><th>Date/Time</th><th>Medicine</th><th>Consumed By</th><th>Quantity</th></tr></thead>
          <tbody id="consumption-body-${id}"></tbody>
        </table>
      </div>
      <div id="consumption-pagination-${id}" class="pagination"></div>
    </section>
  `;
}

// ---------- Add / Edit forms (manager only) ----------

function addMedicineFormHtml(vehicleId) {
  return `
    <details class="form-card">
      <summary>Add Medicine</summary>
      <form id="add-medicine-form-${vehicleId}">
        <div class="field">
          <label for="add-name-${vehicleId}">Name</label>
          <input type="text" id="add-name-${vehicleId}" required />
        </div>
        <div class="field">
          <label for="add-quantity-${vehicleId}">Quantity</label>
          <input type="number" id="add-quantity-${vehicleId}" min="0" step="1" required />
        </div>
        <div class="field">
          <label for="add-expiry-${vehicleId}">Expiry Date (optional)</label>
          <input type="date" id="add-expiry-${vehicleId}" />
        </div>
        <div class="field">
          <label for="add-description-${vehicleId}">Description / Notes (optional)</label>
          <input type="text" id="add-description-${vehicleId}" />
        </div>
        <button type="submit" class="btn btn-auto">Add Medicine</button>
        <p class="error-message" id="add-medicine-message-${vehicleId}"></p>
      </form>
    </details>
  `;
}

function editMedicineFormHtml(vehicleId) {
  return `
    <div class="form-card" id="edit-medicine-card-${vehicleId}" hidden>
      <h3>Edit Medicine</h3>
      <form id="edit-medicine-form-${vehicleId}">
        <input type="hidden" id="edit-id-${vehicleId}" />
        <div class="field">
          <label for="edit-name-${vehicleId}">Name</label>
          <input type="text" id="edit-name-${vehicleId}" required />
        </div>
        <div class="field">
          <label for="edit-quantity-${vehicleId}">Quantity</label>
          <input type="number" id="edit-quantity-${vehicleId}" min="0" step="1" required />
        </div>
        <div class="field">
          <label for="edit-expiry-${vehicleId}">Expiry Date</label>
          <input type="date" id="edit-expiry-${vehicleId}" />
        </div>
        <div class="field">
          <label for="edit-description-${vehicleId}">Description / Notes</label>
          <input type="text" id="edit-description-${vehicleId}" />
        </div>
        <button type="submit" class="btn btn-auto">Save Changes</button>
        <button type="button" id="edit-medicine-cancel-${vehicleId}" class="btn btn-auto btn-off">Cancel</button>
        <p class="error-message" id="edit-medicine-message-${vehicleId}"></p>
      </form>
    </div>
  `;
}

function wireAddForm(vehicleId, profile, isManager) {
  const form = document.getElementById(`add-medicine-form-${vehicleId}`);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById(`add-medicine-message-${vehicleId}`);
    messageEl.textContent = "";

    const name = document.getElementById(`add-name-${vehicleId}`).value.trim();
    const quantity = Number(document.getElementById(`add-quantity-${vehicleId}`).value);
    const expiryDate = document.getElementById(`add-expiry-${vehicleId}`).value || null;
    const description = document.getElementById(`add-description-${vehicleId}`).value.trim() || null;

    const { error } = await supabaseClient.from("medicines").insert({
      vehicle_id: vehicleId,
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
    await loadMedicines(vehicleId, profile, isManager);
  });
}

function wireEditForm(vehicleId, profile, isManager) {
  const form = document.getElementById(`edit-medicine-form-${vehicleId}`);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById(`edit-medicine-message-${vehicleId}`);
    messageEl.textContent = "";

    const id = document.getElementById(`edit-id-${vehicleId}`).value;
    const name = document.getElementById(`edit-name-${vehicleId}`).value.trim();
    const quantity = Number(document.getElementById(`edit-quantity-${vehicleId}`).value);
    const expiryDate = document.getElementById(`edit-expiry-${vehicleId}`).value || null;
    const description = document.getElementById(`edit-description-${vehicleId}`).value.trim() || null;

    const { error } = await supabaseClient
      .from("medicines")
      .update({ name, quantity, expiry_date: expiryDate, description })
      .eq("id", id);

    if (error) {
      messageEl.textContent = error.message;
      return;
    }

    document.getElementById(`edit-medicine-card-${vehicleId}`).hidden = true;
    await loadMedicines(vehicleId, profile, isManager);
  });

  document.getElementById(`edit-medicine-cancel-${vehicleId}`).addEventListener("click", () => {
    document.getElementById(`edit-medicine-card-${vehicleId}`).hidden = true;
  });
}

function openEditForm(vehicleId, medicine) {
  document.getElementById(`edit-id-${vehicleId}`).value = medicine.id;
  document.getElementById(`edit-name-${vehicleId}`).value = medicine.name;
  document.getElementById(`edit-quantity-${vehicleId}`).value = medicine.quantity;
  document.getElementById(`edit-expiry-${vehicleId}`).value = medicine.expiry_date || "";
  document.getElementById(`edit-description-${vehicleId}`).value = medicine.description || "";

  const card = document.getElementById(`edit-medicine-card-${vehicleId}`);
  card.hidden = false;
  card.scrollIntoView({ block: "center" });
}

// ---------- Medicines table ----------

async function loadMedicines(vehicleId, profile, isManager) {
  const { data, error } = await supabaseClient
    .from("medicines")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .order("name");

  if (error) throw error;

  const bodyEl = document.getElementById(`medicines-body-${vehicleId}`);
  const paginationEl = document.getElementById(`medicines-pagination-${vehicleId}`);

  if (!data || data.length === 0) {
    bodyEl.innerHTML = `<tr><td colspan="5">No medicines yet.</td></tr>`;
    paginationEl.innerHTML = "";
    return;
  }

  createPaginator(data, paginationEl, (pageRows) => {
    bodyEl.innerHTML = pageRows.map((m) => medicineRowHtml(m, isManager)).join("");
    wireRowActions(vehicleId, pageRows, profile, isManager);
  });
}

function medicineRowHtml(medicine, isManager) {
  const expiry = medicine.expiry_date ? expiryBadge(medicine.expiry_date) : `<span class="status-pill">No expiry set</span>`;
  const outOfStock = medicine.quantity <= 0;

  const consumeAction = outOfStock
    ? `<span class="status-pill status-danger">Out of stock</span>`
    : `<input type="number" class="qty-input" id="consume-qty-${medicine.id}" min="1" max="${medicine.quantity}" value="1" />
       <button type="button" class="btn-page" data-consume-id="${medicine.id}">Consume</button>`;

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

function wireRowActions(vehicleId, pageRows, profile, isManager) {
  const tbody = document.getElementById(`medicines-body-${vehicleId}`);

  tbody.querySelectorAll("[data-consume-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const messageEl = document.getElementById(`consume-message-${vehicleId}`);
      messageEl.textContent = "";

      const medicineId = btn.dataset.consumeId;
      const medicine = pageRows.find((m) => m.id === medicineId);
      const qtyInput = document.getElementById(`consume-qty-${medicineId}`);
      const quantityUsed = Number(qtyInput.value);

      if (!Number.isInteger(quantityUsed) || quantityUsed < 1) {
        messageEl.textContent = "Enter a quantity of at least 1.";
        return;
      }

      btn.disabled = true;
      const quantityBefore = medicine ? medicine.quantity : null;

      // consume_medicine_action() does the stock check, the deduction,
      // and records the consumption row — all atomically in one call
      // (see supabase/consume_medicine_rpc.sql). It also blocks it from
      // ever going negative — this page never does that math itself.
      const { error } = await supabaseClient.rpc("consume_medicine_action", {
        p_medicine_id: medicineId,
        p_quantity_used: quantityUsed,
      });

      if (error) {
        console.error("Consume failed:", error);
        messageEl.className = "error-message";
        messageEl.textContent = `Could not consume: ${error.message} (code: ${error.code || "unknown"})`;
        btn.disabled = false;
        return;
      }

      // Read the stock back directly so the before/after is proven on
      // screen, not just assumed.
      const { data: refreshed } = await supabaseClient
        .from("medicines")
        .select("quantity")
        .eq("id", medicineId)
        .single();
      const quantityAfter = refreshed ? refreshed.quantity : null;

      messageEl.className = "status-pill status-ok";
      messageEl.textContent = `Consumed ${quantityUsed}. Stock: ${quantityBefore} → ${quantityAfter}.`;

      await loadMedicines(vehicleId, profile, isManager);
      await loadConsumptionHistory(vehicleId);
    });
  });

  if (!isManager) return;

  tbody.querySelectorAll("[data-edit-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const medicine = pageRows.find((m) => m.id === btn.dataset.editId);
      if (medicine) openEditForm(vehicleId, medicine);
    });
  });

  tbody.querySelectorAll("[data-delete-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const medicine = pageRows.find((m) => m.id === btn.dataset.deleteId);
      if (!confirm(`Delete "${medicine ? medicine.name : "this medicine"}"? This cannot be undone.`)) return;

      const { error } = await supabaseClient.from("medicines").delete().eq("id", btn.dataset.deleteId);

      if (error) {
        alert("Could not delete: " + error.message);
        return;
      }

      await loadMedicines(vehicleId, profile, isManager);
    });
  });
}

// ---------- Consumption history ----------
// RLS on medicine_consumptions ("consumption read": user_id = auth.uid()
// or is_manager()) automatically scopes this to "my own" for a driver
// and "everyone's" for a manager — same query, no role branching needed.

async function loadConsumptionHistory(vehicleId) {
  const { data, error } = await supabaseClient
    .from("medicine_consumptions")
    .select("*, medicines!inner(name, vehicle_id), profiles(full_name)")
    .eq("medicines.vehicle_id", vehicleId)
    .order("consumed_at", { ascending: false });

  if (error) throw error;

  const bodyEl = document.getElementById(`consumption-body-${vehicleId}`);
  const paginationEl = document.getElementById(`consumption-pagination-${vehicleId}`);

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
