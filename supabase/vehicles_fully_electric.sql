-- ============================================================
-- RuxLog Platform — Correct specs: both vehicles are fully electric
-- ============================================================

update public.vehicles
set specifications = 'Year: 2026
Model: Tang EV (Fully Electric)
Body Type: 7-Seater SUV
Drivetrain: All-Wheel Drive (AWD)
Fuel Type: Fully Electric (EV)
Seating Capacity: 7'
where plate_number = 'RAJ 912 L';

update public.vehicles
set specifications = 'Year: 2026
Model: SUV (Titanium trim, Fully Electric)
Body Type: 5-Seater SUV
Drivetrain: All-Wheel Drive (AWD)
Fuel Type: Fully Electric (EV)
Seating Capacity: 5'
where plate_number = 'RAJ 015 L';
