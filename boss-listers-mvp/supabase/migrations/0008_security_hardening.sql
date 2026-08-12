-- 0008_security_hardening.sql
-- Closes gaps found by security review of 0007_multi_tenant.sql (2026-08-12):
--
-- HIGH: commercial_jobs/subscriptions were never tenant-scoped, and once
-- 0007 turned on real auth, ANY authenticated tenant could read/write
-- ANY other tenant's commercial jobs (GET /api/commercials?jobId=<guess>
-- returned another tenant's product data with zero tenant filter, since
-- the app queries via service_role which bypasses RLS entirely).
--
-- MEDIUM: public.products still had a raw SELECT grant to anon/authenticated
-- from 0004, so anyone could bypass the sanitized storefront_products view
-- and pull full rows (tenant_id, sync_version, etc.) across every tenant.
--
-- LOW: create_tenant_for_user had no cap — one user could mint unlimited
-- tenants. marketplace_listings had no check that product_id actually
-- belongs to the listing's own tenant_id.

-- ============================================================
-- commercial_jobs / commercial_events / subscriptions: add tenant_id
-- ============================================================
alter table public.commercial_jobs
  add column if not exists tenant_id uuid references public.tenants (id);

-- Backfill via the listing each job belongs to; anything unresolvable
-- (orphaned rows, if any) goes to the default tenant rather than being
-- left null and invisible to everyone.
update public.commercial_jobs cj set tenant_id = l.tenant_id
  from public.listings l where cj.listing_id = l.id and cj.tenant_id is null;
update public.commercial_jobs set tenant_id = '00000000-0000-0000-0000-000000000001'
  where tenant_id is null;
alter table public.commercial_jobs alter column tenant_id set not null;
create index if not exists commercial_jobs_tenant_idx on public.commercial_jobs (tenant_id);

alter table public.subscriptions
  add column if not exists tenant_id uuid references public.tenants (id);
update public.subscriptions s set tenant_id = l.tenant_id
  from public.listings l where s.session_id = l.session_id and s.tenant_id is null;
update public.subscriptions set tenant_id = '00000000-0000-0000-0000-000000000001'
  where tenant_id is null;
alter table public.subscriptions alter column tenant_id set not null;
create index if not exists subscriptions_tenant_idx on public.subscriptions (tenant_id);

-- commercial_events has no session_id of its own; scope it via its job.
alter table public.commercial_events
  add column if not exists tenant_id uuid references public.tenants (id);
update public.commercial_events ce set tenant_id = cj.tenant_id
  from public.commercial_jobs cj where ce.job_id = cj.id and ce.tenant_id is null;
update public.commercial_events set tenant_id = '00000000-0000-0000-0000-000000000001'
  where tenant_id is null;
alter table public.commercial_events alter column tenant_id set not null;
create index if not exists commercial_events_tenant_idx on public.commercial_events (tenant_id);

-- Old session_id-based policies assumed a Postgres GUC
-- (current_setting('app.current_session_id')) the app never actually set —
-- meaning in practice only the `auth.role() = 'service_role'` half of each
-- policy ever mattered, i.e. RLS provided no real protection since the app
-- always connects as service_role. Drop and replace with tenant checks.
-- (These are defense-in-depth: the app-layer fix in commercials.js is what
-- actually matters, since service_role bypasses RLS regardless — but a
-- future direct-client-access path should not be unprotected.)
drop policy if exists commercial_jobs_read_own on public.commercial_jobs;
drop policy if exists commercial_jobs_write_service on public.commercial_jobs;
drop policy if exists commercial_jobs_update_service on public.commercial_jobs;
create policy commercial_jobs_tenant_read
  on public.commercial_jobs for select
  using (tenant_id in (select public.my_tenant_ids()));
create policy commercial_jobs_tenant_write
  on public.commercial_jobs for insert
  with check (tenant_id in (select public.my_tenant_ids()));
create policy commercial_jobs_tenant_update
  on public.commercial_jobs for update
  using (tenant_id in (select public.my_tenant_ids()))
  with check (tenant_id in (select public.my_tenant_ids()));

drop policy if exists subscriptions_read_own on public.subscriptions;
create policy subscriptions_tenant_read
  on public.subscriptions for select
  using (tenant_id in (select public.my_tenant_ids()));

alter table public.commercial_events enable row level security;
create policy commercial_events_tenant_read
  on public.commercial_events for select
  using (tenant_id in (select public.my_tenant_ids()));

-- No anon/authenticated GRANTs on these three tables (matches the
-- service-role-only pattern used for listings/marketplace_events) —
-- the app brokers all access through functions/api/commercials.js,
-- which now enforces tenant_id server-side (see that file's diff).

-- ============================================================
-- products: revoke the raw table grant. Public/cross-tenant reads must
-- go through storefront_products, which exposes a deliberately narrow
-- column set. products_tenant_write (0007) still covers legitimate
-- owner access for authenticated tenants.
-- ============================================================
revoke select on public.products from anon, authenticated;

-- ============================================================
-- create_tenant_for_user: cap at one tenant per user. Multi-tenant-per-
-- user (e.g. a contractor helping two sellers) can be added deliberately
-- later via an invite flow, not as an open-ended side effect of anyone
-- being able to call this RPC repeatedly.
-- ============================================================
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

  if exists (select 1 from public.tenant_members where user_id = auth.uid()) then
    raise exception 'create_tenant_for_user: user already belongs to a tenant';
  end if;

  insert into public.tenants (name) values (p_name)
  returning id into v_tenant_id;

  insert into public.tenant_members (tenant_id, user_id, role)
  values (v_tenant_id, auth.uid(), 'owner');

  return v_tenant_id;
end;
$$;

-- ============================================================
-- marketplace_listings: enforce that product_id actually belongs to the
-- listing row's own tenant_id — without this, a tenant could insert a
-- listing under their own tenant_id pointing at another tenant's product.
-- ============================================================
create or replace function public.marketplace_listings_check_product_tenant()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.products
    where id = new.product_id and tenant_id = new.tenant_id
  ) then
    raise exception 'marketplace_listings: product_id % does not belong to tenant %',
      new.product_id, new.tenant_id;
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_listings_check_product_tenant on public.marketplace_listings;
create trigger marketplace_listings_check_product_tenant
  before insert or update of product_id, tenant_id on public.marketplace_listings
  for each row
  execute function public.marketplace_listings_check_product_tenant();
