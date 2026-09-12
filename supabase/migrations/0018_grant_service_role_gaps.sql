-- This project's newer tables don't inherit default service_role grants
-- the way early tables (0001-0004) did — each one needs it explicit, same
-- pattern as 0010_grant_service_role_products.sql. Discovered while
-- verifying the orders API and the eBay account-deletion webhook end to
-- end: both 500'd with "permission denied" against a real service-role
-- client despite correct RLS, because the grant itself was never issued.

-- tenant_members: looked up by pages/api/orders/* verification tooling and
-- by any future admin/service-role tenant resolution.
GRANT SELECT ON public.tenant_members TO service_role;

-- tenant_marketplace_connections: purged by
-- pages/api/channels/ebay/account-deletion.js when eBay notifies us a
-- seller closed their account — this is the one that actually matters in
-- production, since that webhook has no user session to fall back on.
GRANT SELECT, DELETE ON public.tenant_marketplace_connections TO service_role;
