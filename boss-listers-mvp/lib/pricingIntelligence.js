const { computeProfit } = require("./feeCalculator");

const CATEGORY_MULTIPLIERS = {
  electronics: 1.65,
  clothing: 2.2,
  footwear: 2.35,
  vintage: 2.6,
  jewelry: 2.5,
  home: 1.9,
  toys: 2.1,
  general: 2
};

const CONDITION_MULTIPLIERS = {
  New: 1.18,
  "Like New": 1.08,
  Used: 1,
  "For Parts": 0.58
};

function roundPrice(value) {
  if (value < 20) return Math.ceil(value);
  if (value < 100) return Math.ceil(value / 5) * 5;
  return Math.ceil(value / 10) * 10;
}

function normalizeCategory(categoryHint = "") {
  const value = String(categoryHint).trim().toLowerCase();
  if (!value) return "general";
  if (value.includes("shoe") || value.includes("footwear")) return "footwear";
  if (value.includes("cloth") || value.includes("apparel")) return "clothing";
  if (value.includes("electronic") || value.includes("audio")) return "electronics";
  if (value.includes("vintage")) return "vintage";
  if (value.includes("jewel")) return "jewelry";
  if (value.includes("home")) return "home";
  if (value.includes("toy")) return "toys";
  return "general";
}

function minimumPriceForTargetProfit(input, targetProfit = 10) {
  const cost = Math.max(0, Number(input.costOfGoods) || 0);
  for (let price = Math.max(5, cost); price <= 2000; price += 1) {
    const profit = computeProfit({
      marketplace: "ebay",
      salePrice: price,
      costOfGoods: cost,
      weightLb: input.weightLb || 1
    });
    if (profit.netProfit >= targetProfit) return price;
  }
  return Math.max(5, cost);
}

function getPricingRecommendation(input = {}) {
  const cost = Math.max(0, Number(input.costOfGoods) || 0);
  const category = normalizeCategory(input.categoryHint);
  const categoryMultiplier = CATEGORY_MULTIPLIERS[category] || CATEGORY_MULTIPLIERS.general;
  const conditionMultiplier =
    CONDITION_MULTIPLIERS[input.condition] || CONDITION_MULTIPLIERS.Used;
  const baseline = Math.max(cost * categoryMultiplier * conditionMultiplier, 20);
  const floorPrice = roundPrice(minimumPriceForTargetProfit(input));
  const recommendedPrice = roundPrice(Math.max(baseline, floorPrice));
  const selectedPrice =
    Number(input.suggestedPrice) > 0 ? Number(input.suggestedPrice) : recommendedPrice;
  const expectedProfit = computeProfit({
    marketplace: "ebay",
    salePrice: selectedPrice,
    costOfGoods: cost,
    weightLb: input.weightLb || 1
  });

  return {
    category,
    recommendedPrice,
    floorPrice,
    selectedPrice,
    expectedProfit,
    assumptions: {
      categoryMultiplier,
      conditionMultiplier,
      marketplace: "ebay"
    }
  };
}

module.exports = { getPricingRecommendation };
