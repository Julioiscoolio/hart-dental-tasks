-- Run this ONCE in your Supabase SQL Editor
-- Dashboard → SQL Editor → New query → paste this → Run

create table if not exists dental_tasks (
  id text primary key,
  payload jsonb not null,
  created_at timestamptz default now()
);

create table if not exists dental_recurring (
  id text primary key,
  payload jsonb not null,
  created_at timestamptz default now()
);

-- Enable real-time on both tables
alter publication supabase_realtime add table dental_tasks;
alter publication supabase_realtime add table dental_recurring;

-- Allow anonymous reads and writes (the app handles auth via profile selection)
create policy "Allow all" on dental_tasks for all using (true) with check (true);
create policy "Allow all" on dental_recurring for all using (true) with check (true);

alter table dental_tasks enable row level security;
alter table dental_recurring enable row level security;
