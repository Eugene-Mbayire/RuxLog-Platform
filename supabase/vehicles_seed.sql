-- ============================================================
-- RuxLog Platform — Seed vehicle documents + specifications
--
-- Uses one placeholder Google Drive link for all documents on both
-- vehicles for now — replace document_url per row once you have the
-- real files (the manager edit form on the Vehicles page can do this
-- without touching SQL again).
-- ============================================================

-- One document row per (vehicle, type) — the edit form always updates
-- an existing row rather than creating duplicates.
alter table public.vehicle_documents
  add constraint vehicle_documents_vehicle_type_unique unique (vehicle_id, document_type);

insert into public.vehicle_documents (vehicle_id, document_type, document_url, expiry_date)
select id, 'insurance', 'https://drive.google.com/file/d/1fivKUK74AapuohmtUFnPXvY5Atd1fKjG/view?usp=drive_link', '2026-12-13'::date
from public.vehicles where plate_number in ('RAJ 912 L', 'RAJ 015 L')
union all
select id, 'control_technique', 'https://drive.google.com/file/d/1fivKUK74AapuohmtUFnPXvY5Atd1fKjG/view?usp=drive_link', '2026-12-23'::date
from public.vehicles where plate_number in ('RAJ 912 L', 'RAJ 015 L')
union all
select id, 'yellow_card', 'https://drive.google.com/file/d/1fivKUK74AapuohmtUFnPXvY5Atd1fKjG/view?usp=drive_link', null::date
from public.vehicles where plate_number in ('RAJ 912 L', 'RAJ 015 L');

-- BYD Tang: a real, documented BYD model — specs below reflect the
-- well-known Tang DM-i (plug-in hybrid) configuration.
update public.vehicles
set specifications = 'Year: 2026
Model: Tang DM-i (Plug-in Hybrid)
Body Type: 7-Seater SUV
Drivetrain: All-Wheel Drive (AWD)
Fuel Type: Petrol + Electric (PHEV)
Seating Capacity: 7'
where plate_number = 'RAJ 912 L';

-- BYD Titanium: not a globally recognized BYD model name — placeholder
-- specs pending your correction via the Vehicles page edit form.
update public.vehicles
set specifications = 'Year: 2026
Model: SUV (Titanium trim)
Body Type: 5-Seater SUV
Drivetrain: All-Wheel Drive (AWD)
Fuel Type: Electric / Hybrid
Seating Capacity: 5'
where plate_number = 'RAJ 015 L';

-- Manager-only editing, enforced by existing RLS ("vehicles write" /
-- "documents write" already require is_manager()) — these grants just
-- allow the write attempt to reach that check at all.
grant update on public.vehicles to authenticated;
grant update, insert on public.vehicle_documents to authenticated;
