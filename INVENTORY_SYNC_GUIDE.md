# eBay Inventory Import & Manual Sync System

Complete guide for BossLister's eBay inventory import and manual sync-to-Etsy workflow.

## Overview

This system enables you to:
1. Import all active eBay listings into BossLister
2. View them in a clean dashboard
3. Manually click "Sync to Etsy" whenever you want
4. Sync single items or bulk-select multiple items
5. Track which platforms each item is synced to

**Key Feature: No automatic syncing — you control when things sync.**

## Architecture

### Components

```
lib/services/ebayImportService.js
  ├─ importEbayListings() — Fetches all eBay listings
  ├─ getEbayAccessToken() — eBay OAuth token refresh
  └─ mapEbayItemToProduct() — Format eBay data to inventory schema

pages/api/inventory/
  ├─ import-ebay.js — POST: Trigger import, save to database
  ├─ list.js — GET: Fetch all inventory with filters
  ├─ sync-to-etsy.js — POST: Sync one or more items to Etsy
  └─ bulk-sync.js — POST: Sync multiple items to multiple platforms

pages/inventory-dashboard.js
  └─ React component: UI for import, view, and sync

styles/inventory-dashboard.module.css
  └─ Dashboard styling
```

### Database Schema

Extended `products` table with sync fields:

```sql
-- New columns added by migration 0020
synced_to jsonb              -- JSON array: ["etsy", "facebook"]
sync_status text             -- "pending" | "synced" | "failed"
sync_error text              -- Error message if failed
last_synced_at timestamp     -- When sync succeeded
ebay_item_id text           -- eBay listing ID
external_ids jsonb          -- {ebay_id, etsy_id, facebook_id, ...}
```

## Workflow

### 1. Import from eBay

```
User clicks "Import from eBay"
↓
POST /api/inventory/import-ebay
↓
ebayImportService.importEbayListings()
  ├─ Get OAuth access token
  ├─ Fetch all active inventory from eBay API
  └─ Map fields (sku, title, price, qty, images, condition)
↓
Save to products table (upsert on SKU)
↓
Show: "Imported 25 items, 3 skipped, 0 errors"
```

**eBay Data Extracted:**
- Item ID → SKU (as `EBY-{itemid}` if no SKU)
- Title, Description, Price, Quantity
- Images (up to 4)
- Condition
- Category

### 2. View Inventory Dashboard

```
GET /api/inventory/list?source=all&syncStatus=all
↓
Returns: [
  {
    id: "...",
    sku: "EBY-12345",
    title: "Test Item",
    price: 99.99,
    quantity: 5,
    imageUrl: "...",
    source: "ebay",
    syncStatus: "pending",
    syncedTo: [],
    lastSyncedAt: null
  },
  ...
]
↓
Dashboard displays:
  ✓ Table: SKU, Product (with thumbnail), Price, Qty, Source, Sync Status
  ✓ Filters: Source (All/eBay/Manual), Status (All/Not Synced/Synced)
  ✓ Bulk selection with checkboxes
  ✓ Individual or bulk "Sync to Etsy" buttons
```

### 3. Sync Item to Etsy (Manual)

**Single item sync:**
```
User clicks "Sync to Etsy" on one item
↓
POST /api/inventory/sync-to-etsy
  body: { sku: "EBY-12345" }
↓
Check if already synced
  if synced → "Already synced to Etsy" error
↓
Create DRAFT listing on Etsy
  (dryRun: false, targetState: "draft")
↓
Save listing ID to products.external_ids
↓
Update sync status:
  synced_to: ["etsy"]
  sync_status: "synced"
  last_synced_at: now
↓
Show: "✓ Synced to Etsy"
```

**Bulk sync:**
```
User selects 3 items + clicks "Sync Selected to Etsy"
↓
POST /api/inventory/bulk-sync
  body: { 
    skus: ["EBY-1", "EBY-2", "EBY-3"],
    platforms: ["etsy"]
  }
↓
For each SKU:
  ├─ Fetch product from DB
  ├─ Check not already synced
  ├─ Create Etsy listing (draft)
  ├─ Save external ID
  └─ Update sync status
↓
Show: "Synced 3 items"
```

