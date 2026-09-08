const EBAY_BROWSE_BASE = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const EXTERNAL_FETCH_TIMEOUT_MS = 10000;
const TITLE_FILLER_TERMS = new Set([
  "new",
  "wow",
  "l@@k",
  "look",
  "rare",
  "htf",
  "fast",
  "ship",
  "free",
  "shipping",
  "read",
  "description",
  "the",
  "and",
  "with",
  "for",
  "of",
  "sale",
  "clearance",
  "rollback",
  "trending",
  "official",
  "authentic",
  "genuine",
  "sealed"
]);
const WEAK_QUERY_TOKENS = new Set([
  "item",
  "product",
  "unknown",
  "barcode",
  "scan",
  "scanned",
  "label",
  "front",
  "back",
  "side",
  "upc",
  "ean",
  "sku"
]);
const HARD_NEGATIVE_PATTERNS = [
  /\bcompatible\b/i,
  /\bfits\b/i,
  /\breplacement\b/i,
  /\bcustom\b/i,
  /\bfor parts\b/i,
  /\bempty box\b/i,
  /\bcase only\b/i,
  /\baccessor(?:y|ies) only\b/i,
  /\bcharging cable\b/i,
  /\bstand only\b/i,
  /\bbox only\b/i,
  /\bmanual only\b/i,
  /\bdisc only\b/i,
  /\bdigital code\b/i,
  /\brepro\b/i,
  /\breproduction\b/i,
  /\blot of\b/i,
  /\bbundle\b/i,
  /\brepair\b/i,
  /\bdamaged\b/i
];
const OCR_CONFLICT_PATTERNS = [
  /\bbundle\b/i,
  /\blot\b/i,
  /\breplacement\b/i,
  /\baccessor(?:y|ies)\b/i,
  /\bempty\b/i,
  /\bdisplay\b/i,
  /\bcase\b/i,
  /\bparts?\b/i,
  /\bslabbed\b/i,
  /\bgraded\b/i
];
const PLATFORM_TOKENS = [
  "ps4",
  "ps5",
  "xbox one",
  "xbox series x",
  "xbox series s",
  "nintendo switch",
  "switch oled"
];
const COLOR_TOKENS = ["black", "white", "red", "blue", "green", "yellow", "pink", "purple", "orange", "gray", "grey", "silver", "gold"];
const EDITION_TOKENS = ["standard", "deluxe", "collector", "collectors", "limited", "ultimate", "anniversary"];
const TRANSFORMERS_CLASS_TOKENS = ["core", "deluxe", "voyager", "leader", "commander", "titan"];
const TRANSFORMERS_GENERATION_TOKENS = ["legacy", "studio series", "earthrise", "kingdom", "siege", "age primes", "age of primes"];
const POKEMON_FORMAT_TOKENS = ["booster pack", "booster box", "elite trainer box", "etb", "slab", "graded", "raw", "single card", "tin"];
const HIGH_PRIORITY_TOKEN_PATTERNS = [
  /\b\d{8,14}\b/,
  /\b(transformers|pokemon|pok[eé]mon|hot wheels|funko|lego|marvel|star wars)\b/i,
  /\b(sideways|optimus|bumblebee|pikachu|charizard|squirtle|bulbasaur)\b/i,
  /\b(\d+)\s*(pack|pk|ct|count|oz|fl oz|ml|lb|g)\b/i,
  /\b(deluxe|collector|limited|anniversary|exclusive|variant|edition|wave)\b/i,
  /\b(chocolate|vanilla|strawberry|mint|coconut|berry|lemon|orange|blueberry|watermelon)\b/i
];

async function fetchWithTimeout(fetchImpl, url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EXTERNAL_FETCH_TIMEOUT_MS);
  try {
    return await fetchImpl(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)));
  return sorted[index];
}

function summarizePriceRange(values = []) {
  const prices = values.map(Number).filter((value) => Number.isFinite(value) && value > 0);
  if (!prices.length) return null;
  return {
    low: percentile(prices, 0.2),
    midpoint: percentile(prices, 0.5),
    high: percentile(prices, 0.8),
    sampleSize: prices.length
  };
}

function normalizeMarketplaceTitle(title = "") {
  return String(title || "")
    .toLowerCase()
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\b([a-z0-9]{2,})\s+\1\b/gi, "$1")
    .replace(/l@@k/g, " l@@k ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((token) => token && !TITLE_FILLER_TERMS.has(token));
}

function tokenWeight(token = "") {
  const normalized = String(token || "").toLowerCase();
  if (!normalized) return 0;
  if (/^\d{8,14}$/.test(normalized)) return 10;
  if (HIGH_PRIORITY_TOKEN_PATTERNS.some((pattern) => pattern.test(normalized))) return 8;
  if (/^\d+(?:oz|ml|lb|g|ct|pack|pk)$/.test(normalized)) return 7;
  if (TITLE_FILLER_TERMS.has(normalized) || WEAK_QUERY_TOKENS.has(normalized)) return 1;
  return normalized.length >= 5 ? 5 : 3;
}

function weightedTokenReport(values = []) {
  return normalizeQueryTokens(values)
    .map((token) => ({ token, weight: tokenWeight(token) }))
    .sort((a, b) => b.weight - a.weight || a.token.localeCompare(b.token));
}

