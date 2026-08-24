import fs from "fs-extra";
import path from "path";
import { randomUUID } from "crypto";
import { inferFromFile } from "./imageHeuristics";
import { generateForAll } from "./generator";
import { saveListing } from "./store";
import { getPricingRecommendation } from "./pricingIntelligence";
import {
  analyzeProductImages,
  classifyOpenAiError,
  getOpenAiAccessStatus,
  isVisionEnabled
} from "./openaiVision";
import { buildTrustedCompSummary, getCompsIntelligence } from "./compsIntelligence";
import { lookupProductByBarcode } from "./productLookupService";
import { getMarketplaceSignals } from "./marketDataAdapters";
import { buildResaleIntelligence } from "./resaleIntelligenceService";
import { runResellerEngine } from "./resellerEngine/runResellerEngine";
import { orchestrateListings } from "./listingOrchestrator/orchestrator";
import { buildInventorySyncSnapshot } from "./inventoryEngine/inventorySyncEngine";
import { buildInventoryOSSnapshot } from "./inventoryOS/inventoryStore";
import { sanitizePayload } from "./dataSafety/sanitizePayload";
import { getOrSetCachedValue } from "./storage/cacheEngine";
import { persistExecutionSnapshot } from "./storage/snapshotEngine";
import { runExecutionAgents } from "./agents/executionAgent";
import { normalizeBarcodeValue } from "./barcodeService";
import { calculateManualCompOverride } from "./pricing/manualCompOverride";
import { extractVerifiedSoldCompPrice } from "./pricing/liveSoldCompLookup";
import { routePricingSource } from "./pricing/pricingSourceRouter";
import { buildScanMatchingKeys, findMatchingUserCorrection, mergeUserCorrectionIntoProduct } from "./userCorrections/correctionMerge";
import { calculateUserVerifiedPricing } from "./userCorrections/correctionPricingMemory";
import { findPersonalSaleMatch } from "./salesHistory/salesMatchEngine";
import { calculatePersonalSalePricing } from "./salesHistory/personalPricingModel";
import {
  validateOrRepairAnalyzeDashboardPayload,
  validateOrRepairAnalysisResult,
  validateOrRepairNormalizedListing
} from "./normalizedListingSchema";
import { logError, logInfo, logWarn } from "./serverLog";

const MAX_FILES = 5;
const MAX_FILE_SIZE = 12 * 1024 * 1024;
const MAX_TOTAL_FILE_SIZE = 24 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 6000;
const MAX_IMAGE_PIXELS = 32_000_000;
const AI_FALLBACK_NOTICE = "AI vision unavailable; pricing requires sold comps.";
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif"
]);
const MARKETING_PHRASES = [
  "VALUE PACK",
  "CLEARANCE",
  "ROLLBACK",
  "TRENDING",
  "20% MORE FREE",
  "BONUS",
  "LIMITED TIME"
];
const COLOR_WORDS = [
  "black",
  "white",
  "red",
  "blue",
  "green",
  "yellow",
  "orange",
  "purple",
  "pink",
  "gray",
  "grey",
  "silver",
  "gold",
  "brown",
  "tan",
  "clear"
];
const TOY_CATEGORY_PATTERNS = [
  /hot wheels/i,
  /transformers/i,
  /pok[eé]mon/i,
  /funko/i,
  /\blego\b/i,
  /action figure/i,
  /blister card/i,
  /die-?cast/i,
  /collectible/i,
  /lego/i,
  /funko/i,
  /pokemon/i,
  /doll/i,
  /plush/i
];
const ELECTRONICS_CATEGORY_PATTERNS = [
  /headphones?/i,
  /earbuds?/i,
  /speaker/i,
  /console/i,
  /controller/i,
  /charger/i,
  /bluetooth/i,
  /wireless/i,
  /usb-?c/i,
  /hdmi/i,
  /power bank/i,
  /tablet/i,
  /smart ?watch/i,
  /keyboard/i,
  /mouse/i,
  /router/i
];
const FOOTWEAR_CATEGORY_PATTERNS = [/shoe/i, /sneaker/i, /boot/i];
const CLOTHING_CATEGORY_PATTERNS = [
  /shirt/i,
  /tee\b/i,
  /hoodie/i,
  /jacket/i,
  /pants/i,
  /jeans/i,
  /shorts/i,
  /dress/i,
  /sweater/i,
  /apparel/i,
  /new with tags/i,
  /\bnwt\b/i
];
const HOUSEHOLD_CATEGORY_PATTERNS = [
  /kitchen/i,
  /cookware/i,
  /storage/i,
  /container/i,
  /organizer/i,
  /bedding/i,
  /towel/i,
  /lamp/i,
  /decor/i,
  /home/i,
  /vacuum/i,
  /filter/i,
  /rubbermaid/i,
  /sterilite/i,
  /mainstays/i
];
const KNOWN_BRANDS = [
  "Hasbro",
  "Mattel",
  "Hot Wheels",
  "LEGO",
  "Funko",
  "Nintendo",
  "Pokemon",
  "Pokémon",
  "Sony",
  "Microsoft",
  "Xbox",
  "PlayStation",
  "Apple",
  "Samsung",
  "Anker",
  "Onn",
  "JBL",
  "Bose",
  "Beats",
  "Philips",
  "Nike",
  "Adidas",
  "Under Armour",
  "Hanes",
  "Levi's",
  "Mainstays",
  "Better Homes",
  "Rubbermaid",
  "Sterilite",
  "Pyrex",
  "Hamilton Beach",
  "Black+Decker",
  "Pokémon"
];

const SOURCE_COST_CHANNELS = [
  { sourceId: "walmart", sourceName: "Walmart" },
  { sourceId: "target", sourceName: "Target" },
  { sourceId: "dollartree", sourceName: "Dollar Tree" },
  { sourceId: "tjmaxx", sourceName: "TJ Maxx" },
  { sourceId: "ross", sourceName: "Ross" },
  { sourceId: "manual", sourceName: "Manual Cost" },
  { sourceId: "wholesale", sourceName: "Wholesale Sheet" },
  { sourceId: "csv_upload", sourceName: "CSV Upload" }
];

export class RequestValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "RequestValidationError";
  }
}

function valueFromForm(formData, key, fallback = "") {
  const value = formData.get(key);
  return typeof value === "string" ? value : fallback;
}

function parseJsonField(formData, key) {
  try {
    const raw = valueFromForm(formData, key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function normalizeCostBasis(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Number(number.toFixed(2)) : null;
}

function normalizePositiveCurrency(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Number(number.toFixed(2)) : null;
}

function firstSourceCost(sourceCostProfiles = []) {
  const walmart = sourceCostProfiles.find((source) => source.sourceId === "walmart")?.costBasis;
  if (walmart != null) return walmart;
  const manual = sourceCostProfiles.find((source) => source.sourceId === "manual")?.costBasis;
  return manual ?? null;
}

function normalizeSourceStoreType(value = "") {
  const normalized = String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "WALMART") return "WALMART";
  if (normalized === "DOLLAR_TREE" || normalized === "DOLLARTREE") return "DOLLAR_TREE";
  if (normalized === "MANUAL" || normalized === "MANUAL_COST") return "MANUAL";
  return "";
}

function parseSourceStoreContext(formData) {
  const parsed = parseJsonField(formData, "sourceStoreContext") || parseJsonField(formData, "sourceStoreConfig");
  const source = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  const contextManualOverride =
    source.manualOverrideValue ??
    source.customCostBasis ??
    source.manualCost;
  const manualOverrideValue =
    (contextManualOverride ?? valueFromForm(formData, "manualOverrideValue")) ||
    valueFromForm(formData, "customCostBasis") ||
    valueFromForm(formData, "costOfGoods");
  return {
    ...source,
    sourceStoreType:
      source.sourceStoreType ||
      source.sourceType ||
      source.storeType ||
      valueFromForm(formData, "sourceStoreType"),
    presetCost:
      source.presetCost ??
      source.presetAcquisitionCost ??
      valueFromForm(formData, "sourceStorePresetCost"),
    manualOverrideValue
  };
}

function resolveCostBasis(sourceStoreContext = {}, enrichmentData = {}) {
  const sourceStoreType =
    normalizeSourceStoreType(sourceStoreContext.sourceStoreType) ||
    (enrichmentData.productLookup?.sourceId === "walmart" ? "WALMART" : "");
  const manualOverrideValue = normalizeCostBasis(sourceStoreContext.manualOverrideValue);
  const presetCost = normalizeCostBasis(sourceStoreContext.presetCost);
  const walmartPrice =
    enrichmentData.productLookup?.sourceId === "walmart"
      ? normalizeCostBasis(enrichmentData.productLookup.walmartPrice)
      : null;

  if (sourceStoreType === "DOLLAR_TREE") {
    const dollarTreeCost =
      manualOverrideValue ?? ([1.25, 1.5].includes(presetCost) ? presetCost : 1.25);
    return {
      sourceStoreType,
      resolvedCostBasis: dollarTreeCost,
      lookupSource: "Dollar Tree preset",
      manualOverrideValue
    };
  }

  if (sourceStoreType === "MANUAL") {
    return {
      sourceStoreType,
      resolvedCostBasis: manualOverrideValue ?? 0,
      lookupSource: "Manual Cost",
      manualOverrideValue
    };
  }

  if (sourceStoreType === "WALMART") {
    return {
      sourceStoreType,
      resolvedCostBasis: manualOverrideValue ?? walmartPrice ?? 0,
      lookupSource: manualOverrideValue != null ? "Walmart shelf price" : enrichmentData.productLookup?.source || "Walmart",
      manualOverrideValue
    };
  }

  return {
    sourceStoreType: "",
    resolvedCostBasis: 0,
    lookupSource: enrichmentData.productLookup?.source || "",
    manualOverrideValue
  };
}

function getResellerOverride(formData, sourceCostProfiles = []) {
  const manualEstimateRaw =
    valueFromForm(formData, "manualSoldCompPrice") ||
    valueFromForm(formData, "manualResaleEstimate") ||
    valueFromForm(formData, "manualEstimatedResale");
  const manualEstimate = normalizePositiveCurrency(manualEstimateRaw);
  const manualLow = normalizePositiveCurrency(valueFromForm(formData, "manualSoldLow"));
  const manualHigh = normalizePositiveCurrency(valueFromForm(formData, "manualSoldHigh"));
  const estimate =
    manualEstimate ??
    (manualLow != null && manualHigh != null ? Number(((manualLow + manualHigh) / 2).toFixed(2)) : null);
  if (estimate == null) return null;
  const manualCostPaid = normalizePositiveCurrency(valueFromForm(formData, "manualCostPaid"));
  const costBasis = manualCostPaid ?? firstSourceCost(sourceCostProfiles);
  const manual = calculateManualCompOverride({
    soldCompPrice: estimate,
    costPaid: costBasis,
    shippingEstimate: valueFromForm(formData, "manualShippingEstimate"),
    packagingCost: valueFromForm(formData, "packagingCost")
  });
  const netProfit = manual?.netProfit ?? null;
  const roi = manual?.roi ?? null;
  const recommendation =
    netProfit == null || roi == null
      ? "MANUAL_REVIEW"
      : netProfit <= 0 || roi < 15
        ? "SKIP"
        : roi >= 35
          ? "HOLD"
          : "MANUAL_REVIEW";
  return {
    estimate,
    low: manualLow,
    high: manualHigh,
    costBasis,
    shippingEstimate: manual?.shippingEstimate ?? null,
    packagingCost: manual?.packagingCost ?? 0,
    netProfit,
    roi,
    recommendation,
    confidenceNote: valueFromForm(formData, "resellerConfidenceNote").trim(),
    sourcingNotes: valueFromForm(formData, "sourcingNotes").trim()
  };
}

function getSourceCostProfiles(formData, manualCost, productLookup = null, sourceCostResolution = null) {
  const parsedProfiles = parseJsonField(formData, "sourceCostProfiles");
  const parsedCosts = parseJsonField(formData, "sourceCosts");
  const profileList = Array.isArray(parsedProfiles) ? parsedProfiles : [];
  const profileMap = new Map(
    profileList
      .filter((profile) => profile && typeof profile === "object")
      .map((profile) => [String(profile.sourceId || ""), profile])
  );
  const costMap = parsedCosts && typeof parsedCosts === "object" && !Array.isArray(parsedCosts) ? parsedCosts : {};

  return SOURCE_COST_CHANNELS.map((channel) => {
    const profile = profileMap.get(channel.sourceId) || {};
    const hasProfileCost = Object.prototype.hasOwnProperty.call(profile, "costBasis");
    const hasCostMapCost = Object.prototype.hasOwnProperty.call(costMap, channel.sourceId);
    const resolvedSourceId =
      sourceCostResolution?.sourceStoreType === "DOLLAR_TREE"
        ? "dollartree"
        : sourceCostResolution?.sourceStoreType === "MANUAL"
          ? "manual"
          : sourceCostResolution?.sourceStoreType === "WALMART"
            ? "walmart"
            : "";
    const lookupCost =
      channel.sourceId === "walmart" &&
      productLookup?.sourceId === "walmart" &&
      sourceCostResolution?.sourceStoreType !== "DOLLAR_TREE"
        ? productLookup.walmartPrice
        : null;
    const costBasis = normalizeCostBasis(
      hasProfileCost
        ? profile.costBasis
        : hasCostMapCost
          ? costMap[channel.sourceId]
          : channel.sourceId === resolvedSourceId
            ? sourceCostResolution.resolvedCostBasis
          : channel.sourceId === "manual"
            ? manualCost
            : lookupCost
    );
    return Object.freeze({
      sourceId: channel.sourceId,
      sourceName: channel.sourceName,
      costBasis,
      isUserOverride: Boolean(
        profile.isUserOverride ||
          costMap[channel.sourceId] != null ||
          (channel.sourceId === "manual" && costBasis != null)
      )
    });
  });
}

function fileExtension(file) {
  const ext = path.extname(file.name || "");
  if (ext) return ext.toLowerCase();
  if (file.type === "image/png") return ".png";
  if (file.type === "image/webp") return ".webp";
  return ".jpg";
}

function getImageDimensions(buffer, mimetype = "") {
  if (mimetype === "image/png" && buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if ((mimetype === "image/jpeg" || mimetype === "image/jpg") && buffer.length >= 4) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7)
        };
      }
      offset += 2 + length;
    }
  }
  if (mimetype === "image/webp" && buffer.length >= 30 && buffer.toString("ascii", 0, 4) === "RIFF") {
    const chunk = buffer.toString("ascii", 12, 16);
    if (chunk === "VP8X" && buffer.length >= 30) {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3)
      };
    }
  }
  return { width: 0, height: 0 };
}

function enforceImageDimensions({ width, height }) {
  if (!width || !height) return;
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    throw new RequestValidationError(
      `Image dimensions are too large. Use photos under ${MAX_IMAGE_DIMENSION}px on each side.`
    );
  }
  if (width * height > MAX_IMAGE_PIXELS) {
    throw new RequestValidationError("Image resolution is too large. Use a smaller compressed photo.");
  }
}

function getUploadedFiles(formData) {
  const files = ["photos", "photo", "file"]
    .flatMap((key) => formData.getAll(key))
    .filter((value) => value && typeof value.arrayBuffer === "function" && value.size > 0);

  if (files.length > MAX_FILES) {
    throw new RequestValidationError(`Upload up to ${MAX_FILES} images at a time.`);
  }
  const totalBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
  if (totalBytes > MAX_TOTAL_FILE_SIZE) {
    throw new RequestValidationError("Total upload is too large. Use compressed product photos.");
  }
  files.forEach((file) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      throw new RequestValidationError("Upload JPEG, PNG, or WEBP images only.");
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new RequestValidationError("Each image must be 12MB or smaller.");
    }
  });
  return files;
}

async function persistUploads(files) {
  const uploadsDir = process.env.UPLOADS_DIR || "uploads";
  const absoluteDir = path.join(process.cwd(), "public", uploadsDir);
  await fs.ensureDir(absoluteDir);

  return Promise.all(
    files.map(async (file) => {
      const filename = `${Date.now()}-${randomUUID()}${fileExtension(file)}`;
      const filepath = path.join(absoluteDir, filename);
      const buffer = Buffer.from(await file.arrayBuffer());
      const dimensions = getImageDimensions(buffer, file.type || "");
      enforceImageDimensions(dimensions);
      await fs.writeFile(filepath, buffer);

      return {
        filepath,
        mimetype: file.type || "image/jpeg",
        originalName: file.name || "",
        relativeUrl: `/${uploadsDir}/${filename}`,
        sizeBytes: buffer.length,
        width: dimensions.width,
        height: dimensions.height,
        compressionApplied: false
      };
    })
  );
}

