-- ============================================================
-- RuxLog Platform — Profile photos for Alphonse and Eric
--
-- Eric was matched by name and worked. Alphonse didn't match, so his
-- row is found by email instead — the same reliable approach used in
-- supabase/users_profiles_photos.sql, since the account name doesn't
-- necessarily start with the spelling used here.
-- ============================================================

update public.profiles p
set photo_path = 'assets/alpho.jpeg'
from auth.users u
where p.id = u.id and u.email = 'alphonse@ruxlog.local';

update public.profiles
set photo_path = 'assets/eric.jpeg'
where full_name ilike 'eric%';

-- Verify: Alphonse and Eric should both show a photo_path now.
select p.full_name, p.role, p.photo_path, u.email
from public.profiles p
join auth.users u on u.id = p.id
order by p.full_name;
