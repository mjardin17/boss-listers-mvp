const { computeProfit } = require("./feeCalculator");

const CATEGORY_MULTIPLIERS = {
  electronics: 1.65,
  clothing: 2.2,
  footwear: 2.35,
  vintage: 2.6,
  jewelry: 2.5,
  home: 1.9,
  toys: 1.45,
  general: 1.75
};

const CONDITION_MULTIPLIERS = {
  New: 1.12,
  "Like New": 1.06,
  Used: 1,
  "For Parts": 0.58
};

const RESELLER_FRICTION = {
  packagingMaterials: 1.25,
  handlingReserve: 0.75,
  lowDollarHandlingReserve: 1.25,
  buyerDiscountByMarketplace: {
    ebay: 0.04,
    amazon: 0.01,
    walmart: 0.01,
    facebook: 0.08,
    mercari: 0.05,
    poshmark: 0.03,
    offerup: 0.1,
    depop: 0.04,
    etsy: 0.02
  }
};
const SOURCE_MATRIX_FEES = Object.freeze({
  marketplaceFeeRate: 0.13,
  transactionFee: 0,
  shippingOverhead: 5.75
});

const COLLECTIBLE_TOY_TAGS = new Set([
  "hot-wheels",
  "diecast",
  "treasure-hunt",
  "super-treasure-hunt",
  "red-line-club",
  "transformers",
  "pokemon",
  "action-figure",
  "sealed"
]);

const COLLECTIBLE_PATTERNS = [
  /transformers?/i,
  /hasbro/i,
  /takara/i,
  /hot wheels?/i,
  /mattel/i,
  /pokemon|pok.mon/i,
  /die-?cast/i,
  /action figures?/i,
  /funko/i,
  /neca/i,
  /marvel legends/i,
  /star wars black series/i,
  /lego/i,
  /collector|collectible/i
];

const RARITY_PATTERNS = [
  /treasure hunt/i,
  /super treasure hunt/i,
  /\brlc\b|red line club/i,
  /\bchase\b/i,
  /limited edition/i,
  /exclusive/i,
  /convention|sdcc|nycc/i,
  /first edition/i,
  /short print/i,
  /variant/i
];

const SEALED_PATTERNS = [
  /\bnib\b/i,
  /new in box/i,
  /factory sealed/i,
  /\bsealed\b/i,
  /mint on card/i,
  /\bmoc\b/i,
  /carded/i,
  /blister/i
];

const WAVE_SCARCITY_PATTERNS = [
  /short[- ]?packed/i,
  /\bwave\s+\d+/i,
  /collector'?s edition/i,
  /store exclusive/i,
  /target exclusive/i,
  /walmart exclusive/i,
  /amazon exclusive/i,
  /limited run/i,
  /numbered/i
];

const COMMON_SHELF_WARMER_PATTERNS = [
  /common/i,
  /assorted/i,
  /basic figure/i,
  /mainline/i,
  /shelf[- ]?warmer/i,
  /mass[- ]?produced/i,
  /standard release/i
];

function normalizeSignal(value = "") {
  return String(value).trim().toLowerCase();
}

const SUPPORTED_MARKETPLACES = [
  { key: "ebay", label: "eBay" },
  { key: "amazon", label: "Amazon" },
  { key: "walmart", label: "Walmart Marketplace" },
  { key: "facebook", label: "Facebook Marketplace" },
  { key: "mercari", label: "Mercari" },
  { key: "poshmark", label: "Poshmark" },
  { key: "offerup", label: "OfferUp" },
  { key: "depop", label: "Depop" },
  { key: "etsy", label: "Etsy" }
];

const SOURCE_COST_CHANNELS = Object.freeze([
  { sourceId: "walmart", sourceName: "Walmart" },
  { sourceId: "target", sourceName: "Target" },
  { sourceId: "dollartree", sourceName: "Dollar Tree" },
  { sourceId: "tjmaxx", sourceName: "TJ Maxx" },
  { sourceId: "ross", sourceName: "Ross" },
  { sourceId: "manual", sourceName: "Manual Cost" },
  { sourceId: "wholesale", sourceName: "Wholesale Sheet" },
  { sourceId: "csv_upload", sourceName: "CSV Upload" }
]);

const MARKETPLACE_DEMAND_BIAS = {
  toys: {
    ebay: "high",
    amazon: "medium",
    walmart: "medium",
    mercari: "high",
    facebook: "medium",
    poshmark: "low",
    offerup: "medium",
    depop: "low",
    etsy: "medium"
  },
  clothing: {
    ebay: "medium",
    amazon: "low",
    walmart: "low",
    mercari: "medium",
    facebook: "medium",
    poshmark: "high",
    offerup: "low",
    depop: "high",
    etsy: "medium"
  },
  footwear: {
    ebay: "high",
    amazon: "medium",
    walmart: "medium",
    mercari: "medium",
    facebook: "medium",
    poshmark: "high",
    offerup: "medium",
    depop: "medium",
    etsy: "low"
  },
  electronics: {
    ebay: "high",
    amazon: "high",
    walmart: "medium",
    mercari: "medium",
    facebook: "medium",
    poshmark: "low",
    offerup: "medium",
    depop: "low",
    etsy: "low"
  }
};

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundCurrency(value) {
  return Number((Math.max(0, value) || 0).toFixed(2));
}

function roundSignedCurrency(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : null;
}

function roundPrice(value) {
  if (value < 20) return Math.ceil(value);
  if (value < 100) return Math.ceil(value / 5) * 5 - 0.01;
  return Math.ceil(value / 10) * 10 - 0.01;
}

function normalizeCostBasis(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Number(number.toFixed(2)) : null;
}

function normalizeSourceCostProfiles(input = {}) {
  const incoming = Array.isArray(input.sourceCostProfiles) ? input.sourceCostProfiles : [];
  const byId = new Map(
    incoming
      .filter((profile) => profile && typeof profile === "object")
      .map((profile) => [String(profile.sourceId || ""), profile])
  );

  return SOURCE_COST_CHANNELS.map((channel) => {
    const source = byId.get(channel.sourceId) || {};
    const hasProfileCost = Object.prototype.hasOwnProperty.call(source, "costBasis");
    const manualCost =
      channel.sourceId === "manual" && input.costOfGoods !== ""
        ? normalizeCostBasis(input.costOfGoods)
        : null;
    const costBasis = normalizeCostBasis(hasProfileCost ? source.costBasis : manualCost);
    return Object.freeze({
      sourceId: channel.sourceId,
      sourceName: channel.sourceName,
      costBasis,
      isUserOverride: Boolean(source.isUserOverride || (channel.sourceId === "manual" && costBasis != null))
    });
  });
}

function primaryCostBasis(input = {}, sourceCostProfiles = []) {
  const directCost = normalizeCostBasis(
    input.resolvedCostBasis ??
      input.productData?.costBasis ??
      input.costBasis ??
      input.walmartCost
  );
  if (directCost != null) return directCost;
  const walmartCost = sourceCostProfiles.find((source) => source.sourceId === "walmart")?.costBasis;
  if (walmartCost != null) return walmartCost;
  const manualCost = sourceCostProfiles.find((source) => source.sourceId === "manual")?.costBasis;
  return manualCost ?? null;
}

function hardenedNetProfit(marketValue, costBasis) {
  if (marketValue == null || costBasis == null) return null;
  const marketplaceFees =
    marketValue * SOURCE_MATRIX_FEES.marketplaceFeeRate + SOURCE_MATRIX_FEES.transactionFee;
  return roundSignedCurrency(
    marketValue - marketplaceFees - SOURCE_MATRIX_FEES.shippingOverhead - costBasis
  );
}

function hardenedRecommendation({
  netProfit,
  costBasis,
  confidenceScore,
  validSoldCount = 0,
  sellThroughRate = 0,
  saturationLevel = "LOW",
  latestAgeDays = null
}) {
  if (netProfit == null || costBasis == null || confidenceScore <= 0) return "MANUAL_REVIEW";
  if (validSoldCount <= 0) return "MANUAL_REVIEW";
  const roi = costBasis > 0 ? (netProfit / costBasis) * 100 : null;
  const buyRoiThreshold = Math.max(15, Number(process.env.BUY_ROI_THRESHOLD || 35) || 35);
  if (netProfit <= 0 || roi < 15) return "SKIP";
  if (confidenceScore < 40 || latestAgeDays == null || latestAgeDays > 120) return "MANUAL_REVIEW";
  if (
    roi >= buyRoiThreshold &&
    confidenceScore >= 55 &&
    validSoldCount >= 3 &&
    sellThroughRate >= 30 &&
    saturationLevel !== "HIGH"
  ) {
    return "BUY";
  }
  return "HOLD";
}

