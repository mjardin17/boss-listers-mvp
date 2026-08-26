-- ================================================================
-- Boss Listers: Complete Database Schema
-- Deploy via: supabase db push
-- ================================================================

-- ─────────────────────────────────────────────────────────────
-- 1. OAUTH & CREDENTIALS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS oauth_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform varchar NOT NULL CHECK (platform IN (
    'instagram', 'tiktok', 'youtube', 'facebook',
    'twitter', 'linkedin', 'snapchat', 'pinterest'
  )),

  -- Encrypted fields: access_token_encrypted contains ciphertext
  -- access_token_iv and access_token_auth_tag support AES-256-GCM decryption
  access_token_encrypted text NOT NULL,
  access_token_iv text NOT NULL,
  access_token_auth_tag text NOT NULL,

  -- Refresh token (nullable for platforms that don't support refresh)
  refresh_token_encrypted text,
  refresh_token_iv text,
  refresh_token_auth_tag text,

  expires_at timestamp,
  scope text,
  platform_user_id varchar,
  platform_username varchar,
  status varchar NOT NULL DEFAULT 'connected' CHECK (
    status IN ('connected', 'expired', 'revoked', 'error')
  ),
  error_message text,
  last_test_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),

  UNIQUE(user_id, platform),
  INDEX idx_user_status (user_id, status),
  INDEX idx_expires_at (expires_at)
);

COMMENT ON TABLE oauth_credentials IS
  'Encrypted OAuth tokens per user per platform. Access tokens cached in Redis; refresh tokens encrypted in DB.';

-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS oauth_pending_states (
  state varchar PRIMARY KEY,
  nonce text NOT NULL,
  platform varchar NOT NULL CHECK (platform IN (
    'instagram', 'tiktok', 'youtube', 'facebook',
    'twitter', 'linkedin', 'snapchat', 'pinterest'
  )),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  expires_at timestamp NOT NULL,
  redirect_uri text,

  INDEX idx_expires (expires_at),
  INDEX idx_user_created (user_id, created_at)
);

COMMENT ON TABLE oauth_pending_states IS
  'CSRF protection: state expires after 5 minutes, used exactly once during callback.';

-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS oauth_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  platform varchar,
  action varchar NOT NULL CHECK (action IN (
    'token_used', 'token_refreshed', 'revoked', 'test_failed', 'access_requested'
  )),
  status varchar NOT NULL CHECK (status IN ('success', 'failure')),
  error_message text,
  ip_address inet,
  user_agent text,
  created_at timestamp NOT NULL DEFAULT now(),

  INDEX idx_user_created (user_id, created_at DESC)
);

COMMENT ON TABLE oauth_audit_log IS
  'All credential access logged for compliance (SOC2, GDPR).';

-- ─────────────────────────────────────────────────────────────
-- 2. WORKFLOW EXECUTION & JOBS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workflow_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_id uuid,
  photo_url text,
  photo_size_bytes int,
  status varchar NOT NULL DEFAULT 'in_progress' CHECK (
    status IN ('in_progress', 'completed', 'failed', 'partial')
  ),
  extraction_job_id uuid,

  -- JSON summary: { marketplaces_published, marketplaces_failed, social_posted, social_failed, video_url }
  summary jsonb,

  created_at timestamp NOT NULL DEFAULT now(),
  completed_at timestamp,

  INDEX idx_user_created (user_id, created_at DESC),
  INDEX idx_status (status)
);

COMMENT ON TABLE workflow_executions IS
  'Top-level workflow: groups all jobs from a single photo upload.
   Tracks overall status and summary results.';

-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workflow_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  type varchar NOT NULL CHECK (type IN (
    'photo_extraction', 'marketplace_publish', 'commercial_generation', 'social_media_post'
  )),
  status varchar NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'processing', 'completed', 'failed', 'retrying')
  ),
  priority varchar NOT NULL DEFAULT 'normal' CHECK (
    priority IN ('high', 'normal', 'low')
  ),

  -- Job input payload (platform, photo_id, extraction_data, etc)
  payload jsonb NOT NULL,

  -- Job output result (listing_url, post_id, video_url, etc)
  result jsonb,

  error text,
  attempt_count int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,

  created_at timestamp NOT NULL DEFAULT now(),
  started_at timestamp,
  completed_at timestamp,
  next_retry_at timestamp,

  -- Foreign key to dependency job (e.g., extraction job must complete before marketplace jobs)
  depends_on uuid REFERENCES workflow_jobs(id),

  INDEX idx_status_priority (status, priority, created_at),
  INDEX idx_depends_on (depends_on),
  INDEX idx_workflow (workflow_id),
  INDEX idx_next_retry (next_retry_at) WHERE status = 'retrying'
);

