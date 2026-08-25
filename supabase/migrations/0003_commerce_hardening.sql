-- Commerce hardening: marketplace mappings, idempotent sale events,
-- oversell prevention, optimistic locking, storefront publishing control.
-- Extends 0001_init_inventory.sql. Safe to run on a database that already
-- has 0001 applied; also safe on a fresh database run in order 0001→0002→0003.

-- ============================================================
-- products: storefront + sync bookkeeping columns
-- ============================================================
alter table public.products
  add column if not exists slug            text unique,
  add column if not exists published       boolean not null default true,
  add column if not exists sold_quantity   integer not null default 0 check (sold_quantity >= 0),
  add column if not exists reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  add column if not exists sync_version    integer not null default 1;

-- Auto-generate a URL slug from the title + short sku suffix when absent.
create or replace function public.products_ensure_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := trim(both '-' from regexp_replace(lower(new.title), '[^a-z0-9]+', '-', 'g'))
                || '-' || lower(right(regexp_replace(new.sku, '[^a-zA-Z0-9]', '', 'g'), 6));
  end if;
  return new;
end;
$$;

drop trigger if exists products_ensure_slug on public.products;
create trigger products_ensure_slug
  before insert or update of title, sku, slug on public.products
  for each row
  execute function public.products_ensure_slug();

-- Optimistic locking: every UPDATE bumps sync_version. Writers that care
-- about staleness read sync_version first and include
--   where sku = $1 and sync_version = $expected
-- in their UPDATE; zero rows affected = stale write, refetch and retry.
create or replace function public.products_bump_sync_version()
returns trigger
language plpgsql
as $$
begin
  new.sync_version := old.sync_version + 1;
  return new;
end;
$$;

drop trigger if exists products_bump_sync_version on public.products;
create trigger products_bump_sync_version
  before update on public.products
  for each row
  execute function public.products_bump_sync_version();

-- Backfill slugs for any pre-existing rows.
update public.products set slug = null where slug is null;

-- ============================================================
-- marketplace_accounts — one row per connected marketplace account.
-- NO tokens/credentials in this table: eBay tokens live in Edge Function
-- secrets, future providers likewise. This table is connection *metadata*.
-- ============================================================
create table if not exists public.marketplace_accounts (
  id            uuid primary key default gen_random_uuid(),
  marketplace   text not null check (marketplace in (
                  'ebay','amazon','walmart','etsy','shopify','facebook',
                  'instagram','tiktok','poshmark','mercari','depop','vinted','pinterest')),
  account_label text not null default 'default',
  environment   text not null default 'production' check (environment in ('production','sandbox')),
  status        text not null default 'disconnected'
                   check (status in ('connected','disconnected','error','paused')),
  last_ok_at    timestamptz,
  last_error    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (marketplace, account_label, environment)
);

drop trigger if exists marketplace_accounts_set_updated_at on public.marketplace_accounts;
create trigger marketplace_accounts_set_updated_at
  before update on public.marketplace_accounts
  for each row execute function public.set_updated_at();

-- Seed the eBay production account row so sync code can reference it.
insert into public.marketplace_accounts (marketplace, account_label, environment)
values ('ebay', 'default', 'production')
on conflict (marketplace, account_label, environment) do nothing;

-- ============================================================
-- marketplace_listings — canonical product↔marketplace listing mapping.
-- Supersedes products.ebay_listing_id (kept for back-compat; ebay-sync
-- writes both until the column is retired).
-- ============================================================
create table if not exists public.marketplace_listings (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products (id) on delete cascade,
  account_id       uuid not null references public.marketplace_accounts (id) on delete cascade,
  marketplace      text not null,
  listing_id       text not null,
  status           text not null default 'active'
                     check (status in ('active','ended','draft','error')),
  listed_price     numeric(10,2),
  listed_quantity  integer,
  last_synced_at   timestamptz,
  sync_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (marketplace, listing_id),          -- a listing belongs to one product
  unique (product_id, account_id)            -- one listing per product per account
);

create index if not exists marketplace_listings_product_idx
  on public.marketplace_listings (product_id);

