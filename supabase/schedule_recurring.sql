-- ============================================================
-- RuxLog Platform — Repeating schedule tasks ("every Monday at 08:00")
--
-- A repeating task is defined once in recurring_schedule_tasks and
-- shows up on every matching weekday of the calendar. Each day still
-- gets its own row in schedule_entries (created on demand by
-- ensure_recurring_entries() when that day is opened), so a single
-- day can be ticked completed, edited or removed on its own without
-- touching the other weeks:
--
--   * recurring_task_id  — which repeating task the row came from
--   * is_override        — this day was edited/removed in the normal
--                          Schedule feature, so series edits skip it
--   * skipped            — this day was removed on its own; the row is
--                          kept (hidden) so it is not re-created
--
-- Editing or deleting the repeating task itself changes every day
-- from today onward that has not been customised or completed. Past
-- days are left as history.
--
-- Same equal-permission model as schedule.sql: any signed-in user
-- can manage repeating tasks.
-- ============================================================

create table public.recurring_schedule_tasks (
  id uuid primary key default gen_random_uuid(),
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday, same as JS getDay()
  entry_time time not null,
  description text not null,
  starts_on date not null default current_date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create function public.enforce_recurring_task_author()
returns trigger as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$ language plpgsql;

create trigger trg_enforce_recurring_task_author
  before insert on public.recurring_schedule_tasks
  for each row execute function public.enforce_recurring_task_author();

alter table public.recurring_schedule_tasks enable row level security;

create policy "recurring schedule read" on public.recurring_schedule_tasks
  for select using (auth.uid() is not null);

create policy "recurring schedule write" on public.recurring_schedule_tasks
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

grant select, insert, update, delete on public.recurring_schedule_tasks to authenticated;

-- ---------- Link daily entries to their repeating task ----------

alter table public.schedule_entries
  add column recurring_task_id uuid references public.recurring_schedule_tasks(id) on delete set null,
  add column is_override boolean not null default false,
  add column skipped boolean not null default false;

-- One generated row per task per day (NULLs don't collide, so normal
-- one-off entries are unaffected).
alter table public.schedule_entries
  add constraint schedule_entries_recurring_day_unique unique (recurring_task_id, schedule_date);

-- Generated rows are credited to whoever created the repeating task,
-- not to whoever happened to open that day first. Still derived
-- server-side, never trusted from the client.
create or replace function public.enforce_schedule_entry_author()
returns trigger as $$
begin
  if new.recurring_task_id is not null then
    select created_by into new.created_by
    from public.recurring_schedule_tasks
    where id = new.recurring_task_id;
  else
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$ language plpgsql;

-- ---------- Create the day's rows for its repeating tasks ----------

create function public.ensure_recurring_entries(p_date date)
returns void as $$
  insert into public.schedule_entries (schedule_date, entry_time, description, recurring_task_id)
  select p_date, t.entry_time, t.description, t.id
  from public.recurring_schedule_tasks t
  where t.weekday = extract(dow from p_date)
    and p_date >= t.starts_on
  on conflict (recurring_task_id, schedule_date) do nothing;
$$ language sql;

grant execute on function public.ensure_recurring_entries(date) to authenticated;

-- ---------- Series edits / deletes flow to upcoming days ----------

create function public.propagate_recurring_task_change()
returns trigger as $$
begin
  if tg_op = 'DELETE' or new.weekday <> old.weekday or new.starts_on > old.starts_on then
    -- Upcoming untouched days no longer belong to the series (or the
    -- series is gone). Removed-for-one-day markers go too. Days moved
    -- to a new weekday are re-created on demand.
    delete from public.schedule_entries
    where recurring_task_id = old.id
      and schedule_date >= current_date
      and completed = false
      and (is_override = false or skipped = true);
  else
    update public.schedule_entries
    set entry_time = new.entry_time,
        description = new.description
    where recurring_task_id = new.id
      and schedule_date >= current_date
      and completed = false
      and is_override = false;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_propagate_recurring_task_update
  after update on public.recurring_schedule_tasks
  for each row execute function public.propagate_recurring_task_change();

-- BEFORE delete, so the rows are still linked when we look for them
-- (the foreign key would otherwise null recurring_task_id first).
create trigger trg_propagate_recurring_task_delete
  before delete on public.recurring_schedule_tasks
  for each row execute function public.propagate_recurring_task_change();

notify pgrst, 'reload schema';
