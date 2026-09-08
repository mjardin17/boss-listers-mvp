function emptyMarketData(platform, configured = false) {
  return {
    platform,
    averageSoldPrice: 0,
    activeListingCount: 0,
    soldCount: 0,
    sellThroughRate: 0,
    confidence: 0,
    comps: [],
    unavailable: true,
    reason: configured ? "Adapter is not connected yet." : "API credentials not configured."
  };
}

// Future marketplace integrations plug in here through official APIs only.
// Keep adapters side-effect free: no scraping, browser automation, or dashboard-specific formatting.
export async function getEbaySoldComps() {
  return emptyMarketData("eBay", Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET));
}

export async function getAmazonCatalogPricing() {
  return emptyMarketData("Amazon", Boolean(process.env.AMAZON_ACCESS_KEY_ID));
}

export async function getWalmartPricing() {
  return emptyMarketData("Walmart", Boolean(process.env.WALMART_API_KEY));
}

export async function getTikTokShopPricing() {
  return emptyMarketData("TikTok Shop", Boolean(process.env.TIKTOK_SHOP_API_KEY));
}

export async function getMarketplaceSignals() {
  const adapters = [
    getEbaySoldComps,
    getAmazonCatalogPricing,
    getWalmartPricing,
    getTikTokShopPricing
  ];
  const results = [];
  for (const adapter of adapters) {
    try {
      results.push(await adapter());
    } catch (error) {
      results.push({
        ...emptyMarketData(adapter.name.replace(/^get/, "").replace(/([A-Z])/g, " $1").trim()),
        reason: error?.message || "Market adapter failed safely."
      });
    }
  }
  return results;
}
