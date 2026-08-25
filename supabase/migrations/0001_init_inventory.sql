-- Empire OS live inventory: eBay -> Supabase -> website/Boss Listers
-- Schema-first migration. Run via `supabase db push` or the SQL editor.

create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ============================================================
-- products
-- ============================================================
-- One row per SKU. `source` distinguishes items eBay owns (synced
-- from the Inventory API every 15 min) from items Boss Listers
-- creates locally before they've ever been listed on eBay.
create table if not exists public.products (
  id                uuid primary key default gen_random_uuid(),
  sku               text not null unique,
  title             text not null,
  description       text,
  price             numeric(10, 2) not null check (price >= 0),
  quantity          integer not null default 0 check (quantity >= 0),
  image_url         text,
  condition         text,
  status            text not null default 'active'
                       check (status in ('active', 'ended', 'draft', 'out_of_stock')),
  source            text not null default 'manual'
                       check (source in ('ebay', 'manual')),
  ebay_listing_id   text unique,
  ebay_category_id  text,
  last_ebay_price   numeric(10, 2),
  last_ebay_quantity integer,
  synced_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists products_status_idx on public.products (status);
create index if not exists products_ebay_listing_id_idx on public.products (ebay_listing_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row
  execute function public.set_updated_at();

-- Storefront reads live rows over Supabase Realtime.
alter publication supabase_realtime add table public.products;

-- ============================================================
-- sync_logs — one row per ebay-sync Edge Function invocation
-- ============================================================
create table if not exists public.sync_logs (
  id               bigint generated always as identity primary key,
  run_id           uuid not null default gen_random_uuid(),
  started_at       timestamptz not null,
  finished_at      timestamptz,
  status           text not null check (status in ('success', 'partial', 'failed')),
  items_seen       integer not null default 0,
  items_upserted   integer not null default 0,
  conflicts        jsonb not null default '[]'::jsonb,
  errors           jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists sync_logs_started_at_idx on public.sync_logs (started_at desc);

-- ============================================================
-- sync_state — single-row circuit breaker state for the eBay poll
-- ============================================================
create table if not exists public.sync_state (
  id                    boolean primary key default true check (id),
  consecutive_failures  integer not null default 0,
  opened_until          timestamptz,
  last_success_at       timestamptz,
  updated_at            timestamptz not null default now()
);

insert into public.sync_state (id) values (true)
  on conflict (id) do nothing;

drop trigger if exists sync_state_set_updated_at on public.sync_state;
create trigger sync_state_set_updated_at
  before update on public.sync_state
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.products enable row level security;
alter table public.sync_logs enable row level security;
alter table public.sync_state enable row level security;

-- Storefront + Boss Listers dashboard: anyone (anon key) can read products.
drop policy if exists "products_public_read" on public.products;
create policy "products_public_read"
  on public.products for select
  using (true);

-- Writes are restricted to authenticated Boss Listers users (via the
-- `boss_lister` app_metadata role) and the service role (used by the
-- ebay-sync Edge Function, which bypasses RLS automatically). Anonymous
-- storefront visitors cannot write.
drop policy if exists "products_boss_lister_write" on public.products;
create policy "products_boss_lister_write"
  on public.products for all
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'boss_lister'
  )
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'boss_lister'
  );

-- sync_logs / sync_state: service role only. No public policies are
-- created, so PostgREST denies all anon/authenticated access by default.
