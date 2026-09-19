// ==========================================================
// RuxLog Platform — Vehicles
//
// Each vehicle is a collapsed panel by default (click to expand —
// same <details> pattern used on Petty Cash) showing its photo,
// specifications, and documents. Only an admin sees the edit form
// (a plain manager no longer can) — RLS enforces the same restriction
// at the database level regardless of what this page shows.
// ==========================================================

const DOCUMENT_TYPES = [
  { key: "insurance", label: "Insurance" },
  { key: "control_technique", label: "Contrôle Technique" },
  { key: "yellow_card", label: "Yellow Card" },
];

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireAuth();
  if (!profile) return;

  renderNav(profile);

  const container = document.getElementById("vehicles-container");

  try {
    await loadVehicles(container, profile);
  } catch (err) {
    console.error("Vehicles failed to load:", err);
    container.innerHTML = `<div class="card"><h3>Something went wrong</h3><p class="empty-note">${err.message}</p></div>`;
  }
});

async function loadVehicles(container, profile) {
  const [
    { data: vehicles, error: vehiclesError },
    { data: documents, error: docsError },
    { data: supplies, error: suppliesError },
  ] = await Promise.all([
    supabaseClient.from("vehicles").select("*").order("make_model"),
    supabaseClient.from("vehicle_documents").select("*"),
    supabaseClient.from("car_supplies").select("*").order("created_at"),
  ]);

  if (vehiclesError) throw vehiclesError;
  if (docsError) throw docsError;
  if (suppliesError) throw suppliesError;

  if (!vehicles || vehicles.length === 0) {
    container.innerHTML = `<p class="empty-note">No vehicles yet.</p>`;
    return;
  }

  const docsFor = (v) => (documents || []).filter((d) => d.vehicle_id === v.id);
  const suppliesFor = (v) => (supplies || []).filter((s) => s.vehicle_id === v.id);

  container.innerHTML = vehicles.map((v) => vehiclePanelHtml(v, docsFor(v), suppliesFor(v), profile)).join("");

  vehicles.forEach((v) => {
    wireVehiclePanel(v, docsFor(v), profile, container);
    wireSupplies(v, profile, container);
  });
}

function specsToHtml(specifications) {
  const lines = (specifications || "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return `<p class="empty-note">No specifications yet.</p>`;

  return `<ul>${lines
    .map((line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) return `<li><span>${line}</span></li>`;
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      return `<li><span>${key}</span><span>${value}</span></li>`;
    })
    .join("")}</ul>`;
}

function documentsToHtml(docs) {
  return `<ul>${DOCUMENT_TYPES.map((dt) => {
    const doc = docs.find((d) => d.document_type === dt.key);
    if (!doc || !doc.document_url) {
      return `<li><span>${dt.label}</span><span class="status-pill">Not uploaded</span></li>`;
    }
    const badge = doc.expiry_date ? expiryBadge(doc.expiry_date) : `<span class="status-pill">No expiry set</span>`;
    return `<li>
      <span>${dt.label}</span>
      <span class="doc-actions">
        ${badge}
        <a class="btn-view-doc" href="${doc.document_url}" target="_blank" rel="noopener">VIEW DOCUMENT</a>
      </span>
    </li>`;
  }).join("")}</ul>`;
}

// ---------- Car supplies checklist ----------
// A ticked box means the item is actually in that car. Everyone sees
// the list; drivers and admins can tick/untick (a driver is the one
// actually in the car), while adding and deleting supplies stays
// admin-only. RLS enforces the same split at the database level.

function canTickSupplies(profile) {
  return profile.role === "admin" || profile.role === "driver";
}

function suppliesToHtml(vehicle, supplies, profile) {
  const id = vehicle.id;
  const canManage = profile.role === "admin";
  const canTick = canTickSupplies(profile);

  const listHtml = supplies.length
    ? `<ul class="supply-list">${supplies
        .map(
          (s) => `<li class="supply-item">
            <label class="supply-label">
              <input type="checkbox" class="supply-checkbox" data-supply-id="${s.id}" ${s.is_available ? "checked" : ""} ${
                canTick ? "" : "disabled"
              } />
              <span>${s.name}</span>
            </label>
            ${
              canManage
                ? `<button type="button" class="btn-delete" data-delete-supply-id="${s.id}" title="Delete supply" aria-label="Delete supply">✕</button>`
                : ""
            }
          </li>`
        )
        .join("")}</ul>`
    : `<p class="empty-note">No supplies listed yet.</p>`;

  const addHtml = canManage
    ? `<form class="supply-add-form" id="add-supply-form-${id}">
         <input type="text" id="add-supply-name-${id}" placeholder="New supply name" required />
         <button type="submit" class="btn-page">Add Supply</button>
       </form>`
    : "";

  return `<div id="supplies-${id}">
    ${listHtml}
    ${addHtml}
    <p class="error-message" id="supply-message-${id}"></p>
  </div>`;
}

function wireSupplies(vehicle, profile, container) {
  const id = vehicle.id;
  const canManage = profile.role === "admin";
  if (!canTickSupplies(profile) && !canManage) return; // managers get read-only, disabled boxes

  const section = document.getElementById(`supplies-${id}`);
  const messageEl = document.getElementById(`supply-message-${id}`);

  section.querySelectorAll("[data-supply-id]").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      checkbox.disabled = true;
      messageEl.textContent = "";

      const { error } = await supabaseClient
        .from("car_supplies")
        .update({ is_available: checkbox.checked })
        .eq("id", checkbox.dataset.supplyId);

      checkbox.disabled = false;

      if (error) {
        checkbox.checked = !checkbox.checked; // put it back — the save didn't happen
        messageEl.textContent = error.message;
      }
    });
  });

  if (!canManage) return; // ticking is as far as a driver goes

  section.querySelectorAll("[data-delete-supply-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this supply from the checklist?")) return;

      const { error } = await supabaseClient
        .from("car_supplies")
        .delete()
        .eq("id", btn.dataset.deleteSupplyId);

      if (error) {
        messageEl.textContent = error.message;
        return;
      }

      await loadVehicles(container, profile);
    });
  });

  document.getElementById(`add-supply-form-${id}`).addEventListener("submit", async (e) => {
    e.preventDefault();
    messageEl.textContent = "";

    const name = document.getElementById(`add-supply-name-${id}`).value.trim();

    const { error } = await supabaseClient.from("car_supplies").insert({ vehicle_id: id, name: name });

    if (error) {
      messageEl.textContent = error.message;
      return;
    }

    await loadVehicles(container, profile);
  });
}

