create table if not exists public.aps_master_state (
  id text primary key,
  records jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.aps_master_state enable row level security;

drop policy if exists "aps master state public read" on public.aps_master_state;
create policy "aps master state public read"
  on public.aps_master_state for select
  to anon, authenticated
  using (true);

drop policy if exists "aps master state public write" on public.aps_master_state;
create policy "aps master state public write"
  on public.aps_master_state for insert
  to anon, authenticated
  with check (id = 'default');

drop policy if exists "aps master state public update" on public.aps_master_state;
create policy "aps master state public update"
  on public.aps_master_state for update
  to anon, authenticated
  using (id = 'default')
  with check (id = 'default');
