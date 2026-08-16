# 02 — Auth flows

## Etsy (OAuth2 PKCE)

Etsy API v3 uses the authorization code flow with PKCE.

```bash
# 1. Get an authorize URL + PKCE verifier
node scripts/oauth-token.js --etsy
# -> open the printed URL in a browser, log in, copy the `code` from the redirect

# 2. Exchange the code
node scripts/oauth-token.js --etsy --exchange <CODE> --verifier "<verifier>"

# 3. Later, refresh
node scripts/oauth-token.js --etsy --refresh
```

Helpers live in `src/auth/oauth.js`:
- `generateCodeVerifier()` / `generateCodeChallenge(verifier)`
- `buildEtsyAuthorizeUrl({...})`

## eBay

eBay Sell Inventory API uses an app access token (`EBAY_AUTH_TOKEN`) issued to your eBay developer application, sent as `Authorization: Bearer <token>`. Sandbox toggle via `EBAY_ENV`.

## Gated platforms

No public auth yet. Once approval lands, add OAuth/token handling inside each connector stub (`src/connectors/*.js`).
