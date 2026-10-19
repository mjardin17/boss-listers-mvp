# BossListers Sync Architecture

## The Complete Flow (NOW WORKING)

```
Shopify Store
    ↓
    │ (Pull: /api/inventory/sync-shopify)
    ↓
BossListers Inventory Database
    ├→ (Push: /api/inventory/sync-instagram) → Instagram Shop
    ├→ (Push: /api/inventory/sync-facebook)  → Facebook Marketplace
    └→ (Push: other connectors)              → Other platforms
```

## What's New This Session

### 1. Shopify Inbound Sync ✅ IMPLEMENTED
- **File**: `lib/channels/apiConnectors.js` - `ShopifyConnector.fetchProducts()`
- **What it does**: Reads all products from your connected Shopify store
- **Handles**: Multiple variants per product (each becomes a separate SKU in BossListers)
- **Pagination**: Automatically handles stores with 100+ products
- **API Endpoint**: `POST /api/inventory/sync-shopify`

### 2. Database Schema ✅ VERIFIED
- Products table has `tenant_id` column for multi-tenant support
- Supports Shopify-specific fields: `shopify_product_id`, `shopify_variant_id`
- Upserts by SKU so re-running sync safely updates existing products

## How to Use This Flow

### Step 1: Connect Your Shopify Store
Visit the Channels page and connect your Shopify store if not already connected.

### Step 2: Pull Products from Shopify into BossListers
```bash
curl -X POST http://localhost:3001/api/inventory/sync-shopify \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected response:**
```json
{
  "ok": true,
  "itemsSeen": 5,
  "created": 3,
  "updated": 2,
  "errors": 0,
  "message": "Synced 3 new and updated 2 existing products from Shopify"
}
```

### Step 3: List Products on Other Platforms
Once products are in the BossListers database, list them on Instagram:

```bash
curl -X POST http://localhost:3001/api/inventory/sync-instagram \
  -H "Content-Type: application/json" \
  -d '{
    "sku": "BL-TEST-001",
    "dryRun": false,
    "confirm": true
  }'
```

## Sync Flow Architecture

### Inbound Syncs (Pull FROM platforms)
- **eBay (Modern API)**: `/api/channels/ebay/sync.js` - Sell Inventory API
- **eBay (Legacy API)**: `/api/inventory/sync-ebay.js` - Trading API (bulk import)
- **Shopify**: `/api/inventory/sync-shopify.js` - Admin API (NEW)

### Outbound Syncs (Push TO platforms)
- **Instagram**: `/api/inventory/sync-instagram.js` - Content Publishing API
- **Facebook**: `/api/inventory/sync-facebook.js` - Graph API
- **Others**: Connectors implemented, endpoints can be added (Etsy, Amazon, TikTok Shop, etc.)

## Connector Classes (in lib/channels/apiConnectors.js)
- ✅ EbayConnector - Sell Inventory API (native JS)
- ✅ ShopifyConnector - Admin API (native JS) + NEW fetchProducts()
- ✅ FacebookConnector - Graph API (native JS)
- ✅ InstagramConnector - Content Publishing API (native JS)
- ✅ EtsyConnector - Etsy API (native JS)
- ✅ BonanzaConnector - Bonanza API (native JS)
- ✅ AmazonConnector - Selling Partner API (native JS)
- ✅ TikTokShopConnector - TikTok Shop API (native JS)
- ✅ WooCommerceConnector - REST API (native JS)

## Database Tables Used
- `products` - Central inventory (all sources, all platforms)
- `marketplace_listings` - Tracks which product listed on which platform
- `marketplace_accounts` - Connection credentials & metadata
- `tenant_marketplace_connections` - Per-tenant OAuth tokens
- `sync_logs` - Audit trail of all sync operations

## What Still Needs Work
1. **Outbound sync endpoints** for Etsy, Amazon, TikTok Shop, Bonanza, WooCommerce
2. **Scheduled syncs** (currently manual POST endpoints only)
3. **Error recovery** and retry logic
4. **Progress tracking** for large syncs
5. **Tests** for all sync paths

## Testing This Flow

### Test 1: Shopify Fetch Works
```bash
node test-shopify-flow.js
```
(Tests that ShopifyConnector can read your store)

### Test 2: Full Sync to Database
```bash
curl -X POST http://localhost:3001/api/inventory/sync-shopify \
  -H "Authorization: Bearer SESSION_TOKEN"
```
Then check the database:
```sql
SELECT sku, title, source FROM products WHERE source='shopify' LIMIT 5;
```

### Test 3: Push to Instagram
```bash
curl -X POST http://localhost:3001/api/inventory/sync-instagram \
  -H "Content-Type: application/json" \
  -d '{"sku": "YOUR-SKU", "dryRun": true}'
```

## Next Priority

The immediate goal: **Get ONE end-to-end flow fully working**

Recommended order:
1. ✅ Shopify sync inbound (DONE)
2. Create outbound endpoint for one platform (Instagram or Facebook - already connected)
3. Test full flow: Shopify product → Instagram listing
4. Verify product appears live on Instagram
5. Make a test sale to validate end-to-end

This gives Joshua the ONE working revenue-generating flow he's been waiting for.
