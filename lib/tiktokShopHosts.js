// lib/tiktokShopHosts.js
// Official TikTok Shop hosts by market. Verified 2026-11-21 against:
//   https://partner.tiktokshop.com/docv2/page/authorization-overview-202407
//   https://partner.tiktokshop.com/docv2/page/create-your-app
//   https://partner.tiktokshop.com/docv2/page/methods-and-endpoints
//
// Seller authorization entry URLs differ for US vs Rest of World (ROW).
// Token exchange/refresh and OpenAPI resource hosts are the same in both
// markets, but are still overridable via env. Defaults are the US values.
//
// Region: TIKTOK_SHOP_REGION or NEXT_PUBLIC_TIKTOK_SHOP_REGION = US | ROW
//   (GLOBAL / WW / REST are treated as ROW). Default: US.
// Browser code must use the NEXT_PUBLIC_ vars, which Next inlines at build.
// Optional overrides (trailing slashes stripped):
//   TIKTOK_SHOP_AUTH_URL / NEXT_PUBLIC_TIKTOK_SHOP_AUTH_URL
//     — seller authorize URL with no query string
//   TIKTOK_SHOP_AUTH_HOST — token API host, e.g. https://auth.tiktok-shops.com
//   TIKTOK_SHOP_API_HOST  — OpenAPI host, e.g. https://open-api.tiktokglobalshop.com

const REGIONS = {
  US: {
    partnerCenter: "https://partner.us.tiktokshop.com",
    authorizeUrl: "https://services.us.tiktokshop.com/open/authorize",
    authHost: "https://auth.tiktok-shops.com",
    apiHost: "https://open-api.tiktokglobalshop.com",
  },
  ROW: {
    partnerCenter: "https://partner.tiktokshop.com",
    authorizeUrl: "https://services.tiktokshop.com/open/authorize",
    authHost: "https://auth.tiktok-shops.com",
    apiHost: "https://open-api.tiktokglobalshop.com",
  },
};

function firstEnv(env, names) {
  for (const name of names) {
    const value = env && env[name];
    if (typeof value === "string" && value.trim()) {
      return value.trim().replace(/\/+$/, "");
    }
  }
  return "";
}

function normalizeRegion(value) {
  const raw = String(value || "US").trim().toUpperCase();
  if (raw === "ROW" || raw === "GLOBAL" || raw === "WW" || raw === "REST") return "ROW";
  return "US";
}

function getTikTokShopHosts(env) {
  const e = env || (typeof process !== "undefined" ? process.env : {});
  const region = normalizeRegion(firstEnv(e, ["NEXT_PUBLIC_TIKTOK_SHOP_REGION", "TIKTOK_SHOP_REGION"]) || "US");
  const defaults = REGIONS[region];
  const authorizeUrl = firstEnv(e, [
    "NEXT_PUBLIC_TIKTOK_SHOP_AUTH_URL",
    "TIKTOK_SHOP_AUTH_URL",
    "NEXT_PUBLIC_TIKTOK_SHOP_AUTHORIZE_URL",
    "TIKTOK_SHOP_AUTHORIZE_URL",
  ]) || defaults.authorizeUrl;
  const authHost = firstEnv(e, ["TIKTOK_SHOP_AUTH_HOST"]) || defaults.authHost;
  const apiHost = firstEnv(e, ["TIKTOK_SHOP_API_HOST", "TIKTOK_SHOP_API_BASE"]) || defaults.apiHost;
  return {
    region,
    partnerCenter: defaults.partnerCenter,
    authorizeUrl,
    authHost,
    apiHost,
    tokenGetUrl: authHost + "/api/v2/token/get",
    tokenRefreshUrl: authHost + "/api/v2/token/refresh",
  };
}

module.exports = {
  REGIONS,
  normalizeRegion,
  getTikTokShopHosts,
};
