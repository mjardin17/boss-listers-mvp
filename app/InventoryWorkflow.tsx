"use client";

import type { NormalizedListing } from "./types";
import { buildAnalyticsSnapshot } from "./saas/analyticsStore";
import {
  findInventoryItemIdRepository,
  loadInventoryRepository,
  markInventoryItemSoldRepository,
  updateInventoryItemRepository,
  upsertScannedInventoryItemRepository
} from "./saas/repositories";
import {
  type InventoryRecord,
  type InventoryStatus
} from "./saas/schemas";
import { buildCrossListDrafts } from "../lib/crossListEngine/adaptListing";
import { mapToEbayDraft, validateEbayDraftPayload } from "../lib/platformAdapters/ebayAdapter";
import { mapToMercariDraft, validateMercariDraftPayload } from "../lib/platformAdapters/mercariAdapter";
import { mapToPoshmarkDraft, validatePoshmarkDraftPayload } from "../lib/platformAdapters/poshmarkAdapter";

export type { InventoryStatus };
export type InventoryItem = InventoryRecord;

const STATUSES: InventoryStatus[] = ["Draft", "Active", "Sold", "Delisted", "Archived"];
type QueuePlatform = "ebay" | "mercari" | "poshmark";

export function loadInventory(): Promise<InventoryItem[]> {
  return loadInventoryRepository();
}

export function upsertScannedInventoryItem(
  items: InventoryItem[],
  listing: NormalizedListing
): Promise<{ items: InventoryItem[]; itemId: string }> {
  return upsertScannedInventoryItemRepository(items, listing);
}

export function findInventoryItemId(items: InventoryItem[], listing: NormalizedListing) {
  return findInventoryItemIdRepository(items, listing);
}

export function updateInventoryItem(
  items: InventoryItem[],
  itemId: string,
  patch: Partial<
    Pick<
      InventoryItem,
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
): Promise<InventoryItem[]> {
  return updateInventoryItemRepository(items, itemId, patch);
}

export function markInventoryItemSold({
  itemId,
  triggeringPlatform
}: {
  itemId: string;
  triggeringPlatform: "ebay" | "mercari" | "poshmark" | "facebook";
}): Promise<InventoryItem[]> {
  return markInventoryItemSoldRepository({
    itemId,
    triggeringPlatform,
    eventPayload: {
      source: "active_queue_mark_sold",
      createdAt: new Date().toISOString()
    }
  });
}

function getInventorySummary(items: InventoryItem[]) {
  const analytics = buildAnalyticsSnapshot({ scans: [], inventory: items });
  const activeItems = items.filter((item) => item.status !== "Sold");
  const soldItems = items.filter((item) => item.status === "Sold");

  return {
    totalItems: items.length,
    activeCount: activeItems.length,
    soldCount: soldItems.length,
    estimatedInventoryValue: analytics.estimatedInventoryValue,
    runningProfitTotal: analytics.runningInventoryProfit,
    soldProfit: analytics.soldProfit,
    soldRoi: analytics.soldRoi
  };
}

function money(value: number | null | undefined = undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "Unavailable";
  return `$${Math.max(0, Number(value)).toFixed(2)}`;
}

function signedMoney(value: number | null | undefined = undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "Unavailable";
  const prefix = value < 0 ? "-" : "";
  return `${prefix}$${Math.abs(Number(value)).toFixed(2)}`;
}

function hasUserVerifiedSale(listing: NormalizedListing) {
  return (
    (listing as any).pricingSource === "USER_VERIFIED_SALE" ||
    (listing as any).pricingStatus === "user_verified_sale" ||
    (listing as any).matchedPersonalSale?.sale?.status === "USER_VERIFIED_SALE"
  );
}

function verifiedSoldPrice(listing: NormalizedListing) {
  if (!hasUserVerifiedSale(listing)) return null;
  const matchedSalePrice = Number((listing as any).matchedPersonalSale?.sale?.soldPrice);
  if (Number.isFinite(matchedSalePrice) && matchedSalePrice > 0) return matchedSalePrice;
  const averageSalePrice = Number(listing.averageSalePrice ?? listing.estimatedResalePrice);
  return Number.isFinite(averageSalePrice) && averageSalePrice > 0 ? averageSalePrice : null;
}

function costPaid(item: InventoryItem) {
  const paid = Number(item.purchasePrice);
  if (Number.isFinite(paid) && paid > 0) return paid;
  const resolved = Number(item.listing.resolvedCostBasis);
  return Number.isFinite(resolved) && resolved > 0 ? resolved : null;
}

