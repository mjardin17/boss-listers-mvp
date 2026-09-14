# Multi-Platform Posting System - Architecture

## High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BROWSER / CLIENT                             │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  /inventory Page (pages/inventory.js)                        │  │
│  │  ────────────────────────────────────────────────────────    │  │
│  │  • Product list table with "Post" button                    │  │
│  │  • Inventory management (add/edit/delete)                   │  │
│  │  • State: showPostDialog, postDialogProduct                │  │
│  │  • Button click → Opens PostToPlatformsDialog             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│           │                                                           │
│           │ imports & renders                                        │
│           ▼                                                           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  PostToPlatformsDialog (components/PostToPlatformsDialog.tsx)│  │
│  │  ────────────────────────────────────────────────────────    │  │
│  │  • Platform selection (checkboxes)                          │  │
│  │  • Live/Preview mode toggle                                 │  │
│  │  • Results display with per-platform status                │  │
│  │  • Direct links to marketplace listings                     │  │
│  │  • State: selectedPlatforms, posting, results               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│           │                                                           │
│           │ POST /api/inventory/post-to-platforms                    │
│           ▼                                                           │
└───────────┼───────────────────────────────────────────────────────────┘
            │
            │ HTTP Request
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND / SERVER                                  │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  POST /api/inventory/post-to-platforms                      │  │
│  │  (pages/api/inventory/post-to-platforms.js)                 │  │
│  │  ────────────────────────────────────────────────────────    │  │
│  │  • Validate request (productSKU, platforms)                │  │
│  │  • Fetch product from Supabase                             │  │
│  │  • Check inventory quantity                                │  │
│  │  • Call postProductToAllPlatforms()                        │  │
│  │  • Update product record with listing IDs                 │  │
│  │  • Return results                                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│           │                                                           │
│           │ imports & calls                                          │
│           ▼                                                           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  multiPlatformPoster.postProductToAllPlatforms()            │  │
│  │  (lib/multiPlatformPoster.js)                               │  │
│  │  ────────────────────────────────────────────────────────    │  │
│  │  • Map product fields to platform schemas                 │  │
│  │  • Create promises for each platform                       │  │
│  │  • Post in parallel (Promise.all)                         │  │
│  │  • Capture results/errors per platform                    │  │
│  │  • Return results object                                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│           │                                                           │
│           ├─────────┬──────────┬──────────┬─────────────┐            │
│           │ calls   │ calls    │ calls    │ calls       │            │
│           ▼         ▼          ▼          ▼             ▼            │
│  ┌─────────────┐ ┌────────┐ ┌────────┐ ┌──────────┐                 │
│  │EbayConnector│ │EtsyConn│ │AmazonC │ │TikTokConn│                │
│  │.create      │ │.create │ │.create │ │.create   │                │
│  │Listing()    │ │Listing()│ │Listing()│ │Listing()  │                │
│  └──────┬──────┘ └────┬───┘ └────┬───┘ └──────┬────┘                │
│         │              │          │           │                      │
│         │              │ calls    │           │                      │
│         └──────────────┼──────────┼───────────┘                      │
│                        ▼          ▼                                   │
│         ┌──────────────────────────────────────────┐                │
│         │  Python Listing Service Bridge           │                │
│         │  (scripts/ebay_listing_service.py)       │                │
│         │  localhost:8791                          │                │
│         │  ─────────────────────────────────────   │                │
│         │  • /ebay/create-listing                 │                │
│         │  • /etsy/create-listing                 │                │
│         │  • /amazon/create-listing               │                │
│         │  • /tiktok/create-listing               │                │
│         └─────────────┬────────────────────────────┘                │
│                       │                                              │
│                       ├──────────┬──────────┬─────────────┐          │
│                       │ HTTP     │ HTTP     │ HTTP        │          │
│                       ▼          ▼          ▼             ▼          │
└───────────────────────┼──────────┼──────────┼──────────────────────┘
                        │          │          │             
                        │          │          │          EXTERNAL APIS
                        ▼          ▼          ▼             
                     ┌──────┐  ┌──────┐  ┌──────────┐
                     │ eBay │  │ Etsy │  │ Amazon   │
                     │ API  │  │ API  │  │ SP-API   │
                     └──────┘  └──────┘  └──────────┘
                              │
                              ▼
                        ┌──────────────┐
                        │ TikTok Shop  │
                        │ API          │
                        └──────────────┘
