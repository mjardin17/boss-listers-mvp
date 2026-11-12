-- 0024_record_sale.sql
-- One way for ANY selling site other than eBay (the store, Whatnot, a manual sale) to say
-- "N units of this SKU just sold". It lowers the one shared count at once, so the store
-- stops offering the item immediately. The automatic sync then lowers or ends the eBay
-- listing, because BossListers now holds fewer than eBay shows.
--
-- Idempotent: (source, external_id) is unique in inventory_events, so the same order
-- delivered twice lowers the count once. It never goes below zero; selling more than is
-- in stock is applied down to zero and reported as oversold.
-- It does NOT touch last_ebay_quantity: that baseline belongs to the eBay read.

alter table public.inventory_events drop constraint if exists inventory_events_source_check;
alter table public.inventory_events add constraint inventory_events_source_check
  check (source in ('ebay', 'shopify', 'manual', 'reconcile', 'store', 'whatnot'));

create or replace function public.record_sale(
  p_tenant_id   uuid,
  p_sku         text,
  p_qty         integer,
  p_source      text,
  p_external_id text,
  p_note        text default null
) returns table (applied boolean, quantity integer, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qty      integer;
  v_status   text;
  v_new      integer;
  v_oversold integer;
begin
  if p_qty is null or p_qty < 1 then
    return query select false, null::integer, 'quantity sold must be one or more';
    return;
  end if;
  if p_source not in ('store', 'whatnot', 'manual') then
    return query select false, null::integer, 'unknown selling site';
    return;
  end if;
  if p_external_id is null or length(trim(p_external_id)) = 0 then
    return query select false, null::integer, 'an order id is required';
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

  v_new      := greatest(coalesce(v_qty, 0) - p_qty, 0);
  v_oversold := greatest(p_qty - coalesce(v_qty, 0), 0);

  update public.products
     set quantity      = v_new,
         sold_quantity = coalesce(sold_quantity, 0) + (coalesce(v_qty, 0) - v_new),
         status        = case
                           when v_status in ('active', 'out_of_stock') and v_new = 0 then 'out_of_stock'
                           else v_status
                         end,
         sync_version  = coalesce(sync_version, 0) + 1,
         updated_at    = now()
   where tenant_id = p_tenant_id and sku = p_sku;

  insert into public.inventory_events (tenant_id, sku, source, external_id, qty_before, qty_after, note)
  values (p_tenant_id, p_sku, p_source, p_external_id, coalesce(v_qty, 0), v_new,
          nullif(concat_ws('; ', p_note, case when v_oversold > 0 then 'OVERSOLD by ' || v_oversold end), ''));

  return query select true, v_new, case when v_oversold > 0 then 'oversold by ' || v_oversold else null end;
end;
$$;

revoke all on function public.record_sale(uuid, text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.record_sale(uuid, text, integer, text, text, text) to service_role;

-- To undo:
--   drop function public.record_sale(uuid, text, integer, text, text, text);
--   alter table public.inventory_events drop constraint inventory_events_source_check;
--   alter table public.inventory_events add constraint inventory_events_source_check
--     check (source in ('ebay', 'shopify', 'manual', 'reconcile'));
