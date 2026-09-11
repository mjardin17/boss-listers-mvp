# eBay Inventory Sync System

Complete production-ready system for pulling eBay inventory and keeping stock levels synchronized across all marketplaces in BossListers.

## Architecture Overview

```
┌─────────────────┐
│   eBay API      │
│  (Inventory)    │
└────────┬────────┘
         │
         ├─── pg_cron (every 15 min) ─────────────────────────────┐
         │                                                         │
         │   ┌─────────────────────────────────────────────────────▼────────┐
         │   │  Supabase Edge Function: ebay-sync                          │
         │   │  - Fetches all active eBay listings                        │
         │   │  - Normalizes data                                         │
         │   │  - Upserts into products table                             │
         │   │  - Records sync log                                        │
         │   └─────────────────────────────────────────────────────┬────────┘
         │                                                         │
         └─────────────────────────────────────────────────────────┘
                                                                    │
         ┌──────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Supabase PostgreSQL Database   │
│                                 │
│  - products (master inventory)  │
│  - sync_logs (audit trail)      │
│  - sync_state (circuit breaker) │
│  - marketplace_listings (cross- │
│    platform tracking)           │
│  - webhook_events (eBay events) │
└──────────┬──────────────────────┘
           │
           ├─ Dashboard API       ├─ Status API          ├─ Webhook Handler
           │  (real-time display) │ (metrics/counts)     │ (order events)
           │                      │                      │
        React                  React/Next.js           eBay webhooks
        Components             Pages                   (ITEM_SOLD, etc)
           │                      │                      │
           └──────────────────────┴──────────────────────┘
                    Dashboard & Monitoring
```

## Components

### 1. **eBay Inventory Fetcher** (`lib/ebayInventoryFetcher.js`)
Pulls product data from eBay Inventory API with pagination support.

**Features:**
- OAuth token management (tenant-aware)
- Pagination for inventories up to 100k+ items
- Data normalization (eBay format → internal format)
- Handles missing/optional fields gracefully
- Condition code normalization (NEW → New, USED → Used, etc)

**Usage:**
```javascript
const { EbayInventoryFetcher } = require("./lib/ebayInventoryFetcher");
const fetcher = new EbayInventoryFetcher();

// Fetch all listings for a tenant
const products = await fetcher.fetchAllListings("tenant-uuid");

// Fetch single product by SKU
const product = await fetcher.fetchProductBySku("tenant-uuid", "SKU123");
```

### 2. **Inventory Sync Service** (`lib/inventorySyncService.js`)
Merges eBay data with local database, handles upserts, conflict resolution.

**Features:**
- Idempotent upsert by SKU
- Tenant isolation via RLS
- Cross-marketplace tracking
- Duplicate detection
- Comprehensive error handling
- Sync history logging

**Usage:**
```javascript
const { InventorySyncService } = require("./lib/inventorySyncService");
const syncService = new InventorySyncService();

// Sync products for a tenant
const result = await syncService.syncEbayProducts("tenant-uuid", ebayProducts);

// Get sync status
const lastSync = await syncService.getLastSyncStatus("tenant-uuid");
const history = await syncService.getSyncHistory("tenant-uuid", 50);
```

### 3. **API Endpoints**

#### `POST /api/inventory/sync-ebay`
Manually trigger a sync for the authenticated user's tenant.

**Request:**
```bash
curl -X POST http://localhost:3001/api/inventory/sync-ebay \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"trigger": "manual"}'
```

**Response:**
```json
{
  "ok": true,
  "trigger": "manual",
  "itemsSeen": 42,
  "created": 10,
  "updated": 32,
  "skipped": 0,
  "errors": [],
  "conflicts": [],
  "message": "Synced 10 new and updated 32 existing products"
}
```

#### `GET /api/inventory/ebay-sync-status`
Get sync status, last sync time, inventory counts by marketplace.

