# Multi-Platform Posting System

## Overview

Complete end-to-end multi-platform product posting system for BossListers. Enables users to post a product to eBay, Etsy, Amazon, and TikTok Shop simultaneously with a single click.

## Architecture

### Core Components

#### 1. **lib/multiPlatformPoster.js**
Core orchestration logic that:
- Maps product fields to platform-specific schemas
- Posts to multiple platforms in parallel
- Handles platform-specific errors
- Tracks listing IDs per platform

**Key Functions:**
- `postProductToAllPlatforms(product, platforms, options)` - Main entry point
  - Takes a product object and list of platforms
  - Returns results object with per-platform success/failure status
  - Supports dry-run mode for preview
  - Returns listing IDs on success

- `retryFailedPlatforms(product, platformsToRetry, priorResults, options)` - Retry logic
  - Retries only failed platforms from a previous attempt
  - Includes exponential backoff
  - Merges results with prior attempt

#### 2. **pages/api/inventory/post-to-platforms.js**
HTTP API endpoint (`POST /api/inventory/post-to-platforms`)

**Request Body:**
```json
{
  "productSKU": "SKU-001",
  "platforms": ["ebay", "etsy", "amazon", "tiktok-shop"],
  "dryRun": true,
  "confirm": "PUBLISH_LIVE"
}
```

**Response:**
```json
{
  "ok": true,
  "productSKU": "SKU-001",
  "dryRun": true,
  "results": {
    "ebay": {
      "success": true,
      "listingId": "12345678",
      "url": "https://ebay.com/itm/12345678",
      "publishedAt": "2026-09-11T10:30:00Z"
    },
    "etsy": {
      "success": false,
      "error": "etsy_not_connected",
      "code": "etsy_not_connected",
      "statusCode": 409
    },
    "amazon": { /* ... */ },
    "tiktok-shop": { /* ... */ }
  },
  "summary": {
    "total": 4,
    "successful": 1,
    "failed": 3
  }
}
```

**Features:**
- Fetches product from database
- Validates inventory before posting
- Tracks listing IDs in `external_ids` field
- Updates `synced_to` array per platform
- Handles all platform-specific errors gracefully

#### 3. **components/PostToPlatformsDialog.tsx**
React component for platform selection and posting workflow.

**Features:**
- Platform selection checkboxes (eBay, Etsy, Amazon, TikTok)
- Live vs Preview mode toggle
- Real-time result display with:
  - Success/failure indicator per platform
  - Listing ID and direct links on success
  - Detailed error messages on failure
- Responsive design

#### 4. **pages/inventory.js** (Updated)
Inventory page with integrated posting workflow.

**Changes:**
- Added "Post" button in actions column
- Opens `PostToPlatformsDialog` modal
- Supports posting any product to any platform
- Refreshes product list after posting

## Field Mapping

Each platform has different field requirements. The system automatically maps product fields:

### eBay
```javascript
{
  sku, title, description, price, quantity,
  category_id, condition, image_urls,
  marketplace_id, currency, aspects
}
```

### Etsy
```javascript
{
  sku, title, description, price, quantity,
  taxonomy_id, who_made, when_made, is_supply,
  shipping_profile_id, images, tags, materials
}
```

### Amazon
```javascript
{
  sku, title, description, price, quantity,
  category, brand, condition, bullet_points, image_urls
}
```

### TikTok Shop
```javascript
{
  sku, title, description, price, quantity,
  category, tags, image_paths, condition
}
```

## Workflow

### User Flow

1. **Navigate to Inventory Page** → `/inventory`
2. **Find Product** → Use search or browse table
3. **Click "Post" Button** → Opens platform selection dialog
4. **Select Platforms** → Check eBay, Etsy, Amazon, TikTok (any combination)
5. **Choose Mode** → Preview or Live posting
6. **Click "Post to Selected"** → System posts to all selected platforms
7. **View Results** → See success/failure per platform with listing links

### Technical Flow

```
User clicks "Post" on product
    ↓
PostToPlatformsDialog opens with product SKU
    ↓
User selects platforms + mode
    ↓
Dialog calls POST /api/inventory/post-to-platforms
    ↓
API endpoint fetches product from Supabase
    ↓
Calls multiPlatformPoster.postProductToAllPlatforms()
    ↓
For each platform in parallel:
  - Map product fields to platform schema
  - Create listing via platform connector
  - Capture listing ID or error
    ↓
API updates product record with external IDs
    ↓
Returns results to dialog
    ↓
Dialog displays per-platform success/failure with links
```

## Error Handling

### Platform-Specific Errors

Each platform's connector throws specific error types:
- `EbayListingError` - eBay listing operation failed
- `EtsyListingError` - Etsy listing operation failed
- `AmazonListingError` - Amazon listing operation failed
- `TikTokShopListingError` - TikTok Shop listing operation failed

### Common Error Codes

| Code | Meaning | Recovery |
|------|---------|----------|
| `{platform}_not_connected` | Platform credentials not set up | Configure in Channels page |
| `credentials_missing` | Required API credentials missing | Set environment variables |
| `bridge_unreachable` | Python listing service bridge not running | Start `scripts/ebay_listing_service.py` |
| `token_refresh_failed` | OAuth token refresh failed | Reconnect platform account |
| `bridge_bad_response` | Listing service returned invalid response | Check service logs |

### Retry Strategy

API endpoint catches all errors and returns them to client:
- Successful postings are tracked immediately
- Failed postings include error details
- Client UI displays results with per-platform status
- User can manually retry failed platforms later

## Database Integration

### Product Record Updates

When posting succeeds, the API updates the product record:

