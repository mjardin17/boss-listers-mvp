import type { DealDecision, DealInput, DealMetrics, SoldCompData } from "../types/deal";

export const MARKETPLACE_FEE_RATE = 0.13;
export const MINIMUM_BUY_ROI = 50;
export const MINIMUM_BUY_PROFIT = 10;

export const SAMPLE_SOLD_COMP_DATA: SoldCompData = {
  averageSoldPrice: 34.99,
  sellThroughRate: 78,
  sampleSales: 12
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundPercent(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function calculateMarketplaceFee(soldPrice: number): number {
  return roundMoney(soldPrice * MARKETPLACE_FEE_RATE);
}

export function calculateDealMetrics(input: DealInput, comps: SoldCompData = SAMPLE_SOLD_COMP_DATA): DealMetrics {
  const soldPrice = roundMoney(comps.averageSoldPrice);
  const buyCost = roundMoney(input.buyCost);
  const shippingCost = roundMoney(input.shippingEstimate);
  const marketplaceFee = calculateMarketplaceFee(soldPrice);
  const profit = roundMoney(soldPrice - marketplaceFee - shippingCost - buyCost);
  const margin = soldPrice > 0 ? roundPercent((profit / soldPrice) * 100) : 0;
  const roi = buyCost > 0 ? roundPercent((profit / buyCost) * 100) : 0;
  const decision: DealDecision = roi >= MINIMUM_BUY_ROI && profit >= MINIMUM_BUY_PROFIT ? "BUY" : "SKIP";

  return {
    soldPrice,
    marketplaceFee,
    shippingCost,
    buyCost,
    profit,
    margin,
    roi,
    decision
  };
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
