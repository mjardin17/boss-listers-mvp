-- 0028_stock_alerts.sql
-- Syncr-inspired low-stock alerts, implemented on BossListers' existing tenant-scoped products.
-- This migration does not create a second inventory system or alter marketplace listing state.

alter table public.products
  add column if not exists stock_tracking_enabled boolean not null default true;

-- Digital SKUs are not physical inventory and must never generate stock alerts.
update public.products
set stock_tracking_enabled = false
where upper(sku) in (
  'BOOK-CLOCK-EBOOK',
  'BOOK-IRON-LEGENDS-EBOOK',
  'BOOK-LITTLE-ZEUS-EBOOK'
);

create table if not exists public.stock_alert_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  threshold integer not null default 2 check (threshold between 0 and 10000),
  email_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null,
  product_title text not null,
  quantity integer not null check (quantity >= 0),
  threshold integer not null check (threshold between 0 and 10000),
  status text not null default 'open' check (status in ('open', 'restocked', 'archived')),
  prev_status text check (prev_status in ('open', 'restocked')),
  is_read boolean not null default false,
  email_claimed_at timestamptz,
  email_sent_at timestamptz,
  email_error text,
  restocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stock_alerts_tenant_created_idx
  on public.stock_alerts (tenant_id, created_at desc);
create index if not exists stock_alerts_tenant_status_idx
  on public.stock_alerts (tenant_id, status, is_read);
create unique index if not exists stock_alerts_one_open_per_product_idx
  on public.stock_alerts (tenant_id, product_id)
  where status = 'open';

alter table public.stock_alert_settings enable row level security;
alter table public.stock_alerts enable row level security;
revoke all on public.stock_alert_settings from public, anon, authenticated;
revoke all on public.stock_alerts from public, anon, authenticated;
grant all on public.stock_alert_settings to service_role;
grant all on public.stock_alerts to service_role;

insert into public.stock_alert_settings (tenant_id)
select id from public.tenants
on conflict (tenant_id) do nothing;

create or replace function public.stock_alerts_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists stock_alert_settings_updated_at on public.stock_alert_settings;
create trigger stock_alert_settings_updated_at
before update on public.stock_alert_settings
for each row execute function public.stock_alerts_set_updated_at();

drop trigger if exists stock_alerts_updated_at on public.stock_alerts;
create trigger stock_alerts_updated_at
before update on public.stock_alerts
for each row execute function public.stock_alerts_set_updated_at();

create or replace function public.reconcile_stock_alert_for_product(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product record;
  v_threshold integer := 2;
  v_open_id uuid;
begin
  select id, tenant_id, sku, title, quantity, status, stock_tracking_enabled
    into v_product
  from public.products
  where id = p_product_id;

  if not found then
    return;
  end if;

  select coalesce(s.threshold, 2)
    into v_threshold
  from public.stock_alert_settings s
  where s.tenant_id = v_product.tenant_id;

  v_threshold := coalesce(v_threshold, 2);

  select id into v_open_id
  from public.stock_alerts
  where tenant_id = v_product.tenant_id
    and product_id = v_product.id
    and status = 'open'
  limit 1;

  if coalesce(v_product.stock_tracking_enabled, true)
     and v_product.status <> 'ended'
     and coalesce(v_product.quantity, 0) <= v_threshold then
    insert into public.stock_alerts (
      tenant_id, product_id, sku, product_title, quantity, threshold, status, is_read
    ) values (
      v_product.tenant_id, v_product.id, v_product.sku, v_product.title,
      greatest(coalesce(v_product.quantity, 0), 0), v_threshold, 'open', false
    )
    on conflict (tenant_id, product_id) where status = 'open'
    do update set
      sku = excluded.sku,
      product_title = excluded.product_title,
      quantity = excluded.quantity,
      threshold = excluded.threshold,
      updated_at = now();
  elsif v_open_id is not null then
    if v_product.status = 'ended' or not coalesce(v_product.stock_tracking_enabled, true) then
      update public.stock_alerts
      set status = 'archived', prev_status = 'open', is_read = true
      where id = v_open_id;
    else
      update public.stock_alerts
      set status = 'restocked', prev_status = 'open', is_read = false, restocked_at = now()
      where id = v_open_id;
    end if;
  end if;
end;
$$;

create or replace function public.refresh_stock_alerts_for_tenant(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid;
begin
  if p_tenant_id is null then
    raise exception 'tenant id is required';
  end if;
  for v_product_id in
    select id from public.products where tenant_id = p_tenant_id
  loop
    perform public.reconcile_stock_alert_for_product(v_product_id);
  end loop;
end;
$$;

create or replace function public.stock_alerts_on_product_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.reconcile_stock_alert_for_product(new.id);
  return new;
end;
$$;

drop trigger if exists products_stock_alerts_after_change on public.products;
create trigger products_stock_alerts_after_change
after insert or update of tenant_id, sku, title, quantity, status, stock_tracking_enabled
on public.products
for each row execute function public.stock_alerts_on_product_change();

-- Atomically claim email notifications so concurrent page loads cannot send the same alert twice.
create or replace function public.claim_stock_alert_emails(p_tenant_id uuid, p_limit integer default 10)
returns setof public.stock_alerts
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tenant_id is null then
    raise exception 'tenant id is required';
  end if;
  return query
  with picked as (
    select id
    from public.stock_alerts
    where tenant_id = p_tenant_id
      and status = 'open'
      and email_sent_at is null
      and (email_claimed_at is null or email_claimed_at < now() - interval '10 minutes')
    order by created_at asc
    limit least(greatest(coalesce(p_limit, 10), 1), 50)
    for update skip locked
  )
  update public.stock_alerts a
  set email_claimed_at = now(), email_error = null
  where a.id in (select id from picked)
  returning a.*;
end;
$$;

revoke all on function public.reconcile_stock_alert_for_product(uuid) from public, anon, authenticated;
revoke all on function public.refresh_stock_alerts_for_tenant(uuid) from public, anon, authenticated;
revoke all on function public.claim_stock_alert_emails(uuid, integer) from public, anon, authenticated;
grant execute on function public.refresh_stock_alerts_for_tenant(uuid) to service_role;
grant execute on function public.claim_stock_alert_emails(uuid, integer) to service_role;

-- Backfill current inventory so the inbox reflects existing low-stock items immediately.
select public.reconcile_stock_alert_for_product(id) from public.products;

-- Rollback notes:
-- drop trigger if exists products_stock_alerts_after_change on public.products;
-- drop function if exists public.stock_alerts_on_product_change();
-- drop function if exists public.claim_stock_alert_emails(uuid, integer);
-- drop function if exists public.refresh_stock_alerts_for_tenant(uuid);
-- drop function if exists public.reconcile_stock_alert_for_product(uuid);
-- drop function if exists public.stock_alerts_set_updated_at();
-- drop table if exists public.stock_alerts;
-- drop table if exists public.stock_alert_settings;
-- alter table public.products drop column if exists stock_tracking_enabled;
