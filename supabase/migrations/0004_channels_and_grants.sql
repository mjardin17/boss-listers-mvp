-- 0004: table-privilege fix + multichannel connector support.
--
-- Part A fixes a real bug found by live verification on 2026-07-26:
-- 0001 created RLS *policies* but never issued table-level GRANTs, and
-- this Supabase project does not auto-grant anon privileges — so every
-- anon storefront read failed with 42501 "permission denied". RLS only
-- filters rows; the GRANT must exist first.
--
-- Part B extends the existing marketplace tables for the connector
-- system. Deliberately NO new channel_connections / channel_listings
-- tables: marketplace_accounts and marketplace_listings (0003) already
-- fill those roles — duplicating them would split the source of truth.

-- ============================================================
-- Part A — grants that make the RLS policies actually reachable
-- ============================================================
-- Public storefront reads (rows still filtered by RLS policies).
grant select on public.products to anon, authenticated;

-- Boss Listers dashboard writes (RLS policy products_boss_lister_write
-- still restricts to jwt app_metadata.role = 'boss_lister').
grant insert, update, delete on public.products to authenticated;

-- Dashboard read of listing mappings (RLS: boss_lister role only).
grant select on public.marketplace_listings to authenticated;

-- sync_logs / sync_state / marketplace_accounts / marketplace_events:
-- intentionally NO anon/authenticated grants — service_role only.

-- ============================================================
-- Part B — channel support
-- ============================================================

-- Manual channels + future API channels missing from the 0003 lists.
alter table public.marketplace_accounts
  drop constraint if exists marketplace_accounts_marketplace_check;
alter table public.marketplace_accounts
  add constraint marketplace_accounts_marketplace_check check (marketplace in (
    'ebay','amazon','walmart','etsy','shopify','woocommerce',
    'facebook','instagram','tiktok','pinterest',
    'poshmark','mercari','depop','vinted','offerup','craigslist'));

-- Connector metadata: how the channel connects, non-secret config,
-- sync bookkeeping. Secrets NEVER go in this table (env/Vault only).
alter table public.marketplace_accounts
  add column if not exists connection_mode text not null default 'api'
    check (connection_mode in ('api','manual','extension')),
  add column if not exists config jsonb not null default '{}'::jsonb,
  add column if not exists last_sync_at timestamptz,
  add column if not exists retry_count integer not null default 0;

-- Manual-workflow lifecycle on listings: a manually-posted Facebook/
-- Craigslist listing has a URL, posted/sold dates, and a wider status set.
alter table public.marketplace_listings
  drop constraint if exists marketplace_listings_status_check;
alter table public.marketplace_listings
  add constraint marketplace_listings_status_check check (status in (
    'draft','ready_to_post','active','posted','sold','ended','error')),
  add column if not exists listing_url text,
  add column if not exists posted_at timestamptz,
  add column if not exists sold_at timestamptz,
  add column if not exists notes text;

-- Manual listings are keyed by (product, account); listing_id arrives
-- later (or never, e.g. Facebook gives no stable public ID). Make it
-- optional; the (marketplace, listing_id) unique constraint still
-- protects real IDs because Postgres ignores NULLs in unique indexes.
alter table public.marketplace_listings
  alter column listing_id drop not null;

-- Seed the manual channels + API channels so the UI has rows to show.
insert into public.marketplace_accounts (marketplace, account_label, environment, status, connection_mode)
values
  ('facebook',   'manual', 'production', 'disconnected', 'manual'),
  ('offerup',    'manual', 'production', 'disconnected', 'manual'),
  ('craigslist', 'manual', 'production', 'disconnected', 'manual'),
  ('mercari',    'manual', 'production', 'disconnected', 'manual'),
  ('poshmark',   'manual', 'production', 'disconnected', 'manual'),
  ('etsy',       'default', 'production', 'disconnected', 'api'),
  ('shopify',    'default', 'production', 'disconnected', 'api'),
  ('woocommerce','default', 'production', 'disconnected', 'api')
on conflict (marketplace, account_label, environment) do nothing;

-- Boss Listers dashboard needs to see channel status (not secrets —
-- this table holds none) and manage manual listings.
grant select on public.marketplace_accounts to authenticated;
grant insert, update on public.marketplace_listings to authenticated;

drop policy if exists "accounts_boss_lister_read" on public.marketplace_accounts;
create policy "accounts_boss_lister_read"
  on public.marketplace_accounts for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'boss_lister');

drop policy if exists "listings_boss_lister_write" on public.marketplace_listings;
create policy "listings_boss_lister_write"
  on public.marketplace_listings for insert
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'boss_lister');

drop policy if exists "listings_boss_lister_update" on public.marketplace_listings;
create policy "listings_boss_lister_update"
  on public.marketplace_listings for update
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'boss_lister')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'boss_lister');
