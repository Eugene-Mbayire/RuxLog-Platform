-- ============================================================
-- RuxLog Platform — Diagnostic (read-only): any orphaned open sessions?
--
-- If this returns any row for Eugene with an old sign_in_at, the app
-- correctly thinks he's "still signed in" from that old session,
-- which would explain the OFF button staying hidden.
-- ============================================================

select id, driver_id, sign_in_at, sign_out_at
from public.work_sessions
where sign_out_at is null
order by sign_in_at;
