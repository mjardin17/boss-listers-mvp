import type { LiquidityTier, NormalizedMarketFacts, ResellerRecommendation } from "../types";

type ExpectedFixtureOutcome = {
  recommendation: ResellerRecommendation;
  confidenceMin: number;
  confidenceMax: number;
  liquidityTier: LiquidityTier;
  marketSaturation: "LOW" | "MEDIUM" | "HIGH" | "EXTREME" | "UNKNOWN";
  painMin?: number;
  warningIncludes?: string;
};

export type ResellerEngineFixture = {
  id: string;
  label: string;
  facts: NormalizedMarketFacts;
  expected: ExpectedFixtureOutcome;
};

const baseFacts: NormalizedMarketFacts = {
  title: "",
  brand: "",
  category: "",
  upc: "",
  sourceStoreType: "",
  costBasis: null,
  averageSoldPrice: null,
  netProfit: null,
  roi: null,
  trustedSoldCount: 0,
  soldCount90d: 0,
  activeCount: 0,
  activeListingCount: 0,
  soldListingCount: 0,
  sellThroughRate: null,
  sellThroughRatio: null,
  saturationRatio: null,
  confidenceScore: 0,
  titleMatchScore: 0,
  visualMatchScore: 0,
  compRejectionRate: 0,
  shippingOverhead: 5.75,
  estimatedWeightClass: "STANDARD",
  shippingComplexity: "LOW",
  fragileRisk: false,
  returnRisk: false,
  incompleteListingRisk: false,
  oversizedPenalty: 0,
  isBundleDependent: false,
  isMultipack: false,
  bulkCompDetected: false,
  isConsumable: false,
  isCollectible: false,
  raritySignal: false,
  latestCompAgeDays: null,
  staleCompRatio: 0
};

