const fs = require("fs");
const OpenAI = require("openai");

const DEFAULT_MODEL = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
const VISION_TIMEOUT_MS = Number(process.env.OPENAI_VISION_TIMEOUT_MS) || 6500;
const MAX_VISION_IMAGE_BYTES = Number(process.env.OPENAI_VISION_MAX_IMAGE_BYTES) || 18 * 1024 * 1024;
const PLACEHOLDER_KEY_PATTERN =
  /^(|your_key_here|paste_key_here|PASTE_KEY_HERE|sk-(x+|_+)|sk-placeholder|placeholder|null|undefined)$/i;

const OCR_STOP_WORDS = new Set([
  "value pack",
  "clearance",
  "rollback",
  "trending",
  "20% more free",
  "bonus",
  "limited time"
]);

const PRIORITY_OCR_TERMS =
  /\b(transformers|autobot|decepticon|optimus|bumblebee|hot wheels|treasure hunt|mattel|pokemon|pikachu|funko|pop!|lego|technic|star wars|marvel|hasbro|nintendo|sony|xbox|playstation|apple|samsung|anker|onn|beats|bose|jbl|sony|philips|nike|adidas|under armour|hanes|mainstays|better homes|rubbermaid|sterilite)\b/i;

const VISION_PROMPT =
  'You are Boss Listers AI, a reseller product recognition engine. Identify exactly one resale item using all supplied photos together. Treat the photos as multiple angles of the same product: barcode photos give UPC first, front packaging gives title/category, side/back photos give model/specs, shelf-tag photos give store price only, and close-ups confirm variant/size/condition. Return only JSON matching the schema and always include top-level "upc", "brand", "productName", "category", and "confidence". Extraction priority is strict: 1 UPC barcode, 2 product number/item number/model number, 3 brand, 4 product name, 5 category. Always return UPC if visible. UPC must be numeric digits only with no spaces, hyphens, or text. If UPC exists, use it as the primary identifier and build searchQuery from UPC first. If UPC is not visible, fall back to brand plus productName. Resolve identity in this order: 1 barcode/UPC digits, 2 product number or item number, 3 packaging text/OCR, 4 brand logos, 5 visual recognition. Fill productName with the cleanest reseller product name supported by visible evidence, visibleText with a compact transcript of useful text, and searchQuery with the best eBay sold-comps query. Step 1: OCR first across every image. Transcribe useful visible packaging text into "ocrText": brand logos, franchise names, model words, product line, character name, style name, set number, item number, UPC digits, pack count, size, age mark, scale, series, edition, and condition words. Also fill "imageObservations" with one object per image: role front/back/barcode/shelf_tag/close_up/unknown, ocrText, upc, titleText, brandText, priceText, failedOcr, and confidence. Merge duplicate OCR across images and prefer text that appears or is supported by more than one image. Put visible product anchors into "visualAnchors": product logo, dominant brand, character names, flavor text, quantity text, edition markers, package shape, collector labels, colorway labels, and visible variant marks. Put visible packaging color, shape, card/blister/box/bag, shelf packaging clues, glare, tilted/cropped views, shelf tags, clearance stickers, and partial obstruction clues into "packagingHints". Ignore random serial garbage, manufacturing batch codes, receipt text, shelf-label pricing, yellow clearance labels as product identity, and isolated single letters unless they are a known product mark. Shelf tag prices are source-cost clues only, never resale value. Step 2: classify the item for resale. For collectibles/toys, actively check for Transformers, Hot Wheels, Pokemon, Funko, LEGO, action figures, die-cast cars, blister cards, sealed boxes, chase/treasure hunt/exclusive marks, set numbers, character names, franchise logos, wave/class/generation marks, and collector packaging. For cosmetics, check brand, shade/colorway, size, finish, and package type. For grocery, check brand, flavor, count, size/weight, and multipack signals. For electronics, check for brand, model number, device type, wattage/capacity, connectivity, compatibility, and whether packaging is sealed/open. Step 3: build a clean reseller title from visible evidence only. Prefer "Brand Product Line Model/Character Variant Item Number" when supported by UPC, product number, multiple angles, or OCR plus visual packaging. If the exact model is uncertain, use a useful category title like "Brand Product Line Action Figure" or "Brand Wireless Earbuds" instead of "Item", "Product", "S Item", or a random code. Do not invent exact product names. Step 4: condition matters. Separate sealed/new-in-box, shelf wear, damaged packaging, loose/open, and used. Step 5: confidence must reflect evidence quality: high only when UPC, product number, or brand plus model/item number are visible or corroborated across multiple images, medium when brand plus category/product line are visible, low when only category/shape is visible. Lower confidence when multiple matches are plausible. Estimate resaleLow/resaleSuggested/resaleHigh in USD only when plausible. Classify demand as low/medium/high and sellThrough as slow/average/fast only when supported.';

