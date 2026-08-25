import type { NormalizedMarketFacts } from "./types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function listingCompetitionDensity(facts: NormalizedMarketFacts) {
  const active = Math.max(0, facts.activeListingCount || facts.activeCount || 0);
  const sold = Math.max(0, facts.soldListingCount || facts.trustedSoldCount || 0);
  if (!active && !sold) return 0;
  return Number((active / Math.max(1, sold)).toFixed(2));
}

export function saturationSeverity(facts: NormalizedMarketFacts) {
  const ratio = facts.saturationRatio ?? listingCompetitionDensity(facts);
  const lowTicketPenalty = facts.averageSoldPrice != null && facts.averageSoldPrice < 20 ? 12 : 0;
  const consumablePenalty = facts.isConsumable ? 12 : 0;
  const activePenalty = facts.activeListingCount >= 150 ? 18 : facts.activeListingCount >= 75 ? 10 : 0;
  return Math.round(clamp(ratio * 10 + lowTicketPenalty + consumablePenalty + activePenalty, 0, 100));
}

export function staleInventoryProbability(facts: NormalizedMarketFacts, severity: number) {
  const staleCompPenalty = clamp(facts.staleCompRatio * 35, 0, 35);
  const agePenalty =
    facts.latestCompAgeDays == null ? 10 : facts.latestCompAgeDays > 180 ? 28 : facts.latestCompAgeDays > 90 ? 16 : 0;
  const velocityPenalty = facts.sellThroughRatio != null && facts.sellThroughRatio < 0.08 ? 20 : 0;
  return Math.round(clamp(severity * 0.45 + staleCompPenalty + agePenalty + velocityPenalty, 0, 99));
}
