-- ============================================================
-- RuxLog Platform — New "admin" role
--
-- Design: is_manager() is redefined to mean "manager OR admin" (i.e.
-- "at least manager-level access"). Every existing policy that already
-- used is_manager() automatically extends to admin too, with zero
-- changes to those policies. A new is_admin() checks admin only, used
-- for the few things now restricted ABOVE manager level: editing
-- vehicles, managing users, adding/deleting medicines, and reading
-- the new login logs.
-- ============================================================

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('driver', 'manager', 'admin'));

create or replace function public.is_manager()
returns boolean as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role in ('manager', 'admin')
  );
$$ language sql security definer stable;

create function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- ---------- Vehicles: admin only from now on (was manager) ----------
drop policy "vehicles write" on public.vehicles;
create policy "vehicles write" on public.vehicles
  for all using (public.is_admin()) with check (public.is_admin());

drop policy "documents write" on public.vehicle_documents;
create policy "documents write" on public.vehicle_documents
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- Users (profiles edit): admin only from now on (was manager) ----------
drop policy "profiles write" on public.profiles;
create policy "profiles write" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- ---------- Medicines: add/delete admin only, edit stays manager+admin ----------
drop policy "medicines write" on public.medicines;

create policy "medicines insert" on public.medicines
  for insert with check (public.is_admin());

create policy "medicines update" on public.medicines
  for update using (public.is_manager()) with check (public.is_manager());

create policy "medicines delete" on public.medicines
  for delete using (public.is_admin());

-- ============================================================
-- Logs feature: who logged in/out and when (admin only to view)
-- ============================================================

create table public.login_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  event_type text not null check (event_type in ('login', 'logout')),
  created_at timestamptz not null default now()
);

-- user_id and created_at are always server-set, never client-supplied
create function public.enforce_log_author()
returns trigger as $$
begin
  new.user_id := auth.uid();
  new.created_at := now();
  return new;
end;
$$ language plpgsql;

create trigger trg_enforce_log_author
  before insert on public.login_logs
  for each row execute function public.enforce_log_author();

alter table public.login_logs enable row level security;

create policy "login logs read" on public.login_logs
  for select using (public.is_admin());

create policy "login logs insert" on public.login_logs
  for insert with check (auth.uid() is not null);

grant select, insert on public.login_logs to authenticated;
