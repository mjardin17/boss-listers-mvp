-- Each product's shipping price, read from eBay by the ebay-sync function (GetItem ShippingDetails).
-- shipping_type: flat | free | calculated | none. shipping_cost: USD, null when there is no fixed price.
-- Only adds two empty columns; nothing existing changes.
alter table public.products add column if not exists shipping_cost numeric(10, 2);
alter table public.products add column if not exists shipping_type text;
alter table public.products drop constraint if exists products_shipping_type_check;
alter table public.products add constraint products_shipping_type_check
  check (shipping_type is null or shipping_type in ('flat', 'free', 'calculated', 'none'));
alter table public.products drop constraint if exists products_shipping_cost_check;
alter table public.products add constraint products_shipping_cost_check
  check (shipping_cost is null or shipping_cost >= 0);
