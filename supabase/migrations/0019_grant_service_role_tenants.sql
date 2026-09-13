-- Same recurring gap as 0010/0018: the `tenants` table predates (or was
-- created outside) whatever migration originally granted service_role
-- blanket SELECT/etc across tables, so service-role-authenticated code
-- (webhooks, background jobs) gets silent "permission denied" on it.
-- Found while building the Payhip webhook receiver, which needs to read
-- tenants during setup/testing.
GRANT SELECT ON public.tenants TO service_role;
