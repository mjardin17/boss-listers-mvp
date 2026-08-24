"use client";

import { useMemo, useState } from "react";
import { parseEbayInventoryCsv } from "../lib/ebayInventoryImport";
import { rankEasyPlatforms } from "../lib/easiestPlatformRouter";
import { validateOrRepairNormalizedListing } from "../lib/normalizedListingSchema";
import {
  importInventoryItemsRepository,
  sanitizeInventoryRecord
} from "./saas/repositories";
import type { InventoryRecord } from "./saas/schemas";

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `ebay-import-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function money(value: number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? `$${parsed.toFixed(2)}` : "N/A";
}

function csvRowToInventory(row: ReturnType<typeof parseEbayInventoryCsv>[number]): InventoryRecord | null {
  const now = new Date().toISOString();
  const id = makeId();
  const listing = validateOrRepairNormalizedListing(
    {
      itemTitle: row.title || row.sku || row.upc || "Imported eBay item",
      thumbnailUrl: "",
      sellThroughRate: "Imported",
      averageSalePrice: row.price || null,
      estimatedResalePrice: row.price || undefined,
      profitPotential: null,
      demandLevel: "Imported",
      sourcingTip: "Imported from eBay inventory for cross-list routing.",
      confidenceScore: row.upc ? 80 : 55,
      upc: row.upc,
      brand: "",
      category: "",
      recommendation: "MARGINAL",
      recommendedMarketplace: {
        platform: "eBay",
        reason: "Imported source listing."
      }
    },
    "ebayInventoryImport"
  );

  return sanitizeInventoryRecord({
    id,
    createdAt: now,
    updatedAt: now,
    status: row.status.toLowerCase().includes("sold") ? "Sold" : "Active",
    sku: row.sku || `EBAY-${id.slice(0, 8)}`,
    upc: row.upc,
    title: row.title || row.sku || "Imported eBay item",
    quantity: row.quantity,
    condition: row.condition,
    cost: 0,
    photos: [],
    listing,
    purchasePrice: 0,
    soldPrice: row.status.toLowerCase().includes("sold") ? row.price : 0,
    ebayStatus: row.status.toLowerCase().includes("active") ? "Active" : "Draft",
    mercariStatus: "Not Created",
    poshmarkStatus: "Not Created",
    facebookStatus: "Not Created",
    soldStatus: row.status.toLowerCase().includes("sold") ? "Sold" : "Available",
    lastSyncTime: null,
    errors: [],
    eventLogs: [`${now} Imported from eBay inventory CSV.`],
    schemaVersion: 1,
    syncStatus: "local"
  });
}

export function EbayInventoryImportPanel({
  items,
  onItemsChange
}: {
  items: InventoryRecord[];
  onItemsChange: (items: InventoryRecord[]) => void;
}) {
  const [status, setStatus] = useState("");
  const [importedPreview, setImportedPreview] = useState<InventoryRecord[]>([]);
  const routes = useMemo(() => rankEasyPlatforms(importedPreview.length ? importedPreview : items).slice(0, 5), [importedPreview, items]);

  async function importText(text: string) {
    const parsed = parseEbayInventoryCsv(text);
    const imported = parsed
      .map(csvRowToInventory)
      .filter((item): item is InventoryRecord => Boolean(item));
    if (!imported.length) {
      setStatus("No eBay inventory rows were found in that file.");
      return;
    }
    const nextItems = await importInventoryItemsRepository(items, imported);
    setImportedPreview(imported);
    onItemsChange(nextItems);
    setStatus(`Imported ${imported.length} eBay inventory item${imported.length === 1 ? "" : "s"}.`);
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setStatus("Reading eBay inventory...");
    await importText(await file.text());
  }

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl shadow-black/20 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">eBay Inventory Import</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            Upload an eBay CSV to teach Boss Listers what inventory you already hold.
          </p>
        </div>
        <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-2xl bg-emerald-400 px-4 text-sm font-bold text-zinc-950">
          Upload CSV
          <input
            type="file"
            accept=".csv,text/csv,.txt,text/plain"
            className="hidden"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
        </label>
      </div>

      {status ? (
        <p className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm font-semibold text-zinc-200">
          {status}
        </p>
      ) : null}

      {routes.length ? (
        <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">Easiest Platform First</p>
            <span className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] font-semibold text-zinc-300">
              Draft routing
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {routes.map(({ item, route }) => (
              <div key={item.id} className="grid gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 sm:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <p className="line-clamp-1 text-xs font-semibold text-white">{item.title}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {item.sku} / {money(item.listing.averageSalePrice)} / Qty {item.quantity}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-400">{route.reason}</p>
                  {route.blockers.length ? (
                    <p className="mt-1 text-[11px] font-semibold text-amber-300">
                      {route.blockers.join(", ")}
                    </p>
                  ) : null}
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-sm font-black text-emerald-300">{route.label}</p>
                  <p className="text-[11px] text-zinc-500">{route.score}/100 ease</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