```

## Component Dependency Tree

```
pages/inventory.js (inventory management page)
├── components/PostToPlatformsDialog.tsx (modal dialog)
│   └── lib/clientAuth (authentication helper)
│       └── authedFetch() (makes HTTP requests)
│           │
│           └─── POST /api/inventory/post-to-platforms
│               │
│               └── pages/api/inventory/post-to-platforms.js (API handler)
│                   ├── @supabase/supabase-js (database)
│                   │   └── listings table (product data)
│                   │
│                   └── lib/multiPlatformPoster.js (core orchestration)
│                       ├── EbayConnector
│                       ├── EtsyConnector
│                       ├── AmazonConnector
│                       └── TikTokShopConnector
│                           └── Python Bridge Service
│                               ├── HTTP POST /ebay/create-listing
│                               ├── HTTP POST /etsy/create-listing
│                               ├── HTTP POST /amazon/create-listing
│                               └── HTTP POST /tiktok/create-listing
```

## Data Flow Diagram

```
1. USER ACTION
   User clicks "Post" button on product row
   ↓
2. DIALOG OPENS
   PostToPlatformsDialog renders with:
   - productSKU: "SKU-001"
   - productTitle: "iPhone 14 Pro"
   ↓
3. USER SELECTS
   User checks platforms: [eBay, Amazon]
   User toggles: Live Mode ON
   ↓
4. REQUEST SENT
   POST /api/inventory/post-to-platforms
   {
     "productSKU": "SKU-001",
     "platforms": ["ebay", "amazon"],
     "dryRun": false,
     "confirm": "PUBLISH_LIVE"
   }
   ↓
5. SERVER VALIDATES
   • Product exists? ✓
   • Quantity > 0? ✓
   • Platforms valid? ✓
   ↓
6. FETCH PRODUCT
   Query: SELECT * FROM listings WHERE sku='SKU-001'
   Result:
   {
     sku: "SKU-001",
     title: "iPhone 14 Pro",
     price: 899.99,
     quantity: 5,
     ...
   }
   ↓
7. ORCHESTRATE POSTING
   Call postProductToAllPlatforms() with:
   - product data
   - ["ebay", "amazon"]
   - { dryRun: false, confirm: "PUBLISH_LIVE" }
   ↓
8. MAP FIELDS (per platform)
   For eBay: { sku, title, description, price, quantity, ... }
   For Amazon: { sku, title, description, price, quantity, ... }
   ↓
9. POST IN PARALLEL
   Promise.all([
     ebayConnector.createListing(ebayProduct, options),
     amazonConnector.createListing(amazonProduct, options)
   ])
   ↓
10. CONNECTORS DELEGATE
    Each connector calls Python bridge service:
    POST http://127.0.0.1:8791/ebay/create-listing
    POST http://127.0.0.1:8791/amazon/create-listing
    ↓
11. BRIDGE CREATES LISTINGS
    Python service:
    - Calls eBay API → eBay creates listing → returns listing_id
    - Calls Amazon API → Amazon creates listing → returns feed_id
    ↓
12. RESULTS COLLECTED
    {
      "ebay": {
        "success": true,
        "listingId": "12345678",
        "url": "https://ebay.com/itm/12345678"
      },
      "amazon": {
        "success": true,
        "listingId": "feed-9999",
        "url": "https://sellercentral.amazon.com/gp/mws/feed/id/feed-9999"
      }
    }
    ↓
13. UPDATE DATABASE
    UPDATE listings SET
      external_ids = {
        ebay_listing_id: "12345678",
        ebay_url: "https://ebay.com/itm/12345678",
        amazon_listing_id: "feed-9999",
        amazon_url: "https://sellercentral.amazon.com/...."
      },
      synced_to = ["ebay", "amazon"],
      last_posted_at = NOW()
    WHERE sku = 'SKU-001'
    ↓
14. RETURN RESPONSE
    HTTP 200 OK
    {
      "ok": true,
      "results": { ... },
      "summary": { "total": 2, "successful": 2, "failed": 0 }
    }
    ↓
15. DISPLAY RESULTS
    Dialog shows:
    ✓ eBay - Listing ID: 12345678 - View listing →
    ✓ Amazon - Listing ID: feed-9999 - View listing →
    ↓
16. USER CLOSES
    User clicks "Done"
    Dialog closes
    Inventory page refreshes to show updated product status
```

## Error Handling Flow

```
ERROR AT ANY STAGE
    ↓
┌─────────────────────────────────────────┐
│ WHERE DID ERROR OCCUR?                  │
└─────────────────────────────────────────┘
    │
    ├─ INPUT VALIDATION ERROR
    │  └─ Return 400 Bad Request
    │     "products must be a non-empty array"
    │
    ├─ DATABASE ERROR (product not found)
    │  └─ Return 404 Not Found
    │     "Product not found: SKU-001"
    │
    ├─ POSTING ERROR (one platform fails)
    │  └─ postProductToAllPlatforms() catches
    │  ├─ Stores error in results[platform]
    │  └─ Returns partial success
    │     Other platforms still succeed
    │
    ├─ BRIDGE ERROR (service unreachable)
    │  └─ Connector throws error
    │  ├─ Caught by postProductToAllPlatforms()
    │  └─ Result: { success: false, error: "..." }
    │
    └─ CRITICAL ERROR (all platforms fail)
       └─ postProductToAllPlatforms() throws
       └─ API catches and returns 500
          "All platforms failed: eBay: ...; Amazon: ..."