function estimatedNetProfit(item: InventoryItem) {
  const soldPrice = verifiedSoldPrice(item.listing);
  const cost = costPaid(item);
  if (soldPrice == null || cost == null) return null;
  const marketplaceFees = soldPrice * 0.1325 + 0.3;
  const shipping = Number((item.listing as any).shippingEstimate ?? (item.listing as any).shippingCost ?? 0);
  const safeShipping = Number.isFinite(shipping) && shipping > 0 ? shipping : 0;
  return Number((soldPrice - marketplaceFees - safeShipping - cost).toFixed(2));
}

function queueTitle(listing: NormalizedListing) {
  return listing.confirmedProductIdentity?.title || listing.itemTitle || "Untitled item";
}

function pricingUnavailable(item: InventoryItem) {
  return verifiedSoldPrice(item.listing) == null;
}

function buildPlatformDraft(item: InventoryItem, platform: QueuePlatform) {
  return buildCrossListDrafts({
    title: item.title || queueTitle(item.listing),
    brand: item.listing.brand || "",
    category: item.listing.confirmedProductIdentity?.category || (item.listing as any).category || "",
    condition: item.condition || "New",
    upc: item.upc || item.listing.upc || "",
    keyDetails: [
      item.sku ? `SKU: ${item.sku}` : "",
      item.listing.brand ? `Brand: ${item.listing.brand}` : "",
      item.upc ? `UPC: ${item.upc}` : "",
      (item.listing as any).sourceStoreType ? `Source: ${(item.listing as any).sourceStoreType}` : ""
    ].filter(Boolean),
    description: item.listing.recommendationExplanation || item.title || item.listing.itemTitle || "",
    recommendation: item.listing.recommendation
  }).find((draft) => draft.platform === platform);
}

function listingCondition(listing: NormalizedListing) {
  return (listing as any).condition || (listing as any).userVerifiedCorrection?.condition || "New";
}

function buildAdapterOutputPreview(item: InventoryItem) {
  const price = verifiedSoldPrice(item.listing);
  const ebayDraft = buildPlatformDraft(item, "ebay");
  const mercariDraft = buildPlatformDraft(item, "mercari");
  const poshmarkDraft = buildPlatformDraft(item, "poshmark");
  const condition = listingCondition(item.listing);
  const ebayPayload =
    ebayDraft && price != null
      ? mapToEbayDraft({ draft: ebayDraft, price, upc: item.listing.upc, condition })
      : null;
  const mercariPayload =
    mercariDraft && price != null
      ? mapToMercariDraft({ draft: mercariDraft, price, upc: item.listing.upc, condition })
      : null;
  const poshmarkPayload =
    poshmarkDraft && price != null
      ? mapToPoshmarkDraft({ draft: poshmarkDraft, price, sku: item.sku, upc: item.upc, condition })
      : null;
  const ebayValidation = ebayPayload ? validateEbayDraftPayload(ebayPayload) : { valid: false, errors: ["Pricing unavailable."] };
  const mercariValidation = mercariPayload
    ? validateMercariDraftPayload(mercariPayload)
    : { valid: false, errors: ["Pricing unavailable."] };
  const poshmarkValidation = poshmarkPayload
    ? validatePoshmarkDraftPayload(poshmarkPayload)
    : { valid: false, errors: ["Pricing unavailable."] };

  return {
    ebayTitle: ebayPayload?.title || "Unavailable",
    mercariTitle: mercariPayload?.name || "Unavailable",
    poshmarkTitle: poshmarkPayload?.title || "Unavailable",
    price,
    upc: item.listing.upc || "Unavailable",
    condition,
    validationStatus: ebayValidation.valid && mercariValidation.valid && poshmarkValidation.valid ? "Valid" : "Needs listing fields",
    ebayValidation,
    mercariValidation,
    poshmarkValidation
  };
}

