-- ============================================================
-- RuxLog Platform — Diagnostic query (READ-ONLY)
-- Does not change schema, RLS, data, or accounts.
-- Shows the true link between each real Supabase Auth user and
-- whatever profiles row is currently attached to their id.
-- ============================================================

select
  au.id as auth_user_id,
  au.email,
  au.created_at as auth_created_at,
  p.id as profile_id,
  p.full_name,
  p.role
from auth.users au
left join public.profiles p on p.id = au.id
order by au.created_at;
