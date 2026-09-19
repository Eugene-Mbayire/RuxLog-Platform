-- ============================================================
-- RuxLog Platform — House staff can refill petty cash too
--
-- Same treatment drivers got (see driver_refill_auto_approve.sql):
-- they can put money into a pool, and it counts immediately rather
-- than waiting for a driver to confirm it arrived. The confirmation
-- step exists for the manager/admin -> driver handoff, where the
-- person putting the money in isn't the person receiving it. House
-- staff handle their own pool, so there's nobody else to confirm.
--
-- Withdrawals already worked for them — that's open to any signed-in
-- user — so only refills needed opening up.
-- ============================================================

create policy "petty cash house staff refill insert" on public.petty_cash_transactions
  for insert with check (
    user_id = auth.uid()
    and type = 'refill'
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'house-staff')
  );

-- Broadened from driver-only to "anyone who refills their own pool".
-- The function keeps its original name so the existing trigger
-- (trg_driver_refill_auto_approve) still points at it.
create or replace function public.driver_refill_auto_approve()
returns trigger as $$
begin
  if new.type = 'refill' and exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('driver', 'house-staff')
  ) then
    new.status := 'approved';
    new.approved_by := auth.uid();
  end if;
  return new;
end;
$$ language plpgsql security definer;
