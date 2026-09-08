-- Schedules the ebay-sync Edge Function every 15 minutes via pg_cron + pg_net.
-- Both extensions are free on every Supabase plan (including the free tier).
--
-- BEFORE running this migration, store two secrets in Supabase Vault
-- (Dashboard -> Project Settings -> Vault, or `supabase secrets` won't
-- work here — Vault is separate from Edge Function secrets):
--   1. name: sync_service_role_key   value: <your project's service_role key>
--   2. name: sync_trigger_secret     value: <a random string you generate>
-- The same sync_trigger_secret value must also be set as the Edge
-- Function secret SYNC_TRIGGER_SECRET (`supabase secrets set`), so the
-- function can verify the call actually came from pg_cron.
--
-- Project ref already filled in: irslzufsqjveyibkfjtz ("Boss listers prod",
-- key/ref pair verified live 2026-07-26). See inventory-sync/DEPLOY.md.

select cron.schedule(
  'ebay-sync-every-15-min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://irslzufsqjveyibkfjtz.supabase.co/functions/v1/ebay-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'sync_service_role_key'
      ),
      'x-sync-trigger-secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'sync_trigger_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Useful when rotating secrets or pausing the sync without redeploying:
--   select cron.unschedule('ebay-sync-every-15-min');
