# BossListers Python Bridge Reference Repair & Audit Report

**Date:** 2026-09-23  
**Working Directory:** `C:\Users\jjard\claude\BossListers`  
**Git Remote:** `origin https://github.com/mjardin17/boss-listers-mvp.git`  
**Git Branch:** `feat/native-connectors-amazon-tiktok-ebay-etsy-fb-ig-bonanza`  
**Target Deliverable:** `bridge-repair-report.md`  

---

## 1. Executive Summary

An audit of the BossListers codebase and recent diagnostic documentation (`bosslister-pc-vs-github-audit.md`) identified 6 Python bridge files historically referenced across the repository. A rigorous code-level investigation was conducted to classify each reference as either **live runtime execution** or **dead comment/documentation code**, verify native JavaScript connector coverage, restore missing bridge components from `video-bot-pipeline` where no native coverage exists, and validate all listing endpoints in `dryRun` mode.

### Key Findings
1. **eBay, Facebook Marketplace, and Bonanza are 100% Native JavaScript:**
   - `EbayConnector.prototype.createListing()` in `lib/channels/apiConnectors.js` implements direct integration with eBay's Sell Inventory REST API (`inventory_item`, `offer`, `publish`).
   - `FacebookConnector.prototype.createListing()` in `lib/channels/apiConnectors.js` implements direct integration with Meta Graph API v25.0 (`product_catalogs`, `products`).
   - `BonanzaConnector.prototype.createListing()` in `lib/channels/apiConnectors.js` implements direct integration with Bonanza's Bonapitit `secure_request` envelope API (`addFixedPriceItemRequest`).
   - The references to Python files (`scripts/ebay_listing_service.py`, `lib/ebay_listing.py`, `lib/facebook_marketplace_listing.py`, `lib/bonanza_listing.py`) in these endpoints are **dead code** (doc comments only). The runtime execution path never touches Python. Per instruction, working code was left **byte-identical**.

2. **Etsy Relies on the Python Bridge (No Native Listing Creator Exists):**
   - While `EtsyConnector` natively handles OAuth token refresh and `openapi-ping`, `EtsyConnector.prototype.createListing()` in `lib/channels/apiConnectors.js` makes an HTTP call to `http://127.0.0.1:8791/etsy/create-listing`.
   - The service (`scripts/listing_service.py`) and underlying client (`lib/etsy_listing.py`) were missing from BossListers, causing Etsy listing calls to fail with `bridge_unreachable`.
   - Following the rule (*"if no native coverage exists, restore bridge file by copying from C:\Users\jjard\claude\video-bot-pipeline at the same relative path"*), `scripts/listing_service.py` and `lib/etsy_listing.py` along with its required module dependencies (`lib/ebay_listing.py`, `lib/facebook_marketplace_listing.py`, `lib/bonanza_listing.py`) were restored from `video-bot-pipeline`.
   - `scripts/ebay_listing_service.py` was **not** restored or invented, as it is obsolete and superseded by the native eBay connector and `scripts/listing_service.py`.

3. **All Listing Endpoints Verified in Dry-Run Mode:**
   - eBay: `POST /api/channels/ebay/create-listing` -> `ok: true, dry_run: true`
   - Facebook: `POST /api/channels/facebook/create-listing` -> `ok: true, dry_run: true`
   - Etsy: `POST /api/channels/etsy/create-listing` -> `ok: true, dry_run: true`
   - Bonanza: `BonanzaConnector.createListing()` -> `ok: true, dry_run: true`

---

## 2. Environment & Roots Verification

| Check | Expected | Verified Value | Status |
|---|---|---|---|
| Working Directory | `C:\Users\jjard\claude\BossListers` | `C:\Users\jjard\claude\BossListers` | PASS |
| Git Remote | `mjardin17/boss-listers-mvp` | `https://github.com/mjardin17/boss-listers-mvp.git` | PASS |
| Git Branch | `feat/native-connectors-amazon-tiktok-ebay-etsy-fb-ig-bonanza` | `feat/native-connectors-amazon-tiktok-ebay-etsy-fb-ig-bonanza` | PASS |
| Dev Server Port | 3001 | Port 3001 listening (`PID 23416`) | PASS |
| `.env.local` | Exists and gitignored | Present, ignored via `git check-ignore` (never printed) | PASS |
| Sister Repo | `video-bot-pipeline` | `C:\Users\jjard\claude\video-bot-pipeline` | PASS |

