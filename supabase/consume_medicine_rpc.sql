-- ============================================================
-- RuxLog Platform — Replace the trigger-based consume with an
-- explicit function call
--
-- The BEFORE INSERT trigger approach (trg_consume_medicine) was not
-- reliably deducting stock. Rather than keep debugging trigger
-- firing order blind, this replaces it with one explicit, atomic
-- function that does the check + deduction + record in a single
-- call — easier to reason about and call directly, with a clear
-- error if anything fails.
--
-- auth.uid() is read directly inside the function (never trusts a
-- client-supplied user id), and it's SECURITY DEFINER so a driver
-- can still reduce stock despite "medicines write" RLS being
-- manager-only for direct edits.
-- ============================================================

-- Remove the old trigger-based mechanism so it can't double-deduct
-- once the frontend switches to calling the function below.
drop trigger if exists trg_consume_medicine on public.medicine_consumptions;
drop function if exists public.consume_medicine();

create or replace function public.consume_medicine_action(p_medicine_id uuid, p_quantity_used integer)
returns void as $$
declare
  available integer;
begin
  if p_quantity_used is null or p_quantity_used < 1 then
    raise exception 'Quantity must be at least 1.';
  end if;

  select quantity into available from public.medicines where id = p_medicine_id;
  if available is null then
    raise exception 'Medicine not found.';
  end if;
  if p_quantity_used > available then
    raise exception 'Not enough stock. Available: %, Requested: %', available, p_quantity_used;
  end if;

  update public.medicines
    set quantity = quantity - p_quantity_used, updated_at = now()
    where id = p_medicine_id;

  insert into public.medicine_consumptions (medicine_id, user_id, quantity_used)
    values (p_medicine_id, auth.uid(), p_quantity_used);
end;
$$ language plpgsql security definer;

grant execute on function public.consume_medicine_action(uuid, integer) to authenticated;