export function InventoryResultControls({
  listing,
  itemId,
  items,
  onItemsChange
}: {
  listing: NormalizedListing;
  itemId: string;
  items: InventoryItem[];
  onItemsChange: (items: InventoryItem[]) => void;
}) {
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item) return null;
  const currentItem = item;
  const isPurchased = item.status === "Active" || item.status === "Sold";

  function update(patch: Partial<Pick<InventoryItem, "status" | "purchasePrice" | "soldPrice">>) {
    void updateInventoryItem(items, currentItem.id, patch).then(onItemsChange);
  }

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl shadow-black/20 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Inventory workflow</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            Track this scan from shelf find to sold item.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            update({
              status: isPurchased ? "Draft" : "Active",
              purchasePrice: isPurchased
                ? item.purchasePrice
                : item.purchasePrice || listing.sourcingAnalytics?.bestBuyPrice || 0
            })
          }
          className={`min-h-11 rounded-2xl px-4 text-sm font-bold transition ${
            isPurchased
              ? "bg-emerald-400 text-zinc-950"
              : "border border-zinc-700 bg-zinc-950 text-zinc-200"
          }`}
        >
          {isPurchased ? "Active" : "Mark Active"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="space-y-2">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">Status</span>
          <select
            value={item.status}
            onChange={(event) => update({ status: event.target.value as InventoryStatus })}
            className="min-h-11 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-3 text-sm font-semibold text-white"
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">Paid</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={item.purchasePrice || ""}
            onChange={(event) => update({ purchasePrice: Number(event.target.value) || 0 })}
            className="min-h-11 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-3 text-sm font-semibold text-white"
            placeholder="0.00"
          />
        </label>
        <label className="space-y-2">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">Sold</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={item.soldPrice || ""}
            onChange={(event) => update({ soldPrice: Number(event.target.value) || 0 })}
            className="min-h-11 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-3 text-sm font-semibold text-white"
            placeholder="0.00"
          />
        </label>
      </div>
    </section>
  );
}