function sourceMetricStatus(returnOnInvestment) {
  if (returnOnInvestment >= 35) return "BUY";
  if (returnOnInvestment >= 15) return "HOLD";
  return "SKIP";
}

function buildSourceProfitMetrics({ sourceCostProfiles, averageSoldPrice }) {
  return sourceCostProfiles.map((source) => {
    if (source.costBasis == null || averageSoldPrice == null || source.costBasis <= 0) {
      return Object.freeze({
        sourceId: source.sourceId,
        sourceName: source.sourceName,
        costBasis: source.costBasis,
        netProfit: null,
        returnOnInvestment: null,
        status: "UNAVAILABLE"
      });
    }

    const marketplaceFees =
      averageSoldPrice * SOURCE_MATRIX_FEES.marketplaceFeeRate +
      SOURCE_MATRIX_FEES.transactionFee;
    const netProfit =
      averageSoldPrice -
      marketplaceFees -
      SOURCE_MATRIX_FEES.shippingOverhead -
      source.costBasis;
    const roi = (netProfit / source.costBasis) * 100;

    return Object.freeze({
      sourceId: source.sourceId,
      sourceName: source.sourceName,
      costBasis: source.costBasis,
      netProfit: roundSignedCurrency(netProfit),
      returnOnInvestment: Number(roi.toFixed(1)),
      status: sourceMetricStatus(roi)
    });
  });
}

function percentile(values, ratio) {
  const prices = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!prices.length) return null;
  const index = clamp(Math.round((prices.length - 1) * ratio), 0, prices.length - 1);
  return prices[index];
}

function median(values) {
  return percentile(values, 0.5);
}

function average(values) {
  const prices = values.filter((value) => Number.isFinite(value) && value > 0);
  if (!prices.length) return null;
  return prices.reduce((sum, value) => sum + value, 0) / prices.length;
}

function standardDeviation(values) {
  const avg = average(values);
  if (!avg) return 0;
  const variance =
    values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / Math.max(1, values.length);
  return Math.sqrt(variance);
}

function iqrFiltered(values) {
  const prices = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (prices.length < 5) return prices;
  const q1 = percentile(prices, 0.25);
  const q3 = percentile(prices, 0.75);
  const iqr = q3 - q1;
  const lowFence = q1 - iqr * 1.5;
  const highFence = q3 + iqr * 1.5;
  return prices.filter((price) => price >= lowFence && price <= highFence);
}

function normalizeCategory(categoryHint = "") {
  const value = String(categoryHint).trim().toLowerCase();
  if (!value) return "general";
  if (value.includes("shoe") || value.includes("footwear")) return "footwear";
  if (value.includes("cloth") || value.includes("apparel")) return "clothing";
  if (value.includes("electronic") || value.includes("audio")) return "electronics";
  if (value.includes("vintage")) return "vintage";
  if (value.includes("jewel")) return "jewelry";
  if (value.includes("home")) return "home";
  if (value.includes("toy")) return "toys";
  if (value.includes("collectible") || value.includes("figure") || value.includes("diecast")) {
    return "toys";
  }
  return "general";
}

function minimumPriceForTargetProfit(input, targetProfit = 10) {
  const cost = Math.max(0, Number(input.costOfGoods) || 0);
  for (let price = Math.max(5, cost); price <= 2000; price += 1) {
    const profit = computeResellerProfit({
      marketplace: "ebay",
      salePrice: price,
      costOfGoods: cost,
      weightLb: input.weightLb || 1,
      category: normalizeCategory(input.categoryHint),
      profile: { collectibleDetected: false }
    });
    if (profit.netProfit >= targetProfit) return price;
  }
  return Math.max(5, cost);
}

function computeResellerProfit({
  marketplace,
  salePrice,
  costOfGoods,
  weightLb,
  category = "general",
  profile = {}
}) {
  const listedPrice = Math.max(0, toNumber(salePrice, 0));
  const lowDollarPenalty = listedPrice > 0 && listedPrice < 25 ? 0.02 : 0;
  const collectibleDiscountRelief =
    profile.collectibleDetected && (profile.rarityLevel === "candidate" || profile.rarityLevel === "strong")
      ? 0.015
      : 0;
  const marketplaceDiscount = RESELLER_FRICTION.buyerDiscountByMarketplace[marketplace] || 0.04;
  const buyerDiscount = clamp(marketplaceDiscount + lowDollarPenalty - collectibleDiscountRelief, 0, 0.12);
  const realizedSalePrice = roundCurrency(listedPrice * (1 - buyerDiscount));
  const baseProfit = computeProfit({
    marketplace,
    salePrice: realizedSalePrice,
    costOfGoods,
    weightLb
  });
  const packagingMaterials =
    category === "toys" || profile.collectibleDetected
      ? RESELLER_FRICTION.packagingMaterials + 0.5
      : RESELLER_FRICTION.packagingMaterials;
  const handlingReserve =
    listedPrice < 25 ? RESELLER_FRICTION.lowDollarHandlingReserve : RESELLER_FRICTION.handlingReserve;
  const frictionCost = roundCurrency(packagingMaterials + handlingReserve);
  const fees = {
    ...baseProfit.fees,
    otherFees: roundCurrency((baseProfit.fees.otherFees || 0) + frictionCost),
    totalFees: roundCurrency(baseProfit.fees.totalFees + frictionCost)
  };
  const netRevenue = roundCurrency(realizedSalePrice - fees.totalFees);
  const netProfit = Number((netRevenue - Math.max(0, toNumber(costOfGoods, 0))).toFixed(2));

  return {
    ...baseProfit,
    salePrice: listedPrice,
    realizedSalePrice,
    buyerDiscountPct: Number((buyerDiscount * 100).toFixed(1)),
    fees,
    netRevenue,
    netProfit,
    marginPct: listedPrice > 0 ? Number(((netProfit / listedPrice) * 100).toFixed(1)) : 0,
    roiPct: costOfGoods > 0 ? Number(((netProfit / costOfGoods) * 100).toFixed(1)) : 0
  };
}

function maximumBuyCostForTargets({
  marketplace,
  salePrice,
  weightLb,
  minProfit = 10,
  minRoiPct = 50,
  category = "general",
  profile = {}
}) {
  const sale = Math.max(0, Number(salePrice) || 0);
  let best = 0;
  for (let cost = 0; cost <= sale; cost += 0.25) {
    const profit = computeResellerProfit({
      marketplace,
      salePrice: sale,
      costOfGoods: cost,
      weightLb: weightLb || 1,
      category,
      profile
    });
    if (profit.netProfit >= minProfit && profit.roiPct >= minRoiPct) {
      best = cost;
    }
  }
  return +best.toFixed(2);
}

function buildSearchText(input = {}, analysis = {}) {
  return [
    input.brand,
    input.model,
    input.categoryHint,
    input.condition,
    (input.tags || []).join(" "),
    analysis.itemTitle,
    analysis.title,
    analysis.brand,
    analysis.category,
    analysis.summary,
    analysis.demand,
    analysis.sellThrough,
    analysis.variant,
    analysis.releaseYear,
    (analysis.keyDetails || []).join(" "),
    (analysis.detectedText || []).join(" "),
    (analysis.ocrText || []).join(" ")
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function detectCollectibleProfile(input = {}, analysis = {}, category = "general") {
  const text = buildSearchText(input, analysis);
  const tags = new Set((input.tags || []).map((tag) => String(tag).toLowerCase()));
  const collectibleDetected =
    category === "toys" ||
    [...COLLECTIBLE_TOY_TAGS].some((tag) => tags.has(tag)) ||
    COLLECTIBLE_PATTERNS.some((pattern) => pattern.test(text));
  const sealed = SEALED_PATTERNS.some((pattern) => pattern.test(text)) || input.condition === "New";
  const raritySignals = RARITY_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) =>
    String(pattern).replace(/^\/|\/i$/g, "")
  );
  const waveScarcitySignals = WAVE_SCARCITY_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) =>
    String(pattern).replace(/^\/|\/i$/g, "")
  );
  const commonShelfSignals = COMMON_SHELF_WARMER_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) =>
    String(pattern).replace(/^\/|\/i$/g, "")
  );
  const rarityLevel =
    raritySignals.length + waveScarcitySignals.length >= 2
      ? "strong"
      : raritySignals.length + waveScarcitySignals.length === 1
        ? "candidate"
        : collectibleDetected
          ? "ordinary"
          : "none";
  const franchise =
    /transformers?/i.test(text)
      ? "Transformers"
      : /hot wheels?/i.test(text)
        ? "Hot Wheels"
    : /pokemon|pok.mon/i.test(text)
          ? "Pokemon"
          : /die-?cast/i.test(text)
            ? "Diecast"
            : /action figures?/i.test(text)
              ? "Action figures"
              : "";

  return {
    collectibleDetected,
    sealed,
    raritySignals,
    waveScarcitySignals,
    commonShelfSignals,
    rarityLevel,
    franchise
  };
}