function vehiclePanelHtml(vehicle, docs, supplies, profile) {
  const id = vehicle.id;
  const photoHtml = vehicle.image_path
    ? `<img src="${vehicle.image_path}" class="vehicle-photo" alt="${vehicle.make_model}" />`
    : "";
  const thumbHtml = vehicle.image_path
    ? `<img src="${vehicle.image_path}" class="vehicle-thumb" alt="${vehicle.make_model}" />`
    : "";

  return `
    <details class="form-card vehicle-card">
      <summary>
        ${thumbHtml}
        <span>${vehicle.make_model} — ${vehicle.plate_number}</span>
      </summary>

      ${photoHtml}

      <h4 class="section-title">Specifications</h4>
      ${specsToHtml(vehicle.specifications)}

      <h4 class="section-title">Car Supplies</h4>
      ${suppliesToHtml(vehicle, supplies, profile)}

      <h4 class="section-title">Documents</h4>
      ${documentsToHtml(docs)}

      ${profile.role === "admin" ? editFormHtml(vehicle, docs) : ""}
    </details>
  `;
}

function editFormHtml(vehicle, docs) {
  const id = vehicle.id;

  const docFieldsHtml = DOCUMENT_TYPES.map((dt) => {
    const doc = docs.find((d) => d.document_type === dt.key) || {};
    return `
      <fieldset>
        <legend>${dt.label}</legend>
        <div class="field">
          <label for="doc-url-${dt.key}-${id}">Document Link (Google Drive)</label>
          <input type="url" id="doc-url-${dt.key}-${id}" value="${doc.document_url || ""}" />
        </div>
        <div class="field">
          <label for="doc-issue-${dt.key}-${id}">Issue Date</label>
          <input type="date" id="doc-issue-${dt.key}-${id}" value="${doc.issue_date || ""}" />
        </div>
        <div class="field">
          <label for="doc-expiry-${dt.key}-${id}">Expiry Date</label>
          <input type="date" id="doc-expiry-${dt.key}-${id}" value="${doc.expiry_date || ""}" />
        </div>
      </fieldset>
    `;
  }).join("");

  return `
    <details class="form-card">
      <summary>Edit Vehicle</summary>
      <form id="edit-form-${id}">
        <div class="field">
          <label for="edit-make-model-${id}">Make / Model</label>
          <input type="text" id="edit-make-model-${id}" value="${vehicle.make_model}" required />
        </div>
        <div class="field">
          <label for="edit-plate-${id}">Plate Number</label>
          <input type="text" id="edit-plate-${id}" value="${vehicle.plate_number}" required />
        </div>
        <div class="field">
          <label for="edit-specs-${id}">Specifications (one "Label: Value" per line)</label>
          <textarea id="edit-specs-${id}" rows="6">${vehicle.specifications || ""}</textarea>
        </div>
        ${docFieldsHtml}
        <button type="submit" class="btn btn-auto">Save Changes</button>
        <p class="error-message" id="edit-message-${id}"></p>
      </form>
    </details>
  `;
}

function wireVehiclePanel(vehicle, docs, profile, container) {
  // Vehicle editing is admin-only (managers used to have this, no longer do)
  if (profile.role !== "admin") return;

  const id = vehicle.id;
  const form = document.getElementById(`edit-form-${id}`);
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById(`edit-message-${id}`);
    messageEl.textContent = "";

    const makeModel = document.getElementById(`edit-make-model-${id}`).value.trim();
    const plateNumber = document.getElementById(`edit-plate-${id}`).value.trim();
    const specifications = document.getElementById(`edit-specs-${id}`).value;

    const writes = [
      supabaseClient
        .from("vehicles")
        .update({ make_model: makeModel, plate_number: plateNumber, specifications })
        .eq("id", id),
    ];

    DOCUMENT_TYPES.forEach((dt) => {
      const doc = docs.find((d) => d.document_type === dt.key);
      const url = document.getElementById(`doc-url-${dt.key}-${id}`).value.trim() || null;
      const issueDate = document.getElementById(`doc-issue-${dt.key}-${id}`).value || null;
      const expiryDate = document.getElementById(`doc-expiry-${dt.key}-${id}`).value || null;

      if (doc) {
        writes.push(
          supabaseClient
            .from("vehicle_documents")
            .update({ document_url: url, issue_date: issueDate, expiry_date: expiryDate })
            .eq("id", doc.id)
        );
      } else {
        writes.push(
          supabaseClient.from("vehicle_documents").insert({
            vehicle_id: id,
            document_type: dt.key,
            document_url: url,
            issue_date: issueDate,
            expiry_date: expiryDate,
          })
        );
      }
    });

    const results = await Promise.all(writes);
    const failed = results.find((r) => r.error);

    if (failed) {
      messageEl.textContent = failed.error.message;
      return;
    }

    await loadVehicles(container, profile);
  });
}
