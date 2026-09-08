import { getMarketData, type MarketDataResult } from "./marketDataService";

export type ResellerDecision = "BUY" | "REVIEW" | "SKIP";

export type ResellerMarketComp = {
  title: string;
  price: number;
  soldDate: string;
  sourcePlatform: "eBay";
  estimated: boolean;
  confidence: number;
};

export type ResellerScanAnalysis = {
  brand: string;
  productName: string;
  category: string;
  visibleText: string;
  confidence: number;
  searchQuery: string;
  estimatedResalePrice: number;
  estimatedShippingCost: number;
  platformFees: number;
  estimatedProfit: number;
  roi: number;
  breakEven: number;
  marketComps: ResellerMarketComp[];
  marketDataStatus: "LIVE" | "UNAVAILABLE";
  marketDataNotice: string;
  decision: ResellerDecision;
  buyCost: number;
  averageSoldPrice: number;
  lowestSold: number | null;
  highestSold: number | null;
  soldCount: number;
  walmartPrice: number | null;
  walmartTitle: string;
  marketData: MarketDataResult;
  pipeline: Array<{
    stage: string;
    status: "complete" | "estimated" | "skipped";
    detail: string;
  }>;
};

const EBAY_FEE_RATE = 0.13;
const BUY_MIN_ROI = 30;
const BUY_MIN_PROFIT = 10;
const REVIEW_MIN_ROI = 10;

