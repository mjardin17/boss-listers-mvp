-- 0023_storefront_view_owner_only.sql
-- NOT APPLIED to the live database yet. Needs Josh's yes.
-- Replaces the public storefront view (from 0009) with a tighter one for the Lovable store.
--
-- Why a DROP first: the old view's columns are (tenant_id, slug, sku, ...). Postgres refuses
-- "create or replace view" when the column list changes, so the Downloads draft
-- (storefront_products_view-DRAFT.sql) fails as written. Nothing in this repo reads the old view.
--
-- What changes for a shopper: only the owner tenant, only items that are active, published,
-- priced, photographed and in stock. tenant_id is no longer shown.

begin;

drop view if exists public.storefront_products;

create view public.storefront_products
with (security_barrier = true) as
select
  p.id,
  p.slug,
  p.title,
  p.description,
  p.price,
  p.image_url,
  p.condition,
  greatest(p.quantity - coalesce(p.reserved_quantity, 0), 0) as available,
  p.ebay_listing_id,          -- "Buy on eBay" links to https://www.ebay.com/itm/<id>
  p.updated_at
from public.products p
where p.tenant_id = 'f6ec6132-2cd0-4352-81e9-3c76d955b60d'   -- owner tenant (Jardins Outpost)
  and p.status = 'active'
  and coalesce(p.published, false) = true
  and p.price > 0
  and p.image_url is not null
  and (p.quantity - coalesce(p.reserved_quantity, 0)) > 0;

-- Supabase grants anon and authenticated every privilege on new objects by default;
-- "revoke ... from public" does not remove those, so name the roles.
revoke all on public.storefront_products from public, anon, authenticated;
grant select on public.storefront_products to anon, authenticated;

commit;

-- To undo: run supabase/migrations/0009_fix_storefront_view.sql again.
