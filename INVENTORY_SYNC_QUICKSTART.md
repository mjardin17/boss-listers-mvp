# eBay Inventory Sync - Quick Start Guide

Get the eBay inventory sync system up and running in 10 minutes.

## Prerequisites

- eBay Developer account (get one at https://developer.ebay.com/)
- Supabase project with BossListers database
- Node.js and Supabase CLI installed

## Step 1: Get eBay Credentials (2 minutes)

1. Go to https://developer.ebay.com/dashboard
2. Click "Create an Application" → "Server Application"
3. Copy these three values to a safe place:
   - **Client ID**
   - **Client Secret**
   - For Refresh Token:
     - Go to "Keys & Tokens"
     - Click "Generate Token" (under "Auth Token")
     - Select scopes: `sell.inventory`
     - Copy the token (long string starting with `AgEAAO...`)

## Step 2: Configure Environment Variables (2 minutes)

Create `.env.local` in project root with your credentials:

```bash
# eBay
EBAY_CLIENT_ID=your_client_id_here
EBAY_CLIENT_SECRET=your_client_secret_here
EBAY_REFRESH_TOKEN=AgEAAO...
EBAY_ENVIRONMENT=sandbox  # Change to "production" when ready

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Sync
SYNC_TRIGGER_SECRET=randomly_generated_secret_string_here
EBAY_WEBHOOK_VERIFY_TOKEN=webhook_verification_token_here
```

Where to find these in Supabase:
- SUPABASE_URL: Dashboard → Settings → API
- SUPABASE_SERVICE_ROLE_KEY: Dashboard → Settings → API → Service role key

## Step 3: Apply Database Migrations (3 minutes)

```bash
# Make sure you're at project root
cd /c/Users/jjard/claude/BossListers

# Apply pending migrations
npx supabase db push

# Verify new tables exist
npx supabase db pull

# Check sync_logs has tenant_id column
# Check webhook_events table was created
```

## Step 4: Deploy Edge Function (2 minutes)

```bash
# Deploy the eBay sync function
npx supabase functions deploy ebay-sync

# Verify it deployed
npx supabase functions list
# Should see: ebay-sync (v1)
```

## Step 5: Test It (1 minute)

**Start dev server:**
```bash
npm run dev
# Runs on http://localhost:3001
```

**Test sync endpoint:**
```bash
# Get your JWT token first (sign in on dashboard)
# Then call:
curl -X POST http://localhost:3001/api/inventory/sync-ebay \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"trigger": "manual"}'
```

**Expected response:**
```json
{
  "ok": true,
  "created": 5,
  "updated": 32,
  "message": "Synced 5 new and updated 32 existing products"
}
```

**Check sync status:**
```bash
curl http://localhost:3001/api/inventory/ebay-sync-status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Should return last sync time, counts, sync history.

## Step 6: View Dashboard

Navigate to your dashboard and look for "eBay Inventory Sync" component.

You should see:
- ✅ Last sync status (time, counts)
- ✅ "Sync Now" button
- ✅ Inventory counts by marketplace
- ✅ Recent sync history table

## What Happens Automatically

Once deployed, the sync runs automatically **every 15 minutes** via pg_cron:

1. Edge Function calls eBay Inventory API
2. Pulls all active listings for your account
3. Syncs products into the database
4. Records sync history for audit trail
5. Updates inventory counts

You can also manually trigger sync from the dashboard anytime.

## Real-Time Stock Management

When someone buys your item on eBay:

1. eBay sends webhook to `/api/inventory/ebay-webhook`
2. Endpoint verifies it's from eBay (signature check)
3. Updates product quantity in real-time
4. Records event in webhook_events table

This prevents overselling across all your marketplaces.

## Troubleshooting

**"Failed to fetch eBay inventory"**
- Verify EBAY_CLIENT_ID, SECRET, REFRESH_TOKEN are correct
- Check EBAY_ENVIRONMENT matches (sandbox vs production)
- Try refreshing your token (go to eBay Developer → Keys & Tokens)

**"Supabase not configured"**
- Ensure SUPABASE_URL is set (with https://)
- Service role key is different from anon key!
- Check they're in `.env.local` (not committed)

**"No marketplace account found"**
- Run migration 0004 to create the marketplace_accounts row
- Check database has eBay row

**Sync stops running**
- Check Edge Function logs: `npx supabase logs functions --filter "name=ebay-sync"`
- Verify pg_cron job: In Supabase SQL editor run:
  ```sql
  SELECT * FROM cron.job WHERE jobname LIKE '%ebay%';
  ```

## Testing with Sandbox

To test safely before production:

1. Set `EBAY_ENVIRONMENT=sandbox`
2. Use sandbox credentials (get at https://sandbox.ebay.com/developer/sandbox)
3. Create test listings in sandbox
4. Run sync, verify products appear

When ready for production:
1. Set `EBAY_ENVIRONMENT=production`
2. Use production credentials
3. Sync will pull real eBay listings

## Next Steps

1. **Set up webhooks** for real-time stock management
   - Register webhook URL in eBay Developer account
   - Subscribe to: ITEM_SOLD, INVENTORY_QUANTITY_CHANGED
   - Test with sample webhook event

2. **Configure Slack notifications** (optional)
   - Add Slack webhook for sync failures
   - Get alerts if sync misses a cycle

3. **Add to monitoring dashboard**
   - Track sync success rate over time
   - Alert if sync takes > 2 minutes

4. **Document your setup**
   - Save which eBay account is synced
   - Record when sync was last verified

## Performance Expectations

| Inventory Size | Sync Time | Calls to eBay |
|---|---|---|
| 100 items | 10-15 seconds | 2 |
| 1,000 items | 30-45 seconds | 10 |
| 10,000 items | 2-3 minutes | 100 |
| 50,000+ items | 5-10 minutes | 500+ |

If sync takes too long, consider:
- Reducing limit from 100 to 50 (smaller pages)
- Running less frequently (every 30 min instead of 15)
- Archiving inactive/sold listings on eBay

## Security Reminder

⚠️ **Never commit `.env.local`**
- Git-ignore it: `echo ".env.local" >> .gitignore`
- These files contain secret keys
- If leaked, rotate credentials immediately

## Support

- eBay API issues: Check [eBay Developer Docs](https://developer.ebay.com/api-docs/)
- Supabase issues: Check [Supabase Docs](https://supabase.com/docs)
- Edge Function logs: `npx supabase logs functions --filter "name=ebay-sync"`
- Database issues: Use Supabase SQL editor to inspect tables

## That's It!

You now have a production-ready inventory sync system. Your products will automatically sync from eBay every 15 minutes, and stock levels will stay in sync across all platforms.

Happy selling! 🎉
