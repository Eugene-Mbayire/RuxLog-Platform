-- ============================================================
-- RuxLog Platform — Deleting a user in the dashboard removes their profile
--
-- public.profiles.id points at auth.users(id) with no delete rule, so
-- removing someone in Authentication -> Users was refused while their
-- profile row still existed — the "Database error deleting user"
-- message. This makes that one key cascade: delete the auth account
-- and the profile goes with it.
--
-- Deliberately NOT changed: the keys pointing at profiles from
-- work_sessions, petty_cash_transactions, medicine_consumptions,
-- schedule_entries, driver_day_off and login_logs. Those still block
-- the delete, which is the point — anyone who has actually worked,
-- spent petty cash or consumed a medicine cannot be erased, because
-- that would tear holes in the ledger and the hours records. Only
-- someone with no history at all can be deleted outright.
--
-- The constraint name is looked up rather than assumed, since it was
-- created by hand and may not use the default naming.
-- ============================================================

do $$
declare
  v_constraint_name text;
begin
  select tc.constraint_name into v_constraint_name
  from information_schema.table_constraints tc
  join information_schema.constraint_column_usage ccu
    on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
  where tc.constraint_type = 'FOREIGN KEY'
    and tc.table_schema = 'public'
    and tc.table_name = 'profiles'
    and ccu.table_schema = 'auth'
    and ccu.table_name = 'users';

  if v_constraint_name is null then
    raise exception 'No foreign key found from public.profiles to auth.users.';
  end if;

  execute format('alter table public.profiles drop constraint %I', v_constraint_name);

  alter table public.profiles
    add constraint profiles_id_fkey
    foreign key (id) references auth.users(id) on delete cascade;
end;
$$;