const VISION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    itemTitle: { type: "string" },
    productName: { type: "string" },
    brand: { type: "string" },
    category: { type: "string" },
    visibleText: { type: "string" },
    searchQuery: { type: "string" },
    condition: { type: "string" },
    ocrText: { type: "array", items: { type: "string" } },
    brandCandidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          confidence: { type: "number" }
        },
        required: ["name", "confidence"]
      }
    },
    categorySignals: { type: "array", items: { type: "string" } },
    conditionSignals: { type: "array", items: { type: "string" } },
    imageObservations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          role: { type: "string" },
          ocrText: { type: "array", items: { type: "string" } },
          upc: { type: "string" },
          titleText: { type: "string" },
          brandText: { type: "string" },
          priceText: { type: "string" },
          failedOcr: { type: "boolean" },
          confidence: { type: "number" }
        },
        required: ["role", "ocrText", "upc", "titleText", "brandText", "priceText", "failedOcr", "confidence"]
      }
    },
    visualAnchors: { type: "array", items: { type: "string" } },
    packagingHints: { type: "array", items: { type: "string" } },
    keyDetails: { type: "array", items: { type: "string" } },
    quantity: { type: "string" },
    resaleLow: { type: ["number", "null"] },
    resaleSuggested: { type: ["number", "null"] },
    resaleHigh: { type: ["number", "null"] },
    shippingNotes: { type: "string" },
    upc: { type: "string" },
    productLine: { type: "string" },
    itemNumber: { type: "string" },
    variant: { type: "string" },
    edition: { type: "string" },
    demand: { type: "string" },
    sellThrough: { type: "string" },
    bestMatches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          brand: { type: "string" },
          confidence: { type: "number" }
        },
        required: ["name", "brand", "confidence"]
      }
    },
    confidence: { type: "number" },
    summary: { type: "string" },
    recognitionEvidence: { type: "array", items: { type: "string" } },
    missingViews: { type: "array", items: { type: "string" } }
  },
  required: [
    "itemTitle",
    "productName",
    "brand",
    "category",
    "visibleText",
    "searchQuery",
    "condition",
    "ocrText",
    "brandCandidates",
    "categorySignals",
    "conditionSignals",
    "imageObservations",
    "visualAnchors",
    "packagingHints",
    "keyDetails",
    "quantity",
    "resaleLow",
    "resaleSuggested",
    "resaleHigh",
    "shippingNotes",
    "upc",
    "productLine",
    "itemNumber",
    "variant",
    "edition",
    "demand",
    "sellThrough",
    "bestMatches",
    "confidence",
    "summary",
    "recognitionEvidence",
    "missingViews"
  ]
};

function getOpenAiAccessStatus() {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!key || PLACEHOLDER_KEY_PATTERN.test(key)) {
    return {
      enabled: false,
      reason: "missing_key",
      message: "AI vision unavailable; pricing requires sold comps."
    };
  }
  return {
    enabled: true,
    reason: "",
    message: ""
  };
}

function isVisionEnabled() {
  return getOpenAiAccessStatus().enabled;
}

function classifyOpenAiError(error) {
  const status = Number(error?.status || error?.code || error?.response?.status) || 0;
  const message = String(error?.message || error?.error?.message || "").toLowerCase();
  const type = String(error?.type || error?.error?.type || "").toLowerCase();

  if (status === 401 || /invalid.*api.*key|incorrect api key|authentication/.test(message)) {
    return {
      reason: "auth_failure",
      message: "AI vision unavailable; pricing requires sold comps."
    };
  }
  if (
    status === 429 ||
    /insufficient_quota|quota|billing|exceeded your current quota/.test(message) ||
    /insufficient_quota/.test(type)
  ) {
    return {
      reason: "quota_failure",
      message: "AI vision unavailable; pricing requires sold comps."
    };
  }
  if (/timed out|timeout|network|connection|fetch failed|econnreset|enotfound/.test(message)) {
    return {
      reason: "network_timeout",
      message: "AI vision unavailable; pricing requires sold comps."
    };
  }
  return {
    reason: "vision_failure",
    message: "AI vision unavailable; pricing requires sold comps."
  };
}

