# Inventory Sync System - Setup Guide

Complete setup instructions for the BossLister inventory sync system.

## Quick Start (5 minutes)

### 1. Apply Database Migration

**Option A: Via Supabase CLI**
```bash
npx supabase db push
```

**Option B: Manual SQL (if CLI has issues)**
1. Open Supabase Dashboard → SQL Editor
2. Copy the entire contents of `supabase/migrations/0016_sync_history.sql`
3. Paste and execute

The migration creates two tables:
- `sync_runs` - Track each sync execution
- `sync_details` - Line-item log for each SKU

### 2. Configure Environment Variables

Create/update `.env.local` with:

```env
# eBay API
EBAY_CLIENT_ID=your_ebay_client_id
EBAY_CLIENT_SECRET=your_ebay_client_secret
EBAY_REFRESH_TOKEN=your_ebay_refresh_token
EBAY_ENVIRONMENT=production

# Etsy API
ETSY_API_KEY=your_etsy_api_key
ETSY_SHOP_ID=your_etsy_shop_id

# Supabase (should already exist)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Verify Setup

Run the test script:
```bash
node scripts/test-sync-engine.js
```

You should see:
```
Found X unique SKUs across platforms
Total SKUs checked: X
Quantity updates: X
Delistings: X

ALL TESTS PASSED ✓
```

### 4. Access the Dashboard

Start the dev server:
```bash
npm run dev
```

Navigate to: `http://localhost:3001/sync-dashboard`

You should see:
- Platform configuration status (eBay ✓ / Etsy ✓)
- Last sync status (or "No syncs yet")
- Sync controls with "Trigger Full Sync" button

## Detailed Configuration

### eBay Setup

