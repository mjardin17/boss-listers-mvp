# Channel setup: what's left (BossListers)

Status now: eBay connected and tested. Facebook Marketplace connected (page token works).
Shopify is out (store being cancelled). Nothing in this file needs to be done today.

## Etsy (when you open a shop)
1. Open an Etsy shop at etsy.com/sell.
2. In the Etsy developer portal, create an app and copy the keystring and shared secret.
3. Paste them into `.env.local` as `ETSY_KEYSTRING` and `ETSY_SHARED_SECRET`.
   Set `ETSY_REDIRECT_URI` to the callback URL shown on the Channels page.
4. On the Channels page, click **Connect Etsy**, approve on Etsy, then click **Test connection**.
   Done when the card shows Connected.

## Amazon Seller Central (when you have a seller account)
1. Register as an SP-API developer in Seller Central.
2. Copy the client ID and client secret into `.env.local` as `AMAZON_CLIENT_ID` and `AMAZON_CLIENT_SECRET`.
3. On the Channels page, click **Connect Amazon**, sign in to Seller Central, then click **Test connection**.
   Done when the card shows Connected.

## Quick check after any change
- Restart the BossListers server so it reads `.env.local`.
- On the Channels page, click **Test connection** for the channel. Never trust a green card without the test.
