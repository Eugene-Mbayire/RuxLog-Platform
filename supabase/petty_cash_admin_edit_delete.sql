-- ============================================================
-- RuxLog Platform — Admin can edit/delete petty cash transactions
--
-- Editing: admin can change a transaction's amount/reason. Since
-- petty_cash_balance is computed live from the transactions table,
-- an edited amount is reflected in the balance automatically — no
-- separate balance bookkeeping needed.
--
-- Deleting: a real SQL DELETE would shrink that same live sum and
-- change the balance, which is explicitly NOT wanted here — deleting
-- a record should only remove it from the visible history, leaving
-- the balance exactly as it was. So "delete" is a soft delete: a
-- deleted_at timestamp is set, the row keeps existing (and keeps
-- counting toward the balance), and every page that lists history
-- filters out rows where deleted_at is set.
-- ============================================================

alter table public.petty_cash_transactions add column if not exists deleted_at timestamptz;

-- Admin gets a broad UPDATE policy covering both edits (amount/reason)
-- and soft-deletes (deleted_at) — everyone else's UPDATE access (e.g.
-- a driver confirming a pending refill) is untouched, since Postgres
-- combines multiple permissive policies for the same action with OR.
create policy "petty cash admin edit" on public.petty_cash_transactions
  for update using (public.is_admin()) with check (public.is_admin());

-- deleted_at is always server-set, never trusted from the client —
-- same rule this project applies to every other timestamp. Only
-- fires the first time a row is soft-deleted (null -> non-null); an
-- edit that leaves deleted_at null is untouched by this trigger.
create or replace function public.enforce_petty_cash_delete_time()
returns trigger as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    new.deleted_at := now();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_enforce_petty_cash_delete_time on public.petty_cash_transactions;
create trigger trg_enforce_petty_cash_delete_time
  before update on public.petty_cash_transactions
  for each row execute function public.enforce_petty_cash_delete_time();