COMMENT ON TABLE workflow_jobs IS
  'Individual jobs in a workflow: extraction, marketplace publishing, commercial generation, social media posts.
   Supports dependency resolution via depends_on foreign key.
   Polling query: SELECT * FROM workflow_jobs WHERE status IN ("queued", "retrying")
     AND (depends_on IS NULL OR depends_on IN (SELECT id FROM workflow_jobs WHERE status = "completed"))
     ORDER BY priority DESC, created_at ASC LIMIT 10';

-- ─────────────────────────────────────────────────────────────
-- 3. SOCIAL MEDIA POSTS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS social_media_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES workflow_jobs(id),
  platform varchar NOT NULL CHECK (platform IN (
    'instagram', 'tiktok', 'youtube', 'facebook',
    'twitter', 'linkedin', 'snapchat', 'pinterest'
  )),

  post_id varchar,
  post_url text,
  video_url text NOT NULL,
  caption text,

  status varchar NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'published', 'failed')
  ),
  error_message text,

  published_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),

  INDEX idx_user_platform (user_id, platform),
  INDEX idx_published (published_at DESC),
  INDEX idx_status (status)
);

COMMENT ON TABLE social_media_posts IS
  'Individual social media posts: one per platform per workflow.
   Joined with workflow_jobs for orchestration.';

-- ─────────────────────────────────────────────────────────────
-- 4. DEAD-LETTER QUEUE
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform varchar NOT NULL,
  video_url text NOT NULL,
  caption text,
  metadata jsonb,

  error text,
  error_code varchar,

  attempt_count int NOT NULL DEFAULT 1,
  max_attempts int NOT NULL DEFAULT 5,

  last_attempted_at timestamp,
  next_retry_at timestamp,

  status varchar NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'retrying', 'abandoned', 'resolved')
  ),

  created_at timestamp NOT NULL DEFAULT now(),

  INDEX idx_status_next_retry (status, next_retry_at),
  INDEX idx_user_created (user_id, created_at DESC)
);

COMMENT ON TABLE dead_letter_queue IS
  'Failed social media posts queued for manual intervention + automatic retry.
   Processed every 30 minutes; exponential backoff retry strategy.
   Users can view/resolve via dashboard.';

-- ─────────────────────────────────────────────────────────────
-- 5. MARKETPLACE LISTINGS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES workflow_jobs(id),
  platform varchar NOT NULL,

  listing_id varchar,
  listing_url text,

  sku text,
  title text,
  description text,
  price_cents int,
  quantity int,

  status varchar NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'published', 'delisted', 'failed')
  ),
  error_message text,

  published_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),

  UNIQUE(platform, listing_id),
  INDEX idx_user_platform_status (user_id, platform, status),
  INDEX idx_published (published_at DESC)
);

COMMENT ON TABLE marketplace_listings IS
  'Marketplace listings: one per platform per workflow.
   27 platforms total. Tracks cross-listing status.';

-- ─────────────────────────────────────────────────────────────
-- 6. COMMERCIAL VIDEOS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS commercial_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES workflow_jobs(id),

  remotion_project_id varchar,
  video_url text NOT NULL,
  duration_seconds int,

  format varchar CHECK (format IN ('9:16', '16:9', '1:1')),
  file_size_bytes int,

  created_at timestamp NOT NULL DEFAULT now(),

  INDEX idx_user_created (user_id, created_at DESC)
);

COMMENT ON TABLE commercial_videos IS
  'Rendered commercials: generated via Remotion from product data.
   Video URL points to S3 or Supabase storage.';

-- ─────────────────────────────────────────────────────────────
-- 7. ROW-LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE oauth_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_media_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_jobs ENABLE ROW LEVEL SECURITY;

-- Users can only see/modify their own data
CREATE POLICY users_oauth_credentials_isolation
  ON oauth_credentials
  FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY users_social_posts_isolation
  ON social_media_posts
  FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY users_marketplace_listings_isolation
  ON marketplace_listings
  FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY users_commercial_videos_isolation
  ON commercial_videos
  FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY users_workflow_executions_isolation
  ON workflow_executions
  FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY users_workflow_jobs_isolation
  ON workflow_jobs
  FOR ALL
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 8. CLEANUP JOBS (Supabase pg_cron)
-- ─────────────────────────────────────────────────────────────

