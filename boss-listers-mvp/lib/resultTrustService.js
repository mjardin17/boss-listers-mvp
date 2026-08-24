function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getRoi(listing = {}) {
  const value = listing.roiPercentage ?? listing.sourcingAnalytics?.roiPercentage;
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getDemandScore(listing = {}) {
  if (listing.demandScore != null) return Math.max(0, Math.min(100, number(listing.demandScore, 0)));
  const demand = String(listing.demandLevel || "").toLowerCase();
  if (demand === "high") return 82;
  if (demand === "medium") return 58;
  if (demand === "low") return 28;
  return 40;
}

function getSellThroughNumber(listing = {}) {
  const raw = String(listing.sellThroughRate || listing.sellThrough || "");
  const percent = raw.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percent) return number(percent[1], 0);
  const ratio = number(listing.sellThroughRatio, 0);
  return ratio > 0 && ratio <= 1 ? ratio * 100 : ratio;
}

function comparableSalesCount(listing = {}) {
  if (Array.isArray(listing.comps)) return listing.comps.length;
  return number(listing.soldCount ?? listing.sourcingAnalytics?.estimatedMonthlySales, 0);
}

export function getSalesVelocitySignal(listing = {}) {
  const trustedVelocity = String(listing.trustedCompSummary?.velocityScore || "").toUpperCase();
  if (trustedVelocity) {
    const color =
      trustedVelocity === "FAST" || trustedVelocity === "HEALTHY"
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
        : trustedVelocity === "MODERATE"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
          : "border-rose-500/30 bg-rose-500/10 text-rose-300";
    return {
      label: trustedVelocity,
      color,
      explanation:
        trustedVelocity === "DEAD"
          ? "No trusted sold activity detected"
          : "Velocity comes from trusted sold comps and active listing pressure"
    };
  }
  const sellThrough = getSellThroughNumber(listing);
  const demandScore = getDemandScore(listing);
  const comps = comparableSalesCount(listing);

  if (comps <= 0 && sellThrough <= 0 && listing.marketDataUnavailable) {
    return {
      label: "DEAD",
      color: "border-rose-500/30 bg-rose-500/10 text-rose-300",
      explanation: "No trustworthy sold activity detected"
    };
  }
  if (sellThrough >= 70 || (demandScore >= 75 && comps >= 3)) {
    return {
      label: "FAST",
      color: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
      explanation: "Recent comparable activity detected"
    };
  }
  if (sellThrough >= 42 || demandScore >= 55 || comps >= 2) {
    return {
      label: "HEALTHY",
      color: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      explanation: "Stable resale demand signal"
    };
  }
  if (sellThrough >= 20 || demandScore >= 35) {
    return {
      label: "MODERATE",
      color: "border-orange-500/30 bg-orange-500/10 text-orange-300",
      explanation: "May sell, but expect a longer hold"
    };
  }
  return {
    label: "SLOW",
    color: "border-rose-500/30 bg-rose-500/10 text-rose-300",
    explanation: "Weak demand signal"
  };
}

