-- ============================================================
-- RuxLog Platform — Mark a schedule entry (trip) as completed
--
-- No grant changes needed — everyone already has full read/write
-- on schedule_entries (see schedule.sql), so this is just a new
-- column anyone can toggle.
-- ============================================================

alter table public.schedule_entries
  add column completed boolean not null default false;
