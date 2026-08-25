import { normalizeBarcodeValue } from "./barcodeService";

const PRODUCT_LOOKUP_TIMEOUT_MS = 2500;

async function fetchJsonWithTimeout(url, options = {}) {
  const { timeoutMs, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    timeoutMs || PRODUCT_LOOKUP_TIMEOUT_MS
  );
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal
    });
    if (!response.ok) return null;
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

function firstString(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const nested = firstString(...value);
      if (nested) return nested;
    } else if (value != null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function normalizeMoney(value) {
  if (value == null || value === "") return null;
  const number =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) && number >= 0 ? Number(number.toFixed(2)) : null;
}

function normalizeProductResult({
  upc,
  title = "",
  brand = "",
  category = "",
  imageUrl = "",
  source = "unavailable",
  sourceId = "",
  walmartPrice = null,
  confidence = 0
} = {}) {
  const image = String(imageUrl || "").trim();
  return {
    upc: normalizeBarcodeValue(upc),
    title: String(title || "").trim(),
    brand: String(brand || "").trim(),
    category: String(category || "").trim(),
    image,
    imageUrl: image,
    source,
    sourceId: String(sourceId || "").trim(),
    walmartPrice: normalizeMoney(walmartPrice),
    confidence: Math.max(0, Math.min(1, Number(confidence) || 0))
  };
}

function unavailableBarcodeProduct(upc) {
  return normalizeProductResult({
    upc,
    source: "unavailable",
    confidence: 0
  });
}

async function lookupOpenFoodFacts(upc) {
  const data = await fetchJsonWithTimeout(`https://world.openfoodfacts.org/api/v2/product/${upc}.json`, {
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  const product = data?.product;
  if (!product) return null;
  return normalizeProductResult({
    upc,
    title: product.product_name || product.generic_name || "",
    brand: product.brands?.split(",")?.[0] || "",
    category: product.categories_tags?.[0]?.replace(/^en:/, "") || product.categories || "",
    imageUrl: product.image_front_url || product.image_url || "",
    source: "OpenFoodFacts",
    confidence: product.product_name ? 0.72 : 0.45
  });
}

async function lookupUpcItemDb(upc) {
  const apiKey = process.env.UPCITEMDB_API_KEY;
  if (!apiKey) return null;
  const data = await fetchJsonWithTimeout(`https://api.upcitemdb.com/prod/trial/lookup?upc=${upc}`, {
    headers: {
      Accept: "application/json",
      "user_key": apiKey
    },
    cache: "no-store"
  });
  const item = Array.isArray(data?.items) ? data.items[0] : null;
  if (!item) return null;
  return normalizeProductResult({
    upc,
    title: item.title || "",
    brand: item.brand || "",
    category: item.category || "",
    imageUrl: Array.isArray(item.images) ? item.images[0] : "",
    source: "UPCitemDB",
    confidence: item.title ? 0.82 : 0.5
  });
}

async function lookupBarcodeLookup(upc) {
  const apiKey = process.env.BARCODELOOKUP_API_KEY;
  if (!apiKey) return null;
  const data = await fetchJsonWithTimeout(`https://api.barcodelookup.com/v3/products?barcode=${upc}&key=${apiKey}`, {
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  const product = Array.isArray(data?.products) ? data.products[0] : null;
  if (!product) return null;
  return normalizeProductResult({
    upc,
    title: product.title || "",
    brand: product.brand || "",
    category: product.category || "",
    imageUrl: Array.isArray(product.images) ? product.images[0] : "",
    source: "BarcodeLookup",
    confidence: product.title ? 0.82 : 0.5
  });
}

function walmartEndpointForUPC(upc, endpoint, apiKey) {
  if (!endpoint) return "";
  const url = new URL(endpoint.includes("{upc}") ? endpoint.replace("{upc}", upc) : endpoint);
  if (!endpoint.includes("{upc}") && !url.searchParams.has("upc")) {
    url.searchParams.set("upc", upc);
  }
  if (apiKey && !url.searchParams.has("apiKey") && !url.searchParams.has("key")) {
    url.searchParams.set("apiKey", apiKey);
  }
  return url.toString();
}

function walmartProductFromResponse(data) {
  if (!data || typeof data !== "object") return null;
  const candidates = [
    data.product,
    data.item,
    Array.isArray(data.items) ? data.items[0] : null,
    Array.isArray(data.products) ? data.products[0] : null,
    Array.isArray(data.results) ? data.results[0] : null,
    data.data?.product,
    Array.isArray(data.data?.items) ? data.data.items[0] : null,
    Array.isArray(data.data?.products) ? data.data.products[0] : null,
    data
  ];
  return candidates.find((candidate) => candidate && typeof candidate === "object") || null;
}

export async function lookupWalmartUPC(value, options = {}) {
  const upc = normalizeBarcodeValue(value);
  if (!upc) return null;

  const endpoint =
    options.endpoint || process.env.WALMART_UPC_LOOKUP_ENDPOINT || process.env.WALMART_LOOKUP_ENDPOINT;
  const apiKey = options.apiKey || process.env.WALMART_API_KEY;
  const url = walmartEndpointForUPC(upc, endpoint, apiKey);
  if (!url) return null;

  const data = await fetchJsonWithTimeout(url, {
    headers: { Accept: "application/json", ...(options.headers || {}) },
    cache: "no-store",
    timeoutMs: options.timeoutMs
  });
  const product = walmartProductFromResponse(data);
  if (!product) return null;

  const title = firstString(product.title, product.name, product.productName, product.itemName);
  const imageUrl = firstString(
    product.image,
    product.imageUrl,
    product.thumbnailImage,
    product.largeImage,
    product.images,
    product.imageInfo?.thumbnailUrl
  );
  const walmartPrice = normalizeMoney(
    product.walmartPrice ??
      product.price ??
      product.salePrice ??
      product.offerPrice ??
      product.currentPrice?.price ??
      product.priceInfo?.currentPrice?.price
  );
  if (!title && walmartPrice == null) return null;

  return normalizeProductResult({
    upc,
    title,
    brand: firstString(product.brand, product.brandName),
    category: firstString(product.category, product.categoryPath, product.productType, product.department),
    imageUrl,
    walmartPrice,
    source: "Walmart",
    sourceId: "walmart",
    confidence: title ? 0.86 : 0.5
  });
}

export async function lookupProductByBarcode(value) {
  const upc = normalizeBarcodeValue(value);
  if (!upc) return unavailableBarcodeProduct("");

  const provider = String(process.env.PRODUCT_LOOKUP_PROVIDER || "").toLowerCase();
  const lookups = [];
  if (
    provider === "walmart" ||
    process.env.WALMART_UPC_LOOKUP_ENDPOINT ||
    process.env.WALMART_LOOKUP_ENDPOINT
  ) {
    lookups.push(lookupWalmartUPC);
  }
  if (provider === "upcitemdb" || process.env.UPCITEMDB_API_KEY) lookups.push(lookupUpcItemDb);
  if (provider === "barcodelookup" || process.env.BARCODELOOKUP_API_KEY) {
    lookups.push(lookupBarcodeLookup);
  }
  if (provider === "openfoodfacts" || process.env.OPENFOODFACTS_ENABLED === "true") {
    lookups.push(lookupOpenFoodFacts);
  }

  for (const lookup of lookups) {
    try {
      const result = await lookup(upc);
      if (result?.title) return result;
    } catch (error) {
      console.warn("Boss Listers product lookup failed", {
        provider: lookup.name,
        message: error?.message || String(error)
      });
    }
  }

  return unavailableBarcodeProduct(upc);
}
