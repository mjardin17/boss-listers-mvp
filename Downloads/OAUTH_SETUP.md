# BossLister OAuth Setup Guide

## Overview

BossLister now has automatic OAuth token management with:
- Secure token storage in Supabase
- Automatic token refresh when expired
- Better error handling and user feedback
- No manual .env.local updates needed

## Setup Steps

### 1. Run Database Migration

Connect to your Supabase database and run:

```sql
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

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_platform ON oauth_tokens(platform);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expires_at ON oauth_tokens(expires_at);

-- Enable RLS
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage tokens
CREATE POLICY "Service role can manage tokens" ON oauth_tokens
  FOR ALL USING (auth.role() = 'service_role');

-- Prevent public access
CREATE POLICY "Tokens are never public" ON oauth_tokens
  FOR ALL USING (false);
```

### 2. Authorize Accounts

1. Go to `http://localhost:3001/get-tokens`
2. Click "Authorize TikTok", "Authorize YouTube", or "Authorize Twitter"
3. Sign in with your account
4. Tokens are automatically saved to the database

### 3. No More Manual Updates Needed!

Previously you had to manually copy tokens to `.env.local`. Now:
- Tokens are securely stored in Supabase
- Tokens automatically refresh when expired
- The app always uses fresh, valid tokens

## Supported Platforms

### ✅ TikTok
- OAuth Client ID & Secret configured
- Automatic token refresh supported
- Status: **Ready to use**

### ✅ Twitter/X
- OAuth Client ID & Secret configured
- Automatic token refresh supported
- Status: **Ready to use**

### ⏳ YouTube
- OAuth Client ID & Secret configured
- Automatic token refresh supported
- Status: **Waiting for Google's service propagation** (5-30 min)

### 🔲 Instagram / Facebook
- Requires manual setup (no passkey available)
- Can be added later

## Token Architecture

### File: `lib/oauth/tokenManager.js`
Handles:
- Saving tokens to database
- Retrieving tokens from database
- Checking token expiration
- Refreshing expired tokens

### File: `lib/oauth/useToken.js`
Provides:
- `getValidToken(platform)` - Gets a valid token (refreshes if needed)
- Error handling for expired or missing tokens
- Requires re-authentication prompts

### Updated Files:
- `pages/api/oauth/youtube/callback.js`
- `pages/api/oauth/tiktok/callback.js`
- `pages/api/oauth/twitter/callback.js`

All callbacks now:
1. Exchange authorization code for tokens
2. Save tokens to database
3. Show success page with next steps

## Using Tokens in API Endpoints

### Example: Social Media Posting

```javascript
import { getValidToken, noTokenError } from '@/lib/oauth/useToken'

export default async function handler(req, res) {
  const { platform } = req.body

  // Get a valid token (automatically refreshes if needed)
  const tokenResult = await getValidToken(platform)
  
  if (!tokenResult.success) {
    return res.status(401).json(tokenResult)
  }

  const accessToken = tokenResult.accessToken

  // Use token to make API call
  const response = await fetch(`https://api.${platform}.com/v1/post`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ /* post data */ }),
  })

  // Handle response...
}
```

## Error Scenarios

### Token Expired
The token is automatically refreshed. If refresh fails:
```javascript
{
  "success": false,
  "error": "youtube token expired. Please re-authorize at /get-tokens",
  "needsAuth": true
}
```

### No Token Found
User hasn't authorized yet:
```javascript
{
  "success": false,
  "error": "No youtube token found. Please authorize at /get-tokens",
  "needsAuth": true
}
```

### Token Refresh Failed
Can happen if refresh token is revoked:
```javascript
{
  "success": false,
  "error": "Failed to refresh token: invalid_grant",
  "needsAuth": true
}
```

## Database Schema

```sql
oauth_tokens {
  id: UUID (primary key)
  platform: TEXT UNIQUE (youtube, tiktok, twitter, instagram, facebook)
  access_token: TEXT (the token used in API calls)
  refresh_token: TEXT (used to get new access tokens)
  expires_at: TIMESTAMP (when access token expires)
  created_at: TIMESTAMP (when first saved)
  updated_at: TIMESTAMP (when last refreshed)
}
```

## Security

- Tokens stored in Supabase (not in git or .env files)
- Row-level security prevents public access
- Only service role can manage tokens
- Tokens encrypted at rest by Supabase

## Next Steps

1. ✅ Run the database migration above
2. ✅ Test OAuth by going to `/get-tokens`
3. ✅ Authorize each platform
4. ✅ Use `getValidToken()` in your API endpoints

## Troubleshooting

### "Table not found" Error
Make sure you've run the SQL migration above in Supabase.

### "No token available"
Visit `/get-tokens` and click the authorize button for that platform.

### Tokens keep expiring
Make sure refresh tokens are being saved. Check the database:
```sql
SELECT platform, access_token, refresh_token, expires_at FROM oauth_tokens;
```

### Token refresh failing
The refresh token might be revoked. Re-authorize by visiting `/get-tokens`.

## Future Enhancements

- [ ] Instagram/Facebook OAuth setup
- [ ] Token usage tracking and analytics
- [ ] Automatic email alerts when re-authorization needed
- [ ] Batch token refresh for all platforms
- [ ] Token rotation policies for security
