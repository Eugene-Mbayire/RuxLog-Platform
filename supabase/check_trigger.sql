-- ============================================================
-- RuxLog Platform — Diagnostic (read-only): does the stock-deducting
-- trigger actually exist and is it enabled?
-- ============================================================

select tgname as trigger_name, tgenabled as enabled_flag, tgrelid::regclass as on_table
from pg_trigger
where tgrelid = 'public.medicine_consumptions'::regclass
  and not tgisinternal;

-- enabled_flag should be 'O' (origin/enabled). If this query returns
-- ZERO rows, or trg_consume_medicine is missing from the list, the
-- trigger was never created (or got dropped) and that's the answer.
