create extension if not exists pgcrypto;

create table if not exists public.tracked_niches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  niche_name text not null,
  category text not null,
  avg_cpm numeric(6, 2) not null check (avg_cpm >= 0),
  market_demand_score integer not null check (market_demand_score between 1 and 100),
  competition_level text not null check (competition_level in ('Low', 'Medium', 'High')),
  opportunity_score integer not null check (opportunity_score between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, niche_name, category)
);

create index if not exists tracked_niches_user_created_idx
  on public.tracked_niches(user_id, created_at desc);

create index if not exists tracked_niches_user_opportunity_idx
  on public.tracked_niches(user_id, opportunity_score desc);

alter table public.tracked_niches enable row level security;

create policy "Users can read own tracked niches"
  on public.tracked_niches for select
  using (auth.uid() = user_id);

create policy "Users can insert own tracked niches"
  on public.tracked_niches for insert
  with check (auth.uid() = user_id);

create policy "Users can update own tracked niches"
  on public.tracked_niches for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own tracked niches"
  on public.tracked_niches for delete
  using (auth.uid() = user_id);