export function InventoryPanel({
  items,
  onItemsChange,
  onOpenListing
}: {
  items: InventoryItem[];
  onItemsChange: (items: InventoryItem[]) => void;
  onOpenListing: (listing: NormalizedListing) => void;
}) {
  const summary = getInventorySummary(items);
  const topItems = [...items]
    .sort(
      (a, b) =>
        Number(b.listing.profitPotential) - Number(a.listing.profitPotential) ||
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
    .slice(0, 5);

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl shadow-black/20 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Inventory</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            Persistent inventory for scanned and purchased items.
          </p>
        </div>
        <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs font-medium text-zinc-300">
          {summary.totalItems}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Value</p>
          <p className="mt-2 text-lg font-semibold text-white">
            {money(summary.estimatedInventoryValue)}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Open Profit</p>
          <p className="mt-2 text-lg font-semibold text-emerald-300">
            {money(summary.runningProfitTotal)}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Sold ROI</p>
          <p className="mt-2 text-lg font-semibold text-sky-300">
            {Math.round(summary.soldRoi)}%
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Sold Profit</p>
          <p className="mt-2 text-lg font-semibold text-amber-300">
            {money(summary.soldProfit)}
          </p>
        </div>
      </div>

      {topItems.length ? (
        <div className="mt-4 divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-800">
          {topItems.map((item) => (
            <div key={item.id} className="bg-zinc-950 p-3">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onOpenListing(item.listing)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="line-clamp-2 text-sm font-semibold text-white">
                    {item.listing.itemTitle}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {item.status} / Est. {money(item.listing.averageSalePrice)}
                  </p>
                </button>
                <select
                  value={item.status}
                  onChange={(event) =>
                    void updateInventoryItem(items, item.id, {
                      status: event.target.value as InventoryStatus
                    }).then(onItemsChange)
                  }
                  className="min-h-10 shrink-0 rounded-xl border border-zinc-700 bg-zinc-900 px-2 text-xs font-semibold text-white"
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-400">
          Scanned items will appear here automatically.
        </p>
      )}
    </section>
  );
}

export function ActiveQueue({
  items,
  onItemsChange,
  onOpenListing
}: {
  items: InventoryItem[];
  onItemsChange: (items: InventoryItem[]) => void;
  onOpenListing: (listing: NormalizedListing) => void;
}) {
  const activeItems = items.filter((item) => item.status !== "Archived");

  function updateItem(item: InventoryItem, patch: Parameters<typeof updateInventoryItem>[2]) {
    void updateInventoryItem(items, item.id, patch).then(onItemsChange);
  }

  function editPricing(item: InventoryItem) {
    const currentPrice = verifiedSoldPrice(item.listing);
    const nextPrice = window.prompt("Verified sold price", currentPrice == null ? "" : String(currentPrice));
    if (nextPrice == null) return;
    const parsedPrice = Number(nextPrice.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) return;

    const currentCost = costPaid(item);
    const nextCost = window.prompt("Cost paid", currentCost == null ? "" : String(currentCost));
    if (nextCost == null) return;
    const parsedCost = Number(nextCost.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(parsedCost) || parsedCost < 0) return;

    updateItem(item, {
      purchasePrice: parsedCost,
      syncStatus: "pending",
      listing: {
        ...item.listing,
        averageSalePrice: Number(parsedPrice.toFixed(2)),
        estimatedResalePrice: Number(parsedPrice.toFixed(2)),
        pricingSource: "USER_VERIFIED_SALE",
        pricingStatus: "user_verified_sale",
        pricingUnavailable: false,
        matchedPersonalSale: {
          ...(item.listing as any).matchedPersonalSale,
          sale: {
            ...(item.listing as any).matchedPersonalSale?.sale,
            status: "USER_VERIFIED_SALE",
            soldPrice: Number(parsedPrice.toFixed(2)),
            soldDate: new Date().toISOString().slice(0, 10),
            platform: (item.listing as any).matchedPersonalSale?.sale?.platform || "Manual"
          },
          matchReason: "Manual active queue pricing correction.",
          matchScore: 100
        }
      } as NormalizedListing
    });
  }

  function createDraft(item: InventoryItem, platform: QueuePlatform) {
    if (pricingUnavailable(item)) return;
    const draft = buildPlatformDraft(item, platform);
    if (!draft) return;
    const price = verifiedSoldPrice(item.listing);
    const condition = listingCondition(item.listing);
    const validation =
      platform === "ebay" && price != null
        ? validateEbayDraftPayload(mapToEbayDraft({ draft, price, upc: item.upc, condition }))
        : platform === "mercari" && price != null
          ? validateMercariDraftPayload(mapToMercariDraft({ draft, price, upc: item.upc, condition }))
          : platform === "poshmark" && price != null
            ? validatePoshmarkDraftPayload(mapToPoshmarkDraft({ draft, price, sku: item.sku, upc: item.upc, condition }))
            : { valid: false };
    if (!validation.valid) return;
    const drafts = [
      ...((item.listing as any).crossListDrafts || []).filter((candidate: any) => candidate.platform !== platform),
      draft
    ];
    updateItem(item, {
      status: "Active",
      syncStatus: "pending",
      lastSyncTime: new Date().toISOString(),
      eventLogs: [`${new Date().toISOString()} ${platform} draft generated locally.`, ...item.eventLogs].slice(0, 25),
      [platform === "ebay" ? "ebayStatus" : platform === "mercari" ? "mercariStatus" : "poshmarkStatus"]: "Draft Ready",
      listing: {
        ...item.listing,
        crossListDrafts: drafts
      } as NormalizedListing
    });
  }

  function markSold(item: InventoryItem) {
    const selected = window.prompt("Sold on platform", "ebay");
    const platform = selected === "mercari" || selected === "poshmark" || selected === "facebook" ? selected : "ebay";
    void markInventoryItemSold({ itemId: item.id, triggeringPlatform: platform }).then(onItemsChange).catch((error) => {
      console.error("[BossListers] atomic_mark_item_sold failed", error);
    });
  }

  function delistOtherPlatform(item: InventoryItem) {
    const now = new Date().toISOString();
    updateItem(item, {
      ebayStatus: item.ebayStatus === "Delist Required" ? "Delisted" : item.ebayStatus,
      mercariStatus: item.mercariStatus === "Delist Required" ? "Delisted" : item.mercariStatus,
      poshmarkStatus: item.poshmarkStatus === "Delist Required" ? "Delisted" : item.poshmarkStatus,
      facebookStatus: item.facebookStatus === "Delist Required" ? "Delisted" : item.facebookStatus,
      status:
        [item.ebayStatus, item.mercariStatus, item.poshmarkStatus, item.facebookStatus].some(
          (status) => status === "Delist Required"
        )
          ? "Delisted"
          : item.status,
      lastSyncTime: now,
      eventLogs: [`${now} Local delist state acknowledged.`, ...item.eventLogs].slice(0, 25),
      syncStatus: "pending"
    });
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl shadow-black/20 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">
            Active Queue
          </p>
          <h2 className="mt-1 text-xl font-black text-white">Cross-listing mission control</h2>
        </div>
        <span className="w-fit rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs font-bold text-zinc-300">
          {activeItems.length} active
        </span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800">
        <table className="min-w-[1180px] w-full border-collapse text-left text-xs">
          <thead className="bg-zinc-950 text-[10px] uppercase tracking-widest text-zinc-500">
            <tr>
              <th className="px-3 py-3">Item Title</th>
              <th className="px-3 py-3">SKU</th>
              <th className="px-3 py-3">Quantity</th>
              <th className="px-3 py-3">eBay</th>
              <th className="px-3 py-3">Mercari</th>
              <th className="px-3 py-3">Poshmark</th>
              <th className="px-3 py-3">Facebook</th>
              <th className="px-3 py-3">Last Sync Time</th>
              <th className="px-3 py-3">Errors</th>
              <th className="px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-900">
            {activeItems.map((item) => {
              const unavailable = pricingUnavailable(item);
              const preview = buildAdapterOutputPreview(item);
              return (
                <tr key={item.id} className="align-top">
                  <td className="max-w-[260px] px-3 py-3">
                    <button
                      type="button"
                      onClick={() => onOpenListing(item.listing)}
                      className="line-clamp-2 text-left font-semibold text-white hover:text-emerald-200"
                    >
                      {item.title || queueTitle(item.listing)}
                    </button>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {item.status} / UPC {item.upc || "Unavailable"} / {item.condition || "New"}
                    </p>
                    <div className="mt-2 space-y-1 rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-[11px] text-zinc-400">
                      <p>eBay title: <span className="text-zinc-200">{preview.ebayTitle}</span></p>
                      <p>Mercari title: <span className="text-zinc-200">{preview.mercariTitle}</span></p>
                      <p>Poshmark title: <span className="text-zinc-200">{preview.poshmarkTitle}</span></p>
                      <p>Validation status: <span className="text-zinc-200">{preview.validationStatus}</span></p>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-zinc-300">{item.sku}</td>
                  <td className="px-3 py-3">
                    <input
                      value={item.quantity}
                      onChange={(event) => updateItem(item, { quantity: Number(event.target.value) || 0, syncStatus: "pending" })}
                      inputMode="numeric"
                      className="h-9 w-16 rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-white"
                    />
                  </td>
                  <td className="px-3 py-3 text-zinc-300">{item.ebayStatus}</td>
                  <td className="px-3 py-3 text-zinc-300">{item.mercariStatus}</td>
                  <td className="px-3 py-3 text-zinc-300">{item.poshmarkStatus}</td>
                  <td className="px-3 py-3 text-zinc-300">{item.facebookStatus}</td>
                  <td className="px-3 py-3 text-zinc-300">
                    {item.lastSyncTime ? new Date(item.lastSyncTime).toLocaleString() : "Never"}
                  </td>
                  <td className="px-3 py-3 text-zinc-300">{item.errors[0] || "None"}</td>
                  <td className="px-3 py-3">
                    <div className="flex min-w-[320px] flex-wrap gap-2">
                      <QueueButton onClick={() => onOpenListing(item.listing)}>Edit</QueueButton>
                      <QueueButton disabled={unavailable} onClick={() => createDraft(item, "ebay")}>
                        Create eBay Draft
                      </QueueButton>
                      <QueueButton disabled={unavailable} onClick={() => createDraft(item, "mercari")}>
                        Create Mercari Draft
                      </QueueButton>
                      <QueueButton disabled={unavailable} onClick={() => createDraft(item, "poshmark")}>
                        Create Poshmark Draft
                      </QueueButton>
                      <QueueButton onClick={() => delistOtherPlatform(item)}>Delist</QueueButton>
                      <QueueButton onClick={() => updateItem(item, { status: "Active", syncStatus: "pending", lastSyncTime: new Date().toISOString() })}>
                        Relist
                      </QueueButton>
                      <QueueButton onClick={() => markSold(item)}>Mark Sold</QueueButton>
                      <QueueButton onClick={() => updateItem(item, { status: "Archived", soldStatus: "Archived", syncStatus: "pending", lastSyncTime: new Date().toISOString() })}>
                        Archive
                      </QueueButton>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!activeItems.length ? (
          <p className="bg-zinc-950 px-4 py-5 text-sm text-zinc-400">
            Scanned inventory will appear here automatically.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function QueueButton({
  children,
  disabled = false,
  onClick
}: {
  children: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-h-9 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-[11px] font-bold text-zinc-200 transition hover:border-emerald-300 hover:text-white disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-600"
    >
      {children}
    </button>
  );
}
