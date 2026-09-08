-- 0009_fix_storefront_view.sql
-- Fixes a real bug from 0008: revoking anon/authenticated SELECT on
-- public.products (the fix for the "raw products table bypasses the
-- sanitized view" finding) also broke storefront_products, because that
-- view was declared `security_invoker = on` — which requires the QUERYING
-- role to have direct privileges on the underlying table, not just on the
-- view. Verified live: after 0008, GET /rest/v1/storefront_products as
-- anon returned 42501 permission denied on public.products.
--
-- Fix: drop security_invoker. A plain view runs with its owner's table
-- privileges (the migration-runner role, which has full access), while
-- still applying its own `where published = true` filter as the actual
-- safety boundary — the standard "public view over a private table"
-- pattern. This is also how storefront_products originally worked in
-- 0003, before 0004 additionally opened a raw anon grant on products that
-- made security_invoker appear to work — that raw grant was itself the
-- bug 0008 correctly closed.

drop view if exists public.storefront_products;

create view public.storefront_products as
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
