create table if not exists public.authors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  pen_name text not null,
  legal_name text,
  bio text not null default '',
  brand_voice text not null default '',
  website_url text,
  social_links jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, pen_name)
);

create table if not exists public.series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  author_id uuid not null references public.authors(id) on delete cascade,
  title text not null,
  subtitle text,
  description text not null default '',
  genre text not null default '',
  target_reader text not null default '',
  reading_order jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, title)
);

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  author_id uuid not null references public.authors(id) on delete restrict,
  series_id uuid references public.series(id) on delete set null,
  series_number numeric(8, 2),
  title text not null,
  subtitle text,
  language text not null default 'en',
  genre text not null default '',
  audience text not null default '',
  manuscript text not null default '',
  trim_size text not null default '6x9',
  publication_status text not null default 'draft' check (
    publication_status in ('draft', 'packaged', 'published', 'archived')
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kdp_packages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  package_status text not null default 'generated' check (
    package_status in ('generated', 'exported', 'submitted', 'archived')
  ),
  description_html text not null default '',
  description_plain text not null default '',
  author_bio text not null default '',
  categories jsonb not null default '[]'::jsonb,
  keywords jsonb not null default '[]'::jsonb,
  series_page jsonb not null default '{}'::jsonb,
  metadata_package jsonb not null default '{}'::jsonb,
  compliance_warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  book_id uuid references public.books(id) on delete cascade,
  kdp_package_id uuid references public.kdp_packages(id) on delete set null,
  export_type text not null check (export_type in ('pdf', 'epub', 'docx', 'metadata')),
  file_name text not null,
  mime_type text not null,
  byte_size integer not null default 0,
  checksum text,
  status text not null default 'generated' check (
    status in ('generated', 'failed', 'archived')
  ),
  generated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists authors_user_updated_idx on public.authors(user_id, updated_at desc);
create index if not exists series_user_author_idx on public.series(user_id, author_id);
create index if not exists books_user_author_idx on public.books(user_id, author_id, updated_at desc);
create index if not exists books_user_series_idx on public.books(user_id, series_id, series_number);
create index if not exists kdp_packages_book_created_idx on public.kdp_packages(book_id, created_at desc);
create index if not exists exports_book_generated_idx on public.exports(book_id, generated_at desc);

alter table public.authors enable row level security;
alter table public.series enable row level security;
alter table public.books enable row level security;
alter table public.kdp_packages enable row level security;
alter table public.exports enable row level security;

create policy "Users can read own authors"
  on public.authors for select
  using (auth.uid() = user_id);

create policy "Users can insert own authors"
  on public.authors for insert
  with check (auth.uid() = user_id);

create policy "Users can update own authors"
  on public.authors for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read own series"
  on public.series for select
  using (auth.uid() = user_id);

create policy "Users can insert own series"
  on public.series for insert
  with check (auth.uid() = user_id);

create policy "Users can update own series"
  on public.series for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read own books"
  on public.books for select
  using (auth.uid() = user_id);

create policy "Users can insert own books"
  on public.books for insert
  with check (auth.uid() = user_id);

create policy "Users can update own books"
  on public.books for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read own kdp packages"
  on public.kdp_packages for select
  using (auth.uid() = user_id);

create policy "Users can insert own kdp packages"
  on public.kdp_packages for insert
  with check (auth.uid() = user_id);

create policy "Users can update own kdp packages"
  on public.kdp_packages for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read own exports"
  on public.exports for select
  using (auth.uid() = user_id);

create policy "Users can insert own exports"
  on public.exports for insert
  with check (auth.uid() = user_id);
