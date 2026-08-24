import type { PersonalSaleMatch, UserVerifiedSale } from "./salesHistoryTypes";
import { normalizeSalesTitleTokens } from "./salesNormalizer";
import { buildScanMatchingKeys } from "../userCorrections/correctionMerge";

type ProductContext = {
  title?: string;
  upc?: string;
  ean?: string;
  sku?: string;
  brand?: string;
  category?: string;
  ocrText?: unknown;
  visualAnchors?: unknown;
  packagingHints?: unknown;
  matchingKeys?: string[];
};

const COLOR_TOKENS = new Set(["black", "white", "red", "blue", "green", "yellow", "orange", "purple", "pink", "gray", "grey", "silver", "gold", "brown", "tan", "clear"]);
const BUNDLE_TOKENS = new Set(["bundle", "lot", "case", "wholesale", "multipack", "multi", "pack"]);
const QUANTITY_PATTERN = /\b(\d+)\s*(pack|pk|ct|count|piece|pieces|pc|pcs)\b/g;
const MODEL_PATTERN = /\b[a-z]{1,6}[- ]?\d{2,8}[a-z0-9-]*\b|\b\d{3,8}[a-z]{1,4}\b/gi;

function normalizeDigits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function text(value: unknown) {
  return Array.isArray(value) ? value.join(" ") : String(value || "");
}

function normalizeText(value: unknown) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value: unknown) {
  return new Set(normalizeSalesTitleTokens(normalizeText(value)));
}

function overlapScore(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  let matched = 0;
  left.forEach((token) => {
    if (right.has(token)) matched += 1;
  });
  return matched / Math.max(1, Math.min(left.size, right.size));
}

function extractModels(value: unknown) {
  return new Set((normalizeText(value).match(MODEL_PATTERN) || []).map((item) => item.replace(/\s+/g, "").toLowerCase()));
}

function extractColors(value: unknown) {
  const tokens = normalizeText(value).split(" ");
  return new Set(tokens.filter((token) => COLOR_TOKENS.has(token)));
}

function extractQuantities(value: unknown) {
  const quantities = new Set<string>();
  const normalized = normalizeText(value);
  for (const match of normalized.matchAll(QUANTITY_PATTERN)) {
    quantities.add(`${match[1]} ${match[2]}`);
  }
  if ([...BUNDLE_TOKENS].some((token) => normalized.includes(token))) quantities.add("bundle");
  return quantities;
}

function hasMismatch(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return false;
  return [...left].some((token) => !right.has(token)) || [...right].some((token) => !left.has(token));
}

function sharedSignals(left: Set<string>, right: Set<string>, label: string) {
  const shared = [...left].filter((token) => right.has(token));
  return shared.length ? [`${label}: ${shared.slice(0, 5).join(", ")}`] : [];
}

function matchType(score: number): PersonalSaleMatch["matchType"] {
  if (score >= 98) return "EXACT_MATCH";
  if (score >= 82) return "STRONG_MATCH";
  if (score >= 70) return "POSSIBLE_MATCH";
  return "WEAK_MATCH";
}

function confidenceBoostFor(type: PersonalSaleMatch["matchType"]) {
  if (type === "EXACT_MATCH") return 18;
  if (type === "STRONG_MATCH") return 14;
  if (type === "POSSIBLE_MATCH") return 8;
  return 0;
}

