create extension if not exists pgcrypto;

create table if not exists public.storyforge_universes (
  id text primary key,
  user_id text not null default 'anonymous',
  name text not null,
  description text not null default '',
  genre text not null default '',
  memory_summary text not null default '',
  status text not null default 'active' check (status in ('active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.storyforge_memory_worlds (
  id text primary key,
  user_id text not null default 'anonymous',
  universe_id text not null references public.storyforge_universes(id) on delete cascade,
  world_name text not null,
  history text not null default '',
  rules jsonb not null default '[]'::jsonb,
  magic_system text not null default '',
  organizations jsonb not null default '[]'::jsonb,
  timeline jsonb not null default '[]'::jsonb,
  memory_summary text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.storyforge_memory_series (
  id text primary key,
  user_id text not null default 'anonymous',
  universe_id text not null references public.storyforge_universes(id) on delete cascade,
  series_name text not null,
  book_ids jsonb not null default '[]'::jsonb,
  character_ids jsonb not null default '[]'::jsonb,
  events jsonb not null default '[]'::jsonb,
  timeline jsonb not null default '[]'::jsonb,
  memory_summary text not null default '',
  status text not null default 'active' check (status in ('active', 'complete', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.storyforge_memory_books (
  id text primary key,
  user_id text not null default 'anonymous',
  universe_id text not null references public.storyforge_universes(id) on delete cascade,
  series_id text references public.storyforge_memory_series(id) on delete set null,
  world_id text references public.storyforge_memory_worlds(id) on delete set null,
  sequence_number integer not null default 1,
  title text not null,
  premise text not null default '',
  outline jsonb not null default '[]'::jsonb,
  full_book text not null default '',
  audiobook_script text not null default '',
  video_script text not null default '',
  character_sheets jsonb not null default '[]'::jsonb,
  cover_concept text not null default '',
  chapter_art_prompts jsonb not null default '[]'::jsonb,
  thumbnail_prompt text not null default '',
  social_media_assets jsonb not null default '[]'::jsonb,
  continuity_notes jsonb not null default '[]'::jsonb,
  event_ids jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.storyforge_memory_characters (
  id text primary key,
  user_id text not null default 'anonymous',
  universe_id text not null references public.storyforge_universes(id) on delete cascade,
  series_id text references public.storyforge_memory_series(id) on delete set null,
  name text not null,
  aliases jsonb not null default '[]'::jsonb,
  role text not null default '',
  status text not null default 'active' check (status in ('active', 'dead', 'missing', 'retired', 'unknown')),
  age text not null default '',
  description text not null default '',
  personality text not null default '',
  appearance text not null default '',
  relationships text not null default '',
  backstory text not null default '',
  voice text not null default '',
  character_arc text not null default '',
  continuity_facts jsonb not null default '[]'::jsonb,
  unresolved_threads jsonb not null default '[]'::jsonb,
  first_book_id text references public.storyforge_memory_books(id) on delete set null,
  last_seen_book_id text references public.storyforge_memory_books(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.storyforge_memory_locations (
  id text primary key,
  user_id text not null default 'anonymous',
  universe_id text not null references public.storyforge_universes(id) on delete cascade,
  world_id text references public.storyforge_memory_worlds(id) on delete cascade,
  name text not null,
  location_type text not null default '',
  description text not null default '',
  rules jsonb not null default '[]'::jsonb,
  first_book_id text references public.storyforge_memory_books(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (universe_id, name)
);

create table if not exists public.storyforge_memory_lore (
  id text primary key,
  user_id text not null default 'anonymous',
  universe_id text not null references public.storyforge_universes(id) on delete cascade,
  world_id text references public.storyforge_memory_worlds(id) on delete set null,
  series_id text references public.storyforge_memory_series(id) on delete set null,
  lore_key text not null,
  lore_type text not null default 'fact',
  canon_value text not null,
  revealed_in_book_id text references public.storyforge_memory_books(id) on delete set null,
  evidence jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (universe_id, lore_key)
);

create table if not exists public.storyforge_memory_relationships (
  id text primary key,
  user_id text not null default 'anonymous',
  universe_id text not null references public.storyforge_universes(id) on delete cascade,
  source_character_id text not null references public.storyforge_memory_characters(id) on delete cascade,
  target_character_id text not null references public.storyforge_memory_characters(id) on delete cascade,
  relationship_type text not null,
  status text not null default 'active',
  description text not null default '',
  first_seen_book_id text references public.storyforge_memory_books(id) on delete set null,
  last_seen_book_id text references public.storyforge_memory_books(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (universe_id, source_character_id, target_character_id, relationship_type)
);

create table if not exists public.storyforge_memory_events (
  id text primary key,
  user_id text not null default 'anonymous',
  universe_id text not null references public.storyforge_universes(id) on delete cascade,
  series_id text references public.storyforge_memory_series(id) on delete set null,
  book_id text references public.storyforge_memory_books(id) on delete cascade,
  sequence_number integer not null default 1,
  label text not null,
  timeline_position text not null,
  event_date text not null default '',
  characters jsonb not null default '[]'::jsonb,
  locations jsonb not null default '[]'::jsonb,
  lore_refs jsonb not null default '[]'::jsonb,
  consequence text not null default '',
  canonical boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.storyforge_continuity_checks (
  id text primary key,
  user_id text not null default 'anonymous',
  universe_id text not null references public.storyforge_universes(id) on delete cascade,
  series_id text references public.storyforge_memory_series(id) on delete set null,
  book_id text references public.storyforge_memory_books(id) on delete set null,
  severity text not null check (severity in ('info', 'warning', 'error')),
  issue_type text not null,
  subject text not null,
  message text not null,
  evidence jsonb not null default '[]'::jsonb,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists sf_universes_user_updated_idx on public.storyforge_universes(user_id, updated_at desc);
create index if not exists sf_worlds_universe_idx on public.storyforge_memory_worlds(user_id, universe_id, updated_at desc);
create index if not exists sf_series_universe_idx on public.storyforge_memory_series(user_id, universe_id, updated_at desc);
create index if not exists sf_books_series_sequence_idx on public.storyforge_memory_books(user_id, series_id, sequence_number);
create index if not exists sf_books_universe_updated_idx on public.storyforge_memory_books(user_id, universe_id, updated_at desc);
create index if not exists sf_characters_universe_name_idx on public.storyforge_memory_characters(user_id, universe_id, lower(name));
create index if not exists sf_locations_universe_name_idx on public.storyforge_memory_locations(user_id, universe_id, lower(name));
create index if not exists sf_lore_universe_key_idx on public.storyforge_memory_lore(user_id, universe_id, lower(lore_key));
create index if not exists sf_relationships_universe_source_idx on public.storyforge_memory_relationships(user_id, universe_id, source_character_id);
create index if not exists sf_events_series_sequence_idx on public.storyforge_memory_events(user_id, series_id, sequence_number);
create index if not exists sf_events_universe_created_idx on public.storyforge_memory_events(user_id, universe_id, created_at desc);
create index if not exists sf_checks_universe_unresolved_idx on public.storyforge_continuity_checks(user_id, universe_id, resolved, created_at desc);

alter table public.storyforge_universes enable row level security;
alter table public.storyforge_memory_worlds enable row level security;
alter table public.storyforge_memory_series enable row level security;
alter table public.storyforge_memory_books enable row level security;
alter table public.storyforge_memory_characters enable row level security;
alter table public.storyforge_memory_locations enable row level security;
alter table public.storyforge_memory_lore enable row level security;
alter table public.storyforge_memory_relationships enable row level security;
alter table public.storyforge_memory_events enable row level security;
alter table public.storyforge_continuity_checks enable row level security;

create policy "Users can manage own storyforge universes"
  on public.storyforge_universes for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

create policy "Users can manage own storyforge worlds"
  on public.storyforge_memory_worlds for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

create policy "Users can manage own storyforge series"
  on public.storyforge_memory_series for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

create policy "Users can manage own storyforge books"
  on public.storyforge_memory_books for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

create policy "Users can manage own storyforge characters"
  on public.storyforge_memory_characters for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

create policy "Users can manage own storyforge locations"
  on public.storyforge_memory_locations for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

create policy "Users can manage own storyforge lore"
  on public.storyforge_memory_lore for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

create policy "Users can manage own storyforge relationships"
  on public.storyforge_memory_relationships for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

create policy "Users can manage own storyforge events"
  on public.storyforge_memory_events for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

create policy "Users can manage own storyforge continuity checks"
  on public.storyforge_continuity_checks for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);
