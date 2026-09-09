# BossLister Inventory Sync System

Complete autonomous cross-platform inventory synchronization for eBay + Etsy.

## Architecture Overview

The sync system consists of:

1. **Sync Engine** (`lib/syncEngine.js`) - Core logic that polls eBay and Etsy APIs, compares quantities, and updates as needed
2. **Database Schema** (`supabase/migrations/0016_sync_history.sql`) - Tracks sync runs and detailed line-item history
3. **API Endpoints** (`pages/api/sync/*`) - REST interface for triggering syncs and fetching status
4. **Dashboard UI** (`pages/sync-dashboard.js`) - Real-time monitoring and manual control

## How It Works

### Sync Flow

1. **Fetch Phase**: Pulls all active listings from both platforms
   - eBay: Uses `sell/inventory/v1/inventory_items` API
   - Etsy: Uses `openapi.etsy.com/v3/application/shops/{shop_id}/listings/active`

2. **Comparison Phase**: Matches listings by SKU
   - Groups listings by SKU across both platforms
   - Detects quantity differences

3. **Resolution Phase**: Syncs to higher quantity
   - If quantities differ, updates lower platform to match higher
   - Strategy: Always use the maximum quantity (conservative oversell prevention)
   - If quantity is 0 on all platforms: marks for delisting

4. **Logging Phase**: Records all changes to database
   - Creates sync_run record with summary
   - Writes sync_details for each SKU processed
   - Includes before/after quantities and actions taken

### Example Scenarios

**Scenario 1: eBay has more stock**
- eBay quantity: 10
- Etsy quantity: 5
- Result: Etsy updated to 10

**Scenario 2: Partial match**
- eBay quantity: 8
- Etsy quantity: 8
- Result: No action needed

**Scenario 3: Sold out**
- eBay quantity: 0
- Etsy quantity: 0
- Result: Both delisted (quantity set to 0)

## API Endpoints

### GET /api/sync/status
Returns current sync status and configuration.

Response:
```json
{
  "ok": true,
  "lastSync": {
    "run_id": "sync-1726000000000-abc123",
    "status": "success",
    "started_at": "2026-09-09T10:00:00Z",
    "finished_at": "2026-09-09T10:05:23Z",
    "total_skus_checked": 245,
    "skus_synced": 245,
    "quantity_updates": 12,
    "delistings": 0
  },
  "syncedProductCount": 245,
  "syncedProducts": [
    {
      "id": "uuid",
      "sku": "SKU001",
      "title": "Product Title",
      "quantity": 25
    }
  ],
  "isConfigured": {
    "ebay": true,
    "etsy": true
  }
}
```

### POST /api/sync/trigger
Manually trigger a full sync across all SKUs.

Requires: `Authorization: Bearer <session_token>`

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
  "details": [
    {
      "sku": "SKU001",
      "ebay_qty_before": 10,
      "etsy_qty_before": 8,
      "ebay_qty_after": 10,
      "etsy_qty_after": 10,
      "action": "updated",
      "action_details": {
        "updates": [
          {
            "platform": "etsy",
            "oldQty": 8,
            "newQty": 10
          }
        ]
      }
    }
  ]
}
```

### GET /api/sync/history
List recent sync runs with optional details.

Query parameters:
- `limit` - Number of runs to return (default: 50, max: 500)
- `offset` - Pagination offset (default: 0)
- `details` - Include detailed line-item changes (default: false)

Response:
```json
{
  "ok": true,
  "totalReturned": 10,
  "limit": 50,
  "offset": 0,
  "runs": [
    {
      "id": "uuid",
      "run_id": "sync-1726000000000-abc123",
      "status": "success",
      "started_at": "2026-09-09T10:00:00Z",
      "finished_at": "2026-09-09T10:05:23Z",
      "total_skus_checked": 245,
      "skus_synced": 245,
      "quantity_updates": 12,
      "delistings": 0,
      "error_message": null,
      "sync_type": "full",
      "target_sku": null,
      "details": [...]
    }
  ]
}
```

### POST /api/sync/sku/:sku/sync-now
Force sync a specific SKU immediately.

Example: `POST /api/sync/sku/SKU001/sync-now`

Requires: `Authorization: Bearer <session_token>`

Response: Same as `/api/sync/trigger` but filtered to single SKU.

## Dashboard UI

Navigate to `/sync-dashboard` to access the monitoring interface.

### Features

- **Platform Configuration Status**: Shows which platforms are configured
- **Last Sync Summary**: Status, timestamp, counts of updates and delistings
- **Synced Products List**: Shows all products with marketplace listings
  - Click "Sync Now" to force sync individual SKU
- **Sync History**: Chronological list of all sync runs
  - Expand any run to see detailed line-item changes
  - Color-coded status indicators (green=success, amber=partial, red=failed)

## Database Schema

### sync_runs
Tracks each sync execution.

```sql
CREATE TABLE sync_runs (
  id uuid PRIMARY KEY,
  run_id text UNIQUE,
  status text ('running', 'success', 'partial', 'failed'),
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  
  -- Summary counts
  total_skus_checked integer,
  skus_synced integer,
  quantity_updates integer,
  delistings integer,
  
  -- Sync scope
  sync_type text ('full', 'single_sku'),
  target_sku text,
  
  created_at timestamptz
);
```

### sync_details
Line-item log for each SKU processed.

```sql
CREATE TABLE sync_details (
  id uuid PRIMARY KEY,
  sync_run_id uuid REFERENCES sync_runs(id) ON DELETE CASCADE,
  sku text,
  
  -- Platform quantities before sync
  ebay_qty_before integer,
  etsy_qty_before integer,
  
  -- Platform quantities after sync
  ebay_qty_after integer,
  etsy_qty_after integer,
  
  -- Action taken
  action text ('none', 'updated', 'delisted', 'error'),
  action_details jsonb,
  
  created_at timestamptz
);
```

## Configuration

Required environment variables:

### eBay
```
EBAY_CLIENT_ID=your_client_id
EBAY_CLIENT_SECRET=your_client_secret
EBAY_REFRESH_TOKEN=your_refresh_token
EBAY_ENVIRONMENT=production  # or 'sandbox'
```

### Etsy
```
ETSY_API_KEY=your_api_key
ETSY_SHOP_ID=your_shop_id
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Migration Installation