function stripCodeFence(value = "") {
  return String(value)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
}

function extractJsonObject(value = "") {
  const stripped = stripCodeFence(value);
  if (stripped.startsWith("{") && stripped.endsWith("}")) return stripped;
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  return start >= 0 && end > start ? stripped.slice(start, end + 1) : stripped;
}

function cleanOcrSnippet(value = "") {
  const cleaned = String(value)
    .replace(/[|_]+/g, " ")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/([a-z])\s+([a-z])(?=\s|$)/gi, "$1$2")
    .replace(/\b([a-z0-9]{2,})\s+\1\b/gi, "$1")
    .replace(/\b(SKU|STYLE|ITEM|MODEL|UPC)\s*[:#]\s*/gi, "$1 ")
    .replace(/([a-z])(\d)/gi, "$1 $2")
    .replace(/(\d)([a-z])/gi, "$1 $2")
    .replace(/[^\w\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";

  const normalized = cleaned.toLowerCase();
  const letters = (cleaned.match(/[a-z]/gi) || []).length;
  const digits = (cleaned.match(/\d/g) || []).length;
  const compact = cleaned.replace(/\s+/g, "");

  if (OCR_STOP_WORDS.has(normalized)) return "";
  if (/^[a-z]$/i.test(compact)) return "";
  if (/^[0-9a-f-]{18,}$/i.test(compact)) return "";
  if (/^[A-Z0-9-]{8,}$/.test(compact) && letters <= 2 && digits >= 5) return "";
  if (/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(compact) && compact.length >= 8 && digits >= 3) {
    return "";
  }
  if (compact.length >= 10 && letters / compact.length < 0.25 && digits >= 5) return "";
  return cleaned;
}

function scoreOcrSnippet(value = "") {
  const lower = value.toLowerCase();
  let score = 0;
  if (PRIORITY_OCR_TERMS.test(value)) score += 7;
  if (/\b(series|edition|figure|vehicle|set|pack|age|scale|style|model|wireless|bluetooth|sealed|new with tags)\b/.test(lower)) score += 2;
  if (/\b\d{8,14}\b/.test(lower)) score += 1;
  if (value.split(/\s+/).length >= 2) score += 1;
  if (/^[a-z0-9-]{10,}$/i.test(value.replace(/\s+/g, ""))) score -= 2;
  return score;
}

function normalizeOcrText(values = []) {
  return Array.from(
    new Set(
      (values || [])
        .map(cleanOcrSnippet)
        .filter(Boolean)
    )
  )
    .sort((a, b) => scoreOcrSnippet(b) - scoreOcrSnippet(a))
    .slice(0, 12);
}

function cleanVisionTitle(value = "") {
  const cleaned = String(value)
    .replace(/\b(value pack|clearance|rollback|trending|20% more free|bonus|limited time)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const compact = cleaned.replace(/\s+/g, "");
  if (!cleaned) return "";
  if (/^[a-z]$/i.test(cleaned)) return "";
  if (/^(item|product|scanned item|unknown|n\/a|na)$/i.test(cleaned)) return "";
  if (/^[0-9a-f-]{18,}$/i.test(compact)) return "";
  if (/^[A-Z0-9-]{10,}$/i.test(compact) && !/[aeiou]/i.test(compact)) return "";
  return cleaned;
}

function cleanShortArray(values = [], limit = 6) {
  return Array.from(
    new Set(
      (values || [])
        .map((value) => cleanOcrSnippet(value))
        .filter(Boolean)
    )
  ).slice(0, limit);
}

function emptyVisionPayload() {
  return {
    itemTitle: "",
    productName: "",
    brand: "",
    category: "",
    visibleText: "",
    searchQuery: "",
    condition: "",
    ocrText: [],
    brandCandidates: [],
    categorySignals: [],
    conditionSignals: [],
    imageObservations: [],
    visualAnchors: [],
    packagingHints: [],
    keyDetails: [],
    quantity: "",
    resaleLow: null,
    resaleSuggested: null,
    resaleHigh: null,
    shippingNotes: "",
    upc: "",
    productLine: "",
    itemNumber: "",
    variant: "",
    edition: "",
    demand: "",
    sellThrough: "",
    bestMatches: [],
    productCandidates: [],
    generatedSearchQueries: [],
    confidence: 0,
    summary: "",
    recognitionEvidence: [],
    missingViews: []
  };
}

function clampConfidence(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function positivePriceOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Number(number.toFixed(2)) : null;
}

function normalizeCandidateTokens(values = []) {
  return Array.from(
    new Set(
      values
        .flatMap((value) =>
          String(value || "")
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
        )
        .filter((token) => token.length >= 3)
    )
  ).slice(0, 8);
}

function normalizeVisionUpc(value = "") {
  const digits = String(value || "").replace(/\D/g, "");
  return [6, 8, 12, 13, 14].includes(digits.length) ? digits : "";
}

function buildVisionProductCandidates(parsed = {}) {
  const candidates = [];
  const itemTitle =
    typeof parsed.itemTitle === "string"
      ? cleanVisionTitle(parsed.itemTitle)
      : typeof parsed.productName === "string"
        ? cleanVisionTitle(parsed.productName)
        : "";
  const brand = typeof parsed.brand === "string" ? parsed.brand.trim() : "";
  const category = typeof parsed.category === "string" ? parsed.category.trim() : "";
  const upc = normalizeVisionUpc(parsed.upc);
  const confidence = Math.round(clampConfidence(parsed.confidence) * 100);
  if (itemTitle) {
    candidates.push({
      title: itemTitle,
      brand,
      category,
      upc,
      source: "OpenAI vision title",
      confidence,
      matchedTokens: normalizeCandidateTokens([itemTitle, brand, category]),
      reasonSuggested: "Vision model returned this as the primary item identity."
    });
  }
  if (Array.isArray(parsed.bestMatches)) {
    parsed.bestMatches.slice(0, 3).forEach((match) => {
      const title = typeof match?.name === "string" ? cleanVisionTitle(match.name) : "";
      if (!title) return;
      candidates.push({
        title,
        brand: typeof match?.brand === "string" ? match.brand.trim() : brand,
        category,
        upc,
        source: "OpenAI vision match",
        confidence: Math.round(clampConfidence(match?.confidence) * 100),
        matchedTokens: normalizeCandidateTokens([title, match?.brand, category]),
        reasonSuggested: "Vision model included this as a nearby product match."
      });
    });
  }
  return candidates.slice(0, 5);
}

function normalizeEnum(value = "", allowed = []) {
  const normalized = String(value || "").trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : "";
}

function parseVisionPayload(text) {
  try {
    const parsed = JSON.parse(extractJsonObject(text));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return emptyVisionPayload();
    }
    return {
      itemTitle:
        typeof parsed.itemTitle === "string"
          ? cleanVisionTitle(parsed.itemTitle)
          : typeof parsed.productName === "string"
            ? cleanVisionTitle(parsed.productName)
            : "",
      productName:
        typeof parsed.productName === "string"
          ? cleanVisionTitle(parsed.productName)
          : typeof parsed.itemTitle === "string"
            ? cleanVisionTitle(parsed.itemTitle)
            : "",
      brand: typeof parsed.brand === "string" ? parsed.brand.trim() : "",
      category: typeof parsed.category === "string" ? parsed.category.trim() : "",
      visibleText:
        typeof parsed.visibleText === "string" ? cleanOcrSnippet(parsed.visibleText) : "",
      searchQuery:
        typeof parsed.searchQuery === "string" ? cleanOcrSnippet(parsed.searchQuery) : "",
      condition:
        typeof parsed.condition === "string"
          ? parsed.condition.trim()
          : typeof parsed.conditionGuess === "string"
            ? parsed.conditionGuess.trim()
            : "",
      ocrText: normalizeOcrText([
        ...(Array.isArray(parsed.ocrText) ? parsed.ocrText : []),
        ...(Array.isArray(parsed.packagingText) ? parsed.packagingText : [])
      ]),
      brandCandidates: Array.isArray(parsed.brandCandidates)
        ? parsed.brandCandidates
            .map((item) => ({
              name: typeof item?.name === "string" ? item.name.trim() : "",
              confidence: clampConfidence(item?.confidence)
            }))
            .filter((item) => item.name)
            .slice(0, 4)
        : [],
      categorySignals: Array.isArray(parsed.categorySignals)
        ? cleanShortArray(parsed.categorySignals, 8)
        : [],
      conditionSignals: Array.isArray(parsed.conditionSignals)
        ? cleanShortArray(parsed.conditionSignals, 8)
        : [],
      imageObservations: Array.isArray(parsed.imageObservations)
        ? parsed.imageObservations
            .map((item) => ({
              role: typeof item?.role === "string" ? item.role.trim() : "unknown",
              ocrText: normalizeOcrText(Array.isArray(item?.ocrText) ? item.ocrText : []),
              upc: normalizeVisionUpc(item?.upc),
              titleText: typeof item?.titleText === "string" ? cleanVisionTitle(item.titleText) : "",
              brandText: typeof item?.brandText === "string" ? item.brandText.trim() : "",
              priceText: typeof item?.priceText === "string" ? item.priceText.trim() : "",
              failedOcr: Boolean(item?.failedOcr),
              confidence: clampConfidence(item?.confidence)
            }))
            .slice(0, 5)
        : [],
      visualAnchors: cleanShortArray(
        [
          ...(Array.isArray(parsed.visualAnchors) ? parsed.visualAnchors : []),
          parsed.productLogo,
          parsed.dominantBrand,
          parsed.characterName,
          parsed.flavorText,
          parsed.quantityText,
          parsed.editionMarker,
          parsed.colorwayLabel
        ],
        10
      ),
      packagingHints: cleanShortArray(
        [
          ...(Array.isArray(parsed.packagingHints) ? parsed.packagingHints : []),
          ...(Array.isArray(parsed.packagingColors) ? parsed.packagingColors : []),
          ...(Array.isArray(parsed.visualHints) ? parsed.visualHints : []),
          typeof parsed.packagingShape === "string" ? parsed.packagingShape : ""
        ],
        6
      ),
      keyDetails: Array.isArray(parsed.keyDetails)
        ? cleanShortArray(parsed.keyDetails, 8)
        : [],
      quantity: typeof parsed.quantity === "string" ? parsed.quantity.trim() : "",
      resaleLow: positivePriceOrNull(parsed.resaleLow),
      resaleSuggested: positivePriceOrNull(parsed.resaleSuggested),
      resaleHigh: positivePriceOrNull(parsed.resaleHigh),
      shippingNotes: typeof parsed.shippingNotes === "string" ? parsed.shippingNotes.trim() : "",
      upc: normalizeVisionUpc(parsed.upc),
      productLine: typeof parsed.productLine === "string" ? parsed.productLine.trim() : "",
      itemNumber: typeof parsed.itemNumber === "string" ? parsed.itemNumber.trim() : "",
      variant: typeof parsed.variant === "string" ? parsed.variant.trim() : "",
      edition: typeof parsed.edition === "string" ? parsed.edition.trim() : "",
      demand: normalizeEnum(parsed.demand, ["low", "medium", "high"]),
      sellThrough: normalizeEnum(parsed.sellThrough, ["slow", "average", "fast"]),
      bestMatches: Array.isArray(parsed.bestMatches)
        ? parsed.bestMatches
            .map((item) => ({
              name: typeof item?.name === "string" ? item.name.trim() : "",
              brand: typeof item?.brand === "string" ? item.brand.trim() : "",
              confidence: clampConfidence(item?.confidence)
            }))
            .filter((item) => item.name || item.brand)
            .slice(0, 3)
        : [],
      productCandidates: buildVisionProductCandidates(parsed),
      generatedSearchQueries: Array.from(
        new Set([
          typeof parsed.searchQuery === "string" ? cleanOcrSnippet(parsed.searchQuery) : "",
          normalizeCandidateTokens([parsed.upc]).join(" "),
          normalizeCandidateTokens([
            parsed.brand,
            parsed.itemTitle || parsed.productName,
            parsed.productLine,
            parsed.variant,
            parsed.edition,
            parsed.itemNumber
          ]).join(" "),
          normalizeCandidateTokens([
            parsed.brand,
            parsed.category,
            ...(Array.isArray(parsed.ocrText) ? parsed.ocrText : []),
            ...(Array.isArray(parsed.keyDetails) ? parsed.keyDetails : [])
          ]).join(" ")
        ].filter((query) => query && query.length >= 3))
      ).slice(0, 4),
      confidence: clampConfidence(parsed.confidence),
      summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
      recognitionEvidence: Array.isArray(parsed.recognitionEvidence)
        ? parsed.recognitionEvidence
            .map((value) => (typeof value === "string" ? value.trim() : ""))
            .filter(Boolean)
            .slice(0, 5)
        : [],
      missingViews: Array.isArray(parsed.missingViews)
        ? parsed.missingViews
            .map((value) => (typeof value === "string" ? value.trim() : ""))
            .filter(Boolean)
            .slice(0, 4)
        : []
    };
  } catch {
    return emptyVisionPayload();
  }
}

function imageDataUrl(fullpath, mimetype = "image/jpeg") {
  const base64 = fs.readFileSync(fullpath).toString("base64");
  return `data:${mimetype};base64,${base64}`;
}

function withVisionTimeout(operation) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("OpenAI vision request timed out"));
    }, VISION_TIMEOUT_MS);
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timeoutId));
}