function cleanText(value = "") {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function candidateTokens(...values) {
  return Array.from(
    new Set(
      values
        .flatMap((value) =>
          cleanText(value)
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
        )
        .filter((token) => token.length >= 3 && !["item", "product", "unknown"].includes(token))
    )
  ).slice(0, 8);
}

function normalizeProductCandidate(candidate = {}, fallbackSource = "scan") {
  if (!candidate || typeof candidate !== "object") return null;
  const title = stripMarketingPhrases(candidate.title || candidate.itemTitle || candidate.name || "");
  if (!title || looksLikeWeakIdentity(title)) return null;
  const confidence =
    Number(candidate.confidence) <= 1
      ? Math.round((Number(candidate.confidence) || 0) * 100)
      : Math.round(Number(candidate.confidence) || 0);
  return {
    title,
    brand: cleanText(candidate.brand),
    category: cleanText(candidate.category),
    upc: normalizeSubmittedBarcode(candidate.upc),
    source: cleanText(candidate.source) || fallbackSource,
    confidence: Math.max(0, Math.min(100, confidence)),
    matchedTokens: candidateTokens(
      title,
      candidate.brand,
      candidate.category,
      ...(Array.isArray(candidate.matchedTokens) ? candidate.matchedTokens : [])
    ),
    reasonSuggested: cleanText(candidate.reasonSuggested) || "Matched scan identity evidence."
  };
}

function buildProductCandidates({ merged = {}, input = {}, productLookup = null, confirmedIdentity = null, formData } = {}) {
  const candidates = [];
  const addCandidate = (candidate, fallbackSource) => {
    const normalized = normalizeProductCandidate(candidate, fallbackSource);
    if (normalized) candidates.push(normalized);
  };

  addCandidate(confirmedIdentity, "manual correction history");
  if (productLookup?.title) {
    addCandidate(
      {
        title: productLookup.title,
        brand: productLookup.brand,
        category: productLookup.category,
        upc: productLookup.upc,
        source: productLookup.sourceId === "walmart" ? "Walmart UPC enrichment" : productLookup.source,
        confidence: productLookup.confidence,
        reasonSuggested: "UPC lookup returned this product identity."
      },
      "Walmart UPC enrichment"
    );
  }
  addCandidate(
    {
      title: buildResellerTitle({ merged, input }) || merged.itemTitle,
      brand: merged.brand || input.brand,
      category: merged.category || input.categoryHint,
      upc: merged.upc || input.upc,
      source: "OCR title extraction",
      confidence: Math.round((Number(merged.confidence) || 0.45) * 100),
      reasonSuggested: "OCR and packaging text produced this reseller title."
    },
    "OCR title extraction"
  );
  (merged.productCandidates || []).forEach((candidate) => addCandidate(candidate, candidate.source || "OpenAI vision title"));
  (merged.bestMatches || []).forEach((match) =>
    addCandidate(
      {
        title: match.name,
        brand: match.brand || merged.brand || input.brand,
        category: merged.category || input.categoryHint,
        upc: merged.upc || input.upc,
        source: "OpenAI vision match",
        confidence: match.confidence,
        reasonSuggested: "Vision model included this as a nearby product match."
      },
      "OpenAI vision match"
    )
  );
  const previousMemory = parseJsonField(formData, "previousScanMemory");
  const manualHistory = parseJsonField(formData, "manualCorrectionHistory");
  [previousMemory, manualHistory].flat().filter(Boolean).forEach((candidate) =>
    addCandidate(candidate, candidate?.source || "previous scan memory")
  );

  const seen = new Set();
  return candidates
    .sort((a, b) => b.confidence - a.confidence)
    .filter((candidate) => {
      const key = `${candidate.upc || ""}|${candidate.title}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

function buildCalibrationTuning({ history = [], analysis = {}, trustedCompSummary = {} } = {}) {
  const events = Array.isArray(history) ? history : [];
  const upc = String(analysis.upc || "").replace(/\D/g, "");
  const title = cleanText(analysis.itemTitle).toLowerCase();
  const sameUpcConfirmed = events.filter(
    (event) =>
      event?.candidate &&
      String(event.upc || event.listingUpc || event.candidate?.upc || "").replace(/\D/g, "") === upc &&
      ["use_candidate", "manual_entry"].includes(String(event.action || ""))
  ).length;
  const sameTitleConfirmed = events.filter(
    (event) =>
      event?.candidate?.title &&
      cleanText(event.candidate.title).toLowerCase() === title &&
      ["use_candidate", "manual_entry"].includes(String(event.action || ""))
  ).length;
  const manualOverrides = events.filter((event) =>
    ["wrong_item", "wrong_variant", "bundle_multipack", "manual_entry"].includes(String(event.action || ""))
  ).length;
  const dominantRejectionCount = Math.max(
    0,
    ...Object.values(trustedCompSummary.rejectionReasons || {}).map((count) => Number(count) || 0)
  );
  const positive = Math.min(12, sameUpcConfirmed * 4 + sameTitleConfirmed * 2);
  const negative = Math.min(20, manualOverrides * 2 + (dominantRejectionCount >= 3 ? 6 : 0));
  const adjustment = positive - negative;
  const reasons = [
    sameUpcConfirmed ? `${sameUpcConfirmed} prior confirmations matched this UPC` : "",
    sameTitleConfirmed ? `${sameTitleConfirmed} prior confirmations matched this title` : "",
    manualOverrides ? `${manualOverrides} correction events lower confidence` : "",
    dominantRejectionCount >= 3 ? "Repeated comp rejection pattern lowers confidence" : ""
  ].filter(Boolean);
  return { adjustment, reasons, sameUpcConfirmed, sameTitleConfirmed, manualOverrides };
}

function inferImageRole(file = {}, index = 0) {
  const name = `${file.originalName || ""} ${file.relativeUrl || ""}`.toLowerCase();
  if (/barcode|upc|ean/.test(name)) return "barcode";
  if (/shelf|tag|price|clearance/.test(name)) return "shelf_tag";
  if (/back|rear|nutrition|ingredients|spec/.test(name)) return "back";
  if (/close|detail|zoom|label/.test(name)) return "close_up";
  if (/front|cover|main/.test(name) || index === 0) return "front";
  return "unknown";
}

function normalizeObservationRole(value = "", fallback = "unknown") {
  const role = String(value || "").toLowerCase().replace(/[\s-]+/g, "_");
  return ["front", "back", "barcode", "shelf_tag", "close_up", "unknown"].includes(role) ? role : fallback;
}

function mergeImageRoleTelemetry({ uploaded = [], ai = null, scannedBarcode = "" } = {}) {
  const observations = Array.isArray(ai?.imageObservations) ? ai.imageObservations : [];
  const roles = uploaded.map((file, index) => {
    const inferredRole = inferImageRole(file, index);
    const observation = observations[index] || {};
    const role = normalizeObservationRole(observation.role, inferredRole);
    const upc = normalizeSubmittedBarcode(observation.upc) || (role === "barcode" ? normalizeSubmittedBarcode(scannedBarcode) : "");
    const ocrText = Array.isArray(observation.ocrText) ? observation.ocrText.filter(Boolean) : [];
    return {
      index,
      role,
      inferredRole,
      upc,
      titleText: cleanText(observation.titleText),
      brandText: cleanText(observation.brandText),
      priceText: cleanText(observation.priceText),
      failedOcr: Boolean(observation.failedOcr) || (!ocrText.length && !upc && !observation.titleText),
      confidence: Math.max(0, Math.min(1, Number(observation.confidence) || 0)),
      ocrText
    };
  });
  const upcRole = roles.find((item) => item.upc && item.role === "barcode") || roles.find((item) => item.upc);
  const titleRole = roles.find((item) => item.titleText && item.role === "front") || roles.find((item) => item.titleText);
  const pricingRole = roles.find((item) => item.priceText && item.role === "shelf_tag") || roles.find((item) => item.priceText);
  const failedOcrRoles = roles.filter((item) => item.failedOcr).map((item) => item.role);
  const normalizedUpcs = Array.from(new Set(roles.map((item) => item.upc).filter(Boolean)));
  const normalizedBrands = Array.from(new Set(roles.map((item) => item.brandText.toLowerCase()).filter(Boolean)));
  const normalizedTitles = Array.from(new Set(roles.map((item) => item.titleText.toLowerCase()).filter(Boolean)));
  const contradictions = [
    normalizedUpcs.length > 1 ? "conflicting_upc" : "",
    normalizedBrands.length > 1 ? "conflicting_brand" : "",
    normalizedTitles.length > 1 ? "conflicting_title" : ""
  ].filter(Boolean);
  const confirmedSignals = [
    normalizedUpcs.length === 1 && roles.filter((item) => item.upc === normalizedUpcs[0]).length > 1 ? "upc" : "",
    normalizedBrands.length === 1 && roles.filter((item) => item.brandText.toLowerCase() === normalizedBrands[0]).length > 1 ? "brand" : "",
    normalizedTitles.length === 1 && roles.filter((item) => item.titleText.toLowerCase() === normalizedTitles[0]).length > 1 ? "title" : ""
  ].filter(Boolean);
  return {
    roles,
    upcResolvedBy: upcRole?.role || "",
    titleResolvedBy: titleRole?.role || "",
    pricingResolvedBy: pricingRole?.role || "",
    failedOcrRoles,
    contradictions,
    confirmedSignals,
    confidenceAdjustment: Math.max(-0.22, Math.min(0.14, confirmedSignals.length * 0.04 - contradictions.length * 0.11))
  };
}

function stripMarketingPhrases(value = "") {
  return cleanText(
    MARKETING_PHRASES.reduce(
      (next, phrase) => next.replace(new RegExp(`\\b${phrase}\\b`, "gi"), " "),
      cleanText(value)
    )
  );
}

function stripCaptureContext(value = "") {
  let cleaned = stripMarketingPhrases(value);
  for (let index = 0; index < 3; index += 1) {
    cleaned = cleaned
      .replace(/^(front|back|side|bottom|top|barcode|upc|label|closeup|close-up|photo|image)\s+/i, "")
      .replace(/\s+(front|back|side|bottom|top|barcode|upc|label|closeup|close-up|photo|image)$/i, "")
      .trim();
  }
  return cleaned;
}

function looksLikeGeneratedIdentifier(value = "") {
  const compact = cleanText(value);
  return (
    !compact ||
    /^\d{10,}-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      compact
    ) ||
    /^[0-9a-f-]{24,}$/i.test(compact) ||
    /^img[_-]?\d+$/i.test(compact) ||
    /^image[_-]?\d+$/i.test(compact)
  );
}

function looksLikeWeakIdentity(value = "") {
  const cleaned = stripMarketingPhrases(value).toLowerCase();
  const compact = cleaned.replace(/\s+/g, "");
  return (
    !cleaned ||
    /^\d{4}-\d{2}-\d{2}t\d{2}/i.test(cleaned) ||
    /^\d{10,}$/.test(compact) ||
    /^\d{6,}\s+(item|product)\s+\d{8,14}$/i.test(cleaned) ||
    /^(item|product)\s+\d{8,14}$/i.test(cleaned) ||
    /^[a-z]$/i.test(cleaned) ||
    /^[a-z]\s+(item|product|thing|object)$/i.test(cleaned) ||
    /^[a-z0-9-]{10,}$/i.test(compact) && !/[aeiou]/i.test(compact) ||
    looksLikeGeneratedIdentifier(cleaned) ||
    /^(s|x|n\/a|na|unknown|item|product|scanned item)$/.test(cleaned) ||
    /^[a-z]\s+(item|product)$/i.test(cleaned) ||
    /^(unverified|unidentified)\s+(item|product)$/i.test(cleaned)
  );
}

function inferCollectibleBrandFromEvidence(merged = {}) {
  const text = evidenceText(merged).toLowerCase();
  if (/\btransformers?\b|age of the primes|optimus prime|megatron|autobot|decepticon/.test(text)) {
    return "Hasbro";
  }
  if (/hot wheels|matchbox|barbie|masters of the universe|mattel/.test(text)) {
    return "Mattel";
  }
  if (/pokemon|pok[eÃ©]mon|pikachu|charizard|tcg/.test(text)) {
    return "Nintendo / Game Freak";
  }
  return "";
}

function extractCollectibleVariantName(evidence = "", franchise = "", productLine = "") {
  const cleaned = stripMarketingPhrases(evidence);
  const escapedLine = productLine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lineMatch = escapedLine
    ? cleaned.match(new RegExp(`${escapedLine}\\s+([A-Za-z][A-Za-z0-9' -]{2,32})`, "i"))
    : null;
  if (lineMatch?.[1]) {
    return cleanText(lineMatch[1].replace(/\b(figure|toy|ages?|new|sealed|nib)\b/gi, " "));
  }

  const knownNames = [
    "Sideways",
    "Optimus Prime",
    "Megatron",
    "Bumblebee",
    "Starscream",
    "Soundwave",
    "Pikachu",
    "Charizard"
  ];
  return knownNames.find((name) => new RegExp(`\\b${name}\\b`, "i").test(cleaned)) || "";
}

function buildOcrPriorityTitle(merged = {}) {
  const ocrText = (merged.ocrText || [])
    .map(cleanIdentityPhrase)
    .filter((value) => value && !looksLikeWeakIdentity(value));
  if (!ocrText.length) return "";
  const evidence = ocrText.join(" ");
  const brand = cleanText(merged.brand) || inferCollectibleBrandFromEvidence({ ...merged, ocrText });
  const productLine =
    cleanText(merged.productLine) ||
    (/age of the primes/i.test(evidence) ? "Age of the Primes" : "");
  const franchise =
    /transformers/i.test(evidence)
      ? "Transformers"
      : /hot wheels/i.test(evidence)
        ? "Hot Wheels"
        : /pokemon|pok[eÃ©]mon/i.test(evidence)
          ? "Pokemon"
          : "";
  const variant = extractCollectibleVariantName(evidence, franchise, productLine);
  const distinctive = ocrText
    .filter((value) => !/^\d{8,14}$/.test(value.replace(/\D/g, "")))
    .filter((value) => !variant || !value.toLowerCase().includes(variant.toLowerCase()))
    .sort((a, b) => scoreTitleHintCandidate(b) - scoreTitleHintCandidate(a))[0];
  const parts = [];
  appendUnique(parts, brand);
  appendUnique(parts, franchise);
  appendUnique(parts, productLine);
  appendUnique(parts, variant);
  if (!variant) appendUnique(parts, distinctive);
  return cleanText(parts.join(" "));
}

function appendUnique(parts, value) {
  const cleaned = stripMarketingPhrases(value);
  if (!cleaned || looksLikeWeakIdentity(cleaned)) return;
  const normalized = cleaned.toLowerCase();
  if (!parts.some((part) => part.toLowerCase() === normalized)) {
    parts.push(cleaned);
  }
}

function buildResellerTitle({ merged = {}, input = {} } = {}) {
  const ocrPriorityTitle = buildOcrPriorityTitle(merged);
  if (ocrPriorityTitle && hasStrongIdentityEvidence({ ...merged, itemTitle: ocrPriorityTitle })) {
    return titleCase(ocrPriorityTitle);
  }
  const directTitle = stripCaptureContext(
    merged.itemTitle || input.suggestedTitle || input.model || merged.titleHint
  );
  const strongIdentity = hasStrongIdentityEvidence(merged);
  const categoryBackedIdentity =
    Boolean(merged.brand || input.brand || merged.category || input.categoryHint) &&
    directTitle.split(/\s+/).filter(Boolean).length >= 2;
  const directTitleUsable =
    directTitle &&
    !looksLikeWeakIdentity(directTitle) &&
    !["item", "product", "scanned item", "unknown"].includes(directTitle.toLowerCase()) &&
    (strongIdentity || categoryBackedIdentity);
  const parts = [];

  const brand = cleanText(merged.brand || input.brand);
  const productLine = cleanText(merged.productLine);
  if (
    directTitleUsable &&
    brand &&
    productLine &&
    directTitle.toLowerCase().includes(brand.toLowerCase()) &&
    directTitle.toLowerCase().includes(productLine.toLowerCase())
  ) {
    return cleanText([brand, productLine, merged.itemNumber, merged.variant, merged.edition].filter(Boolean).join(" "));
  }
  if (!directTitle.toLowerCase().includes(brand.toLowerCase())) {
    appendUnique(parts, brand);
  }
  appendUnique(parts, productLine);
  if (directTitleUsable) appendUnique(parts, directTitle);
  appendUnique(parts, merged.itemNumber);
  appendUnique(parts, merged.variant);
  appendUnique(parts, merged.edition);

  const composed = cleanText(parts.join(" "));
  if (composed) {
    const wordCount = composed.split(/\s+/).filter(Boolean).length;
    if (!strongIdentity && wordCount < 2) return "";
    return composed;
  }

  const bestMatch = merged.bestMatches?.find(
    (match) => cleanText(match?.name) && !looksLikeWeakIdentity(match.name)
  );
  if (bestMatch) {
    return cleanText([bestMatch.brand, bestMatch.name].filter(Boolean).join(" "));
  }

  return directTitleUsable ? directTitle : "";
}

function evidenceText(merged = {}, { excludeBrand = false } = {}) {
  return [
    merged.itemTitle,
    merged.titleHint,
    ...(merged.titleHints || []),
    excludeBrand ? "" : merged.brand,
    merged.category,
    merged.productLine,
    merged.itemNumber,
    merged.variant,
    merged.edition,
    ...(merged.ocrText || []),
    ...(merged.keyDetails || []),
    ...(merged.recognitionEvidence || []),
    ...(merged.categorySignals || []),
    ...(merged.conditionSignals || [])
  ]
    .map(stripMarketingPhrases)
    .filter(Boolean)
    .join(" ");
}

function brandAppearsInEvidence(brand = "", merged = {}) {
  const cleaned = stripMarketingPhrases(brand);
  if (!cleaned) return false;
  return new RegExp(`\\b${cleaned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(
    evidenceText(merged, { excludeBrand: true })
  );
}

function extractBrandFromEvidence(merged = {}) {
  const text = evidenceText(merged, { excludeBrand: true });
  const knownBrand = KNOWN_BRANDS.find((brand) =>
    new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)
  );
  if (knownBrand) return stripMarketingPhrases(knownBrand);

  const packagingBrand = (merged.ocrText || [])
    .map(stripMarketingPhrases)
    .find(
      (value) =>
        value &&
        value.split(/\s+/).length <= 3 &&
        /^[A-Z][A-Za-z0-9+&'.-]*(?:\s+[A-Z][A-Za-z0-9+&'.-]*){0,2}$/.test(value) &&
        !looksLikeWeakIdentity(value)
    );
  return packagingBrand || "";
}

function chooseRecognizedBrand(merged = {}) {
  const directBrand = stripMarketingPhrases(merged.brand);
  const bestCandidate = (merged.brandCandidates || [])
    .filter((candidate) => candidate?.name && Number(candidate.confidence) >= 0.65)
    .sort((a, b) => Number(b.confidence) - Number(a.confidence))[0];

  if (directBrand && brandAppearsInEvidence(directBrand, merged)) return directBrand;
  if (bestCandidate?.name && brandAppearsInEvidence(bestCandidate.name, merged)) {
    return stripMarketingPhrases(bestCandidate.name);
  }
  const knownBrand = KNOWN_BRANDS.find((brand) => brandAppearsInEvidence(brand, merged));
  if (knownBrand) return knownBrand;
  return directBrand || inferCollectibleBrandFromEvidence(merged) || extractBrandFromEvidence(merged);
}

function parseVisibleUpc(merged = {}) {
  const candidates = [
    merged.upc,
    ...(merged.ocrText || []),
    ...(merged.keyDetails || []),
    ...(merged.recognitionEvidence || [])
  ];
  for (const candidate of candidates) {
    const normalized = normalizeSubmittedBarcode(candidate);
    if (normalized) return normalized;
    const digits = String(candidate || "").replace(/\D/g, "");
    const match = digits.match(/\d{12,14}/);
    if (match) return match[0].slice(0, 14);
  }
  const secondaryText = [...(merged.titleHints || []), merged.titleHint].filter(Boolean).join(" ");
  const secondaryDigits = secondaryText.replace(/\D/g, "");
  const secondaryMatch = secondaryDigits.match(/\d{12,14}/);
  if (secondaryMatch) return secondaryMatch[0].slice(0, 14);
  return "";
}

function normalizeSubmittedBarcode(value = "") {
  return normalizeBarcodeValue(value);
}

function applyScannedBarcode(merged = {}, barcode = "") {
  const normalized = normalizeSubmittedBarcode(barcode);
  if (!normalized) return merged;

  merged.upc = normalized;
  merged.ocrText = Array.from(new Set([...(merged.ocrText || []), normalized]));
  merged.recognitionEvidence = Array.from(
    new Set([...(merged.recognitionEvidence || []), `UPC/EAN ${normalized}`])
  ).slice(0, 12);
  return merged;
}

function applyProductLookup(merged = {}, product = null) {
  if (!product?.upc) return merged;
  applyScannedBarcode(merged, product.upc);
  const hasTitle = Boolean(product.title);
  const hasTrustedTitle = hasTitle && product.confidence >= 0.5;
  if (hasTitle && (!merged.itemTitle || looksLikeWeakIdentity(merged.itemTitle))) {
    merged.itemTitle = product.title;
  }
  if ((hasTrustedTitle || !merged.titleHint) && hasTitle && !merged.titleHint) {
    merged.titleHint = product.title;
  }
  if (product.brand && !merged.brand) merged.brand = product.brand;
  if (product.category && !merged.category) merged.category = product.category;
  if (product.imageUrl) merged.productImageUrl = product.imageUrl;
  merged.productLookup = product;
  if (product.sourceId === "walmart" && product.walmartPrice != null) {
    merged.walmartPrice = product.walmartPrice;
  }
  merged.recognitionEvidence = Array.from(
    new Set([
      ...(merged.recognitionEvidence || []),
      product.source ? `Barcode lookup: ${product.source}` : "Barcode lookup"
    ])
  ).slice(0, 12);
  return merged;
}

function inferRecognizedCategory(merged = {}) {
  const text = evidenceText(merged);
  if (TOY_CATEGORY_PATTERNS.some((pattern) => pattern.test(text))) return "toys";
  if (ELECTRONICS_CATEGORY_PATTERNS.some((pattern) => pattern.test(text))) {
    return "electronics";
  }
  if (FOOTWEAR_CATEGORY_PATTERNS.some((pattern) => pattern.test(text))) return "footwear";
  if (CLOTHING_CATEGORY_PATTERNS.some((pattern) => pattern.test(text))) return "clothing";
  if (HOUSEHOLD_CATEGORY_PATTERNS.some((pattern) => pattern.test(text))) return "home";
  return stripMarketingPhrases(merged.category || merged.categoryHint);
}

function inferRecognizedCondition(merged = {}) {
  const text = evidenceText(merged).toLowerCase();
  const sealed = /\b(sealed|factory sealed|unopened|new in box|mint on card|moc)\b/.test(text);
  const shelfWear =
    /\b(shelf wear|corner wear|edge wear|light box wear|minor box wear|card wear)\b/.test(text);
  const damagedBox =
    /\b(damaged box|damaged packaging|box damage|crushed box|dented box|creased card|torn box)\b/.test(
      text
    );
  const looseOrOpen =
    /\b(loose|opened|open box|no box|out of box|without box|used)\b/.test(text);

  if (sealed && !damagedBox && !shelfWear) return "New";
  if (sealed && (damagedBox || shelfWear)) return "Like New";
  if (damagedBox || looseOrOpen) return "Used";
  return stripMarketingPhrases(merged.condition);
}

function identityEvidenceScore(merged = {}) {
  let score = 0;
  if (merged.upc) score += 3;
  if (merged.itemNumber) score += 2;
  if (merged.productLine) score += 1;
  if (merged.titleHint && !looksLikeWeakIdentity(merged.titleHint)) score += 1;
  if ((merged.ocrText || []).length) score += 1;
  if ((merged.recognitionEvidence || []).length) score += 1;
  if (merged.brand && brandAppearsInEvidence(merged.brand, merged)) score += 1;
  if ((merged.categorySignals || []).length) score += 0.5;
  if ((merged.conditionSignals || []).length) score += 0.5;
  return score;
}

function hasAmbiguousMatches(merged = {}) {
  const matches = (merged.bestMatches || [])
    .filter((match) => match?.name)
    .sort((a, b) => Number(b.confidence) - Number(a.confidence));
  if (matches.length < 2) return false;
  return Number(matches[0].confidence || 0) - Number(matches[1].confidence || 0) < 0.12;
}

function hasStrongIdentityEvidence(merged = {}) {
  return identityEvidenceScore(merged) >= 2 || Number(merged.confidence) >= 0.72;
}

function computeRecognitionConfidence(merged = {}) {
  const base = Math.max(0, Math.min(1, Number(merged.confidence) || 0));
  const evidenceScore = identityEvidenceScore(merged);
  const usefulTitle =
    (merged.itemTitle && !looksLikeWeakIdentity(merged.itemTitle)) ||
    (merged.titleHint && !looksLikeWeakIdentity(merged.titleHint));
  const uploadedImageCount = Math.max(1, Number(merged.uploadedImageCount) || 1);
  const multiImageBonus =
    uploadedImageCount > 1 && evidenceScore >= 2
      ? Math.min(0.12, (uploadedImageCount - 1) * 0.04)
      : 0;
  let score =
    base * 0.45 +
    (merged.upc ? 0.22 : 0) +
    (merged.itemNumber ? 0.1 : 0) +
    ((merged.ocrText || []).length ? 0.1 : 0) +
    ((merged.recognitionEvidence || []).length ? 0.08 : 0) +
    (merged.brand && brandAppearsInEvidence(merged.brand, merged) ? 0.08 : 0) +
    ((merged.categorySignals || []).length ? 0.05 : 0) +
    ((merged.conditionSignals || []).length ? 0.03 : 0) +
    (usefulTitle ? 0.08 : 0) +
    multiImageBonus;

  if (hasAmbiguousMatches(merged)) score -= 0.16;
  if (evidenceScore < 2 && !merged.upc && !merged.itemNumber) score = Math.min(score, 0.64);
  if (!usefulTitle && !(merged.bestMatches || []).length) score = Math.min(score, 0.45);

  return Number(Math.max(0, Math.min(0.97, score)).toFixed(2));
}

function deriveRecognitionTags(merged = {}) {
  const text = evidenceText(merged).toLowerCase();
  const tags = new Set(merged.tags || []);
  if (/hot wheels/.test(text)) tags.add("hot-wheels");
  if (/die-?cast/.test(text)) tags.add("diecast");
  if (/treasure hunt/.test(text)) tags.add("treasure-hunt");
  if (/super treasure hunt/.test(text)) tags.add("super-treasure-hunt");
  if (/red line club|\brlc\b/.test(text)) tags.add("red-line-club");
  if (/transformers/.test(text)) tags.add("transformers");
  if (/pok[eé]mon/.test(text)) tags.add("pokemon");
  if (/funko/.test(text)) tags.add("funko");
  if (/\blego\b/.test(text)) tags.add("lego");
  if (/action figure/.test(text)) tags.add("action-figure");
  if (/collectible/.test(text)) tags.add("collectible");
  return Array.from(tags).slice(0, 20);
}

function normalizeRecognitionSignals(merged = {}) {
  const brand = chooseRecognizedBrand(merged);
  const upc = parseVisibleUpc(merged);
  const category = inferRecognizedCategory(merged);
  const condition = inferRecognizedCondition(merged);
  const normalized = {
    ...merged,
    brand,
    upc,
    category,
    condition,
    tags: deriveRecognitionTags(merged)
  };
  normalized.confidence = computeRecognitionConfidence(normalized);
  return normalized;
}

function titleCase(value = "") {
  return String(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function cleanIdentityPhrase(value = "") {
  return stripCaptureContext(value).replace(/\s*\(unverified\)\s*/gi, " ").trim();
}

function scoreTitleHintCandidate(value = "") {
  const cleaned = stripMarketingPhrases(value).toLowerCase();
  if (!cleaned || looksLikeWeakIdentity(cleaned)) return -100;
  let score = cleaned.split(/\s+/).filter(Boolean).length;
  if (/\b(front|main|package|packaging)\b/.test(cleaned)) score += 2;
  if (/\b(back|side|bottom|barcode|upc|label|closeup|close-up)\b/.test(cleaned)) score -= 4;
  if (/\b\d{8,14}\b/.test(cleaned.replace(/\D/g, ""))) score -= 5;
  if (/hot wheels|transformers|pokemon|funko|lego|sony|nike|rubbermaid|mattel|hasbro/.test(cleaned)) {
    score += 4;
  }
  if (/headphones|earbuds|diecast|figure|storage|container|shirt|shoe|charger/.test(cleaned)) {
    score += 2;
  }
  return score;
}

function normalizeFallbackCategory(value = "") {
  const cleaned = stripMarketingPhrases(value).toLowerCase();
  if (cleaned.includes("shoe") || cleaned.includes("footwear")) return "Footwear";
  if (
    cleaned.includes("cloth") ||
    cleaned.includes("apparel") ||
    cleaned.includes("shirt") ||
    cleaned.includes("hoodie") ||
    cleaned.includes("pants")
  ) {
    return "Apparel";
  }
  if (
    cleaned.includes("electronic") ||
    cleaned.includes("audio") ||
    cleaned.includes("wireless") ||
    cleaned.includes("bluetooth") ||
    cleaned.includes("charger")
  ) {
    return "Electronics";
  }
  if (cleaned.includes("toy") || cleaned.includes("figure")) return "Toy";
  if (cleaned.includes("collectible") || cleaned.includes("diecast")) return "Collectible";
  if (cleaned.includes("jewel")) return "Jewelry";
  if (
    cleaned.includes("home") ||
    cleaned.includes("kitchen") ||
    cleaned.includes("storage") ||
    cleaned.includes("decor")
  ) {
    return "Household Item";
  }
  if (cleaned.includes("vintage")) return "Vintage Item";
  return titleCase(cleaned) || "Product";
}

function categoryDescriptorFromEvidence(evidence = "") {
  const lower = evidence.toLowerCase();
  if (/hot wheels|die-?cast/.test(lower)) return "Die-Cast Vehicle";
  if (/transformers|action figure|figure|blister card/.test(lower)) return "Action Figure";
  if (/pokemon|pok[eé]mon/.test(lower)) return "Pokemon Collectible";
  if (/funko|pop!/.test(lower)) return "Funko Collectible";
  if (/\blego\b|building set|set number/.test(lower)) return "LEGO Set";
  if (/earbuds|headphones|speaker|audio/.test(lower)) return "Audio Electronics";
  if (/charger|usb-?c|power bank|adapter/.test(lower)) return "Charging Accessory";
  if (/controller|console|keyboard|mouse/.test(lower)) return "Gaming Electronics";
  if (/shirt|tee|hoodie|jacket|pants|jeans|dress/.test(lower)) return "Apparel";
  if (/shoe|sneaker|boot/.test(lower)) return "Footwear";
  if (/kitchen|cookware|storage|container|organizer|bedding|towel|decor/.test(lower)) {
    return "Household Item";
  }
  return "";
}

function findDominantFeature({ merged = {}, input = {} } = {}) {
  const evidence = [
    merged.variant,
    merged.edition,
    ...(merged.keyDetails || []),
    ...(merged.ocrText || []),
    ...(merged.recognitionEvidence || []),
    ...(merged.categorySignals || []),
    merged.titleHint,
    input.model
  ]
    .map(stripMarketingPhrases)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const brandedCategory = [
    merged.brand || input.brand,
    merged.productLine,
    categoryDescriptorFromEvidence(evidence)
  ]
    .map(cleanIdentityPhrase)
    .filter((value) => value && !looksLikeWeakIdentity(value))
    .join(" ");
  if (brandedCategory) return titleCase(brandedCategory);

  const color = COLOR_WORDS.find((candidate) =>
    new RegExp(`\\b${candidate}\\b`, "i").test(evidence)
  );
  if (color) return titleCase(color);

  const unverifiedIdentity = [
    merged.productLine,
    merged.itemTitle,
    merged.titleHint,
    input.model,
    merged.brand,
    input.brand
  ]
    .map(cleanIdentityPhrase)
    .find(
      (value) =>
        value &&
        !looksLikeWeakIdentity(value) &&
        !["item", "product", "unknown", "scanned item"].includes(value.toLowerCase())
    );
  if (unverifiedIdentity) return titleCase(unverifiedIdentity);

  const descriptiveDetail = (merged.keyDetails || [])
    .map(stripMarketingPhrases)
    .find((detail) => detail && detail.split(/\s+/).length <= 4);
  return descriptiveDetail ? titleCase(descriptiveDetail) : "";
}

function buildFallbackTitle({ merged = {}, input = {} } = {}) {
  if (merged.productLookup?.title && !looksLikeWeakIdentity(merged.productLookup.title)) {
    return cleanText(merged.productLookup.title);
  }
  if (merged.upc) return `UPC ${merged.upc} (Unverified)`;
  const category = normalizeFallbackCategory(
    merged.category || input.categoryHint || merged.categoryHint
  );
  const feature = findDominantFeature({ merged, input }).replace(
    new RegExp(`\\s+${category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    ""
  );
  const normalizedFeature =
    feature && feature.toLowerCase() !== category.toLowerCase() ? feature : "Unidentified";
  return `${normalizedFeature} ${category} (Unverified)`;
}

function normalizedCategoryKey(value = "") {
  const cleaned = stripMarketingPhrases(value).toLowerCase();
  if (
    cleaned.includes("toy") ||
    cleaned.includes("collectible") ||
    cleaned.includes("figure") ||
    cleaned.includes("diecast")
  ) {
    return "toys";
  }
  if (
    cleaned.includes("electronic") ||
    cleaned.includes("audio") ||
    cleaned.includes("wireless") ||
    cleaned.includes("bluetooth") ||
    cleaned.includes("charger")
  ) {
    return "electronics";
  }
  if (cleaned.includes("shoe") || cleaned.includes("footwear")) return "footwear";
  if (
    cleaned.includes("cloth") ||
    cleaned.includes("apparel") ||
    cleaned.includes("shirt") ||
    cleaned.includes("hoodie")
  ) {
    return "clothing";
  }
  if (cleaned.includes("jewel")) return "jewelry";
  if (
    cleaned.includes("home") ||
    cleaned.includes("household") ||
    cleaned.includes("kitchen") ||
    cleaned.includes("storage")
  ) {
    return "home";
  }
  if (cleaned.includes("vintage")) return "vintage";
  return "general";
}

function estimateResaleFromEvidence({ merged = {}, input = {}, imageUrls = [] } = {}) {
  const evidence = evidenceText(merged) || [input.brand, input.model, input.categoryHint, imageUrls[0]]
    .filter(Boolean)
    .join(" ");
  const lower = evidence.toLowerCase();
  const category = normalizedCategoryKey(merged.category || input.categoryHint);
  const seed = stableHash(
    [
      evidence,
      merged.titleHint,
      merged.upc,
      merged.itemNumber,
      merged.productLine,
      imageUrls[0]
    ]
      .filter(Boolean)
      .join("|")
  );
  const bases = {
    toys: 24,
    electronics: 42,
    footwear: 38,
    clothing: 22,
    jewelry: 30,
    home: 26,
    vintage: 34,
    general: 18
  };
  let estimate = bases[category] || bases.general;

  if (/lego/.test(lower)) estimate *= 1.45;
  if (/pokemon|pok[eé]mon/.test(lower)) estimate *= 1.35;
  if (/funko/.test(lower)) estimate *= 1.25;
  if (/transformers|hasbro/.test(lower)) estimate *= 1.22;
  if (/hot wheels|die-?cast|mattel/.test(lower)) estimate *= 1.14;
  if (/nintendo|sony|apple|bose|beats/.test(lower)) estimate *= 1.35;
  if (/wireless|bluetooth|usb-?c|power bank|controller/.test(lower)) estimate *= 1.12;
  if (/nike|adidas|under armour|levi/.test(lower)) estimate *= 1.12;
  if (/pyrex|rubbermaid|sterilite|mainstays|hamilton beach|black\+decker/.test(lower)) {
    estimate *= 1.08;
  }
  if (/sealed|new in box|unopened|mint on card|moc/.test(lower)) estimate *= 1.18;
  if (/damaged|crushed|torn|creased|shelf wear|box wear/.test(lower)) estimate *= 0.82;
  if (/loose|opened|open box|no box|without box/.test(lower)) estimate *= 0.78;
  if (/bundle|lot|pack|2 pack|3 pack|multi.?pack/.test(lower)) estimate *= 1.32;
  if (/treasure hunt|super treasure hunt|red line|rlc|chase|limited|exclusive/.test(lower)) {
    estimate *= 1.55;
  }

  const jitter = 0.88 + ((seed % 29) / 100);
  const suggested = Math.max(8, Number((estimate * jitter).toFixed(2)));
  const demand =
    /lego|pokemon|pok[eé]mon|hot wheels|transformers|funko|nintendo|sony/i.test(lower)
      ? "medium"
      : category === "electronics" || category === "footwear"
        ? "medium"
        : category === "clothing"
          ? "low"
          : "medium";
  const sellThroughRatio =
    demand === "medium" ? 0.38 + ((seed % 19) / 100) : demand === "low" ? 0.18 + ((seed % 12) / 100) : 0.58;
  const sellThrough =
    sellThroughRatio >= 0.55 ? "fast" : sellThroughRatio >= 0.32 ? "average" : "slow";

  return {
    low: Number(Math.max(5, suggested * 0.78).toFixed(2)),
    suggested,
    high: Number((suggested * 1.24).toFixed(2)),
    demand,
    sellThrough,
    sellThroughRatio: Number(sellThroughRatio.toFixed(2))
  };
}

function mapRecentSalesToDashboardComps(recentSales = []) {
  return (recentSales || [])
    .map((comp) => ({
      sourcePlatform: cleanText(comp.sourcePlatform || comp.platform),
      price: Number(comp.price) || 0,
      dateSold: cleanText(comp.dateSold || comp.soldAt)
    }))
    .filter((comp) => comp.sourcePlatform && comp.price > 0 && comp.dateSold)
    .slice(0, 12);
}

function getDashboardComps({ analysis = {}, pricing = {}, comps = null, input = {}, imageUrls = [] } = {}) {
  const liveComps = mapRecentSalesToDashboardComps(comps?.recentSales);
  return liveComps;
}

function estimateSellThroughRatio({ analysis = {}, pricing = {}, comps = null } = {}) {
  const liveRatio = comps?.signals?.sellThroughRatio;
  if (liveRatio != null && Number.isFinite(Number(liveRatio))) {
    return Number(Math.max(0.05, Math.min(0.95, Number(liveRatio))).toFixed(2));
  }

  if (analysis.sellThroughRatio != null && Number.isFinite(Number(analysis.sellThroughRatio))) {
    return Number(Math.max(0.05, Math.min(0.95, Number(analysis.sellThroughRatio))).toFixed(2));
  }

  return null;
}

function getMarketConfidence({ analysis = {}, pricing = {}, comps = null } = {}) {
  const recognition = getDashboardConfidence(analysis);
  const sourcing = Number(analysis.sourcingConfidenceScore || pricing.marketSignals?.sourcingConfidenceScore) || 0;
  const profit = Number(analysis.profitConfidenceScore || pricing.marketSignals?.profitConfidenceScore) || 0;
  const liveBonus =
    comps?.liveStatus?.sold === "live" ? 12 : comps?.liveStatus?.active === "live" ? 6 : 0;
  const value = Math.max(
    0,
    Math.min(100, Math.round(recognition * 0.35 + sourcing * 0.35 + profit * 0.2 + liveBonus))
  );
  return {
    value,
    label: value >= 75 ? "Strong market read" : value >= 50 ? "Guarded market read" : "Weak market read"
  };
}

function getRecommendedMarketplace(pricing = {}) {
  const best =
    pricing.bestMarketplace ||
    (pricing.comparisonPlatforms || [])
      .slice()
      .sort((a, b) => Number(b.netProfit) - Number(a.netProfit))[0];
  if (!best) return null;
  const label = best?.label || "eBay";
  return {
    platform: label,
    reason: `${label} has the strongest estimated net profit after fees and shipping.`
  };
}

function hasPattern(value = "", pattern) {
  return pattern.test(String(value || "").toLowerCase());
}

function buildMarketplaceEligibility({ analysis = {}, input = {} } = {}) {
  const title = buildResellerTitle({ merged: analysis, input }) || analysis.itemTitle || input.model || "";
  const brand = String(analysis.brand || input.brand || "").trim();
  const category = normalizedCategoryKey(analysis.category || input.categoryHint);
  const condition = String(analysis.condition || input.condition || "").toLowerCase();
  const upc = String(analysis.upc || input.upc || "").replace(/\D/g, "");
  const evidence = [
    title,
    brand,
    analysis.category,
    input.categoryHint,
    condition,
    analysis.productLine,
    analysis.variant,
    analysis.edition,
    ...(analysis.ocrText || []),
    ...(analysis.keyDetails || []),
    ...(analysis.recognitionEvidence || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const flags = {
    amazonGatedBrandCategory:
      /nike|adidas|lululemon|disney|lego|pokemon|pok[eÃ©]mon|apple|sony|nintendo|microsoft|funko|dyson|gopro/.test(
        `${brand} ${evidence}`
      ) || ["toys", "electronics", "clothing", "footwear"].includes(category),
    hazmatHealthBeauty:
      /health|beauty|cosmetic|makeup|skin care|skincare|lotion|cream|serum|perfume|fragrance|aerosol|battery|lithium|flammable|supplement|vitamin|medicine|medical|personal care/.test(
        evidence
      ),
    counterfeitReplica:
      /replica|counterfeit|knockoff|bootleg|inspired by|fake|unauthorized|dupe/.test(evidence),
    usedCondition:
      /used|preowned|pre-owned|open|opened|loose|damaged|shelf wear|wear|tested/.test(condition) ||
      /used|preowned|pre-owned|open box|opened|loose|damaged|shelf wear/.test(evidence),
    missingUpc: !upc || upc.length < 12,
    prohibitedCategory:
      /weapon|firearm|ammo|ammunition|knife|tobacco|vape|alcohol|drug|prescription|recalled|adult|hazardous|pesticide/.test(
        evidence
      ),
    brandAuthorizationRequired:
      /nike|adidas|lululemon|disney|lego|pokemon|pok[eÃ©]mon|apple|sony|nintendo|microsoft|funko|dyson|gopro|licensed|authentic/.test(
        `${brand} ${evidence}`
      )
  };

  function flagLabels() {
    return [
      flags.amazonGatedBrandCategory ? "Amazon gated brand/category" : "",
      flags.hazmatHealthBeauty ? "Hazmat/health/beauty risk" : "",
      flags.counterfeitReplica ? "Counterfeit/replica risk" : "",
      flags.usedCondition ? "Used condition restrictions" : "",
      flags.missingUpc ? "Missing UPC/barcode" : "",
      flags.prohibitedCategory ? "Prohibited marketplace category" : "",
      flags.brandAuthorizationRequired ? "Brand authorization required" : ""
    ].filter(Boolean);
  }

  function decision(platform) {
    const commonFlags = flagLabels();
    if (flags.counterfeitReplica) {
      return {
        platform,
        status: "Prohibited",
        reason: "Replica, counterfeit, bootleg, or unauthorized goods should not be listed.",
        flags: commonFlags
      };
    }
    if (flags.prohibitedCategory) {
      return {
        platform,
        status: "Prohibited",
        reason: "Detected category terms that are commonly prohibited or heavily restricted.",
        flags: commonFlags
      };
    }

    if (platform === "Amazon") {
      if (flags.hazmatHealthBeauty) {
        return {
          platform,
          status: "Restricted",
          reason: "Health, beauty, hazmat, battery, or consumable items often require compliance review and may be restricted.",
          flags: commonFlags
        };
      }
      if (flags.amazonGatedBrandCategory || flags.brandAuthorizationRequired) {
        return {
          platform,
          status: "Approval Needed",
          reason: "Amazon commonly gates this brand or category; verify seller approval before listing.",
          flags: commonFlags
        };
      }
      if (flags.usedCondition) {
        return {
          platform,
          status: "Restricted",
          reason: "Used/open condition may be restricted or condition-sensitive on Amazon.",
          flags: commonFlags
        };
      }
      if (flags.missingUpc) {
        return {
          platform,
          status: "Approval Needed",
          reason: "Amazon usually requires a valid UPC, GTIN exemption, or catalog match.",
          flags: commonFlags
        };
      }
      return { platform, status: "Allowed", reason: "No obvious Amazon gating issue detected by MVP rules.", flags: commonFlags };
    }

    if (platform === "Walmart Marketplace") {
      if (flags.hazmatHealthBeauty) {
        return {
          platform,
          status: "Restricted",
          reason: "Walmart Marketplace is strict on consumables, hazmat, health, and beauty compliance.",
          flags: commonFlags
        };
      }
      if (flags.usedCondition) {
        return {
          platform,
          status: "Not Recommended",
          reason: "Walmart Marketplace generally favors new, catalog-ready products over used/open items.",
          flags: commonFlags
        };
      }
      if (flags.brandAuthorizationRequired || flags.missingUpc) {
        return {
          platform,
          status: "Approval Needed",
          reason: "Brand authorization or a catalog identifier may be required before listing.",
          flags: commonFlags
        };
      }
      return { platform, status: "Allowed", reason: "No obvious Walmart Marketplace blocker detected by MVP rules.", flags: commonFlags };
    }

    if (platform === "Facebook Marketplace") {
      if (flags.hazmatHealthBeauty) {
        return {
          platform,
          status: "Restricted",
          reason: "Personal care, medical, consumable, battery, or hazmat-like items can be blocked or reviewed.",
          flags: commonFlags
        };
      }
      if (category === "electronics" && flags.usedCondition) {
        return {
          platform,
          status: "Allowed",
          reason: "Local pickup can work for used electronics if condition and testing are clearly disclosed.",
          flags: commonFlags
        };
      }
      return {
        platform,
        status: "Allowed",
        reason: "Good local resale candidate if photos, condition, and authenticity are clearly shown.",
        flags: commonFlags
      };
    }

    if (platform === "Mercari") {
      if (flags.hazmatHealthBeauty) {
        return {
          platform,
          status: "Restricted",
          reason: "Mercari can restrict consumables, used cosmetics, fragrance, batteries, and hazmat-sensitive goods.",
          flags: commonFlags
        };
      }
      if (category === "electronics" && flags.usedCondition) {
        return {
          platform,
          status: "Allowed",
          reason: "Allowed by MVP rules, but disclose testing, defects, serial/model info, and included accessories.",
          flags: commonFlags
        };
      }
      return { platform, status: "Allowed", reason: "No obvious Mercari blocker detected by MVP rules.", flags: commonFlags };
    }

    if (platform === "Poshmark") {
      if (category === "clothing" || category === "footwear" || category === "jewelry") {
        if (flags.brandAuthorizationRequired) {
          return {
            platform,
            status: "Allowed",
            reason: "Good fit for apparel, but include clear authenticity and condition photos for branded goods.",
            flags: commonFlags
          };
        }
        return { platform, status: "Allowed", reason: "Good fit for apparel, footwear, or accessories.", flags: commonFlags };
      }
      if (flags.hazmatHealthBeauty) {
        return {
          platform,
          status: "Restricted",
          reason: "Beauty or personal care items may be condition/category sensitive; verify Poshmark rules first.",
          flags: commonFlags
        };
      }
      return {
        platform,
        status: "Not Recommended",
        reason: "Poshmark is usually weaker for this category than apparel-focused listings.",
        flags: commonFlags
      };
    }

    if (platform === "eBay") {
      if (flags.hazmatHealthBeauty) {
        return {
          platform,
          status: "Restricted",
          reason: "eBay may allow some items, but hazmat, cosmetics, medical, and consumable listings require careful policy review.",
          flags: commonFlags
        };
      }
      if (flags.usedCondition && /cosmetic|makeup|skin care|skincare|supplement|medicine|medical/.test(evidence)) {
        return {
          platform,
          status: "Prohibited",
          reason: "Used cosmetics, medical, or consumable products can be prohibited or unsafe to list.",
          flags: commonFlags
        };
      }
      return {
        platform,
        status: "Allowed",
        reason: "Broad marketplace fit; verify category-specific policy and describe condition accurately.",
        flags: commonFlags
      };
    }

    return { platform, status: "Not Recommended", reason: "Marketplace is not covered by the MVP rules.", flags: commonFlags };
  }

  const platforms = [
    "eBay",
    "Amazon",
    "Walmart Marketplace",
    "Facebook Marketplace",
    "Mercari",
    "Poshmark"
  ].map(decision);
  const bestPlatformsToList = platforms
    .filter((item) => item.status === "Allowed")
    .map((item) => item.platform);
  const avoidListingOn = platforms
    .filter((item) => item.status === "Prohibited" || item.status === "Not Recommended")
    .map((item) => item.platform);
  const approvalNeeded = platforms
    .filter((item) => item.status === "Approval Needed" || item.status === "Restricted")
    .map((item) => item.platform);

  return {
    platforms,
    bestPlatformsToList,
    avoidListingOn,
    approvalNeeded
  };
}

function getRiskLevel(riskScore = 0) {
  const score = Math.max(0, Math.min(100, Math.round(Number(riskScore) || 0)));
  if (score >= 66) return { label: "High Risk", score };
  if (score >= 36) return { label: "Medium Risk", score };
  return { label: "Low Risk", score };
}

function estimateMonthlySalesVelocity({ analysis = {}, pricing = {}, comps = null } = {}) {
  const soldCount = Number(comps?.signals?.soldCount || analysis.soldCount) || 0;
  const soldWithinDays = Number(comps?.sold?.soldWithinDays) || 60;
  if (soldCount > 0 && soldWithinDays > 0) {
    return Math.max(1, Math.round((soldCount / soldWithinDays) * 30));
  }

  const sellThroughRatio = estimateSellThroughRatio({ analysis, pricing, comps });
  const category = normalizedCategoryKey(analysis.category);
  const categoryBase = {
    toys: 5,
    electronics: 6,
    footwear: 4,
    clothing: 3,
    home: 3,
    jewelry: 2,
    vintage: 2,
    general: 3
  };
  const base = categoryBase[category] || categoryBase.general;
  const trendBoost = /rising|hot|chase|treasure hunt|exclusive|limited/i.test(evidenceText(analysis))
    ? 2
    : 0;
  return Math.max(1, Math.round(base * (0.55 + sellThroughRatio) + trendBoost));
}

function getCollectorScore(analysis = {}) {
  const evidence = evidenceText(analysis).toLowerCase();
  const category = normalizedCategoryKey(analysis.category);
  let score = 0;
  if (category === "toys") score += 25;
  if (/card|pokemon|pok[eé]mon|sports card|trading card|tcg/.test(evidence)) score += 25;
  if (/hot wheels|transformers|funko|lego|hasbro|mattel/.test(evidence)) score += 20;
  if (/treasure hunt|super treasure hunt|chase|exclusive|limited|variant|edition|rlc|red line/.test(evidence)) {
    score += 25;
  }
  if (/sealed|mint on card|moc|new in box|unopened/.test(evidence)) score += 10;
  if (/damaged|loose|opened|creased|shelf wear/.test(evidence)) score -= 12;
  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score,
    label: score >= 75 ? "Collector Target" : score >= 45 ? "Collector Interest" : "Standard Demand"
  };
}

function getRetailArbitrageDifficulty({ analysis = {}, pricing = {}, comps = null } = {}) {
  const riskScore = Number(analysis.riskScore || pricing.marketSignals?.riskScore) || 0;
  const competitionScore =
    Number(analysis.competitionScore || pricing.marketSignals?.competitionScore) || 0;
  const confidence = getDashboardConfidence(analysis);
  const category = normalizedCategoryKey(analysis.category);
  let score = Math.round(riskScore * 0.45 + competitionScore * 0.3 + (100 - confidence) * 0.25);
  if (category === "electronics") score += 8;
  if (/loose|opened|damaged|shelf wear/i.test(evidenceText(analysis))) score += 8;
  if (comps?.liveStatus?.sold !== "live") score += 6;
  score = Math.max(0, Math.min(100, score));
  return {
    score,
    label: score >= 70 ? "Hard" : score >= 40 ? "Moderate" : "Easy"
  };
}

function getTrendSignal({ analysis = {}, pricing = {}, comps = null } = {}) {
  const sellThroughRatio = estimateSellThroughRatio({ analysis, pricing, comps });
  const velocity = Number(analysis.velocityScore || pricing.marketSignals?.velocityScore) || 0;
  const evidence = evidenceText(analysis).toLowerCase();
  if (/treasure hunt|chase|exclusive|limited|pokemon|pok[eé]mon|lego|hot wheels/.test(evidence)) {
    return "Collector interest";
  }
  if (sellThroughRatio >= 0.58 || velocity >= 70) return "Rising demand";
  if (sellThroughRatio <= 0.24 || velocity <= 30) return "Slow demand";
  return "Stable demand";
}

function buildSourcingAnalytics({ analysis = {}, pricing = {}, comps = null } = {}) {
  const bestProfit =
    pricing.bestMarketplace?.profit ||
    pricing.expectedProfit ||
    {};
  const bestBuyPrice = Number(analysis.maxBuyPrice || pricing.maxBuyPrice) || 0;
  const netProfit = Number(bestProfit.netProfit || pricing.profitSummary?.netProfit) || 0;
  const acquisitionCost =
    Number(bestProfit.costOfGoods) ||
    Number(pricing.expectedProfit?.costOfGoods) ||
    Number(pricing.profitSummary?.costOfGoods) ||
    Number(analysis.acquisitionCost) ||
    0;
  const enteredRoi = Number(bestProfit.roiPct) || Number(pricing.profitSummary?.roiPct) || 0;
  const roiPercentage =
    enteredRoi > 0
      ? enteredRoi
      : acquisitionCost > 0
        ? Number(((netProfit / acquisitionCost) * 100).toFixed(1))
        : 0;
  const riskLevel = getRiskLevel(Number(analysis.riskScore || pricing.marketSignals?.riskScore) || 0);
  return {
    roiPercentage: Number(roiPercentage.toFixed ? roiPercentage.toFixed(1) : roiPercentage) || 0,
    estimatedMonthlySales: estimateMonthlySalesVelocity({ analysis, pricing, comps }),
    collectorScore: getCollectorScore(analysis),
    retailArbitrageDifficulty: getRetailArbitrageDifficulty({ analysis, pricing, comps }),
    riskLevel,
    bestBuyPrice,
    trendSignal: getTrendSignal({ analysis, pricing, comps })
  };
}

function hasVerifiedOrManualPricing({ analysis = {}, pricing = {}, trustedCompSummary = null } = {}) {
  return Boolean(
    Number(trustedCompSummary?.soldCount) > 0 ||
      Number(pricing?.validSoldCount) > 0 ||
      pricing?.pricingSource === "verified_sold_comps" ||
      pricing?.pricingSource === "USER_VERIFIED_SALE" ||
      pricing?.pricingSource === "manual_sold_comp" ||
      pricing?.pricingSource === "USER_VERIFIED" ||
      analysis?.pricingSource === "verified_sold_comps" ||
      analysis?.pricingSource === "USER_VERIFIED_SALE" ||
      analysis?.pricingSource === "manual_sold_comp" ||
      analysis?.pricingSource === "USER_VERIFIED" ||
      analysis?.resellerOverride?.type === "reseller_provided"
  );
}

function categorySpecificSourcingTip({ analysis = {}, pricing = {}, comps = null } = {}) {
  const baseTip = buildSourcingTip({ analysis, pricing, comps });
  const analytics = buildSourcingAnalytics({ analysis, pricing, comps });
  const category = normalizedCategoryKey(analysis.category);
  const marketplace = getRecommendedMarketplace(pricing);
  const sellThroughPct = Math.round(estimateSellThroughRatio({ analysis, pricing, comps }) * 100);
  const categoryGuidance = {
    toys: "For toys and collectibles, verify character, series, UPC, and packaging condition before paying collector pricing.",
    electronics: "For electronics, confirm exact model, sealed status, compatibility, and return risk before buying.",
    clothing: "For apparel, verify brand tag, size, condition, and sold comps for the exact style before sourcing.",
    footwear: "For footwear, check size, sole wear, authenticity cues, and box condition before buying.",
    home: "For household items, favor sealed or complete sets and avoid bulky items unless local resale margin is clear.",
    general: "Confirm exact brand/model and sold comps before committing cash."
  };
  const marketplaceText = marketplace?.platform
    ? ` Recommended marketplace: ${marketplace.platform}.`
    : "";
  return `${baseTip} ${categoryGuidance[category] || categoryGuidance.general}${marketplaceText} Best buy price: $${analytics.bestBuyPrice.toFixed(2)}. Estimated sell-through: ${sellThroughPct}%. Trend: ${analytics.trendSignal}.`;
}

function buildSourcingTip({ analysis = {}, pricing = {}, comps = null } = {}) {
  if (!hasVerifiedOrManualPricing({ analysis, pricing, trustedCompSummary: analysis.trustedCompSummary })) {
    return "No sold comps found. Manual price required. Fallback estimate disabled; real pricing unavailable.";
  }
  const recommendation = analysis.buyRecommendation || pricing.marketSignals?.buyRecommendation || "review";
  const maxBuyPrice = Number(analysis.maxBuyPrice || pricing.maxBuyPrice) || 0;
  const confidence = Number(analysis.sourcingConfidenceScore || pricing.marketSignals?.sourcingConfidenceScore) || 0;
  const soldMidpoint =
    Number(analysis.soldPriceRange?.midpoint) ||
    Number(pricing.marketSignals?.soldPriceRange?.midpoint) ||
    0;
  const compCount = Number(comps?.sold?.count) || 0;
  const lowRecognition = Number(analysis.confidence) > 0 && Number(analysis.confidence) < 0.65;
  const weakConfidencePrefix =
    lowRecognition || confidence < 60 ? "Low-confidence read: " : "";

  if (lowRecognition) {
    const identity = analysis.itemTitle || analysis.category || "this item";
    const priceText = soldMidpoint > 0 ? ` Treat the $${soldMidpoint.toFixed(2)} resale estimate as a ceiling.` : "";
    const buyText = maxBuyPrice > 0 ? ` Only buy at or below $${maxBuyPrice.toFixed(2)} after checking sold comps.` : "";
    return `Low-confidence estimate for ${identity}: retake a sharper label or barcode photo before buying.${priceText}${buyText}`;
  }
  if (recommendation === "buy") {
    return maxBuyPrice > 0
      ? `${weakConfidencePrefix}Good sourcing candidate if you can buy at or below $${maxBuyPrice.toFixed(
          2
        )}.`
      : `${weakConfidencePrefix}Good sourcing candidate based on current profit and demand signals.`;
  }
  if (recommendation === "pass") {
    return maxBuyPrice > 0
      ? `${weakConfidencePrefix}Pass unless you can buy below $${maxBuyPrice.toFixed(
          2
        )} and still protect margin.`
      : `${weakConfidencePrefix}Pass for now; margin or demand signals are too weak.`;
  }
  if (compCount > 0 && soldMidpoint > 0) {
    return `${weakConfidencePrefix}Review before buying: recent sold comps center near $${soldMidpoint.toFixed(
      2
    )}.`;
  }
  return `${weakConfidencePrefix}Review sold comps before sourcing; live demand evidence is limited.`;
}

function buildTrustExplanation({ analysis = {}, pricing = {}, comps = null, productLookup = null, enrichmentStatus = "unavailable" } = {}) {
  const parts = [];
  if (enrichmentStatus === "available") {
    parts.push(`Product identity enriched${productLookup?.source ? ` via ${productLookup.source}` : ""}.`);
  } else {
    parts.push("Product enrichment unavailable; verify identity before buying.");
  }
  const verifiedSoldCount =
    Number(pricing.marketSignals?.validSoldCount) ||
    Number(pricing.validSoldCount) ||
    Number(comps?.signals?.acceptedCompCount) ||
    Number(comps?.sold?.count) ||
    0;
  if (verifiedSoldCount > 0) {
    parts.push(`${verifiedSoldCount} sold comps passed validation.`);
  } else {
    parts.push("No verified sold comps; value, ROI, and demand remain manual-review only.");
  }
  const semanticRejectionRate = Number(comps?.signals?.semanticRejectionRate);
  if (Number.isFinite(semanticRejectionRate) && semanticRejectionRate >= 0.5) {
    parts.push(`${Math.round(semanticRejectionRate * 100)}% of comps were rejected as weak title matches.`);
  }
  const activeCount = Number(pricing.marketSignals?.activeListingCount || comps?.signals?.activeListingCount) || 0;
  if (activeCount >= 60) {
    parts.push("High active-listing saturation; expect slower sell-through or price pressure.");
  }
  if (analysis.recommendation === "MANUAL_REVIEW") {
    parts.push("Recommendation is manual review because required market evidence is incomplete.");
  }
  return parts.join(" ");
}

function buildAnalysis({ merged, input, pricing, uploadedCount }) {
  const itemTitle =
    buildResellerTitle({ merged, input }) || buildFallbackTitle({ merged, input });
  const confidence =
    Number(merged.confidence) || (itemTitle || merged.brand ? 0.55 : 0);
  const quantity =
    merged.quantity ||
    (uploadedCount > 1 ? `${uploadedCount} photos provided` : "Single item not confirmed");
  const lowConfidence = confidence < 0.65;
  const lowPricingConfidence = !merged.resaleSuggested || confidence < 0.7;

  return {
    itemTitle,
    brand: merged.brand || input.brand || "",
    category: merged.category || input.categoryHint || "",
    condition: merged.condition || input.condition || "",
    keyDetails: merged.keyDetails || [],
    quantity,
    priceRange: {
      low: pricing.marketSignals?.soldPriceRange?.low ?? null,
      suggested: pricing.marketSignals?.soldPriceRange?.midpoint ?? null,
      high: pricing.marketSignals?.soldPriceRange?.high ?? null
    },
    shippingNotes: merged.shippingNotes || "Shipping estimate based on entered weight.",
    upc: merged.upc || "",
    productImageUrl: merged.productImageUrl || "",
    productLookup: merged.productLookup || null,
    productLine: merged.productLine || "",
    itemNumber: merged.itemNumber || "",
    variant: merged.variant || "",
    edition: merged.edition || "",
    demand: merged.demand || "",
    sellThrough: merged.sellThrough || "",
    sellThroughRatio: merged.sellThroughRatio ?? null,
    bestMatches: merged.bestMatches || [],
    confidence,
    photoGuidance: lowConfidence
      ? "Add a sharp front photo, a close-up of the brand/model label, and one photo of any barcode, tag, or packaging."
      : "",
    pricingNote: merged.resaleSuggested
      ? "Visible item signals captured; sold comps still control pricing metrics."
      : "Sold comps unavailable, so pricing metrics are withheld.",
    pricingConfidence: lowPricingConfidence ? "low" : "medium",
    manualReviewRecommended: lowConfidence || lowPricingConfidence,
    summary:
      merged.summary ||
      (merged.itemTitle || merged.brand
        ? "Analysis combined uploaded image cues with listing inputs."
        : "No confident product match yet."),
    recognitionEvidence: merged.recognitionEvidence || [],
    ocrText: merged.ocrText || [],
    brandCandidates: merged.brandCandidates || [],
    categorySignals: merged.categorySignals || [],
    conditionSignals: merged.conditionSignals || [],
    packagingHints: merged.packagingHints || [],
    imageRoleTelemetry: merged.imageRoleTelemetry || null,
    missingViews: merged.missingViews || [],
    bestMarketplace: pricing.bestMarketplace
      ? {
          label: pricing.bestMarketplace.label,
          netProfit: pricing.bestMarketplace.profit.netProfit,
          marginPct: pricing.bestMarketplace.profit.marginPct
        }
      : null,
    competitionLevel: pricing.marketSignals?.competitionLevel || "unknown",
    sellSpeed: pricing.marketSignals?.sellSpeed || "unknown",
    buyRecommendation: pricing.marketSignals?.buyRecommendation || "review",
    recommendationReasons: pricing.marketSignals?.recommendationReasons || [],
    soldPriceRange: pricing.marketSignals?.soldPriceRange || null,
    activeListingPressure: pricing.marketSignals?.activeListingPressure || "unknown",
    profitConfidenceScore: pricing.marketSignals?.profitConfidenceScore || 0,
    sourcingConfidenceScore: pricing.marketSignals?.sourcingConfidenceScore || 0,
    maxBuyPrice: pricing.maxBuyPrice || 0,
    estimatedTimeToSaleDays: pricing.marketSignals?.estimatedTimeToSaleDays || null,
    rarityFlag: pricing.marketSignals?.rarityFlag || "",
    marketplaceDemand: pricing.marketSignals?.marketplaceDemand || [],
    competitionScore: pricing.marketSignals?.competitionScore || 0,
    velocityScore: pricing.marketSignals?.velocityScore || 0,
    riskScore: pricing.marketSignals?.riskScore || 0,
    activeListingCount: pricing.marketSignals?.activeListingCount || null,
    soldCount: pricing.marketSignals?.soldCount || null,
    sellThroughRatio: pricing.marketSignals?.sellThroughRatio || null,
    sourceCostProfiles: pricing.sourceCostProfiles || [],
    sourceProfitMetrics: pricing.sourceProfitMetrics || [],
    soldVelocity: pricing.marketSignals?.soldVelocity || "unknown",
    demandTrendWeight: pricing.marketSignals?.demandTrendWeight || "unknown",
    liveStatus: pricing.marketSignals?.liveStatus || {
      active: "unavailable",
      sold: "unavailable"
    },
    pricingConfidenceExplanation:
      pricing.marketSignals?.pricingConfidence === "low"
        ? "Low confidence because product recognition or price evidence is incomplete."
        : pricing.marketSignals?.liveStatus?.sold === "live"
          ? "Estimate blends sold comps, active supply, condition, fees, shipping, and profit assumptions."
          : pricing.marketSignals?.liveStatus?.active === "live"
            ? "Estimate uses live active supply plus AI and heuristic pricing; sold-demand data is not connected yet."
            : "Estimate uses AI and heuristic pricing because live comps are not connected yet.",
    feeBreakdown: pricing.platformBreakdown.map((item) => ({
      platform: item.label,
      fees: item.profit.fees.totalFees,
      shipping: item.profit.fees.shippingCost,
      netProfit: item.profit.netProfit,
      marginPct: item.profit.marginPct
    })),
    marketplaceComparison: pricing.comparisonPlatforms || []
  };
}

function normalizeRange(range = null) {
  return {
    low: Number(range?.low) || null,
    midpoint: Number(range?.midpoint) || null,
    high: Number(range?.high) || null,
    sampleSize: Number(range?.sampleSize) || 0
  };
}

function normalizeComps(comps = null, dashboardComps = []) {
  return {
    query: comps?.query || "",
    generatedSearchQueries: comps?.generatedSearchQueries || comps?.signals?.generatedSearchQueries || [],
    generatedSearchQueryTelemetry: comps?.generatedSearchQueryTelemetry || comps?.signals?.generatedSearchQueryTelemetry || [],
    enrichmentStages: comps?.enrichmentStages || comps?.signals?.enrichmentStages || [],
    active: {
      provider: comps?.active?.provider || null,
      count: Number(comps?.active?.count) || 0,
      range: normalizeRange(comps?.active?.range)
    },
    sold: {
      provider: comps?.sold?.provider || null,
      count: Number(comps?.sold?.count) || 0,
      soldWithinDays: Number(comps?.sold?.soldWithinDays) || null,
      range: normalizeRange(comps?.sold?.range)
    },
    external: (comps?.external || []).map((item) => ({
      provider: item.provider || null,
      count: Number(item.count) || 0,
      activeCount: Number(item.activeCount) || 0,
      soldWithinDays: Number(item.soldWithinDays) || null,
      range: normalizeRange(item.range)
    })),
    recentSales: dashboardComps,
    signals: {
      activeListingCount: Number(comps?.signals?.activeListingCount) || 0,
      soldCount: Number(comps?.signals?.soldCount) || 0,
      sellThroughRatio:
        comps?.signals?.sellThroughRatio == null ? null : Number(comps.signals.sellThroughRatio),
      saturation: comps?.signals?.saturation || "unknown",
      soldVelocity: comps?.signals?.soldVelocity || "unknown",
      trendWeight: comps?.signals?.trendWeight || "unknown",
      generatedSearchQueries: comps?.signals?.generatedSearchQueries || comps?.generatedSearchQueries || [],
      generatedSearchQueryTelemetry: comps?.signals?.generatedSearchQueryTelemetry || comps?.generatedSearchQueryTelemetry || [],
      enrichmentStages: comps?.signals?.enrichmentStages || comps?.enrichmentStages || []
    },
    liveStatus: {
      active: comps?.liveStatus?.active || "unavailable",
      sold: comps?.liveStatus?.sold || "unavailable"
    }
  };
}

function soldDateFromComp(comp = {}) {
  const raw = comp.dateSold || comp.soldAt || comp.endTime || comp.completedAt || null;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function latestSoldAgeDays({ comps = null, dashboardComps = [] } = {}) {
  const candidates = [
    ...(dashboardComps || []),
    ...(comps?.recentSales || []),
    ...(comps?.sold?.items || [])
  ]
    .map(soldDateFromComp)
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime());
  if (!candidates.length) return null;
  return Math.max(0, Math.floor((Date.now() - candidates[0].getTime()) / 86400000));
}

function buildEngineDecisionModel({
  analysis = {},
  pricing = {},
  comps = null,
  dashboardComps = [],
  intelligence = {},
  enrichmentStatus = "unavailable",
  trustedCompSummary = null
} = {}) {
  const marketSignals = pricing.marketSignals || {};
  const compCount = Math.max(
    0,
    Number(trustedCompSummary?.soldCount) ||
      Number(pricing.validSoldCount) ||
      Number(marketSignals.validSoldCount) ||
      Number(pricing.compVolumeCount) ||
      Number(marketSignals.compVolumeCount) ||
      Number(comps?.signals?.soldCount) ||
      dashboardComps.length ||
      0
  );
  const activeCount = Math.max(
    0,
    Number(trustedCompSummary?.activeCount) ||
      Number(marketSignals.activeListingCount) ||
      Number(comps?.signals?.activeListingCount) ||
      Number(comps?.active?.count) ||
      0
  );
  const saturationRatio = compCount > 0 ? Number((activeCount / compCount).toFixed(2)) : 0;
  const sellThrough =
    Number(marketSignals.sellThroughRate) ||
    (analysis.sellThroughRatio != null ? Number(analysis.sellThroughRatio) * 100 : 0);
  let velocityScore = "LOW";
  if (trustedCompSummary?.velocityScore === "FAST" || trustedCompSummary?.velocityScore === "HEALTHY") {
    velocityScore = "HIGH";
  } else if (trustedCompSummary?.velocityScore === "MODERATE") {
    velocityScore = "MODERATE";
  } else if (compCount <= 0) {
    velocityScore = "DEAD";
  } else if (sellThrough >= 60 || String(marketSignals.soldVelocity).toLowerCase() === "fast") {
    velocityScore = "HIGH";
  } else if (sellThrough >= 30 || compCount >= 4) {
    velocityScore = "MODERATE";
  }
  const evidenceText = [
    analysis.itemTitle,
    analysis.quantity,
    analysis.variant,
    analysis.edition,
    ...(analysis.ocrText || []),
    ...(analysis.keyDetails || []),
    ...(analysis.recognitionEvidence || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const isMultipackOrBundle = /\b(pack|bundle|count|ct|family size|multi[- ]?pack)\b/i.test(evidenceText);
  const weakTitle = /^(scanned item|unknown|unknown item|item|product|barcode item)/i.test(
    cleanText(analysis.itemTitle)
  );
  const ocrConfidence =
    !weakTitle && (Number(analysis.confidence) >= 0.55 || (analysis.ocrText || []).length >= 2 || Boolean(analysis.upc))
      ? "HIGH"
      : "LOW";
  const latestAge = latestSoldAgeDays({ comps, dashboardComps });
  const signals = [];
  if (Number(analysis.resolvedCostBasis) > 0 && Number(analysis.resolvedCostBasis) <= 2) {
    signals.push("LOW_BUY_IN_COST");
  }
  if (compCount >= 8) signals.push("STRONG_COMP_DENSITY");
  if (latestAge != null && latestAge <= 7) signals.push("RECENT_SOLD_ACTIVITY");
  if (saturationRatio >= 3) signals.push("HIGH_SATURATION");
  if (ocrConfidence === "LOW" || Number(intelligence.titleMatchMetrics?.titleMatchConfidence) < 0.6) {
    signals.push("WEAK_TITLE_MATCHING");
  }
  if (compCount <= 2) signals.push("THIN_MARKET");
  if (isMultipackOrBundle) signals.push("MULTIPACK_AMBIGUITY");

  const confidenceBreakdown = [];
  if (compCount >= 8) confidenceBreakdown.push("Strong sold comp density");
  if (latestAge != null && latestAge <= 7) confidenceBreakdown.push("Recent verified sold activity");
  if (pricing.marketComps?.priceVarianceHigh) confidenceBreakdown.push("High pricing variance penalty");
  if (trustedCompSummary?.identityConfidence?.score != null) {
    confidenceBreakdown.push(`Exact match confidence ${trustedCompSummary.identityConfidence.score}%`);
  }
  if (trustedCompSummary?.trustScore != null) {
    confidenceBreakdown.push(`Market trust score ${trustedCompSummary.trustScore}%`);
  }
  if (trustedCompSummary?.identityConfidence?.upcMatched) confidenceBreakdown.push("UPC matched trusted sold evidence");
  if (trustedCompSummary?.identityConfidence?.brandMatched) confidenceBreakdown.push("Brand matched trusted sold evidence");
  if (ocrConfidence === "LOW") confidenceBreakdown.push("Weak OCR confidence");
  if (enrichmentStatus !== "available") confidenceBreakdown.push("No UPC enrichment available");
  if (saturationRatio >= 3) confidenceBreakdown.push("High active-listing saturation");
  if (compCount <= 0) confidenceBreakdown.push("No trustworthy sold comps available");

  const missingDataPoints = [];
  if (compCount <= 0) missingDataPoints.push("trustworthy sold comps");
  if (enrichmentStatus !== "available") missingDataPoints.push("UPC enrichment");
  if (ocrConfidence === "LOW") missingDataPoints.push("high-confidence product identity");
  if (latestAge == null) missingDataPoints.push("recent sold activity");
  (trustedCompSummary?.confidenceCollapseReasons || []).forEach((reason) =>
    missingDataPoints.push(reason.replace(/_/g, " "))
  );
  if ((trustedCompSummary?.identityConfidence?.titleTokenSimilarity ?? 0) < 0.6) {
    missingDataPoints.push("strong title token overlap");
  }

  const telemetry = {
    compCount,
    velocityScore,
    saturationRatio,
    confidenceBreakdown,
    ocrConfidence,
    isMultipackOrBundle
  };
  const requestedAction = String(analysis.recommendation || "MANUAL_REVIEW").toUpperCase();
  const profit = Number(analysis.estimatedProfit ?? analysis.netProfit);
  const confidenceScore = Math.max(0, Math.min(100, Math.round(Number(analysis.confidenceScore) || 0)));
  const staleSoldEvidence = latestAge == null || latestAge > 90;
  const weakTrustedOverlap = (trustedCompSummary?.identityConfidence?.titleTokenSimilarity ?? 0) < 0.6;
  const weakTitleDistance = (trustedCompSummary?.acceptedCompScoring?.titleSimilarityScore ?? 1) < 0.35;
  const categoryConflict = (trustedCompSummary?.acceptedCompScoring?.categoryAlignmentScore ?? 1) < 0.5;
  const lowTrustScore = (trustedCompSummary?.trustScore ?? 0) < 40;
  const visualUnknown = trustedCompSummary?.visualConfidenceStage === "LOW_CONFIDENCE_UNKNOWN";
  const excessiveRejectedComps =
    (trustedCompSummary?.rejectedComps ?? 0) > Math.max(3, (trustedCompSummary?.acceptedComps ?? 0) * 2);
  const action =
    compCount <= 0 ||
    ocrConfidence === "LOW" ||
    isMultipackOrBundle ||
    weakTrustedOverlap ||
    weakTitleDistance ||
    categoryConflict ||
    lowTrustScore ||
    visualUnknown ||
    excessiveRejectedComps
      ? "MANUAL_REVIEW"
      : requestedAction === "BUY" &&
          (!Number.isFinite(profit) ||
            profit <= 0 ||
            confidenceScore < 55 ||
            compCount < 3 ||
            velocityScore === "DEAD" ||
            saturationRatio >= 3 ||
            staleSoldEvidence)
        ? "HOLD"
      : ["BUY", "HOLD", "SKIP", "MANUAL_REVIEW"].includes(requestedAction)
        ? requestedAction
        : "MANUAL_REVIEW";
  return {
    marketComps: pricing.marketComps || {
      averageResalePrice: Number(analysis.estimatedResalePrice) || undefined,
      recentSalesCount: compCount,
      staleComps: latestAge != null && latestAge > 90,
      priceVarianceHigh: false
    },
    resellerSignals: Array.from(new Set(signals)),
    missingDataPoints,
    engineTelemetry: telemetry,
    decisionCard: {
      product: {
        title: analysis.itemTitle || "Scanned item",
        brand: analysis.brand || "",
        category: analysis.category || "",
        upc: analysis.upc || ""
      },
      action,
      confidenceScore,
      reasoning: analysis.recommendationExplanation || analysis.sourcingTip || "Manual review recommended.",
      signals: Array.from(new Set(signals)),
      missingDataPoints,
      telemetry
    }
  };
}

function buildDecisionSummary({ pricing, analysis }) {
  const expectedProfit = pricing.expectedProfit || {};
  const recommendation = analysis.recommendation || analysis.buyRecommendation || "review";
  const pricingAvailable = hasVerifiedOrManualPricing({
    analysis,
    pricing,
    trustedCompSummary: analysis.trustedCompSummary
  });
  return {
    recommendation,
    confidenceScore: analysis.confidenceScore || analysis.sourcingConfidenceScore || 0,
    salePrice: pricingAvailable ? pricing.selectedPrice ?? null : null,
    netProfit: pricingAvailable ? analysis.estimatedProfit ?? expectedProfit.netProfit ?? null : null,
    roiPct: pricingAvailable ? analysis.roiPercentage ?? expectedProfit.roiPct ?? null : null,
    marginPct: pricingAvailable ? expectedProfit.marginPct ?? null : null,
    maxBuyPrice: pricingAvailable ? pricing.maxBuyPrice ?? null : null,
    bestMarketplace: pricing.bestMarketplace
      ? {
          key: pricing.bestMarketplace.key,
          label: pricing.bestMarketplace.label,
          netProfit: pricing.bestMarketplace.profit.netProfit,
          roiPct: pricing.bestMarketplace.profit.roiPct,
          marginPct: pricing.bestMarketplace.profit.marginPct
        }
      : null,
    sourceProfitMetrics: pricing.sourceProfitMetrics || [],
    reasons: analysis.recommendationReasons || []
  };
}

function latestTrustedCompAgeDays(trustedCompSummary = null) {
  const details = trustedCompSummary?.rejectionDetails || [];
  const ages = details
    .map((item) => Number(item?.staleAge))
    .filter((age) => Number.isFinite(age) && age >= 0);
  return ages.length ? Math.min(...ages) : null;
}

function buildResellerMarketFacts({ analysis = {}, trustedCompSummary = null, pricing = {}, input = {} } = {}) {
  const evidenceText = [
    analysis.itemTitle,
    analysis.brand,
    analysis.category,
    analysis.quantity,
    analysis.variant,
    analysis.edition,
    ...(analysis.ocrText || []),
    ...(analysis.visualAnchors || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const averageSoldPrice =
    trustedCompSummary?.averageSoldPrice == null ? null : Number(trustedCompSummary.averageSoldPrice);
  const netProfit = analysis.estimatedProfit ?? analysis.netProfit ?? pricing.expectedProfit?.netProfit ?? null;
  const roi = analysis.roiPercentage ?? analysis.roi ?? pricing.expectedProfit?.roiPct ?? null;
  const activeCount = Number(trustedCompSummary?.activeCount) || 0;
  const soldCount = Number(trustedCompSummary?.soldCount) || 0;
  const rejectedCount = Number(trustedCompSummary?.rejectedComps) || 0;
  const totalCompAttempts = soldCount + rejectedCount;
  const shippingEvidence = evidenceText;
  const estimatedWeightClass =
    /oversize|large|jumbo|bulk|case/.test(shippingEvidence)
      ? "OVERSIZE"
      : /heavy|glass|ceramic|appliance|cast iron/.test(shippingEvidence)
        ? "HEAVY"
        : /card|figure|small|light|cosmetic|makeup|snack|candy/.test(shippingEvidence)
          ? "LIGHT"
          : "STANDARD";
  const fragileRisk = /glass|ceramic|fragile|mirror|cosmetic palette|powder/.test(shippingEvidence);
  const returnRisk = /used|open box|untested|as[- ]?is|for parts|repair|damaged|defective/.test(shippingEvidence);
  const incompleteListingRisk = /missing|without|no charger|no cable|no remote|parts only|incomplete/.test(shippingEvidence);
  const oversizedPenalty = estimatedWeightClass === "OVERSIZE" ? 12 : estimatedWeightClass === "HEAVY" ? 7 : 0;
  const shippingComplexity =
    estimatedWeightClass === "OVERSIZE" || fragileRisk
      ? "HIGH"
      : estimatedWeightClass === "HEAVY"
        ? "MEDIUM"
        : "LOW";
  return {
    title: analysis.itemTitle || input.model || "",
    brand: analysis.brand || input.brand || "",
    category: analysis.category || input.categoryHint || "",
    upc: analysis.upc || input.upc || "",
    sourceStoreType: analysis.sourceStoreType || input.sourceStore || input.sourceStoreContext?.sourceStoreType || "",
    costBasis: analysis.resolvedCostBasis ?? input.costBasis ?? null,
    averageSoldPrice,
    netProfit: netProfit == null ? null : Number(netProfit),
    roi: roi == null ? null : Number(roi),
    trustedSoldCount: soldCount,
    soldCount90d: Number(trustedCompSummary?.soldCount90d) || 0,
    activeCount,
    activeListingCount: activeCount,
    soldListingCount: soldCount,
    sellThroughRate:
      trustedCompSummary?.sellThroughRate == null ? null : Number(trustedCompSummary.sellThroughRate) / 100,
    sellThroughRatio:
      trustedCompSummary?.sellThroughRate == null ? null : Number(trustedCompSummary.sellThroughRate) / 100,
    saturationRatio:
      trustedCompSummary?.saturationRatio == null ? null : Number(trustedCompSummary.saturationRatio),
    confidenceScore: Number(analysis.confidenceScore ?? trustedCompSummary?.trustScore) || 0,
    titleMatchScore: Number(trustedCompSummary?.acceptedCompScoring?.titleSimilarityScore) || 0,
    visualMatchScore:
      Number(trustedCompSummary?.acceptedCompScoring?.visualAnchorOverlapScore) ||
      Number(trustedCompSummary?.identityConfidence?.titleTokenSimilarity) ||
      0,
    compRejectionRate: totalCompAttempts ? rejectedCount / totalCompAttempts : 0,
    shippingOverhead: 5.75,
    estimatedWeightClass,
    shippingComplexity,
    fragileRisk,
    returnRisk,
    incompleteListingRisk,
    oversizedPenalty,
    isBundleDependent: /bundle|lot|case|multi[- ]?pack|pack of|wholesale/i.test(evidenceText),
    isMultipack: /\b(\d+)\s*(pack|pk|ct|count|piece|pcs)\b|multipack|multi-pack/i.test(evidenceText),
    bulkCompDetected: Boolean(
      trustedCompSummary?.rejectionReasons?.variant_mismatch ||
      trustedCompSummary?.rejectionReasons?.hard_negative ||
      /bundle|lot|case|wholesale/i.test(evidenceText)
    ),
    isConsumable: /food|snack|candy|drink|beverage|grocery|vitamin|supplement|beauty|cosmetic|makeup|skin care/i.test(evidenceText),
    isCollectible: /transformers|pokemon|pok[eé]mon|hot wheels|funko|lego|collectible|action figure|variant|wave|deluxe/i.test(evidenceText),
    raritySignal: /rare|exclusive|limited|variant|wave|vintage|discontinued|chase|treasure hunt|deluxe/i.test(evidenceText),
    latestCompAgeDays: latestTrustedCompAgeDays(trustedCompSummary),
    staleCompRatio:
      trustedCompSummary?.saturationFlags?.staleSoldComps && soldCount > 0
        ? 1
        : 0
  };
}

function normalizePricing(pricing) {
  return {
    ...pricing,
    recommendedPrice: pricing.recommendedPrice == null ? null : Number(pricing.recommendedPrice) || 0,
    floorPrice: pricing.floorPrice == null ? null : Number(pricing.floorPrice) || 0,
    selectedPrice: pricing.selectedPrice == null ? null : Number(pricing.selectedPrice) || 0,
    maxBuyPrice: pricing.maxBuyPrice == null ? null : Number(pricing.maxBuyPrice) || 0,
    expectedProfit: {
      ...pricing.expectedProfit,
      salePrice: pricing.expectedProfit?.salePrice == null ? null : Number(pricing.expectedProfit?.salePrice) || 0,
      costOfGoods: Number(pricing.expectedProfit?.costOfGoods) || 0,
      netRevenue: pricing.expectedProfit?.netRevenue == null ? null : Number(pricing.expectedProfit?.netRevenue) || 0,
      netProfit: pricing.expectedProfit?.netProfit == null ? null : Number(pricing.expectedProfit?.netProfit) || 0,
      marginPct: pricing.expectedProfit?.marginPct == null ? null : Number(pricing.expectedProfit?.marginPct) || 0,
      roiPct: pricing.expectedProfit?.roiPct == null ? null : Number(pricing.expectedProfit?.roiPct) || 0
    },
    profitSummary: {
      salePrice: pricing.profitSummary?.salePrice == null ? null : Number(pricing.profitSummary?.salePrice) || 0,
      netProfit: pricing.profitSummary?.netProfit == null ? null : Number(pricing.profitSummary?.netProfit) || 0,
      marginPct: pricing.profitSummary?.marginPct == null ? null : Number(pricing.profitSummary?.marginPct) || 0,
      roiPct: pricing.profitSummary?.roiPct == null ? null : Number(pricing.profitSummary?.roiPct) || 0,
      maxBuyPrice: pricing.profitSummary?.maxBuyPrice == null ? null : Number(pricing.profitSummary?.maxBuyPrice) || 0,
      targetMinProfit: Number(pricing.profitSummary?.targetMinProfit) || 0,
      targetMinRoiPct: Number(pricing.profitSummary?.targetMinRoiPct) || 0
    },
    comparisonPlatforms: (pricing.comparisonPlatforms || []).map((item) => ({
      ...item,
      netProfit: Number(item.netProfit) || 0,
      marginPct: Number(item.marginPct) || 0,
      roiPct: Number(item.roiPct) || 0,
      fees: Number(item.fees) || 0,
      shipping: Number(item.shipping) || 0
    }))
  };
}

function getDashboardConfidence(analysis = {}) {
  const intelligence = Number(analysis.confidenceScore);
  if (Number.isFinite(intelligence) && intelligence > 0) {
    return Math.round(Math.max(0, Math.min(100, intelligence)));
  }

  const recognition = Number(analysis.confidence);
  if (Number.isFinite(recognition) && recognition > 0) {
    return Math.round(Math.max(0, Math.min(1, recognition)) * 100);
  }

  const sourcing = Number(analysis.sourcingConfidenceScore);
  if (Number.isFinite(sourcing) && sourcing > 0) {
    return Math.round(Math.max(0, Math.min(100, sourcing)));
  }

  const profit = Number(analysis.profitConfidenceScore);
  if (Number.isFinite(profit) && profit > 0) {
    return Math.round(Math.max(0, Math.min(100, profit)));
  }

  return 0;
}

export function normalizeDashboardListing(item) {
  if (!item) return null;

  const payload = item.payload || {};
  const input = payload.input || {};
  const analysis = input.analysisResult || {};
  const outputs = payload.outputs || [];
  const primaryOutput = outputs[0] || {};
  const comps = Array.isArray(analysis.comps)
    ? analysis.comps
        .map((comp) => ({
          sourcePlatform: String(comp.sourcePlatform || comp.platform || ""),
          price: Number(comp.price) || 0,
          dateSold: String(comp.dateSold || comp.soldAt || "")
        }))
        .filter((comp) => comp.sourcePlatform && comp.price > 0 && comp.dateSold)
    : [];
  const sellThroughRate =
    analysis.sellThroughRatio != null
      ? `${Math.round(Number(analysis.sellThroughRatio) * 100)}%`
      : analysis.sellThrough || "Unavailable";
  const demandLevel = titleCase(analysis.demand || "Unknown");
  const fallbackTip = buildSourcingTip({ analysis });
  const confidenceScore = getDashboardConfidence(analysis);
  const pricingAvailable = hasVerifiedOrManualPricing({
    analysis,
    pricing: payload.pricing || {},
    trustedCompSummary: analysis.trustedCompSummary
  });

  return validateOrRepairNormalizedListing({
    itemTitle:
      buildResellerTitle({ merged: analysis, input }) ||
      buildFallbackTitle({ merged: analysis, input }),
    thumbnailUrl:
      payload.imageUrls?.[0] ||
      input.imageUrls?.[0] ||
      analysis.productImageUrl ||
      "/uploads/.gitkeep",
    sellThroughRate,
    averageSalePrice: pricingAvailable
      ? Number(analysis.estimatedResalePrice) ||
        Number(analysis.soldPriceRange?.midpoint) ||
        Number(primaryOutput.price) ||
        null
      : null,
    profitPotential: pricingAvailable
      ? Number(analysis.estimatedProfit) ||
        Number(analysis.bestMarketplace?.netProfit) ||
        Number(primaryOutput.profit?.netProfit) ||
        null
      : null,
    demandLevel,
    sourcingTip: analysis.sourcingTip || fallbackTip,
    confidenceScore,
    brand: analysis.brand || input.brand || "",
    upc: analysis.upc || "",
    marketConfidence: analysis.marketConfidence || getMarketConfidence({ analysis }),
    recommendedMarketplace: analysis.recommendedMarketplace || getRecommendedMarketplace({}) || undefined,
    marketplaceEligibility:
      analysis.marketplaceEligibility || buildMarketplaceEligibility({ analysis, input }),
    sourcingAnalytics: analysis.sourcingAnalytics || buildSourcingAnalytics({ analysis }),
    recommendation: analysis.recommendation || "",
    recommendationExplanation: analysis.recommendationExplanation || "",
    demandScore: analysis.demandScore,
    sourceBadges: analysis.sourceBadges || [],
    marketDataUnavailable: Boolean(analysis.marketDataUnavailable),
    sourceCostProfiles: analysis.sourceCostProfiles || [],
    sourceProfitMetrics: analysis.sourceProfitMetrics || [],
    sourceStoreType: analysis.sourceStoreType || "",
    resolvedCostBasis: analysis.resolvedCostBasis,
    lookupSource: analysis.lookupSource || "",
    manualOverrideValue: analysis.manualOverrideValue ?? null,
    resaleAuthoritySource: analysis.resaleAuthoritySource || "eBay SOLD comps",
    marketComps: analysis.marketComps,
    resellerSignals: analysis.resellerSignals || [],
    missingDataPoints: analysis.missingDataPoints || [],
    engineTelemetry: analysis.engineTelemetry,
    decisionCard: analysis.decisionCard,
    trustedCompSummary: analysis.trustedCompSummary,
    productCandidates: analysis.productCandidates || [],
    confirmedProductIdentity: analysis.confirmedProductIdentity || null,
    generatedSearchQueries: analysis.generatedSearchQueries || [],
    generatedSearchQueryTelemetry: analysis.generatedSearchQueryTelemetry || [],
    enrichmentStages: analysis.enrichmentStages || [],
    trustScore: analysis.trustScore,
    calibrationLog: analysis.calibrationLog,
    imageRoleTelemetry: analysis.imageRoleTelemetry,
    resellerBehaviorProfile: analysis.resellerBehaviorProfile,
    resellerRuleActions: analysis.resellerRuleActions || [],
    resellerWarnings: analysis.resellerWarnings || [],
    adjustedRecommendation: analysis.adjustedRecommendation,
    adjustedConfidenceScore: analysis.adjustedConfidenceScore,
    explanationSummary: analysis.explanationSummary,
    resellerEngineTelemetry: analysis.resellerEngineTelemetry,
    crossListDrafts: analysis.crossListDrafts || [],
    listingOrchestration: analysis.listingOrchestration,
    inventorySyncSnapshot: analysis.inventorySyncSnapshot,
    inventoryOS: analysis.inventoryOS,
    aiAgentSummary: analysis.aiAgentSummary,
    aiAgentEvents: analysis.aiAgentEvents || [],
    aiAgentTelemetry: analysis.aiAgentTelemetry,
    aiAgentDecisions: analysis.aiAgentDecisions || [],
    executionFlow: analysis.executionFlow || [],
    agentDecisionHierarchy: analysis.agentDecisionHierarchy || [],
    breakEven: analysis.breakEven ?? null,
    estimatedResalePrice: analysis.estimatedResalePrice,
    estimatedProfit: analysis.estimatedProfit,
    roiPercentage: analysis.roiPercentage,
    comps
  }, "savedListing.dashboard");
}

function normalizeLiveDashboardListing({ analysis, input, pricing, imageUrls, dashboardComps, comps }) {
  const sellThroughRate =
    analysis.sellThroughRatio != null
      ? `${Math.round(Number(analysis.sellThroughRatio) * 100)}%`
      : analysis.sellThrough || "Unavailable";
  const demandLevel = titleCase(analysis.demand || "Unknown");
  const fallbackTip = buildSourcingTip({ analysis, pricing, comps });
  const confidenceScore = getDashboardConfidence(analysis);
  const pricingAvailable = hasVerifiedOrManualPricing({
    analysis,
    pricing,
    trustedCompSummary: analysis.trustedCompSummary
  });

  return validateOrRepairNormalizedListing({
    itemTitle:
      buildResellerTitle({ merged: analysis, input }) ||
      buildFallbackTitle({ merged: analysis, input }),
    thumbnailUrl: imageUrls[0] || analysis.productImageUrl || "",
    sellThroughRate,
    averageSalePrice: pricingAvailable
      ? Number(analysis.estimatedResalePrice) ||
        Number(analysis.soldPriceRange?.midpoint) ||
        Number(pricing.selectedPrice) ||
        null
      : null,
    profitPotential: pricingAvailable
      ? Number(analysis.estimatedProfit) ||
        Number(analysis.bestMarketplace?.netProfit) ||
        Number(pricing.bestMarketplace?.profit?.netProfit) ||
        Number(pricing.expectedProfit?.netProfit) ||
        null
      : null,
    demandLevel,
    sourcingTip: analysis.sourcingTip || fallbackTip,
    confidenceScore,
    brand: analysis.brand || input.brand || "",
    upc: analysis.upc || "",
    marketConfidence: analysis.marketConfidence || getMarketConfidence({ analysis, pricing, comps }),
    recommendedMarketplace:
      analysis.recommendedMarketplace || getRecommendedMarketplace(pricing) || undefined,
    marketplaceEligibility:
      analysis.marketplaceEligibility || buildMarketplaceEligibility({ analysis, input }),
    sourcingAnalytics:
      analysis.sourcingAnalytics || buildSourcingAnalytics({ analysis, pricing, comps }),
    recommendation: analysis.recommendation || "",
    recommendationExplanation: analysis.recommendationExplanation || "",
    demandScore: analysis.demandScore,
    sourceBadges: analysis.sourceBadges || [],
    marketDataUnavailable: Boolean(analysis.marketDataUnavailable),
    sourceCostProfiles: analysis.sourceCostProfiles || pricing.sourceCostProfiles || [],
    sourceProfitMetrics: analysis.sourceProfitMetrics || pricing.sourceProfitMetrics || [],
    sourceStoreType: analysis.sourceStoreType || "",
    resolvedCostBasis: analysis.resolvedCostBasis,
    lookupSource: analysis.lookupSource || "",
    manualOverrideValue: analysis.manualOverrideValue ?? null,
    resaleAuthoritySource: analysis.resaleAuthoritySource || "eBay SOLD comps",
    pricingSource: analysis.pricingSource || pricing.pricingSource || "",
    pricingHierarchy: analysis.pricingHierarchy || pricing.pricingHierarchy || [],
    userVerifiedCorrection: analysis.userVerifiedCorrection || null,
    matchedPersonalSale: analysis.matchedPersonalSale || null,
    scanFingerprint: analysis.scanFingerprint || "",
    matchingKeys: analysis.matchingKeys || [],
    ocrText: analysis.ocrText || [],
    visualAnchors: analysis.visualAnchors || [],
    packagingHints: analysis.packagingHints || [],
    marketComps: analysis.marketComps || pricing.marketComps,
    resellerSignals: analysis.resellerSignals || [],
    missingDataPoints: analysis.missingDataPoints || [],
    engineTelemetry: analysis.engineTelemetry,
    decisionCard: analysis.decisionCard,
    trustedCompSummary: analysis.trustedCompSummary,
    productCandidates: analysis.productCandidates || [],
    confirmedProductIdentity: analysis.confirmedProductIdentity || null,
    generatedSearchQueries: analysis.generatedSearchQueries || [],
    generatedSearchQueryTelemetry: analysis.generatedSearchQueryTelemetry || [],
    enrichmentStages: analysis.enrichmentStages || [],
    trustScore: analysis.trustScore,
    calibrationLog: analysis.calibrationLog,
    imageRoleTelemetry: analysis.imageRoleTelemetry,
    resellerBehaviorProfile: analysis.resellerBehaviorProfile,
    resellerRuleActions: analysis.resellerRuleActions || [],
    resellerWarnings: analysis.resellerWarnings || [],
    adjustedRecommendation: analysis.adjustedRecommendation,
    adjustedConfidenceScore: analysis.adjustedConfidenceScore,
    explanationSummary: analysis.explanationSummary,
    resellerEngineTelemetry: analysis.resellerEngineTelemetry,
    crossListDrafts: analysis.crossListDrafts || [],
    listingOrchestration: analysis.listingOrchestration,
    inventorySyncSnapshot: analysis.inventorySyncSnapshot,
    inventoryOS: analysis.inventoryOS,
    aiAgentSummary: analysis.aiAgentSummary,
    aiAgentEvents: analysis.aiAgentEvents || [],
    aiAgentTelemetry: analysis.aiAgentTelemetry,
    aiAgentDecisions: analysis.aiAgentDecisions || [],
    executionFlow: analysis.executionFlow || [],
    agentDecisionHierarchy: analysis.agentDecisionHierarchy || [],
    breakEven: analysis.breakEven ?? null,
    estimatedResalePrice: analysis.estimatedResalePrice,
    estimatedProfit: analysis.estimatedProfit,
    roiPercentage: analysis.roiPercentage,
    comps: dashboardComps
  }, "liveAnalyze.dashboard");
}

export async function analyzeFormData(formData, context = {}) {
  const requestId = context.requestId || "unknown";
  const startedAt = Date.now();
  const scannedBarcode = normalizeSubmittedBarcode(
    valueFromForm(formData, "barcode") || valueFromForm(formData, "upc")
  );
  const uploadedFiles = getUploadedFiles(formData);
  if (!uploadedFiles.length && !scannedBarcode) {
    throw new RequestValidationError("Provide at least one product image or a UPC/EAN barcode.");
  }
  const uploaded = await persistUploads(uploadedFiles);
  const imagePayloadBytes = uploaded.reduce((sum, file) => sum + Number(file.sizeBytes || 0), 0);
  const imageUrls = uploaded.map((file) => file.relativeUrl);
  const openAiAccess = getOpenAiAccessStatus();
  const visionEnabled = isVisionEnabled();
  let visionAttempted = false;
  let visionSucceeded = false;
  let visionFailureReason = "";
  let aiFallbackMode = !openAiAccess.enabled;
  let aiFallbackReason = openAiAccess.reason;
  let visionMeta = null;
  if (!openAiAccess.enabled) {
    logWarn("openai.access.missing", {
      requestId,
      userId: context.userId || "anonymous",
      reason: openAiAccess.reason,
      fallback: true
    });
  }
  logInfo("scan.started", {
    requestId,
    userId: context.userId || "anonymous",
    enabled: visionEnabled,
    aiFallbackMode,
    imageCount: uploaded.length,
    imagePayloadBytes,
    requestBytes: context.requestBytes || imagePayloadBytes,
    images: uploaded.map((file) => ({
      sizeBytes: file.sizeBytes,
      width: file.width,
      height: file.height,
      mimetype: file.mimetype,
      compressionApplied: file.compressionApplied
    }))
  });
  const merged = {
    titleHint: null,
    categoryHint: null,
    tags: [],
    itemTitle: "",
    brand: "",
    category: "",
    condition: "",
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
    confidence: 0,
    summary: "",
    recognitionEvidence: [],
    missingViews: [],
    ocrText: [],
    brandCandidates: [],
    categorySignals: [],
    conditionSignals: [],
    imageObservations: [],
    packagingHints: [],
    imageRoleTelemetry: null,
    sellThroughRatio: null,
    uploadedImageCount: uploaded.length,
    titleHints: []
  };

  applyScannedBarcode(merged, scannedBarcode);
  let productLookup = null;
  if (merged.upc) {
    productLookup = await getOrSetCachedValue("upc_lookup", merged.upc, () =>
      lookupProductByBarcode(merged.upc)
    );
    applyProductLookup(merged, productLookup);
  }

  const hintTitleCandidates = [];
  const hintCategoryCandidates = [];
  for (const file of uploaded) {
    const hint = await inferFromFile(file.filepath, file.originalName);
    if (hint.titleHint) hintTitleCandidates.push(hint.titleHint);
    if (hint.categoryHint) hintCategoryCandidates.push(hint.categoryHint);
    if (hint.titleHint && !merged.titleHint) merged.titleHint = hint.titleHint;
    if (hint.categoryHint && !merged.categoryHint) merged.categoryHint = hint.categoryHint;
    merged.tags = Array.from(new Set([...merged.tags, ...(hint.tags || [])]));
  }
  if (hintTitleCandidates.length) {
    merged.titleHints = Array.from(new Set(hintTitleCandidates));
    merged.recognitionEvidence = Array.from(
      new Set([...(merged.recognitionEvidence || []), ...hintTitleCandidates])
    ).slice(0, 12);
    const joinedHints = hintTitleCandidates.join(" ");
    if (!merged.productLine && /super\s+treasure\s+hunt/i.test(joinedHints)) {
      merged.productLine = "Super Treasure Hunt";
    } else if (!merged.productLine && /treasure\s+hunt/i.test(joinedHints)) {
      merged.productLine = "Treasure Hunt";
    }
    merged.titleHint = hintTitleCandidates.sort(
      (a, b) => scoreTitleHintCandidate(b) - scoreTitleHintCandidate(a) || b.length - a.length
    )[0];
  }
  if (hintCategoryCandidates.length) {
    merged.categoryHint =
      hintCategoryCandidates.find((candidate) => candidate !== "general") ||
      hintCategoryCandidates[0];
  }

  const bossBrainContext = parseJsonField(formData, "bossBrainContext") || null;

  if (uploaded.length && visionEnabled) {
    visionAttempted = true;
    try {
      const rawAi = await analyzeProductImages({
        images: uploaded.map((file) => ({
          fullpath: file.filepath,
          mimetype: file.mimetype
        })),
        bossBrainContext
      });
      const ai = rawAi ? validateOrRepairAnalysisResult(rawAi, "openai.vision") : null;
      const imageRoleTelemetry = mergeImageRoleTelemetry({ uploaded, ai, scannedBarcode });
      Object.assign(merged, {
        itemTitle: ai?.itemTitle || merged.itemTitle,
        brand: ai?.brand || merged.brand,
        category: ai?.category || merged.category,
        condition: ai?.condition || merged.condition,
        ocrText: ai?.ocrText || merged.ocrText,
        brandCandidates: ai?.brandCandidates || merged.brandCandidates,
        categorySignals: ai?.categorySignals || merged.categorySignals,
        conditionSignals: ai?.conditionSignals || merged.conditionSignals,
        imageObservations: ai?.imageObservations || merged.imageObservations,
        packagingHints: ai?.packagingHints || merged.packagingHints,
        imageRoleTelemetry,
        keyDetails: ai?.keyDetails || merged.keyDetails,
        quantity: ai?.quantity || merged.quantity,
        resaleLow: ai?.resaleLow || merged.resaleLow,
        resaleSuggested: ai?.resaleSuggested || merged.resaleSuggested,
        resaleHigh: ai?.resaleHigh || merged.resaleHigh,
        shippingNotes: ai?.shippingNotes || merged.shippingNotes,
        upc: ai?.upc || merged.upc,
        productLine: ai?.productLine || merged.productLine,
        itemNumber: ai?.itemNumber || merged.itemNumber,
        variant: ai?.variant || merged.variant,
        edition: ai?.edition || merged.edition,
        demand: ai?.demand || merged.demand,
        sellThrough: ai?.sellThrough || merged.sellThrough,
        bestMatches: ai?.bestMatches || merged.bestMatches,
        confidence: ai?.confidence || merged.confidence,
        summary: ai?.summary || merged.summary,
        recognitionEvidence: ai?.recognitionEvidence || merged.recognitionEvidence,
        missingViews: ai?.missingViews || merged.missingViews
      });
      if (imageRoleTelemetry.upcResolvedBy && imageRoleTelemetry.roles.find((item) => item.role === imageRoleTelemetry.upcResolvedBy)?.upc) {
        merged.upc = imageRoleTelemetry.roles.find((item) => item.role === imageRoleTelemetry.upcResolvedBy)?.upc || merged.upc;
      }
      if (imageRoleTelemetry.titleResolvedBy && !merged.itemTitle) {
        merged.itemTitle = imageRoleTelemetry.roles.find((item) => item.role === imageRoleTelemetry.titleResolvedBy)?.titleText || merged.itemTitle;
      }
      if (imageRoleTelemetry.confidenceAdjustment) {
        merged.confidence = Math.max(0, Math.min(1, (Number(merged.confidence) || 0) + imageRoleTelemetry.confidenceAdjustment));
      }
      visionMeta = rawAi?.__visionMeta || null;
      visionSucceeded = Boolean(ai);
      logInfo("openai.vision.completed", {
        requestId,
        userId: context.userId || "anonymous",
        durationMs: visionMeta?.durationMs || null,
        estimatedTokens: visionMeta?.estimatedTokens || null,
        imagePayloadBytes,
        imageCount: uploaded.length
      });
    } catch (error) {
      const openAiError = classifyOpenAiError(error);
      aiFallbackMode = true;
      aiFallbackReason = openAiError.reason;
      const eventName =
        openAiError.reason === "quota_failure"
          ? "openai.quota.failed"
          : openAiError.reason === "auth_failure"
            ? "openai.auth.failed"
            : openAiError.reason === "network_timeout"
              ? "openai.network_timeout"
              : "openai.vision.failed";
      logError("openai.vision.failed", {
        requestId,
        userId: context.userId || "anonymous",
        reason: openAiError.reason,
        error
      });
      logWarn(eventName, {
        requestId,
        userId: context.userId || "anonymous",
        fallback: true
      });
      visionFailureReason = openAiError.message || AI_FALLBACK_NOTICE;
      logWarn("scan.fallback.activated", {
        requestId,
        userId: context.userId || "anonymous",
        enabled: visionEnabled,
        imageCount: uploaded.length,
        reason: visionFailureReason
      });
    }
  }

  applyScannedBarcode(merged, scannedBarcode);
  if (merged.upc && productLookup?.upc !== merged.upc) {
    productLookup = await getOrSetCachedValue("upc_lookup", merged.upc, () =>
      lookupProductByBarcode(merged.upc)
    );
  }
  applyProductLookup(merged, productLookup);

  Object.assign(merged, normalizeRecognitionSignals(merged));

  const titleHint = stripMarketingPhrases(
    valueFromForm(formData, "titleHint") || merged.titleHint || ""
  );
  const parts = titleHint.split(/\s+/).filter(Boolean);
  const inferredBrand = merged.brand || parts[0] || "";
  const inferredModel = merged.itemTitle || parts.slice(1).join(" ") || "";
  const latestAnalysisRaw = parseJsonField(formData, "analysisResult");
  const latestAnalysis = latestAnalysisRaw
    ? validateOrRepairAnalysisResult(latestAnalysisRaw, "form.analysisResult")
    : null;
  const confirmedProductIdentity = normalizeProductCandidate(
    parseJsonField(formData, "confirmedProductIdentity"),
    "manual correction history"
  );
  const calibrationHistory = parseJsonField(formData, "manualCorrectionHistory") || [];
  const salesHistory = parseJsonField(formData, "userSalesHistory") || [];
  const scanMatchingKeys = buildScanMatchingKeys({
    upc: confirmedProductIdentity?.upc || merged.upc || latestAnalysis?.upc || "",
    title: confirmedProductIdentity?.title || merged.itemTitle || latestAnalysis?.itemTitle || titleHint || "",
    brand: confirmedProductIdentity?.brand || merged.brand || latestAnalysis?.brand || inferredBrand || "",
    category: confirmedProductIdentity?.category || merged.category || latestAnalysis?.category || "",
    ocrText: merged.ocrText || latestAnalysis?.ocrText || [],
    visualAnchors: merged.visualAnchors || latestAnalysis?.visualAnchors || [],
    packagingHints: merged.packagingHints || latestAnalysis?.packagingHints || []
  });
  logInfo("user_correction.lookup.attempted", {
    requestId,
    userId: context.userId || "anonymous",
    correctionCount: Array.isArray(calibrationHistory) ? calibrationHistory.length : 0,
    salesHistoryCount: Array.isArray(salesHistory) ? salesHistory.length : 0,
    scanFingerprint: scanMatchingKeys.scanFingerprint,
    matchingKeys: scanMatchingKeys.matchingKeys
  });
  const userVerifiedCorrection = findMatchingUserCorrection(calibrationHistory, {
    upc: confirmedProductIdentity?.upc || merged.upc || latestAnalysis?.upc || "",
    title: confirmedProductIdentity?.title || merged.itemTitle || latestAnalysis?.itemTitle || "",
    brand: confirmedProductIdentity?.brand || merged.brand || latestAnalysis?.brand || "",
    category: confirmedProductIdentity?.category || merged.category || latestAnalysis?.category || "",
    ocrText: merged.ocrText || latestAnalysis?.ocrText || [],
    visualAnchors: merged.visualAnchors || latestAnalysis?.visualAnchors || [],
    packagingHints: merged.packagingHints || latestAnalysis?.packagingHints || [],
    matchingKeys: scanMatchingKeys.matchingKeys
  });
  logInfo("user_correction.lookup.completed", {
    requestId,
    userId: context.userId || "anonymous",
    matched: Boolean(userVerifiedCorrection),
    matchedCorrectionId: userVerifiedCorrection?.id || "",
    storageKeyUsed: "boss-listers.productCorrections.v1"
  });
  const manualCost = normalizeCostBasis(valueFromForm(formData, "costOfGoods"));
  const sourceStoreContext = parseSourceStoreContext(formData);
  const sourceCostResolution = resolveCostBasis(sourceStoreContext, { productLookup });
  const sourceCostProfiles = getSourceCostProfiles(
    formData,
    manualCost,
    productLookup,
    sourceCostResolution
  );
  const resellerOverride = getResellerOverride(formData, sourceCostProfiles);
  const input = mergeUserCorrectionIntoProduct({
    brand:
      valueFromForm(formData, "brand") ||
      userVerifiedCorrection?.brand ||
      confirmedProductIdentity?.brand ||
      latestAnalysis?.brand ||
      inferredBrand,
    model:
      valueFromForm(formData, "model") ||
      userVerifiedCorrection?.productTitle ||
      confirmedProductIdentity?.title ||
      latestAnalysis?.itemTitle ||
      inferredModel,
    condition:
      valueFromForm(formData, "condition") ||
      userVerifiedCorrection?.condition ||
      latestAnalysis?.condition ||
      merged.condition ||
      "Used",
    suggestedTitle: latestAnalysis?.itemTitle || merged.itemTitle || "",
    size: valueFromForm(formData, "size"),
    categoryHint:
      valueFromForm(formData, "categoryHint") ||
      confirmedProductIdentity?.category ||
      latestAnalysis?.category ||
      merged.category ||
      merged.categoryHint ||
      "",
    upc: userVerifiedCorrection?.upc || confirmedProductIdentity?.upc || merged.upc || latestAnalysis?.upc || "",
    suggestedPrice: parseFloat(valueFromForm(formData, "suggestedPrice")) || undefined,
    costOfGoods: sourceCostResolution.resolvedCostBasis ?? 0,
    sourceCostProfiles,
    sourceStoreContext,
    sourceStore: sourceCostResolution.sourceStoreType || "",
    resolvedCostBasis: sourceCostResolution.resolvedCostBasis,
    costBasis: sourceCostResolution.resolvedCostBasis,
    lookupSource: sourceCostResolution.lookupSource,
    manualOverrideValue: sourceCostResolution.manualOverrideValue,
    productData: {
      costBasis: sourceCostResolution.resolvedCostBasis ?? resellerOverride?.costBasis ?? undefined
    },
    manualCorrectionHistory: calibrationHistory,
    weightLb: parseFloat(valueFromForm(formData, "weightLb")) || 1,
    description: valueFromForm(formData, "description"),
    tags: merged.tags,
    imageUrls,
    analysisResult:
      latestAnalysis || {
        confidence: merged.confidence,
        demand: merged.demand,
        sellThrough: merged.sellThrough,
        upc: merged.upc,
        keyDetails: merged.keyDetails,
        visualAnchors: merged.visualAnchors,
        imageRoleTelemetry: merged.imageRoleTelemetry,
        packagingHints: merged.packagingHints,
        ocrText: merged.ocrText,
        priceRange: { suggested: merged.resaleSuggested },
        confirmedProductIdentity
      }
  }, userVerifiedCorrection);
  const productCandidates = buildProductCandidates({
    merged,
    input,
    productLookup,
    confirmedIdentity: confirmedProductIdentity,
    formData
  });
  if (merged.imageRoleTelemetry?.contradictions?.length) {
    input.analysisResult.imageRoleTelemetry = merged.imageRoleTelemetry;
  }

  if (!input.suggestedPrice && latestAnalysis?.priceRange?.suggested) {
    input.suggestedPrice = latestAnalysis.priceRange.suggested;
  } else if (!input.suggestedPrice && merged.resaleSuggested) {
    input.suggestedPrice = merged.resaleSuggested;
  }

  if (aiFallbackMode && !merged.summary) {
    merged.summary = "AI vision unavailable; sold comps are required before pricing metrics are shown.";
  }

  const shouldGenerate =
    valueFromForm(formData, "generate") === "true" ||
    valueFromForm(formData, "generate") === "1";
  let comps = null;
  try {
    const compsCacheKey = [
      input.upc,
      input.brand,
      input.model,
      input.categoryHint,
      input.sourceStore
    ].filter(Boolean).join("|");
    comps = await getOrSetCachedValue("market_comps", compsCacheKey, () => getCompsIntelligence(input));
  } catch (error) {
    console.error("comps intelligence error", error);
  }
  const trustedCompSummary = buildTrustedCompSummary(comps, {
    title: input.model || input.analysisResult?.itemTitle || "",
    model: input.model || "",
    upc: input.upc || input.analysisResult?.upc || "",
    brand: input.brand || input.analysisResult?.brand || "",
    category: input.categoryHint || input.analysisResult?.category || "",
    visualAnchors: input.analysisResult?.visualAnchors || [],
    packagingHints: input.analysisResult?.packagingHints || [],
    ocrText: input.analysisResult?.ocrText || []
  });

  const hasProductEnrichment = Boolean(
    productLookup?.title || productLookup?.brand || productLookup?.category || productLookup?.imageUrl
  );
  const enrichmentStatus = hasProductEnrichment ? "available" : "unavailable";
  const pricing = normalizePricing(getPricingRecommendation(input, comps));
  const verifiedSoldComps = extractVerifiedSoldCompPrice({ trustedCompSummary, pricing, comps });
  const userVerifiedPricing = calculateUserVerifiedPricing(userVerifiedCorrection);
  const personalSaleMatch = findPersonalSaleMatch(salesHistory, {
    upc: input.upc || input.analysisResult?.upc || "",
    title: input.model || input.analysisResult?.itemTitle || "",
    brand: input.brand || input.analysisResult?.brand || "",
    category: input.categoryHint || input.analysisResult?.category || "",
    ocrText: input.analysisResult?.ocrText || [],
    visualAnchors: input.analysisResult?.visualAnchors || [],
    packagingHints: input.analysisResult?.packagingHints || [],
    matchingKeys: scanMatchingKeys.matchingKeys
  });
  logInfo("user_verified_sale.lookup.completed", {
    requestId,
    userId: context.userId || "anonymous",
    matched: Boolean(personalSaleMatch),
    matchedSaleId: personalSaleMatch?.sale?.id || "",
    matchReason: personalSaleMatch?.matchReason || "",
    storageKeyUsed: "boss-listers.salesHistory.v1"
  });
  const personalSalePricing = calculatePersonalSalePricing(personalSaleMatch, sourceCostResolution.resolvedCostBasis);
  const pricingSourceDecision = routePricingSource({
    verifiedSoldComps,
    userVerifiedSale: personalSalePricing
      ? {
          resalePrice: personalSalePricing.resalePrice,
          costPaid: personalSalePricing.costPaid,
          shippingEstimate: personalSalePricing.shippingEstimate,
          netProfit: personalSalePricing.netProfit,
          roi: personalSalePricing.roi,
          source: "manual_sold_comp"
        }
      : null,
    userVerifiedCorrection: userVerifiedPricing,
    manualOverride: resellerOverride
      ? {
          resalePrice: resellerOverride.estimate,
          costPaid: resellerOverride.costBasis,
          shippingEstimate: resellerOverride.shippingEstimate ?? 5.75,
          netProfit: resellerOverride.netProfit,
          roi: resellerOverride.roi,
          source: "manual_sold_comp"
        }
      : null,
    cachedPreviousVerified: null
  });
  pricing.pricingSource = pricingSourceDecision.source;
  if (pricingSourceDecision.resalePrice != null) {
    pricing.selectedPrice = pricingSourceDecision.resalePrice;
    pricing.averageSoldPrice = pricingSourceDecision.resalePrice;
    pricing.pricingStatus = pricingSourceDecision.pricingStatus;
    if ("manualOverride" in pricingSourceDecision) {
      pricing.netProfit = pricingSourceDecision.manualOverride.netProfit;
      pricing.roi = pricingSourceDecision.manualOverride.roi;
      pricing.expectedProfit = {
        ...(pricing.expectedProfit || {}),
        salePrice: pricingSourceDecision.resalePrice,
        netProfit: pricingSourceDecision.manualOverride.netProfit,
        roiPct: pricingSourceDecision.manualOverride.roi
      };
      pricing.profitSummary = {
        ...(pricing.profitSummary || {}),
        salePrice: pricingSourceDecision.resalePrice,
        netProfit: pricingSourceDecision.manualOverride.netProfit,
        roiPct: pricingSourceDecision.manualOverride.roi
      };
    }
  }
  logInfo("pricing_source.finalized", {
    requestId,
    userId: context.userId || "anonymous",
    finalPricingSource: pricingSourceDecision.source,
    resalePrice: pricingSourceDecision.resalePrice,
    pricingStatus: pricingSourceDecision.pricingStatus
  });
  pricing.pricingHierarchy = [
    "verified_sold_comps",
    "USER_VERIFIED_SALE",
    "USER_VERIFIED",
    "cached_previous_verified_result",
    "null"
  ];
  if (pricingSourceDecision.source === "none") {
    pricing.selectedPrice = null;
    pricing.averageSoldPrice = null;
    pricing.netProfit = null;
    pricing.roi = null;
    pricing.expectedProfit = {
      ...(pricing.expectedProfit || {}),
      salePrice: null,
      netRevenue: null,
      netProfit: null,
      roiPct: null
    };
    pricing.profitSummary = {
      ...(pricing.profitSummary || {}),
      salePrice: null,
      netProfit: null,
      roiPct: null,
      maxBuyPrice: null
    };
    pricing.bestMarketplace = null;
    pricing.platformBreakdown = [];
    pricing.comparisonPlatforms = [];
  }
  if (pricing.selectedPrice == null) {
    pricing.averageSoldPrice = null;
    pricing.netProfit = null;
    pricing.roi = null;
    pricing.enrichmentStatus = enrichmentStatus;
    pricing.compsStatus = "unavailable";
    pricing.pricingStatus = "unavailable";
  }
  if (trustedCompSummary.soldCount <= 0 && pricingSourceDecision.source === "none") {
    pricing.selectedPrice = null;
    pricing.averageSoldPrice = null;
    pricing.netProfit = null;
    pricing.roi = null;
    pricing.expectedProfit = {
      ...(pricing.expectedProfit || {}),
      salePrice: null,
      netRevenue: null,
      netProfit: null,
      roiPct: null
    };
    pricing.profitSummary = {
      ...(pricing.profitSummary || {}),
      salePrice: null,
      netProfit: null,
      roiPct: null,
      maxBuyPrice: null
    };
    pricing.compsStatus = "unavailable";
    pricing.pricingStatus = "unavailable";
  }
  let analysis =
    latestAnalysis ||
    validateOrRepairAnalysisResult(
      sanitizePayload(
        buildAnalysis({
          merged,
          input,
          pricing,
          uploadedCount: uploaded.length
        })
      ),
      "fallback.analysisResult"
    );
  if (pricing.selectedPrice == null) {
    analysis.averageSoldPrice = null;
    analysis.netProfit = null;
    analysis.roi = null;
    analysis.demandLevel = null;
    analysis.recommendation = "MANUAL_REVIEW";
    analysis.enrichmentStatus = enrichmentStatus;
    analysis.compsStatus = "unavailable";
    analysis.pricingStatus = "unavailable";
  }
  analysis.pricingSource = pricingSourceDecision.source;
  analysis.pricingHierarchy = pricing.pricingHierarchy;
  analysis.userVerifiedCorrection = userVerifiedCorrection || null;
  analysis.matchedPersonalSale = personalSaleMatch || null;
  analysis.scanFingerprint = scanMatchingKeys.scanFingerprint;
  analysis.matchingKeys = scanMatchingKeys.matchingKeys;
  analysis.productCandidates = productCandidates;
  analysis.confirmedProductIdentity = confirmedProductIdentity;
  analysis.trustedCompSummary = trustedCompSummary;
  analysis.generatedSearchQueries = comps?.generatedSearchQueries || [];
  analysis.generatedSearchQueryTelemetry = comps?.generatedSearchQueryTelemetry || comps?.signals?.generatedSearchQueryTelemetry || [];
  analysis.enrichmentStages = comps?.enrichmentStages || [];
  analysis.trustScore = trustedCompSummary.trustScore ?? trustedCompSummary.identityConfidence?.score ?? 0;
  analysis.imageRoleTelemetry = merged.imageRoleTelemetry || null;
  if (analysis.imageRoleTelemetry?.contradictions?.length) {
    analysis.confidence = Math.min(Number(analysis.confidence) || 0, 0.45);
    analysis.confidenceScore = Math.min(Number(analysis.confidenceScore) || 0, 45);
    analysis.recommendation = "MANUAL_REVIEW";
    analysis.recommendationExplanation = [
      analysis.recommendationExplanation,
      `Image evidence conflicts: ${analysis.imageRoleTelemetry.contradictions.join(", ")}.`
    ].filter(Boolean).join(" ");
  }
  const calibrationTuning = buildCalibrationTuning({
    history: calibrationHistory,
    analysis,
    trustedCompSummary
  });
  analysis.breakEven = trustedCompSummary.soldCount > 0 ? analysis.breakEven ?? null : null;
  analysis.sourceStoreType = sourceCostResolution.sourceStoreType || "";
  analysis.resolvedCostBasis = sourceCostResolution.resolvedCostBasis;
  analysis.lookupSource = sourceCostResolution.lookupSource || "";
  analysis.manualOverrideValue = sourceCostResolution.manualOverrideValue;
  analysis.resaleAuthoritySource = "eBay SOLD comps";
  analysis.sourceBadges = Array.from(
    new Set([
      ...(analysis.sourceBadges || []),
      sourceCostResolution.sourceStoreType === "WALMART"
        ? "Walmart"
        : sourceCostResolution.sourceStoreType === "DOLLAR_TREE"
          ? "Dollar Tree"
          : sourceCostResolution.sourceStoreType === "MANUAL"
            ? "Manual Cost"
            : ""
    ].filter(Boolean))
  );
  analysis.sellThroughRatio = estimateSellThroughRatio({ analysis, pricing, comps });
  analysis.marketConfidence = getMarketConfidence({ analysis, pricing, comps });
  analysis.recommendedMarketplace = getRecommendedMarketplace(pricing);
  analysis.marketplaceEligibility = buildMarketplaceEligibility({ analysis, input });
  analysis.sourcingAnalytics = buildSourcingAnalytics({ analysis, pricing, comps });
  analysis.sourcingTip = categorySpecificSourcingTip({ analysis, pricing, comps });
  let marketData = [];
  try {
    marketData = await getMarketplaceSignals({
      upc: analysis.upc,
      title: analysis.itemTitle,
      brand: analysis.brand,
      category: analysis.category
    });
  } catch (error) {
    console.error("market adapter error", error);
  }
  const intelligence = buildResaleIntelligence({
    analysis,
    pricing,
    marketData,
    productLookup,
    barcodeDetected: Boolean(scannedBarcode || analysis.upc),
    visionUsed: visionSucceeded
  });
  analysis.estimatedResalePrice = intelligence.estimatedResalePrice;
  analysis.estimatedProfit = intelligence.estimatedProfit;
  analysis.roiPercentage = intelligence.roiPercentage;
  analysis.demandScore = intelligence.demandScore;
  analysis.confidenceScore = intelligence.confidenceScore;
  analysis.recommendation = intelligence.recommendation;
  analysis.recommendationExplanation = intelligence.explanation;
  analysis.sourceBadges = Array.from(
    new Set([
      ...(intelligence.sourceBadges || []),
      ...(analysis.sourceBadges || []),
      analysis.marketDataUnavailable ? "Market data unavailable" : "Authorized market data"
    ])
  );
  analysis.marketDataUnavailable = intelligence.marketDataUnavailable;
  analysis.marketData = marketData;
  analysis.sourcingTip = intelligence.explanation || analysis.sourcingTip;
  if (calibrationTuning.adjustment && trustedCompSummary.soldCount > 0) {
    analysis.confidenceScore = Math.max(
      0,
      Math.min(99, Math.round((Number(analysis.confidenceScore) || 0) + calibrationTuning.adjustment))
    );
    analysis.trustScore = Math.max(
      0,
      Math.min(99, Math.round((Number(analysis.trustScore) || 0) + calibrationTuning.adjustment))
    );
  } else if (calibrationTuning.adjustment < 0) {
    analysis.confidenceScore = Math.max(
      0,
      Math.min(99, Math.round((Number(analysis.confidenceScore) || 0) + calibrationTuning.adjustment))
    );
    analysis.trustScore = Math.max(
      0,
      Math.min(99, Math.round((Number(analysis.trustScore) || 0) + calibrationTuning.adjustment))
    );
  }
  analysis.calibrationLog = {
    rawOcrText: analysis.ocrText || [],
    generatedSearchQueries: analysis.generatedSearchQueries || [],
    generatedSearchQueryTelemetry: analysis.generatedSearchQueryTelemetry || [],
    acceptedComps: trustedCompSummary.acceptedComps || 0,
    rejectedComps: trustedCompSummary.rejectedComps || 0,
    rejectionReasons: trustedCompSummary.rejectionReasons || {},
    identityConfidence: trustedCompSummary.identityConfidence || null,
    imageRoleTelemetry: analysis.imageRoleTelemetry || null,
    adaptiveConfidenceAdjustment: calibrationTuning.adjustment,
    adaptiveConfidenceReasons: calibrationTuning.reasons,
    identityReason:
      trustedCompSummary.identityConfidence?.upcMatched
        ? "UPC matched trusted sold evidence."
        : trustedCompSummary.identityConfidence?.brandMatched
          ? "Brand and title tokens matched trusted sold evidence."
          : "Identity remains weak until stronger UPC, title, or correction evidence appears.",
    recommendationReason: analysis.recommendationExplanation || analysis.sourcingTip || "",
    finalRecommendation: analysis.recommendation || "MANUAL_REVIEW"
  };
  if (pricing.selectedPrice == null) {
    analysis.averageSoldPrice = null;
    analysis.netProfit = null;
    analysis.roi = null;
    analysis.demandLevel = null;
    analysis.recommendation = "MANUAL_REVIEW";
    analysis.enrichmentStatus = enrichmentStatus;
    analysis.compsStatus = "unavailable";
    analysis.pricingStatus = "unavailable";
  }
  if (pricingSourceDecision.source === "USER_VERIFIED" && userVerifiedPricing) {
    analysis.itemTitle = userVerifiedCorrection?.productTitle || analysis.itemTitle;
    analysis.brand = userVerifiedCorrection?.brand || analysis.brand;
    analysis.upc = userVerifiedCorrection?.upc || analysis.upc;
    analysis.condition = userVerifiedCorrection?.condition || analysis.condition;
    analysis.estimatedResalePrice = userVerifiedPricing.resalePrice;
    analysis.estimatedProfit = userVerifiedPricing.netProfit;
    analysis.roiPercentage = userVerifiedPricing.roi;
    analysis.averageSoldPrice = userVerifiedPricing.resalePrice;
    analysis.netProfit = userVerifiedPricing.netProfit;
    analysis.roi = userVerifiedPricing.roi;
    analysis.pricingSource = "USER_VERIFIED";
    analysis.pricingStatus = "user_verified";
    analysis.compsStatus = "user_verified";
    analysis.recommendation = "INVESTIGATE";
    analysis.recommendationExplanation = [
      "USER_VERIFIED correction applied.",
      "Raw AI data and raw sold comp data were preserved separately."
    ].join(" ");
    analysis.sourcingTip = analysis.recommendationExplanation;
    analysis.marketDataUnavailable = false;
    analysis.sourceBadges = Array.from(new Set([...(analysis.sourceBadges || []), "USER_VERIFIED"]));
  }
  if (pricingSourceDecision.source === "USER_VERIFIED_SALE" && personalSalePricing && personalSaleMatch) {
    analysis.estimatedResalePrice = personalSalePricing.resalePrice;
    analysis.estimatedProfit = personalSalePricing.netProfit;
    analysis.roiPercentage = personalSalePricing.roi;
    analysis.averageSoldPrice = personalSalePricing.resalePrice;
    analysis.netProfit = personalSalePricing.netProfit;
    analysis.roi = personalSalePricing.roi;
    analysis.pricingSource = "USER_VERIFIED_SALE";
    analysis.pricingStatus = "user_verified_sale";
    analysis.compsStatus = "user_verified_sale";
    analysis.confidenceScore = Math.min(
      99,
      Math.max(0, Math.round((Number(analysis.confidenceScore) || 0) + personalSalePricing.confidenceBoost))
    );
    analysis.recommendationExplanation = [
      "Matched your previous sale.",
      personalSalePricing.matchReason,
      "Imported sales history is USER_VERIFIED_SALE evidence; raw AI data was not overwritten."
    ].filter(Boolean).join(" ");
    analysis.sourcingTip = analysis.recommendationExplanation;
    analysis.marketDataUnavailable = false;
    analysis.sourceBadges = Array.from(new Set([...(analysis.sourceBadges || []), "USER_VERIFIED_SALE"]));
  }
  if (trustedCompSummary.soldCount <= 0 && !resellerOverride && !userVerifiedPricing && !personalSalePricing) {
    analysis.estimatedResalePrice = null;
    analysis.estimatedProfit = null;
    analysis.roiPercentage = null;
    analysis.averageSoldPrice = null;
    analysis.netProfit = null;
    analysis.roi = null;
    analysis.breakEven = null;
    analysis.priceRange = { low: null, suggested: null, high: null };
    analysis.soldPriceRange = null;
    analysis.pricingSource = "none";
    analysis.pricingStatus = "unavailable";
    analysis.compsStatus = "unavailable";
    analysis.recommendation = "MANUAL_REVIEW";
    analysis.recommendationExplanation = [
      "No sold comps found.",
      "Manual price required.",
      "Fallback estimate disabled.",
      "Real pricing unavailable."
    ].join(" ");
    analysis.sourcingTip = analysis.recommendationExplanation;
    analysis.marketDataUnavailable = true;
  }
  if (resellerOverride) {
    analysis.estimatedResalePrice = resellerOverride.estimate;
    analysis.estimatedProfit = resellerOverride.netProfit;
    analysis.roiPercentage = resellerOverride.roi;
    analysis.averageSoldPrice = resellerOverride.estimate;
    analysis.netProfit = resellerOverride.netProfit;
    analysis.roi = resellerOverride.roi;
    analysis.pricingSource = "manual_sold_comp";
    analysis.pricingStatus = "manual";
    analysis.compsStatus = "manual_override";
    analysis.recommendation = resellerOverride.recommendation;
    analysis.recommendationExplanation = [
      "Reseller-provided resale override applied; raw sold comp data was not overwritten.",
      resellerOverride.confidenceNote ? `Confidence note: ${resellerOverride.confidenceNote}` : "",
      resellerOverride.sourcingNotes ? `Sourcing note: ${resellerOverride.sourcingNotes}` : ""
    ]
      .filter(Boolean)
      .join(" ");
    analysis.sourcingTip = analysis.recommendationExplanation;
    analysis.manualReviewRecommended = resellerOverride.recommendation !== "HOLD";
    analysis.sourceBadges = Array.from(new Set([...(analysis.sourceBadges || []), "Reseller Override"]));
    analysis.resellerOverride = {
      type: "reseller_provided",
      resaleEstimate: resellerOverride.estimate,
      soldRangeLow: resellerOverride.low,
      soldRangeHigh: resellerOverride.high,
      confidenceNote: resellerOverride.confidenceNote,
      sourcingNotes: resellerOverride.sourcingNotes
    };
  }
  const trustExplanation = buildTrustExplanation({
    analysis,
    pricing,
    comps,
    productLookup,
    enrichmentStatus
  });
  if (trustExplanation && !resellerOverride) {
    analysis.recommendationExplanation = [analysis.recommendationExplanation, trustExplanation]
      .filter(Boolean)
      .join(" ");
    analysis.sourcingTip = [analysis.sourcingTip, trustExplanation].filter(Boolean).join(" ");
  }
  if (aiFallbackMode) {
    const hasUserVerifiedEvidence = ["USER_VERIFIED_SALE", "USER_VERIFIED"].includes(pricingSourceDecision.source);
    if (!hasUserVerifiedEvidence) {
      analysis.confidence = Math.min(Number(analysis.confidence) || 0, analysis.upc ? 0.35 : 0.25);
      analysis.confidenceScore = Math.min(Number(analysis.confidenceScore) || 0, analysis.upc ? 35 : 25);
      analysis.profitConfidenceScore = Math.min(Number(analysis.profitConfidenceScore) || 0, 35);
      analysis.sourcingConfidenceScore = Math.min(Number(analysis.sourcingConfidenceScore) || 0, 35);
    }
    if (!resellerOverride && !hasUserVerifiedEvidence) {
      analysis.recommendation =
        pricing.selectedPrice == null
          ? "MANUAL_REVIEW"
          : analysis.recommendation === "PASS"
            ? "PASS"
            : "HOLD";
      analysis.recommendationExplanation = AI_FALLBACK_NOTICE;
      analysis.sourcingTip = AI_FALLBACK_NOTICE;
    }
    analysis.marketDataUnavailable = !hasUserVerifiedEvidence;
    analysis.manualReviewRecommended = !hasUserVerifiedEvidence;
    analysis.sourceBadges = Array.from(
      new Set([...(analysis.sourceBadges || []), ...(analysis.upc ? ["Barcode"] : [])])
    );
  }
  if (analysis.calibrationLog) {
    analysis.calibrationLog.finalRecommendation = analysis.recommendation || "MANUAL_REVIEW";
    analysis.calibrationLog.recommendationReason = analysis.recommendationExplanation || analysis.sourcingTip || "";
  }
  analysis = validateOrRepairAnalysisResult(sanitizePayload(analysis), "enriched.analysisResult");
  const dashboardComps = getDashboardComps({ analysis, pricing, comps, input, imageUrls });
  analysis.comps = dashboardComps;
  const engineDecision = buildEngineDecisionModel({
    analysis,
    pricing,
    comps,
    dashboardComps,
    intelligence,
    enrichmentStatus,
    trustedCompSummary
  });
  analysis.marketComps = engineDecision.marketComps;
  analysis.resellerSignals = engineDecision.resellerSignals;
  analysis.missingDataPoints = engineDecision.missingDataPoints;
  analysis.engineTelemetry = engineDecision.engineTelemetry;
  analysis.decisionCard = engineDecision.decisionCard;
  if (
    ["MANUAL_REVIEW", "HOLD"].includes(engineDecision.decisionCard.action) &&
    analysis.recommendation === "BUY"
  ) {
    analysis.recommendation = engineDecision.decisionCard.action;
    analysis.recommendationExplanation = [
      analysis.recommendationExplanation,
      engineDecision.decisionCard.action === "MANUAL_REVIEW"
        ? "Engine requires manual review because identity or sold-comp evidence is weak."
        : "Engine downgraded BUY to HOLD because liquidity, saturation, or confidence evidence is not strong enough."
    ]
      .filter(Boolean)
      .join(" ");
    analysis.decisionCard.action = engineDecision.decisionCard.action;
    analysis.decisionCard.reasoning = analysis.recommendationExplanation;
  }
  const resellerEngineResult = runResellerEngine(
    buildResellerMarketFacts({ analysis, trustedCompSummary, pricing, input })
  );
  analysis.resellerBehaviorProfile = resellerEngineResult.resellerBehaviorProfile;
  analysis.resellerRuleActions = resellerEngineResult.resellerRuleActions;
  analysis.resellerWarnings = resellerEngineResult.resellerWarnings;
  analysis.adjustedRecommendation = resellerEngineResult.adjustedRecommendation;
  analysis.adjustedConfidenceScore = resellerEngineResult.adjustedConfidenceScore;
  analysis.explanationSummary = resellerEngineResult.explanationSummary;
  analysis.resellerEngineTelemetry = {
    saturationRatio: resellerEngineResult.saturationRatio,
    shippingFrictionRatio: resellerEngineResult.shippingFrictionRatio,
    returnRisk: resellerEngineResult.returnRisk,
    incompleteListingRisk: resellerEngineResult.incompleteListingRisk,
    confidenceDegradationReasons: resellerEngineResult.confidenceDegradationReasons,
    confidenceCollapseReason: resellerEngineResult.confidenceCollapseReason,
    estimatedDaysToSell: resellerEngineResult.estimatedDaysToSell,
    liquidityTier: resellerEngineResult.liquidityTier,
    competitionPressure: resellerEngineResult.competitionPressure,
    marketSaturation: resellerEngineResult.marketSaturation,
    marketBehaviorSummary: resellerEngineResult.marketBehaviorSummary,
    finalRecommendationReasoning: resellerEngineResult.finalRecommendationReasoning,
    resellerPainScore: resellerEngineResult.resellerPainScore,
    storagePenalty: resellerEngineResult.storagePenalty,
    staleInventoryRisk: resellerEngineResult.staleInventoryRisk,
    marketBehaviorSimulation: resellerEngineResult.marketBehaviorSimulation,
    ruleExecutionOrder: resellerEngineResult.resellerRuleActions.map((rule) => rule.ruleId)
  };
  analysis.recommendation = resellerEngineResult.adjustedRecommendation;
  analysis.confidenceScore = resellerEngineResult.adjustedConfidenceScore;
  analysis.recommendationExplanation = [
    analysis.recommendationExplanation,
    resellerEngineResult.explanationSummary
  ].filter(Boolean).join(" ");
  if (analysis.decisionCard) {
    analysis.decisionCard.action = resellerEngineResult.adjustedRecommendation;
    analysis.decisionCard.confidenceScore = resellerEngineResult.adjustedConfidenceScore;
    analysis.decisionCard.reasoning = analysis.recommendationExplanation;
  }
  if (pricingSourceDecision.source === "USER_VERIFIED_SALE" && personalSalePricing && personalSaleMatch) {
    analysis.pricingSource = "USER_VERIFIED_SALE";
    analysis.pricingStatus = "user_verified_sale";
    analysis.compsStatus = "user_verified_sale";
    analysis.estimatedResalePrice = personalSalePricing.resalePrice;
    analysis.estimatedProfit = personalSalePricing.netProfit;
    analysis.roiPercentage = personalSalePricing.roi;
    analysis.averageSoldPrice = personalSalePricing.resalePrice;
    analysis.netProfit = personalSalePricing.netProfit;
    analysis.roi = personalSalePricing.roi;
    analysis.confidenceScore = Math.min(99, Math.max(Number(analysis.confidenceScore) || 0, 70));
    analysis.adjustedConfidenceScore = Math.min(99, Math.max(Number(analysis.adjustedConfidenceScore) || 0, 70));
    analysis.marketDataUnavailable = false;
    analysis.recommendationExplanation = [
      "Matched your previous sale.",
      personalSalePricing.matchReason,
      analysis.recommendationExplanation
    ].filter(Boolean).join(" ");
    analysis.sourceBadges = Array.from(new Set([...(analysis.sourceBadges || []), "USER_VERIFIED_SALE"]));
  }
  analysis.listingOrchestration = orchestrateListings({
    title: buildResellerTitle({ merged: analysis, input }) || buildFallbackTitle({ merged: analysis, input }),
    brand: analysis.brand || input.brand || "",
    category: analysis.category || input.categoryHint || "",
    condition: analysis.condition || "",
    upc: analysis.upc || input.upc || "",
    keyDetails: analysis.keyDetails || analysis.recognitionEvidence || [],
    description: analysis.summary || analysis.recommendationExplanation || "",
    recommendation:
      resellerEngineResult.marketBehaviorSimulation?.simulationRecommendation ||
      resellerEngineResult.adjustedRecommendation
  });
  analysis.crossListDrafts = analysis.listingOrchestration.adaptedListings;
  analysis.inventorySyncSnapshot = buildInventorySyncSnapshot({
    title: buildResellerTitle({ merged: analysis, input }) || buildFallbackTitle({ merged: analysis, input }),
    brand: analysis.brand || input.brand || "",
    upc: analysis.upc || input.upc || "",
    condition: analysis.condition || "",
    category: analysis.category || input.categoryHint || "",
    quantity: Number(input.quantity || analysis.quantity) || 1,
    images: imageUrls,
    estimatedResalePrice: analysis.estimatedResalePrice ?? trustedCompSummary?.averageSoldPrice ?? null,
    costBasis: analysis.resolvedCostBasis ?? input.costBasis ?? null,
    drafts: analysis.crossListDrafts
  });
  analysis.inventoryOS = buildInventoryOSSnapshot({
    inventorySyncSnapshot: analysis.inventorySyncSnapshot,
    marketSimulation: resellerEngineResult.marketBehaviorSimulation
  });
  const executionAgents = runExecutionAgents({
    analysis,
    pricing,
    trustedCompSummary,
    comps,
    marketData
  });
  analysis.aiAgentSummary = executionAgents.summary;
  analysis.aiAgentEvents = executionAgents.events;
  analysis.aiAgentTelemetry = executionAgents.telemetry;
  analysis.aiAgentDecisions = executionAgents.agents;
  analysis.executionFlow = executionAgents.executionFlow;
  analysis.agentDecisionHierarchy = executionAgents.decisionHierarchy;
  if (analysis.calibrationLog) {
    analysis.calibrationLog.finalRecommendation = analysis.recommendation || analysis.decisionCard?.action || "MANUAL_REVIEW";
    analysis.calibrationLog.recommendationReason = analysis.recommendationExplanation || analysis.sourcingTip || "";
  }
  const normalizedComps = normalizeComps(comps, dashboardComps);
  const enrichedInput = {
    ...input,
    analysisResult: analysis
  };
  const outputs =
    shouldGenerate && (input.brand || input.model || titleHint) ? generateForAll(enrichedInput) : [];
  const primaryDraft = generateForAll(enrichedInput).find((item) => item.platform === "eBay");
  const sessionId = valueFromForm(formData, "sessionId", "anon");
  const saved =
    shouldGenerate && outputs.length
      ? await saveListing({
          sessionId,
          input: enrichedInput,
          outputs,
          imageUrls
        })
      : null;

  const payload = validateOrRepairAnalyzeDashboardPayload({
    ok: true,
    hints: merged,
    analysis,
    input: enrichedInput,
    pricing,
    comps: normalizedComps,
    trustedCompSummary,
    productLookup,
    marketData,
    decision: buildDecisionSummary({ pricing, analysis }),
    listing: normalizeLiveDashboardListing({
      analysis,
      input,
      pricing,
      imageUrls,
      dashboardComps,
      comps
    }),
    primaryDraft,
    outputs,
    savedId: saved?.id || null,
    imageUrls,
    scanStatus: {
      usedVision: visionSucceeded,
      visionAttempted,
      barcodeDetected: Boolean(scannedBarcode),
      fallbackActivated:
        aiFallbackMode || (uploaded.length > 0 && (!visionEnabled || (visionAttempted && !visionSucceeded))),
      warning:
        aiFallbackMode
          ? AI_FALLBACK_NOTICE
          : uploaded.length && !visionEnabled
            ? "AI vision is not configured, so this scan used fallback heuristics."
            : visionAttempted && !visionSucceeded
              ? "AI vision failed, so this scan used fallback heuristics."
              : ""
    },
    instrumentation: {
      requestId,
      durationMs: Date.now() - startedAt,
      openAiRequestDurationMs: visionMeta?.durationMs || null,
      estimatedTokenUsage: visionMeta?.estimatedTokens || 0,
      imagePayloadBytes,
      imageCount: uploaded.length,
      fallbackActivated:
        aiFallbackMode || (uploaded.length > 0 && (!visionEnabled || (visionAttempted && !visionSucceeded))),
      aiFallbackMode,
      aiFallbackReason,
      malformedPayloadRepair: false
    }
  });
  if (payload.scanStatus?.fallbackActivated || aiFallbackMode) {
    logWarn("scan.fallback_payload.generated", {
      requestId,
      userId: context.userId || "anonymous",
      aiFallbackMode,
      aiFallbackReason,
      schemaValid: true
    });
  } else {
    logInfo("scan.schema.validation.success", {
      requestId,
      userId: context.userId || "anonymous"
    });
  }
  logInfo("scan.completed", {
    requestId,
    userId: context.userId || "anonymous",
    durationMs: Date.now() - startedAt,
    usedVision: payload.scanStatus.usedVision,
    fallbackActivated: payload.scanStatus.fallbackActivated,
    estimatedTokenUsage: payload.instrumentation?.estimatedTokenUsage || 0,
    imagePayloadBytes
  });
  try {
    await persistExecutionSnapshot({
      requestId,
      sessionId,
      payload,
      analysis,
      pricing,
      trustedCompSummary
    });
  } catch (error) {
    logWarn("execution.snapshot.persist_failed", {
      requestId,
      userId: context.userId || "anonymous",
      error: error?.message || "Persistent execution snapshot failed."
    });
  }
  return payload;
}
