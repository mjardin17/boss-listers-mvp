-- Multi-tenant SKUs: uniqueness must be per tenant, not global.
-- Until applied, two tenants cannot hold the same SKU (the API returns 409).
alter table public.products drop constraint if exists products_sku_key;
create unique index if not exists products_tenant_sku_idx on public.products (tenant_id, sku);
