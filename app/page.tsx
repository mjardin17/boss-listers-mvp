"use client";

import { useEffect, useMemo, useState } from "react";
import { BossBrainPanel } from "./BossBrainPanel";
import {
  CompsTable,
  DashboardSkeleton,
  DecisionBanner,
  MarketIntelligenceCard,
  ProfitSummaryCard
} from "./DashboardComponents";
import { EbayInventoryImportPanel } from "./EbayInventoryImportPanel";
import {
  ActiveQueue,
  findInventoryItemId,
  InventoryPanel,
  InventoryResultControls,
  loadInventory,
  upsertScannedInventoryItem,
  type InventoryItem
} from "./InventoryWorkflow";
import { ResellerCalculator } from "./ResellerCalculator";
import {
  loadScanHistory,
  saveScanToHistory,
  ScanHistory,
  type StoredScan
} from "./ScanHistory";
import { SourcingSessionPanel } from "./SourcingSession";
import { UploadScanner, type ScanProgress } from "./UploadScanner";
import { CorrectionPortal } from "../components/dashboard/CorrectionPortal";
import { SalesHistoryImportPanel } from "../components/dashboard/SalesHistoryImportPanel";
import {
  loadBossBrainSnapshot,
  recordBossBrainScan,
  type BossBrainSnapshot
} from "../lib/bossBrain";
import type { NormalizedListing } from "./types";

type SourceSelectionId = "WALMART" | "DOLLAR_TREE" | "MANUAL";

const SOURCE_SELECTIONS: Array<{
  id: SourceSelectionId;
  label: string;
  helper: string;
  presetCost?: number;
}> = [
  {
    id: "WALMART",
    label: "Walmart",
    helper: "Shelf price becomes cost basis."
  },
  {
    id: "DOLLAR_TREE",
    label: "Dollar Tree",
    helper: "Preset low-cost sourcing.",
    presetCost: 1.25
  },
  {
    id: "MANUAL",
    label: "Manual",
    helper: "Enter the exact price paid."
  }
];

function sourceLabel(value: SourceSelectionId) {
  return SOURCE_SELECTIONS.find((source) => source.id === value)?.label || "Walmart";
}

function isHotFind(listing: NormalizedListing | null, snapshot: BossBrainSnapshot) {
  if (!listing) return false;
  if (snapshot.previousWinner) return true;
  const roi = Number(listing.roiPercentage);
  const profit = Number(listing.profitPotential ?? listing.estimatedProfit);
  return Number.isFinite(roi) && Number.isFinite(profit) && roi >= 50 && profit >= 10;
}