#### Get Credentials
1. Go to [eBay Developer Center](https://developer.ebay.com)
2. Create/log into your developer account
3. Go to [Application Keys](https://developer.ebay.com/my/keys)
4. Copy your:
   - Client ID (App ID)
   - Client Secret (Cert ID)

#### Get Refresh Token
1. Go to [User Consent Flow](https://developer.ebay.com/docs/api/user-consent-flow)
2. Follow the OAuth flow to get a refresh token
3. Save the refresh token securely

#### Verify Connection
```bash
curl -X POST https://api.ebay.com/identity/v1/oauth2/token \
  -H "Authorization: Basic $(echo -n 'YOUR_CLIENT_ID:YOUR_CLIENT_SECRET' | base64)" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token&refresh_token=YOUR_REFRESH_TOKEN&scope=https://api.ebay.com/oauth/api_scope/sell.inventory"
```

Response should include `access_token`.

### Etsy Setup

#### Get Credentials
1. Go to [Etsy Developers](https://www.etsy.com/developers)
2. Log in or create account
3. Create an app to get API key
4. Copy your:
   - API Key
   - Shop ID (find in your shop settings)

#### Verify Connection
```bash
curl https://openapi.etsy.com/v3/application/shops/YOUR_SHOP_ID \
  -H "x-api-key: YOUR_API_KEY"
```

Response should include your shop data.

## Manual Testing

### Test Status Endpoint
```bash
curl http://localhost:3001/api/sync/status
```

Response:
```json
{
  "ok": true,
  "lastSync": null,
  "syncedProductCount": 0,
  "syncedProducts": [],
  "isConfigured": {
    "ebay": true,
    "etsy": true
  }
}
```

### Test Sync Trigger
```bash
# Get your session token first
curl -X POST http://localhost:3001/api/sync/trigger \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json"
```

Response:
```json
{
  "ok": true,
  "summary": {
    "runId": "sync-1726000000000-abc123",
    "totalSkus": 245,
    "synced": 245,
    "updated": 12,
    "delistings": 0,
    "finishedAt": "2026-09-09T10:05:23Z"
  },
  "details": [...]
}
```

### Test Single SKU Sync
```bash
curl -X POST http://localhost:3001/api/sync/sku/SKU001/sync-now \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json"
```

### View Sync History
```bash
curl "http://localhost:3001/api/sync/history?limit=10&details=true"
```

## Troubleshooting

### Migration Won't Apply
**Error**: "relation already exists"

Solution: The migration may be partially applied. Check the database in Supabase:
1. Go to SQL Editor
2. Run: `SELECT COUNT(*) FROM sync_runs;`
3. If the table exists, the migration was successful

### Platform Not Configured
**Error**: Shows "Not Configured" for eBay or Etsy

Check:
- Environment variables are set correctly
- Variables are in `.env.local` (not `.env`)
- Dev server was restarted after setting variables
- No typos in variable names

Verify with:
```bash
echo $EBAY_CLIENT_ID
echo $ETSY_API_KEY
```

### Sync Fails with "No Access Token"
**Error**: "No eBay access token" or "Etsy credentials not configured"

**eBay**:
- Verify EBAY_REFRESH_TOKEN is still valid (may expire)
- Try getting a new refresh token via OAuth flow
- Check EBAY_ENVIRONMENT setting

**Etsy**:
- Verify ETSY_API_KEY format (should be long alphanumeric)
- Verify ETSY_SHOP_ID is numeric
- Check API key hasn't been revoked

### No Products Appear in Dashboard
**Issue**: "Synced Products" section is empty

Possible causes:
1. **No listings synced yet** - Run a sync first
2. **Products don't have SKUs** - Sync requires SKU field
3. **No marketplace_listings entries** - Products must be linked to marketplace accounts

Check database:
```sql
-- Check products with SKUs
SELECT COUNT(*) FROM products WHERE sku IS NOT NULL;

-- Check marketplace listings
SELECT COUNT(*) FROM marketplace_listings;

-- Check products with 2+ listings (truly synced)
SELECT product_id, COUNT(*) as listing_count 
FROM marketplace_listings 
GROUP BY product_id 
HAVING COUNT(*) >= 2;
```

### Sync Takes Too Long
**Issue**: Sync runs for 5+ minutes

This is normal for:
- Large catalogs (1000+ SKUs)
- Slow network connection
- Rate-limited API responses

To speed up:
1. Check network latency: `ping api.ebay.com`
2. Reduce catalog size (archive old listings)
3. Increase timeout in `lib/syncEngine.js` (line ~200)

## Deployment

### Production Setup

1. **Add environment variables to hosting platform**
   - Vercel: Project Settings → Environment Variables
   - Heroku: Config Vars
   - Other: Update deployment configuration

2. **Ensure database migration is applied**
   - Verify in Supabase before deploying

3. **Set up scheduled syncs** (optional)
   - Use cron job service (e.g., EasyCron, AWS EventBridge)
   - Call: `POST /api/sync/trigger` every 15 minutes

4. **Monitor sync performance**
   - Check `/api/sync/history` regularly
   - Set up alerts for failed syncs (status='failed')
   - Review sync_details for patterns

### Scheduled Syncing (Advanced)

To auto-sync every 15 minutes, create a cron job:

**Using node-cron** (install: `npm install node-cron`):
```javascript
// pages/api/sync/scheduler.js
import cron from 'node-cron';
import { SyncEngine } from '../../lib/syncEngine';

// Run every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  const engine = new SyncEngine();
  const result = await engine.execute();
  console.log('Scheduled sync complete:', result.summary);
});

export default function handler(req, res) {
  res.status(200).json({ ok: true, message: 'Scheduler is active' });
}
```

**Using external service** (EasyCron, AWS Lambda):
```
https://yourdomain.com/api/sync/trigger
Method: POST
Headers: Authorization: Bearer YOUR_SERVICE_TOKEN
Interval: 15 minutes
```

## Performance Metrics

Expected performance (with typical setup):

| Metric | Value |
|--------|-------|
| Time per 100 SKUs | ~10-15 seconds |
| Time per 500 SKUs | ~50-75 seconds |
| Time per 1000 SKUs | ~2-3 minutes |
| API calls per sync | ~4-6 (2 per platform + database) |
| Database records created | 1 sync_run + N sync_details |

## Next Steps

1. ✓ Apply migration
2. ✓ Configure environment variables
3. ✓ Verify setup with test script
4. Run first manual sync via dashboard
5. Monitor sync history and results
6. Set up scheduled syncs (optional)
7. Configure alerts/notifications (optional)

## Support

For detailed information about the sync system, see `SYNC_SYSTEM_README.md`.

For issues:
1. Check logs: Browser console and server logs
2. Review sync history for specific run details
3. Test platform APIs independently
4. Verify all environment variables
