-- ============================================================
-- RuxLog Platform — Grants for the First Aid Kit page
--
-- RLS already restricts add/edit/delete on medicines to managers,
-- and lets anyone insert their own consumption row (see schema.sql:
-- "medicines write" requires is_manager(); "consumption insert"
-- requires user_id = auth.uid()). These grants just allow the write
-- attempt to reach those checks at all — same pattern as every other
-- feature so far.
-- ============================================================

grant insert, update, delete on public.medicines to authenticated;
grant select, insert on public.medicine_consumptions to authenticated;
