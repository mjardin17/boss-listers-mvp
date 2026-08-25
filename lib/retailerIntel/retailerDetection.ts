import { RETAILER_PROFILES, type RetailerId } from "./retailerProfiles";

const ALIASES: Record<RetailerId, RegExp[]> = {
  walmart: [/walmart/i],
  target: [/target/i],
  dollar_tree: [/dollar\s*tree|DOLLAR_TREE/i],
  tjmaxx: [/tj\s*maxx|t\.j\.\s*maxx/i],
  marshalls: [/marshalls/i],
  ross: [/\bross\b/i],
  walgreens: [/walgreens/i],
  cvs: [/\bcvs\b/i],
  best_buy: [/best\s*buy/i],
  home_depot: [/home\s*depot/i]
};

export function detectRetailer(input: any = {}) {
  const text = `${input.sourceStoreType || ""} ${input.lookupSource || ""} ${input.sourceStore || ""} ${input.storeName || ""} ${input.title || ""}`;
  const found = (Object.keys(ALIASES) as RetailerId[]).find((id) => ALIASES[id].some((pattern) => pattern.test(text)));
  return found ? RETAILER_PROFILES[found] : null;
}
