# OAuth Setup Guide

This guide explains how to set up OAuth integration for all supported social media platforms.

## Overview

The OAuth implementation includes:

- **Stateless token exchange** with CSRF protection via state tokens
- **Encrypted credential storage** in Supabase (AES-256-GCM encryption)
- **Automatic token refresh** for platforms that support it
- **User-friendly error handling** per platform
- **Audit logging** of all OAuth connections
- **Rate limiting** on callback endpoints (built-in to Next.js)

## Architecture

### Flow

1. **Authorize Endpoint** (`/api/oauth/authorize?platform=instagram`)
   - Generates random state token (CSRF protection)
   - Stores state in `oauth_states` table (10-minute expiry)
   - Returns authorization URL for client to redirect to

2. **Callback Endpoint** (`/api/oauth/[platform]/callback`)
   - Receives code + state from OAuth provider
   - Verifies state token (prevents replay/CSRF attacks)
   - Exchanges code for access token
   - Fetches user profile from platform
   - Encrypts and stores credentials in Supabase
   - Logs connection event

3. **Token Refresh** (automatic)
   - Credentials are refreshed automatically when expired
   - `refreshCredentialsIfNeeded()` called before API access
   - Stale tokens returned if refresh fails (graceful degradation)

## Environment Setup

### 1. Generate Secret Key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output to `.env.local`:

```env
SECRET_KEY=your_generated_hex_key_here
APP_URL=http://localhost:3001
```

### 2. Configure Supabase Tables

Run the migration:

```bash
psql postgresql://user:password@localhost:5432/postgres -f migrations/social_media_oauth_schema.sql
```

Or use the Supabase SQL editor to run `migrations/social_media_oauth_schema.sql`.

## Platform Configuration

### Instagram

**Required Scopes:**
- `instagram_business_basic` — Read basic profile info
- `instagram_business_content_publish` — Publish content

**Setup:**
1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create an app → Select "Consumer"
3. Add "Instagram Graph API" product
4. Get Client ID and Secret
5. Add redirect URI: `http://localhost:3001/api/oauth/instagram/callback`

```env
INSTAGRAM_CLIENT_ID=your_client_id
INSTAGRAM_CLIENT_SECRET=your_client_secret
```

### TikTok

**Required Scopes:**
- `video.upload` — Upload videos
- `user.info.basic` — Read basic profile info

**Setup:**
1. Go to [TikTok Developers](https://developers.tiktok.com/)
2. Create an app
3. Get Client ID and Secret
4. Redirect URI: `http://localhost:3001/api/oauth/tiktok/callback`

```env
TIKTOK_CLIENT_ID=your_client_id
TIKTOK_CLIENT_SECRET=your_client_secret
```

### YouTube

**Required Scopes:**
- `https://www.googleapis.com/auth/youtube` — Access YouTube
- `https://www.googleapis.com/auth/youtube.upload` — Upload videos

**Setup:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project
3. Enable YouTube Data API v3
4. Create OAuth 2.0 credentials (Web application)
5. Add redirect URI: `http://localhost:3001/api/oauth/youtube/callback`

```env
YOUTUBE_CLIENT_ID=your_client_id.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=your_client_secret
```

### Facebook / Meta

**Required Scopes:**
- `pages_manage_metadata` — Manage page info
- `pages_read_engagement` — Read page analytics
- `pages_manage_posts` — Create/edit posts

**Setup:**
1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create an app → Select "Business"
3. Add "Facebook Login" product
4. Get App ID and Secret
5. Add redirect URI: `http://localhost:3001/api/oauth/facebook/callback`

```env
FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret
```

### Twitter / X

**Required Scopes:**
- `tweet.write` — Post tweets
- `tweet.read` — Read tweets

**Setup:**
1. Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal/)
2. Create an app
3. Get API Key and Secret
4. In Settings → Authentication Settings:
   - Enable OAuth 2.0
   - Set redirect URI: `http://localhost:3001/api/oauth/twitter/callback`
   - Set callback URL

```env
TWITTER_CLIENT_ID=your_client_id
TWITTER_CLIENT_SECRET=your_client_secret
```

### LinkedIn

**Required Scopes:**
- `w_member_social` — Post on behalf of user
- `r_basicprofile` — Read basic profile

