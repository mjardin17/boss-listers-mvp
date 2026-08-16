# 04 — Facebook Marketplace

**Status:** gated (approved-partner).

Facebook Marketplace listings are published through the **Graph API** Marketplace endpoints (e.g. `POST /{page_id}/marketplace_listings`), which require a token from an approved-partner Meta app.

## Required env
- `FACEBOOK_ACCESS_TOKEN` — approved-partner long-lived page token
- `FACEBOOK_PAGE_ID` — the Page that owns the listings

## Intended flow (fill in once approved)
1. Validate token + page permission.
2. `POST /{page_id}/marketplace_listings` with listing payload (title, price, condition, description, images).
3. Poll listing status / handle `checkout_method` and `availability`.

The stub `src/connectors/facebook.js` documents this entry point and returns a 403 until configured.
