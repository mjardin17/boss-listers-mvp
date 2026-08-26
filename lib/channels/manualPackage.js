// lib/channels/manualPackage.js
// Manual export connector: generates copy-paste-ready, platform-optimized
// listing packages for marketplaces we post to by hand (Facebook
// Marketplace, OfferUp, Craigslist, Mercari, Poshmark, or any other).
// Pure local logic — no external APIs, no credentials, fully functional
// today. This is the fastest path to "operational" while API approvals
// are pending.

const MANUAL_PLATFORMS = Object.freeze({
  facebook: {
    label: "Facebook Marketplace",
    titleMax: 99,
    descriptionMax: 5000,
    supportsShipping: true,
    tone: "casual, friendly, emoji-light",
    categoryHint: "Pick the closest Marketplace category; FB buries bad-category items.",
    postUrl: "https://www.facebook.com/marketplace/create/item",
  },
  offerup: {
    label: "OfferUp",
    titleMax: 50,
    descriptionMax: 1000,
    supportsShipping: true,
    tone: "short and direct — OfferUp buyers skim",
    categoryHint: "OfferUp categories are broad; condition field matters more.",
    // offerup.com/post/ now redirects web visitors to an app-download QR
    // code — OfferUp killed web posting (confirmed live 2026-08-26).
    // Posting is app-only, so this package can't be filled by a browser
    // extension; use the copy/photos here from the OfferUp mobile app instead.
    postUrl: "https://offerup.com/getapp",
  },
  craigslist: {
    label: "Craigslist",
    titleMax: 70,
    descriptionMax: 4000,
    supportsShipping: false,
    tone: "plain text, no emoji, specifics up front — CL buyers distrust fluff",
    categoryHint: "for sale by owner → closest category; wrong section gets flagged.",
    postUrl: "https://post.craigslist.org/",
  },
  mercari: {
    label: "Mercari",
    titleMax: 80,
    descriptionMax: 1000,
    supportsShipping: true,
    tone: "keyword-dense first line; Mercari search weights titles heavily",
    categoryHint: "Use Mercari's brand + category autocomplete exactly.",
    postUrl: "https://www.mercari.com/sell/",
  },
  poshmark: {
    label: "Poshmark",
    titleMax: 80,
    descriptionMax: 1500,
    supportsShipping: true,
    tone: "brand-forward, size prominent, style keywords — Posh is fashion-first",
    categoryHint: "Brand → Category → Size are required and searchable.",
    postUrl: "https://poshmark.com/create-listing",
  },
  pinterest: {
    label: "Pinterest",
    titleMax: 500,
    descriptionMax: 5000,
    supportsShipping: false,
    tone: "visual storytelling, keywords for search, inspiration-focused",
    categoryHint: "Choose a relevant board or let Pinterest auto-categorize.",
    postUrl: "https://www.pinterest.com/pin/create/",
  },
  amazon: {
    label: "Amazon Seller Central",
    titleMax: 200,
    descriptionMax: 2000,
    supportsShipping: true,
    tone: "professional, SEO-friendly, feature-focused — Amazon buyers scan bullet points",
    categoryHint: "Amazon categories are strict; incorrect category can suppress visibility.",
    postUrl: "https://sellercentral.amazon.com/products/new",
  },
  woocommerce: {
    label: "WooCommerce",
    titleMax: 100,
    descriptionMax: 5000,
    supportsShipping: true,
    tone: "detailed product specs, SEO keywords in title, benefits in description",
    categoryHint: "Use your store's product categories; tags help with filtering.",
    postUrl: "https://your-store.com/wp-admin/post-new.php?post_type=product",
  },
  abeBooks: {
    label: "AbeBooks",
    titleMax: 150,
    descriptionMax: 1500,
    supportsShipping: true,
    tone: "book-specific: condition, edition, binding, ISBN — collectors read carefully",
    categoryHint: "Book category and condition rating are critical for visibility.",
    postUrl: "https://www.abebooks.com/books/sell/",
  },
  alibris: {
    label: "Alibris",
    titleMax: 120,
    descriptionMax: 2000,
    supportsShipping: true,
    tone: "detailed book descriptions with edition/binding details, condition clear",
    categoryHint: "Alibris buyers are collectors; condition and edition matter most.",
    postUrl: "https://www.alibris.com/sell/",
  },
  reverb: {
    label: "Reverb",
    titleMax: 100,
    descriptionMax: 2000,
    supportsShipping: true,
    tone: "musical instruments: brand, model, condition, playability — gear nerds know specs",
    categoryHint: "Instrument category and condition heavily impact search visibility.",
    postUrl: "https://reverb.com/sells/new",
  },
  discogs: {
    label: "Discogs",
    titleMax: 150,
    descriptionMax: 1000,
    supportsShipping: true,
    tone: "vinyl/CD specifics: pressing info, jacket condition, plays accurately",
    categoryHint: "Match exact album/artist/pressing in Discogs database for best results.",
    postUrl: "https://www.discogs.com/sell/release/",
  },
  depop: {
    label: "Depop",
    titleMax: 70,
    descriptionMax: 500,
    supportsShipping: true,
    tone: "fashion first: brand, size, fit, vibe — Depop is Gen-Z marketplace",
    categoryHint: "Size and fit tags are searchable; be exact.",
    postUrl: "https://www.depop.com/",
  },
  vinted: {
    label: "Vinted",
    titleMax: 85,
    descriptionMax: 800,
    supportsShipping: true,
    tone: "fashion, honest condition, size exact — Vinted buyers inspect photos carefully",
    categoryHint: "Brand and size are primary search filters.",
    postUrl: "https://www.vinted.com/",
  },
  grailed: {
    label: "Grailed",
    titleMax: 100,
    descriptionMax: 1500,
    supportsShipping: true,
    tone: "men's fashion: designer details, fit, era — Grailed cares about authenticity",
    categoryHint: "Designer and era/decade matter for vintage; authenticity critical.",
    postUrl: "https://www.grailed.com/sell",
  },
  vestiaire: {
    label: "Vestiaire Collective",
    titleMax: 140,
    descriptionMax: 1000,
    supportsShipping: true,
    tone: "luxury fashion: brand cachet, condition impeccable, authenticity paramount",
    categoryHint: "Luxury items: condition and authenticity are non-negotiable.",
    postUrl: "https://www.vestiairecollective.com/sell/",
  },
  realreal: {
    label: "The RealReal",
    titleMax: 120,
    descriptionMax: 1500,
    supportsShipping: true,
    tone: "luxury consignment: brand-led, condition-focused, expertise assumed",
    categoryHint: "Authentication required; condition and authenticity are make-or-break.",
    postUrl: "https://www.therealreal.com/sell",
  },
  stockx: {
    label: "StockX",
    titleMax: 100,
    descriptionMax: 1000,
    supportsShipping: true,
    tone: "sneaker/collectible market: exact model, size, condition, deadstock focus",
    categoryHint: "StockX verifies; condition and authenticity checked before payout.",
    postUrl: "https://stockx.com/sell",
  },
  goat: {
    label: "GOAT",
    titleMax: 100,
    descriptionMax: 1500,
    supportsShipping: true,
    tone: "sneaker-first: model, size, condition, wear level — GOAT buyers nitpick",
    categoryHint: "Exact size and condition level drive GOAT demand.",
    postUrl: "https://www.goat.com/sell",
  },
  shopify: {
    label: "Shopify",
    titleMax: 100,
    descriptionMax: 5000,
    supportsShipping: true,
    tone: "your own store: brand voice, detailed benefits, conversion-focused copy",
    categoryHint: "Use your store's product types and collections.",
    postUrl: "https://your-store.myshopify.com/admin/products/new",
  },
  mercadoLibre: {
    label: "Mercado Libre",
    titleMax: 60,
    descriptionMax: 2000,
    supportsShipping: true,
    tone: "Spanish/LatAm: clear, concise, price-forward — buyers compare quickly",
    categoryHint: "Mercado Libre categories vary by country; pick local category.",
    postUrl: "https://www.mercadolibre.com/",
  },
  fiveM: {
    label: "5Miles",
    titleMax: 90,
    descriptionMax: 1000,
    supportsShipping: true,
    tone: "local marketplace: casual, friendly, community-feel",
    categoryHint: "Local pickup option encouraged; shipping optional.",
    postUrl: "https://5miles.com/",
  },
  tiktokShop: {
    label: "TikTok Shop",
    titleMax: 80,
    descriptionMax: 800,
    supportsShipping: true,
    tone: "viral-first: trendy language, hashtag-friendly, trending appeal",
    categoryHint: "TikTok Shop categories evolving; use trending subcategories.",
    postUrl: "https://seller.tiktok.com/",
  },
});

