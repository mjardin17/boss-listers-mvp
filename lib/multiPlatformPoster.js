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

function ebayCondition(text) {
  const t = String(text || "").toLowerCase().replace(/_/g, " ");
  if (/new.*defect/.test(t)) return "NEW_WITH_DEFECTS";
  if (/new.*other|open box/.test(t)) return "NEW_OTHER";
  if (/^new\b|brand new/.test(t)) return "NEW";
  if (/like new|mint/.test(t)) return "LIKE_NEW";
  if (/excellent/.test(t)) return "USED_EXCELLENT";
  if (/very good/.test(t)) return "USED_VERY_GOOD";
  if (/acceptable|fair|worn/.test(t)) return "USED_ACCEPTABLE";
  if (/parts|not working|broken|damaged|poor/.test(t)) return "FOR_PARTS_OR_NOT_WORKING";
  return "USED_GOOD";
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
    this.ebayInputs = require("./ebayPublishInputs");
  }

  // Every connector's createListing() defaults to a DRY RUN and only goes live
  // when asked explicitly. Results come only from what each connector actually
  // returned (see toPlatformResult), never from the fact that a call didn't throw.
  // Going live requires options.live === true, which callers pass only after the
  // seller explicitly confirmed, and a real price: this never invents one.
  async postToAllPlatforms(tenantId, product, selectedPlatforms = ["ebay"], options = {}) {
    const live = options.live === true;
    const results = {};

    if (live && !(Number(product && product.price) > 0)) {
      for (const platform of selectedPlatforms) {
        results[platform] = { success: false, error: "Set a price greater than 0 before posting live." };
      }
      return results;
    }

    const confirm = live ? { confirm: "PUBLISH_LIVE" } : {};
    const run = { dryRun: !live, ...confirm };
    const mapped = {
      ebay: () => this.postEbay(tenantId, product, live),
      etsy: () => this.etsy.createListing(this.mapToEtsy(product), { tenantId, ...run }),
      amazon: () => this.amazon.createListing({ ...this.mapToAmazon(product), tenantId }, run),
      tiktok: () => this.tiktok.createListing({ ...this.mapToTikTok(product), tenantId }, run),
      shopify: () => this.shopify.createListing({ ...this.mapToShopify(product), tenantId }, run),
      facebook: () => this.facebook.createListing({ ...this.mapToFacebook(product), tenantId }, run),
      bonanza: () => this.bonanza.createListing({ ...this.mapToBonanza(product), tenantId }, run),
      woocommerce: () => this.woocommerce.createListing({ ...this.mapToWooCommerce(product), tenantId }, run),
      instagram: () => this.instagram.createListing({ ...this.mapToInstagram(product), tenantId }, run),
    };

    for (const platform of selectedPlatforms) {
      const post = mapped[platform];
      if (!post) {
        results[platform] = { success: false, error: "No direct integration for this platform yet." };
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

  // eBay needs a category and the seller's business policies before an offer
  // can exist. Dry runs skip that; live runs resolve them from the seller's own
  // account and fail with a clear message if any is missing.
  async postEbay(tenantId, product, live) {
    const ebayProduct = this.mapToEbay(product);
    if (!live) return this.ebay.createListing(ebayProduct, {}, { tenantId, dryRun: true });

    const accessToken = await this.ebay._getAccessToken(tenantId);
    const [{ categoryId }, policies] = await Promise.all([
      this.ebayInputs.suggestCategoryId(product.title),
      this.ebayInputs.resolvePolicies(accessToken),
    ]);
    const images = (ebayProduct.images || []).filter((u) => typeof u === "string" && /^https:\/\//.test(u));
    if (!images.length) throw new Error("eBay needs at least one publicly hosted (https) photo.");
    return this.ebay.createListing(
      { ...ebayProduct, category_id: categoryId, image_urls: images, condition: ebayCondition(product.condition) },
      policies,
      { tenantId, dryRun: false, confirm: "PUBLISH_LIVE" }
    );
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
module.exports.ebayCondition = ebayCondition;
