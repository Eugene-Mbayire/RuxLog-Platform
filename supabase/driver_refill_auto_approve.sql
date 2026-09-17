-- ============================================================
-- RuxLog Platform — Drivers can refill petty cash too, and their
-- refills need no confirmation (unlike a manager/admin's refill,
-- which still stays "pending" until a driver confirms it).
--
-- Previously "petty cash insert" only let managers/admins insert
-- type='refill' rows. This adds a second, permissive INSERT policy
-- (Postgres combines multiple permissive policies for the same
-- action with OR) so drivers can insert refills too, without having
-- to know/replace the existing policy's exact definition.
--
-- A BEFORE INSERT trigger then auto-approves a driver's own refill —
-- setting status to 'approved' and approved_by to themselves —
-- immediately so it counts toward the balance right away, exactly
-- like it would if a driver had confirmed it. Manager/admin refills
-- are untouched by this trigger and keep going through the existing
-- pending-until-a-driver-confirms flow.
-- ============================================================

create policy "petty cash driver refill insert" on public.petty_cash_transactions
  for insert with check (
    user_id = auth.uid()
    and type = 'refill'
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'driver')
  );

create or replace function public.driver_refill_auto_approve()
returns trigger as $$
begin
  if new.type = 'refill' and exists (
    select 1 from public.profiles where id = auth.uid() and role = 'driver'
  ) then
    new.status := 'approved';
    new.approved_by := auth.uid();
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_driver_refill_auto_approve on public.petty_cash_transactions;
create trigger trg_driver_refill_auto_approve
  before insert on public.petty_cash_transactions
  for each row execute function public.driver_refill_auto_approve();
