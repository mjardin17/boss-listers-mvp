-- 0022_inventory_count_sync.sql
-- NOT APPLIED to the live database yet. Needs Josh's yes.
-- One shared unit count per SKU, changed only through one atomic, idempotent function.
--
-- inventory_events: an append-only ledger. (source, external_id) is unique, so the same
--   sale delivered twice (a retry, a webhook replay, two sync runs) changes the count once.
-- set_inventory_count(): locks the product row, applies the new count, records the event,
--   and never lets the count go below zero. The caller passes the count it read
--   (p_expected); if another process changed the row meanwhile the call does nothing and
--   reports applied = false, so the caller re-reads instead of overwriting a sale.

create table if not exists public.inventory_events (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  sku         text not null,
  source      text not null check (source in ('ebay', 'shopify', 'manual', 'reconcile')),
  external_id text not null,
  qty_before  integer not null,
  qty_after   integer not null check (qty_after >= 0),
  note        text,
  created_at  timestamptz not null default now(),
  unique (source, external_id)
);

create index if not exists inventory_events_tenant_sku_idx
  on public.inventory_events (tenant_id, sku, created_at desc);

alter table public.inventory_events enable row level security;
-- No policies on purpose: only the service role (which bypasses RLS) reads or writes it.
revoke all on public.inventory_events from anon, authenticated;
grant select, insert on public.inventory_events to service_role;

create or replace function public.set_inventory_count(
  p_tenant_id     uuid,
  p_sku           text,
  p_expected      integer,
  p_new           integer,
  p_source        text,
  p_external_id   text,
  p_ebay_baseline integer default null,
  p_note          text default null
) returns table (applied boolean, quantity integer, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qty    integer;
  v_status text;
begin
  if p_new is null or p_new < 0 then
    return query select false, null::integer, 'new count must be zero or more';
    return;
  end if;

  select p.quantity, p.status into v_qty, v_status
    from public.products p
   where p.tenant_id = p_tenant_id and p.sku = p_sku
     for update;

  if not found then
    return query select false, null::integer, 'no such product';
    return;
  end if;

  if exists (select 1 from public.inventory_events e where e.source = p_source and e.external_id = p_external_id) then
    return query select false, v_qty, 'already applied';
    return;
  end if;

  if v_qty is distinct from p_expected then
    return query select false, v_qty, 'count changed since it was read';
    return;
  end if;

  update public.products
     set quantity           = p_new,
         sold_quantity      = coalesce(sold_quantity, 0) + greatest(v_qty - p_new, 0),
         last_ebay_quantity = coalesce(p_ebay_baseline, last_ebay_quantity),
         status             = case
                                when v_status in ('active', 'out_of_stock') and p_new = 0 then 'out_of_stock'
                                when v_status in ('active', 'out_of_stock') and p_new > 0 then 'active'
                                else v_status
                              end,
         sync_version       = coalesce(sync_version, 0) + 1,
         updated_at         = now()
   where tenant_id = p_tenant_id and sku = p_sku;

  insert into public.inventory_events (tenant_id, sku, source, external_id, qty_before, qty_after, note)
  values (p_tenant_id, p_sku, p_source, p_external_id, v_qty, p_new, p_note);

  return query select true, p_new, null::text;
end;
$$;

revoke all on function public.set_inventory_count(uuid, text, integer, integer, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.set_inventory_count(uuid, text, integer, integer, text, text, integer, text) to service_role;

-- To undo:
--   drop function public.set_inventory_count(uuid, text, integer, integer, text, text, integer, text);
--   drop table public.inventory_events;
