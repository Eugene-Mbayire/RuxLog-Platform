// ==========================================================
// RuxLog Platform — Vehicles
//
// Each vehicle is a collapsed panel by default (click to expand —
// same <details> pattern used on Petty Cash) showing its photo,
// specifications, and documents. Only a manager sees the edit form;
// RLS enforces the same restriction at the database level regardless
// of what this page shows.
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
  const [{ data: vehicles, error: vehiclesError }, { data: documents, error: docsError }] = await Promise.all([
    supabaseClient.from("vehicles").select("*").order("make_model"),
    supabaseClient.from("vehicle_documents").select("*"),
  ]);

  if (vehiclesError) throw vehiclesError;
  if (docsError) throw docsError;

  if (!vehicles || vehicles.length === 0) {
    container.innerHTML = `<p class="empty-note">No vehicles yet.</p>`;
    return;
  }

  container.innerHTML = vehicles
    .map((v) => vehiclePanelHtml(v, (documents || []).filter((d) => d.vehicle_id === v.id), profile))
    .join("");

  vehicles.forEach((v) =>
    wireVehiclePanel(v, (documents || []).filter((d) => d.vehicle_id === v.id), profile, container)
  );
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

function vehiclePanelHtml(vehicle, docs, profile) {
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

      <h4 class="section-title">Documents</h4>
      ${documentsToHtml(docs)}

      ${profile.role === "manager" ? editFormHtml(vehicle, docs) : ""}
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
  if (profile.role !== "manager") return;

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
