-- ============================================================
-- RuxLog Platform — Profile photos + driver license link
--
-- Uses each account's real email to find the right row, same
-- reliable approach as the earlier profile-swap fix, rather than
-- needing UUIDs pasted in by hand.
-- ============================================================

alter table public.profiles add column driver_license_url text;

update public.profiles p
set photo_path = 'assets/willyPic.jpeg'
from auth.users u
where p.id = u.id and u.email = 'willy@ruxlog.local';

update public.profiles p
set driver_license_url = 'https://drive.google.com/file/d/10jWxbK6T8PcVsnnravb_Ya2I5Z04qONC/view?usp=drive_link'
from auth.users u
where p.id = u.id and u.email = 'eugene@ruxlog.local';

-- Verify: Eugene and Willy should show their photo_path and (for
-- Eugene) his driver_license_url; everyone else stays null for now.
select p.full_name, p.role, p.photo_path, p.driver_license_url, u.email
from public.profiles p
join auth.users u on u.id = p.id
order by p.full_name;
