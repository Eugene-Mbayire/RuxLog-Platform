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
let editingRecurringId = null;
let recurringTasks = [];

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function weekdayOf(dateStr) {
  return new Date(dateStr + "T00:00:00").getDay();
}

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireAuth();
  if (!profile) return;

  renderNav(profile);

  const container = document.getElementById("schedule-content");
  container.innerHTML = scaffoldHtml();
  wireControls();

  try {
    await Promise.all([loadSchedule(), loadRecurringTasks()]);
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

      <h4 class="section-title">Repeating Tasks</h4>
      <p class="text-muted">Add a task once and it appears on that weekday every week. Editing or deleting it here changes every upcoming matching day. Editing or deleting it in the day's Entries list above changes that one day only.</p>
      <details class="form-card" open>
        <summary>Add / Edit Repeating Task</summary>
        <form id="recurring-form">
          <div class="field">
            <label for="recurring-weekday-input">Every</label>
            <select id="recurring-weekday-input" required>
              ${WEEKDAY_NAMES.map((name, i) => `<option value="${i}">${name}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="recurring-time-input">Time</label>
            <input type="time" id="recurring-time-input" required />
          </div>
          <div class="field">
            <label for="recurring-desc-input">Description</label>
            <input type="text" id="recurring-desc-input" required placeholder="e.g. Kids to school" />
          </div>
          <button type="submit" id="recurring-submit-btn" class="btn btn-auto">Add Repeating Task</button>
          <button type="button" id="cancel-recurring-edit-btn" class="btn btn-auto btn-off" hidden>Cancel Edit</button>
          <p class="error-message" id="recurring-message"></p>
        </form>
      </details>
      <ul class="schedule-entry-list" id="recurring-list"></ul>
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

  document.getElementById("recurring-weekday-input").value = String(weekdayOf(currentDate));
  document.getElementById("recurring-form").addEventListener("submit", handleSubmitRecurring);
  document.getElementById("cancel-recurring-edit-btn").addEventListener("click", resetRecurringForm);
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
  // Create this day's rows for any repeating tasks before reading.
  const { error: ensureError } = await supabaseClient.rpc("ensure_recurring_entries", { p_date: currentDate });
  if (ensureError) throw ensureError;

  if (!editingRecurringId) {
    document.getElementById("recurring-weekday-input").value = String(weekdayOf(currentDate));
  }

  const { data, error } = await supabaseClient
    .from("schedule_entries")
    .select("*, profiles(full_name)")
    .eq("schedule_date", currentDate)
    .eq("skipped", false)
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
          <span class="text-muted">(added by ${e.profiles ? e.profiles.full_name : "Unknown"}${
            e.recurring_task_id ? (e.is_override ? " · edited for this day" : " · repeats weekly") : ""
          })</span>
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
      const entry = entries.find((x) => x.id === btn.dataset.deleteId);
      const fromRepeating = entry && entry.recurring_task_id;
      if (!confirm(fromRepeating ? "Remove this repeating task from this day only?" : "Delete this schedule entry?")) return;

      // A day generated from a repeating task is hidden rather than
      // deleted, otherwise it would be re-created the next time the
      // day is opened. Other weeks are unaffected.
      const { error } = fromRepeating
        ? await supabaseClient
            .from("schedule_entries")
            .update({ skipped: true, is_override: true })
            .eq("id", btn.dataset.deleteId)
        : await supabaseClient.from("schedule_entries").delete().eq("id", btn.dataset.deleteId);

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
        // is_override detaches this one day from later series edits.
        .update({ entry_time: entryTime, description, is_override: true })
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


// ---------- Repeating tasks (changes apply to every matching day) ----------

async function loadRecurringTasks() {
  const { data, error } = await supabaseClient
    .from("recurring_schedule_tasks")
    .select("*, profiles(full_name)")
    .order("weekday", { ascending: true })
    .order("entry_time", { ascending: true });

  if (error) throw error;

  recurringTasks = data || [];
  renderRecurringList(recurringTasks);
}

function renderRecurringList(tasks) {
  const listEl = document.getElementById("recurring-list");

  if (tasks.length === 0) {
    listEl.innerHTML = `<li class="empty-note">No repeating tasks yet.</li>`;
    return;
  }

  listEl.innerHTML = tasks
    .map(
      (t) => `
      <li class="schedule-list-item">
        <span class="schedule-item-text">
          <span><strong>Every ${WEEKDAY_NAMES[t.weekday]} · ${formatEntryTime(t.entry_time)}</strong> — ${t.description}</span>
          <span class="text-muted">(added by ${t.profiles ? t.profiles.full_name : "Unknown"})</span>
        </span>
        <span class="actions-cell">
          <button type="button" class="btn-page" data-recurring-edit-id="${t.id}">Edit</button>
          <button type="button" class="btn-delete" data-recurring-delete-id="${t.id}" title="Delete repeating task" aria-label="Delete repeating task">✕</button>
        </span>
      </li>
    `
    )
    .join("");

  listEl.querySelectorAll("[data-recurring-edit-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const task = tasks.find((t) => t.id === btn.dataset.recurringEditId);
      if (task) openRecurringEditForm(task);
    });
  });

  listEl.querySelectorAll("[data-recurring-delete-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const task = tasks.find((t) => t.id === btn.dataset.recurringDeleteId);
      const dayName = task ? WEEKDAY_NAMES[task.weekday] : "matching day";
      if (!confirm(`Delete this repeating task from every upcoming ${dayName}? Past days are kept.`)) return;

      const { error } = await supabaseClient.from("recurring_schedule_tasks").delete().eq("id", btn.dataset.recurringDeleteId);

      if (error) {
        alert("Could not delete: " + error.message);
        return;
      }

      if (editingRecurringId === btn.dataset.recurringDeleteId) resetRecurringForm();
      await Promise.all([loadRecurringTasks(), loadSchedule()]);
    });
  });
}

function openRecurringEditForm(task) {
  editingRecurringId = task.id;
  document.getElementById("recurring-weekday-input").value = String(task.weekday);
  document.getElementById("recurring-time-input").value = formatEntryTime(task.entry_time);
  document.getElementById("recurring-desc-input").value = task.description;
  document.getElementById("recurring-submit-btn").textContent = "Save for All Days";
  document.getElementById("cancel-recurring-edit-btn").hidden = false;
}

function resetRecurringForm() {
  editingRecurringId = null;
  document.getElementById("recurring-form").reset();
  document.getElementById("recurring-weekday-input").value = String(weekdayOf(currentDate));
  document.getElementById("recurring-message").textContent = "";
  document.getElementById("recurring-submit-btn").textContent = "Add Repeating Task";
  document.getElementById("cancel-recurring-edit-btn").hidden = true;
}

async function handleSubmitRecurring(e) {
  e.preventDefault();
  const messageEl = document.getElementById("recurring-message");
  messageEl.textContent = "";

  const weekday = Number(document.getElementById("recurring-weekday-input").value);
  const entryTime = document.getElementById("recurring-time-input").value;
  const description = document.getElementById("recurring-desc-input").value.trim();

  const { error } = editingRecurringId
    ? await supabaseClient
        .from("recurring_schedule_tasks")
        .update({ weekday, entry_time: entryTime, description })
        .eq("id", editingRecurringId)
    : await supabaseClient.from("recurring_schedule_tasks").insert({
        weekday,
        entry_time: entryTime,
        description,
        // Starts from today (local date), so past days aren't back-filled.
        starts_on: toDateString(new Date()),
      });

  if (error) {
    messageEl.textContent = error.message;
    return;
  }

  resetRecurringForm();
  await Promise.all([loadRecurringTasks(), loadSchedule()]);
}
