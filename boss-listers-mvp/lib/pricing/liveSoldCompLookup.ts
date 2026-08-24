export type VerifiedSoldCompPrice = {
  resalePrice: number;
  soldCount: number;
  source: "verified_sold_comps";
};

function positiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : null;
}

export function extractVerifiedSoldCompPrice({
  trustedCompSummary,
  pricing,
  comps
}: {
  trustedCompSummary?: any;
  pricing?: any;
  comps?: any;
}): VerifiedSoldCompPrice | null {
  const soldCount =
    Number(trustedCompSummary?.soldCount) ||
    Number(trustedCompSummary?.validSoldCount) ||
    Number(pricing?.validSoldCount) ||
    Number(pricing?.marketSignals?.validSoldCount) ||
    Number(comps?.signals?.soldCount) ||
    Number(comps?.sold?.count) ||
    0;
  const resalePrice = positiveNumber(
    trustedCompSummary?.averageSoldPrice ??
      pricing?.averagePrice ??
      pricing?.selectedPrice ??
      pricing?.marketSignals?.soldPriceRange?.midpoint
  );

  if (!resalePrice || soldCount <= 0) return null;
  return {
    resalePrice,
    soldCount,
    source: "verified_sold_comps"
  };
}