export function getDecisionEngine(listing = {}) {
  const explicit = String(listing.recommendation || "").toUpperCase();
  const roi = getRoi(listing);
  const profit = number(listing.estimatedProfit ?? listing.profitPotential, 0);
  const demandScore = getDemandScore(listing);
  const demandLevel = String(listing.demandLevel || "").toLowerCase();
  const confidence = Math.max(0, Math.min(100, Math.round(number(listing.confidenceScore, 0))));
  const missingMarketData = Boolean(listing.marketDataUnavailable);
  const trustedSummary = listing.trustedCompSummary || {};
  const trustedSoldCount = number(trustedSummary.soldCount, 0);
  const weakTrustedOverlap =
    trustedSummary.identityConfidence?.titleTokenSimilarity != null &&
    number(trustedSummary.identityConfidence.titleTokenSimilarity, 0) < 0.6;
  const excessiveRejectedComps =
    number(trustedSummary.rejectedComps, 0) > Math.max(3, number(trustedSummary.acceptedComps, 0) * 2);
  const volatilePricing = String(listing.sourcingAnalytics?.riskLevel?.label || "")
    .toLowerCase()
    .includes("high");
  const restricted = Array.isArray(listing.marketplaceEligibility?.platforms)
    ? listing.marketplaceEligibility.platforms.some((platform) =>
        ["restricted", "prohibited"].includes(String(platform.status || "").toLowerCase())
      )
    : false;

  let recommendation = ["BUY", "MARGINAL", "HOLD", "PASS", "SKIP"].includes(explicit)
    ? explicit === "SKIP" ? "SKIP" : explicit
    : "HOLD";
  let riskLevel = "Medium";
  let explanation = "Margins require manual verification";
  let badgeColor = "border-amber-500/30 bg-amber-500/10 text-amber-300";

  if (trustedSoldCount <= 0 || weakTrustedOverlap || excessiveRejectedComps) {
    recommendation = "MANUAL_REVIEW";
    riskLevel = "High";
    explanation = "Trusted market evidence is incomplete";
    badgeColor = "border-sky-400/30 bg-sky-500/10 text-sky-200";
  } else if (profit <= 0 || (roi != null && roi < 10) || demandScore < 30 || demandLevel === "low" || restricted) {
    recommendation = "SKIP";
    riskLevel = "High";
    explanation = "Low resale confidence";
    badgeColor = "border-rose-500/30 bg-rose-500/10 text-rose-300";
  } else if (confidence < 45) {
    recommendation = "MARGINAL";
    riskLevel = "High";
    explanation = "Margins require manual verification";
    badgeColor = "border-amber-500/30 bg-amber-500/10 text-amber-300";
  } else if (volatilePricing || missingMarketData) {
    recommendation = recommendation === "PASS" || recommendation === "SKIP" ? "SKIP" : "MARGINAL";
    riskLevel = "Medium";
    explanation = missingMarketData ? "Market confidence limited" : "Margins require manual verification";
    badgeColor = "border-amber-500/30 bg-amber-500/10 text-amber-300";
  } else if ((demandLevel === "high" && profit >= 10) || (profit >= 12 && demandScore >= 50 && confidence >= 50)) {
    recommendation = recommendation === "PASS" || recommendation === "SKIP" ? "HOLD" : "BUY";
    riskLevel = "Low";
    explanation = "Strong resale opportunity";
    badgeColor = "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }

  return {
    recommendation,
    confidence,
    riskLevel,
    explanation,
    badgeColor
  };
}

export function getResultTrustSignals(listing = {}) {
  const confidence = Math.max(0, Math.min(100, Math.round(Number(listing.confidenceScore) || 0)));
  const weakTitle = /^(scanned item|unknown|item)$/i.test(String(listing.itemTitle || "").trim());
  const missingMarketData = Boolean(listing.marketDataUnavailable);
  const missingPrice = Number(listing.averageSalePrice) <= 0;
  const missingProfit = !Number.isFinite(Number(listing.profitPotential));
  const warnings = [];
  const intelligence = [];

  if (confidence < 50) warnings.push("Low confidence result. Manual verification recommended.");
  if (weakTitle) warnings.push("Product title is weak. Retake a sharper label or barcode photo.");
  if (missingMarketData) warnings.push("Market data unavailable. Check sold comps before buying.");
  if (missingPrice || missingProfit) warnings.push("Pricing data is incomplete.");
  if (listing.upc) intelligence.push("Barcode match improved identity confidence");
  if (confidence >= 75) intelligence.push("High confidence match");
  if (!missingMarketData && comparableSalesCount(listing) >= 2) {
    intelligence.push("Strong resale consistency");
  }
  if (getSalesVelocitySignal(listing).label === "FAST") {
    intelligence.push("Strong sold velocity detected");
  }

  return {
    confidence,
    isLowConfidence: confidence < 50,
    isWeakResult: weakTitle || missingMarketData || confidence < 50 || missingPrice || missingProfit,
    warnings,
    intelligence
  };
}
