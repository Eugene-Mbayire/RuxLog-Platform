// ==========================================================
// RuxLog Platform — Users (admin only)
//
// Creating a new login (email + password), deleting an account, or
// resetting a password can only be done from the Supabase Dashboard —
// Supabase Auth has no safe way to do any of that from client-side
// code without the service_role key, which must never be in frontend
// code. What this page covers is what CAN be done safely: viewing
// everyone as a profile card and editing their name/role/license link
// once their account exists.
//
// Each card is collapsed by default; clicking it expands the details,
// clicking anywhere outside collapses whichever one is open (the
// single document-level listener below handles that, registered once
// rather than per-render).
// ==========================================================

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireAuth();
  if (!profile) return;

  // This page is admin-only now (moved off manager) — anyone else is
  // sent straight back to their dashboard rather than seeing a
  // broken/empty page.
  if (profile.role !== "admin") {
    window.location.href = "dashboard.html";
    return;
  }

  renderNav(profile);

  const container = document.getElementById("users-content");
  container.innerHTML = scaffoldHtml();
  wireEditForm();

  document.addEventListener("click", (e) => {
    if (e.target.closest(".profile-card")) return;
    document.querySelectorAll(".profile-card.expanded").forEach((el) => el.classList.remove("expanded"));
  });

  try {
    await loadUsers();
  } catch (err) {
    console.error("Users failed to load:", err);
    container.innerHTML = `<div class="card"><h3>Something went wrong</h3><p class="empty-note">${err.message}</p></div>`;
  }
});

function scaffoldHtml() {
  return `
    <div class="form-card" id="edit-user-card" hidden>
      <h3>Edit User</h3>
      <form id="edit-user-form">
        <input type="hidden" id="edit-user-id" />
        <div class="field">
          <label for="edit-user-name">Full Name</label>
          <input type="text" id="edit-user-name" required />
        </div>
        <div class="field">
          <label for="edit-user-role">Role</label>
          <select id="edit-user-role">
            <option value="driver">Driver</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div class="field">
          <label for="edit-user-license">Driver License Link (Google Drive)</label>
          <input type="url" id="edit-user-license" placeholder="https://drive.google.com/..." />
        </div>
        <button type="submit" class="btn btn-auto">Save Changes</button>
        <button type="button" id="cancel-edit-user-btn" class="btn btn-auto btn-off">Cancel</button>
        <p class="error-message" id="edit-user-message"></p>
      </form>
    </div>

    <h3 class="section-title">All Users</h3>
    <div id="users-grid" class="card-grid"></div>
    <div id="users-pagination" class="pagination"></div>
  `;
}

async function loadUsers() {
  const { data, error } = await supabaseClient.from("profiles").select("*").order("full_name");

  if (error) throw error;

  const gridEl = document.getElementById("users-grid");
  const paginationEl = document.getElementById("users-pagination");

  if (!data || data.length === 0) {
    gridEl.innerHTML = `<p class="empty-note">No users yet.</p>`;
    paginationEl.innerHTML = "";
    return;
  }

  createPaginator(data, paginationEl, (pageRows) => {
    renderUsersGrid(pageRows);
  });
}

function renderUsersGrid(pageRows) {
  const gridEl = document.getElementById("users-grid");
  gridEl.innerHTML = pageRows.map(userCardHtml).join("");

  gridEl.querySelectorAll(".profile-card").forEach((cardEl) => {
    cardEl.addEventListener("click", (e) => {
      if (e.target.closest("[data-edit-id]")) return; // handled separately below

      const alreadyOpen = cardEl.classList.contains("expanded");
      gridEl.querySelectorAll(".profile-card.expanded").forEach((el) => el.classList.remove("expanded"));
      if (!alreadyOpen) cardEl.classList.add("expanded");
    });
  });

  gridEl.querySelectorAll("[data-edit-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const user = pageRows.find((u) => u.id === btn.dataset.editId);
      if (user) openEditForm(user);
    });
  });
}

function userCardHtml(user) {
  const initial = (user.full_name || "?").charAt(0).toUpperCase();
  const photoHtml = user.photo_path
    ? `<img src="${user.photo_path}" alt="${user.full_name}" class="profile-card-photo" />`
    : `<div class="profile-card-photo-placeholder">${initial}</div>`;

  const ROLE_LABELS = { admin: "Admin", manager: "Manager", driver: "Driver" };
  const ROLE_PILL_CLASSES = { admin: "status-danger", manager: "status-ok", driver: "status-warning" };
  const roleLabel = ROLE_LABELS[user.role] || user.role;
  const rolePillClass = ROLE_PILL_CLASSES[user.role] || "";

  const licenseHtml =
    user.role === "driver"
      ? user.driver_license_url
        ? `<p><strong>Driver License:</strong><br /><a class="btn-view-doc" href="${user.driver_license_url}" target="_blank" rel="noopener">VIEW LICENSE</a></p>`
        : `<p class="empty-note">No driver license on file yet.</p>`
      : "";

  return `
    <div class="profile-card" data-user-id="${user.id}">
      <div class="profile-card-header">
        ${photoHtml}
        <div>
          <p class="profile-card-name">${user.full_name}</p>
          <span class="status-pill ${rolePillClass}">${roleLabel}</span>
        </div>
      </div>
      <div class="profile-card-details">
        <p><strong>Email:</strong> ${user.email || "—"}</p>
        ${licenseHtml}
        <button type="button" class="btn-page" data-edit-id="${user.id}">Edit</button>
      </div>
    </div>
  `;
}

function openEditForm(user) {
  document.getElementById("edit-user-id").value = user.id;
  document.getElementById("edit-user-name").value = user.full_name;
  document.getElementById("edit-user-role").value = user.role;
  document.getElementById("edit-user-license").value = user.driver_license_url || "";

  const card = document.getElementById("edit-user-card");
  card.hidden = false;
  card.scrollIntoView({ block: "center" });
}

function wireEditForm() {
  const form = document.getElementById("edit-user-form");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById("edit-user-message");
    messageEl.textContent = "";

    const id = document.getElementById("edit-user-id").value;
    const fullName = document.getElementById("edit-user-name").value.trim();
    const role = document.getElementById("edit-user-role").value;
    const licenseUrl = document.getElementById("edit-user-license").value.trim() || null;

    const { error } = await supabaseClient
      .from("profiles")
      .update({ full_name: fullName, role, driver_license_url: licenseUrl })
      .eq("id", id);

    if (error) {
      messageEl.textContent = error.message;
      return;
    }

    document.getElementById("edit-user-card").hidden = true;
    await loadUsers();
  });

  document.getElementById("cancel-edit-user-btn").addEventListener("click", () => {
    document.getElementById("edit-user-card").hidden = true;
  });
}
