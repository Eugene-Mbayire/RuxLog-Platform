-- ============================================================
-- RuxLog Platform — Day-off marker (replaces the work_sessions.is_off
-- approach, which was the wrong place for this)
--
-- A driver marks today off BEFORE signing in — there is no session
-- to attach this to, so it's a separate table entirely, kept apart
-- from work_sessions so it can never affect worked-hours totals.
--
-- day is always forced to the current date in Rwanda local time by
-- the trigger below, never client-supplied. The trigger also blocks
-- marking a day off while currently signed in, as a database-level
-- backstop to the same rule enforced in the UI.
-- ============================================================

create table public.driver_day_off (
  driver_id uuid not null references public.profiles(id),
  day date not null,
  created_at timestamptz not null default now(),
  primary key (driver_id, day)
);

create or replace function public.enforce_day_off_rules()
returns trigger as $$
begin
  new.day := (now() at time zone 'Africa/Kigali')::date;
  new.driver_id := auth.uid();

  if exists (
    select 1 from public.work_sessions
    where driver_id = new.driver_id and sign_out_at is null
  ) then
    raise exception 'Cannot mark a day off while currently signed in.';
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_enforce_day_off_rules
  before insert on public.driver_day_off
  for each row execute function public.enforce_day_off_rules();

alter table public.driver_day_off enable row level security;

-- Everyone can see who's off today (same "shared visibility" pattern
-- used for petty cash and profiles) — only the driver themselves can
-- insert their own mark.
create policy "day off read" on public.driver_day_off
  for select using (auth.uid() is not null);

create policy "day off insert" on public.driver_day_off
  for insert with check (driver_id = auth.uid());

grant select, insert on public.driver_day_off to authenticated;

-- ---------- Undo the now-unused work_sessions.is_off approach ----------
-- work_sessions_view depends on this column (it was rebuilt to include
-- it), so CASCADE drops that view too — recreated fresh right after,
-- which now correctly excludes is_off since the column is already gone.
alter table public.work_sessions drop column is_off cascade;

create view public.work_sessions_view
  with (security_invoker = true) as
select
  ws.*,
  extract(epoch from (coalesce(sign_out_at, now()) - sign_in_at)) / 3600 as worked_hours,
  (extract(epoch from (coalesce(sign_out_at, now()) - sign_in_at)) / 3600) - expected_hours as hours_difference
from public.work_sessions ws;

grant select on public.work_sessions_view to authenticated;
