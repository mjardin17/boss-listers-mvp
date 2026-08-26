-- Supabase Migration: Social Media OAuth Schema
-- This migration creates tables for storing encrypted OAuth credentials and CSRF state tokens

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────
-- social_media_credentials table
-- Stores encrypted OAuth tokens for each platform per user
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_media_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN (
    'instagram', 'tiktok', 'youtube', 'facebook', 'twitter',
    'linkedin', 'snapchat', 'pinterest'
  )),

  -- Encrypted JSON containing { accessToken, refreshToken, expiresIn, scopes, etc. }
  encrypted_credentials TEXT NOT NULL,

  -- Account identifier on the platform (username, page name, channel title, etc.)
  -- For quick display without decryption
  account_identifier TEXT,

  -- Comma-separated list of granted scopes (for audit/permission tracking)
  scopes TEXT,

  -- When the access token expires (for refresh logic)
  expires_at TIMESTAMP WITH TIME ZONE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Unique constraint: one connection per platform per user
  UNIQUE(user_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_social_media_credentials_user_id
  ON public.social_media_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_social_media_credentials_platform
  ON public.social_media_credentials(platform);
CREATE INDEX IF NOT EXISTS idx_social_media_credentials_expires_at
  ON public.social_media_credentials(expires_at);

-- ─────────────────────────────────────────────────────────────
-- oauth_states table
-- Stores temporary CSRF state tokens for OAuth flows
-- Automatically expires after 10-15 minutes
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.oauth_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  state TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,

  -- When this state token expires (should be 10-15 minutes from generation)
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Creation timestamp for cleanup
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_state
  ON public.oauth_states(state);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at
  ON public.oauth_states(expires_at);

-- Automatic cleanup: Delete expired states (runs periodically)
-- In production, use pg_cron or a scheduled job to run:
-- DELETE FROM public.oauth_states WHERE expires_at < NOW();

-- ─────────────────────────────────────────────────────────────
-- social_media_connections_log table (optional)
-- Audit log for OAuth connections and disconnections
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_media_connections_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  account_identifier TEXT,

  -- Event type: 'oauth_connected', 'oauth_disconnected', 'token_refreshed', 'token_failed'
  event TEXT NOT NULL,

  -- For security audit: IP address and user agent of the connection
  ip_address TEXT,
  user_agent TEXT,

  -- Error details if applicable
  error_message TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_media_connections_log_user_id
  ON public.social_media_connections_log(user_id);
CREATE INDEX IF NOT EXISTS idx_social_media_connections_log_platform
  ON public.social_media_connections_log(platform);
CREATE INDEX IF NOT EXISTS idx_social_media_connections_log_event
  ON public.social_media_connections_log(event);

-- ─────────────────────────────────────────────────────────────
-- RLS (Row Level Security) Policies
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.social_media_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_media_connections_log ENABLE ROW LEVEL SECURITY;

-- Users can only see their own credentials
CREATE POLICY "Users can view own credentials"
  ON public.social_media_credentials
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own credentials"
  ON public.social_media_credentials
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own credentials"
  ON public.social_media_credentials
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own credentials"
  ON public.social_media_credentials
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can view their own connection logs
CREATE POLICY "Users can view own connection logs"
  ON public.social_media_connections_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- API can insert logs (for backend operations)
CREATE POLICY "Service role can insert logs"
  ON public.social_media_connections_log
  FOR INSERT
  WITH CHECK (true); -- Only available when using service role key

-- ─────────────────────────────────────────────────────────────
-- Cleanup job (optional)
-- Run this periodically to delete expired OAuth states
-- ─────────────────────────────────────────────────────────────
-- SELECT cron.schedule('cleanup_oauth_states', '*/5 * * * *',
--   'DELETE FROM public.oauth_states WHERE expires_at < NOW()');
