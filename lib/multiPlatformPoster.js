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

/**
 * Turns a connector's return value into an honest per-platform result.
 * success is true ONLY for a real, live listing that carries an id or url from
 * the platform. Dry runs, unpublished offers and id-less responses are never
 * reported as posted.
 */
function toPlatformResult(res) {
  if (!res || res.ok === false) {
    return { success: false, error: (res && res.error) || "The platform did not accept the listing." };
  }
  if (res.dry_run || res.dryRun) {
    return { success: false, dryRun: true, note: "Dry run only. Nothing was posted to this platform." };
  }
  const listingId = res.listingId || res.offerId || res.id || res.productId || null;
  const url = res.url || res.listing_url || null;
  if (res.published === false) {
    return { success: false, listingId, note: res.note || "Created but not published." };
  }
  if (!listingId && !url) {
    return { success: false, error: "The platform returned no listing id, so this is not counted as posted." };
  }
  return { success: true, listingId, url };
}

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

  // Every connector's createListing() defaults to a DRY RUN and only goes live
  // when asked explicitly. This method used to call them without that and then
  // report success: true for whatever came back, so the Post page told sellers
  // their item was posted everywhere when nothing had been posted. Results now
  // come only from what the connector actually returned (see toPlatformResult).
  // Live posting is opt-in via MULTI_PLATFORM_LIVE=1 and is not enabled by default.
  async postToAllPlatforms(tenantId, product, selectedPlatforms = ["ebay"]) {
    const live = process.env.MULTI_PLATFORM_LIVE === "1";
    const results = {};
    const mapped = {
      ebay: () => this.ebay.createListing(this.mapToEbay(product), {}, { tenantId, dryRun: !live }),
      etsy: () => this.etsy.createListing(this.mapToEtsy(product), { tenantId, dryRun: !live }),
      amazon: () => this.amazon.createListing({ ...this.mapToAmazon(product), tenantId }, { dryRun: !live }),
      tiktok: () => this.tiktok.createListing({ ...this.mapToTikTok(product), tenantId }, { dryRun: !live }),
      shopify: () => this.shopify.createListing({ ...this.mapToShopify(product), tenantId }, { dryRun: !live }),
      facebook: () => this.facebook.createListing({ ...this.mapToFacebook(product), tenantId }, { dryRun: !live }),
      bonanza: () => this.bonanza.createListing({ ...this.mapToBonanza(product), tenantId }, { dryRun: !live }),
      woocommerce: () => this.woocommerce.createListing({ ...this.mapToWooCommerce(product), tenantId }, { dryRun: !live }),
      instagram: () => this.instagram.createListing({ ...this.mapToInstagram(product), tenantId }, { dryRun: !live }),
    };

    for (const platform of selectedPlatforms) {
      const post = mapped[platform];
      if (!post) {
        results[platform] = { success: false, error: "Unknown platform" };
        continue;
      }
      try {
        results[platform] = toPlatformResult(await post());
      } catch (err) {
        results[platform] = { success: false, error: err.message };
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
module.exports.toPlatformResult = toPlatformResult;
