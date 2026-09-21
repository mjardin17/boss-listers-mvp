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

  collectMedia(product) {
    const images = [];
    if (product.image_url) images.push(product.image_url);

    if (Array.isArray(product.images)) {
      for (const img of product.images) {
        const url = typeof img === "string" ? img : img?.src || img?.url;
        if (url && !images.includes(url)) images.push(url);
      }
    }

    if (Array.isArray(product.keyframes)) {
      for (const kf of product.keyframes) {
        const url = typeof kf === "string" ? kf : kf?.url || kf?.dataUrl;
        if (url && !images.includes(url)) images.push(url);
      }
    }

    // Check if styleframe media was embedded in description JSON or fields
    let videoUrl = product.styleframe_video || null;
    let commercialTikTokUrl = product.commercial_tiktok_url || null;
    let commercialInstagramUrl = product.commercial_instagram_url || null;
    let commercialFacebookUrl = product.commercial_facebook_url || null;

    if (typeof product.description === "string" && product.description.includes("STYLEFRAME_MEDIA:")) {
      try {
        const match = product.description.match(/<!-- STYLEFRAME_MEDIA:\s*(\{.*?\})\s*-->/);
        if (match) {
          const parsed = JSON.parse(match[1]);
          if (parsed.styleframe_video && !videoUrl) videoUrl = parsed.styleframe_video;
          if (parsed.commercial_tiktok_url && !commercialTikTokUrl) commercialTikTokUrl = parsed.commercial_tiktok_url;
          if (parsed.commercial_instagram_url && !commercialInstagramUrl) commercialInstagramUrl = parsed.commercial_instagram_url;
          if (parsed.commercial_facebook_url && !commercialFacebookUrl) commercialFacebookUrl = parsed.commercial_facebook_url;
          if (Array.isArray(parsed.keyframes)) {
            for (const kf of parsed.keyframes) {
              const url = typeof kf === "string" ? kf : (kf?.url || kf?.dataUrl);
              if (url && !images.includes(url)) images.push(url);
            }
          }
        }
      } catch {}
    } else if (!videoUrl && typeof product.description === "string" && product.description.includes('"styleframe_video":')) {
      try {
        const match = product.description.match(/"styleframe_video":\s*"([^"]+)"/);
        if (match) videoUrl = match[1];
      } catch {}
    }

    return {
      primaryImage: images[0] || product.image_url || null,
      images,
      videoUrl,
      commercialTikTokUrl,
      commercialInstagramUrl,
      commercialFacebookUrl,
    };
  }

  mapToEbay(product) {
    const { images, primaryImage } = this.collectMedia(product);
    return {
      title: product.title,
      description: product.description,
      price: product.price,
      quantity: product.quantity,
      sku: product.sku,
      images: images.length > 0 ? images : (product.images || []),
      imageUrl: primaryImage,
    };
  }

  mapToShopify(product) {
    const { images, primaryImage } = this.collectMedia(product);
    return {
      title: product.title,
      description: product.description,
      price: product.price,
      quantity: product.quantity,
      sku: product.sku,
      imageUrl: primaryImage,
      images: images,
    };
  }

  mapToEtsy(product) {
    const { images, primaryImage } = this.collectMedia(product);
    return {
      title: product.title,
      description: product.description,
      price: product.price,
      quantity: product.quantity,
      sku: product.sku,
      imageUrl: primaryImage,
      images: images,
    };
  }

  mapToAmazon(product) {
    const { images, primaryImage, videoUrl } = this.collectMedia(product);
    return {
      title: product.title,
      description: product.description,
      price: product.price,
      quantity: product.quantity,
      sku: product.sku,
      imageUrl: primaryImage,
      images: images,
      videoUrl: videoUrl,
    };
  }

  mapToTikTok(product) {
    const { images, primaryImage, videoUrl, commercialTikTokUrl } = this.collectMedia(product);
    return {
      title: product.title,
      description: product.description,
      price: product.price,
      quantity: product.quantity,
      sku: product.sku,
      imageUrl: primaryImage,
      images: images,
      videoUrl: commercialTikTokUrl || videoUrl,
      commercial_url: commercialTikTokUrl || null,
    };
  }

  mapToFacebook(product) {
    const { images, primaryImage, videoUrl, commercialFacebookUrl } = this.collectMedia(product);
    return {
      title: product.title,
      description: product.description,
      price: product.price,
      quantity: product.quantity,
      sku: product.sku,
      imageUrl: primaryImage,
      images: images,
      videoUrl: commercialFacebookUrl || videoUrl,
      commercial_url: commercialFacebookUrl || null,
    };
  }

  mapToBonanza(product) {
    const { images, primaryImage } = this.collectMedia(product);
    return {
      title: product.title,
      description: product.description,
      price: product.price,
      quantity: product.quantity,
      sku: product.sku,
      imageUrl: primaryImage,
      images: images,
    };
  }

  mapToWooCommerce(product) {
    const { images, primaryImage } = this.collectMedia(product);
    return {
      title: product.title,
      description: product.description,
      price: product.price,
      quantity: product.quantity,
      sku: product.sku,
      imageUrl: primaryImage,
      images: images,
    };
  }

  mapToInstagram(product) {
    const { images, primaryImage, videoUrl, commercialInstagramUrl } = this.collectMedia(product);
    return {
      title: product.title,
      description: product.description,
      price: product.price,
      quantity: product.quantity,
      sku: product.sku,
      imageUrl: primaryImage,
      images: images,
      videoUrl: commercialInstagramUrl || videoUrl,
      commercial_url: commercialInstagramUrl || null,
    };
  }
}

module.exports = { MultiPlatformPoster };
