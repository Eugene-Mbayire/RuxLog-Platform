-- ============================================================
-- RuxLog Platform — What is blocking a user delete
--
-- Read-only: reports only, changes nothing.
--
-- Established by the previous run: profiles_id_fkey already cascades,
-- so deleting an auth user does delete their profile. What then
-- refuses is one of the seven keys pointing AT profiles, none of
-- which have a delete rule:
--   work_sessions.driver_id, petty_cash_transactions.user_id,
--   petty_cash_transactions.approved_by, medicine_consumptions.user_id,
--   schedule_entries.created_by, driver_day_off.driver_id,
--   login_logs.user_id
--
-- This lists every user with a count for each, so the row that's
-- holding the delete is visible without typing an email anywhere.
-- Any non-zero number on that person's row is a blocker.
-- ============================================================

select
  p.full_name,
  p.role,
  (select count(*) from public.work_sessions           t where t.driver_id  = p.id) as work_sessions,
  (select count(*) from public.petty_cash_transactions t where t.user_id    = p.id) as petty_cash_made,
  (select count(*) from public.petty_cash_transactions t where t.approved_by = p.id) as petty_cash_approved,
  (select count(*) from public.medicine_consumptions   t where t.user_id    = p.id) as consumptions,
  (select count(*) from public.schedule_entries        t where t.created_by = p.id) as schedule_entries,
  (select count(*) from public.driver_day_off          t where t.driver_id  = p.id) as days_off,
  (select count(*) from public.login_logs              t where t.user_id    = p.id) as login_logs
from public.profiles p
order by p.full_name;