RESULTS IN ALL CASES
    ↓
    Dialog displays error to user
    User can retry, fix issue, or start over
```

## Platform Integration Points

```
┌─ eBay Integration
│  ├─ Credentials: EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_REFRESH_TOKEN
│  ├─ OAuth: Refresh token exchange for access token
│  ├─ Bridge: Python service at /ebay/create-listing
│  └─ Response: { listing_id, offer_id, steps, payloads }
│
├─ Etsy Integration
│  ├─ Credentials: ETSY_KEYSTRING, ETSY_SHARED_SECRET
│  ├─ OAuth: Per-tenant refresh token in Supabase
│  ├─ Bridge: Python service at /etsy/create-listing
│  └─ Response: { listing_id, shop_id }
│
├─ Amazon Integration
│  ├─ Credentials: AMAZON_CLIENT_ID, AMAZON_CLIENT_SECRET, AMAZON_REFRESH_TOKEN
│  ├─ OAuth: Refresh token exchange
│  ├─ Direct API: Amazon SP-API v2021-06-30
│  └─ Response: { feedId, url }
│
└─ TikTok Shop Integration
   ├─ Credentials: TIKTOK_SHOP_CLIENT_ID, TIKTOK_SHOP_CLIENT_SECRET, TIKTOK_SHOP_REFRESH_TOKEN
   ├─ OAuth: Refresh token exchange
   ├─ Direct API: TikTok Shop API v1
   └─ Response: { productId, url }
```

## Database Schema (Relevant Parts)

```sql
-- listings table (Supabase)
CREATE TABLE listings (
  -- Key fields
  sku VARCHAR PRIMARY KEY,
  title VARCHAR NOT NULL,
  description TEXT,
  price NUMERIC,
  quantity INTEGER,
  
  -- Marketplace tracking (NEW/UPDATED)
  external_ids JSONB DEFAULT '{}',  -- {ebay_listing_id, etsy_listing_id, ...}
  synced_to TEXT[] DEFAULT '{}',    -- ['ebay', 'amazon', 'tiktok-shop']
  last_posted_at TIMESTAMP,
  sync_status VARCHAR,              -- 'posted', 'failed', etc.
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Example external_ids structure
{
  "ebay_listing_id": "12345678",
  "ebay_url": "https://ebay.com/itm/12345678",
  "ebay_posted_at": "2026-09-11T10:30:00Z",
  "etsy_listing_id": "9876543",
  "etsy_url": "https://etsy.com/listing/9876543",
  "etsy_posted_at": "2026-09-11T10:35:00Z",
  "amazon_listing_id": "FEED-1234",
  "amazon_url": "https://sellercentral.amazon.com/gp/mws/feed/id/FEED-1234",
  "amazon_posted_at": "2026-09-11T10:40:00Z",
  "tiktok-shop_listing_id": "prod-abcd1234",
  "tiktok-shop_url": "https://seller.tiktokshops.com/product/prod-abcd1234",
  "tiktok-shop_posted_at": "2026-09-11T10:45:00Z"
}
```

## Deployment Architecture

```
Production Environment
├── Next.js Application Server
│   ├── /pages/inventory.js
│   ├── /pages/api/inventory/post-to-platforms.js
│   └── /components/PostToPlatformsDialog.tsx
│
├── Supabase Database
│   └── listings table
│
├── Python Listing Service Bridge
│   └── localhost:8791
│       └── Runs as background process
│
├── Platform API Credentials
│   └── Environment Variables
│       ├── EBAY_*
│       ├── ETSY_*
│       ├── AMAZON_*
│       └── TIKTOK_*
│
└── External Marketplace APIs
    ├── eBay API
    ├── Etsy Open API
    ├── Amazon SP-API
    └── TikTok Shop API
```

## Key Technologies

```
Frontend:
  • React 18+ (hooks)
  • TypeScript
  • Next.js
  • Tailwind CSS

Backend:
  • Next.js API Routes
  • Node.js
  • Supabase (PostgreSQL)
  • Python (for listing service bridge)

Integration:
  • eBay API (OAuth 2.0)
  • Etsy API (OAuth 2.0, PKCE)
  • Amazon SP-API (OAuth 2.0)
  • TikTok Shop API (OAuth 2.0)

Testing:
  • Jest
  • React Testing Library (ready)
  • Manual E2E testing

Monitoring:
  • Server logs
  • Browser console
  • Network tab (DevTools)
```

---

This architecture enables:
✅ Single-click multi-platform posting
✅ Parallel processing for performance
✅ Per-platform error handling
✅ Graceful fallback on partial failures
✅ Audit trail via external_ids
✅ Extensibility for new platforms
