-- ============================================================
-- RuxLog Platform — Profile photos for Alphonse, Eric and Alissa
--
-- Eric was matched by name and worked. The others are found by email
-- instead — the same reliable approach used in
-- supabase/users_profiles_photos.sql, since an account's name doesn't
-- necessarily start with the spelling used here.
-- ============================================================

update public.profiles p
set photo_path = 'assets/alpho.jpeg'
from auth.users u
where p.id = u.id and u.email = 'alphonse@ruxlog.local';

update public.profiles p
set photo_path = 'assets/lis.jpeg'
from auth.users u
where p.id = u.id and u.email = 'alissa@ruxlog.local';

update public.profiles
set photo_path = 'assets/eric.jpeg'
where full_name ilike 'eric%';

-- Verify: Alphonse, Eric and Alissa should all show a photo_path now.
select p.full_name, p.role, p.photo_path, u.email
from public.profiles p
join auth.users u on u.id = p.id
order by p.full_name;
