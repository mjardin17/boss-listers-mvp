create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  anonymous_id text,
  auth_provider text not null default 'anonymous',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.scans (
  id text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  device_session_id text,
  source text not null default 'upload',
  listing jsonb not null,
  schema_version integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_items (
  id text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  device_session_id text,
  status text not null default 'Scanned',
  listing jsonb not null,
  purchase_price numeric(12, 2) not null default 0,
  sold_price numeric(12, 2) not null default 0,
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sourcing_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  session_date date not null default current_date,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, session_date)
);

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

create table if not exists public.council_consultations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_prompt text not null,
  expert_responses jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.crypto_ohlcv (
  id uuid default gen_random_uuid() primary key,
  symbol text not null,
  timeframe text not null,
  timestamp timestamp with time zone not null,
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  volume numeric not null,
  unique(symbol, timeframe, timestamp)
);

create index if not exists scans_user_created_idx on public.scans(user_id, created_at desc);
create index if not exists inventory_user_updated_idx on public.inventory_items(user_id, updated_at desc);
create index if not exists sourcing_sessions_user_date_idx on public.sourcing_sessions(user_id, session_date desc);
create index if not exists saved_keywords_user_created_idx on public.saved_keywords(user_id, created_at desc);
create index if not exists saved_keywords_user_score_idx on public.saved_keywords(user_id, magic_score desc);
create index if not exists tracked_niches_user_created_idx on public.tracked_niches(user_id, created_at desc);
create index if not exists tracked_niches_user_opportunity_idx on public.tracked_niches(user_id, opportunity_score desc);
create index if not exists council_consultations_user_created_idx on public.council_consultations(user_id, created_at desc);
create index if not exists crypto_ohlcv_symbol_timeframe_timestamp_idx on public.crypto_ohlcv(symbol, timeframe, timestamp desc);

alter table public.users enable row level security;
alter table public.scans enable row level security;
alter table public.inventory_items enable row level security;
alter table public.sourcing_sessions enable row level security;
alter table public.saved_keywords enable row level security;
alter table public.tracked_niches enable row level security;
alter table public.council_consultations enable row level security;

create policy "Users can read own profile"
  on public.users for select
  using (auth.uid() = id);

create policy "Users can upsert own profile"
  on public.users for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users can read own scans"
  on public.scans for select
  using (auth.uid() = user_id);

create policy "Users can insert own scans"
  on public.scans for insert
  with check (auth.uid() = user_id);

create policy "Users can update own scans"
  on public.scans for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read own inventory"
  on public.inventory_items for select
  using (auth.uid() = user_id);

create policy "Users can insert own inventory"
  on public.inventory_items for insert
  with check (auth.uid() = user_id);

create policy "Users can update own inventory"
  on public.inventory_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read own sourcing sessions"
  on public.sourcing_sessions for select
  using (auth.uid() = user_id);

create policy "Users can insert own sourcing sessions"
  on public.sourcing_sessions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own sourcing sessions"
  on public.sourcing_sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

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

create policy "Users can read own council consultations"
  on public.council_consultations for select
  using (auth.uid() = user_id);

create policy "Users can insert own council consultations"
  on public.council_consultations for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own council consultations"
  on public.council_consultations for delete
  using (auth.uid() = user_id);