**Response:**
```json
{
  "ok": true,
  "lastSync": {
    "startedAt": "2025-09-11T15:30:00Z",
    "finishedAt": "2025-09-11T15:31:15Z",
    "status": "success",
    "itemsSeen": 150,
    "itemsUpserted": 150,
    "itemsCreated": 5,
    "itemsUpdated": 145,
    "minutesSinceSync": 2,
    "errors": []
  },
  "marketplaceInventoryCounts": {
    "ebay": 150,
    "etsy": 120,
    "facebook": 80
  },
  "syncHistory": [...]
}
```

#### `POST /api/inventory/ebay-webhook`
Webhook receiver for eBay order events (ITEM_SOLD, INVENTORY_QUANTITY_CHANGED, etc).

**Handles:**
- ITEM_SOLD: Decrements inventory
- INVENTORY_QUANTITY_CHANGED: Updates quantity
- LISTING_STATUS_CHANGED: Marks as ended/out-of-stock

### 4. **Supabase Edge Function** (`supabase/functions/ebay-sync/index.ts`)
Scheduled task called by pg_cron every 15 minutes.

**Flow:**
1. Triggered by pg_cron with SYNC_TRIGGER_SECRET header
2. Fetches all tenants with eBay connected
3. For each tenant:
   - Gets OAuth access token
   - Fetches all active listings with pagination
   - Upserts to products table
   - Records sync log
4. Returns summary of all syncs

**Environment Variables Required:**
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
EBAY_CLIENT_ID
EBAY_CLIENT_SECRET
EBAY_ENVIRONMENT (sandbox or production)
SYNC_TRIGGER_SECRET
```

### 5. **React Dashboard Component** (`components/InventorySyncDashboard.tsx`)
Real-time dashboard showing sync status, inventory counts, and sync history.

**Features:**
- Last sync status with timestamp
- Created/updated/error counts
- Inventory breakdown by marketplace
- One-click "Sync Now" button
- Recent sync history table
- Auto-refresh every 30 seconds
- Error state handling

**Usage:**
```jsx
import InventorySyncDashboard from "@/components/InventorySyncDashboard";

export default function Page() {
  return <InventorySyncDashboard />;
}
```

## Database Schema

### `products` (existing, enhanced)
```sql
-- Added columns for eBay sync tracking:
sku                  text unique          -- Deduplicates across platforms
source               text                 -- "ebay" | "manual"
ebay_listing_id      text unique          -- eBay's listing ID
ebay_category_id     text                 -- eBay category
last_ebay_price      numeric              -- Last price from eBay
last_ebay_quantity   integer              -- Last quantity from eBay
synced_at            timestamptz          -- Last sync timestamp
tenant_id            uuid                 -- Multi-tenant isolation
```

### `sync_logs` (new columns)
```sql
tenant_id            uuid references tenants
items_created        integer              -- Count created this sync
items_updated        integer              -- Count updated this sync
items_skipped        integer              -- Count skipped (duplicates, errors)
metadata             jsonb                -- {trigger: "scheduled"|"manual"|"webhook"}
```

### `webhook_events` (new table)
```sql
CREATE TABLE webhook_events (
  id                 bigint primary key,
  tenant_id          uuid references tenants,
  event_type         text,                -- ITEM_SOLD, INVENTORY_QUANTITY_CHANGED, etc
  sku                text,
  quantity_change    integer,
  new_quantity       integer,
  old_quantity       integer,
  payload            jsonb,               -- Full eBay webhook payload
  processed_at       timestamptz,
  created_at         timestamptz
);
```

## Configuration & Deployment

### 1. **eBay Developer Account Setup**

1. Create eBay Developer account at https://developer.ebay.com/
2. Create "Server Application" (not Hybrid)
3. Get credentials:
   - Client ID
   - Client Secret
   - Generate and save Refresh Token (scope: sell.inventory)
4. Test with Sandbox first:
   - Set EBAY_ENVIRONMENT=sandbox
   - Use sandbox credentials

### 2. **Environment Variables**

Create `.env.local` in project root:
```bash
# eBay API
EBAY_CLIENT_ID=your_client_id
EBAY_CLIENT_SECRET=your_client_secret
EBAY_REFRESH_TOKEN=your_refresh_token
EBAY_ENVIRONMENT=production  # or "sandbox"

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Sync
SYNC_TRIGGER_SECRET=your_random_secret_here

