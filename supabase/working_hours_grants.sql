-- ============================================================
-- RuxLog Platform — Grants needed for Sign In / Sign Out
--
-- work_sessions previously only had SELECT granted to authenticated
-- (needed for the dashboard cards). The Working Hours page now also
-- needs to INSERT (Sign In) and UPDATE (Sign Out) — RLS already
-- restricts these to a driver acting on their own sessions, but
-- without the grant, Postgres denies it before RLS is even checked.
-- ============================================================

grant insert, update on public.work_sessions to authenticated;
