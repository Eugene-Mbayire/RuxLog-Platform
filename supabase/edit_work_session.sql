-- ============================================================
-- RuxLog Platform — Admin can correct a driver's sign in/out times
--
-- Worked hours are never stored — work_sessions_view and
-- weekly_work_hours both compute them live from sign_in_at and
-- sign_out_at (see supabase/rebuild_work_sessions_view.sql and
-- supabase/weekly_work_hours.sql). So correcting a time here
-- automatically corrects that session's hours, the driver's weekly
-- total, and the owed/extra figures on the dashboard, with no
-- separate recalculation anywhere.
--
-- This is a function rather than a plain UPDATE policy because the
-- enforce_actual_times trigger deliberately overwrites times coming
-- from a client — that's what stops a driver typing their own hours,
-- and it has to stay. See the double update below for how an admin's
-- correction gets past it.
-- ============================================================

create or replace function public.edit_work_session_action(
  p_session_id uuid,
  p_sign_in_at timestamptz,
  p_sign_out_at timestamptz
)
returns void as $$
declare
  v_saved_in timestamptz;
  v_saved_out timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can edit a work session.';
  end if;

  if p_sign_in_at is null then
    raise exception 'Sign in time is required.';
  end if;

  if p_sign_out_at is not null and p_sign_out_at <= p_sign_in_at then
    raise exception 'Sign out time must be after the sign in time.';
  end if;

  -- Run twice on purpose. enforce_actual_times() stamps the real clock
  -- time whenever sign_out_at goes from null to non-null — that's the
  -- normal "driver pressed Sign Out" path. On a session that's still
  -- open, the first update trips that rule and the admin's time is
  -- replaced by now(); by the second update sign_out_at is already
  -- non-null, the rule no longer applies, and the intended time sticks.
  -- On an already-closed session the first update is enough and the
  -- second changes nothing.
  update public.work_sessions
    set sign_in_at = p_sign_in_at, sign_out_at = p_sign_out_at
    where id = p_session_id;

  update public.work_sessions
    set sign_in_at = p_sign_in_at, sign_out_at = p_sign_out_at
    where id = p_session_id;

  -- Confirm the values actually landed. If some other trigger rewrites
  -- them, this fails loudly instead of quietly saving the wrong hours.
  select sign_in_at, sign_out_at into v_saved_in, v_saved_out
    from public.work_sessions where id = p_session_id;

  if v_saved_in is null then
    raise exception 'Work session not found.';
  end if;

  if v_saved_in <> p_sign_in_at or v_saved_out is distinct from p_sign_out_at then
    raise exception 'The database did not accept those times (saved % / %). Nothing was changed on purpose.',
      v_saved_in, v_saved_out;
  end if;
end;
$$ language plpgsql security definer;

grant execute on function public.edit_work_session_action(uuid, timestamptz, timestamptz) to authenticated;
