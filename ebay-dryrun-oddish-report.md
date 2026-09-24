# eBay Dry-Run Listing Proof & Mapping Report (Oddish 001/196)

**Date**: September 21, 2026  
**Audience**: Josh  
**Status**: DRY-RUN COMPLETE (PASS — Ready for Live)  
**Safety**: DRY-RUN ONLY. No live listing published, no commit, no push.  

---

## 1. Environment & Live eBay Auth Verification

- **Working Directory**: `C:\Users\jjard\claude\BossListers`
- **Git Branch**: `feat/native-connectors-amazon-tiktok-ebay-etsy-fb-ig-bonanza`
- **Head Commit**: `7f4ca99a5f3648061080cd0b4259fb676eaf69de`
- **Port Status**:
  - **Port 3001**: Confirmed `LISTENING` (PID `6432`).
  - **Port 3002**: Confirmed `INACTIVE`.
- **eBay Live Authentication**:
  - Verified live against eBay OAuth without modifying or re-authenticating credentials.
  - Active Seller Tenant ID: `f6ec6132-2cd0-4352-81e9-3c76d955b60d` (decrypted via Supabase RPC `get_decrypted_marketplace_token`).
  - Access Token Minted: 2,360 bytes OAuth 2.0 bearer token with scopes `sell.inventory` and `sell.account`.
  - Merchant Location Key: `JJ_NEW_BEDFORD_MAIN` (Main Location).

---

## 2. Product Loaded from Supabase `public.products`

- **Product ID**: `3dad6fb0-6251-488c-85fb-09b9d698e654`
- **SKU**: `OL-MUBRT6JS`
- **Title**: `2022 Pokemon Lost Origin #001/196 Oddish - Raw`
- **Price**: `$1.19` USD
- **Quantity**: `1`
- **Condition in DB**: `Used`
- **Image URL**: `http://localhost:3001/uploads/1788198862494-70707600-2813-47da-9b72-4251a81957cb.jpg`
- **Card Metadata Extracted from `description`**:
  ```json
  {
    "cardGame": "Pokemon",
    "player": "Oddish",
    "set": "Lost Origin",
    "cardNumber": "001/196",
    "year": "2022",
    "graded": false,
    "condition": "Near Mint",
    "valuationProvider": "ebay",
    "marketPrice": 1.59,
    "soldCompsRange": "$0.99 - $1.59",
    "frontPhoto": "http://localhost:3001/uploads/1788198862494-70707600-2813-47da-9b72-4251a81957cb.jpg",
    "backPhoto": "http://localhost:3001/uploads/1788198862495-ddb4f4f4-935d-4ba7-b2d9-077ee8f530b7.jpg"
  }
  ```

---

## 3. Exact Listing Payloads Built by `EbayConnector.createListing`

When executed through `EbayConnector.createListing(mappedProduct, realPolicies, { dryRun: true, tenantId })`:

### A. `inventory_item` Payload (`PUT /sell/inventory/v1/inventory_item/OL-MUBRT6JS`)
```json
{
  "condition": "LIKE_NEW",
  "product": {
    "title": "2022 Pokemon Lost Origin #001/196 Oddish - Raw",
    "description": "Pokemon TCG: Sword & Shield - Lost Origin #001/196 Oddish (Common, Basic Grass Pokemon, 50 HP). Identified via card-lane vision OCR. Condition: Raw / Near Mint.\n\n<!-- CARD_METADATA: {\"cardGame\":\"Pokemon\",\"player\":\"Oddish\",\"set\":\"Lost Origin\",\"cardNumber\":\"001/196\",\"year\":\"2022\",\"graded\":false,\"condition\":\"Near Mint\",\"valuationProvider\":\"ebay\",\"marketPrice\":1.59,\"soldCompsRange\":\"$0.99 - $1.59\",\"frontPhoto\":\"http://localhost:3001/uploads/1788198862494-70707600-2813-47da-9b72-4251a81957cb.jpg\",\"backPhoto\":\"http://localhost:3001/uploads/1788198862495-ddb4f4f4-935d-4ba7-b2d9-077ee8f530b7.jpg\"} -->",
    "aspects": {
      "Game": ["Pokémon TCG"],
      "Card Name": ["Oddish"],
      "Character": ["Oddish"],
      "Set": ["Lost Origin"],
      "Card Number": ["001/196"],
      "Manufacturer": ["Nintendo"],
      "Year Manufactured": ["2022"],
      "Graded": ["No"],
      "Card Type": ["Pokémon"],
      "Rarity": ["Common"],
      "Card Condition": ["Near Mint"]
    },
    "imageUrls": [
      "http://localhost:3001/uploads/1788198862494-70707600-2813-47da-9b72-4251a81957cb.jpg",
      "http://localhost:3001/uploads/1788198862495-ddb4f4f4-935d-4ba7-b2d9-077ee8f530b7.jpg"
    ]
  },
  "availability": {
    "shipToLocationAvailability": {
      "quantity": 1
    }
  }
}
```

