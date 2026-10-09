"use client";

import type { NormalizedListing } from "../types";
import {
  SCAN_HISTORY_COLLECTION,
  INVENTORY_COLLECTION,
  SCHEMA_VERSION,
  sanitizeInventoryStatus,
  sanitizeNormalizedListing,
  sanitizePlatformListingStatus,
  sanitizeScanSource,
  sanitizeSoldStatus,
  sanitizeSyncStatus,
  type InventoryRecord,
  type InventoryStatus,
  type ScanRecord
} from "./schemas";
import { localStorageAdapter } from "./storageAdapters";
import { getSupabaseBrowserClient } from "./supabaseClient";
import { getOrCreateUserSession } from "./userSession";
import { buildResellerSessionMetrics } from "./sessionMetrics";

const MAX_HISTORY_ITEMS = 30;
const REPOSITORY_TIMEOUT_MS = 5000;

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}`;
}

function makeSku(listing: NormalizedListing, id = "") {
  const source = [listing.brand, listing.upc, listing.itemTitle, id].filter(Boolean).join("-");
  return source
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .toUpperCase() || `BL-${id || Date.now()}`;
}

function clampMoney(value: unknown) {
  return Math.max(0, Number(value) || 0);
}

function listingFingerprint(listing: NormalizedListing) {
  return [
    listing.upc,
    listing.itemTitle,
    listing.averageSalePrice,
    listing.profitPotential,
    listing.recommendation
  ]
    .filter((value) => value != null && String(value).trim())
    .join("|")
    .toLowerCase();
}

function dedupeScans(scans: ScanRecord[]) {
  const seen = new Set<string>();
  return scans.filter((scan) => {
    const fingerprint = listingFingerprint(scan.listing);
    const key = fingerprint || scan.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function sanitizeScanRecord(scan: Partial<ScanRecord>): ScanRecord | null {
  const listing = sanitizeNormalizedListing(scan.listing || {});
  const id = String(scan.id || "");
  const timestamp = String(scan.timestamp || "");
  if (!id || !timestamp || !listing.itemTitle) return null;

  return {
    id,
    timestamp,
    listing,
    userId: String(scan.userId || ""),
    deviceSessionId: String(scan.deviceSessionId || ""),
    source: sanitizeScanSource(scan.source),
    schemaVersion: Number(scan.schemaVersion) || SCHEMA_VERSION,
    syncStatus: sanitizeSyncStatus(scan.syncStatus)
  };
}

export function sanitizeInventoryRecord(
  item: Partial<InventoryRecord>
): InventoryRecord | null {
  if (!item.listing) return null;
  const listing = sanitizeNormalizedListing(item.listing);
  const now = new Date().toISOString();
  const id = String(item.id || makeId());
  const status = sanitizeInventoryStatus(item.status);
  const title = String(item.title || listing.confirmedProductIdentity?.title || listing.itemTitle || "Untitled item");
  const upc = String(item.upc || listing.upc || "");
  const cost = clampMoney(item.cost ?? item.purchasePrice ?? listing.resolvedCostBasis);

  return {
    id,
    createdAt: String(item.createdAt || now),
    updatedAt: String(item.updatedAt || now),
    status,
    sku: String(item.sku || makeSku(listing, id)),
    upc,
    title,
    quantity: Math.max(0, Math.round(Number(item.quantity) || 1)),
    condition: String(item.condition || (listing as any).condition || "New"),
    cost,
    photos: Array.isArray(item.photos) ? item.photos.map(String) : [listing.thumbnailUrl].filter(Boolean),
    listing,
    purchasePrice: clampMoney(item.purchasePrice ?? cost),
    soldPrice: clampMoney(item.soldPrice),
    ebayStatus: sanitizePlatformListingStatus(item.ebayStatus),
    mercariStatus: sanitizePlatformListingStatus(item.mercariStatus),
    poshmarkStatus: sanitizePlatformListingStatus(item.poshmarkStatus),
    facebookStatus: sanitizePlatformListingStatus(item.facebookStatus),
    soldStatus: sanitizeSoldStatus(item.soldStatus || (status === "Sold" ? "Sold" : "Available")),
    lastSyncTime: item.lastSyncTime ? String(item.lastSyncTime) : null,
    errors: Array.isArray(item.errors) ? item.errors.map(String) : [],
    eventLogs: Array.isArray(item.eventLogs) ? item.eventLogs.map(String) : [],
    userId: String(item.userId || ""),
    deviceSessionId: String(item.deviceSessionId || ""),
    schemaVersion: Number(item.schemaVersion) || SCHEMA_VERSION,
    syncStatus: sanitizeSyncStatus(item.syncStatus)
  };
}

function readLocalScans() {
  return localStorageAdapter
    .readCollection<ScanRecord>(SCAN_HISTORY_COLLECTION)
    .map((scan) => sanitizeScanRecord(scan))
    .filter((scan): scan is ScanRecord => Boolean(scan))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, MAX_HISTORY_ITEMS);
}

function writeLocalScans(scans: ScanRecord[]) {
  localStorageAdapter.writeCollection(SCAN_HISTORY_COLLECTION, scans);
}

function readLocalInventory() {
  return localStorageAdapter
    .readCollection<InventoryRecord>(INVENTORY_COLLECTION)
    .map((item) => sanitizeInventoryRecord(item))
    .filter((item): item is InventoryRecord => Boolean(item))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function writeLocalInventory(items: InventoryRecord[]) {
  localStorageAdapter.writeCollection(INVENTORY_COLLECTION, items);
}

function scanFromRow(row: any): ScanRecord | null {
  return sanitizeScanRecord({
    id: row.id,
    timestamp: row.created_at,
    listing: row.listing,
    userId: row.user_id,
    deviceSessionId: row.device_session_id,
    source: row.source,
    schemaVersion: row.schema_version,
    syncStatus: "synced"
  });
}

function inventoryFromRow(row: any): InventoryRecord | null {
  const platformRows = Array.isArray(row.platform_listings) ? row.platform_listings : [];
  const platformStatus = (platform: string) =>
    platformRows.find((item: any) => item.platform === platform)?.status;
  const platformErrors = platformRows.flatMap((item: any) => Array.isArray(item.errors) ? item.errors : []);
  const latestPlatformSync = platformRows
    .map((item: any) => item.last_sync_time)
    .filter(Boolean)
    .sort()
    .at(-1);

  return sanitizeInventoryRecord({
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
        listing: row.listing,
        purchasePrice: row.purchase_price,
        soldPrice: row.sold_price,
        quantity: row.quantity,
        sku: row.sku,
        upc: row.upc,
        title: row.title,
        condition: row.condition,
        cost: row.cost,
        photos: row.photos,
        ebayStatus: row.ebay_status || platformStatus("ebay"),
        mercariStatus: row.mercari_status || platformStatus("mercari"),
        poshmarkStatus: row.poshmark_status || platformStatus("poshmark"),
        facebookStatus: row.facebook_status || platformStatus("facebook"),
        soldStatus: row.sold_status,
        lastSyncTime: row.last_sync_time || latestPlatformSync,
        errors: row.errors || platformErrors,
        eventLogs: row.event_logs,
    userId: row.user_id,
    deviceSessionId: row.device_session_id,
    schemaVersion: row.schema_version,
    syncStatus: "synced"
  });
}

function shouldUseSupabase() {
  // Future Supabase auth/sync should enter through this repository boundary,
  // keeping UI components free of direct storage or cloud client calls.
  return Boolean(getSupabaseBrowserClient());
}

async function withRepositoryTimeout<T>(operation: PromiseLike<T>): Promise<T> {
  return Promise.race([
    operation,
    new Promise<T>((_, reject) =>
      window.setTimeout(() => reject(new Error("Repository request timed out")), REPOSITORY_TIMEOUT_MS)
    )
  ]);
}

export async function loadScanHistoryRepository(): Promise<ScanRecord[]> {
  if (!shouldUseSupabase()) return readLocalScans();
  const session = await getOrCreateUserSession();
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return readLocalScans();

  try {
    const { data, error } = await withRepositoryTimeout(supabase
      .from("scans")
      .select("*")
      .eq("user_id", session.id)
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY_ITEMS));
    if (error) throw error;
    const scans = (data || [])
      .map(scanFromRow)
      .filter((scan): scan is ScanRecord => Boolean(scan));
    writeLocalScans(scans);
    return scans;
  } catch (error) {
    console.info("Boss Listers scan repository fell back to local storage.", error);
    return readLocalScans();
  }
}

export async function saveScanToHistoryRepository(
  listing: NormalizedListing
): Promise<ScanRecord[]> {
  const session = await getOrCreateUserSession();
  const now = new Date().toISOString();
  const nextScan: ScanRecord = {
    id: makeId(),
    timestamp: now,
    listing: sanitizeNormalizedListing(listing),
    userId: session.id,
    deviceSessionId: session.anonymousId,
    source: "upload",
    schemaVersion: SCHEMA_VERSION,
    syncStatus: shouldUseSupabase() ? "pending" : "local"
  };
  const localNext = dedupeScans([nextScan, ...readLocalScans()]).slice(0, MAX_HISTORY_ITEMS);
  writeLocalScans(localNext);

  const supabase = getSupabaseBrowserClient();
  if (!supabase) return localNext;

  try {
    const { error } = await withRepositoryTimeout(supabase.from("scans").upsert(
      {
        id: nextScan.id,
        user_id: session.id,
        device_session_id: session.anonymousId,
        source: nextScan.source,
        listing: nextScan.listing,
        schema_version: nextScan.schemaVersion,
        created_at: nextScan.timestamp
      },
      { onConflict: "id" }
    ));
    if (error) throw error;
    return loadScanHistoryRepository();
  } catch (error) {
    console.info("Boss Listers scan save fell back to local storage.", error);
    return localNext;
  }
}

export async function loadInventoryRepository(): Promise<InventoryRecord[]> {
  if (!shouldUseSupabase()) return readLocalInventory();
  const session = await getOrCreateUserSession();
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  try {
    const { data, error } = await withRepositoryTimeout(supabase
      .from("inventory")
      .select("*, platform_listings(platform,status,last_sync_time,errors)")
      .eq("user_id", session.id)
      .order("updated_at", { ascending: false }));
    if (error) throw error;
    const items = (data || [])
      .map(inventoryFromRow)
      .filter((item): item is InventoryRecord => Boolean(item));
    return items;
  } catch (error) {
    console.info("Boss Listers inventory repository could not read Supabase inventory.", error);
    return readLocalInventory();
  }
}

function buildSourcingSessionSummary(scans: ScanRecord[]) {
  const metrics = buildResellerSessionMetrics(scans);

  return {
    totalScans: metrics.totalScansToday,
    totalEstimatedProfit: Number(metrics.estimatedPotentialProfit.toFixed(2)),
    averageRoi: Number(metrics.averageRoi.toFixed(1)),
    buyCount: metrics.buyCount,
    passCount: metrics.passCount,
    holdCount: metrics.holdCount,
    highConfidenceFlipsCount: metrics.highConfidenceFlipsCount,
    confidenceIndicators: metrics.confidenceIndicators,
    demandIndicators: metrics.demandIndicators,
    bestScanOfDay: metrics.bestScanOfDay?.listing.itemTitle || "",
    highestProfitItem: metrics.highestProfitItem?.listing.itemTitle || "",
    lowestConfidenceItem: metrics.lowestConfidenceItem?.listing.itemTitle || "",
    updatedAt: new Date().toISOString()
  };
}

export async function saveSourcingSessionRepository(scans: ScanRecord[]) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const session = await getOrCreateUserSession();
  const summary = buildSourcingSessionSummary(scans);
  if (!summary.totalScans) return;

  try {
    const { error } = await withRepositoryTimeout(supabase.from("sourcing_sessions").upsert(
      {
        user_id: session.id,
        session_date: new Date().toISOString().slice(0, 10),
        summary,
        updated_at: summary.updatedAt
      },
      { onConflict: "user_id,session_date" }
    ));
    if (error) throw error;
  } catch (error) {
    console.info("Boss Listers sourcing session persistence skipped.", error);
  }
}

async function persistInventoryItem(item: InventoryRecord) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { error } = await withRepositoryTimeout(supabase.from("inventory").upsert(
    {
      id: item.id,
      user_id: item.userId,
      status: inventoryStatusToDb(item.status),
        listing: item.listing,
        purchase_price: item.purchasePrice,
        sold_price: item.soldPrice,
        quantity: item.quantity,
        sku: item.sku,
        upc: item.upc,
        title: item.title,
        condition: item.condition,
        cost: item.cost,
        photos: item.photos,
        last_sync_time: item.lastSyncTime,
        errors: item.errors,
        event_logs: item.eventLogs,
      schema_version: item.schemaVersion,
      created_at: item.createdAt,
      updated_at: item.updatedAt
    },
    { onConflict: "id" }
  ));
  if (error) throw error;
  await persistPlatformListingStatuses(item);
}

function platformStatusRows(item: InventoryRecord) {
  return [
    { platform: "ebay", status: item.ebayStatus },
    { platform: "mercari", status: item.mercariStatus },
    { platform: "poshmark", status: item.poshmarkStatus },
    { platform: "facebook", status: item.facebookStatus }
  ].map((entry) => ({
    user_id: item.userId,
    inventory_id: item.id,
    platform: entry.platform,
    status: platformStatusToDb(entry.status),
    last_sync_time: item.lastSyncTime,
    updated_at: item.updatedAt
  }));
}

function platformStatusToDb(status: string) {
  if (status === "Draft") return "draft";
  if (status === "Pending") return "pending";
  if (status === "Failed") return "failed";
  if (status === "Draft Ready") return "draft_ready";
  if (status === "Active") return "active";
  if (status === "Sold") return "sold";
  if (status === "Delist Required") return "delist_required";
  if (status === "Delisted") return "delisted";
  if (status === "Error") return "error";
  return "draft";
}

async function persistPlatformListingStatuses(item: InventoryRecord) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { error } = await withRepositoryTimeout(
    supabase.from("platform_listings").upsert(platformStatusRows(item), {
      onConflict: "inventory_id,platform"
    })
  );
  if (error) throw error;
}

export async function upsertScannedInventoryItemRepository(
  items: InventoryRecord[],
  listing: NormalizedListing
): Promise<{ items: InventoryRecord[]; itemId: string }> {
  const session = await getOrCreateUserSession();
  const latestItems = await loadInventoryRepository();
  const fingerprint = listingFingerprint(listing);
  const existing = latestItems.find((item) => listingFingerprint(item.listing) === fingerprint);
  const now = new Date().toISOString();

  const nextItem: InventoryRecord = existing
    ? {
        ...existing,
        listing: sanitizeNormalizedListing(listing),
        updatedAt: now,
        syncStatus: shouldUseSupabase() ? "pending" : existing.syncStatus
      }
    : {
        id: makeId(),
        createdAt: now,
        updatedAt: now,
        status: "Draft",
        sku: makeSku(sanitizeNormalizedListing(listing)),
        upc: listing.upc || "",
        title: listing.confirmedProductIdentity?.title || listing.itemTitle || "Untitled item",
        condition: (listing as any).condition || "New",
        cost: clampMoney(listing.resolvedCostBasis),
        photos: [listing.thumbnailUrl].filter(Boolean),
        listing: sanitizeNormalizedListing(listing),
        purchasePrice: clampMoney(listing.resolvedCostBasis),
        soldPrice: 0,
        quantity: 1,
        ebayStatus: "Draft",
        mercariStatus: "Draft",
        poshmarkStatus: "Draft",
        facebookStatus: "Not Created",
        soldStatus: "Available",
        lastSyncTime: null,
        errors: [],
        eventLogs: [],
        userId: session.id,
        deviceSessionId: session.anonymousId,
        schemaVersion: SCHEMA_VERSION,
        syncStatus: shouldUseSupabase() ? "pending" : "local"
      };

  const nextItems = existing
    ? latestItems.map((item) => (item.id === nextItem.id ? nextItem : item))
    : [nextItem, ...latestItems];
  if (!shouldUseSupabase()) {
    writeLocalInventory(nextItems);
    return { items: nextItems, itemId: nextItem.id };
  }
  try {
    await persistInventoryItem(nextItem);
    return { items: await loadInventoryRepository(), itemId: nextItem.id };
  } catch (error) {
    console.info("Boss Listers inventory upsert failed against Supabase.", error);
    return { items: await loadInventoryRepository(), itemId: nextItem.id };
  }
}

function inventoryStatusToDb(status: InventoryStatus) {
  if (status === "Active") return "active";
  if (status === "Sold") return "sold_out";
  if (status === "Delisted") return "delisted";
  if (status === "Archived") return "archived";
  return "draft";
}

export async function updateInventoryItemRepository(
  items: InventoryRecord[],
  itemId: string,
  patch: Partial<
    Pick<
      InventoryRecord,
      | "status"
      | "listing"
      | "sku"
      | "upc"
      | "title"
      | "purchasePrice"
      | "soldPrice"
      | "quantity"
      | "condition"
      | "cost"
      | "photos"
      | "ebayStatus"
      | "mercariStatus"
      | "poshmarkStatus"
      | "facebookStatus"
      | "soldStatus"
      | "lastSyncTime"
      | "errors"
      | "eventLogs"
      | "syncStatus"
    >
  >
): Promise<InventoryRecord[]> {
  const supabase = getSupabaseBrowserClient();
  const nextItems = items.map((item) =>
    item.id === itemId
      ? {
          ...item,
          ...patch,
          status: patch.status ? sanitizeInventoryStatus(patch.status) : item.status,
          listing: patch.listing ? sanitizeNormalizedListing(patch.listing) : item.listing,
          sku: patch.sku == null ? item.sku : String(patch.sku),
          upc: patch.upc == null ? item.upc : String(patch.upc),
          title: patch.title == null ? item.title : String(patch.title),
          purchasePrice:
            patch.purchasePrice == null ? item.purchasePrice : clampMoney(patch.purchasePrice),
          soldPrice: patch.soldPrice == null ? item.soldPrice : clampMoney(patch.soldPrice),
          quantity: patch.quantity == null ? item.quantity : Math.max(0, Math.round(Number(patch.quantity) || 0)),
          condition: patch.condition == null ? item.condition : String(patch.condition),
          cost: patch.cost == null ? item.cost : clampMoney(patch.cost),
          photos: patch.photos == null ? item.photos : patch.photos.map(String),
          ebayStatus: patch.ebayStatus ? sanitizePlatformListingStatus(patch.ebayStatus) : item.ebayStatus,
          mercariStatus: patch.mercariStatus
            ? sanitizePlatformListingStatus(patch.mercariStatus)
            : item.mercariStatus,
          poshmarkStatus: patch.poshmarkStatus
            ? sanitizePlatformListingStatus(patch.poshmarkStatus)
            : item.poshmarkStatus,
          facebookStatus: patch.facebookStatus
            ? sanitizePlatformListingStatus(patch.facebookStatus)
            : item.facebookStatus,
          soldStatus: patch.soldStatus ? sanitizeSoldStatus(patch.soldStatus) : item.soldStatus,
          lastSyncTime: patch.lastSyncTime === undefined ? item.lastSyncTime : patch.lastSyncTime,
          errors: patch.errors == null ? item.errors : patch.errors.map(String),
          eventLogs: patch.eventLogs == null ? item.eventLogs : patch.eventLogs.map(String),
          updatedAt: new Date().toISOString(),
          syncStatus: patch.syncStatus ? sanitizeSyncStatus(patch.syncStatus) : shouldUseSupabase() ? "pending" : item.syncStatus
        }
      : item
  );

  const changedItem = nextItems.find((item) => item.id === itemId);
  if (!changedItem) return nextItems;
  if (!supabase) {
    writeLocalInventory(nextItems);
    return nextItems;
  }
  try {
    const { error } = await withRepositoryTimeout(
      supabase
        .from("inventory")
        .update({
          status: inventoryStatusToDb(changedItem.status),
          listing: changedItem.listing,
          purchase_price: changedItem.purchasePrice,
          sold_price: changedItem.soldPrice,
          quantity: changedItem.quantity,
          sku: changedItem.sku,
          upc: changedItem.upc,
          title: changedItem.title,
          condition: changedItem.condition,
          cost: changedItem.cost,
          photos: changedItem.photos,
          last_sync_time: changedItem.lastSyncTime,
          errors: changedItem.errors,
          event_logs: changedItem.eventLogs,
          updated_at: new Date().toISOString()
        })
        .eq("id", itemId)
    );
    if (error) throw error;
    await persistPlatformListingStatuses(changedItem);
    return loadInventoryRepository();
  } catch (error) {
    console.info("Boss Listers inventory update failed against Supabase.", error);
    return loadInventoryRepository();
  }
}

export async function importInventoryItemsRepository(
  existingItems: InventoryRecord[],
  importedItems: InventoryRecord[]
): Promise<InventoryRecord[]> {
  const keyed = new Map<string, InventoryRecord>();
  [...importedItems, ...existingItems].forEach((item) => {
    const key = item.upc || item.sku || item.id;
    if (!keyed.has(key)) keyed.set(key, item);
  });
  const nextItems = Array.from(keyed.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  writeLocalInventory(nextItems);
  return nextItems;
}

export async function markInventoryItemSoldRepository({
  itemId,
  triggeringPlatform,
  eventPayload = {}
}: {
  itemId: string;
  triggeringPlatform: "ebay" | "mercari" | "poshmark" | "facebook";
  eventPayload?: Record<string, unknown>;
}): Promise<InventoryRecord[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];
  const { data, error } = await withRepositoryTimeout(
    supabase.rpc("atomic_mark_item_sold", {
      p_inventory_id: itemId,
      p_triggering_platform: triggeringPlatform,
      p_event_payload: eventPayload
    })
  );
  if (error) throw error;
  if (data !== true) throw new Error("atomic_mark_item_sold did not find a matching inventory row.");
  return loadInventoryRepository();
}

export function findInventoryItemIdRepository(
  items: InventoryRecord[],
  listing: NormalizedListing
) {
  const fingerprint = listingFingerprint(listing);
  return items.find((item) => listingFingerprint(item.listing) === fingerprint)?.id || "";
}
