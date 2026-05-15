// lib/generator.js
const { computeProfit } = require("./feeCalculator");

function capWords(s) {
  if (!s) return "";
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

function clampChars(s, max) {
  if (!s) return "";
  if (s.length <= max) return s;
  const t = s.slice(0, max + 1).split(/\s/).slice(0, -1).join(" ");
  return t || s.slice(0, max);
}

function makeHashtags(tags, limit = 10) {
  const cleaned = (tags || [])
    .map((t) => t.replace(/[^\w]/g, ""))
    .filter(Boolean);
  return Array.from(new Set(cleaned)).slice(0, limit).map((t) => "#" + t.toLowerCase());
}

function estimateShippingText(weightLb) {
  const w = weightLb || 1;
  if (w <= 0.5) return "Ships via USPS First Class";
  if (w <= 1) return "Ships via USPS Priority";
  if (w <= 5) return "Ships via USPS Priority";
  return "Calculated shipping";
}

function profitFor(platform, input, price) {
  const map = {
    ebay: "ebay",
    facebook: "mercari",
    poshmark: "poshmark",
    mercari: "mercari",
    tiktok: "mercari",
    etsy: "depop",
    shopify: "mercari",
    instagram: "mercari"
  };
  const marketplace = map[platform] || "mercari";
  return computeProfit({
    marketplace,
    salePrice: price,
    costOfGoods: input.costOfGoods || 0,
    weightLb: input.weightLb || 1
  });
}

function generateForAll(input) {
  const brand = capWords(input.brand);
  const model = capWords(input.model);
  const price =
    input.suggestedPrice || Math.max(Math.round((input.costOfGoods || 10) * 2), 20);
  const tags = (input.tags || []).slice(0, 20);
  const hashtags = makeHashtags(
    tags.length ? tags : [brand, model, input.categoryHint || "resale"],
    12
  );
  const baseDesc =
    input.description ||
    `${brand} ${model} in ${input.condition || "used"} condition. See photos.`;
  const commonDescShort = clampChars(baseDesc.trim(), 280);

  const outs = [];

  {
    const title = clampChars(`${brand} ${model} ${input.condition || ""}`.trim(), 80);
    const description = `${commonDescShort}\n\n${estimateShippingText(
      input.weightLb
    )}\nReturns: 30 days`;
    const profit = profitFor("ebay", input, price);
    outs.push({
      platform: "ebay",
      title,
      description,
      price,
      profit,
      copyBlocks: [
        { field: "Title", text: title },
        { field: "Description", text: description }
      ]
    });
  }

  {
    const title = clampChars(`${brand} ${model} — ${input.condition || "Used"}`, 60);
    const description = `${commonDescShort}\nLocal pickup preferred. ${estimateShippingText(
      input.weightLb
    )}\nCash or Venmo.`;
    const profit = profitFor("facebook", input, price);
    outs.push({
      platform: "facebook",
      title,
      description,
      price,
      profit,
      copyBlocks: [
        { field: "Title", text: title },
        { field: "Description", text: description }
      ]
    });
  }

  {
    const title = clampChars(
      `${brand} ${model} ${input.size ? "- " + input.size : ""}`.trim(),
      60
    );
    const description = `${commonDescShort}\nMeasurements: ${
      input.size || "See photos"
    }\nCondition: ${input.condition || "Good"}\nBundle discount available.`;
    const profit = profitFor("poshmark", input, price);
    outs.push({
      platform: "poshmark",
      title,
      description,
      price,
      profit,
      hashtags: makeHashtags([brand, model, ...tags, "poshmark"], 8),
      copyBlocks: [
        { field: "Title", text: title },
        { field: "Description", text: description }
      ]
    });
  }

  {
    const title = clampChars(`${brand} ${model}`, 60);
    const description = `${commonDescShort}\nCondition: ${
      input.condition || "Used"
    }\n${estimateShippingText(input.weightLb)}`;
    const profit = profitFor("mercari", input, price);
    outs.push({
      platform: "mercari",
      title,
      description,
      price,
      profit,
      copyBlocks: [
        { field: "Title", text: title },
        { field: "Description", text: description }
      ]
    });
  }

  {
    const title = clampChars(`${brand} ${model} — ${input.condition || "Used"}`, 60);
    const desc = clampChars(
      `Hook: Great deal on ${brand} ${model}. Only $${price}.`,
      140
    );
    const profit = profitFor("tiktok", input, price);
    outs.push({
      platform: "tiktok",
      title,
      description: desc,
      price,
      profit,
      hashtags,
      copyBlocks: [
        { field: "Video Caption", text: `${desc}\n\n${hashtags.join(" ")}` }
      ]
    });
  }

  {
    const title = clampChars(`${brand} ${model}`, 140);
    const description = `${commonDescShort}\nProcessing time: 1–3 business days.`;
    const profit = profitFor("etsy", input, price);
    outs.push({
      platform: "etsy",
      title,
      description,
      price,
      profit,
      copyBlocks: [
        { field: "Title", text: title },
        { field: "Description", text: description }
      ]
    });
  }

  {
    const title = clampChars(`${brand} ${model}`, 120);
    const bullets = [
      `${brand} ${model}`,
      `Condition: ${input.condition || "Used"}`,
      `Ships: ${estimateShippingText(input.weightLb)}`
    ];
    const description = `${bullets.map((b) => "• " + b).join("\n")}\n\n${commonDescShort}`;
    const profit = profitFor("shopify", input, price);
    outs.push({
      platform: "shopify",
      title,
      description,
      price,
      profit,
      copyBlocks: [
        { field: "Product Title", text: title },
        {
          field: "Description (HTML)",
          text: `<ul>${bullets
            .map((b) => `<li>${b}</li>`)
            .join("")}</ul><p>${commonDescShort}</p>`
        }
      ]
    });
  }

  {
    const caption = clampChars(
      `${brand} ${model} — $${price}\n${commonDescShort}\n${hashtags.join(
        " "
      )}\nDM to buy`,
      500
    );
    const profit = profitFor("instagram", input, price);
    outs.push({
      platform: "instagram",
      title: `${brand} ${model}`,
      description: caption,
      price,
      profit,
      hashtags,
      copyBlocks: [{ field: "Caption", text: caption }]
    });
  }

  return outs;
}

module.exports = { generateForAll };
