# OAuth Deployment Checklist

Complete checklist for deploying OAuth to production.

## Pre-Deployment (Development)

### Environment Setup
- [ ] Generate SECRET_KEY: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- [ ] Add to `.env.local`:
  ```env
  SECRET_KEY=<generated_key>
  APP_URL=http://localhost:3001
  ```
- [ ] Verify `.env.local` is in `.gitignore`
- [ ] Run migrations: `psql ... -f migrations/social_media_oauth_schema.sql`

### Test Each Platform

#### Instagram
- [ ] Create Meta app at developers.facebook.com
- [ ] Add Client ID to `INSTAGRAM_CLIENT_ID`
- [ ] Add Client Secret to `INSTAGRAM_CLIENT_SECRET`
- [ ] Set redirect URI: `http://localhost:3001/api/oauth/instagram/callback`
- [ ] Test OAuth flow: `/auth/connect/instagram`
- [ ] Verify credentials stored in Supabase

#### TikTok
- [ ] Create app at developers.tiktok.com
- [ ] Add Client ID to `TIKTOK_CLIENT_ID`
- [ ] Add Client Secret to `TIKTOK_CLIENT_SECRET`
- [ ] Set redirect URI: `http://localhost:3001/api/oauth/tiktok/callback`
- [ ] Test OAuth flow

#### YouTube
- [ ] Create project in Google Cloud Console
- [ ] Enable YouTube Data API v3
- [ ] Create OAuth 2.0 credentials (Web app)
- [ ] Add Client ID to `YOUTUBE_CLIENT_ID`
- [ ] Add Client Secret to `YOUTUBE_CLIENT_SECRET`
- [ ] Set redirect URI: `http://localhost:3001/api/oauth/youtube/callback`
- [ ] Test OAuth flow

#### Facebook
- [ ] Create Facebook app
- [ ] Add App ID to `FACEBOOK_APP_ID`
- [ ] Add App Secret to `FACEBOOK_APP_SECRET`
- [ ] Enable Facebook Login product
- [ ] Set redirect URI: `http://localhost:3001/api/oauth/facebook/callback`
- [ ] Test OAuth flow

#### Twitter/X
- [ ] Create app at developer.twitter.com
- [ ] Add Client ID to `TWITTER_CLIENT_ID`
- [ ] Add Client Secret to `TWITTER_CLIENT_SECRET`
- [ ] Enable OAuth 2.0
- [ ] Set redirect URI: `http://localhost:3001/api/oauth/twitter/callback`
- [ ] Test OAuth flow

#### LinkedIn
- [ ] Create app at linkedin.com/developers
- [ ] Add Client ID to `LINKEDIN_CLIENT_ID`
- [ ] Add Client Secret to `LINKEDIN_CLIENT_SECRET`
- [ ] Set redirect URI: `http://localhost:3001/api/oauth/linkedin/callback`
- [ ] Test OAuth flow

#### Snapchat
- [ ] Create app at business.snapchat.com
- [ ] Add Client ID to `SNAPCHAT_CLIENT_ID`
- [ ] Add Client Secret to `SNAPCHAT_CLIENT_SECRET`
- [ ] Set redirect URI: `http://localhost:3001/api/oauth/snapchat/callback`
- [ ] Test OAuth flow

#### Pinterest
- [ ] Create app at developers.pinterest.com
- [ ] Add Client ID to `PINTEREST_CLIENT_ID`
- [ ] Add Client Secret to `PINTEREST_CLIENT_SECRET`
- [ ] Set redirect URI: `http://localhost:3001/api/oauth/pinterest/callback`
- [ ] Test OAuth flow

### Code Quality
- [ ] Run tests: `npm run test`
- [ ] Check TypeScript: `npm run typecheck`
- [ ] Lint code: `npm run lint` (if configured)
- [ ] No hardcoded secrets in code
- [ ] No console.log statements left
- [ ] Error messages are user-friendly

### Security Review
- [ ] CSRF tokens properly verified
- [ ] Tokens encrypted with AES-256-GCM
- [ ] SECRET_KEY never logged
- [ ] HTTPS enforced in production config
- [ ] RLS policies enabled on Supabase tables
- [ ] Service role key only used server-side
- [ ] Rate limiting configured

## Production Deployment

### Infrastructure
- [ ] Production Supabase project created
- [ ] Database migrations applied to production
- [ ] PostgreSQL extensions enabled (uuid-ossp)
- [ ] RLS policies enabled
- [ ] Backups configured

### Secrets Management
- [ ] SECRET_KEY stored in secrets manager (AWS Secrets Manager / Hashicorp Vault)
- [ ] Platform credentials stored in secrets manager
- [ ] Service role key stored securely (not in code)
- [ ] Anon key accessible to frontend build
- [ ] No secrets in environment variable dumps

### Platform Configuration (Production URLs)

#### Instagram
- [ ] Update redirect URI to production: `https://yourdomain.com/api/oauth/instagram/callback`
- [ ] Verify with Meta Support if using production app

#### TikTok
- [ ] Update redirect URI to production
- [ ] Enable production environment

#### YouTube
- [ ] Add production domain to OAuth consent screen
- [ ] Update redirect URI to production

#### Facebook
- [ ] Update redirect URI to production
- [ ] Add production domain to app settings

#### Twitter
- [ ] Update redirect URI to production
- [ ] Enable production mode

#### LinkedIn
- [ ] Update redirect URI to production
- [ ] Verify domain ownership

#### Snapchat
- [ ] Update redirect URI to production

#### Pinterest
- [ ] Update redirect URI to production

