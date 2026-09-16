-- ============================================================
-- RuxLog Platform — Fix "Could not find column in schema cache"
--
-- PostgREST (the API layer in front of Postgres) caches the table
-- schema and occasionally doesn't notice a new column right away.
-- This first confirms is_off actually exists, then tells PostgREST
-- to reload its cache.
-- ============================================================

-- Should return one row: is_off | boolean
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'work_sessions' and column_name = 'is_off';

notify pgrst, 'reload schema';
