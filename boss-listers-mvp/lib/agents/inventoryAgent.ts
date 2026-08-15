export function runInventoryAgent({ analysis = {} }: any = {}) {
  const item = (analysis.inventoryOS as any)?.item || {};
  const healthScore = Number((analysis.inventoryOS as any)?.health?.healthScore ?? item.inventoryHealthScore ?? 0);
  const staleRisk = String((analysis.resellerEngineTelemetry as any)?.staleInventoryRisk || "UNKNOWN");
  const markdownRecommended = healthScore > 0 && healthScore < 45;
  return {
    agent: "inventory",
    score: healthScore,
    staleRisk,
    markdownRecommended,
    relistTiming: staleRisk === "EXTREME" ? "RELIST_OR_REPRICE_NOW" : staleRisk === "HIGH" ? "REVIEW_THIS_WEEK" : "HOLD_CURRENT_STRATEGY",
    reasons: [`Inventory health score: ${healthScore}`, `Stale inventory risk: ${staleRisk}`],
    events: staleRisk === "HIGH" || staleRisk === "EXTREME"
      ? [{ type: "stale_inventory", severity: "medium", message: "Inventory may need relist or markdown review." }]
      : []
  };
}
