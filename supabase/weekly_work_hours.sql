-- ============================================================
-- RuxLog Platform — Weekly working-hours record
--
-- A view, not a snapshotted table: any week — past or current —
-- can always be looked up accurately straight from the permanent
-- work_sessions data, so there's no scheduled job needed to "close
-- out" a week, and nothing to lose if one is ever missed. Managers
-- are excluded at the database level (joined against profiles with
-- role = 'driver'), not just hidden in the UI — only drivers'
-- hours are ever tracked here.
--
-- security_invoker = true so a driver only ever sees their own
-- weeks and a manager sees everyone's, exactly like work_sessions
-- itself (RLS is enforced the same way).
--
-- Weeks are computed in Rwanda's local time (Africa/Kigali, UTC+2)
-- so Monday–Sunday boundaries match actual local weeks rather than
-- the database server's UTC day, which would shift the boundary by
-- 2 hours around midnight.
-- ============================================================

create view public.weekly_work_hours
  with (security_invoker = true) as
select
  ws.driver_id,
  date_trunc('week', ws.sign_in_at at time zone 'Africa/Kigali')::date as week_start,
  (date_trunc('week', ws.sign_in_at at time zone 'Africa/Kigali')::date + interval '6 days')::date as week_end,
  sum(extract(epoch from (coalesce(ws.sign_out_at, now()) - ws.sign_in_at)) / 3600) as worked_hours
from public.work_sessions ws
join public.profiles p on p.id = ws.driver_id and p.role = 'driver'
group by ws.driver_id, date_trunc('week', ws.sign_in_at at time zone 'Africa/Kigali');

grant select on public.weekly_work_hours to authenticated;
