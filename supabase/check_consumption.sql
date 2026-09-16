-- ============================================================
-- RuxLog Platform — Diagnostic (read-only): recent consumptions
-- vs. current stock, to see exactly what happened on each attempt.
-- ============================================================

select
  p.full_name as consumed_by,
  m.name as medicine,
  mc.quantity_used,
  mc.consumed_at,
  m.quantity as medicine_current_quantity
from public.medicine_consumptions mc
join public.medicines m on m.id = mc.medicine_id
join public.profiles p on p.id = mc.user_id
order by mc.consumed_at desc
limit 20;
