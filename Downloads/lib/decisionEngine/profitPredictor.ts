export function predictProfit({ salePrice, costBasis, netProfit }: { salePrice?: unknown; costBasis?: unknown; netProfit?: unknown }) {
  const directProfit = Number(netProfit);
  if (Number.isFinite(directProfit)) {
    const cost = Number(costBasis);
    return {
      estimatedNetProfit: Number(directProfit.toFixed(2)),
      estimatedROI: Number.isFinite(cost) && cost > 0 ? Number(((directProfit / cost) * 100).toFixed(1)) : null
    };
  }

  const sale = Number(salePrice);
  const cost = Number(costBasis);
  if (!Number.isFinite(sale) || sale <= 0 || !Number.isFinite(cost) || cost < 0) {
    return { estimatedNetProfit: null, estimatedROI: null };
  }

  const fees = sale * 0.1325 + 0.3;
  const shipping = 5.75;
  const profit = sale - fees - shipping - cost;
  return {
    estimatedNetProfit: Number(profit.toFixed(2)),
    estimatedROI: cost > 0 ? Number(((profit / cost) * 100).toFixed(1)) : null
  };
}