function truncate(text, max) {
  if (!text || text.length <= max) return text || "";
  return text.slice(0, max - 1).trimEnd() + "…";
}

/** Keyword extraction: title + brand + condition words, deduped. */
function buildKeywords(product) {
  const source = [product.title, product.brand, product.condition, product.description]
    .filter(Boolean).join(" ").toLowerCase();
  const stop = new Set(["the","a","an","and","or","for","with","of","in","on","to","is","are","this","that","new","used"]);
  const words = source.match(/[a-z0-9][a-z0-9'-]{2,}/g) || [];
  return [...new Set(words.filter((w) => !stop.has(w)))].slice(0, 15);
}

function buildTitle(product, platform) {
  const spec = MANUAL_PLATFORMS[platform];
  const parts = [product.brand, product.title, product.size ? `Size ${product.size}` : null]
    .filter(Boolean);
  // Avoid "Nike Nike Air Max" when the title already leads with the brand.
  const base = parts[0] && parts[1] && parts[1].toLowerCase().startsWith(parts[0].toLowerCase())
    ? parts.slice(1).join(" — ")
    : parts.join(" — ");
  return truncate(base, spec.titleMax);
}

function buildDescription(product, platform) {
  const spec = MANUAL_PLATFORMS[platform];
  const lines = [];
  lines.push(product.description || product.title);
  lines.push("");
  if (product.brand) lines.push(`Brand: ${product.brand}`);
  if (product.size) lines.push(`Size: ${product.size}`);
  if (product.condition) lines.push(`Condition: ${product.condition}`);
  if (product.sku) lines.push(`Ref: ${product.sku}`);
  lines.push("");
  if (spec.supportsShipping) {
    lines.push("Ships fast with tracking. Local pickup also available.");
  } else {
    lines.push("Local pickup — cash or agreed payment on pickup. First come, first served.");
  }
  if (platform === "poshmark") lines.push("Bundle for a private discount!");
  if (platform === "craigslist") lines.push("Serious inquiries only please. No holds without deposit.");
  return truncate(lines.join("\n"), spec.descriptionMax);
}

const PHOTO_CHECKLIST = [
  "Front, straight-on, natural light",
  "Back",
  "Brand/size tag close-up",
  "Any flaws close-up (honesty prevents returns/disputes)",
  "In-use or styled shot if possible",
  "All angles for items over $50",
];

/**
 * Builds the full manual listing package for one product on one platform.
 * @param {object} product row from the shared `products` table (+ optional brand/size)
 * @param {string} platform key of MANUAL_PLATFORMS
 */
function buildManualPackage(product, platform) {
  const spec = MANUAL_PLATFORMS[platform];
  if (!spec) {
    const err = new Error(`Unknown manual platform: ${platform}. Supported: ${Object.keys(MANUAL_PLATFORMS).join(", ")}`);
    err.statusCode = 400;
    throw err;
  }
  return {
    platform,
    platformLabel: spec.label,
    postUrl: spec.postUrl,
    sku: product.sku,
    fields: {
      title: buildTitle(product, platform),
      description: buildDescription(product, platform),
      price: typeof product.price === "number" ? product.price.toFixed(2) : String(product.price || ""),
      condition: product.condition || "",
      categorySuggestion: spec.categoryHint,
      itemSpecifics: {
        brand: product.brand || "",
        size: product.size || "",
        sku: product.sku || "",
      },
      shippingText: spec.supportsShipping
        ? "Shipping available (buyer pays unless promo) + local pickup"
        : "Local pickup only",
      keywords: buildKeywords(product),
    },
    images: [product.image_url, ...(product.extra_images || [])].filter(Boolean),
    photoChecklist: PHOTO_CHECKLIST,
    toneGuide: spec.tone,
    limits: { titleMax: spec.titleMax, descriptionMax: spec.descriptionMax },
    generatedAt: new Date().toISOString(),
  };
}

/** CSV export: one row per (product, platform) package. */
function packagesToCsv(packages) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["sku","platform","title","description","price","condition","shipping","keywords","image_urls","post_url"];
  const rows = packages.map((p) => [
    p.sku, p.platformLabel, p.fields.title, p.fields.description, p.fields.price,
    p.fields.condition, p.fields.shippingText, p.fields.keywords.join(" "),
    p.images.join(" "), p.postUrl,
  ].map(esc).join(","));
  return [header.join(","), ...rows].join("\r\n");
}

module.exports = { MANUAL_PLATFORMS, buildManualPackage, packagesToCsv };
