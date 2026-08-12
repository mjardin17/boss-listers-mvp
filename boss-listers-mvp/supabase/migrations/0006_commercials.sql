-- Migration: Add commercial generation tracking
-- Created: 2026-08-10

CREATE TABLE IF NOT EXISTS public.commercial_jobs (
  id text PRIMARY KEY,
  listing_id uuid NOT NULL,
  session_id text,
  product_name text,
  description text,
  price numeric,
  images jsonb,
  status text NOT NULL DEFAULT 'pending', -- pending, generating, completed, failed
  video_url text,
  error_message text,
  created_at timestamp with time zone DEFAULT NOW(),
  updated_at timestamp with time zone DEFAULT NOW(),
  FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE
);

CREATE INDEX idx_commercial_jobs_listing ON public.commercial_jobs(listing_id);
CREATE INDEX idx_commercial_jobs_status ON public.commercial_jobs(status);
CREATE INDEX idx_commercial_jobs_created ON public.commercial_jobs(created_at);
CREATE INDEX idx_commercial_jobs_session ON public.commercial_jobs(session_id);

-- RLS: Service role can write, anon/authenticated can read their own
ALTER TABLE public.commercial_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY commercial_jobs_read_own ON public.commercial_jobs
  FOR SELECT
  USING (
    session_id = current_setting('app.current_session_id')
    OR auth.role() = 'service_role'
  );

CREATE POLICY commercial_jobs_write_service ON public.commercial_jobs
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY commercial_jobs_update_service ON public.commercial_jobs
  FOR UPDATE
  USING (auth.role() = 'service_role');

-- Webhook events for commercial generation
CREATE TABLE IF NOT EXISTS public.commercial_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id text NOT NULL,
  event_type text NOT NULL, -- queued, started, completed, failed
  payload jsonb,
  created_at timestamp with time zone DEFAULT NOW(),
  FOREIGN KEY (job_id) REFERENCES public.commercial_jobs(id) ON DELETE CASCADE
);

CREATE INDEX idx_commercial_events_job ON public.commercial_events(job_id);
CREATE INDEX idx_commercial_events_type ON public.commercial_events(event_type);

-- Subscriptions tracking
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id text PRIMARY KEY,
  session_id text NOT NULL UNIQUE,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text NOT NULL DEFAULT 'active', -- active, canceled, expired
  tier text DEFAULT 'pro', -- pro, business, enterprise
  price_usd numeric DEFAULT 59,
  billing_cycle_start timestamp with time zone,
  billing_cycle_end timestamp with time zone,
  created_at timestamp with time zone DEFAULT NOW(),
  updated_at timestamp with time zone DEFAULT NOW()
  -- No FK to listings.session_id: that column isn't unique (many listings
  -- share session_id='anon'), so a foreign key against it can't be created.
  -- Tenant attribution for subscriptions is now via tenant_id (see 0008).
);

CREATE INDEX idx_subscriptions_stripe_customer ON public.subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_session ON public.subscriptions(session_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);

-- RLS for subscriptions
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_read_own ON public.subscriptions
  FOR SELECT
  USING (
    session_id = current_setting('app.current_session_id')
    OR auth.role() = 'service_role'
  );

-- Update commercial_jobs updated_at trigger
CREATE OR REPLACE FUNCTION update_commercial_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER commercial_jobs_update_timestamp
BEFORE UPDATE ON public.commercial_jobs
FOR EACH ROW
EXECUTE FUNCTION update_commercial_jobs_updated_at();
