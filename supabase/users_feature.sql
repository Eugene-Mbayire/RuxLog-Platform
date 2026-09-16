-- ============================================================
-- RuxLog Platform — Users management (manager only)
--
-- Adds email to profiles (previously only in auth.users, which the
-- frontend can't query directly) and lets a manager edit any user's
-- name/role. Creating a new login account, deleting one, or resetting
-- a password still has to happen in the Supabase Dashboard — there is
-- no safe way to do those from client-side code without the
-- service_role key, which must never be in frontend code.
-- ============================================================

alter table public.profiles add column email text;

-- Backfill existing profiles (Eugene, Alissa) from auth.users
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

-- Keep it populated automatically for every future account too
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'driver', new.email);
  return new;
end;
$$ language plpgsql security definer;

-- A manager can edit anyone's name/role (id and email stay read-only —
-- email changes go through Supabase Auth's own flow, not this table)
create policy "profiles write" on public.profiles
  for update using (public.is_manager()) with check (public.is_manager());

grant update on public.profiles to authenticated;