function clean(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function money(value: unknown): number {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : 0;
}

function roundMoney(value: number): number {
  return Number((Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2));
}

function roundPercent(value: number): number {
  return Number((Math.round((value + Number.EPSILON) * 10) / 10).toFixed(1));
}

function stableHash(value = ""): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function firstClean(...values: unknown[]): string {
  return values.map(clean).find(Boolean) || "";
}

function visibleTextFrom(analysis: Record<string, any> = {}): string {
  return Array.from(
    new Set(
      [
        ...asArray(analysis.ocrText),
        ...asArray(analysis.visualAnchors),
        ...asArray(analysis.packagingHints),
        ...asArray(analysis.keyDetails),
        ...asArray(analysis.recognitionEvidence),
        ...asArray(analysis.imageObservations).flatMap((item) => [
          item?.titleText,
          item?.brandText,
          item?.priceText,
          ...asArray(item?.ocrText)
        ])
      ]
        .map(clean)
        .filter(Boolean)
    )
  )
    .slice(0, 24)
    .join(" | ");
}

function productNameFrom({
  analysis,
  listing,
  productLookup
}: {
  analysis?: Record<string, any>;
  listing?: Record<string, any>;
  productLookup?: Record<string, any> | null;
}): string {
  const candidate = firstClean(
    productLookup?.title,
    analysis?.confirmedProductIdentity?.title,
    listing?.confirmedProductIdentity?.title,
    analysis?.productName,
    analysis?.itemTitle,
    listing?.itemTitle,
    asArray(analysis?.productCandidates)[0]?.title,
    asArray(analysis?.bestMatches)[0]?.name
  );
  if (candidate && !/^(item|product|scanned item|unknown|unidentified)$/i.test(candidate)) {
    return candidate;
  }

  const text = visibleTextFrom(analysis);
  const usefulLine = text
    .split("|")
    .map(clean)
    .find((line) => /[a-z]/i.test(line) && line.split(/\s+/).length >= 2);
  return usefulLine || "Unidentified product";
}

function brandFrom({
  analysis,
  listing,
  productLookup,
  productName
}: {
  analysis?: Record<string, any>;
  listing?: Record<string, any>;
  productLookup?: Record<string, any> | null;
  productName: string;
}): string {
  const direct = firstClean(
    productLookup?.brand,
    analysis?.confirmedProductIdentity?.brand,
    listing?.confirmedProductIdentity?.brand,
    analysis?.brand,
    listing?.brand,
    asArray(analysis?.brandCandidates)[0]?.name
  );
  if (direct) return direct;

  const known = [
    "LEGO",
    "Hot Wheels",
    "Mattel",
    "Hasbro",
    "Transformers",
    "Pokemon",
    "Pokémon",
    "Funko",
    "Nintendo",
    "Sony",
    "Microsoft",
    "Xbox",
    "PlayStation",
    "Apple",
    "Samsung",
    "Onn",
    "JBL",
    "Bose",
    "Beats",
    "Nike",
    "Adidas",
    "Mainstays",
    "Rubbermaid",
    "Sterilite"
  ];
  return known.find((brand) => new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(productName)) || "";
}

function categoryFrom(analysis: Record<string, any> = {}, listing: Record<string, any> = {}): string {
  const direct = firstClean(
    analysis.confirmedProductIdentity?.category,
    listing.confirmedProductIdentity?.category,
    analysis.category,
    listing.category,
    asArray(analysis.categorySignals)[0]
  );
  if (direct) return direct;
  const text = `${analysis.itemTitle || ""} ${visibleTextFrom(analysis)}`.toLowerCase();
  if (/lego|toy|figure|hot wheels|pokemon|funko|transformers|die-?cast/.test(text)) return "Toys & Collectibles";
  if (/headphone|earbud|speaker|charger|bluetooth|wireless|controller|usb|hdmi/.test(text)) return "Electronics";
  if (/shoe|sneaker|boot/.test(text)) return "Footwear";
  if (/shirt|hoodie|jacket|pants|jeans|apparel/.test(text)) return "Apparel";
  if (/kitchen|home|storage|container|decor|vacuum|filter/.test(text)) return "Home";
  return "General Merchandise";
}

function confidenceFrom(analysis: Record<string, any> = {}, listing: Record<string, any> = {}, productLookup?: Record<string, any> | null): number {
  const raw = Number(
    listing.confidenceScore ??
      analysis.confidenceScore ??
      analysis.sourcingConfidenceScore ??
      analysis.trustScore ??
      0
  );
  const normalized = raw > 0 && raw <= 1 ? raw * 100 : raw;
  const lookupBoost = productLookup?.title ? 12 : 0;
  return Math.max(0, Math.min(99, Math.round((Number.isFinite(normalized) ? normalized : 0) + lookupBoost)));
}

function extractSourceCost(analysis: Record<string, any> = {}, pricing: Record<string, any> = {}, productLookup?: Record<string, any> | null): number {
  const direct = [
    analysis.resolvedCostBasis,
    analysis.manualOverrideValue,
    pricing.expectedProfit?.costOfGoods,
    pricing.profitSummary?.costOfGoods,
    pricing.manualOverride?.costPaid,
    productLookup?.walmartPrice
  ].map(money).find((value) => value > 0);
  if (direct) return direct;

  const text = visibleTextFrom(analysis);
  const prices = Array.from(text.matchAll(/\$?\b(\d{1,3}(?:\.\d{2})?)\b/g))
    .map((match) => money(match[1]))
    .filter((value) => value >= 0.5 && value <= 500);
  return prices.length ? Math.min(...prices) : 0;
}

function sourceCostFromMarketData({
  analysis,
  pricing,
  productLookup,
  marketData
}: {
  analysis: Record<string, any>;
  pricing: Record<string, any>;
  productLookup?: Record<string, any> | null;
  marketData: MarketDataResult;
}): number {
  return (
    extractSourceCost(analysis, pricing, productLookup) ||
    money(marketData.walmartPrice) ||
    money(analysis.walmartPrice)
  );
}

function shippingEstimate(category: string, resalePrice: number): number {
  const normalized = category.toLowerCase();
  if (/card|trading|beauty|cosmetic|small/.test(normalized)) return 4.75;
  if (/toy|collectible|apparel|clothing/.test(normalized)) return resalePrice >= 45 ? 7.95 : 6.75;
  if (/electronics|home|kitchen/.test(normalized)) return resalePrice >= 60 ? 10.95 : 8.5;
  if (/footwear|shoe|boot/.test(normalized)) return 10.95;
  return resalePrice >= 50 ? 8.5 : 6.75;
}

function liveCompPrices(comps: Record<string, any> | null | undefined, listing: Record<string, any> = {}): ResellerMarketComp[] {
  const sources = [
    ...asArray(comps?.recentSales),
    ...asArray(listing.comps)
  ];
  return sources
    .map((comp) => ({
      title: clean(comp.title || comp.itemTitle || listing.itemTitle || "eBay sold comp"),
      price: money(comp.price || comp.soldPrice),
      soldDate: clean(comp.dateSold || comp.soldAt || comp.date || "Recent"),
      sourcePlatform: "eBay" as const,
      estimated: false,
      confidence: Math.max(50, Math.min(95, Math.round(Number(comp.confidence || 78))))
    }))
    .filter((comp) => comp.price > 0)
    .slice(0, 20);
}

function average(values: number[]): number {
  const filtered = values.filter((value) => Number.isFinite(value) && value > 0);
  return filtered.length ? roundMoney(filtered.reduce((sum, value) => sum + value, 0) / filtered.length) : 0;
}

function pipelineStages({
  productName,
  searchQuery,
  marketComps,
  marketDataStatus,
  marketDataNotice,
  buyCost,
  estimatedResalePrice,
  platformFees,
  estimatedShippingCost,
  estimatedProfit,
  roi,
  decision
}: {
  productName: string;
  searchQuery: string;
  marketComps: ResellerMarketComp[];
  marketDataStatus: "LIVE" | "UNAVAILABLE";
  marketDataNotice: string;
  buyCost: number;
  estimatedResalePrice: number;
  platformFees: number;
  estimatedShippingCost: number;
  estimatedProfit: number;
  roi: number;
  decision: ResellerDecision;
}) {
  const live = marketDataStatus === "LIVE" || marketComps.some((comp) => !comp.estimated);
  return [
    { stage: "Upload Image", status: "complete" as const, detail: "Image, barcode, or manual UPC accepted by scanner." },
    { stage: "OpenAI Vision", status: productName ? "complete" as const : "skipped" as const, detail: productName || "Vision did not produce a product identity." },
    { stage: "Product Identification", status: productName ? "complete" as const : "estimated" as const, detail: productName },
    { stage: "Generate Search Query", status: searchQuery ? "complete" as const : "estimated" as const, detail: searchQuery },
    { stage: "eBay Sold API", status: live ? "complete" as const : "skipped" as const, detail: live ? `${marketComps.length} authorized sold comps available.` : marketDataNotice || "Official sold-comps API is not configured." },
    { stage: "Get 20 Recent Solds", status: live ? "complete" as const : "skipped" as const, detail: `${marketComps.length}/20 authorized comps available.` },
    { stage: "Calculate ASP", status: "complete" as const, detail: `$${estimatedResalePrice.toFixed(2)}` },
    { stage: "Calculate Fees", status: "complete" as const, detail: `$${platformFees.toFixed(2)} at 13%.` },
    { stage: "Calculate Shipping", status: "complete" as const, detail: `$${estimatedShippingCost.toFixed(2)}` },
    { stage: "Calculate Profit", status: buyCost > 0 ? "complete" as const : "estimated" as const, detail: `$${estimatedProfit.toFixed(2)}` },
    { stage: "Calculate ROI", status: buyCost > 0 ? "complete" as const : "estimated" as const, detail: `${roi}%` },
    { stage: "BUY / SKIP", status: "complete" as const, detail: decision }
  ];
}

function scoreDecision(roi: number, estimatedProfit: number): ResellerDecision {
  if (roi >= BUY_MIN_ROI && estimatedProfit >= BUY_MIN_PROFIT) return "BUY";
  if (roi >= REVIEW_MIN_ROI) return "REVIEW";
  return "SKIP";
}

function hasTrustedPriceSource(analysis: Record<string, any> = {}, pricing: Record<string, any> = {}) {
  const source = String(
    pricing.pricingSource ||
      pricing.pricingStatus ||
      analysis.pricingSource ||
      analysis.pricingStatus ||
      analysis.compsStatus ||
      ""
  ).toLowerCase();
  return /verified|manual|user_verified|sold_comp/.test(source) && !/unavailable|estimated/.test(source);
}

export function buildResellerScanAnalysis({
  analysis = {},
  listing = {},
  pricing = {},
  comps = null,
  productLookup = null
}: {
  analysis?: Record<string, any>;
  listing?: Record<string, any>;
  pricing?: Record<string, any>;
  comps?: Record<string, any> | null;
  productLookup?: Record<string, any> | null;
}): ResellerScanAnalysis {
  const productName = productNameFrom({ analysis, listing, productLookup });
  const brand = brandFrom({ analysis, listing, productLookup, productName });
  const category = categoryFrom(analysis, listing);
  const visibleText = visibleTextFrom(analysis);
  const confidence = confidenceFrom(analysis, listing, productLookup);
  const upc = clean(analysis.upc || listing.upc || productLookup?.upc).replace(/\D/g, "");
  const searchQuery = [upc || "", brand, productName, "sold"].map(clean).filter(Boolean).join(" ");
  const marketData = getMarketData(
    { upc, brand, productName },
    { analysis, listing, comps, productLookup }
  );
  const liveComps = liveCompPrices({ recentSales: marketData.comps }, listing);
  const trustedDirectResale = hasTrustedPriceSource(analysis, pricing)
    ? money(
        analysis.estimatedResalePrice ??
          analysis.averageSoldPrice ??
          listing.estimatedResalePrice ??
          listing.averageSalePrice ??
          pricing.selectedPrice ??
          pricing.averageSoldPrice
      )
    : 0;
  const marketComps = liveComps;
  const estimatedResalePrice = marketData.averageSold || average(marketComps.map((comp) => comp.price)) || trustedDirectResale;
  const estimatedShippingCost = estimatedResalePrice > 0
    ? money(analysis.estimatedShippingCost) || shippingEstimate(category, estimatedResalePrice)
    : 0;
  const platformFees = roundMoney(estimatedResalePrice * EBAY_FEE_RATE);
  const buyCost = sourceCostFromMarketData({ analysis, pricing, productLookup, marketData });
  const breakEven = roundMoney(buyCost + estimatedShippingCost + platformFees);
  const estimatedProfit = buyCost > 0 ? roundMoney(estimatedResalePrice - platformFees - estimatedShippingCost - buyCost) : 0;
  const roi = buyCost > 0 ? roundPercent((estimatedProfit / buyCost) * 100) : 0;
  const decision = estimatedResalePrice > 0 ? scoreDecision(roi, estimatedProfit) : "REVIEW";
  const pipeline = pipelineStages({
    productName,
    searchQuery,
    marketComps,
    marketDataStatus: marketData.status,
    marketDataNotice: marketData.notice,
    buyCost,
    estimatedResalePrice,
    platformFees,
    estimatedShippingCost,
    estimatedProfit,
    roi,
    decision
  });

  return {
    brand,
    productName,
    category,
    visibleText,
    confidence,
    searchQuery,
    estimatedResalePrice,
    estimatedShippingCost,
    platformFees,
    estimatedProfit,
    roi,
    breakEven,
    marketComps,
    marketDataStatus: marketData.status,
    marketDataNotice: marketData.notice,
    decision,
    buyCost,
    averageSoldPrice: estimatedResalePrice,
    lowestSold: marketData.lowestSold,
    highestSold: marketData.highestSold,
    soldCount: marketData.soldCount,
    walmartPrice: marketData.walmartPrice,
    walmartTitle: marketData.walmartTitle,
    marketData,
    pipeline
  };
}

export function applyResellerScanAnalysisToPayload<T extends Record<string, any>>(payload: T): T {
  const source = payload || ({} as T);
  const flat = buildResellerScanAnalysis({
    analysis: source.analysis || {},
    listing: source.listing || {},
    pricing: source.pricing || {},
    comps: source.comps || null,
    productLookup: source.productLookup || source.analysis?.productLookup || null
  });
  const normalizedComps = flat.marketComps.map((comp) => ({
    sourcePlatform: comp.sourcePlatform,
    price: comp.price,
    dateSold: comp.soldDate
  }));

  const analysis = {
    ...(source.analysis || {}),
    brand: flat.brand || source.analysis?.brand || "",
    productName: flat.productName,
    itemTitle: flat.productName,
    category: flat.category,
    visibleText: flat.visibleText,
    confidence: flat.confidence / 100,
    confidenceScore: flat.confidence,
    searchQuery: flat.searchQuery,
    walmartPrice: flat.walmartPrice,
    walmartTitle: flat.walmartTitle,
    marketData: {
      walmartPrice: flat.walmartPrice,
      walmartTitle: flat.walmartTitle,
      soldCount: flat.soldCount,
      lowestSold: flat.lowestSold,
      averageSold: flat.averageSoldPrice,
      highestSold: flat.highestSold,
      confidence: flat.marketData.confidence
    },
    estimatedResalePrice: flat.estimatedResalePrice,
    averageSoldPrice: flat.averageSoldPrice,
    lowestSold: flat.lowestSold,
    highestSold: flat.highestSold,
    soldCount: flat.soldCount,
    estimatedShippingCost: flat.estimatedShippingCost,
    platformFees: flat.platformFees,
    estimatedProfit: flat.estimatedProfit,
    breakEven: flat.breakEven,
    roi: flat.roi,
    roiPercentage: flat.roi,
    recommendation: flat.decision,
    recommendationExplanation:
      flat.estimatedResalePrice <= 0
        ? `${flat.decision}: ${flat.marketDataNotice}`
        : flat.buyCost > 0
        ? `${flat.decision}: average sold ${roundMoney(flat.averageSoldPrice).toFixed(2)}, fees ${roundMoney(flat.platformFees).toFixed(2)}, shipping ${roundMoney(flat.estimatedShippingCost).toFixed(2)}, cost paid ${roundMoney(flat.buyCost).toFixed(2)}, profit ${roundMoney(flat.estimatedProfit).toFixed(2)}, ROI ${flat.roi}%.`
        : "REVIEW: buy cost was not detected from barcode lookup, shelf label, or manual source cost, so ROI cannot be trusted.",
    marketCompEstimates: flat.marketComps,
    scanPipeline: flat.pipeline,
    resolvedCostBasis: flat.buyCost || source.analysis?.resolvedCostBasis,
    pricingSource: flat.marketComps.some((comp) => !comp.estimated) ? "verified_sold_comps" : "unavailable",
    pricingStatus: flat.marketComps.some((comp) => !comp.estimated) ? "verified" : "unavailable",
    compsStatus: flat.marketComps.some((comp) => !comp.estimated) ? "verified" : "unavailable",
    marketDataUnavailable: flat.marketDataStatus !== "LIVE",
    trustedCompSummary: {
      ...(source.analysis?.trustedCompSummary || source.listing?.trustedCompSummary || {}),
      acceptedComps: flat.marketComps.length,
      soldCount: flat.marketComps.length,
      soldCount90d: flat.marketComps.length,
      averageSoldPrice: flat.marketComps.length ? flat.estimatedResalePrice : null,
      lowestSold: flat.lowestSold,
      highestSold: flat.highestSold,
      sellThroughRate: source.analysis?.trustedCompSummary?.sellThroughRate ?? null
    }
  };

  const listing = source.listing
    ? {
        ...source.listing,
        itemTitle: flat.productName,
        brand: flat.brand,
        category: flat.category,
        averageSalePrice: flat.estimatedResalePrice,
        averageSoldPrice: flat.averageSoldPrice,
        lowestSold: flat.lowestSold,
        highestSold: flat.highestSold,
        soldCount: flat.soldCount,
        marketData: analysis.marketData,
        walmartPrice: flat.walmartPrice,
        walmartTitle: flat.walmartTitle,
        estimatedResalePrice: flat.estimatedResalePrice,
        profitPotential: flat.estimatedProfit,
        estimatedProfit: flat.estimatedProfit,
        roiPercentage: flat.roi,
        breakEven: flat.breakEven,
        recommendation: flat.decision,
        recommendationExplanation: analysis.recommendationExplanation,
        confidenceScore: flat.confidence,
        marketDataUnavailable: false,
        resolvedCostBasis: flat.buyCost || source.listing.resolvedCostBasis,
        pricingSource: analysis.pricingSource,
        trustedCompSummary: analysis.trustedCompSummary,
        comps: normalizedComps,
        scanPipeline: flat.pipeline,
        decisionCard: {
          ...(source.listing.decisionCard || {}),
          action: flat.decision === "REVIEW" ? "MANUAL_REVIEW" : flat.decision,
          confidenceScore: flat.confidence,
          reasoning: analysis.recommendationExplanation,
          product: {
            title: flat.productName,
            brand: flat.brand,
            category: flat.category,
            upc: source.listing.upc || source.analysis?.upc || ""
          }
        }
      }
    : source.listing;

  return {
    ...source,
    ...flat,
    ok: source.ok !== false,
    analysis,
    listing,
    resellerAnalysis: flat,
    comps: {
      ...(source.comps || {}),
      recentSales: flat.marketComps.map((comp) => ({
        sourcePlatform: comp.sourcePlatform,
        title: comp.title,
        price: comp.price,
        dateSold: comp.soldDate,
        estimated: comp.estimated,
        confidence: comp.confidence
      }))
    }
  };
}