function normalizeCompPrice(item) {
  return toNumber(item?.price?.value ?? item?.price ?? item?.salePrice ?? item?.soldPrice, 0);
}

function isTrustworthySoldComp(item = {}) {
  const status = String(item.status || item.itemStatus || item.listingStatus || "").toLowerCase();
  return item.isSold === true || status === "completed";
}

function normalizeSoldDate(item = {}) {
  const dateSold = item.dateSold || item.soldAt || item.endTime || item.completedAt || null;
  if (!dateSold) return null;
  const date = new Date(dateSold);
  return Number.isNaN(date.getTime()) ? null : date;
}

function collectSoldPrices(comps = {}) {
  const prices = [];
  const seen = new Set();
  const addItem = (item) => {
    const price = normalizeCompPrice(item);
    const soldDate = normalizeSoldDate(item);
    if (isTrustworthySoldComp(item) && price > 0 && soldDate) {
      const key = `${price}:${soldDate.toISOString()}`;
      if (seen.has(key)) return;
      seen.add(key);
      prices.push({
        price,
        dateSold: soldDate.toISOString()
      });
    }
  };
  (comps.recentSales || []).forEach(addItem);
  (comps.sold?.items || []).forEach(addItem);

  return prices;
}

function collectEbaySoldPrices(comps = {}) {
  return (comps.sold?.items || [])
    .map((item) => {
      const price = normalizeCompPrice(item);
      const soldDate = normalizeSoldDate(item);
      return isTrustworthySoldComp(item) && price > 0 && soldDate
        ? {
            price,
            dateSold: soldDate.toISOString(),
            isSold: true,
            status: "completed"
          }
        : null;
    })
    .filter(Boolean);
}

function collectActivePrices(comps = {}) {
  const range = comps.active?.range;
  if (!range?.midpoint) return [];
  const prices = [toNumber(range.midpoint)];
  if (range.low) prices.push(toNumber(range.low));
  if (range.high) prices.push(toNumber(range.high));
  return prices.filter((price) => price > 0);
}

function recencyWeight(dateSold) {
  if (!dateSold) return 0.85;
  const soldDate = new Date(dateSold);
  if (Number.isNaN(soldDate.getTime())) return 0.85;
  const ageDays = (Date.now() - soldDate.getTime()) / 86400000;
  if (ageDays <= 30) return 1.18;
  if (ageDays <= 90) return 1;
  if (ageDays <= 180) return 0.88;
  return 0.72;
}

function weightedSoldAverage(items) {
  if (!items.length) return null;
  let weightedTotal = 0;
  let totalWeight = 0;
  items.forEach((item) => {
    const weight = recencyWeight(item.dateSold);
    weightedTotal += item.price * weight;
    totalWeight += weight;
  });
  return totalWeight > 0 ? weightedTotal / totalWeight : null;
}

function summarizeSoldComps(comps = {}) {
  const soldItems = collectSoldPrices(comps);
  const sortedPrices = soldItems.map((item) => item.price).sort((a, b) => a - b);
  const q1 = percentile(sortedPrices, 0.25);
  const q3 = percentile(sortedPrices, 0.75);
  const iqr = q1 != null && q3 != null ? q3 - q1 : 0;
  const lowerBound = q1 == null ? null : q1 - iqr * 1.5;
  const upperBound = q3 == null ? null : q3 + iqr * 1.5;
  const filteredItems =
    lowerBound == null || upperBound == null
      ? []
      : soldItems.filter((item) => item.price >= lowerBound && item.price <= upperBound);
  const filteredPrices = filteredItems.map((item) => item.price);
  const sortedByDate = filteredItems
    .slice()
    .sort((a, b) => new Date(b.dateSold).getTime() - new Date(a.dateSold).getTime());
  const recentAverage = average(sortedByDate.slice(0, 3).map((item) => item.price));
  const historicalAverage = average(filteredPrices);
  const midpoint =
    recentAverage != null && historicalAverage != null
      ? recentAverage * 0.7 + historicalAverage * 0.3
      : null;
  const low = percentile(filteredPrices, 0.2) || midpoint;
  const high = percentile(filteredPrices, 0.8) || midpoint;
  const deviation = historicalAverage ? standardDeviation(filteredPrices) / historicalAverage : 0;
  const latestDate = sortedByDate[0]?.dateSold ? new Date(sortedByDate[0].dateSold) : null;
  const latestAgeDays = latestDate ? (Date.now() - latestDate.getTime()) / 86400000 : null;
  const trailing90Count = sortedByDate.filter((item) => {
    const ageDays = (Date.now() - new Date(item.dateSold).getTime()) / 86400000;
    return ageDays <= 90;
  }).length;
  const volumePoints = Math.min(50, trailing90Count * 5);
  const recencyPoints =
    latestAgeDays == null ? 0 : latestAgeDays <= 7 ? 30 : latestAgeDays <= 30 ? 15 : 0;
  const stabilityPoints = deviation <= 0.15 ? 19 : deviation <= 0.4 ? 10 : 0;
  const confidenceScore = Math.min(99, volumePoints + recencyPoints + stabilityPoints);

  return {
    count: filteredPrices.length,
    sampleSize: filteredPrices.length,
    prices: filteredPrices,
    weightedMidpoint: midpoint ? roundCurrency(midpoint) : null,
    low: low ? roundCurrency(low) : null,
    high: high ? roundCurrency(high) : null,
    consistency: midpoint ? clamp(1 - deviation, 0, 1) : 0,
    recentCount: trailing90Count,
    staleCount: sortedByDate.length - trailing90Count,
    filteredOutlierCount: soldItems.length - filteredItems.length,
    validSoldCount: soldItems.length,
    compVolumeCount: trailing90Count,
    confidenceScore,
    latestAgeDays,
    hasSoldData: Boolean(midpoint && filteredPrices.length > 0)
  };
}

function averageEbaySoldPrice(comps = {}) {
  return summarizeSoldComps({ sold: { items: collectEbaySoldPrices(comps) } }).weightedMidpoint;
}

function summarizeActiveComps(comps = {}) {
  const prices = iqrFiltered(collectActivePrices(comps));
  const midpoint = median(prices);
  return {
    count: toNumber(comps.signals?.activeListingCount || comps.active?.count, 0),
    midpoint: midpoint ? roundCurrency(midpoint) : null,
    low: percentile(prices, 0.2),
    high: percentile(prices, 0.8)
  };
}

function deriveSellThrough(comps = {}, analysis = {}) {
  const ratio = toNumber(comps.signals?.sellThroughRatio, 0);
  const soldVelocity = normalizeSignal(comps.signals?.soldVelocity);
  const demand = normalizeSignal(analysis.demand || analysis.demandLevel);
  const sellThrough = normalizeSignal(analysis.sellThrough);

  if (soldVelocity === "fast" || ratio >= 0.75) return { speed: "fast", score: 85, ratio };
  if (soldVelocity === "steady" || ratio >= 0.35) return { speed: "steady", score: 62, ratio };
  if (soldVelocity === "slow" || (ratio > 0 && ratio < 0.35)) return { speed: "slow", score: 28, ratio };
  if (sellThrough === "fast" || demand === "high") return { speed: "average", score: 58, ratio: null };
  if (sellThrough === "slow" || demand === "low") return { speed: "slow", score: 32, ratio: null };
  return { speed: "unknown", score: 45, ratio: null };
}

function conditionPremium(profile) {
  if (!profile.collectibleDetected) return 1;
  let premium = 1;
  if (profile.sealed) premium += 0.12;
  if (profile.rarityLevel === "candidate") premium += 0.12;
  if (profile.rarityLevel === "strong") premium += 0.28;
  return clamp(premium, 1, 1.45);
}

function noSoldDataPrice({
  cost,
  evidencePrice,
  floorPrice,
  categoryMultiplier,
  conditionMultiplier,
  profile,
  demandMultiplier,
  activeStats
}) {
  return null;
}

