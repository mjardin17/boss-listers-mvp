import type { UserVerifiedCorrection } from "./correctionTypes";

function normalizeUpc(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeTitle(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GENERIC_TOKENS = new Set([
  "unknown",
  "item",
  "product",
  "scanned",
  "barcode",
  "manual",
  "review",
  "walmart",
  "target",
  "dollar",
  "tree"
]);

function normalizeTokenList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.join(" ") : String(value || "");
  return normalizeTitle(raw)
    .split(" ")
    .filter((token) => token.length > 2 && !GENERIC_TOKENS.has(token))
    .slice(0, 24);
}

function compactKey(prefix: string, value: unknown) {
  const normalized = normalizeTitle(value);
  return normalized ? `${prefix}:${normalized}` : "";
}

export function buildScanMatchingKeys(product: {
  upc?: unknown;
  title?: unknown;
  brand?: unknown;
  category?: unknown;
  ocrText?: unknown;
  visualAnchors?: unknown;
  packagingHints?: unknown;
} = {}) {
  const upc = normalizeUpc(product.upc);
  const titleTokens = normalizeTokenList(product.title);
  const brandTokens = normalizeTokenList(product.brand);
  const categoryTokens = normalizeTokenList(product.category);
  const ocrTokens = normalizeTokenList(product.ocrText);
  const visualTokens = normalizeTokenList(product.visualAnchors);
  const packagingTokens = normalizeTokenList(product.packagingHints);
  const titleFingerprint = titleTokens.slice(0, 10).join(" ");
  const ocrFingerprint = Array.from(new Set([...ocrTokens, ...visualTokens, ...packagingTokens])).slice(0, 14).join(" ");
  const brandTitle = [...brandTokens, ...titleTokens].slice(0, 12).join(" ");
  const brandCategory = [...brandTokens, ...categoryTokens].slice(0, 8).join(" ");
  const matchingKeys = Array.from(
    new Set(
      [
        upc ? `upc:${upc}` : "",
        compactKey("title", titleFingerprint),
        compactKey("brand_title", brandTitle),
        compactKey("ocr", ocrFingerprint),
        compactKey("brand_category", brandCategory)
      ].filter(Boolean)
    )
  );

  return {
    upc,
    titleFingerprint,
    ocrFingerprint,
    scanFingerprint: matchingKeys[0] || compactKey("scan", `${titleFingerprint} ${ocrFingerprint}`),
    matchingKeys
  };
}

function keyMatchScore(scanKeys: string[] = [], savedKeys: string[] = []) {
  const saved = new Set(savedKeys.filter((key) => !key.startsWith("brand_category:")));
  const matched = scanKeys.filter((key) => saved.has(key) && !key.startsWith("brand_category:"));
  if (!matched.length) return 0;
  if (matched.some((key) => key.startsWith("upc:"))) return 100;
  if (matched.some((key) => key.startsWith("title:") || key.startsWith("brand_title:"))) return 86;
  if (matched.some((key) => key.startsWith("ocr:"))) return 78;
  return 0;
}

export function findMatchingUserCorrection(
  corrections: unknown,
  product: { upc?: string; title?: string; brand?: string; category?: string; ocrText?: unknown; visualAnchors?: unknown; packagingHints?: unknown; matchingKeys?: string[] } = {}
): UserVerifiedCorrection | null {
  const list = Array.isArray(corrections) ? corrections : [];
  const upc = normalizeUpc(product.upc);
  const title = normalizeTitle(product.title);
  const brand = normalizeTitle(product.brand);
  const userVerified = list.filter((item) => item?.status === "USER_VERIFIED");
  const scanKeys = product.matchingKeys?.length ? product.matchingKeys : buildScanMatchingKeys(product).matchingKeys;

  const keyed = userVerified
    .map((item) => ({ item, score: keyMatchScore(scanKeys, item.matchingKeys || buildScanMatchingKeys({
      upc: item.upc,
      title: item.productTitle,
      brand: item.brand,
      category: item.rawAiSnapshot?.condition
    }).matchingKeys) }))
    .filter((entry) => entry.score >= 78)
    .sort((a, b) => b.score - a.score);
  if (keyed[0]) return keyed[0].item as UserVerifiedCorrection;

  if (upc) {
    const exactUpc = userVerified.find((item) => normalizeUpc(item.upc) === upc);
    if (exactUpc) return exactUpc as UserVerifiedCorrection;
  }

  if (title) {
    const exactTitle = userVerified.find((item) => normalizeTitle(item.productTitle) === title);
    if (exactTitle) return exactTitle as UserVerifiedCorrection;
  }

  if (title && brand) {
    const tokens = new Set(title.split(" ").filter((token) => token.length > 2));
    const fuzzy = userVerified.find((item) => {
      const correctedTitle = normalizeTitle(item.productTitle);
      const correctedBrand = normalizeTitle(item.brand);
      const overlap = correctedTitle.split(" ").filter((token) => tokens.has(token)).length;
      return correctedBrand === brand && overlap >= Math.min(3, tokens.size);
    });
    if (fuzzy) return fuzzy as UserVerifiedCorrection;
  }

  return null;
}

export function mergeUserCorrectionIntoProduct<T extends Record<string, any>>(
  product: T,
  correction: UserVerifiedCorrection | null
): T {
  if (!correction) return product;
  return {
    ...product,
    brand: correction.brand || product.brand,
    model: correction.productTitle || product.model,
    categoryHint: product.categoryHint,
    upc: correction.upc || product.upc,
    condition: correction.condition || product.condition,
    sourceStore: correction.sourceStore || product.sourceStore,
    resolvedCostBasis: correction.costPaid ?? product.resolvedCostBasis,
    costBasis: correction.costPaid ?? product.costBasis,
    costOfGoods: correction.costPaid ?? product.costOfGoods,
    userVerifiedCorrection: correction
  };
}
