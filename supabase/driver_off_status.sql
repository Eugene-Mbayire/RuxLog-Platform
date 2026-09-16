-- ============================================================
-- RuxLog Platform — "OFF" toggle for a driver's open session
--
-- Adds is_off, toggleable by the driver only while their session is
-- still open (between Sign In and Sign Out) — updating a session that's
-- already signed out is still blocked, exactly as before.
--
-- IMPORTANT FIX to enforce_actual_times(): previously, ANY update to a
-- work_sessions row was treated as a sign-out (it unconditionally set
-- sign_out_at = now()). That would have meant toggling is_off silently
-- signed the driver out. The trigger now only does that when the update
-- actually targets sign_out_at (i.e. it was null and the client just
-- tried to set it) — any other update to an open session, like this
-- toggle, passes through without touching sign_out_at.
-- ============================================================

alter table public.work_sessions
  add column is_off boolean not null default false;

create or replace function public.enforce_actual_times()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    new.sign_in_at := now();
    new.sign_out_at := null;
  elsif tg_op = 'UPDATE' then
    new.sign_in_at := old.sign_in_at; -- sign-in time never changes after creation

    if old.sign_out_at is not null then
      -- Session already closed — nothing may update it further
      raise exception 'This work session is already signed out.';
    elsif new.sign_out_at is not null then
      -- Client is signing out now — server clock wins regardless of
      -- whatever value was sent
      new.sign_out_at := now();
    else
      -- Some other update to a still-open session (e.g. the OFF toggle)
      -- — leave sign_out_at alone
      new.sign_out_at := null;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;