function soldDataPrice({ soldStats, activeStats, profile, sellThrough }) {
  const soldAnchor = soldStats.weightedMidpoint;
  if (!soldAnchor) return null;
  return roundCurrency(soldAnchor);
}

function calculateConfidenceScore({ analysisConfidence, soldStats, activeStats, sellThrough, profile, hasEvidencePrice }) {
  if (!soldStats.hasSoldData) return 0;
  return clamp(Math.round(soldStats.confidenceScore), 0, 99);
}

function buildSoldPriceRange({ soldStats, selectedPrice, floorPrice }) {
  if (soldStats.hasSoldData) {
    return {
      low: soldStats.low || roundCurrency(selectedPrice * 0.85),
      midpoint: soldStats.weightedMidpoint || selectedPrice,
      high: soldStats.high || roundCurrency(selectedPrice * 1.15)
    };
  }
  return null;
}

function calculateActiveListingDiscount({ soldStats, activeStats, selectedPrice }) {
  if (!activeStats.midpoint) {
    return {
      activeListingDiscountPct: null,
      activeListingUse: "unavailable",
      activeListingNote: "Active listing data unavailable"
    };
  }
  if (soldStats.hasSoldData) {
    const soldAnchor = soldStats.weightedMidpoint || selectedPrice;
    const discount = soldAnchor > 0 ? clamp(1 - selectedPrice / soldAnchor, 0, 0.35) : 0;
    return {
      activeListingDiscountPct: Number((discount * 100).toFixed(1)),
      activeListingUse: "pressure-only",
      activeListingNote: "Sold comps control valuation; active listings only pressure the list price"
    };
  }
  return {
    activeListingDiscountPct: activeStats.count >= 40 ? 28 : 20,
    activeListingUse: "weak-fallback",
    activeListingNote: "No sold comps available; active listings are discounted before use"
  };
}

function buildConfidenceReasoning({ soldStats, activeStats, sellThrough, profile, profitConfidenceScore }) {
  return [
    soldStats.hasSoldData
      ? `${soldStats.count} sold comps available with ${Math.round(soldStats.consistency * 100)}% price consistency`
      : "No sold comps available, confidence is capped",
    soldStats.recentCount > 0 ? `${soldStats.recentCount} recent sales receive extra weight` : "",
    soldStats.staleCount > 0 ? `${soldStats.staleCount} stale sales are down-weighted` : "",
    activeStats.count > 0 ? `${activeStats.count} active listings treated as saturation pressure` : "",
    profile.collectibleDetected ? "collectible category signals recognized" : "collectible signals not confirmed",
    sellThrough.speed !== "unknown" ? `${sellThrough.speed} sell-through affects hold-time risk` : "",
    profitConfidenceScore < 55 ? "manual comp review recommended before purchase" : ""
  ].filter(Boolean);
}

function calculateSellThroughRate({ soldStats, activeStats, sellThrough, category, profile }) {
  if (!soldStats.hasSoldData) return 0;
  if (sellThrough.ratio != null && sellThrough.ratio > 0) {
    return clamp(Math.round(sellThrough.ratio * 100), 1, 100);
  }

  const categoryBaseline =
    profile.franchise === "Pokemon"
      ? 62
      : profile.franchise === "Hot Wheels"
        ? 58
        : profile.collectibleDetected
          ? 46
          : category === "electronics"
            ? 54
            : category === "clothing"
              ? 38
              : 42;
  const soldDepthLift = soldStats.count >= 20 ? 12 : soldStats.count >= 8 ? 8 : soldStats.count >= 3 ? 4 : 0;
  const saturationDrag = activeStats.count >= 80 ? 18 : activeStats.count >= 40 ? 10 : 0;
  const velocityLift = sellThrough.speed === "fast" ? 14 : sellThrough.speed === "steady" ? 6 : sellThrough.speed === "slow" ? -12 : 0;

  return clamp(Math.round(categoryBaseline + soldDepthLift + velocityLift - saturationDrag), 8, 90);
}

function calculateSaturationPenalty({ activeStats, soldStats }) {
  if (!activeStats.count) return soldStats.hasSoldData ? 8 : 22;
  const ratio = soldStats.count > 0 ? activeStats.count / Math.max(1, soldStats.count) : activeStats.count;
  const base =
    activeStats.count >= 100
      ? 35
      : activeStats.count >= 60
        ? 26
        : activeStats.count >= 30
          ? 16
          : 8;
  const ratioPenalty = ratio >= 8 ? 28 : ratio >= 4 ? 18 : ratio >= 2 ? 10 : 3;
  return clamp(Math.round(base + ratioPenalty), 0, 85);
}

function detectMarketSaturation({ activeStats, soldStats, profile, sellThrough }) {
  const activeCount = activeStats.count || 0;
  const soldCount = soldStats.count || 0;
  const activeToSoldRatio = soldCount > 0 ? activeCount / Math.max(1, soldCount) : activeCount;
  const priceSpread =
    soldStats.low && soldStats.high && soldStats.weightedMidpoint
      ? (soldStats.high - soldStats.low) / Math.max(1, soldStats.weightedMidpoint)
      : null;
  const rarityRelief =
    profile.rarityLevel === "strong" ? 22 : profile.rarityLevel === "candidate" ? 12 : 0;
  const commonPenalty = profile.commonShelfSignals?.length ? 14 : 0;
  const rawPressure =
    (activeCount >= 100 ? 40 : activeCount >= 60 ? 30 : activeCount >= 30 ? 18 : activeCount >= 10 ? 8 : 0) +
    (activeToSoldRatio >= 10 ? 30 : activeToSoldRatio >= 5 ? 20 : activeToSoldRatio >= 2.5 ? 10 : 0) +
    (sellThrough.speed === "slow" ? 18 : sellThrough.speed === "fast" ? -8 : 0) +
    (priceSpread != null && priceSpread < 0.18 && activeCount >= 30 ? 14 : 0) +
    commonPenalty -
    rarityRelief;
  const pressureScore = clamp(Math.round(rawPressure), 0, 100);
  const saturationLevel = pressureScore >= 68 ? "HIGH" : pressureScore >= 38 ? "MEDIUM" : "LOW";
  const pricingCompressionRisk =
    priceSpread != null && priceSpread < 0.18 && activeCount >= 30
      ? "HIGH"
      : pressureScore >= 60
        ? "MEDIUM"
        : "LOW";

  return {
    saturationLevel,
    marketPressure: pressureScore,
    pricingCompressionRisk,
    activeToSoldRatio: Number(activeToSoldRatio.toFixed(2)),
    priceSpreadPct: priceSpread == null ? null : Number((priceSpread * 100).toFixed(1)),
    undercuttingWarRisk: activeCount >= 60 && pricingCompressionRisk !== "LOW",
    staleListingRisk: activeCount >= 60 && sellThrough.speed !== "fast"
  };
}

function calculateShippingBurdenScore({ expectedProfit, weightLb, selectedPrice, profile }) {
  const weight = Math.max(0.1, toNumber(weightLb, 1));
  const shipping = toNumber(expectedProfit?.fees?.shippingCost, 0);
  const price = Math.max(1, toNumber(selectedPrice, 1));
  const shippingPct = shipping / price;
  const weightPenalty = weight >= 8 ? 28 : weight >= 4 ? 18 : weight >= 2 ? 10 : 4;
  const lowDollarPenalty = price < 20 ? 22 : price < 35 ? 12 : 4;
  const collectibleRelief = profile.collectibleDetected && price >= 50 ? 8 : 0;
  return clamp(Math.round(shippingPct * 100 + weightPenalty + lowDollarPenalty - collectibleRelief), 0, 100);
}