async function analyzeProductImages({ images, bossBrainContext = null }) {
  const access = getOpenAiAccessStatus();
  if (!access.enabled) {
    console.warn("Boss Listers OpenAI API key missing", {
      reason: access.reason,
      fallback: true
    });
    return null;
  }
  const startedAt = Date.now();
  const totalImageBytes = (images || []).reduce((sum, image) => {
    try {
      return sum + fs.statSync(image.fullpath).size;
    } catch {
      return sum;
    }
  }, 0);
  if (totalImageBytes > MAX_VISION_IMAGE_BYTES) {
    console.warn("Boss Listers vision payload too large; using non-vision fallback", {
      imageBytes: totalImageBytes,
      maxImageBytes: MAX_VISION_IMAGE_BYTES
    });
    return null;
  }

  const imageInputs = (images || []).slice(0, 5).map((image) => ({
    type: "input_image",
    image_url: imageDataUrl(image.fullpath, image.mimetype || "image/jpeg")
  }));
  if (!imageInputs.length) return null;

  const bossBrainText = bossBrainContext
    ? `Boss Brain local memory context: ${JSON.stringify(bossBrainContext).slice(0, 6000)}`
    : "";
  let client;
  try {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  } catch (error) {
    console.warn("Boss Listers OpenAI SDK initialization failed", {
      reason: classifyOpenAiError(error).reason,
      fallback: true
    });
    throw error;
  }
  const response = await withVisionTimeout(
    client.responses.create({
      model: DEFAULT_MODEL,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: VISION_PROMPT },
            ...(bossBrainText ? [{ type: "input_text", text: bossBrainText }] : []),
            ...imageInputs
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "boss_listers_product_scan",
          strict: true,
          schema: VISION_JSON_SCHEMA
        }
      }
    })
  );

  const text =
    response.output_text ||
    response.output
      ?.flatMap((item) => item.content || [])
      .map((item) => item.text || "")
      .join("\n") ||
    "";

  const parsed = parseVisionPayload(text);
  Object.defineProperty(parsed, "__visionMeta", {
    enumerable: false,
    value: {
      durationMs: Date.now() - startedAt,
      model: DEFAULT_MODEL,
      imageCount: imageInputs.length,
      imageBytes: totalImageBytes,
      usage: response.usage || null,
      estimatedTokens:
        Number(response.usage?.total_tokens) ||
        Number(response.usage?.totalTokens) ||
        Math.ceil(totalImageBytes / 1024) * 85
    }
  });
  return parsed;
}

