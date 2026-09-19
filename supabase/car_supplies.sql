-- ============================================================
-- RuxLog Platform — Car Supplies checklist
--
-- One row per supply item per vehicle. is_available is the tick box:
-- checked means the item is actually in that car. Everyone can see
-- the list (and the dashboard flags whatever is missing), but only an
-- admin can tick/untick, add a new supply, or delete one.
--
-- Display order is "order added" (created_at), which is why the seed
-- below staggers the timestamps — it keeps the twelve standard items
-- in the order they were given, and anything an admin adds later
-- lands at the end of that car's list.
-- ============================================================

create table public.car_supplies (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  name text not null,
  is_available boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.car_supplies enable row level security;

create policy "car supplies read" on public.car_supplies
  for select using (auth.uid() is not null);

create policy "car supplies write" on public.car_supplies
  for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.car_supplies to authenticated;

-- Every vehicle starts with the same twelve supplies, all ticked —
-- an admin unticks whatever a car is actually missing.
insert into public.car_supplies (vehicle_id, name, created_at)
select v.id, s.name, now() + (s.ord * interval '1 millisecond')
from public.vehicles v
cross join (values
  (1, 'jek'),
  (2, 'Triangle'),
  (3, 'Portable air compressor'),
  (4, 'Hand sanitizer'),
  (5, 'Face tissues'),
  (6, 'Gate remote'),
  (7, 'Rag'),
  (8, 'First Aid kit'),
  (9, 'Fire distinguisher'),
  (10, 'Reflector jacket'),
  (11, 'Umbrella'),
  (12, 'Tire opener tool')
) as s(ord, name);