export default function BossListersPage() {
  const [listing, setListing] = useState<NormalizedListing | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [scanError, setScanError] = useState("");
  const [scanKey, setScanKey] = useState(0);
  const [scanHistory, setScanHistory] = useState<StoredScan[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [currentInventoryId, setCurrentInventoryId] = useState("");
  const [sourceSelectionId, setSourceSelectionId] = useState<SourceSelectionId>("WALMART");
  const [itemName, setItemName] = useState("");
  const [marketplace, setMarketplace] = useState("ebay");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [shippingEstimate, setShippingEstimate] = useState("6.00");
  const [packagingCost, setPackagingCost] = useState("1.25");
  const [manualSoldCompPrice, setManualSoldCompPrice] = useState("");
  const [bossBrainSnapshot, setBossBrainSnapshot] = useState<BossBrainSnapshot>(() =>
    loadBossBrainSnapshot(null)
  );

  useEffect(() => {
    let mounted = true;
    void loadScanHistory().then((scans) => {
      if (!mounted) return;
      setScanHistory(scans);
      setBossBrainSnapshot(loadBossBrainSnapshot(listing));
    });
    void loadInventory().then((items) => {
      if (mounted) setInventoryItems(items);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setBossBrainSnapshot(loadBossBrainSnapshot(listing));
  }, [listing]);

  const selectedSource = SOURCE_SELECTIONS.find((source) => source.id === sourceSelectionId) || SOURCE_SELECTIONS[0];
  const parsedPurchaseCost = Number(purchaseCost.replace(/[$,\s]/g, ""));
  const parsedShippingEstimate = Number(shippingEstimate.replace(/[$,\s]/g, ""));
  const parsedPackagingCost = Number(packagingCost.replace(/[$,\s]/g, ""));
  const parsedManualSoldCompPrice = Number(manualSoldCompPrice.replace(/[$,\s]/g, ""));
  const sourceStoreContext = useMemo(
    () => ({
      sourceStoreType: sourceSelectionId,
      presetCost: selectedSource.presetCost,
      manualOverrideValue: Number.isFinite(parsedPurchaseCost) && parsedPurchaseCost > 0
        ? parsedPurchaseCost
        : null
    }),
    [parsedPurchaseCost, selectedSource.presetCost, sourceSelectionId]
  );
  const listingInputContext = useMemo(
    () => ({
      itemName,
      marketplace,
      purchaseCost: Number.isFinite(parsedPurchaseCost) && parsedPurchaseCost > 0 ? parsedPurchaseCost : null,
      shippingEstimate:
        Number.isFinite(parsedShippingEstimate) && parsedShippingEstimate >= 0 ? parsedShippingEstimate : null,
      packagingCost:
        Number.isFinite(parsedPackagingCost) && parsedPackagingCost >= 0 ? parsedPackagingCost : null,
      manualSoldCompPrice:
        Number.isFinite(parsedManualSoldCompPrice) && parsedManualSoldCompPrice > 0 ? parsedManualSoldCompPrice : null
    }),
    [itemName, marketplace, parsedManualSoldCompPrice, parsedPackagingCost, parsedPurchaseCost, parsedShippingEstimate]
  );

  async function handleListingReady(nextListing: NormalizedListing) {
    setListing(nextListing);
    setIsAnalyzing(false);
    setScanProgress(null);
    setScanError("");

    const nextScans = await saveScanToHistory(nextListing);
    setScanHistory(nextScans);
    setBossBrainSnapshot(recordBossBrainScan(nextListing));

    const inventoryResult = await upsertScannedInventoryItem(inventoryItems, nextListing);
    setInventoryItems(inventoryResult.items);
    setCurrentInventoryId(inventoryResult.itemId);
  }

  function handleOpenScan(scan: StoredScan) {
    setListing(scan.listing);
    setCurrentInventoryId(findInventoryItemId(inventoryItems, scan.listing));
    setBossBrainSnapshot(loadBossBrainSnapshot(scan.listing));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleOpenInventoryListing(nextListing: NormalizedListing) {
    setListing(nextListing);
    setCurrentInventoryId(findInventoryItemId(inventoryItems, nextListing));
    setBossBrainSnapshot(loadBossBrainSnapshot(nextListing));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleCorrectionApplied(nextListing: NormalizedListing) {
    setListing(nextListing);
    const nextScans = await saveScanToHistory(nextListing);
    setScanHistory(nextScans);
    const inventoryResult = await upsertScannedInventoryItem(inventoryItems, nextListing);
    setInventoryItems(inventoryResult.items);
    setCurrentInventoryId(inventoryResult.itemId);
    setBossBrainSnapshot(recordBossBrainScan(nextListing));
  }

  function handleScanAnother() {
    setListing(null);
    setCurrentInventoryId("");
    setScanError("");
    setScanProgress(null);
    setIsAnalyzing(false);
    setScanKey((value) => value + 1);
    setBossBrainSnapshot(loadBossBrainSnapshot(null));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const hotFind = isHotFind(listing, bossBrainSnapshot);

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-5 text-neutral-50 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header className="flex flex-col gap-3 rounded-3xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl shadow-black/20 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-300">
              Reseller sourcing OS
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-normal text-white sm:text-3xl">
              Boss Listers AI
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Scan Walmart finds, remember owned inventory, and route listings to the easiest next marketplace.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-right sm:min-w-48">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">Inventory</p>
              <p className="text-lg font-black text-white">{inventoryItems.length}</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">Scans</p>
              <p className="text-lg font-black text-white">{scanHistory.length}</p>
            </div>
          </div>
        </header>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl shadow-black/20 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Listing inputs</h2>
              <p className="mt-1 text-xs leading-5 text-zinc-400">
                Confirm what you know before analysis. eBay is the default marketplace.
              </p>
            </div>
            <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs font-medium text-zinc-300">
              {sourceLabel(sourceSelectionId)}
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">Item name</span>
              <input
                value={itemName}
                onChange={(event) => setItemName(event.target.value)}
                placeholder="Optional until photo identifies it"
                className="min-h-12 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 text-base font-semibold text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">Marketplace</span>
              <select
                value={marketplace}
                onChange={(event) => setMarketplace(event.target.value)}
                className="min-h-12 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 text-base font-semibold text-white outline-none transition focus:border-emerald-400"
              >
                <option value="ebay">eBay</option>
                <option value="mercari">Mercari</option>
                <option value="poshmark">Poshmark</option>
                <option value="facebook">Facebook Marketplace</option>
              </select>
            </label>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {SOURCE_SELECTIONS.map((source) => (
              <button
                key={source.id}
                type="button"
                onClick={() => setSourceSelectionId(source.id)}
                className={`min-h-16 rounded-2xl border px-4 text-left transition ${
                  sourceSelectionId === source.id
                    ? "border-emerald-400 bg-emerald-400/10 text-emerald-100"
                    : "border-zinc-800 bg-zinc-950 text-zinc-300"
                }`}
              >
                <span className="block text-sm font-bold">{source.label}</span>
                <span className="mt-1 block text-xs text-zinc-500">{source.helper}</span>
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <label className="block space-y-2">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">Cost paid</span>
              <input
                value={purchaseCost}
                onChange={(event) => setPurchaseCost(event.target.value)}
                inputMode="decimal"
                placeholder="24.99"
                className="min-h-12 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 text-base font-semibold text-white outline-none transition focus:border-emerald-400"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">Shipping</span>
              <input
                value={shippingEstimate}
                onChange={(event) => setShippingEstimate(event.target.value)}
                inputMode="decimal"
                placeholder="6.00"
                className="min-h-12 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 text-base font-semibold text-white outline-none transition focus:border-emerald-400"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">Packaging</span>
              <input
                value={packagingCost}
                onChange={(event) => setPackagingCost(event.target.value)}
                inputMode="decimal"
                placeholder="1.25"
                className="min-h-12 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 text-base font-semibold text-white outline-none transition focus:border-emerald-400"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">Manual sold comp</span>
              <input
                value={manualSoldCompPrice}
                onChange={(event) => setManualSoldCompPrice(event.target.value)}
                inputMode="decimal"
                placeholder="Optional"
                className="min-h-12 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 text-base font-semibold text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400"
              />
            </label>
          </div>
        </section>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl shadow-black/20 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Scanner</h2>
              <p className="mt-1 text-xs leading-5 text-zinc-400">
                Use camera capture or gallery upload. Consecutive scans do not require refresh.
              </p>
            </div>
            {scanProgress ? (
              <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs font-medium text-zinc-300">
                {scanProgress.percent}% {scanProgress.stage}
              </span>
            ) : null}
          </div>

          <div className="mt-4">
            <UploadScanner
              key={scanKey}
              sourceStoreContext={sourceStoreContext}
              listingInputContext={listingInputContext}
              onScanStart={() => {
                setIsAnalyzing(true);
                setScanError("");
                setScanProgress({ stage: "Starting", percent: 5 });
              }}
              onScanProgress={setScanProgress}
              onScanError={(message) => {
                setIsAnalyzing(false);
                setScanError(message);
                setScanProgress(null);
              }}
              onListingReady={(nextListing) => void handleListingReady(nextListing)}
            />
          </div>

          {scanError ? (
            <p className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200">
              {scanError}
            </p>
          ) : null}
        </section>

        {isAnalyzing ? (
          <DashboardSkeleton
            stage={scanProgress?.stage}
            progress={scanProgress?.percent}
          />
        ) : null}

        {!listing && !isAnalyzing ? (
          <>
            <EbayInventoryImportPanel items={inventoryItems} onItemsChange={setInventoryItems} />
            <InventoryPanel
              items={inventoryItems}
              onItemsChange={setInventoryItems}
              onOpenListing={handleOpenInventoryListing}
            />
            <ActiveQueue
              items={inventoryItems}
              onItemsChange={setInventoryItems}
              onOpenListing={handleOpenInventoryListing}
            />
            <BossBrainPanel snapshot={bossBrainSnapshot} />
            <SourcingSessionPanel scans={scanHistory} onOpen={handleOpenScan} />
            <SalesHistoryImportPanel />
            <ScanHistory scans={scanHistory} onOpen={handleOpenScan} />
          </>
        ) : null}

        {listing ? (
          <>
            <DecisionBanner listing={listing} hotFind={hotFind} />
            <ProfitSummaryCard listing={listing} />
            <BossBrainPanel snapshot={bossBrainSnapshot} currentMode />
            <CorrectionPortal listing={listing} onCorrectionApplied={(nextListing) => void handleCorrectionApplied(nextListing)} />
            <ResellerCalculator
              listing={listing}
              initialMarketplace={marketplace}
              initialCostPaid={purchaseCost}
              initialShippingEstimate={shippingEstimate}
              initialPackagingCost={packagingCost}
            />
            {currentInventoryId ? (
              <InventoryResultControls
                listing={listing}
                itemId={currentInventoryId}
                items={inventoryItems}
                onItemsChange={setInventoryItems}
              />
            ) : null}
            <EbayInventoryImportPanel items={inventoryItems} onItemsChange={setInventoryItems} />
            <ActiveQueue
              items={inventoryItems}
              onItemsChange={setInventoryItems}
              onOpenListing={handleOpenInventoryListing}
            />
            <button
              type="button"
              onClick={handleScanAnother}
              className="min-h-12 rounded-2xl bg-emerald-400 px-5 text-base font-black text-zinc-950 shadow-lg shadow-emerald-950/40 transition hover:bg-emerald-300"
            >
              Scan Another
            </button>
            <MarketIntelligenceCard listing={listing} />
            <CompsTable listing={listing} />
          </>
        ) : null}
      </div>
    </main>
  );
}
