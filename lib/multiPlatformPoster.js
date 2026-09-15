const {
  EbayConnector,
  EtsyConnector,
  FacebookConnector,
  AmazonConnector,
  TikTokShopConnector,
  ShopifyConnector,
  WooCommerceConnector,
  BonanzaConnector,
  InstagramConnector,
} = require("./channels/apiConnectors");

class MultiPlatformPoster {
  constructor() {
    this.ebay = new EbayConnector();
    this.etsy = new EtsyConnector();
    this.facebook = new FacebookConnector();
    this.amazon = new AmazonConnector();
    this.tiktok = new TikTokShopConnector();
    this.shopify = new ShopifyConnector();
    this.woocommerce = new WooCommerceConnector();
    this.bonanza = new BonanzaConnector();
    this.instagram = new InstagramConnector();
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
      try {
        const etsyProduct = this.mapToEtsy(product);
        etsyProduct.tenantId = tenantId;
        const etsyResult = await this.etsy.createListing(etsyProduct);
        results.etsy = {
          success: true,
          listingId: etsyResult.listingId,
          url: etsyResult.url,
        };
      } catch (err) {
        results.etsy = { success: false, error: err.message };
      }
    }

    if (selectedPlatforms.includes("amazon")) {
      try {
        const amazonProduct = this.mapToAmazon(product);
        amazonProduct.tenantId = tenantId;
        const amazonResult = await this.amazon.createListing(amazonProduct);
        results.amazon = {
          success: true,
          listingId: amazonResult.listingId,
          url: amazonResult.url,
        };
      } catch (err) {
        results.amazon = { success: false, error: err.message };
      }
    }

    if (selectedPlatforms.includes("tiktok")) {
      try {
        const tiktokProduct = this.mapToTikTok(product);
        tiktokProduct.tenantId = tenantId;
        const tiktokResult = await this.tiktok.createListing(tiktokProduct);
        results.tiktok = {
          success: true,
          listingId: tiktokResult.listingId,
          url: tiktokResult.url,
        };
      } catch (err) {
        results.tiktok = { success: false, error: err.message };
      }
    }

    if (selectedPlatforms.includes("shopify")) {
      try {
        const shopifyProduct = this.mapToShopify(product);
        shopifyProduct.tenantId = tenantId;
        const shopifyResult = await this.shopify.createListing(shopifyProduct);
        results.shopify = {
          success: true,
          listingId: shopifyResult.listingId,
          url: shopifyResult.url,
        };
      } catch (err) {
        results.shopify = { success: false, error: err.message };
      }
    }

    if (selectedPlatforms.includes("facebook")) {
      try {
        const fbProduct = this.mapToFacebook(product);
        fbProduct.tenantId = tenantId;
        const fbResult = await this.facebook.createListing(fbProduct);
        results.facebook = {
          success: true,
          listingId: fbResult.listingId,
          url: fbResult.url,
        };
      } catch (err) {
        results.facebook = { success: false, error: err.message };
      }
    }

    if (selectedPlatforms.includes("bonanza")) {
      try {
        const bonanzaProduct = this.mapToBonanza(product);
        bonanzaProduct.tenantId = tenantId;
        const bonanzaResult = await this.bonanza.createListing(bonanzaProduct);
        results.bonanza = {
          success: true,
          listingId: bonanzaResult.listingId,
          url: bonanzaResult.url,
        };
      } catch (err) {
        results.bonanza = { success: false, error: err.message };
      }
    }

    if (selectedPlatforms.includes("woocommerce")) {
      try {
        const wooProduct = this.mapToWooCommerce(product);
        wooProduct.tenantId = tenantId;
        const wooResult = await this.woocommerce.createListing(wooProduct);
        results.woocommerce = {
          success: true,
          listingId: wooResult.listingId,
          url: wooResult.url,
        };
      } catch (err) {
        results.woocommerce = { success: false, error: err.message };
      }
    }

    if (selectedPlatforms.includes("instagram")) {
      try {
        const instagramProduct = this.mapToInstagram(product);
        instagramProduct.tenantId = tenantId;
        const instagramResult = await this.instagram.createListing(instagramProduct);
        results.instagram = {
          success: true,
          listingId: instagramResult.listingId,
          url: instagramResult.url,
        };
      } catch (err) {
        results.instagram = { success: false, error: err.message };
      }
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

  mapToShopify(product) {
    return {
      title: product.title,
      description: product.description,
      price: product.price,
      quantity: product.quantity,
      sku: product.sku,
      imageUrl: product.image_url,
    };
  }

  mapToEtsy(product) {
    return {
      title: product.title,
      description: product.description,
      price: product.price,
      quantity: product.quantity,
      sku: product.sku,
      imageUrl: product.image_url,
    };
  }

  mapToAmazon(product) {
    return {
      title: product.title,
      description: product.description,
      price: product.price,
      quantity: product.quantity,
      sku: product.sku,
      imageUrl: product.image_url,
    };
  }

  mapToTikTok(product) {
    return {
      title: product.title,
      description: product.description,
      price: product.price,
      quantity: product.quantity,
      sku: product.sku,
      imageUrl: product.image_url,
    };
  }

  mapToFacebook(product) {
    return {
      title: product.title,
      description: product.description,
      price: product.price,
      quantity: product.quantity,
      sku: product.sku,
      imageUrl: product.image_url,
    };
  }

  mapToBonanza(product) {
    return {
      title: product.title,
      description: product.description,
      price: product.price,
      quantity: product.quantity,
      sku: product.sku,
      imageUrl: product.image_url,
    };
  }

  mapToWooCommerce(product) {
    return {
      title: product.title,
      description: product.description,
      price: product.price,
      quantity: product.quantity,
      sku: product.sku,
      imageUrl: product.image_url,
    };
  }

  mapToInstagram(product) {
    return {
      title: product.title,
      description: product.description,
      price: product.price,
      quantity: product.quantity,
      sku: product.sku,
      imageUrl: product.image_url,
    };
  }
}

module.exports = { MultiPlatformPoster };
