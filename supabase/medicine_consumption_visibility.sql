-- ============================================================
-- RuxLog Platform — Let everyone see all consumption history
--
-- Previously a driver could only read their own consumption rows
-- (user_id = auth.uid()), a manager saw everyone's. Same "shared
-- visibility" pattern already used for petty cash and profiles:
-- since this isn't private data, every authenticated user can now
-- see the full consumption history for each vehicle's kit.
-- ============================================================

drop policy "consumption read" on public.medicine_consumptions;

create policy "consumption read" on public.medicine_consumptions
  for select using (auth.uid() is not null);
