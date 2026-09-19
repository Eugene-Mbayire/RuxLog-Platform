-- ============================================================
-- RuxLog Platform — Drivers can tick car supplies too
--
-- A driver is the one actually sitting in the car, so they're best
-- placed to say whether the umbrella is really in there. They can
-- tick/untick, but nothing else: adding and deleting supplies stays
-- admin-only.
--
-- Two separate mechanisms are needed, because RLS alone can't say
-- "you may change this column but not that one":
--   * the policy below decides WHO may update a row (admin already
--     could, via "car supplies write"; this adds driver),
--   * the column grant decides WHICH column an update may touch, so
--     a driver can't rename a supply while ticking it.
-- ============================================================

create policy "car supplies driver tick" on public.car_supplies
  for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'driver'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'driver'));

-- Narrow UPDATE down to the tick box only — for everyone, admin
-- included, since renaming a supply isn't a feature anywhere.
revoke update on public.car_supplies from authenticated;
grant update (is_available) on public.car_supplies to authenticated;
