-- Grant service_role access to products table for inventory sync
GRANT SELECT ON public.products TO service_role;
GRANT UPDATE ON public.products TO service_role;
