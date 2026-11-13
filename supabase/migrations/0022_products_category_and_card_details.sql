-- 0022_products_category_and_card_details.sql
-- Adds category and structured trading-card details to the existing
-- public.products table used by /api/inventory. Do not merge with the
-- separate inventory store.

alter table public.products
  add column if not exists category text,
  add column if not exists card_details jsonb;

comment on column public.products.category is
  'Free-text product category (for example Trading Cards, Books, Collectibles).';

comment on column public.products.card_details is
  'Optional trading-card details: set, card_number, grade, grading_company, variant.';

create index if not exists products_category_idx
  on public.products (category);

create index if not exists products_card_details_gin_idx
  on public.products using gin (card_details);