// Node/dev-mode path: reads from a filepath on disk (pages/api/analyze.js,
// local `next dev` only — never runs in the Cloudflare Workers deployment).
async function analyzeProductImage({
  fullpath,
  mimetype = "image/jpeg",
  fetchImpl = fetch
}) {
  if (!process.env.OPENAI_API_KEY) return null;
  return callVisionApi(
    process.env.OPENAI_API_KEY,
    imageDataUrl(fullpath, mimetype),
    fetchImpl,
    DEFAULT_MODEL
  );
}

// Workers-safe path: takes raw bytes directly (from request.formData()),
// no filesystem involved. Used by functions/api/analyze.js in production.
async function analyzeProductImageFromBytes({
  arrayBuffer,
  mimetype = "image/jpeg",
  apiKey,
  model = DEFAULT_MODEL,
  fetchImpl = fetch
}) {
  if (!apiKey) return null;
  const base64 = bytesToBase64(new Uint8Array(arrayBuffer));
  return callVisionApi(apiKey, `data:${mimetype};base64,${base64}`, fetchImpl, model);
}

module.exports = {
  analyzeProductImages,
  classifyOpenAiError,
  getOpenAiAccessStatus,
  parseVisionPayload,
  normalizeOcrText,
  isVisionEnabled
};