## API Endpoints

### POST /api/inventory/import-ebay

Triggers eBay import. Fetches all active seller listings and saves them.

**Request:**
```bash
curl -X POST http://localhost:3001/api/inventory/import-ebay
```

**Response:**
```json
{
  "ok": true,
  "imported": 25,
  "skipped": 3,
  "failed": 0,
  "errors": ["Error message 1", ...]
}
```

**Status Codes:**
- `200` - Success
- `503` - Supabase/eBay not configured
- `500` - Unexpected error

---

### GET /api/inventory/list

Fetch all inventory items with optional filters.

**Query Parameters:**
- `source` - Filter: "all", "ebay", "manual" (default: "all")
- `syncStatus` - Filter: "all", "pending", "synced", "failed" (default: "all")

**Request:**
```bash
curl "http://localhost:3001/api/inventory/list?source=ebay&syncStatus=pending"
```

**Response:**
```json
{
  "ok": true,
  "items": [
    {
      "id": "...",
      "sku": "EBY-12345",
      "title": "Product Title",
      "price": 99.99,
      "quantity": 5,
      "imageUrl": "https://...",
      "source": "ebay",
      "condition": "New",
      "syncStatus": "pending",
      "syncedTo": [],
      "lastSyncedAt": null,
      "ebayItemId": "12345",
      "externalIds": { "ebay_id": "12345" }
    },
    ...
  ],
  "count": 25
}
```

---

### POST /api/inventory/sync-to-etsy

Sync one or more items to Etsy. Creates DRAFT listings only.

**Request:**
```bash
# Single item
curl -X POST http://localhost:3001/api/inventory/sync-to-etsy \
  -H "Content-Type: application/json" \
  -d '{ "sku": "EBY-12345" }'

# Multiple items
curl -X POST http://localhost:3001/api/inventory/sync-to-etsy \
  -H "Content-Type: application/json" \
  -d '{ "skus": ["EBY-1", "EBY-2", "EBY-3"] }'
```

**Response:**
```json
{
  "ok": true,
  "synced": 1,
  "failed": 0,
  "results": [
    {
      "sku": "EBY-12345",
      "success": true,
      "etsyListingId": "1234567890"
    }
  ]
}
```

**Status Codes:**
- `200` - At least one succeeded
- `400` - Missing required fields
- `409` - Etsy not connected or item already synced
- `500` - Unexpected error

---

### POST /api/inventory/bulk-sync

Sync multiple items to multiple platforms in one call.

**Request:**
```bash
curl -X POST http://localhost:3001/api/inventory/bulk-sync \
  -H "Content-Type: application/json" \
  -d '{
    "skus": ["EBY-1", "EBY-2", "EBY-3"],
    "platforms": ["etsy"]
  }'
```

**Response:**
```json
{
  "ok": true,
  "synced": 2,
  "failed": 1,
  "results": [
    {
      "sku": "EBY-1",
      "platforms": {
        "etsy": {
          "success": true,
          "etsyListingId": "1234567890"
        }
      }
    },
    {
      "sku": "EBY-2",
      "platforms": {
        "etsy": {
          "success": false,
          "error": "Already synced"
        }
      }
    },
    ...
  ]
}
```

## Database Migration

Run migration 0020 to add sync fields:

```bash
# Via Supabase CLI
supabase migration up

# Or manually via Supabase dashboard
# SQL migrations/0020_add_inventory_sync_fields.sql
```

**Fields Added:**
- `synced_to` - JSON array of platform names
- `sync_status` - "pending" | "synced" | "failed"
- `sync_error` - Error message
- `last_synced_at` - Timestamp
- `ebay_item_id` - eBay listing ID
- `external_ids` - JSON mapping of platform IDs

**Indexes Added:**
- `idx_products_sync_status` - Fast filtering by sync_status
- `idx_products_source_sync_status` - Fast filtering by source + sync_status

