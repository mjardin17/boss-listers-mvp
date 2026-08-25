import type { CrossListPlatform } from "../crossListEngine/types";

export interface ProfitLedgerEntry {
  platform: CrossListPlatform | "all";
  estimatedProfit: number | null;
  realizedProfit: number | null;
  fees: number | null;
  shippingCosts: number | null;
  roi: number | null;
}

export function buildProfitLedger(entries: ProfitLedgerEntry[]) {
  const realized = entries.reduce((sum, entry) => sum + (entry.realizedProfit || 0), 0);
  const estimated = entries.reduce((sum, entry) => sum + (entry.estimatedProfit || 0), 0);
  return {
    entries,
    totals: {
      estimatedProfit: Number(estimated.toFixed(2)),
      realizedProfit: Number(realized.toFixed(2)),
      openEstimatedProfit: Number((estimated - realized).toFixed(2))
    }
  };
}
