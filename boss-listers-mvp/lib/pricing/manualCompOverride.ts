export type ManualCompOverrideInput = {
  soldCompPrice?: number | string | null;
  costPaid?: number | string | null;
  shippingEstimate?: number | string | null;
  packagingCost?: number | string | null;
};

export type ManualCompOverrideResult = {
  resalePrice: number;
  costPaid: number | null;
  shippingEstimate: number;
  packagingCost: number;
  netProfit: number | null;
  roi: number | null;
  source: "manual_sold_comp";
};

const MARKETPLACE_FEE_RATE = 0.13;
const TRANSACTION_FEE = 0;
const DEFAULT_SHIPPING_ESTIMATE = 5.75;

function moneyOrNull(value: number | string | null | undefined) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : null;
}

export function calculateManualCompOverride(input: ManualCompOverrideInput): ManualCompOverrideResult | null {
  const resalePrice = moneyOrNull(input.soldCompPrice);
  if (resalePrice == null) return null;

  const costPaid = moneyOrNull(input.costPaid);
  const shippingEstimate = moneyOrNull(input.shippingEstimate) ?? DEFAULT_SHIPPING_ESTIMATE;
  const packagingCost = moneyOrNull(input.packagingCost) ?? 0;
  const marketplaceFees = resalePrice * MARKETPLACE_FEE_RATE + TRANSACTION_FEE;
  const costForCalculation = costPaid;
  const netProfit =
    costForCalculation == null
      ? null
      : Number((resalePrice - marketplaceFees - shippingEstimate - packagingCost - costForCalculation).toFixed(2));
  const roi =
    netProfit != null && costForCalculation != null && costForCalculation > 0
      ? Number(((netProfit / costForCalculation) * 100).toFixed(1))
      : null;

  return {
    resalePrice,
    costPaid,
    shippingEstimate,
    packagingCost,
    netProfit,
    roi,
    source: "manual_sold_comp"
  };
}
