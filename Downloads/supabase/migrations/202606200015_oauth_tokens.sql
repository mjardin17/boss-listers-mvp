-- Create oauth_tokens table for secure token storage
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT UNIQUE NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_platform ON oauth_tokens(platform);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expires_at ON oauth_tokens(expires_at);

-- Enable RLS
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage tokens (for backend operations)
CREATE POLICY "Service role can manage tokens" ON oauth_tokens
  FOR ALL USING (auth.role() = 'service_role');

-- Prevent public access to tokens
CREATE POLICY "Tokens are never public" ON oauth_tokens
  FOR ALL USING (false);
