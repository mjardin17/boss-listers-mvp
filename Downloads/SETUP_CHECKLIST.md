# Setup Checklist - Things YOU Need to Do

## OAuth Developer Applications (Required for Social Posting)

### 1. TikTok for Developers
- [ ] Go to https://developers.tiktok.com/
- [ ] Create developer account / login
- [ ] Create new app (Web)
- [ ] Set redirect URI: `http://localhost:3001/api/oauth/tiktok/callback` (local) and your production domain
- [ ] Copy Client ID and Client Secret
- [ ] Get TikTok Social Access Token separately (for video posting)
- [ ] Add to `.env.local`:
  ```
  NEXT_PUBLIC_TIKTOK_OAUTH_CLIENT_ID=your_client_id
  TIKTOK_OAUTH_CLIENT_SECRET=your_client_secret
  TIKTOK_SOCIAL_ACCESS_TOKEN=your_access_token
  ```

### 2. Instagram / Meta Business
- [ ] Go to https://developers.facebook.com/
- [ ] Create app (type: Business)
- [ ] Add "Instagram Graph API" product
- [ ] Get Client ID and Client Secret
- [ ] Set redirect URI: `http://localhost:3001/api/oauth/instagram/callback`
- [ ] Add to `.env.local`:
  ```
  NEXT_PUBLIC_INSTAGRAM_OAUTH_CLIENT_ID=your_client_id
  INSTAGRAM_OAUTH_CLIENT_SECRET=your_client_secret
  INSTAGRAM_ACCESS_TOKEN=your_long_lived_token
  ```

### 3. YouTube / Google Cloud
- [ ] Go to https://console.cloud.google.com/
- [ ] Create new project
- [ ] Enable YouTube API v3
- [ ] Create OAuth 2.0 Client ID (Web application)
- [ ] Set redirect URI: `http://localhost:3001/api/oauth/youtube/callback`
- [ ] Copy Client ID and Client Secret
- [ ] Add to `.env.local`:
  ```
  NEXT_PUBLIC_YOUTUBE_OAUTH_CLIENT_ID=your_client_id
  YOUTUBE_OAUTH_CLIENT_SECRET=your_client_secret
  ```

### 4. Facebook Pages
- [ ] Use same Meta Business account as Instagram
- [ ] Get Page Access Token from Facebook App Dashboard
- [ ] Add to `.env.local`:
  ```
  NEXT_PUBLIC_FACEBOOK_OAUTH_CLIENT_ID=your_client_id
  FACEBOOK_OAUTH_CLIENT_SECRET=your_client_secret
  FACEBOOK_ACCESS_TOKEN=your_page_token
  ```

### 5. Twitter/X
- [ ] Go to https://developer.twitter.com/
- [ ] Apply for API access (explain: "Building product listing automation")
- [ ] Create app (Project + App)
- [ ] Enable OAuth 2.0 in app settings
- [ ] Set redirect URI: `http://localhost:3001/api/oauth/twitter/callback`
- [ ] Copy Client ID and Client Secret
- [ ] Add to `.env.local`:
  ```
  NEXT_PUBLIC_TWITTER_OAUTH_CLIENT_ID=your_client_id
  TWITTER_OAUTH_CLIENT_SECRET=your_client_secret
  ```

## Marketplace Credentials (For API Posting)

### 6. eBay Developer Account
- [ ] Go to https://developer.ebay.com/
- [ ] Create developer account
- [ ] Request production access (takes 1-2 weeks)
- [ ] Generate/obtain refresh token
- [ ] Add to `.env.local`:
  ```
  EBAY_CLIENT_ID=your_id
  EBAY_CLIENT_SECRET=your_secret
  EBAY_REFRESH_TOKEN=your_refresh_token
  EBAY_ENVIRONMENT=production
  EBAY_LISTING_SERVICE_URL=http://127.0.0.1:8791
  ```

### 7. Etsy Developer
- [ ] Go to https://www.etsy.com/developers
- [ ] Register as seller (must have Etsy shop)
- [ ] Create OAuth app
- [ ] Set redirect URI: `http://localhost:3001/api/oauth/etsy/callback`
- [ ] Copy Client ID and Secret
- [ ] Add to `.env.local`:
  ```
  ETSY_CLIENT_ID=your_id
  ETSY_CLIENT_SECRET=your_secret
  ETSY_REFRESH_TOKEN=your_refresh_token
  ```

### 8. Amazon Seller Central
- [ ] Go to https://sellercentral.amazon.com/
- [ ] Register as seller
- [ ] Go to Seller Central > Advertising > Apps and Services
- [ ] Request SP-API access
- [ ] Create IAM user with SP-API permissions
- [ ] Generate access token
- [ ] Add to `.env.local`:
  ```
  AMAZON_CLIENT_ID=your_client_id
  AMAZON_CLIENT_SECRET=your_client_secret
  AMAZON_REFRESH_TOKEN=your_refresh_token
  AMAZON_SELLER_ID=your_seller_id
  ```

### 9. TikTok Shop (API)
- [ ] Go to https://partner.tiktokshop.com/
- [ ] Register seller account (TikTok Shop partner)
- [ ] Request OAuth app credentials
- [ ] Get merchant ID
- [ ] Add to `.env.local`:
  ```
  TIKTOK_SHOP_CLIENT_ID=your_client_id
  TIKTOK_SHOP_CLIENT_SECRET=your_client_secret
  TIKTOK_SHOP_REFRESH_TOKEN=your_refresh_token
  TIKTOK_SHOP_MERCHANT_ID=your_merchant_id
  ```