function calculateOperationalScore({
  expectedProfit,
  selectedPrice,
  weightLb,
  shippingBurdenScore,
  inventoryBurdenScore,
  sellThroughRate,
  capitalEfficiencyScore
}) {
  const netProfit = toNumber(expectedProfit?.netProfit, 0);
  const roiPct = toNumber(expectedProfit?.roiPct, 0);
  const laborBurden =
    selectedPrice < 20 ? 58 : selectedPrice < 35 ? 42 : selectedPrice < 75 ? 28 : 18;
  const shippingRisk = shippingBurdenScore >= 65 ? "HIGH" : shippingBurdenScore >= 40 ? "MEDIUM" : "LOW";
  const laborRisk = laborBurden >= 55 || (netProfit < 8 && selectedPrice < 35) ? "HIGH" : laborBurden >= 38 ? "MEDIUM" : "LOW";
  const sizeBurden = inventoryBurdenScore >= 60 ? "HIGH" : inventoryBurdenScore >= 38 ? "MEDIUM" : "LOW";
  const breakEvenTimelineDays =
    sellThroughRate >= 70 ? 14 : sellThroughRate >= 50 ? 30 : sellThroughRate >= 30 ? 60 : 90;
  const score = clamp(
    Math.round(
      capitalEfficiencyScore * 0.36 +
        sellThroughRate * 0.24 +
        Math.min(Math.max(netProfit, 0), 35) * 0.7 +
        Math.max(0, roiPct) * 0.16 -
        shippingBurdenScore * 0.18 -
        inventoryBurdenScore * 0.12 -
        laborBurden * 0.1
    ),
    0,
    100
  );

  return {
    operationalScore: score,
    laborBurden,
    laborRisk,
    shippingRisk,
    sizeBurden,
    breakEvenTimelineDays,
    worthShipping: shippingRisk !== "HIGH" || netProfit >= 25,
    worthStoring: sizeBurden !== "HIGH" || sellThroughRate >= 55,
    worthCapitalLockup: capitalEfficiencyScore >= 45 && breakEvenTimelineDays <= 60
  };
}

function calculateCapitalEfficiency({ expectedProfit, cost, sellThroughRate }) {
  const roi = toNumber(expectedProfit?.roiPct, 0);
  const profit = toNumber(expectedProfit?.netProfit, 0);
  const capitalDrag = cost >= 75 && profit < 25 ? 12 : cost >= 40 && profit < 15 ? 8 : 0;
  return clamp(Math.round(roi * 0.55 + sellThroughRate * 0.35 + Math.min(profit, 35) - capitalDrag), 0, 100);
}

function calculateInventoryBurden({ category, profile, weightLb, selectedPrice }) {
  const weight = Math.max(0.1, toNumber(weightLb, 1));
  let burden = weight >= 8 ? 70 : weight >= 4 ? 48 : weight >= 2 ? 34 : 18;
  if (category === "home") burden += 12;
  if (category === "electronics") burden += 8;
  if (profile.collectibleDetected && selectedPrice >= 40) burden -= 12;
  return clamp(Math.round(burden), 0, 100);
}

function predictVelocity({ sellThroughRate, marketSaturation, profile, category, expectedProfit }) {
  const profit = toNumber(expectedProfit?.netProfit, 0);
  const hypeLift =
    profile.franchise === "Pokemon" || profile.rarityLevel === "strong"
      ? 10
      : profile.franchise === "Hot Wheels" || profile.franchise === "Transformers"
        ? 6
        : 0;
  const saturationDrag =
    marketSaturation.saturationLevel === "HIGH" ? 18 : marketSaturation.saturationLevel === "MEDIUM" ? 8 : 0;
  const categoryDrag = category === "clothing" ? 6 : category === "home" ? 8 : 0;
  const adjustedVelocity = clamp(Math.round(sellThroughRate + hypeLift - saturationDrag - categoryDrag), 1, 100);
  const velocityGrade =
    adjustedVelocity >= 72
      ? "FAST"
      : adjustedVelocity >= 48
        ? "STEADY"
        : adjustedVelocity >= 28
          ? "SLOW"
          : "DEAD";
  const estimatedDaysToSale =
    velocityGrade === "FAST" ? 14 : velocityGrade === "STEADY" ? 35 : velocityGrade === "SLOW" ? 75 : 120;
  const liquidationProbability = clamp(
    Math.round(
      (100 - adjustedVelocity) * 0.5 +
        (marketSaturation.marketPressure || 0) * 0.35 +
        (profit < 8 ? 18 : 0)
    ),
    0,
    95
  );
  const holdRisk =
    liquidationProbability >= 65 ? "HIGH" : liquidationProbability >= 38 ? "MEDIUM" : "LOW";

  return {
    velocityGrade,
    estimatedDaysToSale,
    liquidationProbability,
    holdRisk,
    adjustedVelocity
  };
}

function calculateResellerHeatScore({
  expectedProfit,
  sellThroughRate,
  velocityPrediction,
  profile,
  marketSaturation,
  confidenceScore,
  saturationPenalty
}) {
  const netProfit = Math.max(0, toNumber(expectedProfit?.netProfit, 0));
  const roiPct = Math.max(0, toNumber(expectedProfit?.roiPct, 0));
  const rarityLift = profile.rarityLevel === "strong" ? 14 : profile.rarityLevel === "candidate" ? 8 : 0;
  const sealedLift = profile.sealed && profile.collectibleDetected ? 4 : 0;
  const profitScore = clamp(netProfit * 2 + roiPct * 0.35, 0, 35);
  const velocityScore = clamp((velocityPrediction.adjustedVelocity || sellThroughRate) * 0.22, 0, 22);
  const confidenceComponent = clamp(confidenceScore * 0.22, 0, 22);
  const pressureDrag = clamp((marketSaturation.marketPressure || saturationPenalty) * 0.28, 0, 28);
  return clamp(Math.round(profitScore + velocityScore + confidenceComponent + rarityLift + sealedLift - pressureDrag), 0, 100);
}

function buildSourcingDecision({
  expectedProfit,
  cost,
  maxBuyPrice,
  confidenceScore,
  velocityScore,
  sellThroughRate,
  saturationPenalty,
  shippingBurdenScore,
  inventoryBurdenScore,
  riskScore,
  pricingConfidence,
  profile,
  soldStats,
  activeStats
}) {
  const netProfit = toNumber(expectedProfit?.netProfit, 0);
  const roiPct = toNumber(expectedProfit?.roiPct, 0);
  const trueRisk = clamp(
    Math.round(
      riskScore * 0.35 +
        saturationPenalty * 0.22 +
        shippingBurdenScore * 0.2 +
        inventoryBurdenScore * 0.12 +
        (confidenceScore < 50 ? 16 : 0)
    ),
    0,
    100
  );
  const profitableEnough = netProfit >= 12 && roiPct >= 35;
  const strongFlip = netProfit >= 20 && roiPct >= 55 && sellThroughRate >= 45;
  const overMaxBuy = cost > maxBuyPrice && maxBuyPrice > 0;
  const weakData = confidenceScore < 45 || pricingConfidence === "low";
  const riskLevel = weakData ? "Medium" : trueRisk >= 70 ? "High" : trueRisk >= 45 ? "Medium" : "Low";

  let buyDecision = "PASS";
  if (weakData) {
    buyDecision = "LOW_CONFIDENCE";
  } else if (!overMaxBuy && strongFlip && trueRisk < 62) {
    buyDecision = "BUY";
  } else if (!overMaxBuy && profitableEnough && velocityScore >= 50 && shippingBurdenScore < 58) {
    buyDecision = "BUY";
  }

  const rationale = [];
  if (buyDecision === "BUY") {
    rationale.push(`Net profit is about $${netProfit.toFixed(2)} after selling friction.`);
    rationale.push(`${Math.round(roiPct)}% ROI clears the sourcing threshold.`);
    if (sellThroughRate >= 55) rationale.push("Sell-through is strong enough for fast capital recycling.");
  } else if (buyDecision === "LOW_CONFIDENCE") {
    rationale.push("Data quality is too weak for a clean buy call.");
    if (!soldStats.hasSoldData) rationale.push("No sold comp anchor is available.");
    rationale.push("Manual eBay sold review recommended before purchasing.");
  } else {
    if (overMaxBuy) rationale.push(`Buy cost is above the $${maxBuyPrice} max-buy target.`);
    if (netProfit < 12) rationale.push("Net profit does not justify sourcing labor.");
    if (roiPct < 35) rationale.push("ROI is too thin after fees, shipping, and buyer behavior.");
    if (shippingBurdenScore >= 58) rationale.push("Shipping burden is too high for the expected margin.");
    if (saturationPenalty >= 55) rationale.push("Active market saturation creates stale inventory risk.");
  }
  if (profile.rarityLevel === "strong" && buyDecision !== "PASS") {
    rationale.push("Collector rarity signals may justify a longer hold time.");
  }
  if (activeStats.count >= 60) {
    rationale.push("Crowded active supply reduces urgency to buy.");
  }

  return {
    buyDecision,
    sourcingReason: rationale.join(" "),
    riskLevel,
    trueRiskScore: trueRisk
  };
}

