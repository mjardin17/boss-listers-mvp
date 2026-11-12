-- 0026_in_house_stock.sql
-- Two new facts about a product, for the in-house stock list (pages/stock.js):
--   approved_at  when Josh approved the item as ready to list (null = not approved)
--   location     where the item physically is (shelf, bin, box)
-- Nothing else changes. Shoppers cannot read either column: the anon role only holds
-- column-level SELECT on ten named columns of products, and these two are not among them.

alter table public.products add column if not exists approved_at timestamptz;
alter table public.products add column if not exists location text;

-- To undo:
--   alter table public.products drop column approved_at;
--   alter table public.products drop column location;