---

## 3. Python Bridge Reference Audit (6 Files)

The following table details every Python file referenced across BossListers, the referencing files, whether the reference is live or dead, native JS coverage status, and the resolution applied.

| Python File | Referenced By | Line / Context | Reference Type | Native JS Coverage? | Action Taken |
|---|---|---|---|---|---|
| `lib/etsy_listing.py` | `lib/channels/apiConnectors.js`<br>`pages/api/channels/etsy/create-listing.js` | Lines 448, 620, 647 in `apiConnectors.js`; line 6 in `create-listing.js` | **LIVE** (imported and executed by `listing_service.py` during `/etsy/create-listing` calls) | **NO** (`EtsyConnector.createListing` delegates to HTTP bridge) | **RESTORED** by copying byte-identical from `video-bot-pipeline/lib/etsy_listing.py`. |
| `scripts/listing_service.py` | `lib/channels/apiConnectors.js`<br>`pages/api/channels/etsy/create-listing.js`<br>`pages/api/channels/facebook/create-listing.js` | Lines 450, 456, 733, 1072 in `apiConnectors.js`; line 5 in `etsy/create-listing.js`; line 5 in `facebook/create-listing.js` | **LIVE for Etsy**;<br>**DEAD for Facebook & Bonanza** | **PARTIAL** (Facebook and Bonanza have native JS listing; Etsy does not) | **RESTORED** by copying byte-identical from `video-bot-pipeline/scripts/listing_service.py`. |
| `lib/facebook_marketplace_listing.py` | `lib/channels/apiConnectors.js`<br>`pages/api/channels/facebook/create-listing.js` | Lines 725, 731 in `apiConnectors.js`; line 6 in `facebook/create-listing.js` | **DEAD** in BossListers JS execution (`FacebookConnector.createListing` calls Graph API natively); needed by `listing_service.py` on load | **YES** (`FacebookConnector.createListing` is 100% native JS) | **RESTORED dependency** for `listing_service.py`; BossListers endpoint left **byte-identical**. |
| `lib/bonanza_listing.py` | `lib/channels/apiConnectors.js` | Lines 1059, 1070 in `apiConnectors.js` | **DEAD** in BossListers JS execution (`BonanzaConnector.createListing` calls Bonapitit natively); needed by `listing_service.py` on load | **YES** (`BonanzaConnector.createListing` is 100% native JS) | **RESTORED dependency** for `listing_service.py`; BossListers connector left **byte-identical**. |
| `lib/ebay_listing.py` | `pages/api/channels/ebay/create-listing.js`<br>`pages/capture.js` | Line 6 in `ebay/create-listing.js`; line 74 in `capture.js` | **DEAD** in BossListers JS execution (`EbayConnector.createListing` is 100% native JS); needed by `listing_service.py` on load | **YES** (`EbayConnector.createListing` is 100% native JS) | **RESTORED dependency** for `listing_service.py`; BossListers endpoint left **byte-identical**. |
| `scripts/ebay_listing_service.py` | `pages/api/channels/ebay/create-listing.js`<br>`docs/LISTING_CREATION.md` | Line 5 in `ebay/create-listing.js`; lines 300-301 in `LISTING_CREATION.md` | **DEAD** (Legacy eBay-only service superseded by native JS `EbayConnector` and multi-platform `listing_service.py`) | **YES** (`EbayConnector.createListing` is 100% native JS) | **DO NOT RESTORE / DO NOT INVENT**. Left alone as dead code comment per rule. |

---

## 4. Native JS Coverage & Architecture Analysis

### A. eBay Listing Creation (Native JS)
- **Implementation:** `EbayConnector.prototype.createListing(product, policies, options)` in `lib/channels/apiConnectors.js` (lines 272–392).
- **API Target:** eBay Sell Inventory REST API (`https://api.ebay.com/sell/inventory/v1`).
- **Steps:**
  1. `PUT /sell/inventory/v1/inventory_item/{sku}` (creates/updates inventory record with condition, aspects, images, quantity).
  2. `POST /sell/inventory/v1/offer` (creates offer with category, description, policies, pricing).
  3. `POST /sell/inventory/v1/offer/{offerId}/publish` (publishes listing only when `confirm === "PUBLISH_LIVE"`).
