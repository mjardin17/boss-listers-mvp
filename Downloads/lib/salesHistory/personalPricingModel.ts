import type { PersonalSaleMatch } from "./salesHistoryTypes";

const MARKETPLACE_FEE_RATE = 0.13;
const TRANSACTION_FEE = 0;
const DEFAULT_SHIPPING = 5.75;

export function calculatePersonalSalePricing(match: PersonalSaleMatch | null, costBasis: number | null = null) {
  if (!match?.sale?.soldPrice) return null;
  const shipping = match.sale.shippingCharged ?? DEFAULT_SHIPPING;
  const fees = match.sale.soldPrice * MARKETPLACE_FEE_RATE + TRANSACTION_FEE;
  const cost = costBasis ?? match.sale.cost;
  const costForCalculation = cost;
  const netProfit =
    costForCalculation == null
      ? null
      : Number((match.sale.soldPrice - fees - shipping - costForCalculation).toFixed(2));
  const roi =
    netProfit != null && costForCalculation != null && costForCalculation > 0
      ? Number(((netProfit / costForCalculation) * 100).toFixed(1))
      : null;
  return {
    resalePrice: match.sale.soldPrice,
    soldDate: match.sale.soldDate,
    platform: match.sale.platform,
    shippingEstimate: shipping,
    costPaid: cost,
    netProfit,
    roi,
    confidenceBoost: match.confidenceBoost,
    matchReason: match.matchReason,
    source: "USER_VERIFIED_SALE" as const
  };
}
