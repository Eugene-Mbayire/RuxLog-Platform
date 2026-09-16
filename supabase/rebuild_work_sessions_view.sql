-- ============================================================
-- RuxLog Platform — Rebuild work_sessions_view to include is_off
--
-- Postgres freezes "SELECT *" in a view at creation time — it does
-- NOT automatically pick up columns added to the table afterward.
-- work_sessions_view was created before is_off existed, so it was
-- silently missing it. Dropping and recreating picks it up fresh.
-- ============================================================

drop view public.work_sessions_view;

create view public.work_sessions_view
  with (security_invoker = true) as
select
  ws.*,
  extract(epoch from (coalesce(sign_out_at, now()) - sign_in_at)) / 3600 as worked_hours,
  (extract(epoch from (coalesce(sign_out_at, now()) - sign_in_at)) / 3600) - expected_hours as hours_difference
from public.work_sessions ws;

-- Dropping and recreating the view resets its grants, so re-grant it
grant select on public.work_sessions_view to authenticated;
