# BossListers Photo Storage Wiring Report

**Date:** 2026-09-23  
**Working Directory:** `C:\Users\jjard\claude\BossListers`  
**Git Remote:** `origin https://github.com/mjardin17/boss-listers-mvp.git`  
**Git Branch:** `feat/native-connectors-amazon-tiktok-ebay-etsy-fb-ig-bonanza`  
**Dev Server:** Port 3001 (PID 23416)  

---

## 1. Problem Statement

Product photos saved through the omni-lister and analyze flows end up in the `products.image_url` column as localhost URLs (`http://localhost:3001/uploads/...`) or relative paths (`/uploads/...`). When these URLs are passed to marketplace listing APIs (eBay, Facebook, Instagram, etc.), the marketplace servers cannot fetch them — they need publicly-accessible HTTPS URLs.

The Oddish eBay dry-run confirmed this: the listing payload contained `http://localhost:3001/uploads/1788198862494-70707600-2813-47da-9b72-4251a81957cb.jpg` which eBay's servers can't reach.

Meanwhile, `lib/supabaseStorage.js` already has `uploadPublicImage()` (used by the analyze flow's `persistUploads()`) and returns Supabase HTTPS URLs — the plumbing exists but isn't connected to the save/listing paths.

---

## 2. Code Paths Audited (STEP 1)

Every location where a product photo URL is saved to the database or sent to a marketplace API:

### Save Paths (URL → `products.image_url` column)

| File | Line(s) | What It Does | Before Fix |
|------|---------|-------------|------------|
| [`save.js`](file:///C:/Users/jjard/claude/BossListers/pages/api/omni-lister/save.js) | 50–62 | Omni-lister save: writes `image_url` to products table | Passes through raw localhost/relative URL unchanged |
| [`supabaseInventory.js`](file:///C:/Users/jjard/claude/BossListers/lib/supabaseInventory.js) | 50–74 | `publishToInventory()`: analyze flow's save path | Passes through raw `imageUrl` unchanged |
| [`inventorySyncService.js`](file:///C:/Users/jjard/claude/BossListers/lib/inventorySyncService.js) | 194 | eBay inventory sync: writes `image_url` | **Already fine** — eBay API returns HTTPS URLs (eBay-hosted) |
| [`sync.js`](file:///C:/Users/jjard/claude/BossListers/pages/api/channels/ebay/sync.js) | 167 | eBay sync endpoint | **Already fine** — reads from eBay API |
| [`sync-shopify.js`](file:///C:/Users/jjard/claude/BossListers/pages/api/inventory/sync-shopify.js) | 95 | Shopify sync | **Already fine** — Shopify returns HTTPS URLs |

### Listing Payload Paths (URL → marketplace API)

| File | Line(s) | What It Does | Before Fix |
|------|---------|-------------|------------|
| [`create-listing.js`](file:///C:/Users/jjard/claude/BossListers/pages/api/channels/ebay/create-listing.js) | 34→45 | eBay create-listing: passes `product.image_urls` to connector | Forwards raw URLs without resolution |
| [`apiConnectors.js`](file:///C:/Users/jjard/claude/BossListers/lib/channels/apiConnectors.js) | 288 | `EbayConnector.createListing`: maps `product.image_urls` → `imageUrls` in eBay payload | Forwards whatever it receives (connector is correct — not its job to resolve) |
| [`apiConnectors.js`](file:///C:/Users/jjard/claude/BossListers/lib/channels/apiConnectors.js) | 814 | `FacebookConnector.createListing`: `product.images[0]` → `image_url` | Forwards whatever it receives |
| [`apiConnectors.js`](file:///C:/Users/jjard/claude/BossListers/lib/channels/apiConnectors.js) | 979, 997 | `InstagramConnector.createListing`: `product.images[0]` → `image_url` | Forwards whatever it receives |
| [`apiConnectors.js`](file:///C:/Users/jjard/claude/BossListers/lib/channels/apiConnectors.js) | 1175 | `BonanzaConnector.createListing`: `listing.image_urls` → `pictureURL` | Forwards whatever it receives |
| [`supabaseInventory.js`](file:///C:/Users/jjard/claude/BossListers/lib/supabaseInventory.js) | 157 | `syncToFacebook()`: passes `product.image_url` → `images[]` to Facebook connector | Passed through raw localhost URL |
| [`supabaseInventory.js`](file:///C:/Users/jjard/claude/BossListers/lib/supabaseInventory.js) | 210 | `syncToInstagram()`: passes `product.image_url` → `images[]` to Instagram connector | Passed through raw localhost URL |

### Source Path (already working)

| File | Line(s) | What It Does | Status |
|------|---------|-------------|--------|
| [`analyzeService.js`](file:///C:/Users/jjard/claude/BossListers/lib/analyzeService.js) | 517–518 | `persistUploads()`: uploads to Supabase, sets `publicUrl` | **Already uploads** — but `relativeUrl` falls back to local path if upload fails |
| [`analyzeService.js`](file:///C:/Users/jjard/claude/BossListers/lib/analyzeService.js) | 529 | `relativeUrl: publicUrl \|\| \`/${uploadsDir}/${filename}\`` | Prefers public URL, falls back to local |
| [`analyzeService.js`](file:///C:/Users/jjard/claude/BossListers/lib/analyzeService.js) | 2793 | `imageUrls = uploaded.map(file => file.relativeUrl)` | Gets public URLs when upload succeeded |

---

## 3. Changes Made (STEP 2)

### New Helper: `ensurePublicUrl()` in `lib/supabaseStorage.js`

Added a single utility function (66 lines) that takes any image URL and:
1. **Returns it unchanged** if it's already a public HTTPS URL (not localhost/127.0.0.1)
2. **Returns it unchanged** for `null`/undefined/non-string values
3. **Extracts the filename** from localhost URLs (`http://localhost:3001/uploads/...`) or relative paths (`/uploads/...`)
4. **Reads the file** from `public/uploads/` on disk
5. **Uploads it** to the Supabase `product-photos` bucket via `uploadPublicImage()`
6. **Returns the public HTTPS URL** (`https://<project>.supabase.co/storage/v1/object/public/product-photos/...`)
7. **Falls back gracefully** to the original URL if the file doesn't exist or upload fails

No new buckets, no new helpers — uses the existing `ensurePublicBucketExists()` and `uploadPublicImage()`.

### Wired Into 4 Files (Minimal Diff)

#### [MODIFY] [`save.js`](file:///C:/Users/jjard/claude/BossListers/pages/api/omni-lister/save.js)
- Added `require("../../../lib/supabaseStorage")` import (+1 line)
- Resolve `image_url` through `ensurePublicUrl()` before building the inventory row (+2 lines)
- **Why:** The primary save path for manually captured products. Every photo URL saved here reaches the products table.

#### [MODIFY] [`supabaseInventory.js`](file:///C:/Users/jjard/claude/BossListers/lib/supabaseInventory.js)
- Added `require("./supabaseStorage")` import (+1 line)
- `publishToInventory()`: resolve `imageUrl` before writing to products (+1 line)
- `syncToFacebook()`: resolve `product.image_url` before building Facebook product (+1 line)
- `syncToInstagram()`: resolve `product.image_url` before building Instagram product (+1 line)
- **Why:** The analyze flow's save path (`publishToInventory`) and the cross-post paths (`syncToFacebook`, `syncToInstagram`) all feed image URLs to either the database or marketplace APIs.

#### [MODIFY] [`create-listing.js`](file:///C:/Users/jjard/claude/BossListers/pages/api/channels/ebay/create-listing.js)
- Added `require("../../../../lib/supabaseStorage")` import (+1 line)
- Resolve `product.image_urls` array through `ensurePublicUrl()` before passing to `connector.createListing()` (+5 lines)
- **Why:** The eBay listing endpoint is the last choke point before image URLs reach the eBay API. Catches existing products whose `image_url` was saved before this fix.

#### [MODIFY] [`supabaseStorage.js`](file:///C:/Users/jjard/claude/BossListers/lib/supabaseStorage.js)
- Added `ensurePublicUrl()` function (+60 lines)
- Added to `module.exports` (+1 line)

### Files Left Byte-Identical

- `lib/channels/apiConnectors.js` — Connectors forward image URLs without resolution; architecturally correct (they shouldn't depend on Supabase Storage). Left untouched.
- `lib/analyzeService.js` — Already uploads to Supabase in `persistUploads()` and prefers the public URL. Left untouched.
- `lib/inventorySyncService.js` — eBay sync writes eBay-hosted HTTPS URLs. Left untouched.
- `pages/api/channels/ebay/sync.js` — Reads eBay-hosted URLs. Left untouched.
- All other connector files — Not touched.

---

## 4. Dry-Run Verification (STEP 3)

### Test A: `ensurePublicUrl()` Unit Behavior

```
INPUT:  http://localhost:3001/uploads/1788198862494-70707600-2813-47da-9b72-4251a81957cb.jpg
OUTPUT: https://irslzufsqjveyibkfjtz.supabase.co/storage/v1/object/public/product-photos/uploads/1790191654779-1788198862494-70707600-2813-47da-9b72-4251a81957cb.jpg
→ PASS (localhost → public HTTPS)

INPUT:  https://i.ebayimg.com/images/g/abc.jpg
OUTPUT: https://i.ebayimg.com/images/g/abc.jpg
→ PASS (already public — unchanged)

INPUT:  null
OUTPUT: null
→ PASS (null passthrough)

INPUT:  /uploads/nonexistent.jpg
OUTPUT: /uploads/nonexistent.jpg
→ PASS (file not found — graceful fallback)
```

### Test B: Omni-Lister Save Endpoint

```
POST http://localhost:3001/api/omni-lister/save
Body: {
  "product": {
    "title": "Storage Test Product",
    "sku": "STORAGE-TEST-001",
    "price": 9.99,
    "image_url": "http://localhost:3001/uploads/1788198862494-70707600-2813-47da-9b72-4251a81957cb.jpg"
  }
}

Response:
  ok: true
  product.image_url: "https://irslzufsqjveyibkfjtz.supabase.co/storage/v1/object/public/product-photos/uploads/1790191705725-1788198862494-70707600-2813-47da-9b72-4251a81957cb.jpg"
  
→ PASS: localhost URL resolved to public Supabase HTTPS URL
→ Zero localhost URLs in the saved product row
```

### Test C: eBay Create-Listing Dry Run

```
POST http://localhost:3001/api/channels/ebay/create-listing
Body: {
  "product": {
    "sku": "STORAGE-TEST-001",
    "title": "Storage Test Product",
    "price": 9.99,
    "category_id": "183454",
    "image_urls": [
      "http://localhost:3001/uploads/1788198862494-70707600-2813-47da-9b72-4251a81957cb.jpg",
      "http://localhost:3001/uploads/1788198862495-ddb4f4f4-935d-4ba7-b2d9-077ee8f530b7.jpg"
    ]
  },
  "policies": { ... },
  "dryRun": true
}

Response:
  ok: true
  dry_run: true
  payloads.inventory_item.product.imageUrls: [
    "https://irslzufsqjveyibkfjtz.supabase.co/storage/v1/object/public/product-photos/uploads/1790191920405-1788198862494-70707600-2813-47da-9b72-4251a81957cb.jpg",
    "https://irslzufsqjveyibkfjtz.supabase.co/storage/v1/object/public/product-photos/uploads/1790191920362-1788198862495-ddb4f4f4-935d-4ba7-b2d9-077ee8f530b7.jpg"
  ]
  
→ PASS: ok: true, dry_run: true
→ PASS: All image URLs are public HTTPS (supabase.co)
→ PASS: Zero localhost URLs in the listing payload
```

### Test D: Existing Tests

```
npm test → 15/15 passed, 0 failed
```

---

## 5. Before/After URL Proof

| Context | Before | After |
|---------|--------|-------|
| Omni-lister save → `products.image_url` | `http://localhost:3001/uploads/1788198862494-...jpg` | `https://irslzufsqjveyibkfjtz.supabase.co/storage/v1/object/public/product-photos/uploads/1790191705725-1788198862494-...jpg` |
| eBay dry-run → `inventory_item.product.imageUrls[0]` | `http://localhost:3001/uploads/1788198862494-...jpg` | `https://irslzufsqjveyibkfjtz.supabase.co/storage/v1/object/public/product-photos/uploads/1790191920405-1788198862494-...jpg` |
| eBay dry-run → `inventory_item.product.imageUrls[1]` | `http://localhost:3001/uploads/1788198862495-...jpg` | `https://irslzufsqjveyibkfjtz.supabase.co/storage/v1/object/public/product-photos/uploads/1790191920362-1788198862495-...jpg` |

---

## 6. Remaining Items

### Existing Products with Localhost URLs
Products already in the database (like the Oddish) still have localhost URLs in `products.image_url`. These will be resolved at listing-creation time (the eBay endpoint now resolves `image_urls` before passing to the connector), but the database row itself won't update until the product is re-saved through omni-lister or publishToInventory. This is by design — a bulk database migration is out of scope for this change and would require a separate script.

### Card Metadata in Description
The Oddish product's `description` field contains embedded `CARD_METADATA` JSON with `frontPhoto` and `backPhoto` localhost URLs (visible in the eBay listing description). These are human-readable metadata, not image URLs that eBay fetches — eBay uses the `imageUrls` field, not URLs embedded in the description HTML. No fix needed for this.

### Local Disk Files After Upload
The local files in `public/uploads/` remain on disk after being uploaded to Supabase. This is intentional — `analyzeService.js` reads them for OpenAI vision analysis, and the local dev server serves them for in-app previews. The Supabase URL is what gets saved to the database and sent to marketplace APIs.

---

## 7. Hard Rules Compliance

| Rule | Status |
|------|--------|
| No commit / no push / no merge | ✅ Not invoked |
| No live listings — dry-run only | ✅ All tests used `dryRun: true` |
| Do not touch eBay tenant auth path | ✅ `_getAccessToken`, `_getTenantRefreshToken` untouched |
| Minimal diff — only change broken photo-URL handling | ✅ 4 files changed, all directly in the photo-URL path |
| Working code left byte-identical | ✅ `apiConnectors.js`, `analyzeService.js`, `inventorySyncService.js` untouched |