drop trigger if exists marketplace_listings_set_updated_at on public.marketplace_listings;
create trigger marketplace_listings_set_updated_at
  before update on public.marketplace_listings
  for each row execute function public.set_updated_at();

-- ============================================================
-- marketplace_events — idempotency ledger for inbound events (sales,
-- cancellations). event_key is the dedupe key: e.g. 'ebay:order:1234-5678'.
-- ============================================================
create table if not exists public.marketplace_events (
  id           bigint generated always as identity primary key,
  event_key    text not null unique,
  marketplace  text not null,
  event_type   text not null check (event_type in ('sale','cancellation','return','adjustment')),
  sku          text,
  quantity     integer,
  payload      jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at   timestamptz not null default now()
);

-- ============================================================
-- record_sale — the ONLY sanctioned way to decrement inventory on a sale.
--   * Idempotent: same event_key never decrements twice.
--   * Oversell-safe: quantity can never go below zero.
-- Returns: 'applied' | 'duplicate' | 'insufficient_stock' | 'unknown_sku'
-- SECURITY DEFINER + execute revoked from anon/authenticated: callable
-- only by service_role (Edge Functions / server-side).
-- ============================================================
create or replace function public.record_sale(
  p_event_key   text,
  p_marketplace text,
  p_sku         text,
  p_quantity    integer default 1
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted boolean;
  v_updated  integer;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'record_sale: quantity must be >= 1';
  end if;

  -- Idempotency gate: first writer wins, replays exit as 'duplicate'.
  insert into public.marketplace_events (event_key, marketplace, event_type, sku, quantity)
  values (p_event_key, p_marketplace, 'sale', p_sku, p_quantity)
  on conflict (event_key) do nothing;
  get diagnostics v_updated = row_count;
  v_inserted := v_updated > 0;

  if not v_inserted then
    return 'duplicate';
  end if;

  -- Oversell guard lives in the WHERE clause: no row updated = not enough stock.
  update public.products
     set quantity      = quantity - p_quantity,
         sold_quantity = sold_quantity + p_quantity,
         status        = case when quantity - p_quantity = 0
                              then 'out_of_stock' else status end
   where sku = p_sku
     and quantity >= p_quantity;
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    if exists (select 1 from public.products where sku = p_sku) then
      update public.marketplace_events
         set processed_at = now(),
             payload = payload || '{"result":"insufficient_stock"}'::jsonb
       where event_key = p_event_key;
      return 'insufficient_stock';
    end if;
    update public.marketplace_events
       set processed_at = now(),
           payload = payload || '{"result":"unknown_sku"}'::jsonb
     where event_key = p_event_key;
    return 'unknown_sku';
  end if;

  update public.marketplace_events
     set processed_at = now(),
         payload = payload || '{"result":"applied"}'::jsonb
   where event_key = p_event_key;
  return 'applied';
end;
$$;

revoke execute on function public.record_sale(text, text, text, integer) from public;
revoke execute on function public.record_sale(text, text, text, integer) from anon;
revoke execute on function public.record_sale(text, text, text, integer) from authenticated;

-- ============================================================
-- storefront_products — public-safe view. The website reads THIS (via
-- the Pages Functions), never raw products. Excludes sync bookkeeping.
-- security_invoker: runs with the caller's rights, so anon access flows
-- through the existing products_public_read RLS policy.
-- ============================================================
create or replace view public.storefront_products
with (security_invoker = on) as
select
  slug,
  sku,
  title,
  description,
  price,
  quantity,
  image_url,
  condition,
  status,
  ebay_listing_id,
  updated_at
from public.products
where published = true
  and status in ('active', 'out_of_stock');

grant select on public.storefront_products to anon;
grant select on public.storefront_products to authenticated;

-- ============================================================
-- RLS for the new tables: service-role only (no public policies).
-- boss_lister-role users may read marketplace_listings for the dashboard.
-- ============================================================
alter table public.marketplace_accounts enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.marketplace_events   enable row level security;

drop policy if exists "listings_boss_lister_read" on public.marketplace_listings;
create policy "listings_boss_lister_read"
  on public.marketplace_listings for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'boss_lister');
