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
    postUrl: "https://offerup.com/post/",
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
