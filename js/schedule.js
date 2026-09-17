// ==========================================================
// RuxLog Platform — Schedule
//
// Unlike every other feature, everyone (driver and manager) has the
// exact same permissions here — anyone can add, edit, or delete any
// entry, matching how this was done manually before on paper/notes
// (one shared day plan anyone could mark up). RLS on the database
// reflects that directly: "schedule write" has no is_manager() check.
//
// This page only edits entries. The generated schedule card and the
// Share Schedule button live on the dashboard instead (see
// js/schedule-preview.js), so every role sees today's plan the
// moment they log in rather than having to visit this page.
// ==========================================================

let currentDate = toDateString(new Date());
let editingEntryId = null;
let currentEntries = [];

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireAuth();
  if (!profile) return;

  renderNav(profile);

  const container = document.getElementById("schedule-content");
  container.innerHTML = scaffoldHtml();
  wireControls();

  try {
    await loadSchedule();
  } catch (err) {
    console.error("Schedule failed to load:", err);
    container.innerHTML = `<div class="card"><h3>Something went wrong</h3><p class="empty-note">${err.message}</p></div>`;
  }
});

function scaffoldHtml() {
  return `
    <div class="schedule-toolbar">
      <button type="button" id="prev-day-btn" class="btn-page">&#9664; Previous</button>
      <input type="date" id="schedule-date-input" />
      <button type="button" id="next-day-btn" class="btn-page">Next &#9654;</button>
      <button type="button" id="today-btn" class="btn-page">Today</button>
    </div>

    <div class="schedule-editor">
      <details class="form-card" open>
        <summary>Add / Edit Entry</summary>
        <form id="entry-form">
          <div class="field">
            <label for="entry-time-input">Time</label>
            <input type="time" id="entry-time-input" required />
          </div>
          <div class="field">
            <label for="entry-desc-input">Description</label>
            <input type="text" id="entry-desc-input" required placeholder="e.g. Claudine to CSK" />
          </div>
          <button type="submit" id="entry-submit-btn" class="btn btn-auto">Add Entry</button>
          <button type="button" id="cancel-edit-btn" class="btn btn-auto btn-off" hidden>Cancel Edit</button>
          <p class="error-message" id="entry-message"></p>
        </form>
      </details>

      <h4 class="section-title">Entries</h4>
      <ul class="schedule-entry-list" id="entry-list"></ul>
    </div>
  `;
}

function wireControls() {
  document.getElementById("schedule-date-input").value = currentDate;

  document.getElementById("prev-day-btn").addEventListener("click", () => changeDate(-1));
  document.getElementById("next-day-btn").addEventListener("click", () => changeDate(1));
  document.getElementById("today-btn").addEventListener("click", () => {
    currentDate = toDateString(new Date());
    document.getElementById("schedule-date-input").value = currentDate;
    loadSchedule();
  });
  document.getElementById("schedule-date-input").addEventListener("change", (e) => {
    currentDate = e.target.value;
    resetEntryForm();
    loadSchedule();
  });

  document.getElementById("entry-form").addEventListener("submit", handleSubmitEntry);
  document.getElementById("cancel-edit-btn").addEventListener("click", resetEntryForm);
}

function changeDate(deltaDays) {
  const d = new Date(currentDate + "T00:00:00");
  d.setDate(d.getDate() + deltaDays);
  currentDate = toDateString(d);
  document.getElementById("schedule-date-input").value = currentDate;
  resetEntryForm();
  loadSchedule();
}

async function loadSchedule() {
  const { data, error } = await supabaseClient
    .from("schedule_entries")
    .select("*, profiles(full_name)")
    .eq("schedule_date", currentDate)
    .order("entry_time", { ascending: true });

  if (error) throw error;

  currentEntries = data || [];
  renderEntryList(currentEntries);
}

// ---------- Entry list (editable by anyone) ----------

function renderEntryList(entries) {
  const listEl = document.getElementById("entry-list");

  if (entries.length === 0) {
    listEl.innerHTML = `<li class="empty-note">No entries yet for this day.</li>`;
    return;
  }

  listEl.innerHTML = entries
    .map(
      (e) => `
      <li class="schedule-list-item">
        <span class="schedule-item-text">
          <input type="checkbox" class="schedule-checkbox" data-complete-id="${e.id}" ${e.completed ? "checked" : ""} title="Mark trip completed" />
          <span class="${e.completed ? "schedule-completed-text" : ""}">
            <strong>${formatEntryTime(e.entry_time)}</strong> — ${e.description}
          </span>
          <span class="text-muted">(added by ${e.profiles ? e.profiles.full_name : "Unknown"})</span>
        </span>
        <span class="actions-cell">
          <button type="button" class="btn-page" data-edit-id="${e.id}">Edit</button>
          <button type="button" class="btn-delete" data-delete-id="${e.id}" title="Delete entry" aria-label="Delete entry">✕</button>
        </span>
      </li>
    `
    )
    .join("");

  listEl.querySelectorAll("[data-complete-id]").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      checkbox.disabled = true;

      const { error } = await supabaseClient
        .from("schedule_entries")
        .update({ completed: checkbox.checked })
        .eq("id", checkbox.dataset.completeId);

      if (error) {
        alert("Could not update: " + error.message);
        checkbox.disabled = false;
        return;
      }

      await loadSchedule();
    });
  });

  listEl.querySelectorAll("[data-edit-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const entry = entries.find((e) => e.id === btn.dataset.editId);
      if (entry) openEditForm(entry);
    });
  });

  listEl.querySelectorAll("[data-delete-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this schedule entry?")) return;

      const { error } = await supabaseClient.from("schedule_entries").delete().eq("id", btn.dataset.deleteId);

      if (error) {
        alert("Could not delete: " + error.message);
        return;
      }

      if (editingEntryId === btn.dataset.deleteId) resetEntryForm();
      await loadSchedule();
    });
  });
}

function openEditForm(entry) {
  editingEntryId = entry.id;
  document.getElementById("entry-time-input").value = formatEntryTime(entry.entry_time);
  document.getElementById("entry-desc-input").value = entry.description;
  document.getElementById("entry-submit-btn").textContent = "Save Changes";
  document.getElementById("cancel-edit-btn").hidden = false;
}

function resetEntryForm() {
  editingEntryId = null;
  document.getElementById("entry-form").reset();
  document.getElementById("entry-message").textContent = "";
  document.getElementById("entry-submit-btn").textContent = "Add Entry";
  document.getElementById("cancel-edit-btn").hidden = true;
}

async function handleSubmitEntry(e) {
  e.preventDefault();
  const messageEl = document.getElementById("entry-message");
  messageEl.textContent = "";

  const entryTime = document.getElementById("entry-time-input").value;
  const description = document.getElementById("entry-desc-input").value.trim();

  const { error } = editingEntryId
    ? await supabaseClient
        .from("schedule_entries")
        .update({ entry_time: entryTime, description })
        .eq("id", editingEntryId)
    : await supabaseClient.from("schedule_entries").insert({
        schedule_date: currentDate,
        entry_time: entryTime,
        description,
      });

  if (error) {
    messageEl.textContent = error.message;
    return;
  }

  resetEntryForm();
  await loadSchedule();
}

