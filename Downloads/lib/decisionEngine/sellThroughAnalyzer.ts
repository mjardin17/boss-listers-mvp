export function analyzeSellThrough({ soldCount = 0, activeCount = 0 }: { soldCount?: number; activeCount?: number }) {
  const sold = Math.max(0, Number(soldCount) || 0);
  const active = Math.max(0, Number(activeCount) || 0);
  const ratio = active > 0 ? sold / active : sold > 0 ? 1 : 0;
  return {
    sellThroughRatio: Number(ratio.toFixed(3)),
    competitionLevel: active >= sold * 5 && active >= 10 ? "HIGH" : active > sold * 2 ? "MEDIUM" : "LOW"
  };
}
