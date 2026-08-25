# Boss Listers — Channel Setup

Honest status as of 2026-07-26. Nothing below is claimed connected unless a
real authenticated API call succeeded.

| Channel | Type | Status |
|---|---|---|
| eBay | Official API (Sell Inventory) | **Awaiting eBay Developer approval** — sync engine already built (`inventory-sync/` in the viral-engine repo) |
| Etsy | Official API (Open API v3, OAuth) | Structure ready — needs credentials |
| Shopify | Official API (GraphQL Admin) | Optional — not configured |
| WooCommerce | Official API (REST v3) | Optional — not configured |
| Facebook Marketplace | **Manual listing package** | Working now |
| OfferUp | Manual listing package | Working now |
| Craigslist | Manual listing package | Working now |
| Mercari | Manual listing package | Working now |
| Poshmark | Manual listing package | Working now |

Manual = Boss Listers generates platform-optimized copy/fields/CSV; **you**
paste and submit on the marketplace. No browser automation, no scraping, no
credential collection — that's a hard platform-safety rule, not a gap.

## Already complete (no action needed)

- Shared Supabase inventory DB ("Boss listers prod", ref `irslzufsqjveyibkfjtz`), migrations 0001–0003 applied.
- Connector architecture (`lib/channels/`), Channels page (`/channels`), manual package generator + CSV export + posted/sold tracking.
- eBay sync Edge Function (separate repo: `viral-engine/inventory-sync/`).

## What YOU must do, per channel

### Database (required first)
Apply migration `0004_channels_and_grants.sql` from
`viral-engine/inventory-sync/supabase/migrations/` — it fixes the anon
permission bug found during verification (storefront reads currently 401)
and seeds the channel rows. From the viral-engine repo: `npx supabase db push`.

### eBay
1. Wait for developer-account approval (submitted, pending).
2. Then: Application Keys → production keyset; User Tokens → RuName; consent flow → refresh token (runbook: `inventory-sync/DEPLOY.md` steps 3–6).
3. Env vars go in **two places** because there are two independent consumers of the same eBay credentials:
   - **Supabase Edge Function secrets** (`viral-engine/inventory-sync/`) — this is where `ebay-sync` actually runs, on a 15-min `pg_cron` schedule. This is the revenue-critical path: it keeps the `products` table in sync with eBay inventory.
   - **This app's server env** (Render env vars) — `apiConnectors.js` reads the same vars to power the `/channels` status page and its "Test Connection" button. This is diagnostics/UI only; it does not sync inventory.
   - Set the same values in both places: `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_REFRESH_TOKEN`, `EBAY_ENVIRONMENT`.
   - Each consumer degrades gracefully if the other is missing: without the Edge Function vars, sync stops but `/channels` may still show eBay as connected; without this app's vars, sync keeps running but `/channels` shows eBay as not connected.

### Etsy
Same shared-app-registration, per-tenant-consent model as eBay above — one app
registration serves every customer; each customer clicks **Connect Etsy** on
`/channels` and consents with their own Etsy account. There is no single
shared `ETSY_REFRESH_TOKEN` — each tenant's token is stored encrypted per-tenant
(see `inventory-sync/supabase/migrations/0013-0015`).

1. Register an app at https://www.etsy.com/developers/register.
   Etsy reviews the request for `listings_w`/write scopes — **not instant**,
   unlike what this doc previously said. As of 2026-08-20, approval is
   pending; no confirmed turnaround time.
2. Under "What type of application" pick **Seller Tools**; users = **Just
   myself or colleagues**; commercial = **No**; scopes = **Upload or edit
   listings** + **Read sales data**.
3. This gives a **Keystring** and **Shared secret**. Set server-side:
   `ETSY_KEYSTRING`, `ETSY_SHARED_SECRET`, `ETSY_REDIRECT_URI`.
   Also set the public (non-secret) client-side pair used to build the
   authorize URL: `NEXT_PUBLIC_ETSY_KEYSTRING` (same value as
   `ETSY_KEYSTRING` — Etsy's Keystring doubles as the OAuth `client_id`,
   it's not itself a secret), `NEXT_PUBLIC_ETSY_REDIRECT_URI` (same value as
   `ETSY_REDIRECT_URI`).
4. Redirect URI to register in the app's Settings AND set as
   `ETSY_REDIRECT_URI`/`NEXT_PUBLIC_ETSY_REDIRECT_URI`:
   `https://YOUR_DEPLOYED_APP/channels/etsy-callback`
   — a real page (`pages/channels/etsy-callback.js`), not the API route
   directly, same reasoning as eBay's callback (needs the customer's own
   browser session to know which tenant is connecting).
5. Scopes requested: `listings_r listings_w transactions_r shops_r`.
6. Etsy uses OAuth 2.0 + **PKCE** (public-client style) — no client secret
   in the token exchange. `pages/channels.js`'s `startEtsyConnect()`
   generates the `code_verifier`/`code_challenge` client-side; the callback
   page reads the verifier back out of `sessionStorage` and sends it to
   `/api/channels/etsy/callback`, which does the actual exchange server-side.
7. Etsy is shop-scoped, not just account-scoped — every listing call needs a
   `shop_id`. The callback route looks this up automatically right after
   connecting (`GET /v3/application/users/{user_id}/shops`) and stores it in
   `tenant_marketplace_connections.metadata`. If that lookup fails, the
   connection still saves but listing calls will refuse with a clear
   "reconnect" error until the shop_id is resolved.
8. [Likely, not yet exercised against a live token as of 2026-08-20 — Etsy
   app registration was pending review this whole build. Re-verify the
   token/shops endpoint response shapes the first time a real OAuth
   consent actually completes.]

### Shopify (only if you open a Shopify store)
Custom app in the store admin → Admin API token.
Env vars: `SHOPIFY_STORE_DOMAIN` (e.g. `mystore.myshopify.com`), `SHOPIFY_ADMIN_ACCESS_TOKEN`.

### WooCommerce (only if you run a WooCommerce site)
WooCommerce → Settings → Advanced → REST API → Add key (Read/Write).
Env vars: `WOOCOMMERCE_STORE_URL`, `WOOCOMMERCE_CONSUMER_KEY`, `WOOCOMMERCE_CONSUMER_SECRET`.

### Manual channels (Facebook, OfferUp, Craigslist, Mercari, Poshmark)
Nothing to register. `/channels` → enter SKU → Generate package → copy fields
→ post on the marketplace → "Mark as posted" (stores URL/date) → "Mark as
sold" when it sells.

## Env var placement rules

- This app (Next.js server): `.env` locally / host env vars in production. Never `NEXT_PUBLIC_*` for any of the above.
- eBay vars: **both** Supabase Edge Function secrets (required — this is what runs `ebay-sync`) and this app's server env (required for `/channels` status/Test Connection to reflect reality).
- `SUPABASE_SERVICE_ROLE_KEY`: this app's server env only — never the browser, never committed.
