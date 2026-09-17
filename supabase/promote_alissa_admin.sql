-- ============================================================
-- RuxLog Platform — Promote Alissa to admin
-- ============================================================

update public.profiles p
set role = 'admin'
from auth.users u
where p.id = u.id and u.email = 'alissa@ruxlog.local';

-- Verify
select p.full_name, p.role, u.email
from public.profiles p
join auth.users u on u.id = p.id
order by p.full_name;
