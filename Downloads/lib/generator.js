const { computeProfit } = require("./feeCalculator");
const { getPricingRecommendation } = require("./pricingIntelligence");

function capWords(value) {
  if (!value) return "";
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

function clampChars(value, max) {
  if (!value) return "";
  if (value.length <= max) return value;
  const trimmed = value.slice(0, max + 1).split(/\s/).slice(0, -1).join(" ");
  return trimmed || value.slice(0, max);
}

function makeHashtags(tags, limit = 10) {
  const cleaned = (tags || [])
    .map((tag) => tag.replace(/[^\w]/g, ""))
    .filter(Boolean);
  return Array.from(new Set(cleaned))
    .slice(0, limit)
    .map((tag) => "#" + tag.toLowerCase());
}

function estimateShippingText(weightLb) {
  const weight = weightLb || 1;
  if (weight <= 0.5) return "Ships via USPS First Class";
  if (weight <= 5) return "Ships via USPS Priority";
  return "Calculated shipping";
}

function profitFor(platform, input, price) {
  return computeProfit({
    marketplace: platform,
    salePrice: price,
    costOfGoods: input.costOfGoods || 0,
    weightLb: input.weightLb || 1
  });
}

const MARKETPLACES = [
  { key: "ebay", label: "eBay" },
  { key: "facebook", label: "Facebook Marketplace" },
  { key: "poshmark", label: "Poshmark" },
  { key: "mercari", label: "Mercari" },
  { key: "offerup", label: "OfferUp" },
  { key: "etsy", label: "Etsy" },
  { key: "depop", label: "Depop" },
];

function generateForAll(input) {
  const brand = capWords(input.brand);
  const model = capWords(input.model);
  const pricing = getPricingRecommendation(input);
  const price = pricing.selectedPrice;
  const tags = (input.tags || []).slice(0, 20);
  const visibleDetails = (input.analysisResult?.keyDetails || []).slice(0, 3);
  const hashtags = makeHashtags(
    tags.length ? tags : [brand, model, input.categoryHint || "resale", ...visibleDetails],
    12
  );
  const itemName = capWords(input.suggestedTitle || [brand, model].filter(Boolean).join(" "));
  const baseDescription =
    input.description ||
    `${itemName || `${brand} ${model}`.trim()} in ${input.condition || "used"} condition. See photos for details.`;
  const shortDescription = clampChars(baseDescription.trim(), 280);
  const seoCore = [itemName || [brand, model].filter(Boolean).join(" "), input.categoryHint]
    .filter(Boolean)
    .join(" ");
  const compactDetails = visibleDetails.join(", ");
  const conditionLine = input.condition ? `Condition: ${input.condition}.` : "";
  const shippingLine = estimateShippingText(input.weightLb);

  const drafts = [
    {
      marketplaceKey: "ebay",
      title: clampChars(
        [
          itemName || seoCore,
          input.categoryHint,
          visibleDetails[0],
          input.condition
        ]
          .filter(Boolean)
          .join(" "),
        80
      ),
      description: [
        shortDescription,
        compactDetails ? `Key details: ${compactDetails}.` : "",
        conditionLine,
        shippingLine,
        "Review photos for exact condition."
      ]
        .filter(Boolean)
        .join("\n")
    },
    {
      marketplaceKey: "facebook",
      title: clampChars(`${itemName || `${brand} ${model}`.trim()} - ${input.condition || "Used"}`, 60),
      description: `${shortDescription}\nLocal pickup preferred. ${estimateShippingText(
        input.weightLb
      )}`
    },
    {
      marketplaceKey: "mercari",
      title: clampChars(seoCore, 60),
      description: `${shortDescription}\nCondition: ${
        input.condition || "Used"
      }\n${estimateShippingText(input.weightLb)}`
    },
    {
      marketplaceKey: "poshmark",
      title: clampChars(
        `${itemName || `${brand} ${model}`.trim()} ${input.size ? "- " + input.size : ""}`.trim(),
        60
      ),
      description: `${shortDescription}\nMeasurements: ${
        input.size || "See photos"
      }\nCondition: ${input.condition || "Good"}\nBundle discount available.`,
      hashtags: makeHashtags([brand, model, ...tags, "poshmark"], 8)
    },
    {
      marketplaceKey: "etsy",
      title: clampChars(seoCore, 140),
      description: `${shortDescription}\nConfirm handmade/vintage eligibility before posting.`
    },
    {
      marketplaceKey: "depop",
      title: clampChars(`${seoCore} ${input.condition || ""}`.trim(), 65),
      description: `${shortDescription}\nStyle tags: ${hashtags
        .slice(0, 5)
        .join(" ")}\nCondition: ${input.condition || "Used"}`,
      hashtags: makeHashtags([brand, model, ...tags, "depop"], 8)
    },
    {
      marketplaceKey: "offerup",
      title: clampChars(`${itemName || `${brand} ${model}`.trim()} ${input.condition || ""}`.trim(), 70),
      description: `${shortDescription}\nMeetup or shipping available. ${estimateShippingText(
        input.weightLb
      )}`
    }
  ];

  return drafts.map((item) => {
    const marketplace = MARKETPLACES.find((entry) => entry.key === item.marketplaceKey);
    return {
    ...item,
    platform: marketplace.label,
    price,
    profit: profitFor(item.marketplaceKey, input, price),
    copyBlocks: [
      { field: "Title", text: item.title },
      { field: "Description", text: item.description }
    ]
    };
  });
}

module.exports = { generateForAll };
