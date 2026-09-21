/**
 * lib/ads4now/commercialMission.js — Commercial Mission & Variants Builder
 * Formats a 30-second, 5-scene commercial package with 3 creative variants
 * and social proof review star integration.
 */

const BRAND_TAGLINE = "Boss Listers: Curated, Affordable, Authentic";

function formatSocialProof(reviews) {
  if (!reviews || !reviews.rating) {
    return BRAND_TAGLINE;
  }
  const ratingNum = parseFloat(reviews.rating);
  const starsCount = Number.isFinite(ratingNum) ? Math.min(5, Math.max(1, Math.round(ratingNum))) : 5;
  const stars = "★".repeat(starsCount) + "☆".repeat(5 - starsCount);
  const countStr = reviews.count ? ` · ${reviews.count} reviews` : "";
  return `${stars} ${reviews.rating}${countStr}`;
}

function createCommercialMission(product, brief, options = {}) {
  const {
    hookVariantIndex = 0,
    width = 1080,
    height = 1920,
    aspect = "9:16",
  } = options;

  const name = product.title || product.name || "Featured Item";
  const description = product.description || "High quality product.";
  const priceNum = typeof product.price === "number" ? product.price : parseFloat(product.price) || 0;
  const priceStr = `$${priceNum.toFixed(2)}`;
  const imageUrl = product.image_url || null;

  const scenesCopy = (brief && brief.scenes) || {};
  const hooks = (brief && brief.hooks) || [
    `Stop scrolling — ${name} just dropped.`,
    `POV: You found the perfect ${name}.`,
    `Nobody talks about this ${name} enough.`,
  ];

  const selectedHook = hooks[hookVariantIndex] || hooks[0];
  const proofLine = formatSocialProof(product.reviews);
  const proofQuote = product.reviews?.quote || "";

  const scenes = [
    {
      id: 1,
      name: "title",
      label: "Scene 1: Title Hook",
      duration: 3.0,
      headline: scenesCopy.title?.headline || name,
      subhead: "Boss Listers Exclusive",
      narration: scenesCopy.title?.narration || `Introducing the ${name}.`,
      bgImage: "/backgrounds/bg-hook.jpg",
      effect: "title_slam",
    },
    {
      id: 2,
      name: "showcase",
      label: "Scene 2: 3D Showcase",
      duration: 8.0,
      image: imageUrl,
      caption: selectedHook,
      narration: scenesCopy.showcase?.narration || `Look at the craftsmanship on this.`,
      bgImage: "/backgrounds/bg-showcase.jpg",
      effect: "turntable_orbit",
    },
    {
      id: 3,
      name: "description",
      label: "Scene 3: Key Benefits",
      duration: 6.0,
      image: imageUrl,
      overlay_text: scenesCopy.description?.overlay_text || description.split(".")[0],
      narration: scenesCopy.description?.narration || description.split(".")[0],
      bgImage: "/backgrounds/bg-features.jpg",
      effect: "benefit_pop",
    },
    {
      id: 4,
      name: "price_cta",
      label: "Scene 4: Price & Urgency",
      duration: 5.0,
      price_text: priceStr,
      cta_text: "Shop Now",
      store_text: "Available on Boss Listers",
      narration: scenesCopy.price_cta?.narration || `Only ${priceStr}. Grab yours before it sells out.`,
      bgImage: "/backgrounds/bg-cta.jpg",
      effect: "urgency_flash",
    },
    {
      id: 5,
      name: "product_loop",
      label: "Scene 5: Brand Finale",
      duration: 8.0,
      image: imageUrl,
      proof_text: proofLine,
      proof_quote: proofQuote,
      narration: scenesCopy.product_loop?.narration || `${name}. Curated, authentic, only on Boss Listers.`,
      bgImage: "/backgrounds/bg-proof.jpg",
      effect: "finale_loop",
    },
  ];

  const totalDuration = scenes.reduce((acc, s) => acc + s.duration, 0);

  // Creative variants definition
  const variants = hooks.map((hook, idx) => ({
    id: idx + 1,
    title: idx === 0 ? "Variant A (Scroll Stopper)" : idx === 1 ? "Variant B (POV Lifestyle)" : "Variant C (Social Proof & FOMO)",
    hook,
    openingNarration: idx === 0 ? `Stop scrolling! Check out the ${name}.` : idx === 1 ? `POV: You found the ultimate ${name}.` : `Everyone's asking about the ${name}.`,
  }));

  return {
    id: `commercial-${(product.sku || "item").toLowerCase()}-v${hookVariantIndex + 1}`,
    aspect,
    dimensions: { width, height },
    totalDuration,
    product: {
      sku: product.sku || "SKU-ITEM",
      name,
      price: priceNum,
      price_str: priceStr,
      image: imageUrl,
      cutout: product.cutout_url || null,
      reviews: product.reviews || {},
    },
    brief,
    activeVariantIndex: hookVariantIndex,
    activeHook: selectedHook,
    variants,
    scenes,
  };
}

module.exports = {
  createCommercialMission,
  formatSocialProof,
};
