-- ============================================================
-- RuxLog Platform — Owed/extra hours totals visible to everyone
--
-- The generated schedule prints every driver's owed/extra hours, and
-- that schedule gets shared to the work group, so the figures have to
-- read the same no matter who is logged in.
--
-- weekly_work_hours can't do that: it's declared with
-- security_invoker = true, so RLS on work_sessions applies and a
-- driver only ever gets their own rows back. Everyone else's total
-- then came out as zero, which the page displayed as "All caught up".
--
-- This view is deliberately created WITHOUT security_invoker, so it
-- runs with the view owner's rights and returns the same totals to
-- every signed-in user — the same approach petty_cash_balance already
-- uses for its pool balances. It exposes nothing but a name and a
-- single number per driver; individual sessions stay protected by RLS.
-- ============================================================

create view public.driver_hours_totals as
with weeks as (
  select
    ws.driver_id,
    date_trunc('week', ws.sign_in_at at time zone 'Africa/Kigali') as week_start,
    sum(extract(epoch from (coalesce(ws.sign_out_at, now()) - ws.sign_in_at)) / 3600) as worked_hours
  from public.work_sessions ws
  join public.profiles p on p.id = ws.driver_id and p.role = 'driver'
  group by ws.driver_id, date_trunc('week', ws.sign_in_at at time zone 'Africa/Kigali')
)
select
  p.id as driver_id,
  p.full_name,
  -- Negative means the driver owes hours, positive means overtime.
  -- 40 is the weekly expectation; keep it in step with
  -- WEEKLY_EXPECTED_HOURS in js/utils.js.
  coalesce(sum(w.worked_hours - 40), 0) as total_diff_hours
from public.profiles p
left join weeks w on w.driver_id = p.id
where p.role = 'driver'
group by p.id, p.full_name;

grant select on public.driver_hours_totals to authenticated;