export const resellerFieldFixtures: ResellerEngineFixture[] = [
  {
    id: "walmart-clearance-fast-flip",
    label: "Walmart clearance fast flip",
    facts: {
      ...baseFacts,
      title: "Clearance toy with verified recent sell-through",
      brand: "Mattel",
      category: "toys",
      sourceStoreType: "WALMART",
      costBasis: 8,
      averageSoldPrice: 32,
      netProfit: 13.71,
      roi: 171,
      trustedSoldCount: 10,
      soldCount90d: 8,
      activeCount: 8,
      activeListingCount: 8,
      soldListingCount: 10,
      sellThroughRate: 0.75,
      sellThroughRatio: 0.75,
      saturationRatio: 0.8,
      confidenceScore: 86,
      titleMatchScore: 0.76,
      visualMatchScore: 0.72
    },
    expected: {
      recommendation: "BUY",
      confidenceMin: 82,
      confidenceMax: 95,
      liquidityTier: "FAST",
      marketSaturation: "LOW",
      painMin: 0
    }
  },
  {
    id: "walmart-clearance-watch",
    label: "Walmart clearance moderate hold",
    facts: {
      ...baseFacts,
      title: "Clearance board game with moderate comps",
      brand: "Hasbro",
      category: "toys game",
      sourceStoreType: "WALMART",
      costBasis: 9,
      averageSoldPrice: 29,
      netProfit: 10.11,
      roi: 112,
      trustedSoldCount: 5,
      soldCount90d: 3,
      activeCount: 23,
      activeListingCount: 23,
      soldListingCount: 5,
      sellThroughRate: 0.22,
      sellThroughRatio: 0.22,
      saturationRatio: 4.6,
      confidenceScore: 72,
      titleMatchScore: 0.62,
      visualMatchScore: 0.6
    },
    expected: {
      recommendation: "HOLD",
      confidenceMin: 55,
      confidenceMax: 78,
      liquidityTier: "MODERATE",
      marketSaturation: "HIGH",
      painMin: 25
    }
  },
  {
    id: "low-value-consumable",
    label: "Dollar Tree low-value consumable",
    facts: {
      ...baseFacts,
      title: "Dollar Tree snack box single item",
      category: "grocery snack",
      sourceStoreType: "DOLLAR_TREE",
      costBasis: 1.25,
      averageSoldPrice: 12,
      netProfit: 0.36,
      roi: 28,
      trustedSoldCount: 2,
      activeCount: 60,
      activeListingCount: 60,
      soldListingCount: 2,
      sellThroughRate: 0.03,
      sellThroughRatio: 0.03,
      saturationRatio: 30,
      confidenceScore: 54,
      titleMatchScore: 0.46,
      visualMatchScore: 0.42,
      isConsumable: true
    },
    expected: {
      recommendation: "SKIP",
      confidenceMin: 0,
      confidenceMax: 15,
      liquidityTier: "DEAD",
      marketSaturation: "EXTREME",
      painMin: 70,
      warningIncludes: "Dollar Tree"
    }
  },
  {
    id: "fake-bundle-inflation",
    label: "Single item inheriting bundle comps",
    facts: {
      ...baseFacts,
      title: "Single candy item with bundle sold comps",
      category: "grocery candy",
      sourceStoreType: "DOLLAR_TREE",
      costBasis: 1.25,
      averageSoldPrice: 23,
      netProfit: 12,
      roi: 960,
      trustedSoldCount: 3,
      activeCount: 40,
      activeListingCount: 40,
      soldListingCount: 3,
      saturationRatio: 13.33,
      confidenceScore: 60,
      titleMatchScore: 0.42,
      visualMatchScore: 0.4,
      isBundleDependent: true,
      bulkCompDetected: true,
      isConsumable: true
    },
    expected: {
      recommendation: "SKIP",
      confidenceMin: 0,
      confidenceMax: 15,
      liquidityTier: "SLOW",
      marketSaturation: "EXTREME",
      painMin: 70,
      warningIncludes: "bundle"
    }
  },
  {
    id: "collectible-toy",
    label: "Transformers collectible toy",
    facts: {
      ...baseFacts,
      title: "Transformers Age of the Primes Sideways Deluxe Class",
      brand: "Hasbro",
      category: "action figure collectible",
      costBasis: 15,
      averageSoldPrice: 38,
      netProfit: 12.2,
      roi: 81,
      trustedSoldCount: 4,
      soldCount90d: 1,
      activeCount: 5,
      activeListingCount: 5,
      soldListingCount: 4,
      sellThroughRate: 0.18,
      sellThroughRatio: 0.18,
      saturationRatio: 1.25,
      confidenceScore: 74,
      titleMatchScore: 0.68,
      visualMatchScore: 0.74,
      isCollectible: true,
      raritySignal: true
    },
    expected: {
      recommendation: "LONG_TAIL",
      confidenceMin: 70,
      confidenceMax: 90,
      liquidityTier: "SLOW",
      marketSaturation: "LOW",
      painMin: 0
    }
  },
  {
    id: "chase-collectible",
    label: "Low-supply chase collectible",
    facts: {
      ...baseFacts,
      title: "Hot Wheels Treasure Hunt chase variant",
      brand: "Mattel",
      category: "collectible toy",
      costBasis: 2,
      averageSoldPrice: 28,
      netProfit: 16.24,
      roi: 812,
      trustedSoldCount: 3,
      activeCount: 1,
      activeListingCount: 1,
      soldListingCount: 3,
      saturationRatio: 0.33,
      confidenceScore: 76,
      titleMatchScore: 0.72,
      visualMatchScore: 0.78,
      isCollectible: true,
      raritySignal: true
    },
    expected: {
      recommendation: "LONG_TAIL",
      confidenceMin: 70,
      confidenceMax: 90,
      liquidityTier: "SLOW",
      marketSaturation: "LOW",
      painMin: 0
    }
  },
  {
    id: "hot-wheels-premium-cars",
    label: "Hot Wheels premium collector cars",
    facts: {
      ...baseFacts,
      title: "Hot Wheels Premium Car Culture chase car",
      brand: "Mattel",
      category: "collectible diecast toy",
      costBasis: 6.49,
      averageSoldPrice: 26,
      netProfit: 10.51,
      roi: 162,
      trustedSoldCount: 6,
      soldCount90d: 3,
      activeCount: 4,
      activeListingCount: 4,
      soldListingCount: 6,
      sellThroughRate: 0.4,
      sellThroughRatio: 0.4,
      saturationRatio: 0.67,
      confidenceScore: 80,
      titleMatchScore: 0.74,
      visualMatchScore: 0.82,
      isCollectible: true,
      raritySignal: true
    },
    expected: {
      recommendation: "LONG_TAIL",
      confidenceMin: 75,
      confidenceMax: 95,
      liquidityTier: "MODERATE",
      marketSaturation: "LOW",
      painMin: 0
    }
  },
  {
    id: "pokemon-card-lots",
    label: "Pokemon card lot contamination",
    facts: {
      ...baseFacts,
      title: "Pokemon single booster pack matching card lot comps",
      brand: "Pokemon",
      category: "collectible cards",
      costBasis: 4.99,
      averageSoldPrice: 45,
      netProfit: 28.99,
      roi: 581,
      trustedSoldCount: 3,
      activeCount: 30,
      activeListingCount: 30,
      soldListingCount: 3,
      saturationRatio: 10,
      confidenceScore: 66,
      titleMatchScore: 0.44,
      visualMatchScore: 0.5,
      isCollectible: true,
      raritySignal: false,
      isBundleDependent: true,
      bulkCompDetected: true
    },
    expected: {
      recommendation: "INVESTIGATE",
      confidenceMin: 0,
      confidenceMax: 45,
      liquidityTier: "SLOW",
      marketSaturation: "EXTREME",
      painMin: 60,
      warningIncludes: "Weak"
    }
  },
  {
    id: "saturated-retail",
    label: "Generic saturated retail shelf item",
    facts: {
      ...baseFacts,
      title: "Generic retail home item",
      category: "retail home",
      costBasis: 8,
      averageSoldPrice: 18,
      netProfit: 1.57,
      roi: 19.6,
      trustedSoldCount: 8,
      activeCount: 220,
      activeListingCount: 220,
      soldListingCount: 8,
      sellThroughRate: 0.04,
      sellThroughRatio: 0.04,
      saturationRatio: 27.5,
      confidenceScore: 78,
      titleMatchScore: 0.62,
      visualMatchScore: 0.58
    },
    expected: {
      recommendation: "SKIP",
      confidenceMin: 0,
      confidenceMax: 45,
      liquidityTier: "DEAD",
      marketSaturation: "EXTREME",
      painMin: 70
    }
  },
  {
    id: "long-tail-inventory",
    label: "Vintage media long-tail inventory",
    facts: {
      ...baseFacts,
      title: "Vintage out of print DVD collector edition",
      category: "vintage media",
      costBasis: 2,
      averageSoldPrice: 24,
      netProfit: 12.77,
      roi: 638,
      trustedSoldCount: 3,
      activeCount: 4,
      activeListingCount: 4,
      soldListingCount: 3,
      saturationRatio: 1.33,
      confidenceScore: 72,
      titleMatchScore: 0.64,
      visualMatchScore: 0.66,
      isCollectible: true,
      raritySignal: true
    },
    expected: {
      recommendation: "LONG_TAIL",
      confidenceMin: 65,
      confidenceMax: 85,
      liquidityTier: "SLOW",
      marketSaturation: "LOW",
      painMin: 0
    }
  },
  {
    id: "electronics-accessory",
    label: "Incomplete electronics accessory",
    facts: {
      ...baseFacts,
      title: "Generic USB-C charging cable open box no adapter",
      category: "electronics accessory",
      costBasis: 6,
      averageSoldPrice: 12,
      netProfit: -1,
      roi: -16,
      trustedSoldCount: 8,
      activeCount: 300,
      activeListingCount: 300,
      soldListingCount: 8,
      saturationRatio: 37.5,
      confidenceScore: 76,
      titleMatchScore: 0.55,
      visualMatchScore: 0.5,
      returnRisk: true,
      incompleteListingRisk: true
    },
    expected: {
      recommendation: "SKIP",
      confidenceMin: 0,
      confidenceMax: 40,
      liquidityTier: "DEAD",
      marketSaturation: "EXTREME",
      painMin: 70,
      warningIncludes: "Electronics"
    }
  },
  {
    id: "beauty-cosmetic-saturation",
    label: "Beauty product saturation",
    facts: {
      ...baseFacts,
      title: "Drugstore mascara retail shelf item",
      brand: "Generic Beauty",
      category: "beauty cosmetic makeup",
      costBasis: 5,
      averageSoldPrice: 13,
      netProfit: 0.23,
      roi: 4.6,
      trustedSoldCount: 6,
      activeCount: 180,
      activeListingCount: 180,
      soldListingCount: 6,
      sellThroughRate: 0.03,
      sellThroughRatio: 0.03,
      saturationRatio: 30,
      confidenceScore: 75,
      titleMatchScore: 0.6,
      visualMatchScore: 0.55,
      isConsumable: true
    },
    expected: {
      recommendation: "SKIP",
      confidenceMin: 0,
      confidenceMax: 35,
      liquidityTier: "DEAD",
      marketSaturation: "EXTREME",
      painMin: 80
    }
  },
  {
    id: "electronics-return-risk",
    label: "Open-box electronics with return risk",
    facts: {
      ...baseFacts,
      title: "Open box wireless game controller missing cable",
      category: "electronics controller",
      costBasis: 18,
      averageSoldPrice: 42,
      netProfit: 12.39,
      roi: 68.8,
      trustedSoldCount: 5,
      soldCount90d: 2,
      activeCount: 45,
      activeListingCount: 45,
      soldListingCount: 5,
      sellThroughRate: 0.11,
      sellThroughRatio: 0.11,
      saturationRatio: 9,
      confidenceScore: 78,
      titleMatchScore: 0.62,
      visualMatchScore: 0.58,
      returnRisk: true,
      incompleteListingRisk: true
    },
    expected: {
      recommendation: "HIGH_RISK",
      confidenceMin: 20,
      confidenceMax: 55,
      liquidityTier: "SLOW",
      marketSaturation: "EXTREME",
      painMin: 45,
      warningIncludes: "Electronics"
    }
  },
  {
    id: "heavy-low-margin",
    label: "Heavy low-margin household item",
    facts: {
      ...baseFacts,
      title: "Heavy glass kitchen jar",
      category: "home goods",
      costBasis: 7,
      averageSoldPrice: 19,
      netProfit: 0.43,
      roi: 6.1,
      trustedSoldCount: 5,
      activeCount: 42,
      activeListingCount: 42,
      soldListingCount: 5,
      saturationRatio: 8.4,
      confidenceScore: 70,
      titleMatchScore: 0.58,
      visualMatchScore: 0.54,
      estimatedWeightClass: "HEAVY",
      shippingComplexity: "MEDIUM",
      fragileRisk: true,
      oversizedPenalty: 7
    },
    expected: {
      recommendation: "SKIP",
      confidenceMin: 0,
      confidenceMax: 45,
      liquidityTier: "DEAD",
      marketSaturation: "EXTREME",
      painMin: 70,
      warningIncludes: "Fragile"
    }
  }
];
