-- ============================================================
-- RuxLog Platform — Schedule (equal permissions for everyone)
--
-- Unlike every other feature so far, there is no manager-only
-- restriction here — any authenticated user can add, edit, or
-- delete any entry, matching how this was done manually before
-- (one shared day plan anyone could mark up). created_by still
-- records who added each entry (for context, not for permission
-- control), forced server-side via a trigger, never client-supplied.
-- ============================================================

create table public.schedule_entries (
  id uuid primary key default gen_random_uuid(),
  schedule_date date not null default current_date,
  entry_time time not null,
  description text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create function public.enforce_schedule_entry_author()
returns trigger as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$ language plpgsql;

create trigger trg_enforce_schedule_entry_author
  before insert on public.schedule_entries
  for each row execute function public.enforce_schedule_entry_author();

alter table public.schedule_entries enable row level security;

create policy "schedule read" on public.schedule_entries
  for select using (auth.uid() is not null);

create policy "schedule write" on public.schedule_entries
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

grant select, insert, update, delete on public.schedule_entries to authenticated;