function weightedOverlapScore(sourceTokens = [], compTokens = []) {
  const comp = new Set(compTokens);
  const weighted = sourceTokens.map((token) => ({ token, weight: tokenWeight(token) }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (!total) return 0;
  const matched = weighted.filter((item) => comp.has(item.token)).reduce((sum, item) => sum + item.weight, 0);
  return matched / total;
}

function normalizeQueryTokens(values = []) {
  const tokens = normalizeMarketplaceTitle(values.filter(Boolean).join(" "))
    .filter((token) => {
      if (WEAK_QUERY_TOKENS.has(token)) return false;
      if (/^\d{4,7}$/.test(token)) return false;
      if (/^\d{15,}$/.test(token)) return false;
      if (/^[a-z]$/.test(token)) return false;
      return token.length > 1;
    });
  return Array.from(new Set(tokens)).slice(0, 10);
}

function buildGeneratedSearchQueries(input = {}) {
  const analysis = input.analysisResult || {};
  const upc = String(input.upc || input.barcode || analysis.upc || "").replace(/\D/g, "");
  const brand = input.brand || analysis.brand || "";
  const title = input.suggestedTitle || input.model || input.itemTitle || analysis.itemTitle || "";
  const category = input.categoryHint || analysis.category || "";
  const variantTokens = [
    analysis.variant,
    analysis.edition,
    analysis.productLine,
    analysis.itemNumber,
    analysis.quantity,
    ...(analysis.visualAnchors || []),
    ...(analysis.packagingHints || []),
    ...(analysis.keyDetails || []),
    ...(analysis.ocrText || [])
  ];
  const correctionQueries = (Array.isArray(input.manualCorrectionHistory) ? input.manualCorrectionHistory : [])
    .map((item) => item?.trustedQueryPattern || item?.candidate?.title || "")
    .filter(Boolean);
  const weightedTokens = weightedTokenReport([brand, title, ...variantTokens]);
  const brandCharacterTokens = weightedTokenReport([brand, analysis.productLine, analysis.variant, ...(analysis.visualAnchors || [])])
    .map((item) => item.token)
    .slice(0, 6);
  const brandFlavorTokens = weightedTokenReport([brand, ...(analysis.visualAnchors || []), ...(analysis.ocrText || [])])
    .map((item) => item.token)
    .filter((token) => /chocolate|vanilla|strawberry|mint|berry|lemon|orange|blueberry|watermelon|coconut/.test(token))
    .slice(0, 4);
  const brandSizeTokens = weightedTokenReport([brand, analysis.quantity, ...(analysis.ocrText || [])])
    .map((item) => item.token)
    .filter((token) => /\d|oz|ml|lb|ct|pack|count/.test(token))
    .slice(0, 5);
  const coreTokens = weightedTokens.map((item) => item.token);
  const categoryTokens = weightedTokenReport([brand, category, ...variantTokens]).map((item) => item.token).slice(0, 6);
  const queries = [
    upc && upc.length >= 8 ? upc : "",
    ...correctionQueries.slice(0, 2),
    brandCharacterTokens.length >= 2 ? brandCharacterTokens.join(" ") : "",
    brandFlavorTokens.length ? normalizeQueryTokens([brand, ...brandFlavorTokens]).join(" ") : "",
    brandSizeTokens.length ? normalizeQueryTokens([brand, ...brandSizeTokens]).join(" ") : "",
    normalizeQueryTokens([brand, title, analysis.variant, analysis.edition, analysis.itemNumber]).join(" "),
    coreTokens.join(" "),
    categoryTokens.join(" ")
  ].filter((query) => query && query.length >= 3);
  return Array.from(new Set(queries)).slice(0, 4);
}

function buildQueryTelemetry(input = {}) {
  const queries = buildGeneratedSearchQueries(input);
  return queries.map((query) => {
    const tokens = normalizeQueryTokens([query]);
    const score = tokens.reduce((sum, token) => sum + tokenWeight(token), /^\d{8,14}$/.test(query) ? 15 : 0);
    return {
      query,
      score,
      type: /^\d{8,14}$/.test(query)
        ? "upc"
        : tokens.length <= 4
          ? "exact"
          : tokens.length <= 7
            ? "relaxed"
            : "token_subset",
      tokens
    };
  });
}

function textFromTokens(tokens = []) {
  return tokens.join(" ");
}

function extractUpc(value = "") {
  const match = String(value || "").replace(/\D/g, " ").match(/\b\d{8,14}\b/);
  return match ? match[0] : "";
}

function overlapScore(sourceTokens = [], compTokens = []) {
  const source = new Set(sourceTokens);
  const comp = new Set(compTokens);
  const core = [...source].filter((token) => token.length > 1);
  if (!core.length) return 0;
  const matched = core.filter((token) => comp.has(token));
  return matched.length / core.length;
}

function titleSimilarityScore(sourceTitle = "", compTitle = "") {
  const source = normalizeMarketplaceTitle(sourceTitle).join(" ");
  const comp = normalizeMarketplaceTitle(compTitle).join(" ");
  if (!source || !comp) return 0;
  if (source === comp) return 1;
  const sourceBigrams = new Set(source.split("").map((_, index) => source.slice(index, index + 2)).filter((item) => item.length === 2));
  const compBigrams = new Set(comp.split("").map((_, index) => comp.slice(index, index + 2)).filter((item) => item.length === 2));
  const intersection = [...sourceBigrams].filter((item) => compBigrams.has(item)).length;
  const union = new Set([...sourceBigrams, ...compBigrams]).size;
  return union ? intersection / union : 0;
}

function extractPackCounts(text = "") {
  const counts = new Set();
  const normalized = String(text || "").toLowerCase();
  if (/\bsingle\b/.test(normalized)) counts.add(1);
  for (const match of normalized.matchAll(/\b(\d+)\s*(pack|pk|pc|pcs|piece|pieces|count|ct)\b/g)) {
    counts.add(Number(match[1]));
  }
  return counts;
}

function extractPatternSet(text = "", pattern) {
  const values = new Set();
  for (const match of String(text || "").toLowerCase().matchAll(pattern)) {
    values.add(match[1] || match[0]);
  }
  return values;
}

function extractKnownTerms(text = "", terms = []) {
  const normalized = ` ${String(text || "").toLowerCase()} `;
  return new Set(terms.filter((term) => normalized.includes(` ${term} `)));
}

function mismatchedSets(sourceSet, compSet) {
  if (!sourceSet.size || !compSet.size) return false;
  return ![...sourceSet].some((value) => compSet.has(value));
}

function variantMismatch(sourceTitle = "", compTitle = "") {
  return (
    mismatchedSets(extractPackCounts(sourceTitle), extractPackCounts(compTitle)) ||
    mismatchedSets(extractPatternSet(sourceTitle, /\b((?:19|20)\d{2})\b/g), extractPatternSet(compTitle, /\b((?:19|20)\d{2})\b/g)) ||
    mismatchedSets(extractPatternSet(sourceTitle, /\b(?:vol|volume)\s*(\d+)\b/g), extractPatternSet(compTitle, /\b(?:vol|volume)\s*(\d+)\b/g)) ||
    mismatchedSets(extractKnownTerms(sourceTitle, PLATFORM_TOKENS), extractKnownTerms(compTitle, PLATFORM_TOKENS)) ||
    mismatchedSets(extractKnownTerms(sourceTitle, COLOR_TOKENS), extractKnownTerms(compTitle, COLOR_TOKENS)) ||
    mismatchedSets(extractKnownTerms(sourceTitle, EDITION_TOKENS), extractKnownTerms(compTitle, EDITION_TOKENS))
  );
}

function collectorMismatch(sourceTitle = "", compTitle = "") {
  const source = ` ${sourceTitle.toLowerCase()} `;
  const comp = ` ${compTitle.toLowerCase()} `;
  const transformers = /transformers|hasbro|autobot|decepticon/.test(source);
  const pokemon = /pokemon|pok[eé]mon|pikachu|charizard|booster|trainer box|card/.test(source);
  if (transformers) {
    return (
      mismatchedSets(extractKnownTerms(source, TRANSFORMERS_CLASS_TOKENS), extractKnownTerms(comp, TRANSFORMERS_CLASS_TOKENS)) ||
      mismatchedSets(extractKnownTerms(source, TRANSFORMERS_GENERATION_TOKENS), extractKnownTerms(comp, TRANSFORMERS_GENERATION_TOKENS))
    );
  }
  if (pokemon) {
    return mismatchedSets(extractKnownTerms(source, POKEMON_FORMAT_TOKENS), extractKnownTerms(comp, POKEMON_FORMAT_TOKENS));
  }
  return false;
}

function hardNegativeReason(title = "") {
  const match = HARD_NEGATIVE_PATTERNS.find((pattern) => pattern.test(title));
  return match ? String(match).replace(/^\/\\b?|\\b\/i$/g, "").replace(/\\/g, "") : "";
}

function normalizeComparableText(value = "") {
  return ` ${String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
}

function brandMismatch(item = {}, source = {}) {
  const sourceBrand = String(source.brand || "").trim().toLowerCase();
  if (!sourceBrand || sourceBrand.length < 2) return false;
  const compBrand = String(item.brand || item.manufacturer || "").trim().toLowerCase();
  if (compBrand && compBrand !== sourceBrand) return true;
  return !normalizeComparableText(item.title || item.itemTitle || item.name).includes(` ${sourceBrand} `);
}

function categoryMismatch(item = {}, source = {}) {
  const sourceCategory = String(source.category || "").trim().toLowerCase();
  const compCategory = String(item.category || item.categoryName || "").trim().toLowerCase();
  if (!sourceCategory || !compCategory) return false;
  const sourceRoot = sourceCategory.split(/[>/|,-]/)[0]?.trim();
  const compRoot = compCategory.split(/[>/|,-]/)[0]?.trim();
  return Boolean(sourceRoot && compRoot && sourceRoot !== compRoot);
}

function validateCompTitleMatch(item = {}, source = {}) {
  const compTitle = item.title || item.itemTitle || item.name || "";
  const sourceTitle = source.title || source.query || "";
  const sourceTokens = normalizeMarketplaceTitle(sourceTitle);
  const compTokens = normalizeMarketplaceTitle(compTitle);
  const compText = textFromTokens(compTokens);
  const sourceText = textFromTokens(sourceTokens);
  const visualTokens = normalizeMarketplaceTitle([...(source.visualAnchors || []), ...(source.packagingHints || [])].join(" "));
  const exactUpc = Boolean(source.upc && (String(item.upc || item.gtin || item.epid || "") === String(source.upc) || extractUpc(compTitle) === String(source.upc)));
  const modelTokens = normalizeMarketplaceTitle(source.model || "");
  const exactModel = Boolean(modelTokens.length && compText.includes(textFromTokens(modelTokens)));
  const tokenOverlap = overlapScore(sourceTokens, compTokens);
  const weightedOverlap = weightedOverlapScore(sourceTokens, compTokens);
  const titleSimilarity = titleSimilarityScore(sourceTitle, compTitle);
  const upcTrustScore = exactUpc ? 1 : source.upc ? 0 : 0.25;
  const categoryAlignmentScore = categoryMismatch(item, source) ? 0 : source.category && (item.category || item.categoryName) ? 1 : 0.5;
  const visualAnchorOverlap = visualTokens.length ? overlapScore(visualTokens, compTokens) : 0;
  const visualReconciliation =
    exactUpc || (visualAnchorOverlap >= 0.55 && weightedOverlap >= 0.45 && !categoryMismatch(item, source));

  if (!compTitle || !sourceTokens.length) return { accepted: false, reason: "missing_title", overlap: 0 };
  const poisonedKeyword = hardNegativeReason(compTitle);
  if (poisonedKeyword) {
    return { accepted: false, reason: "hard_negative", overlap: 0, poisonedKeyword };
  }
  if (variantMismatch(sourceText, compText)) {
    return { accepted: false, reason: "variant_mismatch", overlap: 0, multipackMismatch: mismatchedSets(extractPackCounts(sourceText), extractPackCounts(compText)) };
  }
  if (collectorMismatch(sourceText, compText)) {
    return { accepted: false, reason: "collector_variant_mismatch", overlap: 0, failedToken: "collector_variant" };
  }
  if (brandMismatch(item, source)) {
    return { accepted: false, reason: "brand_mismatch", overlap: 0, failedToken: source.brand || "" };
  }
  if (categoryMismatch(item, source)) {
    return { accepted: false, reason: "category_mismatch", overlap: 0, failedToken: source.category || "" };
  }

  if (tokenOverlap >= 0.6 || weightedOverlap >= 0.68 || exactUpc || exactModel || visualReconciliation) {
    const rejectionRiskScore = Math.max(0, Number((1 - Math.max(tokenOverlap, weightedOverlap, titleSimilarity, upcTrustScore)).toFixed(2)));
    return {
      accepted: true,
      reason: exactUpc ? "upc_match" : exactModel ? "model_match" : visualReconciliation ? "visual_anchor_reconciliation" : "token_overlap",
      overlap: tokenOverlap,
      weightedOverlap,
      titleSimilarity,
      visualAnchorOverlap,
      upcTrustScore,
      categoryAlignmentScore,
      rejectionRiskScore
    };
  }
  const failedToken = sourceTokens.find((token) => token.length > 2 && !compTokens.includes(token)) || "";
  return { accepted: false, reason: "weak_overlap", overlap: tokenOverlap, weightedOverlap, titleSimilarity, failedToken };
}

function normalizeSoldItem(item = {}, provider = "sold-comps", source = {}) {
  const price = Number(item.price?.value ?? item.price ?? item.salePrice);
  const dateSold = item.dateSold || item.soldAt || item.endTime || item.completedAt || "";
  const status = String(item.status || item.itemStatus || item.listingStatus || "").toLowerCase();
  const isSold = item.isSold === true || status === "completed";
  const titleMatch = validateCompTitleMatch(item, source);
  const soldDate = new Date(dateSold);
  const ageDays = Number.isNaN(soldDate.getTime()) ? Infinity : (Date.now() - soldDate.getTime()) / 86400000;
  if (!isSold || !Number.isFinite(price) || price <= 0 || !dateSold || ageDays > 365) return null;
  if (!titleMatch.accepted) return null;
  return {
    sourcePlatform: item.sourcePlatform || item.platform || provider,
    title: String(item.title || item.itemTitle || item.name || "").trim(),
    upc: item.upc || item.gtin || "",
    price: Number(price.toFixed(2)),
    dateSold: String(dateSold),
    isSold: true,
    status: "completed",
    titleMatchConfidence: Number(Math.max(titleMatch.overlap || 0, titleMatch.weightedOverlap || 0).toFixed(2)),
    titleSimilarityScore: Number((titleMatch.titleSimilarity || 0).toFixed(2)),
    visualAnchorOverlapScore: Number((titleMatch.visualAnchorOverlap || 0).toFixed(2)),
    tokenOverlapScore: Number((titleMatch.weightedOverlap || titleMatch.overlap || 0).toFixed(2)),
    upcTrustScore: Number((titleMatch.upcTrustScore || 0).toFixed(2)),
    categoryAlignmentScore: Number((titleMatch.categoryAlignmentScore || 0).toFixed(2)),
    rejectionRiskScore: Number((titleMatch.rejectionRiskScore || 0).toFixed(2)),
    acceptedReason: titleMatch.reason || "token_overlap"
  };
}

function rejectionReasonForSoldItem(item = {}, source = {}) {
  const price = Number(item.price?.value ?? item.price ?? item.salePrice);
  const dateSold = item.dateSold || item.soldAt || item.endTime || item.completedAt || "";
  const status = String(item.status || item.itemStatus || item.listingStatus || "").toLowerCase();
  const isSold = item.isSold === true || status === "completed";
  const soldDate = new Date(dateSold);
  const ageDays = Number.isNaN(soldDate.getTime()) ? Infinity : (Date.now() - soldDate.getTime()) / 86400000;
  if (!isSold) return "not_sold";
  if (!Number.isFinite(price) || price <= 0) return "invalid_price";
  if (!dateSold || ageDays === Infinity) return "invalid_sold_date";
  if (ageDays > 365) return "stale_sold_date";
  return validateCompTitleMatch(item, source).reason || "title_mismatch";
}

function rejectionDetailForSoldItem(item = {}, source = {}) {
  const dateSold = item.dateSold || item.soldAt || item.endTime || item.completedAt || "";
  const soldDate = new Date(dateSold);
  const staleAge =
    Number.isNaN(soldDate.getTime()) ? null : Math.max(0, Math.floor((Date.now() - soldDate.getTime()) / 86400000));
  const titleMatch = validateCompTitleMatch(item, source);
  const itemUpc = String(item.upc || item.gtin || item.epid || "").replace(/\D/g, "");
  const sourceUpc = String(source.upc || "").replace(/\D/g, "");
  return {
    title: String(item.title || item.itemTitle || item.name || "").trim(),
    reason: rejectionReasonForSoldItem(item, source),
    failedToken: titleMatch.failedToken || "",
    failedUpc: sourceUpc && itemUpc && sourceUpc !== itemUpc ? itemUpc : "",
    staleAge,
    multipackMismatch: Boolean(titleMatch.multipackMismatch),
    poisonedKeyword: titleMatch.poisonedKeyword || ""
  };
}

function normalizeSoldItems(items = [], provider, source = {}) {
  const accepted = [];
  const seen = new Set();
  let rejectedCompCount = 0;
  const rejectionReasons = {};
  const rejectionDetails = [];
  for (const item of items || []) {
    const normalized = normalizeSoldItem(item, provider, source);
    if (normalized) {
      const key = `${normalized.title.toLowerCase()}|${normalized.price}|${normalized.dateSold}`;
      if (seen.has(key)) {
        rejectedCompCount += 1;
        rejectionReasons.duplicate_comp = (rejectionReasons.duplicate_comp || 0) + 1;
      } else {
        seen.add(key);
        accepted.push(normalized);
      }
    } else {
      rejectedCompCount += 1;
      const reason = rejectionReasonForSoldItem(item, source);
      rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
      if (rejectionDetails.length < 10) rejectionDetails.push(rejectionDetailForSoldItem(item, source));
    }
  }
  const acceptedCompCount = accepted.length;
  const total = acceptedCompCount + rejectedCompCount;
  const semanticRejectionRate = total ? Number((rejectedCompCount / total).toFixed(2)) : 0;
  const titleMatchConfidence = acceptedCompCount
    ? Number((accepted.reduce((sum, item) => sum + (Number(item.titleMatchConfidence) || 0), 0) / acceptedCompCount).toFixed(2))
    : 0;
  return {
    items: accepted.slice(0, 12),
    metrics: {
      acceptedCompCount,
      rejectedCompCount,
      semanticRejectionRate,
      titleMatchConfidence,
      rejectionReasons,
      rejectionDetails
    }
  };
}

function buildQuery(input = {}) {
  return buildGeneratedSearchQueries(input)[0] || [input.brand, input.model || input.itemTitle, input.categoryHint]
    .filter(Boolean)
    .join(" ")
    .trim();
}

async function fetchEbayActiveListings({ query, fetchImpl = fetch }) {
  const token = process.env.EBAY_ACCESS_TOKEN;
  if (!token || !query) return null;
  const url = new URL(EBAY_BROWSE_BASE);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "50");
  url.searchParams.set("fieldgroups", "MATCHING_ITEMS");
  const response = await fetchWithTimeout(fetchImpl, url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": process.env.EBAY_MARKETPLACE_ID || "EBAY_US"
    }
  });
  if (!response.ok) throw new Error(`eBay active comps request failed (${response.status})`);
  const data = await response.json();
  const summaries = data.itemSummaries || [];
  return {
    provider: "ebay-browse",
    count: Number(data.total) || summaries.length,
    range: summarizePriceRange(
      summaries.map((item) => Number(item.price?.value || item.currentBidPrice?.value))
    )
  };
}

function normalizeSoldCompsResponseItems(data = {}) {
  return (
    data.items ||
    data.results ||
    data.soldItems ||
    data.completedItems ||
    data.itemSummaries ||
    data.data?.items ||
    data.data?.results ||
    []
  );
}

async function fetchSoldComps({ query, source, fetchImpl = fetch, stage = "title_similarity_lookup" }) {
  const endpoint = process.env.EBAY_SOLD_COMPS_ENDPOINT || process.env.SOLD_COMPS_ENDPOINT;
  const token = process.env.EBAY_SOLD_COMPS_TOKEN || process.env.SOLD_COMPS_TOKEN;
  if (!endpoint || !query) return null;
  const url = new URL(endpoint);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "20");
  url.searchParams.set("marketplace", process.env.EBAY_MARKETPLACE_ID || "EBAY_US");
  const response = await fetchWithTimeout(fetchImpl, url, {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
          "X-EBAY-C-MARKETPLACE-ID": process.env.EBAY_MARKETPLACE_ID || "EBAY_US"
        }
      : {
          "X-EBAY-C-MARKETPLACE-ID": process.env.EBAY_MARKETPLACE_ID || "EBAY_US"
        }
  });
  if (!response.ok) throw new Error(`sold comps request failed (${response.status})`);
  const data = await response.json();
  const normalized = normalizeSoldItems(
    normalizeSoldCompsResponseItems(data),
    data.provider || "ebay-sold-api",
    source
  );
  const prices = normalized.items.map((item) => item.price);
  return {
    provider: data.provider || "ebay-sold-api",
    query,
    stage,
    count: prices.length,
    range: summarizePriceRange(prices),
    soldWithinDays: Number(data.soldWithinDays) || null,
    items: normalized.items.slice(0, 20),
    titleMatchMetrics: normalized.metrics
  };
}

async function fetchProviderComps({ endpoint, token, query, source, provider, fetchImpl = fetch, stage = "token_intersection_lookup" }) {
  if (!endpoint || !query) return null;
  const url = new URL(endpoint);
  url.searchParams.set("q", query);
  const response = await fetchWithTimeout(fetchImpl, url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
  if (!response.ok) throw new Error(`${provider} comps request failed (${response.status})`);
  const data = await response.json();
  const normalized = normalizeSoldItems(data.items, provider, source);
  const prices = normalized.items.map((item) => item.price);
  return {
    provider,
    query,
    stage,
    count: prices.length,
    range: summarizePriceRange(prices),
    soldWithinDays: Number(data.soldWithinDays) || null,
    activeCount: Number(data.activeCount) || null,
    items: normalized.items,
    titleMatchMetrics: normalized.metrics
  };
}

function combineTitleMatchMetrics(sources = []) {
  const metrics = sources.map((source) => source?.titleMatchMetrics).filter(Boolean);
  const acceptedCompCount = metrics.reduce((sum, item) => sum + (Number(item.acceptedCompCount) || 0), 0);
  const rejectedCompCount = metrics.reduce((sum, item) => sum + (Number(item.rejectedCompCount) || 0), 0);
  const total = acceptedCompCount + rejectedCompCount;
  return {
    acceptedCompCount,
    rejectedCompCount,
    semanticRejectionRate: total ? Number((rejectedCompCount / total).toFixed(2)) : 0,
    titleMatchConfidence: acceptedCompCount
      ? Number(
          (
            metrics.reduce(
              (sum, item) =>
                sum + (Number(item.titleMatchConfidence) || 0) * (Number(item.acceptedCompCount) || 0),
              0
            ) / acceptedCompCount
          ).toFixed(2)
        )
      : 0
  };
}

function combineQueryMetrics(sources = []) {
  return sources
    .map((source) => ({
      provider: source?.provider || "",
      stage: source?.stage || "",
      query: source?.query || "",
      acceptedCount: Number(source?.titleMatchMetrics?.acceptedCompCount) || 0,
      rejectedCount: Number(source?.titleMatchMetrics?.rejectedCompCount) || 0
    }))
    .filter((item) => item.query || item.stage || item.provider);
}

function aggregateAcceptedCompScoring(items = []) {
  if (!items.length) {
    return {
      titleSimilarityScore: 0,
      tokenOverlapScore: 0,
      visualAnchorOverlapScore: 0,
      upcTrustScore: 0,
      categoryAlignmentScore: 0,
      rejectionRiskScore: 1
    };
  }
  const average = (key) =>
    Number((items.reduce((sum, item) => sum + (Number(item[key]) || 0), 0) / items.length).toFixed(2));
  return {
    titleSimilarityScore: average("titleSimilarityScore"),
    tokenOverlapScore: average("tokenOverlapScore"),
    visualAnchorOverlapScore: average("visualAnchorOverlapScore"),
    upcTrustScore: average("upcTrustScore"),
    categoryAlignmentScore: average("categoryAlignmentScore"),
    rejectionRiskScore: average("rejectionRiskScore")
  };
}

function extractVisualConflictIndicators(source = {}) {
  const text = [
    source.title,
    source.model,
    source.category,
    ...(source.visualAnchors || []),
    ...(source.packagingHints || []),
    ...(source.ocrText || [])
  ].filter(Boolean).join(" ");
  return OCR_CONFLICT_PATTERNS
    .filter((pattern) => pattern.test(text))
    .map((pattern) => String(pattern).replace(/^\/\\b?|\\b\/i$/g, "").replace(/\\/g, ""));
}

function visualConfidenceStage({ acceptedCompScoring = {}, identityConfidence = {}, conflictIndicators = [], soldCount = 0 } = {}) {
  const score = Number(identityConfidence.score) || 0;
  const upc = Boolean(identityConfidence.upcMatched);
  const token = Number(acceptedCompScoring.tokenOverlapScore) || 0;
  const visual = Number(acceptedCompScoring.visualAnchorOverlapScore) || 0;
  const title = Number(acceptedCompScoring.titleSimilarityScore) || 0;
  if (soldCount <= 0 || conflictIndicators.length) return "LOW_CONFIDENCE_UNKNOWN";
  if (upc && score >= 80 && token >= 0.75) return "EXACT_VISUAL_MATCH";
  if ((upc || visual >= 0.65) && score >= 60 && token >= 0.6) return "STRONG_VISUAL_MATCH";
  if (visual >= 0.45 || (score >= 45 && title >= 0.35)) return "PARTIAL_VISUAL_MATCH";
  if (score >= 25 || token >= 0.3) return "OCR_ONLY_MATCH";
  return "LOW_CONFIDENCE_UNKNOWN";
}

function combineRejectionDetails(sources = []) {
  return sources
    .flatMap((source) => source?.titleMatchMetrics?.rejectionDetails || [])
    .slice(0, 10);
}

function buildIdentityConfidence({ source = {}, acceptedItems = [], titleMetrics = {} } = {}) {
  const sourceTokens = normalizeMarketplaceTitle(
    [source.title, source.model, source.brand, source.category, ...(source.packagingHints || [])]
      .filter(Boolean)
      .join(" ")
  ).filter((token) => token.length > 2);
  const compTokens = normalizeMarketplaceTitle(acceptedItems.map((item) => item.title).join(" "));
  const matchedKeywords = Array.from(new Set(sourceTokens.filter((token) => compTokens.includes(token))));
  const unresolvedTokens = Array.from(new Set(sourceTokens.filter((token) => !compTokens.includes(token)))).slice(0, 12);
  const rejectedKeywords = Array.from(
    new Set(
      combineRejectionDetails([source.sold, ...(source.external || [])])
        .map((detail) => detail.failedToken || detail.poisonedKeyword)
        .filter(Boolean)
    )
  );
  const upcMatched = Boolean(
    source.upc &&
      acceptedItems.some((item) => String(item.upc || "").replace(/\D/g, "") === String(source.upc).replace(/\D/g, ""))
  );
  const brandMatched = Boolean(source.brand && matchedKeywords.includes(String(source.brand).toLowerCase()));
  const titleOverlap = Number(titleMetrics.titleMatchConfidence) || 0;
  const score = Math.min(
    99,
    Math.round(
      (upcMatched ? 35 : 0) +
        (brandMatched ? 18 : 0) +
        Math.min(28, titleOverlap * 28) +
        Math.min(12, matchedKeywords.length * 2) +
        (source.packagingHints?.length ? 6 : 0)
    )
  );
  return {
    score,
    upcMatched,
    brandMatched,
    titleTokenSimilarity: Number(titleOverlap.toFixed(2)),
    marketplaceTitleOverlap: Number(titleOverlap.toFixed(2)),
    matchedKeywords,
    rejectedKeywords,
    unresolvedTokens
  };
}

function deriveCompsSignals({ active, sold, external = [] }) {
  const activeCount = Number(active?.count) || 0;
  const soldCount = Number(sold?.count) || 0;
  const titleMatch = combineTitleMatchMetrics([sold, ...external]);
  const sellThroughRatio = activeCount > 0 ? soldCount / activeCount : null;
  const saturation =
    activeCount >= 80 ? "high" : activeCount >= 30 ? "medium" : activeCount > 0 ? "low" : "unknown";
  const soldVelocity =
    sellThroughRatio == null
      ? "unknown"
      : sellThroughRatio >= 0.75
        ? "fast"
        : sellThroughRatio >= 0.35
          ? "steady"
          : "slow";
  const trendWeight =
    sold?.soldWithinDays && sold.soldWithinDays <= 30
      ? "recent-heavy"
      : sold?.soldWithinDays
        ? "mixed"
        : "unknown";
  return {
    activeListingCount: activeCount || null,
    soldCount: soldCount || null,
    sellThroughRatio: sellThroughRatio == null ? null : Number(sellThroughRatio.toFixed(2)),
    saturation,
    soldVelocity,
    trendWeight,
    ...titleMatch
  };
}

function buildTrustedCompSummary(comps = null, productContext = {}) {
  const acceptedItems = [
    ...(comps?.sold?.items || []),
    ...(comps?.external || []).flatMap((source) => source?.items || [])
  ];
  const prices = acceptedItems.map((item) => Number(item.price)).filter((price) => Number.isFinite(price) && price > 0);
  const averageSoldPrice = prices.length
    ? Number((prices.reduce((sum, price) => sum + price, 0) / prices.length).toFixed(2))
    : null;
  const titleMetrics = combineTitleMatchMetrics([comps?.sold, ...(comps?.external || [])]);
  const rejectionDetails = combineRejectionDetails([comps?.sold, ...(comps?.external || [])]);
  const rejectionReasons = [comps?.sold, ...(comps?.external || [])]
    .map((source) => source?.titleMatchMetrics?.rejectionReasons || {})
    .reduce((merged, reasons) => {
      for (const [reason, count] of Object.entries(reasons)) {
        merged[reason] = (merged[reason] || 0) + Number(count || 0);
      }
      return merged;
    }, {});
  const soldCount = prices.length;
  const now = Date.now();
  const soldCount90d = acceptedItems.filter((item) => {
    const date = new Date(item.dateSold);
    return !Number.isNaN(date.getTime()) && (now - date.getTime()) / 86400000 <= 90;
  }).length;
  const activeCount = Number(comps?.signals?.activeListingCount || comps?.active?.count || 0);
  const saturationRatio = soldCount > 0 ? Number((activeCount / soldCount).toFixed(2)) : 0;
  const sellThroughRatio =
    comps?.signals?.sellThroughRatio == null ? null : Number(comps.signals.sellThroughRatio);
  const sellThroughRate =
    sellThroughRatio == null ? null : Number(Math.max(0, Math.min(100, sellThroughRatio * 100)).toFixed(1));
  const velocityScore =
    soldCount <= 0
      ? "DEAD"
      : sellThroughRatio != null && sellThroughRatio >= 0.7
        ? "FAST"
        : sellThroughRatio != null && sellThroughRatio >= 0.35
          ? "HEALTHY"
          : soldCount >= 3
          ? "MODERATE"
            : "SLOW";
  const saturationRisk =
    soldCount <= 0 || saturationRatio >= 5 || activeCount >= 100
      ? "HIGH"
      : saturationRatio >= 3 || activeCount >= 50
        ? "MEDIUM"
        : "LOW";
  const velocityTier =
    velocityScore === "FAST" || velocityScore === "HEALTHY"
      ? "HIGH"
      : velocityScore === "MODERATE"
        ? "MODERATE"
        : velocityScore === "DEAD"
          ? "DEAD"
          : "LOW";
  const providerText = [
    comps?.sold?.provider,
    ...(comps?.external || []).map((source) => source?.provider)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const saturationFlags = {
    oversaturated: saturationRisk === "HIGH",
    floodedAmazonLiquidation:
      providerText.includes("amazon") && activeCount >= 50 && saturationRatio >= 3,
    weakSoldToActiveRatio: soldCount > 0 && saturationRatio >= 3,
    staleSoldComps:
      soldCount > 0 &&
      acceptedItems.every((item) => {
        const date = new Date(item.dateSold);
        return Number.isNaN(date.getTime()) || (Date.now() - date.getTime()) / 86400000 > 90;
      })
  };
  const identityConfidence = buildIdentityConfidence({
    source: {
      ...productContext,
      sold: comps?.sold,
      external: comps?.external || []
    },
    acceptedItems,
    titleMetrics
  });
  const acceptedCompScoring = aggregateAcceptedCompScoring(acceptedItems);
  const visualConflictIndicators = extractVisualConflictIndicators(productContext);
  const strongestTokens = weightedTokenReport([
    productContext.title,
    productContext.model,
    productContext.brand,
    productContext.category,
    ...(productContext.packagingHints || [])
  ]).slice(0, 8);
  const trustScore = Math.max(
    0,
    Math.min(
      99,
      Math.round(
        identityConfidence.score +
          (soldCount >= 3 ? 8 : 0) +
          (soldCount90d >= 3 ? 8 : 0) +
          Math.round(acceptedCompScoring.tokenOverlapScore * 8) +
          Math.round(acceptedCompScoring.visualAnchorOverlapScore * 8) +
          Math.round(acceptedCompScoring.categoryAlignmentScore * 5) -
          (titleMetrics.semanticRejectionRate >= 0.7 ? 20 : 0) -
          (visualConflictIndicators.length ? 18 : 0) -
          (acceptedCompScoring.titleSimilarityScore < 0.45 ? 12 : 0) -
          (saturationRisk === "HIGH" ? 8 : 0)
      )
    )
  );
  const visualStage = visualConfidenceStage({
    acceptedCompScoring,
    identityConfidence,
    conflictIndicators: visualConflictIndicators,
    soldCount
  });
  const confidenceCollapseReasons = [
    soldCount <= 0 ? "missing_sold_history" : "",
    acceptedCompScoring.tokenOverlapScore < 0.6 ? "weak_token_overlap" : "",
    acceptedCompScoring.titleSimilarityScore < 0.35 ? "weak_title_distance" : "",
    acceptedCompScoring.categoryAlignmentScore < 0.5 ? "category_conflict" : "",
    visualConflictIndicators.length ? "ocr_conflict_indicators" : "",
    titleMetrics.semanticRejectionRate >= 0.7 ? "excessive_rejected_comps" : ""
  ].filter(Boolean);
  return {
    acceptedComps: titleMetrics.acceptedCompCount,
    rejectedComps: titleMetrics.rejectedCompCount,
    averageSoldPrice,
    soldCount,
    soldCount90d,
    activeCount,
    sellThroughRate,
    saturationRatio,
    saturationRisk,
    saturationFlags,
    velocityScore,
    velocityTier,
    rejectionReasons,
    generatedSearchQueries: comps?.generatedSearchQueries || comps?.signals?.generatedSearchQueries || [],
    enrichmentStages: comps?.enrichmentStages || comps?.signals?.enrichmentStages || [],
    rejectionDetails,
    identityConfidence,
    acceptedCompScoring,
    acceptedCompReasons: acceptedItems.slice(0, 5).map((item) => ({
      title: item.title,
      reason: item.acceptedReason || "token_overlap",
      titleSimilarityScore: item.titleSimilarityScore || 0,
      tokenOverlapScore: item.tokenOverlapScore || 0,
      upcTrustScore: item.upcTrustScore || 0,
      categoryAlignmentScore: item.categoryAlignmentScore || 0,
      visualAnchorOverlapScore: item.visualAnchorOverlapScore || 0,
      rejectionRiskScore: item.rejectionRiskScore || 0
    })),
    strongestTokens,
    rejectedTokens: identityConfidence.rejectedKeywords || [],
    rejectedVisualIndicators: visualConflictIndicators,
    confidenceCollapseReasons,
    visualConfidenceStage: visualStage,
    queryPathSelected: comps?.sold?.query || comps?.query || "",
    trustGrade: trustScore >= 75 ? "HIGH" : trustScore >= 45 ? "MEDIUM" : "LOW",
    confidenceGrade:
      visualStage === "LOW_CONFIDENCE_UNKNOWN" ||
      soldCount <= 0 ||
      acceptedCompScoring.tokenOverlapScore < 0.6 ||
      acceptedCompScoring.titleSimilarityScore < 0.35
        ? "LOW"
        : trustScore >= 75
          ? "HIGH"
          : "MEDIUM",
    trustScore,
    queryMatchMetrics: combineQueryMetrics([comps?.sold, ...(comps?.external || [])])
  };
}

async function getCompsIntelligence(input = {}, options = {}) {
  const generatedSearchQueries = buildGeneratedSearchQueries(input);
  const generatedSearchQueryTelemetry = buildQueryTelemetry(input);
  const query = generatedSearchQueries[0] || buildQuery(input);
  const source = {
    query,
    title: input.suggestedTitle || input.model || input.itemTitle || query,
    model: input.model || input.itemTitle || "",
    brand: input.brand || input.analysisResult?.brand || "",
    category: input.categoryHint || input.analysisResult?.category || "",
    packagingHints: input.analysisResult?.packagingHints || [],
    sourceStore: input.sourceStore || input.sourceStoreContext?.sourceStoreType || "",
    costBasis: input.resolvedCostBasis ?? input.costBasis ?? input.costOfGoods ?? null,
    upc: input.upc || input.barcode || input.analysisResult?.upc || ""
  };
  const enrichmentStages = [
    { stage: "upc_exact_lookup", query: generatedSearchQueries.find((item) => /^\d{8,14}$/.test(item)) || "", status: "skipped" },
    { stage: "title_similarity_lookup", query: generatedSearchQueries.find((item) => !/^\d{8,14}$/.test(item)) || query, status: "skipped" },
    { stage: "token_intersection_lookup", query: generatedSearchQueries[2] || "", status: "skipped" },
    { stage: "fallback_broad_category_lookup", query: generatedSearchQueries[3] || "", status: "skipped" }
  ];
  const soldQueries = generatedSearchQueries.slice(0, 3);
  const soldResults = await Promise.all(
    soldQueries.map((nextQuery, index) =>
      fetchSoldComps({
        query: nextQuery,
        source,
        fetchImpl: options.fetchImpl,
        stage: enrichmentStages[index]?.stage || "title_similarity_lookup"
      }).catch(() => null)
    )
  );
  const sold = soldResults.find((result) => result?.count > 0) || soldResults.find(Boolean) || null;
  enrichmentStages.forEach((stage) => {
    const result = soldResults.find((item) => item?.query === stage.query);
    stage.status = result ? (result.count > 0 ? "matched" : "no_trusted_solds") : stage.query ? "unavailable" : "skipped";
  });
  const [active, mercari, facebook, offerup, amazon] = await Promise.all([
    fetchEbayActiveListings({ query, fetchImpl: options.fetchImpl }),
    fetchProviderComps({
      endpoint: process.env.MERCARI_COMPS_ENDPOINT,
      token: process.env.MERCARI_COMPS_TOKEN,
      query,
      source,
      provider: "mercari",
      fetchImpl: options.fetchImpl,
      stage: "token_intersection_lookup"
    }),
    fetchProviderComps({
      endpoint: process.env.FACEBOOK_MARKETPLACE_SIGNALS_ENDPOINT,
      token: process.env.FACEBOOK_MARKETPLACE_SIGNALS_TOKEN,
      query,
      source,
      provider: "facebook-marketplace",
      fetchImpl: options.fetchImpl,
      stage: "fallback_broad_category_lookup"
    }),
    fetchProviderComps({
      endpoint: process.env.OFFERUP_SIGNALS_ENDPOINT,
      token: process.env.OFFERUP_SIGNALS_TOKEN,
      query,
      source,
      provider: "offerup",
      fetchImpl: options.fetchImpl,
      stage: "fallback_broad_category_lookup"
    }),
    fetchProviderComps({
      endpoint: process.env.AMAZON_RESEARCH_ENDPOINT,
      token: process.env.AMAZON_RESEARCH_TOKEN,
      query,
      source,
      provider: "amazon-research",
      fetchImpl: options.fetchImpl,
      stage: "token_intersection_lookup"
    })
  ]);
  const external = [mercari, facebook, offerup, amazon].filter(Boolean);
  return {
    query,
    generatedSearchQueries,
    generatedSearchQueryTelemetry,
    enrichmentStages,
    active,
    sold,
    external,
    recentSales: [sold, ...external]
      .flatMap((source) => source?.items || [])
      .sort((a, b) => new Date(b.dateSold) - new Date(a.dateSold))
      .slice(0, 20),
    signals: {
      ...deriveCompsSignals({ active, sold, external }),
      generatedSearchQueries,
      generatedSearchQueryTelemetry,
      enrichmentStages
    },
    liveStatus: {
      active: active ? "live" : "unavailable",
      sold: sold ? "live" : "unavailable"
    }
  };
}

module.exports = {
  buildQuery,
  buildGeneratedSearchQueries,
  buildQueryTelemetry,
  combineTitleMatchMetrics,
  deriveCompsSignals,
  fetchWithTimeout,
  fetchEbayActiveListings,
  fetchSoldComps,
  fetchProviderComps,
  getCompsIntelligence,
  buildTrustedCompSummary,
  normalizeMarketplaceTitle,
  normalizeSoldItems,
  validateCompTitleMatch,
  summarizePriceRange
};
