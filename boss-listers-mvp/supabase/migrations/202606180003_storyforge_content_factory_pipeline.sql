create extension if not exists pgcrypto;

create table if not exists public.storyforge_factory_runs (
  id text primary key,
  user_id text not null default 'anonymous',
  universe_id text references public.storyforge_universes(id) on delete set null,
  series_id text references public.storyforge_memory_series(id) on delete set null,
  book_id text references public.storyforge_memory_books(id) on delete set null,
  story_idea text not null,
  title text not null default '',
  status text not null default 'completed' check (status in ('queued', 'running', 'completed', 'failed')),
  stage_status jsonb not null default '{}'::jsonb,
  package_summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.storyforge_factory_artifacts (
  id text primary key,
  user_id text not null default 'anonymous',
  run_id text not null references public.storyforge_factory_runs(id) on delete cascade,
  universe_id text references public.storyforge_universes(id) on delete set null,
  book_id text references public.storyforge_memory_books(id) on delete set null,
  artifact_type text not null,
  title text not null,
  content_text text not null default '',
  content_json jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.storyforge_factory_exports (
  id text primary key,
  user_id text not null default 'anonymous',
  run_id text not null references public.storyforge_factory_runs(id) on delete cascade,
  export_type text not null check (export_type in ('json', 'markdown', 'kdp_metadata', 'pdf', 'epub', 'docx')),
  file_name text not null,
  mime_type text not null,
  byte_size integer not null default 0,
  checksum text,
  generated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists sf_factory_runs_user_updated_idx on public.storyforge_factory_runs(user_id, updated_at desc);
create index if not exists sf_factory_runs_universe_idx on public.storyforge_factory_runs(user_id, universe_id, updated_at desc);
create index if not exists sf_factory_artifacts_run_idx on public.storyforge_factory_artifacts(run_id, sort_order);
create index if not exists sf_factory_artifacts_type_idx on public.storyforge_factory_artifacts(user_id, artifact_type, updated_at desc);
create index if not exists sf_factory_exports_run_idx on public.storyforge_factory_exports(run_id, generated_at desc);

alter table public.storyforge_factory_runs enable row level security;
alter table public.storyforge_factory_artifacts enable row level security;
alter table public.storyforge_factory_exports enable row level security;

create policy "Users can manage own storyforge factory runs"
  on public.storyforge_factory_runs for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

create policy "Users can manage own storyforge factory artifacts"
  on public.storyforge_factory_artifacts for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

create policy "Users can manage own storyforge factory exports"
  on public.storyforge_factory_exports for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);