function calculateResaleMetrics(input = {}, comps = null) {
  const analysis = input.analysisResult || {};
  const sourceCostProfiles = normalizeSourceCostProfiles(input);
  const costBasis = primaryCostBasis(input, sourceCostProfiles);
  const cost = costBasis ?? Math.max(0, toNumber(input.costOfGoods, 0));
  const category = normalizeCategory(input.categoryHint || analysis.category || analysis.categoryHint);
  const categoryMultiplier = CATEGORY_MULTIPLIERS[category] || CATEGORY_MULTIPLIERS.general;
  const conditionMultiplier = CONDITION_MULTIPLIERS[input.condition] || CONDITION_MULTIPLIERS.Used;
  const profile = detectCollectibleProfile(input, analysis, category);
  const demand = normalizeSignal(analysis.demand || analysis.demandLevel);
  const sellThroughSignal = normalizeSignal(analysis.sellThrough);
  const demandMultiplier =
    demand === "high" || sellThroughSignal === "fast"
      ? 1.06
      : demand === "low" || sellThroughSignal === "slow"
        ? 0.94
        : 1;
  const evidencePrice =
    toNumber(input.suggestedPrice, 0) ||
    toNumber(analysis.priceRange?.suggested, 0) ||
    toNumber(analysis.resaleSuggested, 0) ||
    0;
  const soldStats = summarizeSoldComps(comps || {});
  const sourceMatrixSoldAverage = averageEbaySoldPrice(comps || {});
  const activeStats = summarizeActiveComps(comps || {});
  const sellThrough = deriveSellThrough(comps || {}, analysis);
  const floorPrice = cost > 0 ? roundPrice(minimumPriceForTargetProfit(input)) : 0;
  const selectedPrice =
    soldDataPrice({ soldStats, activeStats, profile, sellThrough }) ||
    noSoldDataPrice({
      cost,
      evidencePrice,
      floorPrice,
      categoryMultiplier,
      conditionMultiplier,
      profile,
      demandMultiplier,
      activeStats
    });
  if (selectedPrice == null) {
    const sourceProfitMetrics = buildSourceProfitMetrics({
      sourceCostProfiles,
      averageSoldPrice: null
    });
    return {
      category,
      sourceCostProfiles,
      sourceProfitMetrics,
      marketComps: {
        averageResalePrice: undefined,
        recentSalesCount: soldStats.recentCount,
        staleComps: soldStats.staleCount > 0 && soldStats.recentCount === 0,
        priceVarianceHigh: false
      },
      averagePrice: null,
      estimatedProfit: null,
      confidenceScore: 0,
      compVolumeCount: soldStats.compVolumeCount,
      recommendation: "MANUAL_REVIEW",
      insightString: "No trustworthy sold comps available.",
      filteredOutlierCount: soldStats.filteredOutlierCount,
      validSoldCount: soldStats.validSoldCount,
      sellThroughRate: sellThrough.ratio == null ? null : clamp(Math.round(sellThrough.ratio * 100), 1, 100),
      buyDecision: "LOW_CONFIDENCE",
      sourcingReason: "No sold comp anchor is available.",
      riskLevel: "Unknown",
      velocityScore: sellThrough.ratio == null ? 0 : sellThrough.score,
      saturationPenalty: null,
      shippingBurdenScore: null,
      saturationLevel: "unknown",
      marketPressure: "unknown",
      pricingCompressionRisk: "unknown",
      operationalScore: null,
      laborRisk: "unknown",
      shippingRisk: "unknown",
      velocityGrade: "unknown",
      estimatedDaysToSale: null,
      holdRisk: "unknown",
      resellerHeatScore: null,
      sessionSourcingAnalytics: {
        totalProjectedProfit: null,
        averageROI: null,
        bestScan: {
          title: analysis.itemTitle || input.model || input.brand || "Scanned item",
          projectedProfit: null,
          resellerHeatScore: null
        },
        highestConfidenceFind: {
          title: analysis.itemTitle || input.model || input.brand || "Scanned item",
          confidenceScore: 0
        },
        totalScans: 1,
        buyPassRatio: "0:0"
      },
      debugReasoning: {
        priceSelectedBecause: "No sold comps found; resale, profit, and ROI are unavailable.",
        soldCompWeighting: "unavailable",
        activeListingDiscounting: calculateActiveListingDiscount({ soldStats, activeStats, selectedPrice: 0 }),
        confidenceReasoning: buildConfidenceReasoning({
          soldStats,
          activeStats,
          sellThrough,
          profile,
          profitConfidenceScore: 0
        }),
        buyPassRationale: "Manual sold-comp review required before buying."
      },
      recommendedPrice: null,
      floorPrice,
      selectedPrice: null,
      expectedProfit: {
        salePrice: null,
        costOfGoods: cost,
        netRevenue: null,
        netProfit: null,
        marginPct: null,
        roiPct: null,
        fees: {}
      },
      maxBuyPrice: null,
      profitSummary: {
        salePrice: null,
        netProfit: null,
        marginPct: null,
        roiPct: null,
        maxBuyPrice: null,
        targetMinProfit: 10,
        targetMinRoiPct: 50
      },
      platformBreakdown: [],
      bestMarketplace: null,
      comparisonPlatforms: [],
      marketSignals: {
        sourceProfitMetrics,
        collectibleDetected: profile.collectibleDetected,
        competitionLevel: activeStats.count > 0 ? "unknown" : "unavailable",
        sellSpeed: sellThrough.speed,
        pricingConfidence: "unavailable",
        buyRecommendation: "review",
        maxBuyPrice: null,
        recommendationReasons: ["Sold comps unavailable; pricing metrics withheld."],
        soldPriceRange: null,
        activeListingPressure: activeStats.count > 0 ? "pressure-only" : "unknown",
        profitConfidenceScore: 0,
        sourcingConfidenceScore: 0,
        estimatedTimeToSaleDays: null,
        rarityFlag:
          profile.rarityLevel === "strong"
            ? "collectible rarity candidate"
            : profile.collectibleDetected
              ? "collectible"
              : "",
        marketplaceDemand: [],
        competitionScore: null,
        velocityScore: sellThrough.ratio == null ? null : sellThrough.score,
        sellThroughRate: sellThrough.ratio == null ? null : clamp(Math.round(sellThrough.ratio * 100), 1, 100),
        riskScore: null,
        riskLevel: "Unknown",
        compWeighting: {
          soldComps: 0,
          activeListings: 0,
          aiVisualEstimate: 0,
          categoryHeuristic: 0
        },
        activeListingDiscount: calculateActiveListingDiscount({ soldStats, activeStats, selectedPrice: 0 }),
        activeListingCount: comps?.signals?.activeListingCount || activeStats.count || null,
        soldCount: comps?.signals?.soldCount || soldStats.count || null,
        validSoldCount: soldStats.validSoldCount,
        filteredOutlierCount: soldStats.filteredOutlierCount,
        compVolumeCount: soldStats.compVolumeCount,
        sellThroughRatio: comps?.signals?.sellThroughRatio || sellThrough.ratio || null,
        soldVelocity: comps?.signals?.soldVelocity || sellThrough.speed || "unknown",
        demandTrendWeight: comps?.signals?.trendWeight || "unknown",
        liveStatus: comps?.liveStatus || { active: "unavailable", sold: "unavailable" }
      },
      assumptions: {
        categoryMultiplier: null,
        conditionMultiplier: null,
        collectibleToyMultiplier: conditionPremium(profile),
        demandMultiplier: null,
        marketplace: "ebay",
        soldCompWeighting: "unavailable",
        activeListingWeighting: activeStats.midpoint ? "pressure-only" : "unavailable",
        confidenceCalibration: {
          soldCompCount: soldStats.count,
          recentSoldCount: soldStats.recentCount,
          staleSoldCount: soldStats.staleCount,
          soldConsistencyPct: Math.round(soldStats.consistency * 100),
          weakDataCapApplied: true,
          activeListingUse: activeStats.midpoint ? "pressure-only" : "unavailable"
        }
      }
    };
  }
  const recommendedPrice = selectedPrice;
  const sourceProfitMetrics = buildSourceProfitMetrics({
    sourceCostProfiles,
    averageSoldPrice: sourceMatrixSoldAverage
  });
  const hardenedProfit = hardenedNetProfit(selectedPrice, costBasis);
  const hardenedRoi = hardenedProfit != null && costBasis > 0 ? Number(((hardenedProfit / costBasis) * 100).toFixed(1)) : null;
  const expectedProfit = {
    ...computeResellerProfit({
    marketplace: "ebay",
    salePrice: selectedPrice,
    costOfGoods: cost,
    weightLb: input.weightLb || 1,
    category,
    profile
    }),
    netProfit: hardenedProfit,
    roiPct: hardenedRoi,
    costOfGoods: costBasis,
    netRevenue:
      hardenedProfit == null || costBasis == null ? null : roundSignedCurrency(hardenedProfit + costBasis)
  };
  const platformBreakdown = SUPPORTED_MARKETPLACES.map((marketplace) => ({
    ...marketplace,
    profit: computeResellerProfit({
      marketplace: marketplace.key,
      salePrice: selectedPrice,
      costOfGoods: cost,
      weightLb: input.weightLb || 1,
      category,
      profile
    })
  }));
  const bestMarketplace = platformBreakdown.reduce(
    (best, current) => (!best || current.profit.netProfit > best.profit.netProfit ? current : best),
    null
  );
  const targetMinProfit = 10;
  const targetMinRoiPct = 50;
  const maxBuyPrice = maximumBuyCostForTargets({
    marketplace: bestMarketplace?.key || "ebay",
    salePrice: selectedPrice,
    weightLb: input.weightLb || 1,
    minProfit: targetMinProfit,
    minRoiPct: targetMinRoiPct,
    category,
    profile
  });
  const analysisConfidence = toNumber(analysis.confidence, 0);
  const profitConfidenceScore = calculateConfidenceScore({
    analysisConfidence,
    soldStats,
    activeStats,
    sellThrough,
    profile,
    hasEvidencePrice: evidencePrice > 0
  });
  const pricingConfidence =
    profitConfidenceScore >= 82
      ? "high"
      : profitConfidenceScore >= 68
        ? "medium"
        : profitConfidenceScore >= 46
          ? "guarded"
          : "low";
  const activeListingPressure =
    comps?.signals?.saturation === "high"
      ? "crowded"
      : comps?.signals?.saturation === "low"
        ? "light"
        : activeStats.count >= 60
          ? "crowded"
          : activeStats.count > 0 && activeStats.count < 20
            ? "light"
            : "balanced";
  const competitionLevel =
    activeListingPressure === "crowded" ? "high" : activeListingPressure === "light" ? "low" : "medium";
  const competitionScore =
    activeListingPressure === "crowded" ? 78 : activeListingPressure === "light" ? 28 : 52;
  const velocityScore = sellThrough.score;
  const riskScore = clamp(
    Math.round((100 - profitConfidenceScore) * 0.45 + competitionScore * 0.25 + (velocityScore < 40 ? 18 : 0)),
    0,
    100
  );
  const sourcingConfidenceScore = clamp(
    Math.round(profitConfidenceScore * 0.6 + (100 - riskScore) * 0.25 + velocityScore * 0.15),
    0,
    100
  );
  const soldPriceRange = buildSoldPriceRange({ soldStats, selectedPrice, floorPrice });
  const activeListingDiscount = calculateActiveListingDiscount({ soldStats, activeStats, selectedPrice });
  const sellThroughRate = calculateSellThroughRate({ soldStats, activeStats, sellThrough, category, profile });
  const saturationPenalty = calculateSaturationPenalty({ activeStats, soldStats });
  const marketSaturation = detectMarketSaturation({ activeStats, soldStats, profile, sellThrough });
  const shippingBurdenScore = calculateShippingBurdenScore({
    expectedProfit,
    weightLb: input.weightLb || 1,
    selectedPrice,
    profile
  });
  const inventoryBurdenScore = calculateInventoryBurden({
    category,
    profile,
    weightLb: input.weightLb || 1,
    selectedPrice
  });
  const capitalEfficiencyScore = calculateCapitalEfficiency({
    expectedProfit,
    cost,
    sellThroughRate
  });
  const operationalAnalysis = calculateOperationalScore({
    expectedProfit,
    selectedPrice,
    weightLb: input.weightLb || 1,
    shippingBurdenScore,
    inventoryBurdenScore,
    sellThroughRate,
    capitalEfficiencyScore
  });
  const velocityPrediction = predictVelocity({
    sellThroughRate,
    marketSaturation,
    profile,
    category,
    expectedProfit
  });
  const resellerHeatScore = calculateResellerHeatScore({
    expectedProfit,
    sellThroughRate,
    velocityPrediction,
    profile,
    marketSaturation,
    confidenceScore: sourcingConfidenceScore,
    saturationPenalty
  });
  const estimatedTimeToSaleDays =
    velocityPrediction.estimatedDaysToSale ||
    (sellThrough.speed === "fast"
      ? 14
      : sellThrough.speed === "steady" || sellThrough.speed === "average"
        ? 30
        : sellThrough.speed === "slow"
          ? 60
          : null);
  const rarityFlag =
    profile.rarityLevel === "strong"
      ? "collectible rarity candidate"
      : profile.collectibleDetected
        ? "collectible"
        : "";
  const marketplaceDemand = SUPPORTED_MARKETPLACES.map((marketplace) => ({
    platform: marketplace.label,
    demand: MARKETPLACE_DEMAND_BIAS[category]?.[marketplace.key] || demand || "medium"
  }));
  const netProfit = expectedProfit.netProfit;
  const weakTrustedMatch =
    comps?.signals?.titleMatchConfidence != null && Number(comps.signals.titleMatchConfidence) < 0.6;
  const weakAcceptedTitleDistance =
    comps?.trustedCompSummary?.acceptedCompScoring?.titleSimilarityScore != null &&
    Number(comps.trustedCompSummary.acceptedCompScoring.titleSimilarityScore) < 0.35;
  const excessiveRejectedComps =
    Number(comps?.signals?.rejectedCompCount || 0) > Math.max(3, Number(comps?.signals?.acceptedCompCount || 0) * 2);
  const adjustedProfitConfidenceScore =
    weakTrustedMatch || weakAcceptedTitleDistance || excessiveRejectedComps
      ? Math.min(profitConfidenceScore, 40)
      : profitConfidenceScore;
  const buyRecommendation =
    cost > maxBuyPrice && maxBuyPrice > 0
      ? "pass"
      : pricingConfidence === "low" || weakTrustedMatch || weakAcceptedTitleDistance || excessiveRejectedComps
        ? "review"
        : activeListingPressure === "crowded" && sellThrough.speed === "slow"
          ? "pass"
          : netProfit >= 20 && expectedProfit.roiPct >= 60 && adjustedProfitConfidenceScore >= 55
            ? "buy"
            : netProfit >= 10 && expectedProfit.roiPct >= 35
              ? "maybe"
              : "pass";
  const sourcingDecision = buildSourcingDecision({
    expectedProfit,
    cost,
    maxBuyPrice,
    confidenceScore: sourcingConfidenceScore,
    velocityScore,
    sellThroughRate,
    saturationPenalty,
    shippingBurdenScore,
    inventoryBurdenScore,
    riskScore,
    pricingConfidence,
    profile,
    soldStats,
    activeStats
  });
  const recommendationReasons = [
    soldStats.hasSoldData
      ? `eBay sold comps anchor valuation at about $${soldStats.weightedMidpoint}`
      : "sold comps unavailable, so estimate is capped and should be manually checked",
    activeStats.midpoint ? `active listings are treated as market pressure, not primary value` : "",
    profile.collectibleDetected
      ? `${profile.franchise || "collectible"} signals detected${profile.sealed ? " with sealed-packaging premium" : ""}`
      : "",
    profile.rarityLevel === "strong"
      ? "rarity language found, but premium remains bounded unless sold comps support it"
      : "",
    `eBay fees, payment burden, and shipping are included before profit is shown`,
    `buyer negotiation, packaging, and handling friction are reserved before net profit`,
    sellThrough.ratio != null
      ? `sell-through ratio is ${sellThrough.ratio}, indicating ${sellThrough.speed} velocity`
      : `velocity remains ${sellThrough.speed} because live sell-through is limited`,
    profitConfidenceScore < 55 ? "manual verification recommended before buying" : "",
    bestMarketplace ? `${bestMarketplace.label} currently yields the highest estimated net profit` : "",
    cost > maxBuyPrice && maxBuyPrice > 0
      ? `entered cost exceeds the $${maxBuyPrice} max-buy threshold`
      : ""
  ].filter(Boolean);
  const confidenceReasoning = buildConfidenceReasoning({
    soldStats,
    activeStats,
    sellThrough,
    profile,
    profitConfidenceScore: adjustedProfitConfidenceScore
  });
  const comparisonPlatforms = ["ebay", "amazon", "walmart", "facebook"]
    .map((key) => platformBreakdown.find((item) => item.key === key))
    .filter(Boolean)
    .map((item) => ({
      key: item.key,
      label: item.label,
      netProfit: item.profit.netProfit,
      marginPct: item.profit.marginPct,
      roiPct: item.profit.roiPct,
      fees: item.profit.fees.totalFees,
      shipping: item.profit.fees.shippingCost,
      demand: MARKETPLACE_DEMAND_BIAS[category]?.[item.key] || demand || "medium"
    }));
  const recommendation = hardenedRecommendation({
    netProfit: expectedProfit.netProfit,
    costBasis,
    confidenceScore: adjustedProfitConfidenceScore,
    validSoldCount: soldStats.validSoldCount,
    sellThroughRate,
    saturationLevel: marketSaturation.saturationLevel,
    latestAgeDays: soldStats.latestAgeDays
  });
  const insightString = soldStats.hasSoldData
    ? `${soldStats.count} trustworthy sold comps after filtering; market value is $${selectedPrice}.`
    : "No trustworthy sold comps available.";

  return {
    category,
    sourceCostProfiles,
    sourceProfitMetrics,
    marketComps: {
      averageResalePrice: selectedPrice,
      recentSalesCount: soldStats.recentCount,
      staleComps: soldStats.staleCount > soldStats.recentCount,
      priceVarianceHigh: soldStats.consistency < 0.6
    },
    averagePrice: selectedPrice,
    estimatedProfit: expectedProfit.netProfit,
    confidenceScore: adjustedProfitConfidenceScore,
    compVolumeCount: soldStats.compVolumeCount,
    recommendation,
    insightString,
    filteredOutlierCount: soldStats.filteredOutlierCount,
    validSoldCount: soldStats.validSoldCount,
    sellThroughRate,
    buyDecision: sourcingDecision.buyDecision,
    sourcingReason: sourcingDecision.sourcingReason,
    riskLevel: sourcingDecision.riskLevel,
    velocityScore,
    saturationPenalty,
    shippingBurdenScore,
    saturationLevel: marketSaturation.saturationLevel,
    marketPressure: marketSaturation.marketPressure,
    pricingCompressionRisk: marketSaturation.pricingCompressionRisk,
    operationalScore: operationalAnalysis.operationalScore,
    laborRisk: operationalAnalysis.laborRisk,
    shippingRisk: operationalAnalysis.shippingRisk,
    velocityGrade: velocityPrediction.velocityGrade,
    estimatedDaysToSale: velocityPrediction.estimatedDaysToSale,
    holdRisk: velocityPrediction.holdRisk,
    resellerHeatScore,
    sessionSourcingAnalytics: {
      totalProjectedProfit:
        expectedProfit.netProfit == null ? null : Math.max(0, expectedProfit.netProfit),
      averageROI: expectedProfit.roiPct,
      bestScan: {
        title: analysis.itemTitle || input.model || input.brand || "Scanned item",
        projectedProfit: expectedProfit.netProfit,
        resellerHeatScore
      },
      highestConfidenceFind: {
        title: analysis.itemTitle || input.model || input.brand || "Scanned item",
        confidenceScore: sourcingConfidenceScore
      },
      totalScans: 1,
      buyPassRatio: sourcingDecision.buyDecision === "BUY" ? "1:0" : "0:1"
    },
    debugReasoning: {
      priceSelectedBecause: soldStats.hasSoldData
        ? "Recent and consistent sold comps are the valuation anchor"
        : activeStats.midpoint
          ? "No sold comps found; active listings were discounted and blended with guarded heuristics"
          : "No live comp anchor found; guarded retail-arbitrage heuristic is capped",
      soldCompWeighting: soldStats.hasSoldData ? "primary" : "unavailable",
      activeListingDiscounting: activeListingDiscount,
      marketSaturation,
      saturationPenalty,
      shippingBurdenScore,
      inventoryBurdenScore,
      operationalAnalysis,
      velocityPrediction,
      capitalEfficiencyScore,
      confidenceReasoning,
      buyPassRationale: sourcingDecision.sourcingReason
    },
    recommendedPrice,
    floorPrice,
    selectedPrice,
    expectedProfit,
    maxBuyPrice,
    profitSummary: {
      salePrice: selectedPrice,
      netProfit: expectedProfit.netProfit,
      marginPct: expectedProfit.marginPct,
      roiPct: expectedProfit.roiPct,
      maxBuyPrice,
      targetMinProfit,
      targetMinRoiPct
    },
    platformBreakdown,
    bestMarketplace,
    comparisonPlatforms,
    marketSignals: {
      sourceProfitMetrics,
      collectibleDetected: profile.collectibleDetected,
      competitionLevel,
      sellSpeed: sellThrough.speed,
      pricingConfidence,
      buyRecommendation,
      maxBuyPrice,
      recommendationReasons,
      soldPriceRange,
      activeListingPressure,
      profitConfidenceScore: adjustedProfitConfidenceScore,
      sourcingConfidenceScore,
      estimatedTimeToSaleDays,
      rarityFlag,
      marketplaceDemand,
      competitionScore,
      velocityScore,
      sellThroughRate,
      riskScore,
      riskLevel: sourcingDecision.riskLevel,
      saturationLevel: marketSaturation.saturationLevel,
      marketPressure: marketSaturation.marketPressure,
      pricingCompressionRisk: marketSaturation.pricingCompressionRisk,
      saturationPenalty,
      shippingBurdenScore,
      inventoryBurdenScore,
      capitalEfficiencyScore,
      operationalScore: operationalAnalysis.operationalScore,
      laborRisk: operationalAnalysis.laborRisk,
      shippingRisk: operationalAnalysis.shippingRisk,
      sizeBurden: operationalAnalysis.sizeBurden,
      breakEvenTimelineDays: operationalAnalysis.breakEvenTimelineDays,
      worthShipping: operationalAnalysis.worthShipping,
      worthStoring: operationalAnalysis.worthStoring,
      worthCapitalLockup: operationalAnalysis.worthCapitalLockup,
      velocityGrade: velocityPrediction.velocityGrade,
      estimatedDaysToSale: velocityPrediction.estimatedDaysToSale,
      liquidationProbability: velocityPrediction.liquidationProbability,
      holdRisk: velocityPrediction.holdRisk,
      resellerHeatScore,
      buyDecision: sourcingDecision.buyDecision,
      sourcingReason: sourcingDecision.sourcingReason,
      confidenceReasoning,
      pricingExplanation: recommendationReasons,
      compWeighting: {
        soldComps: soldStats.hasSoldData ? 0.82 : 0,
        activeListings: soldStats.hasSoldData ? 0.08 : activeStats.midpoint ? 0.25 : 0,
        aiVisualEstimate: soldStats.hasSoldData ? 0.05 : evidencePrice > 0 ? 0.35 : 0.2,
        categoryHeuristic: soldStats.hasSoldData ? 0.05 : 0.4
      },
      activeListingDiscount,
      resellerFriction: {
        realizedSalePrice: expectedProfit.realizedSalePrice,
        buyerDiscountPct: expectedProfit.buyerDiscountPct,
        packagingAndHandling: expectedProfit.fees.otherFees
      },
      activeListingCount: comps?.signals?.activeListingCount || activeStats.count || null,
      soldCount: comps?.signals?.soldCount || soldStats.count || null,
      validSoldCount: soldStats.validSoldCount,
      filteredOutlierCount: soldStats.filteredOutlierCount,
      compVolumeCount: soldStats.compVolumeCount,
      sellThroughRatio: comps?.signals?.sellThroughRatio || sellThrough.ratio || null,
      soldVelocity: comps?.signals?.soldVelocity || sellThrough.speed || "unknown",
      demandTrendWeight: comps?.signals?.trendWeight || "unknown",
      liveStatus: comps?.liveStatus || { active: "unavailable", sold: "unavailable" }
    },
    assumptions: {
      categoryMultiplier,
      conditionMultiplier,
      collectibleToyMultiplier: conditionPremium(profile),
      demandMultiplier,
      marketplace: "ebay",
      soldCompWeighting: soldStats.hasSoldData ? "primary" : "unavailable",
      activeListingWeighting: activeStats.midpoint ? "pressure-only" : "unavailable",
      confidenceCalibration: {
        soldCompCount: soldStats.count,
        recentSoldCount: soldStats.recentCount,
        staleSoldCount: soldStats.staleCount,
        soldConsistencyPct: Math.round(soldStats.consistency * 100),
        weakDataCapApplied: !soldStats.hasSoldData,
        activeListingUse: activeListingDiscount.activeListingUse,
        sellThroughRate,
        saturationPenalty,
        shippingBurdenScore,
        capitalEfficiencyScore,
        marketPressure: marketSaturation.marketPressure,
        resellerHeatScore
      }
    }
  };
}

function getPricingRecommendation(input = {}, comps = null) {
  return calculateResaleMetrics(input, comps);
}

module.exports = { getPricingRecommendation, calculateResaleMetrics };
