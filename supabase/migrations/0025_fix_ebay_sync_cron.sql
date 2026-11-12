-- 0025_fix_ebay_sync_cron.sql   (APPLIED 2026-11-12)
-- The cloud job "ebay-sync-every-15-min" had failed on every run since late September 2026.
-- Its command built an Authorization header from a vault secret named sync_service_role_key,
-- which does not exist, so the header was empty and Supabase answered 401 before the function ran.
--
-- The job now sends the project's public (anon) key. That key is not a secret: it is the one
-- every browser already receives. The function ignores any call made less than five minutes
-- after the last run, so holding the public key lets nobody do anything extra.
-- The key itself is left out of this file; read it from the Supabase dashboard (API settings).

select cron.alter_job(
  job_id  := (select jobid from cron.job where jobname = 'ebay-sync-every-15-min'),
  command := $cmd$
    select net.http_post(
      url := 'https://irslzufsqjveyibkfjtz.supabase.co/functions/v1/ebay-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <the project public anon key>'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cmd$
);

-- To stop the cloud sync:
--   select cron.alter_job((select jobid from cron.job where jobname = 'ebay-sync-every-15-min'), active := false);
