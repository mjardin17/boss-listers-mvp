-- Inventory capture: what the seller paid, and every photo of the item.
-- Additive only; existing rows keep working (both columns nullable).
alter table public.products add column if not exists cost numeric;
alter table public.products add column if not exists image_urls text[];