### Application Configuration
- [ ] `APP_URL` set to production domain in environment
- [ ] `NEXT_PUBLIC_BASE_URL` set to production domain
- [ ] API endpoints use HTTPS only
- [ ] CORS headers configured correctly
- [ ] CSP headers configured (if using CSP)

### Environment Variables

Production `.env` should include:
```env
# Core
NODE_ENV=production
NEXT_PUBLIC_BASE_URL=https://yourdomain.com
APP_URL=https://yourdomain.com

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=<production_anon_key>
SUPABASE_SERVICE_ROLE_KEY=<production_service_role_key>

# Security
SECRET_KEY=<production_secret_key_from_secrets_manager>

# OAuth Credentials (from secrets manager)
INSTAGRAM_CLIENT_ID=<prod_value>
INSTAGRAM_CLIENT_SECRET=<prod_value>
# ... repeat for all platforms
```

### Monitoring & Logging
- [ ] Error logging configured (Sentry / LogRocket / etc)
- [ ] OAuth events logged to `social_media_connections_log`
- [ ] Failed OAuth attempts tracked
- [ ] Token refresh failures monitored
- [ ] Platform API errors logged with context

### Testing in Production

After deployment:

1. **Test OAuth Flow**
   ```bash
   # For each platform:
   # 1. Navigate to https://yourdomain.com/auth/connect/PLATFORM
   # 2. Complete OAuth
   # 3. Verify redirect back to app
   # 4. Verify credentials in Supabase
   ```

2. **Test Token Refresh**
   ```bash
   # Create test task that uses expired token
   # Verify automatic refresh works
   ```

3. **Test Error Handling**
   ```bash
   # Revoke token on platform side
   # Verify error handling is graceful
   # Check error messages are user-friendly
   ```

4. **Test CSRF Protection**
   ```bash
   # Modify state token during callback
   # Verify request rejected
   ```

### Database Maintenance

- [ ] Set up periodic cleanup job for expired states:
  ```sql
  -- Run every 5 minutes
  DELETE FROM oauth_states WHERE expires_at < NOW();
  ```

- [ ] Set up daily logs cleanup (optional):
  ```sql
  -- Keep last 30 days
  DELETE FROM social_media_connections_log 
  WHERE created_at < NOW() - INTERVAL '30 days';
  ```

- [ ] Enable automated backups
- [ ] Test backup restoration process

### Performance

- [ ] Callback endpoint responds in < 2 seconds
- [ ] Token encryption/decryption is fast enough
- [ ] Database queries use indexes (check query plans)
- [ ] No N+1 queries

### Documentation

- [ ] User-facing docs on how to connect platforms
- [ ] Support docs for troubleshooting OAuth issues
- [ ] Internal runbook for disabling/revoking platform access
- [ ] API documentation deployed/accessible

### Support & Operations

- [ ] Support team trained on OAuth flow
- [ ] Procedure for revoking platform access:
  ```sql
  DELETE FROM social_media_credentials 
  WHERE user_id = 'user-id' AND platform = 'instagram';
  ```

- [ ] Procedure for debugging OAuth issues:
  - Check `social_media_connections_log` for error details
  - Verify platform credentials in secrets manager
  - Check token expiration in `social_media_credentials`
  - Review API logs/error tracking

- [ ] On-call rotation configured
- [ ] Alert rules set up for OAuth failures

## Post-Deployment Monitoring

### First 24 Hours
- [ ] Monitor error rates closely
- [ ] Check OAuth success rate (should be > 95%)
- [ ] Monitor API response times
- [ ] Verify no security issues in logs

### Ongoing (Weekly)
- [ ] Review failed OAuth attempts for patterns
- [ ] Check token refresh success rates
- [ ] Monitor platform API status pages
- [ ] Review security audit logs

### Ongoing (Monthly)
- [ ] Review error trends
- [ ] Check platform credential expirations
- [ ] Update documentation based on issues
- [ ] Capacity planning

## Rollback Plan

If issues occur:

1. **Immediate:** Disable platform (if specific platform has issues):
   ```sql
   UPDATE social_media_credentials 
   SET encrypted_credentials = NULL
   WHERE platform = 'instagram';
   ```

2. **Revert:** Deploy previous version if bugs introduced
   ```bash
   git revert <commit-hash>
   npm run build && npm run start
   ```

3. **Restore from backup:** If data corruption
   ```bash
   pg_restore -d <db> <backup-file>
   ```

## Sign-Off

- [ ] Lead developer: ___________________
- [ ] Security review: ___________________
- [ ] QA/Tester: ___________________
- [ ] DevOps/Infrastructure: ___________________
- [ ] Date deployed: ___________________

## Production URLs

Document final production URLs for reference:

- **App URL:** https://yourdomain.com
- **Authorize:** https://yourdomain.com/api/oauth/authorize
- **Instagram Callback:** https://yourdomain.com/api/oauth/instagram/callback
- **TikTok Callback:** https://yourdomain.com/api/oauth/tiktok/callback
- **YouTube Callback:** https://yourdomain.com/api/oauth/youtube/callback
- **Facebook Callback:** https://yourdomain.com/api/oauth/facebook/callback
- **Twitter Callback:** https://yourdomain.com/api/oauth/twitter/callback
- **LinkedIn Callback:** https://yourdomain.com/api/oauth/linkedin/callback
- **Snapchat Callback:** https://yourdomain.com/api/oauth/snapchat/callback
- **Pinterest Callback:** https://yourdomain.com/api/oauth/pinterest/callback