**Setup:**
1. Go to [LinkedIn Developers](https://www.linkedin.com/developers/)
2. Create an app
3. Get Client ID and Secret
4. Authorized redirect URLs: `http://localhost:3001/api/oauth/linkedin/callback`

```env
LINKEDIN_CLIENT_ID=your_client_id
LINKEDIN_CLIENT_SECRET=your_client_secret
```

### Snapchat

**Required Scopes:**
- `snapchat-marketing-api` — Access marketing API

**Setup:**
1. Go to [Snapchat Business](https://business.snapchat.com/)
2. Create an app for Snapchat Ads API
3. Get Client ID and Secret
4. Redirect URI: `http://localhost:3001/api/oauth/snapchat/callback`

```env
SNAPCHAT_CLIENT_ID=your_client_id
SNAPCHAT_CLIENT_SECRET=your_client_secret
```

### Pinterest

**Required Scopes:**
- `pins:read` — Read pins
- `pins:write` — Create/edit pins
- `user_accounts:read` — Read user account info

**Setup:**
1. Go to [Pinterest Developers](https://developers.pinterest.com/)
2. Create an app
3. Get App ID and App Secret
4. Redirect URI: `http://localhost:3001/api/oauth/pinterest/callback`

```env
PINTEREST_CLIENT_ID=your_client_id
PINTEREST_CLIENT_SECRET=your_client_secret
```

## API Usage

### 1. Get Authorization URL

```javascript
const response = await fetch('/api/oauth/authorize?platform=instagram', {
  headers: {
    'Authorization': `Bearer ${userSessionToken}`
  }
});

const { authUrl, state } = await response.json();

// Redirect user to authUrl
window.location.href = authUrl;
```

### 2. Handle OAuth Callback

The callback is handled automatically by the API. The browser receives:

```json
{
  "ok": true,
  "platform": "instagram",
  "accountIdentifier": "my_business_account",
  "message": "Successfully connected to Instagram"
}
```

### 3. Retrieve Stored Credentials

```javascript
import { getSocialMediaCredentials } from '@/lib/supabaseCredentials';

const credentials = await getSocialMediaCredentials(
  env,
  userId,
  'instagram'
);

// Returns:
// {
//   accessToken: "...",
//   refreshToken: "...",
//   expiresAt: 1234567890,
//   accountIdentifier: "my_business_account"
// }
```

### 4. Refresh Credentials If Needed

```javascript
import { refreshCredentialsIfNeeded } from '@/lib/supabaseCredentials';

const credentials = await refreshCredentialsIfNeeded(
  env,
  userId,
  'instagram'
);

// Returns fresh credentials, or stale ones if refresh failed
```

### 5. List Connected Platforms

```javascript
import { listConnectedPlatforms } from '@/lib/supabaseCredentials';

const platforms = await listConnectedPlatforms(env, userId);

// Returns:
// [
//   {
//     platform: "instagram",
//     accountIdentifier: "my_business_account",
//     expiresAt: "2024-12-31T23:59:59Z",
//     scopes: ["instagram_business_basic", "instagram_business_content_publish"]
//   }
// ]
```

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Invalid OAuth state` | CSRF token expired or invalid | User should restart OAuth flow |
| `Token exchange failed` | Platform rejected authorization code | Check CLIENT_ID and CLIENT_SECRET |
| `Authentication required` | Missing session token | User must be logged in |
| `Unsupported platform` | Platform not in OAUTH_CONFIGS | Add platform configuration |

### Platform-Specific Errors

**Instagram:**
- `Invalid platform token` → Regenerate token from Meta dashboard
- `User is not a business account` → Convert to business account

**TikTok:**
- `Access denied` → Check scopes in app settings
- `Invalid redirect_uri` → Verify exact match in platform settings

**YouTube:**
- `The user has not granted the application the necessary permissions` → User must complete OAuth flow
- `Quota exceeded` → Check API quotas in Google Console

**Twitter:**
- `Invalid client_id` → Verify credentials in Twitter portal
- `The redirect_uri does not match` → Check exact URI match

## Security Best Practices

### 1. Store SECRET_KEY Safely

- **Never** commit to git
- Use `.env.local` (in .gitignore)
- In production, use a secret manager (AWS Secrets Manager, Hashicorp Vault, etc.)

### 2. CSRF Protection

- State tokens are verified on callback
- Tokens expire after 10 minutes
- Invalid/expired states are rejected

### 3. Encryption

- Tokens encrypted with AES-256-GCM
- Unique salt and IV per encryption
- Authentication tag prevents tampering

### 4. Audit Logging

- All OAuth connections logged to `social_media_connections_log`
- Includes IP address and user agent
- Track suspicious connection patterns

### 5. Row-Level Security (RLS)

- Users can only access their own credentials
- Service role needed for admin operations
- Credentials never returned to client-side code

## Troubleshooting

### "Missing SECRET_KEY" Error

```bash
# Generate one:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Add to .env.local:
SECRET_KEY=your_generated_key
```

### "Supabase not configured" Error

Ensure in `.env.local`:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key
```

### "Failed to resolve user ID" Error

- Check that Bearer token is valid
- Verify Supabase auth endpoint is accessible
- User session may have expired

### Platform-Specific Timeouts

Some platforms are slow to respond. Increase timeout in `[platform]/callback.js`:

```javascript
signal: AbortSignal.timeout(20_000) // 20 seconds
```

## Testing

### Test OAuth Flow Locally

```bash
# 1. Start dev server
npm run dev

# 2. In browser, navigate to:
# http://localhost:3001/auth/connect/instagram

# 3. Complete OAuth flow

# 4. Check Supabase: social_media_credentials table should have new record
```

### Test Token Encryption

```bash
node -e "
const tm = require('./lib/tokenManager.js');
const token = 'test_token_12345';
const encrypted = tm.encryptToken(token, 'your_secret_key');
const decrypted = tm.decryptToken(encrypted, 'your_secret_key');
console.log('Original:', token);
console.log('Decrypted:', decrypted);
console.log('Match:', token === decrypted);
"
```

## Production Checklist

- [ ] All platform credentials added to secrets manager
- [ ] SECRET_KEY generated and stored securely
- [ ] Supabase RLS policies enabled
- [ ] Audit logging enabled
- [ ] Rate limiting configured
- [ ] Redirect URIs set correctly for each platform
- [ ] HTTPS enforced in production
- [ ] CORS headers configured
- [ ] Error logging configured (Sentry, etc.)
- [ ] Scheduled cleanup job for expired states
