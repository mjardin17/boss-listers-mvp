// Central registry of every platform the system supports.
// 'access': open | gated   → determines whether connector is live or stub
// 'auth':   the credential model used by that platform
export const PLATFORMS = {
  ebay: {
    name: 'eBay',
    access: 'open',
    auth: 'oauth2',
    creds: ['EBAY_APP_ID', 'EBAY_CERT_ID', 'EBAY_AUTH_TOKEN'],
    listingEndpoint: 'Sell/Inventory/v1/offer',
    sandbox: true,
  },
  etsy: {
    name: 'Etsy',
    access: 'open',
    auth: 'api_key + oauth2',
    creds: ['ETSY_KEYSTRING', 'ETSY_SHARED_SECRET', 'ETSY_OAUTH_TOKEN'],
    listingEndpoint: 'POST /v3/application/shops/{shop_id}/listings',
    sandbox: false,
  },
  whatnot: {
    name: 'Whatnot',
    access: 'gated',
    auth: 'graphql + token',
    creds: ['WHATNOT_API_KEY'],
    status: 'waitlist',
    listingEndpoint: 'GraphQL: createListing mutation (Developer Preview)',
  },
  depop: {
    name: 'Depop',
    access: 'gated',
    auth: 'oauth2',
    creds: ['DEPOP_OAUTH_CLIENT_ID', 'DEPOP_OAUTH_CLIENT_SECRET'],
    status: 'partner-gated',
    listingEndpoint: 'POST /api/selling/listings (private API)',
  },
  mercari: {
    name: 'Mercari',
    access: 'gated',
    auth: 'partner token',
    creds: ['MERCARI_ACCESS_TOKEN'],
    status: 'partners-only',
    listingEndpoint: 'No public US listing API',
  },
  facebook: {
    name: 'Facebook Marketplace',
    access: 'gated',
    auth: 'business manager token',
    creds: ['FB_ACCESS_TOKEN', 'FB_BUSINESS_ID', 'FB_CATALOG_ID'],
    status: 'approved-partner',
    listingEndpoint: 'Marketplace Partner Item API',
  },
};