- **Multi-Tenant Safety:** `_getAccessToken(tenantId)` resolves per-tenant refresh token from Supabase `channel_connections` table.
- **Endpoint Status:** `pages/api/channels/ebay/create-listing.js` directly requires `EbayConnector` and invokes `connector.createListing()`. The reference to `scripts/ebay_listing_service.py` in the header comment is a remnant of the pre-native implementation.

### B. Facebook Marketplace Listing Creation (Native JS)
- **Implementation:** `FacebookConnector.prototype.createListing(product, options)` in `lib/channels/apiConnectors.js` (lines 799–875).
- **API Target:** Meta Graph API v25.0 (`https://graph.facebook.com/v25.0`).
- **Steps:**
  1. `GET /{page_id}/product_catalogs` (resolves Page catalog).
  2. `POST /{catalog_id}/products` (creates product in catalog with retailer_id, price in cents, condition, images).
- **Endpoint Status:** `pages/api/channels/facebook/create-listing.js` directly invokes `FacebookConnector.createListing()`. Stale comment references `scripts/listing_service.py` and `lib/facebook_marketplace_listing.py`, but runtime logic is 100% native JS.

### C. Bonanza Listing Creation (Native JS)
- **Implementation:** `BonanzaConnector.prototype.createListing(listing, options)` in `lib/channels/apiConnectors.js` (lines 1160–1215).
- **API Target:** Bonanza Bonapitit API (`https://api.bonanza.com/api_requests/secure_request`).
- **Steps:** `POST` with `addFixedPriceItemRequest` payload containing title, SKU, startPrice, category, shipping, and return policies.
- **Endpoint Status:** Native JS implementation in `lib/channels/apiConnectors.js`.

### D. Etsy Listing Creation (Python Bridge)
- **Implementation:** `EtsyConnector.prototype.createListing(product, options)` in `lib/channels/apiConnectors.js` (lines 635–701).
- **Architecture:** Forwarder architecture. Connectors resolves tenant OAuth credentials, formats the `EtsyProduct` request body, and sends a `POST` request to `http://127.0.0.1:8791/etsy/create-listing`.
- **Bridge Backend:** `scripts/listing_service.py` running on localhost port 8791. It wraps `lib/etsy_listing.py`, which implements Etsy's two-step listing flow (`POST /v3/application/shops/{shop_id}/listings` followed by `POST /v3/application/shops/{shop_id}/listings/{listing_id}/images` and optional activation).
- **Status:** Requires `scripts/listing_service.py` and `lib/etsy_listing.py` present and running.

---

## 5. Changes Made & Rationale

Per the strict instructions:
> *"MINIMAL DIFF: only touch files that are part of the broken bridge-reference chain. Do not refactor, reformat, rename, or 'improve' working code — if a file already works, leave it byte-identical. If an endpoint works today despite a dead reference (unused code path), report it as dead code and leave it alone. Every file you change must be justified in the report: what was broken, what the change fixes, nothing more."*

### Restored Files (Copied from `C:\Users\jjard\claude\video-bot-pipeline`)

1. **`lib/etsy_listing.py`**
   - **What was broken:** File was completely absent from BossListers. `EtsyConnector.createListing` could not execute because the bridge service on port 8791 requires this module to handle Etsy listing creation, validation, image uploading, and state transitions.
   - **What the change fixes:** Restores the canonical Etsy client library tested and verified in `video-bot-pipeline`.

2. **`scripts/listing_service.py`**
   - **What was broken:** File was absent from BossListers. No HTTP server existed on port 8791 to accept `/etsy/create-listing` requests, resulting in `bridge_unreachable` (HTTP 503) errors.
   - **What the change fixes:** Restores the FastAPI HTTP bridge service configured for loopback (127.0.0.1:8791) with dry-run safety gates and live-publish token verification.

3. **`lib/ebay_listing.py`, `lib/facebook_marketplace_listing.py`, `lib/bonanza_listing.py`**
   - **What was broken:** `scripts/listing_service.py` unconditionally imports all 4 platform modules at top of file (lines 65–88). When launching `scripts/listing_service.py`, Python failed with `ModuleNotFoundError: No module named 'lib.ebay_listing'` if the supporting modules were missing.
   - **What the change fixes:** Allows `scripts/listing_service.py` to start cleanly and serve the Etsy endpoint.

