import type { InventoryRecord, ScanRecord, AnalyticsSnapshot } from "./schemas";

function confidence(scan: ScanRecord) {
  return Math.max(0, Math.min(100, Math.round(Number(scan.listing.confidenceScore) || 0)));
}

function roi(scan: ScanRecord) {
  return Number(scan.listing.sourcingAnalytics?.roiPercentage) || 0;
}

export function buildAnalyticsSnapshot({
  scans,
  inventory
}: {
  scans: ScanRecord[];
  inventory: InventoryRecord[];
}): AnalyticsSnapshot {
  const totalEstimatedProfit = scans.reduce(
    (sum, scan) => sum + (Number(scan.listing.profitPotential) || 0),
    0
  );
  const roiValues = scans.map(roi).filter((value) => value > 0);
  const highestProfitItem = scans.reduce<ScanRecord | null>(
    (best, scan) =>
      !best || Number(scan.listing.profitPotential) > Number(best.listing.profitPotential)
        ? scan
        : best,
    null
  );
  const lowestConfidenceItem = scans.reduce<ScanRecord | null>(
    (lowest, scan) => (!lowest || confidence(scan) < confidence(lowest) ? scan : lowest),
    null
  );
  const activeInventory = inventory.filter((item) => item.status !== "Sold");
  const soldInventory = inventory.filter((item) => item.status === "Sold");
  const soldProfit = soldInventory.reduce(
    (sum, item) => sum + (Number(item.soldPrice) - Number(item.purchasePrice)),
    0
  );
  const soldCost = soldInventory.reduce((sum, item) => sum + Number(item.purchasePrice), 0);

  return {
    generatedAt: new Date().toISOString(),
    totalScans: scans.length,
    totalEstimatedProfit,
    averageRoi: roiValues.length
      ? roiValues.reduce((sum, value) => sum + value, 0) / roiValues.length
      : 0,
    estimatedInventoryValue: activeInventory.reduce(
      (sum, item) => sum + (Number(item.listing.averageSalePrice) || 0),
      0
    ),
    runningInventoryProfit: activeInventory.reduce(
      (sum, item) => sum + (Number(item.listing.profitPotential) || 0),
      0
    ),
    soldProfit,
    soldRoi: soldCost > 0 ? (soldProfit / soldCost) * 100 : 0,
    highestProfitTitle: highestProfitItem?.listing.itemTitle || "",
    lowestConfidenceTitle: lowestConfidenceItem?.listing.itemTitle || ""
  };
}