export function scoreUserVerifiedSaleMatch(sale: UserVerifiedSale, product: ProductContext = {}): PersonalSaleMatch {
  const productUpc = normalizeDigits(product.upc);
  const productEan = normalizeDigits(product.ean);
  const saleUpc = normalizeDigits(sale.upc);
  const productTitle = `${product.brand || ""} ${product.title || ""}`;
  const saleTitle = sale.itemTitle || "";
  const productTokens = tokenSet(`${productTitle} ${text(product.ocrText)} ${text(product.visualAnchors)} ${text(product.packagingHints)}`);
  const saleTokens = tokenSet(`${saleTitle} ${sale.category || ""} ${sale.condition || ""}`);
  const titleTokens = tokenSet(productTitle);
  const saleTitleTokens = new Set(sale.normalizedTitleTokens?.length ? sale.normalizedTitleTokens : normalizeSalesTitleTokens(saleTitle));
  const productBrandTokens = tokenSet(product.brand);
  const saleBrandTokens = tokenSet(sale.itemTitle);
  const productCategoryTokens = tokenSet(product.category);
  const saleCategoryTokens = tokenSet(sale.category);
  const productModels = extractModels(productTitle);
  const saleModels = extractModels(saleTitle);
  const productColors = extractColors(productTitle);
  const saleColors = extractColors(saleTitle);
  const productQuantities = extractQuantities(productTitle);
  const saleQuantities = extractQuantities(saleTitle);
  const scanKeys = product.matchingKeys?.length ? product.matchingKeys : buildScanMatchingKeys(product).matchingKeys;
  const saleKeys = sale.matchingKeys || buildScanMatchingKeys({ upc: sale.upc, title: sale.itemTitle, category: sale.category }).matchingKeys;
  const matchingSignals: string[] = [];
  const rejectedSignals: string[] = [];
  const scoreBreakdown: Record<string, number> = {};

  if (productUpc && saleUpc && productUpc === saleUpc) {
    matchingSignals.push("UPC exact match");
    scoreBreakdown.upcExact = 100;
    return {
      sale,
      matchScore: 100,
      confidenceBoost: 18,
      matchReason: "UPC matched your previous sale.",
      matchType: "EXACT_MATCH",
      autoApply: true,
      matchingSignals,
      rejectedSignals,
      scoreBreakdown
    };
  }

  if (productEan && saleUpc && productEan === saleUpc) {
    matchingSignals.push("EAN exact match");
    scoreBreakdown.eanExact = 100;
    return {
      sale,
      matchScore: 100,
      confidenceBoost: 18,
      matchReason: "EAN matched your previous sale.",
      matchType: "EXACT_MATCH",
      autoApply: true,
      matchingSignals,
      rejectedSignals,
      scoreBreakdown
    };
  }

  const brandScore = overlapScore(productBrandTokens, saleBrandTokens);
  if (productBrandTokens.size && saleBrandTokens.size && brandScore === 0) {
    rejectedSignals.push("Brand mismatch blocked auto-match");
    scoreBreakdown.brand = -100;
    return {
      sale,
      matchScore: 0,
      confidenceBoost: 0,
      matchReason: "Brand mismatch blocked this previous sale match.",
      matchType: "WEAK_MATCH",
      autoApply: false,
      matchingSignals,
      rejectedSignals,
      scoreBreakdown
    };
  }

  const titleScore = overlapScore(titleTokens, saleTitleTokens);
  const ocrScore = overlapScore(productTokens, saleTokens);
  const categoryScore = overlapScore(productCategoryTokens, saleCategoryTokens);
  const keyScore = scanKeys.some((key) => saleKeys.includes(key) && !key.startsWith("brand_category:")) ? 1 : 0;

  scoreBreakdown.titleSimilarity = Math.round(titleScore * 30);
  scoreBreakdown.ocrOverlap = Math.round(ocrScore * 18);
  scoreBreakdown.brandSimilarity = Math.round(brandScore * 18);
  scoreBreakdown.categorySimilarity = Math.round(categoryScore * 8);
  scoreBreakdown.stableFingerprint = keyScore ? 14 : 0;
  scoreBreakdown.modelNumber = 0;
  scoreBreakdown.colorVariant = 0;
  scoreBreakdown.quantity = 0;
  scoreBreakdown.bundle = 0;

  matchingSignals.push(...sharedSignals(titleTokens, saleTitleTokens, "title tokens"));
  matchingSignals.push(...sharedSignals(productTokens, saleTokens, "OCR/package tokens"));
  if (keyScore) matchingSignals.push("Stable scan fingerprint matched");
  if (brandScore > 0) matchingSignals.push("Brand token overlap");
  if (categoryScore > 0) matchingSignals.push("Category token overlap");

  if (productModels.size || saleModels.size) {
    if (productModels.size && saleModels.size && hasMismatch(productModels, saleModels)) {
      scoreBreakdown.modelNumber = -30;
      rejectedSignals.push("Model number mismatch");
    } else if (productModels.size && saleModels.size) {
      scoreBreakdown.modelNumber = 12;
      matchingSignals.push("Model number aligned");
    }
  }

  if (hasMismatch(productColors, saleColors)) {
    scoreBreakdown.colorVariant = -16;
    rejectedSignals.push("Color variant mismatch");
  } else if (productColors.size && saleColors.size) {
    scoreBreakdown.colorVariant = 6;
    matchingSignals.push("Color variant aligned");
  }

  if (hasMismatch(productQuantities, saleQuantities)) {
    scoreBreakdown.quantity = -24;
    rejectedSignals.push("Quantity or pack-count mismatch");
  } else if (productQuantities.size && saleQuantities.size) {
    scoreBreakdown.quantity = 6;
    matchingSignals.push("Quantity indicators aligned");
  }

  const productBundle = productQuantities.has("bundle");
  const saleBundle = saleQuantities.has("bundle");
  if (productBundle !== saleBundle) {
    scoreBreakdown.bundle = -32;
    rejectedSignals.push("Bundle mismatch");
  }

  const rawScore = Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0);
  const score = Math.max(0, Math.min(99, Math.round(rawScore)));
  const type = matchType(score);
  const autoApply = type === "STRONG_MATCH" || type === "POSSIBLE_MATCH";

  return {
    sale,
    matchScore: score,
    confidenceBoost: confidenceBoostFor(type),
    matchReason:
      type === "STRONG_MATCH"
        ? "Strong fuzzy match to your previous sale."
        : type === "POSSIBLE_MATCH"
          ? "Possible match to your previous sale based on weighted reseller signals."
          : "Weak previous sale match requires manual approval.",
    matchType: type,
    autoApply,
    matchingSignals,
    rejectedSignals,
    scoreBreakdown
  };
}

export function findBestUserVerifiedSaleMatch(sales: unknown, product: ProductContext = {}) {
  const list = Array.isArray(sales) ? (sales as UserVerifiedSale[]) : [];
  return list
    .filter((sale) => sale?.status === "USER_VERIFIED_SALE")
    .map((sale) => scoreUserVerifiedSaleMatch(sale, product))
    .sort((a, b) => b.matchScore - a.matchScore || b.sale.soldDate.localeCompare(a.sale.soldDate))[0] || null;
}