The sync system requires a new migration. To apply it:

### Option 1: Via Supabase CLI
```bash
npx supabase db push
```

### Option 2: Manual SQL
Copy the contents of `supabase/migrations/0016_sync_history.sql` and execute in the Supabase SQL editor.

## Implementation Notes

### Error Handling
- API failures are logged but don't crash the sync
- Partial updates are recorded (some platforms may succeed while others fail)
- Failed syncs are marked with status='failed' and error_message
- Sync automatically continues to next SKU if one fails

### Performance
- Batch operations are used where possible
- Timeouts are set to 15 seconds for API calls (adjustable)
- Index on sync_runs.created_at for fast history queries
- Index on sync_details.sync_run_id for fast detail lookups

### Safety
- Syncs use the maximum quantity across platforms (conservative)
- Never allows overselling (updates only increase, never exceed platform availability)
- All changes are logged immutably in sync_history
- Delisting requires quantity=0 on ALL platforms (not just one)

## Testing

### Manual Testing
```bash
# Trigger a sync
curl -X POST http://localhost:3001/api/sync/trigger \
  -H "Authorization: Bearer your_token" \
  -H "Content-Type: application/json"

# Check status
curl http://localhost:3001/api/sync/status

# Fetch history
curl http://localhost:3001/api/sync/history?limit=5&details=true

# Sync single SKU
curl -X POST http://localhost:3001/api/sync/sku/SKU001/sync-now \
  -H "Authorization: Bearer your_token"
```

### Unit Tests
Create tests in `/tests/syncEngine.test.js`:
- Test quantity comparison logic
- Test delisting logic (both platforms = 0)
- Test API error handling
- Test database record creation

## Future Enhancements

- [ ] Scheduled syncs via cron jobs (every 15 min, hourly, etc.)
- [ ] Webhook listeners for real-time inventory changes from platforms
- [ ] Smart conflict resolution (e.g., prefer platform with higher sales velocity)
- [ ] Inventory reserve system (hold stock for pending orders)
- [ ] Multi-marketplace support (Amazon, Shopify, WooCommerce)
- [ ] Slack notifications for sync errors or major inventory changes
- [ ] Bulk re-listing after sync (auto-relist when quantity > 0)

## Troubleshooting

### "Supabase not configured" error
Check that SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local

### "No eBay access token" error
Verify EBAY_REFRESH_TOKEN is valid and hasn't expired

### "Etsy API error: HTTP 401" error
Verify ETSY_API_KEY and ETSY_SHOP_ID are correct

### Syncs not appearing in history
Ensure migration 0016 has been applied to the database

### Products not syncing
1. Verify products have SKUs (required for matching)
2. Check that marketplace_listings table has entries for products
3. Verify both eBay and Etsy listings are active (not ended)
4. Check logs for specific platform API errors

## Support

For issues or questions:
1. Check the logs: `pages/api/sync/*` and `lib/syncEngine.js` both log errors
2. Review sync history for specific run details
3. Verify all environment variables are set correctly
4. Test platform credentials independently
