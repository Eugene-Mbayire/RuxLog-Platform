-- ============================================================
-- RuxLog Platform — Admin can edit/delete consumption records
--
-- Editing: changing how much was consumed has to move the medicine's
-- stock by the same difference (3 -> 5 consumed means 2 more come out
-- of stock; 5 -> 3 puts 2 back). Stock is a stored column, not a live
-- sum, so that adjustment has to be made explicitly.
--
-- Deleting: a soft delete. The record stops showing in the history and
-- nothing else changes — the stock it originally deducted stays
-- deducted, exactly as the medicine sits today.
--
-- Both are explicit atomic functions rather than RLS + triggers, for
-- the same reason consume_medicine_action() is (see
-- supabase/consume_medicine_rpc.sql): a trigger on this table already
-- proved unreliable once, and one function doing the two-table write
-- in a single call is far easier to reason about.
-- ============================================================

alter table public.medicine_consumptions add column if not exists deleted_at timestamptz;

create or replace function public.edit_consumption_action(p_consumption_id uuid, p_quantity_used integer)
returns void as $$
declare
  v_medicine_id uuid;
  v_old_quantity integer;
  v_delta integer;
  v_available integer;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can edit a consumption record.';
  end if;

  if p_quantity_used is null or p_quantity_used < 1 then
    raise exception 'Quantity must be at least 1.';
  end if;

  select medicine_id, quantity_used into v_medicine_id, v_old_quantity
    from public.medicine_consumptions
    where id = p_consumption_id and deleted_at is null;

  if v_medicine_id is null then
    raise exception 'Consumption record not found.';
  end if;

  -- Consuming more takes more out of stock, consuming less puts some back
  v_delta := p_quantity_used - v_old_quantity;

  select quantity into v_available from public.medicines where id = v_medicine_id;
  if v_delta > v_available then
    raise exception 'Not enough stock. Available: %, Additional needed: %', v_available, v_delta;
  end if;

  update public.medicines
    set quantity = quantity - v_delta, updated_at = now()
    where id = v_medicine_id;

  update public.medicine_consumptions
    set quantity_used = p_quantity_used
    where id = p_consumption_id;
end;
$$ language plpgsql security definer;

create or replace function public.delete_consumption_action(p_consumption_id uuid)
returns void as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can delete a consumption record.';
  end if;

  -- Soft delete only — the medicine's stock is deliberately left alone
  update public.medicine_consumptions
    set deleted_at = now()
    where id = p_consumption_id and deleted_at is null;
end;
$$ language plpgsql security definer;

grant execute on function public.edit_consumption_action(uuid, integer) to authenticated;
grant execute on function public.delete_consumption_action(uuid) to authenticated;
