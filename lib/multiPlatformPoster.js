const { EbayConnector } = require("./channels/apiConnectors");

class MultiPlatformPoster {
  constructor() {
    this.ebay = new EbayConnector();
  }

  async postToAllPlatforms(tenantId, product, selectedPlatforms = ["ebay"]) {
    const results = {};

    if (selectedPlatforms.includes("ebay")) {
      try {
        const ebayProduct = this.mapToEbay(product);
        const ebayResult = await this.ebay.createListing(ebayProduct, {
          tenantId,
          dryRun: false,
        });
        results.ebay = {
          success: ebayResult.ok,
          listingId: ebayResult.offerId,
          url: `https://www.ebay.com/itm/${ebayResult.offerId}`,
        };
      } catch (err) {
        results.ebay = { success: false, error: err.message };
      }
    }

    if (selectedPlatforms.includes("etsy")) {
      results.etsy = {
        success: false,
        error: "Etsy OAuth not configured yet",
      };
    }

    if (selectedPlatforms.includes("amazon")) {
      results.amazon = {
        success: false,
        error: "Amazon OAuth not configured yet",
      };
    }

    if (selectedPlatforms.includes("tiktok")) {
      results.tiktok = {
        success: false,
        error: "TikTok Shop connection not configured yet",
      };
    }

    return results;
  }

  mapToEbay(product) {
    return {
      title: product.title,
      description: product.description,
      price: product.price,
      quantity: product.quantity,
      sku: product.sku,
      images: product.images || [],
    };
  }
}

module.exports = { MultiPlatformPoster };
