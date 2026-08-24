import { NextResponse } from "next/server";

export const runtime = "nodejs";

type LocalInventoryRecord = {
  id?: string;
  listing?: Record<string, any>;
  ebayStatus?: string;
  mercariStatus?: string;
  poshmarkStatus?: string;
  facebookStatus?: string;
  linkedChannels?: string[];
  externalListingIds?: Record<string, string | null | undefined>;
  syncMetadata?: {
    duplicateSaleProtection?: boolean;
  };
};

type MarketplaceWebhookBody = {
  platform?: string;
  eventType?: string;
  listingId?: string;
  localListingId?: string;
  inventoryId?: string;
  externalListingId?: string;
  upc?: string;
  title?: string;
  oauthTokenVerified?: boolean;
  duplicateSaleProtectionLock?: boolean;
  confirmedLinkedExternalId?: boolean;
  localInventory?: LocalInventoryRecord[];
  inventory?: LocalInventoryRecord[];
  inventoryItems?: LocalInventoryRecord[];
  event?: Record<string, any>;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePlatform(value: unknown) {
  const platform = text(value).toLowerCase();
  if (platform === "ebay" || platform === "mercari" || platform === "poshmark") return platform;
  return platform || "unknown";
}

function inventoryRecords(body: MarketplaceWebhookBody) {
  return body.localInventory || body.inventory || body.inventoryItems || [];
}

function externalIdForPlatform(item: LocalInventoryRecord, platform: string) {
  const direct = item.externalListingIds?.[platform];
  if (direct) return direct;

  const states = item.listing?.inventorySyncSnapshot?.universalListing?.platformListingStates;
  if (!Array.isArray(states)) return "";
  const state = states.find((candidate) => normalizePlatform(candidate?.platform) === platform);
  return text(state?.platformListingId);
}

function linkedChannels(item: LocalInventoryRecord) {
  if (Array.isArray(item.linkedChannels) && item.linkedChannels.length) {
    return item.linkedChannels.map(String);
  }

  const channels = [
    item.ebayStatus && item.ebayStatus !== "Not Created" ? "ebay" : "",
    item.mercariStatus && item.mercariStatus !== "Not Created" ? "mercari" : "",
    item.poshmarkStatus && item.poshmarkStatus !== "Not Created" ? "poshmark" : ""
  ].filter(Boolean);
  const states = item.listing?.inventorySyncSnapshot?.universalListing?.platformListingStates;
  if (Array.isArray(states)) {
    states.forEach((state) => {
      const platform = normalizePlatform(state?.platform);
      if (platform && platform !== "unknown") channels.push(platform);
    });
  }

  return Array.from(new Set(channels));
}

function exactLocalMatch(body: MarketplaceWebhookBody) {
  const platform = normalizePlatform(body.platform || body.event?.platform);
  const localId = text(body.localListingId || body.inventoryId || body.event?.localListingId);
  const externalId = text(body.externalListingId || body.listingId || body.event?.externalListingId || body.event?.listingId);
  const upc = text(body.upc || body.event?.upc);
  const title = text(body.title || body.event?.title);

  return inventoryRecords(body).find((item) => {
    if (localId && item.id === localId) return true;
    if (externalId && externalIdForPlatform(item, platform) === externalId) return true;
    const itemUpc = text(item.listing?.upc);
    const itemTitle = text(item.listing?.itemTitle || item.listing?.title || item.listing?.confirmedProductIdentity?.title);
    return Boolean(upc && title && itemUpc === upc && itemTitle === title);
  });
}

function liveDelistRequirementsMet(body: MarketplaceWebhookBody, item: LocalInventoryRecord | undefined) {
  const platform = normalizePlatform(body.platform || body.event?.platform);
  const externalId = text(body.externalListingId || body.listingId || body.event?.externalListingId || body.event?.listingId);
  return Boolean(
    process.env.LIVE_MARKETPLACE_POSTING_ENABLED === "true" &&
      body.oauthTokenVerified === true &&
      item &&
      externalId &&
      externalIdForPlatform(item, platform) === externalId &&
      body.confirmedLinkedExternalId === true &&
      (body.duplicateSaleProtectionLock === true || item.syncMetadata?.duplicateSaleProtection === true)
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as MarketplaceWebhookBody;
  const incomingPlatform = normalizePlatform(body.platform || body.event?.platform);
  const matchedItem = exactLocalMatch(body);
  const channels = matchedItem ? linkedChannels(matchedItem) : [];
  const recommendedDelistAction =
    incomingPlatform === "ebay"
      ? "DELIST_MERCARI"
      : incomingPlatform === "mercari"
        ? "DELIST_EBAY"
        : incomingPlatform === "poshmark"
          ? "DELIST_EBAY_AND_MERCARI"
          : "REVIEW_MANUALLY";

  const eventLog = {
    incomingPlatform,
    matchedLocalListingId: matchedItem?.id || null,
    linkedChannels: channels,
    recommendedDelistAction
  };

  if (!matchedItem) {
    return NextResponse.json({
      ok: true,
      status: "MATCH_NOT_FOUND",
      actionTaken: "NONE",
      syncMode: "SIMULATION_ONLY",
      message: "No external marketplace action performed.",
      eventLog
    });
  }

  const liveExecutionEligible = liveDelistRequirementsMet(body, matchedItem);

  return NextResponse.json({
    ok: true,
    status: "MATCHED",
    actionTaken: "SIMULATED",
    ebayStatus: "SOLD",
    mercariStatus: "DELIST_REQUIRED",
    poshmarkStatus: incomingPlatform === "poshmark" ? "SOLD" : "DELIST_REQUIRED",
    syncMode: "SIMULATION_ONLY",
    message: "No external marketplace action performed.",
    liveMarketplacePostingEnabled: process.env.LIVE_MARKETPLACE_POSTING_ENABLED === "true",
    liveExecutionEligible,
    liveExecutionBlockedReason: liveExecutionEligible
      ? "External posting remains disabled in this simulation endpoint."
      : "Requires verified OAuth token, exact local listing match, confirmed linked external ID, and duplicate-sale protection lock.",
    eventLog
  });
}
