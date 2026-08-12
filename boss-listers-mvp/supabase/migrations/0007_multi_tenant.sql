-- 0007_multi_tenant.sql
-- Converts Boss Listers from single-tenant (one shared "boss_lister" role)
-- to real multi-tenant SaaS: each signed-up customer gets their own tenant,
-- their own inventory, their own marketplace connections, isolated by RLS.
--
-- Safe to run on the existing "Boss listers prod" project (irslzufsqjveyibkfjtz)
-- after 0001-0006. All existing rows are backfilled into a "default" tenant
-- (Josh's own account) so nothing currently live breaks.
--
-- Apply with: npx supabase db push   (run from a machine linked to the project —
-- this file does NOT get applied automatically, by design.)

create extension if not exists pgcrypto;

-- ============================================================
-- tenants + membership
-- ============================================================
create table if not exists public.tenants (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text unique,
  plan       text not null default 'trial' check (plan in ('trial', 'starter', 'pro', 'enterprise')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists tenants_set_updated_at on public.tenants;
create trigger tenants_set_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

-- Links Supabase Auth users to the tenant(s) they belong to. A user can
-- belong to more than one tenant (e.g. a team member helping two sellers),
-- but the common case is one user -> one tenant they own.
create table if not exists public.tenant_members (
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index if not exists tenant_members_user_idx on public.tenant_members (user_id);

alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;

grant select on public.tenants to authenticated;
grant select on public.tenant_members to authenticated;

drop policy if exists "tenants_member_read" on public.tenants;
create policy "tenants_member_read"
  on public.tenants for select
  using (id in (select tenant_id from public.tenant_members where user_id = auth.uid()));

drop policy if exists "tenant_members_self_read" on public.tenant_members;
create policy "tenant_members_self_read"
  on public.tenant_members for select
  using (user_id = auth.uid());

-- Helper used throughout the RLS policies below: the set of tenant_ids the
-- calling user belongs to. STABLE + security definer so it can be indexed
-- against efficiently and isn't blocked by RLS on tenant_members itself.
create or replace function public.my_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.tenant_members where user_id = auth.uid();
$$;

revoke execute on function public.my_tenant_ids() from public, anon;
grant execute on function public.my_tenant_ids() to authenticated;

-- Bootstrap: create a tenant for a newly signed-up user and make them its
-- owner, in one call. Used by the signup flow right after auth.users insert.
create or replace function public.create_tenant_for_user(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'create_tenant_for_user: no authenticated user';
  end if;

  insert into public.tenants (name) values (p_name)
  returning id into v_tenant_id;

  insert into public.tenant_members (tenant_id, user_id, role)
  values (v_tenant_id, auth.uid(), 'owner');

  return v_tenant_id;
end;
$$;

revoke execute on function public.create_tenant_for_user(text) from public, anon;
grant execute on function public.create_tenant_for_user(text) to authenticated;

-- ============================================================
-- Backfill tenant for Josh's own existing data
-- ============================================================
insert into public.tenants (id, name, slug, plan)
values ('00000000-0000-0000-0000-000000000001', 'Empire OS (default)', 'default', 'enterprise')
on conflict (id) do nothing;

-- ============================================================
-- products: add tenant_id, backfill, rewrite RLS
-- ============================================================
alter table public.products
  add column if not exists tenant_id uuid references public.tenants (id);

update public.products set tenant_id = '00000000-0000-0000-0000-000000000001'
  where tenant_id is null;

alter table public.products alter column tenant_id set not null;
alter table public.products alter column tenant_id set default '00000000-0000-0000-0000-000000000001';

create index if not exists products_tenant_idx on public.products (tenant_id);

-- Slug uniqueness moves from global to per-tenant (two sellers can both
-- have a "vintage-jacket").
alter table public.products drop constraint if exists products_slug_key;
create unique index if not exists products_tenant_slug_idx on public.products (tenant_id, slug);

drop policy if exists "products_public_read" on public.products;
drop policy if exists "products_boss_lister_write" on public.products;

-- Public storefront reads stay open (published items are meant to be seen),
-- but now every consumer must go through storefront_products (rewritten
-- below) rather than raw products, which also carries tenant_id.
create policy "products_public_read"
  on public.products for select
  using (published = true);

create policy "products_tenant_write"
  on public.products for all
  using (tenant_id in (select public.my_tenant_ids()))
  with check (tenant_id in (select public.my_tenant_ids()));

-- ============================================================
-- marketplace_accounts / marketplace_listings / marketplace_events:
-- add tenant_id, backfill, rewrite RLS
-- ============================================================
alter table public.marketplace_accounts
  add column if not exists tenant_id uuid references public.tenants (id);
update public.marketplace_accounts set tenant_id = '00000000-0000-0000-0000-000000000001'
  where tenant_id is null;
alter table public.marketplace_accounts alter column tenant_id set not null;
alter table public.marketplace_accounts alter column tenant_id set default '00000000-0000-0000-0000-000000000001';
create index if not exists marketplace_accounts_tenant_idx on public.marketplace_accounts (tenant_id);

-- The old (marketplace, account_label, environment) unique constraint was
-- global; make it per-tenant so each tenant can connect their own eBay/
-- Poshmark/etc accounts independently.
alter table public.marketplace_accounts
  drop constraint if exists marketplace_accounts_marketplace_account_label_environment_key;
create unique index if not exists marketplace_accounts_tenant_unique_idx
  on public.marketplace_accounts (tenant_id, marketplace, account_label, environment);

alter table public.marketplace_listings
  add column if not exists tenant_id uuid references public.tenants (id);
update public.marketplace_listings ml set tenant_id = p.tenant_id
  from public.products p where ml.product_id = p.id and ml.tenant_id is null;
alter table public.marketplace_listings alter column tenant_id set not null;
create index if not exists marketplace_listings_tenant_idx on public.marketplace_listings (tenant_id);

alter table public.marketplace_events
  add column if not exists tenant_id uuid references public.tenants (id);
update public.marketplace_events me set tenant_id = p.tenant_id
  from public.products p where me.sku = p.sku and me.tenant_id is null;
update public.marketplace_events set tenant_id = '00000000-0000-0000-0000-000000000001'
  where tenant_id is null;
create index if not exists marketplace_events_tenant_idx on public.marketplace_events (tenant_id);

drop policy if exists "accounts_boss_lister_read" on public.marketplace_accounts;
create policy "accounts_tenant_read"
  on public.marketplace_accounts for select
  using (tenant_id in (select public.my_tenant_ids()));

create policy "accounts_tenant_write"
  on public.marketplace_accounts for all
  using (tenant_id in (select public.my_tenant_ids()))
  with check (tenant_id in (select public.my_tenant_ids()));

drop policy if exists "listings_boss_lister_read" on public.marketplace_listings;
drop policy if exists "listings_boss_lister_write" on public.marketplace_listings;
drop policy if exists "listings_boss_lister_update" on public.marketplace_listings;
create policy "marketplace_listings_tenant_read"
  on public.marketplace_listings for select
  using (tenant_id in (select public.my_tenant_ids()));
create policy "marketplace_listings_tenant_write"
  on public.marketplace_listings for insert
  with check (tenant_id in (select public.my_tenant_ids()));
create policy "marketplace_listings_tenant_update"
  on public.marketplace_listings for update
  using (tenant_id in (select public.my_tenant_ids()))
  with check (tenant_id in (select public.my_tenant_ids()));

-- marketplace_events stays service-role only (no anon/authenticated grant
-- existed before, none added now) — it's an internal idempotency ledger.

-- ============================================================
-- listings (boss-listers-mvp's own table from 0005): add tenant_id
-- ============================================================
alter table public.listings
  add column if not exists tenant_id uuid references public.tenants (id);
update public.listings set tenant_id = '00000000-0000-0000-0000-000000000001'
  where tenant_id is null;
create index if not exists listings_tenant_idx on public.listings (tenant_id);
create index if not exists listings_tenant_created_idx on public.listings (tenant_id, created_at desc);

-- listings stays service-role only at the DB layer (writes/reads are
-- brokered by the Worker, which now enforces tenant_id server-side —
-- see lib/tenantAuth.js). This mirrors the existing 0005 design rather
-- than opening direct authenticated access.

-- ============================================================
-- storefront_products: now tenant-scoped. The public view still shows
-- published items, but callers who want a specific tenant's storefront
-- pass ?tenant_id=eq.<id>; callers who want everything get everyone's
-- published items (this is the "browse the whole marketplace" case —
-- drop tenant_id from the select list below if that's not wanted and
-- Boss Listers should only ever show one tenant's storefront at a time).
-- ============================================================
-- CREATE OR REPLACE VIEW can't reorder existing columns (tenant_id is new
-- and going first), so drop and recreate instead.
drop view if exists public.storefront_products;
create view public.storefront_products
with (security_invoker = on) as
select
  tenant_id,
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
-- record_sale: now tenant-aware (sku alone is no longer globally unique
-- across tenants in spirit, though the physical column stays unique for
-- now since eBay listing ids are still 1:1 with Josh's own account;
-- multi-tenant eBay OAuth is a separate follow-up, not built here).
-- No signature change needed — sku lookups already resolve to one row.
-- ============================================================