# Webhooks
EBAY_WEBHOOK_VERIFY_TOKEN=your_webhook_token
```

### 3. **Database Migrations**

Apply migrations in order:
```bash
# Create sync infrastructure
npx supabase migration list
npx supabase db push  # Applies all pending migrations

# Verify tables
npx supabase db pull  # Downloads latest schema
```

Required migrations:
- `0014_sync_logs_tenant_id.sql` - Add tenant_id to sync_logs
- `0015_webhook_events_table.sql` - Create webhook_events table

### 4. **Deploy Supabase Edge Function**

```bash
# From project root
npx supabase functions deploy ebay-sync

# Verify deployment
npx supabase functions list

# View logs
npx supabase functions describe ebay-sync
npx supabase logs functions --filter "name=ebay-sync"
```

### 5. **Configure eBay Webhook**

1. In eBay Developer Dashboard:
   - Go to Application → Notifications
   - Add webhook URL: `https://yourdomain.com/api/inventory/ebay-webhook`
   - Subscribe to events:
     - ITEM_SOLD
     - INVENTORY_QUANTITY_CHANGED
     - LISTING_STATUS_CHANGED

2. Verify webhook secret matches EBAY_WEBHOOK_VERIFY_TOKEN

### 6. **Verify pg_cron Schedule**

Check that the schedule is active:
```sql
-- Connect to Supabase database
SELECT * FROM cron.job;

-- Should see job: "ebay-sync-every-15-min"
-- If missing, run migration 0002
```

## Testing

### Unit Tests
```bash
npm test -- lib/__tests__/ebayInventoryFetcher.test.js
npm test -- lib/__tests__/inventorySyncService.test.js
```

### Manual Testing

1. **Test eBay Fetcher:**
   ```bash
   node -e "
     const { EbayInventoryFetcher } = require('./lib/ebayInventoryFetcher');
     const f = new EbayInventoryFetcher();
     f.fetchAllListings('tenant-id').then(p => console.log('Got', p.length, 'products'));
   "
   ```

2. **Test Manual Sync Endpoint:**
   ```bash
   curl -X POST http://localhost:3001/api/inventory/sync-ebay \
     -H "Authorization: Bearer $JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"trigger": "manual"}'
   ```

3. **Test Status Endpoint:**
   ```bash
   curl http://localhost:3001/api/inventory/ebay-sync-status \
     -H "Authorization: Bearer $JWT_TOKEN"
   ```

4. **Check Edge Function Logs:**
   ```bash
   npx supabase logs functions --filter "name=ebay-sync"
   ```

## Monitoring & Debugging

### Dashboard
- View eBay Inventory Sync component on dashboard
- Shows last sync time, counts, error messages
- One-click manual sync trigger

### Database Queries
```sql
-- Last sync status
SELECT * FROM sync_logs 
WHERE tenant_id = 'tenant-id' 
ORDER BY started_at DESC 
LIMIT 1;

-- Sync history (last 10 syncs)
SELECT started_at, status, items_upserted, errors 
FROM sync_logs 
WHERE tenant_id = 'tenant-id' 
ORDER BY started_at DESC 
LIMIT 10;

-- Products synced from eBay
SELECT sku, title, quantity, ebay_listing_id, synced_at 
FROM products 
WHERE tenant_id = 'tenant-id' AND source = 'ebay'
ORDER BY synced_at DESC;

-- Webhook events
SELECT event_type, sku, quantity_change, processed_at 
FROM webhook_events 
WHERE tenant_id = 'tenant-id' 
ORDER BY processed_at DESC 
LIMIT 50;
```