-- Remove expired OAuth states (cleanup every hour)
-- SELECT cron.schedule('cleanup-oauth-states', '0 * * * *',
--   'DELETE FROM oauth_pending_states WHERE expires_at < NOW()');

-- Test all connected OAuth credentials (daily)
-- SELECT cron.schedule('test-oauth-credentials', '0 2 * * *',
--   'SELECT test_all_oauth_credentials()');

-- Process dead-letter queue (every 30 minutes)
-- SELECT cron.schedule('process-dlq', '*/30 * * * *',
--   'SELECT process_dead_letter_queue()');

-- ─────────────────────────────────────────────────────────────
-- 9. HELPER FUNCTIONS
-- ─────────────────────────────────────────────────────────────

-- Test all user's OAuth credentials
CREATE OR REPLACE FUNCTION test_all_oauth_credentials()
RETURNS void AS $$
DECLARE
  cred oauth_credentials%rowtype;
BEGIN
  FOR cred IN
    SELECT * FROM oauth_credentials
    WHERE status = 'connected'
      AND (last_test_at IS NULL OR last_test_at < NOW() - INTERVAL '24 hours')
  LOOP
    -- Call platform-specific test endpoint (implementation in backend)
    -- If test fails, update status to 'expired' or 'error'
    -- For now, just update last_test_at
    UPDATE oauth_credentials
    SET last_test_at = NOW()
    WHERE id = cred.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Process dead-letter queue (called by pg_cron)
CREATE OR REPLACE FUNCTION process_dead_letter_queue()
RETURNS void AS $$
BEGIN
  -- Mark items ready for retry
  UPDATE dead_letter_queue
  SET status = 'retrying'
  WHERE status = 'pending'
    AND next_retry_at < NOW();

  -- Backend will pick these up via polling
END;
$$ LANGUAGE plpgsql;

-- Count pending jobs for a workflow
CREATE OR REPLACE FUNCTION count_pending_jobs(p_workflow_id uuid)
RETURNS int AS $$
  SELECT COUNT(*)::int
  FROM workflow_jobs
  WHERE workflow_id = p_workflow_id
    AND status NOT IN ('completed', 'failed');
$$ LANGUAGE sql STABLE;

-- ─────────────────────────────────────────────────────────────
-- 10. INDEXES FOR PERFORMANCE
-- ─────────────────────────────────────────────────────────────

-- Frequently queried: workflow polling
CREATE INDEX idx_workflow_jobs_poll ON workflow_jobs(
  status, priority, created_at
) WHERE status IN ('queued', 'retrying');

-- User activity timelines
CREATE INDEX idx_oauth_creds_user_created ON oauth_credentials(user_id, created_at DESC);
CREATE INDEX idx_workflow_exec_user_created ON workflow_executions(user_id, created_at DESC);

-- Platform-specific queries
CREATE INDEX idx_social_posts_platform ON social_media_posts(user_id, platform, created_at DESC);
CREATE INDEX idx_marketplace_listings_platform ON marketplace_listings(user_id, platform, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 11. MATERIALIZED VIEWS (Optional: for analytics dashboards)
-- ─────────────────────────────────────────────────────────────

-- Summary of each user's connected platforms
CREATE MATERIALIZED VIEW IF NOT EXISTS user_oauth_status AS
  SELECT
    user_id,
    COUNT(*) as total_platforms,
    SUM(CASE WHEN status = 'connected' THEN 1 ELSE 0 END) as connected_platforms,
    STRING_AGG(DISTINCT platform, ', ' ORDER BY platform) FILTER (WHERE status = 'connected') as connected_list,
    MAX(last_test_at) as last_health_check
  FROM oauth_credentials
  GROUP BY user_id;

-- Workflow completion stats
CREATE MATERIALIZED VIEW IF NOT EXISTS workflow_completion_stats AS
  SELECT
    DATE(created_at) as date,
    COUNT(*) as total_workflows,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
    AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) FILTER (WHERE status = 'completed') as avg_duration_seconds
  FROM workflow_executions
  GROUP BY DATE(created_at);

-- Refresh materialized views on schedule
-- SELECT cron.schedule('refresh-user-oauth-status', '*/30 * * * *',
--   'REFRESH MATERIALIZED VIEW CONCURRENTLY user_oauth_status');
-- SELECT cron.schedule('refresh-workflow-stats', '0 * * * *',
--   'REFRESH MATERIALIZED VIEW CONCURRENTLY workflow_completion_stats');

-- ─────────────────────────────────────────────────────────────
-- DONE
-- ─────────────────────────────────────────────────────────────