## Configuration

### Required Environment Variables

**eBay:**
```bash
EBAY_CLIENT_ID=your_client_id
EBAY_CLIENT_SECRET=your_client_secret
EBAY_REFRESH_TOKEN=your_refresh_token
EBAY_ENVIRONMENT=sandbox  # or "production"
```

**Etsy** (for syncing):
```bash
ETSY_KEYSTRING=your_keystring
ETSY_SHARED_SECRET=your_shared_secret
ETSY_REDIRECT_URI=https://your-app.com/api/oauth/etsy/callback
```

**Supabase:**
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Testing

Run the test suite:

```bash
npm test tests/inventory-import.test.js
```

**Test Coverage:**
- ✓ Product mapping (eBay → inventory schema)
- ✓ SKU generation (EBY-{itemid})
- ✓ Inventory data structure
- ✓ Sync status updates
- ✓ Error handling (already synced, etc.)
- ✓ Filter logic (source, status)
- ✓ Bulk sync (multiple items)
- ✓ Image limiting (max 4)
- ✓ Quantity validation (skip zero)
- ✓ Multiple platform sync (user control)
- ✓ Manual control (no auto-sync)

## Usage Examples

### Example 1: Import and Sync One Item

```javascript
// Step 1: Import from eBay
const importRes = await fetch('/api/inventory/import-ebay', { method: 'POST' });
const importData = await importRes.json();
console.log(`Imported ${importData.imported} items`);

// Step 2: List inventory
const listRes = await fetch('/api/inventory/list?source=ebay&syncStatus=pending');
const { items } = await listRes.json();
console.log(`${items.length} items not yet synced`);

// Step 3: Sync first item to Etsy
const syncRes = await fetch('/api/inventory/sync-to-etsy', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sku: items[0].sku })
});
const syncData = await syncRes.json();
console.log(syncData.ok ? '✓ Synced' : `✗ Failed: ${syncData.results[0].error}`);
```

### Example 2: Bulk Sync Multiple Items

```javascript
// Get items to sync
const listRes = await fetch('/api/inventory/list?syncStatus=pending');
const { items } = await listRes.json();

// Bulk sync first 5
const skus = items.slice(0, 5).map(i => i.sku);
const res = await fetch('/api/inventory/bulk-sync', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    skus,
    platforms: ['etsy']
  })
});
const data = await res.json();
console.log(`Synced ${data.synced} items to Etsy`);
```

### Example 3: Filter by Source and Status

```javascript
// Show only eBay items not yet synced
const res = await fetch('/api/inventory/list?source=ebay&syncStatus=pending');
const { items, count } = await res.json();
console.log(`${count} eBay items ready to sync`);
```

## Troubleshooting

### "eBay not configured"
- Check `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_REFRESH_TOKEN` are set
- Verify refresh token hasn't expired (regenerate in eBay Developer Center)

### "Etsy not connected"
- Set `ETSY_KEYSTRING`, `ETSY_SHARED_SECRET`, `ETSY_REDIRECT_URI`
- Verify Etsy app is registered and approved

### "Product not found"
- Run import-ebay first to populate inventory
- Check SKU is exactly matching (case-sensitive)

### "Already synced to Etsy"
- Item's `synced_to` array includes "etsy"
- To resync, manually update database or contact support

### "Supabase not configured"
- Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- Verify migration 0020 has run

## Future Enhancements

- [ ] Sync to Facebook Marketplace (stub exists)
- [ ] Sync to TikTok Shop
- [ ] Inventory level sync (update quantities after sales)
- [ ] Sync scheduling (automated, configurable)
- [ ] Multi-channel sync to all platforms at once
- [ ] Bulk action: "Sync all not-synced items"
- [ ] Duplicate detection (same product on multiple listings)
- [ ] Pricing rules (different prices per platform)

## Support

For issues or questions:
1. Check the test suite: `tests/inventory-import.test.js`
2. Review API responses for error messages
3. Check Supabase logs for database errors
4. Check eBay/Etsy API documentation for auth issues
