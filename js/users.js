// ==========================================================
// RuxLog Platform — Users (manager only)
//
// Creating a new login (email + password), deleting an account, or
// resetting a password can only be done from the Supabase Dashboard —
// Supabase Auth has no safe way to do any of that from client-side
// code without the service_role key, which must never be in frontend
// code. What this page covers is what CAN be done safely: viewing
// everyone and editing their name/role once their account exists.
// ==========================================================

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireAuth();
  if (!profile) return;

  // This page is manager-only — a driver is sent straight back to
  // their dashboard rather than seeing a broken/empty page.
  if (profile.role !== "manager") {
    window.location.href = "dashboard.html";
    return;
  }

  renderNav(profile);

  const container = document.getElementById("users-content");
  container.innerHTML = scaffoldHtml();
  wireEditForm();

  try {
    await loadUsers();
  } catch (err) {
    console.error("Users failed to load:", err);
    container.innerHTML = `<div class="card"><h3>Something went wrong</h3><p class="empty-note">${err.message}</p></div>`;
  }
});

function scaffoldHtml() {
  return `
    <details class="form-card">
      <summary>How to add a new user</summary>
      <div>
        <p>
          Login accounts can only be created from the Supabase Dashboard, not
          from this page — that's what keeps account creation secure without
          putting any sensitive key in this website's code.
        </p>
        <ol>
          <li>Supabase project → <strong>Authentication → Users → Add user</strong>.</li>
          <li>Enter their email and a password, then create the user.</li>
          <li>
            A profile is created for them automatically (as a driver, named
            after their email) — come back here and click <strong>Edit</strong>
            on their row to set their real name and role.
          </li>
        </ol>
      </div>
    </details>

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
          </select>
        </div>
        <button type="submit" class="btn btn-auto">Save Changes</button>
        <button type="button" id="cancel-edit-user-btn" class="btn btn-auto btn-off">Cancel</button>
        <p class="error-message" id="edit-user-message"></p>
      </form>
    </div>

    <h3 class="section-title">All Users</h3>
    <div class="table-responsive">
      <table class="data-table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Actions</th></tr></thead>
        <tbody id="users-body"></tbody>
      </table>
    </div>
    <div id="users-pagination" class="pagination"></div>
  `;
}

async function loadUsers() {
  const { data, error } = await supabaseClient.from("profiles").select("*").order("full_name");

  if (error) throw error;

  const bodyEl = document.getElementById("users-body");
  const paginationEl = document.getElementById("users-pagination");

  if (!data || data.length === 0) {
    bodyEl.innerHTML = `<tr><td colspan="4">No users yet.</td></tr>`;
    paginationEl.innerHTML = "";
    return;
  }

  createPaginator(data, paginationEl, (pageRows) => {
    bodyEl.innerHTML = pageRows.map(userRowHtml).join("");
    wireRowActions(pageRows);
  });
}

function userRowHtml(user) {
  const roleLabel = user.role === "manager" ? "Manager" : "Driver";
  return `<tr>
    <td data-label="Name">${user.full_name}</td>
    <td data-label="Email">${user.email || "—"}</td>
    <td data-label="Role">${roleLabel}</td>
    <td data-label="Actions"><button type="button" class="btn-page" data-edit-id="${user.id}">Edit</button></td>
  </tr>`;
}

function wireRowActions(pageRows) {
  document.querySelectorAll("[data-edit-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const user = pageRows.find((u) => u.id === btn.dataset.editId);
      if (user) openEditForm(user);
    });
  });
}

function openEditForm(user) {
  document.getElementById("edit-user-id").value = user.id;
  document.getElementById("edit-user-name").value = user.full_name;
  document.getElementById("edit-user-role").value = user.role;

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

    const { error } = await supabaseClient.from("profiles").update({ full_name: fullName, role }).eq("id", id);

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
