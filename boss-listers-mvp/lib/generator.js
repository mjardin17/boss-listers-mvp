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

function generateForAll(input) {
  const brand = capWords(input.brand);
  const model = capWords(input.model);
  const pricing = getPricingRecommendation(input);
  const price = pricing.selectedPrice;
  const tags = (input.tags || []).slice(0, 20);
  const hashtags = makeHashtags(
    tags.length ? tags : [brand, model, input.categoryHint || "resale"],
    12
  );
  const baseDescription =
    input.description ||
    `${brand} ${model} in ${input.condition || "used"} condition. See photos.`;
  const shortDescription = clampChars(baseDescription.trim(), 280);
  const seoCore = [brand, model, input.categoryHint].filter(Boolean).join(" ");

  return [
    {
      platform: "ebay",
      title: clampChars(`${seoCore} ${input.condition || ""}`.trim(), 80),
      description: `${shortDescription}\n\n${estimateShippingText(
        input.weightLb
      )}\nReturns: 30 days`
    },
    {
      platform: "facebook",
      title: clampChars(`${brand} ${model} - ${input.condition || "Used"}`, 60),
      description: `${shortDescription}\nLocal pickup preferred. ${estimateShippingText(
        input.weightLb
      )}\nCash or Venmo.`
    },
    {
      platform: "mercari",
      title: clampChars(seoCore, 60),
      description: `${shortDescription}\nCondition: ${
        input.condition || "Used"
      }\n${estimateShippingText(input.weightLb)}`
    },
    {
      platform: "poshmark",
      title: clampChars(
        `${brand} ${model} ${input.size ? "- " + input.size : ""}`.trim(),
        60
      ),
      description: `${shortDescription}\nMeasurements: ${
        input.size || "See photos"
      }\nCondition: ${input.condition || "Good"}\nBundle discount available.`,
      hashtags: makeHashtags([brand, model, ...tags, "poshmark"], 8)
    },
    {
      platform: "depop",
      title: clampChars(`${seoCore} ${input.condition || ""}`.trim(), 65),
      description: `${shortDescription}\nStyle tags: ${hashtags
        .slice(0, 5)
        .join(" ")}\nCondition: ${input.condition || "Used"}`,
      hashtags: makeHashtags([brand, model, ...tags, "depop"], 8)
    },
    {
      platform: "etsy",
      title: clampChars(seoCore, 140),
      description: `${shortDescription}\nProcessing time: 1-3 business days.`
    },
    {
      platform: "tiktok",
      title: clampChars(`${seoCore} ${input.condition || ""}`.trim(), 60),
      description: clampChars(`Hook: Great deal on ${brand} ${model}. Only $${price}.`, 140),
      hashtags
    },
    {
      platform: "offerup",
      title: clampChars(`${brand} ${model} ${input.condition || ""}`.trim(), 70),
      description: `${shortDescription}\nMeetup or shipping available. ${estimateShippingText(
        input.weightLb
      )}`
    }
  ].map((item) => ({
    ...item,
    price,
    profit: profitFor(item.platform, input, price),
    copyBlocks:
      item.platform === "tiktok"
        ? [{ field: "Video Caption", text: `${item.description}\n\n${hashtags.join(" ")}` }]
        : [
            { field: "Title", text: item.title },
            { field: "Description", text: item.description }
          ]
  }));
}

module.exports = { generateForAll };
