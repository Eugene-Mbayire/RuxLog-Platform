-- ============================================================
-- RuxLog Platform — Editing a medicine is now admin-only too
--
-- Previously "medicines update" allowed manager or admin. Now, like
-- add and delete, editing an existing medicine's quantity/expiry/etc.
-- is admin-only — a manager can no longer touch medicines at all
-- beyond viewing and consuming them.
-- ============================================================

drop policy "medicines update" on public.medicines;

create policy "medicines update" on public.medicines
  for update using (public.is_admin()) with check (public.is_admin());
