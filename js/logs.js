// ==========================================================
// RuxLog Platform — Logs (admin only)
//
// Every login and logout is recorded automatically in js/auth.js
// (see login()/logout()) — user_id and the timestamp are always set
// server-side by a trigger, never trusted from the client (see
// supabase/admin_role.sql). This page just displays that history.
// ==========================================================

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireAuth();
  if (!profile) return;

  // This page is admin-only — anyone else is sent straight back to
  // their dashboard rather than seeing a broken/empty page.
  if (profile.role !== "admin") {
    window.location.href = "dashboard.html";
    return;
  }

  renderNav(profile);

  const container = document.getElementById("logs-content");
  container.innerHTML = scaffoldHtml();

  try {
    await loadLogs();
  } catch (err) {
    console.error("Logs failed to load:", err);
    container.innerHTML = `<div class="card"><h3>Something went wrong</h3><p class="empty-note">${err.message}</p></div>`;
  }
});

function scaffoldHtml() {
  return `
    <div class="table-responsive">
      <table class="data-table">
        <thead><tr><th>Date/Time</th><th>User</th><th>Event</th></tr></thead>
        <tbody id="logs-body"></tbody>
      </table>
    </div>
    <div id="logs-pagination" class="pagination"></div>
  `;
}

async function loadLogs() {
  const { data, error } = await supabaseClient
    .from("login_logs")
    .select("*, profiles(full_name)")
    .order("created_at", { ascending: false });

  if (error) throw error;

  const bodyEl = document.getElementById("logs-body");
  const paginationEl = document.getElementById("logs-pagination");

  if (!data || data.length === 0) {
    bodyEl.innerHTML = `<tr><td colspan="3">No login activity recorded yet.</td></tr>`;
    paginationEl.innerHTML = "";
    return;
  }

  createPaginator(data, paginationEl, (pageRows) => {
    bodyEl.innerHTML = pageRows
      .map((log) => {
        const eventBadge =
          log.event_type === "login"
            ? `<span class="status-pill status-ok">Login</span>`
            : `<span class="status-pill status-warning">Logout</span>`;
        return `<tr>
          <td data-label="Date/Time">${new Date(log.created_at).toLocaleString()}</td>
          <td data-label="User">${log.profiles ? log.profiles.full_name : "Unknown"}</td>
          <td data-label="Event">${eventBadge}</td>
        </tr>`;
      })
      .join("");
  });
}