### 10. Facebook Marketplace (API)
- [ ] Use Meta Business account from Instagram/Facebook setup
- [ ] Get Catalog ID and Business Account ID
- [ ] Add to `.env.local`:
  ```
  FACEBOOK_CATALOG_ID=your_catalog_id
  FACEBOOK_BUSINESS_ACCOUNT_ID=your_business_id
  ```

### 11. Shopify (Optional)
- [ ] Create Shopify store or use existing
- [ ] Create custom app in store admin
- [ ] Enable: products:write, products:read
- [ ] Get API key, access token, store URL
- [ ] Add to `.env.local`:
  ```
  SHOPIFY_STORE_URL=your-store.myshopify.com
  SHOPIFY_ADMIN_API_KEY=your_api_key
  SHOPIFY_ADMIN_API_TOKEN=your_access_token
  ```

### 12. WooCommerce (Optional)
- [ ] Use WooCommerce site (self-hosted WordPress)
- [ ] Install WooCommerce REST API plugin
- [ ] Generate API keys
- [ ] Add to `.env.local`:
  ```
  WOOCOMMERCE_STORE_URL=https://your-store.com
  WOOCOMMERCE_CONSUMER_KEY=your_key
  WOOCOMMERCE_CONSUMER_SECRET=your_secret
  ```

## Local Services Setup

### 13. Video Bot Pipeline (CRITICAL)
- [ ] Have Python service `scripts/video_pipeline.py` ready
- [ ] Start it: `python scripts/video_pipeline.py` (should listen on configured port)
- [ ] Verify it's running on: `http://localhost:8000` (or configured port)
- [ ] Add to `.env.local`:
  ```
  VIDEO_PIPELINE_URL=http://localhost:8000/webhook
  WEBHOOK_SECRET=your_secret_key_for_webhook_signing
  ```

### 14. Database Setup
- [ ] Run Supabase migrations to create `commercial_jobs` table
- [ ] Run Supabase migrations to create `social_media_credentials` table
- [ ] Verify tables exist in Supabase dashboard

## Environment Variables File

### 15. Create `.env.local`
Copy this template and fill in your actual values:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_URL=your_supabase_url

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3001

# Anthropic (for photo analysis)
ANTHROPIC_API_KEY=your_anthropic_key

# TikTok
NEXT_PUBLIC_TIKTOK_OAUTH_CLIENT_ID=
TIKTOK_OAUTH_CLIENT_SECRET=
TIKTOK_SOCIAL_ACCESS_TOKEN=

# Instagram/Meta
NEXT_PUBLIC_INSTAGRAM_OAUTH_CLIENT_ID=
INSTAGRAM_OAUTH_CLIENT_SECRET=
INSTAGRAM_ACCESS_TOKEN=

# YouTube
NEXT_PUBLIC_YOUTUBE_OAUTH_CLIENT_ID=
YOUTUBE_OAUTH_CLIENT_SECRET=

# Facebook
NEXT_PUBLIC_FACEBOOK_OAUTH_CLIENT_ID=
FACEBOOK_OAUTH_CLIENT_SECRET=
FACEBOOK_ACCESS_TOKEN=

# Twitter
NEXT_PUBLIC_TWITTER_OAUTH_CLIENT_ID=
TWITTER_OAUTH_CLIENT_SECRET=

# eBay
EBAY_CLIENT_ID=
EBAY_CLIENT_SECRET=
EBAY_REFRESH_TOKEN=
EBAY_ENVIRONMENT=production

# Etsy
ETSY_CLIENT_ID=
ETSY_CLIENT_SECRET=
ETSY_REFRESH_TOKEN=

# Amazon SP-API
AMAZON_CLIENT_ID=
AMAZON_CLIENT_SECRET=
AMAZON_REFRESH_TOKEN=
AMAZON_SELLER_ID=

# TikTok Shop
TIKTOK_SHOP_CLIENT_ID=
TIKTOK_SHOP_CLIENT_SECRET=
TIKTOK_SHOP_REFRESH_TOKEN=
TIKTOK_SHOP_MERCHANT_ID=

# Video Pipeline
VIDEO_PIPELINE_URL=http://localhost:8000/webhook
WEBHOOK_SECRET=your_secret_key

# Shopify (optional)
SHOPIFY_STORE_URL=
SHOPIFY_ADMIN_API_KEY=
SHOPIFY_ADMIN_API_TOKEN=

# WooCommerce (optional)
WOOCOMMERCE_STORE_URL=
WOOCOMMERCE_CONSUMER_KEY=
WOOCOMMERCE_CONSUMER_SECRET=
```

## Testing Checklist

### 16. Test Each Integration
- [ ] Test photo upload → product extraction
- [ ] Test listing creation
- [ ] Test posting to at least one marketplace (eBay/Etsy)
- [ ] Test commercial generation webhook
- [ ] Test TikTok OAuth flow
- [ ] Test Instagram OAuth flow
- [ ] Test posting commercial to TikTok
- [ ] Test posting commercial to Instagram

## Deployment (When Ready)

### 17. Production Deployment
- [ ] Update OAuth redirect URIs to production domain
- [ ] Set production environment variables on hosting provider
- [ ] Update `NEXT_PUBLIC_APP_URL` to production domain
- [ ] Disable local debugging headers
- [ ] Enable HTTPS
- [ ] Set up CRON job to refresh expired OAuth tokens
- [ ] Monitor webhook failures and retry

---

**Est. Time to Complete:** 2-4 hours (most time spent waiting for OAuth approvals)
**Priority Order:** 13 → 14 → 15 → (any 2-3 platforms) → 16
