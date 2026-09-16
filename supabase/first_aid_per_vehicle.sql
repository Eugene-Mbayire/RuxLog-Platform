-- ============================================================
-- RuxLog Platform — Split the First Aid Kit into one per vehicle
--
-- Same approach as per_vehicle_petty_cash.sql: existing medicines
-- are assigned to BYD TANG (the vehicle they've implicitly been
-- for), and BYD TITANIUM starts with an empty kit. No changes are
-- needed to consume_medicine_action() — it already operates purely
-- by medicine_id, which now implies a vehicle via this column.
-- ============================================================

alter table public.medicines
  add column if not exists vehicle_id uuid references public.vehicles(id);

update public.medicines
set vehicle_id = (select id from public.vehicles where plate_number = 'RAJ 912 L')
where vehicle_id is null;

alter table public.medicines
  alter column vehicle_id set not null;