### Common Issues

**Issue:** "eBay OAuth failed"
- Check EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_REFRESH_TOKEN
- Verify EBAY_ENVIRONMENT matches (sandbox vs production)
- Ensure refresh token hasn't been revoked

**Issue:** "Supabase not configured"
- Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
- Service role key is different from anon key!

**Issue:** "No marketplace account found"
- Run migration 0004 to seed marketplace_accounts table
- Ensure eBay account row exists in marketplace_accounts

**Issue:** Sync never runs
- Check pg_cron job: `SELECT * FROM cron.job WHERE jobname = 'ebay-sync-every-15-min';`
- Verify Edge Function deployed: `npx supabase functions list`
- Check Edge Function logs for errors

**Issue:** Quantities not decrementing on sales
- Verify eBay webhook is configured and eBay has called it
- Check webhook signature verification (compare headers)
- Look for webhook events in webhook_events table
- Verify EBAY_WEBHOOK_VERIFY_TOKEN is set

## Performance Considerations

### Sync Performance
- **Typical sync time:** 30-60 seconds for 1000+ items
- **Database upserts:** Batched by tenant for efficiency
- **eBay API rate limit:** 5000 calls/hour (syncing 100 items = ~2 calls)
- **Edge Function timeout:** 540 seconds (sufficient for 10k+ items)

### Optimization
- Pagination limit set to 100 (balance: request size vs number of calls)
- Connection pooling via Supabase REST API
- Service role for direct DB access (no JWT overhead)
- Indexed on `tenant_id, sku` for fast lookups

### Scaling
- For 10k+ products: Edge Function may take 2-3 minutes
- Webhook handler runs instantly (decrements in-place)
- Dashboard auto-refreshes every 30 seconds (configurable)

## Security

### Authentication
- Dashboard API endpoints require authenticated user
- User can only see their own tenant's data (via RLS)
- Admin can override tenant (if admin role set)

### Authorization
- Products RLS: Users can only read/write own tenant
- sync_logs RLS: Users can only read own tenant
- webhook_events RLS: No anon access (service role only)

### Secrets
- EBAY_WEBHOOK_VERIFY_TOKEN: Verify webhook came from eBay
- SYNC_TRIGGER_SECRET: Verify pg_cron trigger (via X-Sync-Trigger-Secret header)
- SUPABASE_SERVICE_ROLE_KEY: Never exposed to client

## Troubleshooting Checklist

- [ ] eBay credentials set in env vars
- [ ] Supabase URL and service role key set
- [ ] Database migrations applied (0014, 0015)
- [ ] Edge Function deployed (`npx supabase functions deploy ebay-sync`)
- [ ] pg_cron job scheduled (check `cron.job` table)
- [ ] Webhook URL registered in eBay Developer account
- [ ] SYNC_TRIGGER_SECRET and EBAY_WEBHOOK_VERIFY_TOKEN set
- [ ] marketplace_accounts table has eBay row for tenant
- [ ] Token is valid and not revoked
- [ ] Tenant has at least one active eBay listing

## Next Steps

1. **Analytics:** Add dashboard metrics (sync duration, success rate)
2. **Alerts:** Slack notifications on sync failures
3. **Webhook Replay:** UI to re-process failed webhook events
4. **Multi-Account:** Support multiple eBay accounts per tenant
5. **Incremental Sync:** Only pull changed items (not all 1000+)
6. **Order Fulfillment:** Auto-update order status across marketplaces

## References

- [eBay Inventory API Docs](https://developer.ebay.com/api-docs/sell/inventory/overview.html)
- [eBay OAuth Guide](https://developer.ebay.com/docs/sell/content/oauth-tokens/)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase pg_cron](https://supabase.com/docs/guides/database/extensions/pg_cron)