```javascript
// external_ids: Track listing IDs for each platform
external_ids: {
  ebay_listing_id: "12345678",
  ebay_url: "https://ebay.com/itm/12345678",
  ebay_posted_at: "2026-09-11T10:30:00Z",
  etsy_listing_id: null,
  amazon_listing_id: null,
  "tiktok-shop_listing_id": "abcd1234"
}

// synced_to: List of platforms this product is on
synced_to: ["ebay", "tiktok-shop"]

// Timestamps
last_posted_at: "2026-09-11T10:30:00Z"
sync_status: "posted"
```

## Preview Mode vs Live Mode

### Preview Mode (dryRun: true)
- **Default mode** for safety
- Sends request to platform connectors
- Platform connectors validate but don't create listings
- User can see exactly what will be posted
- No listings created on platforms
- **Recommended for first-time posting**

### Live Mode (dryRun: false)
- **Requires explicit opt-in** via checkbox
- Requires `confirm: "PUBLISH_LIVE"` header
- Python bridge service must be started with `--allow-live` flag
- Creates actual listings on platforms
- Listings immediately visible on marketplaces
- **Track all listing IDs in database**

## Configuration

### Required Environment Variables

**All platforms require respective connector credentials — see `.env.example` for specifics:**

```bash
# eBay (see: lib/channels/apiConnectors.js, lines 50-51)
EBAY_CLIENT_ID=...
EBAY_CLIENT_SECRET=...
EBAY_REFRESH_TOKEN=...
EBAY_ENVIRONMENT=production|sandbox

# Etsy (see: lib/channels/apiConnectors.js, line 357)
ETSY_KEYSTRING=...
ETSY_SHARED_SECRET=...
ETSY_REDIRECT_URI=...

# Amazon (see: lib/channels/apiConnectors.js, line 1163)
AMAZON_CLIENT_ID=...
AMAZON_CLIENT_SECRET=...
AMAZON_REFRESH_TOKEN=...
AMAZON_SELLER_ID=...

# TikTok Shop (see: lib/channels/apiConnectors.js, line 1316)
TIKTOK_SHOP_CLIENT_ID=...
TIKTOK_SHOP_CLIENT_SECRET=...
TIKTOK_SHOP_REFRESH_TOKEN=...
TIKTOK_SHOP_MERCHANT_ID=...

# Supabase (required for product database)
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Python Listing Service Bridge

For eBay and Etsy, the system delegates listing creation to `scripts/ebay_listing_service.py`:

```bash
# Start the bridge service (required for live postings)
python scripts/ebay_listing_service.py --allow-live

# The bridge listens on http://127.0.0.1:8791
# Endpoints:
#   POST /ebay/create-listing
#   POST /etsy/create-listing
#   POST /amazon/create-listing
#   POST /tiktok/create-listing
```

## Testing

Run the test suite:
```bash
npm test -- __tests__/multiPlatformPoster.test.js
```

**Test Coverage:**
- Platform field mappers (eBay, Etsy, Amazon, TikTok)
- Product validation (SKU, title, platforms)
- Error handling (unknown platforms, missing fields)
- Edge cases (zero price, high quantity, minimal product data)

## Examples

### Post Single Product to All Platforms

1. Navigate to `/inventory`
2. Find product in table
3. Click "Post" button
4. Toggle "Post Live to Marketplaces" ON
5. Check: eBay, Etsy, Amazon, TikTok Shop
6. Click "Post to Selected"
7. See results with listing links

### Post to Specific Platforms

1. Open post dialog
2. Select only desired platforms (e.g., eBay + Amazon)
3. Keep preview mode ON for testing
4. Click "Post to Selected"
5. Review results before switching to live mode

### Retry Failed Platform

1. After posting, if one platform fails
2. Note which platform failed
3. Click "Start Over" button
4. Select only the failed platform
5. Switch to live mode (if preview mode was selected before)
6. Click "Post to Selected"

## Debugging

### View Posting Logs

```bash
# Server-side logs
tail -f .logs/api-inventory-post-to-platforms.log

# Client-side (browser console)
# Check Network tab for POST /api/inventory/post-to-platforms request
# Response includes detailed error messages per platform
```

### Test API Directly

```bash
curl -X POST http://localhost:3000/api/inventory/post-to-platforms \
  -H "Content-Type: application/json" \
  -d '{
    "productSKU": "TEST-SKU",
    "platforms": ["ebay"],
    "dryRun": true
  }'
```

### Platform Connection Status

Visit `/channels` page to see which platforms are connected and configured.

## Future Enhancements

### Planned Features
1. **Bulk posting** - Post multiple products at once
2. **Scheduling** - Schedule posts for future time
3. **Template mapping** - Save custom field mappings per platform
4. **Batch retry** - Retry all failed postings with one click
5. **Analytics** - Track which platforms have best conversion
6. **Sync updates** - Sync inventory changes back to posted listings

### Known Limitations
1. Amazon SP-API has stricter rate limiting than other platforms
2. TikTok Shop API is newer and may have breaking changes
3. Per-tenant credentials not yet implemented (uses shared app credentials)
4. Listing updates/deletes not yet supported (only creation)

## Support

- **eBay Docs:** https://developer.ebay.com/
- **Etsy Docs:** https://developers.etsy.com/documentation
- **Amazon Docs:** https://developer-docs.amazon.com/sp-api
- **TikTok Docs:** https://seller.tiktok.com/

## Files Modified

- `lib/multiPlatformPoster.js` - NEW
- `pages/api/inventory/post-to-platforms.js` - NEW
- `components/PostToPlatformsDialog.tsx` - NEW
- `pages/inventory.js` - UPDATED
- `__tests__/multiPlatformPoster.test.js` - NEW (tests)