### Files Left Byte-Identical (Dead Code in Comments)
- **`pages/api/channels/ebay/create-listing.js`**: Already invokes native `EbayConnector.createListing()`. Reference to `scripts/ebay_listing_service.py` is in the comment header only. Endpoint already works. Left byte-identical.
- **`pages/api/channels/facebook/create-listing.js`**: Already invokes native `FacebookConnector.createListing()`. Reference to `scripts/listing_service.py` is in the comment header only. Endpoint already works. Left byte-identical.
- **`lib/channels/apiConnectors.js`**: Already contains native eBay, Facebook, and Bonanza implementations. Live path for eBay tenant auth is completely untouched. Left byte-identical.
- **`pages/capture.js`**: Mention of `lib/ebay_listing.py` is in a comment. Left byte-identical.

---

## 6. End-to-End Verification Results

All tests were performed strictly in **DRY-RUN mode** (`dryRun: true`), confirming that zero live listings were published, zero seller fees were incurred, and no real API listing records were created.

### Test 1: eBay Create-Listing Endpoint
- **URL:** `POST http://localhost:3001/api/channels/ebay/create-listing`
- **Payload:**
  ```json
  {
    "product": {
      "sku": "TEST-EBAY-SKU",
      "title": "Test Product",
      "price": 9.99,
      "category_id": "123"
    },
    "policies": {
      "fulfillment_policy_id": "fp1",
      "payment_policy_id": "pp1",
      "return_policy_id": "rp1",
      "merchant_location_key": "loc1"
    },
    "dryRun": true
  }
  ```
- **Response Status:** HTTP 200 OK
- **Response Body:**
  ```json
  {
    "ok": true,
    "dry_run": true,
    "published": false,
    "ready_for_live": true,
    "missing": [],
    "payloads": {
      "inventory_item": {
        "condition": "NEW",
        "product": {
          "title": "Test Product",
          "description": ""
        },
        "availability": {
          "shipToLocationAvailability": {
            "quantity": 1
          }
        }
      },
      "offer": {
        "sku": "TEST-EBAY-SKU",
        "marketplaceId": "EBAY_US",
        "format": "FIXED_PRICE",
        "availableQuantity": 1,
        "categoryId": "123",
        "listingDescription": "Test Product",
        "listingPolicies": {
          "fulfillmentPolicyId": "fp1",
          "paymentPolicyId": "pp1",
          "returnPolicyId": "rp1"
        },
        "pricingSummary": {
          "price": {
            "value": "9.99",
            "currency": "USD"
          }
        },
        "merchantLocationKey": "loc1"
      }
    },
    "would_call": [
      "PUT https://api.ebay.com/sell/inventory/v1/inventory_item/TEST-EBAY-SKU",
      "POST https://api.ebay.com/sell/inventory/v1/offer",
      "POST https://api.ebay.com/sell/inventory/v1/offer/{offerId}/publish (only with confirm: \"PUBLISH_LIVE\")"
    ]
  }
  ```
- **Result:** **PASS** (`ok: true, dry_run: true`).

---

### Test 2: Facebook Marketplace Create-Listing Endpoint
- **URL:** `POST http://localhost:3001/api/channels/facebook/create-listing`
- **Payload:**
  ```json
  {
    "product": {
      "sku": "FB-API-TEST",
      "title": "Facebook Test Product",
      "price": 14.99
    },
    "dryRun": true
  }
  ```
- **Response Status:** HTTP 200 OK
- **Response Body:**
  ```json
  {
    "ok": true,
    "dry_run": true,
    "published": false,
    "payload": {
      "retailer_id": "FB-API-TEST",
      "name": "Facebook Test Product",
      "description": "",
      "price": 1499,
      "currency": "USD",
      "availability": "in stock",
      "condition": "new",
      "image_url": "",
      "url": "https://facebook.com/61593844138273"
    },
    "would_call": [
      "GET https://graph.facebook.com/v25.0/{FB_PAGE_ID}/product_catalogs",
      "POST https://graph.facebook.com/v25.0/{catalog_id}/products (only with confirm: \"PUBLISH_LIVE\")"
    ]
  }
  ```
- **Result:** **PASS** (`ok: true, dry_run: true`).

---

