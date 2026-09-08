create extension if not exists pgcrypto;

create table if not exists public.saved_keywords (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  seed_keyword text not null,
  related_keyword text not null,
  search_volume integer not null check (search_volume between 1000 and 500000),
  competition_index numeric(4, 2) not null check (competition_index >= 0.01 and competition_index <= 1.00),
  magic_score smallint not null check (magic_score between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, seed_keyword, related_keyword)
);

create index if not exists saved_keywords_user_created_idx
  on public.saved_keywords(user_id, created_at desc);

create index if not exists saved_keywords_user_score_idx
  on public.saved_keywords(user_id, magic_score desc);

alter table public.saved_keywords enable row level security;

create policy "Users can read own saved keywords"
  on public.saved_keywords for select
  using (auth.uid() = user_id);

create policy "Users can insert own saved keywords"
  on public.saved_keywords for insert
  with check (auth.uid() = user_id);

create policy "Users can update own saved keywords"
  on public.saved_keywords for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own saved keywords"
  on public.saved_keywords for delete
  using (auth.uid() = user_id);
