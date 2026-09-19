-- ============================================================
-- RuxLog Platform — New "house-staff" role
--
-- House staff are not drivers: no hours, no vehicles, no first aid
-- kit. They see the day's schedule and the petty cash pools, and
-- that's it.
--
-- Nothing here grants them anything extra. is_manager() and
-- is_admin() both stay false for this role, so every manager- and
-- admin-gated policy already excludes them automatically — the same
-- trick that made adding "admin" cheap (see supabase/admin_role.sql).
-- What they can reach is whatever is open to any signed-in user:
-- reading the schedule, reading the petty cash balance, and making
-- their own withdrawals.
--
-- Refills need one extra grant on top of that — see
-- supabase/house_staff_petty_cash.sql, which must be run after this.
-- ============================================================

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('driver', 'manager', 'admin', 'house-staff'));

-- To give someone this role, run (with their real email):
--   update public.profiles set role = 'house-staff' where email = 'them@example.com';
