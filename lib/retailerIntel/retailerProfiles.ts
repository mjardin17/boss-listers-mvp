export type RetailerId =
  | "walmart"
  | "target"
  | "dollar_tree"
  | "tjmaxx"
  | "marshalls"
  | "ross"
  | "walgreens"
  | "cvs"
  | "best_buy"
  | "home_depot";

export type RetailerProfile = {
  id: RetailerId;
  name: string;
  clearanceVolatility: "LOW" | "MEDIUM" | "HIGH";
  collectibleFrequency: "LOW" | "MEDIUM" | "HIGH";
  averageRoiProfile: "LOW" | "MODERATE" | "SPIKY";
  markdownBehavior: string;
  regionalInconsistency: "LOW" | "MEDIUM" | "HIGH";
  bundleLikelihood: "LOW" | "MEDIUM" | "HIGH";
  categoryStrengths: string[];
};

export const RETAILER_PROFILES: Record<RetailerId, RetailerProfile> = {
  walmart: { id: "walmart", name: "Walmart", clearanceVolatility: "HIGH", collectibleFrequency: "MEDIUM", averageRoiProfile: "SPIKY", markdownBehavior: "Clearance varies by store and department.", regionalInconsistency: "HIGH", bundleLikelihood: "MEDIUM", categoryStrengths: ["toys", "electronics", "beauty", "grocery"] },
  target: { id: "target", name: "Target", clearanceVolatility: "MEDIUM", collectibleFrequency: "MEDIUM", averageRoiProfile: "MODERATE", markdownBehavior: "Predictable seasonal markdown cycles.", regionalInconsistency: "MEDIUM", bundleLikelihood: "LOW", categoryStrengths: ["toys", "beauty", "home"] },
  dollar_tree: { id: "dollar_tree", name: "Dollar Tree", clearanceVolatility: "LOW", collectibleFrequency: "LOW", averageRoiProfile: "LOW", markdownBehavior: "Low fixed entry cost; shipping often blocks profit.", regionalInconsistency: "MEDIUM", bundleLikelihood: "HIGH", categoryStrengths: ["party", "seasonal", "crafts"] },
  tjmaxx: { id: "tjmaxx", name: "TJ Maxx", clearanceVolatility: "HIGH", collectibleFrequency: "LOW", averageRoiProfile: "SPIKY", markdownBehavior: "Opportunistic closeout pricing.", regionalInconsistency: "HIGH", bundleLikelihood: "LOW", categoryStrengths: ["beauty", "home", "apparel"] },
  marshalls: { id: "marshalls", name: "Marshalls", clearanceVolatility: "HIGH", collectibleFrequency: "LOW", averageRoiProfile: "SPIKY", markdownBehavior: "Closeout apparel and beauty cycles.", regionalInconsistency: "HIGH", bundleLikelihood: "LOW", categoryStrengths: ["apparel", "beauty", "footwear"] },
  ross: { id: "ross", name: "Ross", clearanceVolatility: "HIGH", collectibleFrequency: "LOW", averageRoiProfile: "SPIKY", markdownBehavior: "Store-specific markdowns and closeouts.", regionalInconsistency: "HIGH", bundleLikelihood: "LOW", categoryStrengths: ["apparel", "footwear", "home"] },
  walgreens: { id: "walgreens", name: "Walgreens", clearanceVolatility: "MEDIUM", collectibleFrequency: "LOW", averageRoiProfile: "MODERATE", markdownBehavior: "Seasonal clearance and localized markdowns.", regionalInconsistency: "MEDIUM", bundleLikelihood: "MEDIUM", categoryStrengths: ["beauty", "seasonal", "health"] },
  cvs: { id: "cvs", name: "CVS", clearanceVolatility: "MEDIUM", collectibleFrequency: "LOW", averageRoiProfile: "MODERATE", markdownBehavior: "Coupon and clearance stacking matters.", regionalInconsistency: "MEDIUM", bundleLikelihood: "MEDIUM", categoryStrengths: ["beauty", "health", "seasonal"] },
  best_buy: { id: "best_buy", name: "Best Buy", clearanceVolatility: "MEDIUM", collectibleFrequency: "LOW", averageRoiProfile: "MODERATE", markdownBehavior: "Open-box and clearance need model precision.", regionalInconsistency: "LOW", bundleLikelihood: "LOW", categoryStrengths: ["electronics", "media", "gaming"] },
  home_depot: { id: "home_depot", name: "Home Depot", clearanceVolatility: "HIGH", collectibleFrequency: "LOW", averageRoiProfile: "SPIKY", markdownBehavior: "Penny/clearance behavior can be local.", regionalInconsistency: "HIGH", bundleLikelihood: "LOW", categoryStrengths: ["tools", "home", "auto_parts"] }
};