### Test 3: Bonanza Create-Listing (Native Connector)
- **Method:** `BonanzaConnector.prototype.createListing(listing, { dryRun: true })`
- **Payload:**
  ```json
  {
    "sku": "BON-TEST-SKU",
    "title": "Test Product",
    "price": 19.99
  }
  ```
- **Response:**
  ```json
  {
    "ok": true,
    "dry_run": true,
    "published": false,
    "payload": {
      "addFixedPriceItemRequest": {
        "item": {
          "title": "Test Product",
          "description": "",
          "sku": "BON-TEST-SKU",
          "startPrice": 19.99,
          "quantity": 1,
          "condition": "New",
          "dispatchTimeMax": 3,
          "shippingDetails": {
            "shippingServiceCost": 0,
            "freeShipping": false
          },
          "returnPolicy": {
            "returnsAccepted": false
          }
        }
      }
    },
    "would_call": [
      "POST https://api.bonanza.com/api_requests/secure_request (addFixedPriceItemRequest, only with confirm: \"PUBLISH_LIVE\")"
    ]
  }
  ```
- **Result:** **PASS** (`ok: true, dry_run: true`).

---

### Test 4: Etsy Create-Listing Endpoint (via Restored Bridge)
- **URL:** `POST http://localhost:3001/api/channels/etsy/create-listing`
- **Payload:**
  ```json
  {
    "product": {
      "sku": "ETSY-API-TEST",
      "title": "Vintage Handmade Leather Wallet",
      "description": "Handcrafted leather wallet",
      "price": 29.99,
      "who_made": "i_did",
      "when_made": "2020_2023",
      "taxonomy_id": 1234,
      "quantity": 1,
      "shipping_profile_id": 12345
    },
    "dryRun": true
  }
  ```
- **Response Status:** HTTP 200 OK
- **Response Body:**
  ```json
  {
    "ok": true,
    "dry_run": true,
    "published": false,
    "sku": "ETSY-API-TEST",
    "listing_id": null,
    "images_uploaded": 0,
    "steps": [
      "dry_run: no request sent"
    ],
    "payloads": {
      "create_draft": {
        "quantity": 1,
        "title": "Vintage Handmade Leather Wallet",
        "description": "Handcrafted leather wallet",
        "price": "29.99",
        "who_made": "i_did",
        "when_made": "2020_2023",
        "taxonomy_id": 1234,
        "is_supply": false,
        "type": "physical",
        "shipping_profile_id": 12345
      }
    }
  }
  ```
- **Result:** **PASS** (`ok: true, dry_run: true`).

---

### Test 5: Error Handling & Validation Gates
1. **Missing `product` object on Etsy route:**
   - **Request:** `POST /api/channels/etsy/create-listing` with `{}`
   - **Response Status:** HTTP 400 Bad Request
   - **Response Body:**
     ```json
     {
       "ok": false,
       "code": "missing_fields",
       "error": "`product` is required in the request body."
     }
     ```
2. **Invalid `when_made` enum:**
   - Passed `"when_made": "2020_2024"`.
   - Result: Python validation rejected with HTTP 400 and enumerated all valid Etsy eras (`1700s`, `1800s`, ..., `2020_2023`, `made_to_order`).
3. **Missing `shipping_profile_id`:**
   - Result: Python validation rejected with HTTP 400 (`shipping_profile_id is required when listing_type is 'physical'`).

---

## 7. Hard Rules & Constraints Compliance

1. **No Commit / No Push / No Merge:**
   - `git commit`, `git push`, and `git merge` were never invoked.
   - All restored files remain untracked in working copy.
2. **No Live Listings / Purchases / Publishes:**
   - Every single listing call used `dryRun: true`. Zero live network calls reached external marketplace APIs.
3. **eBay Live Tenant Path Protected:**
   - `_getTenantRefreshToken()` and `_getAccessToken(tenantId)` in `EbayConnector` remain completely untouched and byte-identical.
4. **Minimal Diff / Byte-Identical Existing Code:**
   - Existing JS/TS files in `BossListers` (`apiConnectors.js`, `create-listing.js`) were kept byte-identical. No refactoring or formatting was performed.
5. **Secrets & Security:**
   - No `.env.local` contents or API tokens were printed or logged.
   - Restored `scripts/listing_service.py` is bound strictly to `127.0.0.1` (localhost only).