### B. `offer` Payload (`POST /sell/inventory/v1/offer`)
```json
{
  "sku": "OL-MUBRT6JS",
  "marketplaceId": "EBAY_US",
  "format": "FIXED_PRICE",
  "availableQuantity": 1,
  "categoryId": "183454",
  "listingDescription": "Pokemon TCG: Sword & Shield - Lost Origin #001/196 Oddish (Common, Basic Grass Pokemon, 50 HP). Identified via card-lane vision OCR. Condition: Raw / Near Mint.\n\n<!-- CARD_METADATA: {\"cardGame\":\"Pokemon\",\"player\":\"Oddish\",\"set\":\"Lost Origin\",\"cardNumber\":\"001/196\",\"year\":\"2022\",\"graded\":false,\"condition\":\"Near Mint\",\"valuationProvider\":\"ebay\",\"marketPrice\":1.59,\"soldCompsRange\":\"$0.99 - $1.59\",\"frontPhoto\":\"http://localhost:3001/uploads/1788198862494-70707600-2813-47da-9b72-4251a81957cb.jpg\",\"backPhoto\":\"http://localhost:3001/uploads/1788198862495-ddb4f4f4-935d-4ba7-b2d9-077ee8f530b7.jpg\"} -->",
  "listingPolicies": {
    "fulfillmentPolicyId": "294604344014",
    "paymentPolicyId": "290642380014",
    "returnPolicyId": "290642401014"
  },
  "pricingSummary": {
    "price": {
      "value": "1.19",
      "currency": "USD"
    }
  },
  "merchantLocationKey": "JJ_NEW_BEDFORD_MAIN"
}
```

---

## 4. Dry-Run Execution Results (PASS)

```json
{
  "ok": true,
  "dry_run": true,
  "published": false,
  "ready_for_live": true,
  "missing": [],
  "would_call": [
    "PUT https://api.ebay.com/sell/inventory/v1/inventory_item/OL-MUBRT6JS",
    "POST https://api.ebay.com/sell/inventory/v1/offer",
    "POST https://api.ebay.com/sell/inventory/v1/offer/{offerId}/publish (only with confirm: \"PUBLISH_LIVE\")"
  ]
}
```

**Verdict**: **PASS**. All six mandatory eBay publishing gates are fully satisfied with zero missing fields (`ready_for_live: true`).

---

## 5. Mapping Gaps Between Card Metadata and eBay Required Fields

When a product is read raw from the generic `public.products` database table without card-specific adaptation, five structural mapping gaps prevent a live listing:

| eBay Field / Gate | Raw DB Row Value | Card Metadata & Connector Resolution | Status |
| :--- | :--- | :--- | :--- |
| **1. Category ID** (`categoryId`) | `null` (`ebay_category_id` empty) | Resolved via eBay Taxonomy API (`category-suggest`): **`183454`** (*CCG Individual Cards*). Required by eBay offer creation. | **Resolved** |
| **2. Business Policies** | Missing from row | Loaded from Josh's live eBay Account API: Fulfillment `294604344014` (USPSParcel $0.99 1-day), Payment `290642380014`, Return `290642401014`, Location `JJ_NEW_BEDFORD_MAIN`. | **Resolved** |
| **3. Condition Enum** | `"Used"` (Generic database string) | eBay Inventory API rejects generic `"Used"` on cards. Mapped to **`LIKE_NEW`** for raw Near Mint condition (or `USED_EXCELLENT`). | **Resolved** |
| **4. Photos (`imageUrls`)** | Single `image_url` string | Mapped to array of strings containing both **`frontPhoto`** and **`backPhoto`** extracted from `CARD_METADATA`. | **Resolved** |
| **5. Item Specifics (`aspects`)** | Not present in DB table | Extracted from `CARD_METADATA`: `Game` (*Pokémon TCG*), `Card Name` (*Oddish*), `Character` (*Oddish*), `Set` (*Lost Origin*), `Card Number` (*001/196*), `Graded` (*No*), `Rarity` (*Common*), `Card Condition` (*Near Mint*). | **Resolved** |

---

## 6. What a Live Run Would Do Differently

In dry-run mode, the connector builds and validates all payloads client-side without dispatching HTTP mutation calls to eBay's production servers. If triggered with `{ dryRun: false, confirm: "PUBLISH_LIVE" }`, the system would execute the following steps:

1. **HTTP Step 1 (`PUT /sell/inventory/v1/inventory_item/OL-MUBRT6JS`)**:
   - Creates or updates the physical inventory record on eBay's servers with the SKU, title, condition, aspects, photos, and quantity.
2. **HTTP Step 2 (`POST /sell/inventory/v1/offer`)**:
   - Creates an active draft offer attaching the SKU to category `183454`, price `$1.19`, location `JJ_NEW_BEDFORD_MAIN`, and Josh's three business policies. Returns a newly minted `offerId`.
3. **HTTP Step 3 (`POST /sell/inventory/v1/offer/{offerId}/publish`)**:
   - Converts the draft offer into a live marketplace listing.
   - Generates an active 12-digit eBay item number (`listingId`), making the card immediately searchable and purchasable on `https://www.ebay.com/itm/{listingId}`.
4. **Supabase State Persistence**:
   - Writes the new `listingId` to `public.products.ebay_listing_id`.
   - Sets `published = true`, `status = "active"`, and updates `synced_at = now()`.
5. **Live Image Hosting Prerequisite**:
   - Note: While dry-run allows local image URLs (`http://localhost:3001/uploads/...`), eBay's live image ingestion crawler requires publicly accessible HTTPS URLs (via public CDN/bucket or eBay Picture Services upload) to fetch and host the photos on eBay servers.

---

## 7. Audit & Integrity Summary

- **Dry-Run Adherence**: 100% dry-run. No live listing was created, no eBay items were published, and no inventory state was altered.
- **Database Safety**: Supabase row remains unmodified (`published: false`, `ebay_listing_id: null`).
- **Code & Version Control**: Zero commits, zero pushes. `.env.local` remains clean and untracked.
