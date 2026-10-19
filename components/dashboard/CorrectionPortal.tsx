"use client";

import { useMemo, useState } from "react";
import type { NormalizedListing } from "../../app/types";
import { saveSalesMemory } from "../../lib/salesHistory/salesMemoryStore";
import { normalizeSalesTitleTokens } from "../../lib/salesHistory/salesNormalizer";
import type { UserVerifiedSale } from "../../lib/salesHistory/salesHistoryTypes";
import type { UserCorrectionAction, UserVerifiedCorrection } from "../../lib/userCorrections/correctionTypes";
import { buildScanMatchingKeys } from "../../lib/userCorrections/correctionMerge";
import { saveUserCorrection } from "../../lib/userCorrections/correctionStore";

type CorrectionPortalProps = {
  listing: NormalizedListing;
  onCorrectionApplied?: (listing: NormalizedListing) => void;
};

const STORE_OPTIONS = ["Walmart", "Target", "Dollar Tree", "TJ Maxx", "Marshalls", "Ross", "Manual"];
const CONDITION_OPTIONS = ["New", "Like New", "Used", "Open Box", "For Parts"];
const PLATFORM_OPTIONS = ["eBay", "Mercari", "Facebook Marketplace", "Amazon", "Walmart", "Other"];
const CONFIDENCE_OPTIONS = ["HIGH", "MEDIUM", "LOW"];
const DEMAND_OPTIONS = ["HIGH", "MEDIUM", "LOW", "UNKNOWN"];

function moneyOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : null;
}

function money(value: number | null) {
  return value == null ? "Unavailable" : `$${value.toFixed(2)}`;
}

function buildId(listing: NormalizedListing) {
  return `corr_${Date.now()}_${String(listing.upc || listing.itemTitle || "scan")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 18)}`;
}

export function CorrectionPortal({ listing, onCorrectionApplied }: CorrectionPortalProps) {
  const [productTitle, setProductTitle] = useState(listing.confirmedProductIdentity?.title || listing.itemTitle || "");
  const [upc, setUpc] = useState(listing.upc || "");
  const [brand, setBrand] = useState(listing.brand || "");
  const [sourceStore, setSourceStore] = useState(listing.sourceStoreType || "Walmart");
  const [costPaid, setCostPaid] = useState(
    listing.resolvedCostBasis == null ? "" : Number(listing.resolvedCostBasis).toFixed(2)
  );
  const [soldCompPrice, setSoldCompPrice] = useState(
    listing.averageSalePrice == null ? "" : Number(listing.averageSalePrice).toFixed(2)
  );
  const [shippingEstimate, setShippingEstimate] = useState("5.75");
  const [condition, setCondition] = useState("New");
  const [platformUsedForComp, setPlatformUsedForComp] = useState("eBay");
  const [evidenceSoldDate, setEvidenceSoldDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [evidenceQuantitySold, setEvidenceQuantitySold] = useState("1");
  const [evidenceSourceUrl, setEvidenceSourceUrl] = useState("");
  const [confidenceCorrection, setConfidenceCorrection] = useState("MEDIUM");
  const [demandCorrection, setDemandCorrection] = useState("UNKNOWN");
  const [notes, setNotes] = useState("");
  const [flags, setFlags] = useState<string[]>([]);
  const [savedAt, setSavedAt] = useState("");

  const math = useMemo(() => {
    const resale = moneyOrNull(soldCompPrice);
    const cost = moneyOrNull(costPaid);
    const shipping = moneyOrNull(shippingEstimate) ?? 5.75;
    if (resale == null || cost == null) return null;
    const fees = resale * 0.13;
    const netProfit = Number((resale - fees - shipping - cost).toFixed(2));
    const roi = cost > 0 ? Number(((netProfit / cost) * 100).toFixed(1)) : null;
    return { resale, cost, shipping, netProfit, roi };
  }, [soldCompPrice, costPaid, shippingEstimate]);
  const scanKeys = useMemo(
    () =>
      buildScanMatchingKeys({
        upc,
        title: productTitle || listing.itemTitle,
        brand,
        category: listing.confirmedProductIdentity?.category || (listing as any).category || "",
        ocrText: (listing as any).ocrText || (listing as any).calibrationLog?.rawOcrText || [],
        visualAnchors: (listing as any).visualAnchors || [],
        packagingHints: (listing as any).packagingHints || []
      }),
    [brand, listing, productTitle, upc]
  );
  const pricingUnavailable =
    (listing as any).pricingStatus === "unavailable" ||
    (listing as any).pricingSource === "none" ||
    listing.averageSalePrice == null ||
    listing.profitPotential == null ||
    String(listing.recommendation || "").toUpperCase() === "INVESTIGATE";
  const userVerifiedConfidence =
    confidenceCorrection === "HIGH" ? 85 : confidenceCorrection === "LOW" ? 55 : 70;

  function applyFlag(action: UserCorrectionAction, flag: string) {
    setFlags((current) => Array.from(new Set([...current, flag])));
    saveCorrection(action, flag);
  }

  function saveCorrection(action: UserCorrectionAction = "save_correction", flag?: string) {
    const now = new Date().toISOString();
    const nextFlags = flag ? Array.from(new Set([...flags, flag])) : flags;
    const correction: UserVerifiedCorrection = {
      id: buildId(listing),
      status: "USER_VERIFIED",
      action,
      createdAt: now,
      updatedAt: now,
      productTitle: productTitle.trim() || listing.itemTitle,
      upc: upc.replace(/\D/g, ""),
      brand: brand.trim(),
      sourceStore,
      costPaid: moneyOrNull(costPaid),
      soldCompPrice: moneyOrNull(soldCompPrice),
      shippingEstimate: moneyOrNull(shippingEstimate),
      quantitySold: Number.isFinite(Number(evidenceQuantitySold)) ? Math.max(1, Math.round(Number(evidenceQuantitySold))) : null,
      sourceUrl: evidenceSourceUrl.trim(),
      scanFingerprint: scanKeys.scanFingerprint,
      matchingKeys: scanKeys.matchingKeys,
      condition,
      platformUsedForComp,
      confidenceCorrection,
      demandCorrection,
      notes: notes.trim(),
      correctionFlags: nextFlags,
      pricingSource: "USER_VERIFIED",
      rawAiSnapshot: {
        title: listing.itemTitle,
        upc: listing.upc,
        brand: listing.brand,
        sourceStore: listing.sourceStoreType,
        costPaid: listing.resolvedCostBasis ?? null,
        resalePrice: listing.averageSalePrice,
        profit: listing.profitPotential,
        condition: listing.confirmedProductIdentity?.category
      }
    };
    saveUserCorrection(correction);
    const userSale = buildUserVerifiedSale(now);
    if (userSale) saveSalesMemory([userSale]);
    console.info("[BossListers] correction save lifecycle", {
      correctionSaved: true,
      storageKey: "boss-listers.productCorrections.v1",
      salesStorageUpdated: Boolean(userSale),
      scanFingerprint: scanKeys.scanFingerprint,
      matchingKeys: scanKeys.matchingKeys,
      finalPricingSource: userSale ? "USER_VERIFIED_SALE" : "USER_VERIFIED"
    });
    setSavedAt(now);
    onCorrectionApplied?.({
      ...listing,
      itemTitle: correction.productTitle,
      upc: correction.upc,
      brand: correction.brand,
      sourceStoreType: correction.sourceStore,
      resolvedCostBasis: correction.costPaid ?? listing.resolvedCostBasis,
      averageSalePrice: correction.soldCompPrice,
      profitPotential: math?.netProfit ?? null,
      estimatedResalePrice: correction.soldCompPrice ?? undefined,
      estimatedProfit: math?.netProfit ?? undefined,
      roiPercentage: math?.roi ?? undefined,
      confidenceScore: Math.max(Number(listing.confidenceScore) || 0, userSale ? userVerifiedConfidence : Number(listing.confidenceScore) || 0),
      pricingSource: userSale ? "USER_VERIFIED_SALE" : "USER_VERIFIED",
      userVerifiedCorrection: correction,
      matchedPersonalSale: userSale
        ? {
            sale: userSale,
            confidenceBoost: userVerifiedConfidence,
            matchReason: "Manual correction saved as user-verified market evidence.",
            matchScore: 100
          }
        : (listing as any).matchedPersonalSale,
      recommendationExplanation: userSale
        ? "USER_VERIFIED_SALE correction applied. Raw AI result preserved separately."
        : "USER_VERIFIED correction applied. Raw AI result preserved separately.",
      sourceBadges: Array.from(new Set([...(listing.sourceBadges || []), userSale ? "USER_VERIFIED_SALE" : "USER_VERIFIED"]))
    } as NormalizedListing);
  }

  function buildUserVerifiedSale(now = new Date().toISOString()) {
    const resale = moneyOrNull(soldCompPrice);
    if (resale == null || !evidenceSoldDate) return null;
    const sale: UserVerifiedSale = {
      id: `sale_manual_${upc.replace(/\D/g, "") || productTitle.replace(/[^a-z0-9]/gi, "").slice(0, 18)}_${evidenceSoldDate}_${Date.now()}`,
      status: "USER_VERIFIED_SALE",
      itemTitle: productTitle.trim() || listing.itemTitle,
      soldPrice: resale,
      soldDate: evidenceSoldDate,
      platform: platformUsedForComp || "Unknown",
      shippingCharged: moneyOrNull(shippingEstimate),
      cost: moneyOrNull(costPaid),
      quantitySold: Number.isFinite(Number(evidenceQuantitySold)) ? Math.max(1, Math.round(Number(evidenceQuantitySold))) : null,
      sku: "",
      upc: upc.replace(/\D/g, ""),
      category: listing.confirmedProductIdentity?.category || "",
      condition,
      notes: notes.trim(),
      sourceUrl: evidenceSourceUrl.trim(),
      normalizedTitleTokens: normalizeSalesTitleTokens(productTitle.trim() || listing.itemTitle),
      scanFingerprint: scanKeys.scanFingerprint,
      matchingKeys: scanKeys.matchingKeys,
      importedAt: now
    };
    return sale;
  }

  function saveManualMarketEvidence() {
    const sale = buildUserVerifiedSale();
    if (!sale) {
      setSavedAt("manual-evidence-missing");
      return;
    }
    saveSalesMemory([sale]);
    console.info("[BossListers] manual market evidence saved", {
      storageKey: "boss-listers.salesHistory.v1",
      scanFingerprint: scanKeys.scanFingerprint,
      matchingKeys: scanKeys.matchingKeys,
      finalPricingSource: "USER_VERIFIED_SALE"
    });
    setSavedAt(new Date().toISOString());
    onCorrectionApplied?.({
      ...listing,
      averageSalePrice: sale.soldPrice,
      profitPotential: math?.netProfit ?? null,
      estimatedResalePrice: sale.soldPrice,
      estimatedProfit: math?.netProfit ?? undefined,
      roiPercentage: math?.roi ?? undefined,
      confidenceScore: Math.max(Number(listing.confidenceScore) || 0, userVerifiedConfidence),
      pricingSource: "USER_VERIFIED_SALE",
      matchedPersonalSale: {
        sale,
        confidenceBoost: userVerifiedConfidence,
        matchReason: "Manual market evidence saved from this scan.",
        matchScore: 100
      },
      recommendationExplanation: "USER_VERIFIED_SALE manual market evidence applied. Raw AI result preserved separately.",
      sourceBadges: Array.from(new Set([...(listing.sourceBadges || []), "USER_VERIFIED_SALE"]))
    } as NormalizedListing);
  }

  return (
    <section className="rounded-3xl border border-sky-500/25 bg-zinc-900 p-4 shadow-2xl shadow-black/20 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-sky-300">Correction portal</p>
          <h2 className="mt-1 text-lg font-bold text-white">Human verified scan correction</h2>
          <p className="mt-1 text-xs font-semibold text-zinc-400">
            AI detected values stay raw. Corrections are stored separately as USER_VERIFIED.
          </p>
        </div>
        <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-[11px] font-black text-sky-200">
          Pricing source: {(listing as any).pricingSource || "none"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
        <Readout label="AI detected value" value={`${listing.itemTitle || "Unknown"} / ${listing.upc || "No UPC"}`} />
        <Readout label="User corrected value" value={`${productTitle || "Untitled"} / ${upc || "No UPC"}`} />
        <Readout label="Final trusted value" value={`${productTitle || listing.itemTitle} / ${money(math?.resale ?? moneyOrNull(soldCompPrice))}`} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <TextField label="Product title" value={productTitle} onChange={setProductTitle} />
        <TextField label="UPC/EAN" value={upc} onChange={setUpc} inputMode="numeric" />
        <TextField label="Brand" value={brand} onChange={setBrand} />
        <SelectField label="Source store" value={sourceStore} onChange={setSourceStore} options={STORE_OPTIONS} />
        <TextField label="Cost paid" value={costPaid} onChange={setCostPaid} inputMode="decimal" />
        <TextField label="Sold comp price" value={soldCompPrice} onChange={setSoldCompPrice} inputMode="decimal" />
        <TextField label="Shipping estimate" value={shippingEstimate} onChange={setShippingEstimate} inputMode="decimal" />
        <SelectField label="Condition" value={condition} onChange={setCondition} options={CONDITION_OPTIONS} />
        <SelectField label="Platform used for comp" value={platformUsedForComp} onChange={setPlatformUsedForComp} options={PLATFORM_OPTIONS} />
        <SelectField label="Confidence correction" value={confidenceCorrection} onChange={setConfidenceCorrection} options={CONFIDENCE_OPTIONS} />
        <SelectField label="Demand correction" value={demandCorrection} onChange={setDemandCorrection} options={DEMAND_OPTIONS} />
        <label className="grid gap-1 text-xs font-semibold text-zinc-300 sm:col-span-2">
          Notes
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-300"
          />
        </label>
      </div>

      <div className="mt-4 grid gap-2 text-xs text-zinc-300 sm:grid-cols-3">
        <Readout label="Manual resale" value={money(moneyOrNull(soldCompPrice))} />
        <Readout label="Manual profit" value={math ? money(math.netProfit) : "Manual price required"} />
        <Readout label="Manual ROI" value={math?.roi == null ? "Unavailable" : `${math.roi}%`} />
      </div>

      {pricingUnavailable ? (
        <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-[10px] uppercase tracking-widest text-amber-200">
            Manual Market Evidence
          </p>
          <p className="mt-1 text-sm font-semibold text-amber-100">
            No market sales found. Add your own verified comp to teach Boss Listers.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <TextField label="Manual sold comp price" value={soldCompPrice} onChange={setSoldCompPrice} inputMode="decimal" />
            <TextField label="Sold date" value={evidenceSoldDate} onChange={setEvidenceSoldDate} />
            <SelectField label="Platform" value={platformUsedForComp} onChange={setPlatformUsedForComp} options={PLATFORM_OPTIONS} />
            <TextField label="Quantity sold" value={evidenceQuantitySold} onChange={setEvidenceQuantitySold} inputMode="numeric" />
            <TextField label="Shipping charged" value={shippingEstimate} onChange={setShippingEstimate} inputMode="decimal" />
            <SelectField label="Item condition" value={condition} onChange={setCondition} options={CONDITION_OPTIONS} />
            <TextField label="Source URL optional" value={evidenceSourceUrl} onChange={setEvidenceSourceUrl} />
            <label className="grid gap-1 text-xs font-semibold text-zinc-300">
              Notes
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-300"
              />
            </label>
          </div>
          <div className="mt-4 grid gap-2 text-xs text-zinc-300 sm:grid-cols-3">
            <Readout label="Pricing source after save" value="USER_VERIFIED_SALE" />
            <Readout label="User verified confidence" value={`${userVerifiedConfidence}%`} />
            <Readout label="Recalculated profit" value={math ? money(math.netProfit) : "Cost and sold price required"} />
          </div>
          <button
            type="button"
            onClick={saveManualMarketEvidence}
            className="mt-4 min-h-11 rounded-xl border border-amber-400/40 bg-amber-300 px-4 py-2 text-xs font-black text-zinc-950"
          >
            Save as USER_VERIFIED_SALE and recalculate
          </button>
          {savedAt === "manual-evidence-missing" ? (
            <p className="mt-3 text-xs font-semibold text-rose-200">
              Manual sold comp price and sold date are required.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <ActionButton onClick={() => saveCorrection("save_correction")}>Save correction</ActionButton>
        <ActionButton onClick={() => saveCorrection("save_correction")}>Recalculate</ActionButton>
        <ActionButton onClick={() => saveCorrection("add_pricing_memory")}>Add to local pricing memory</ActionButton>
        <ActionButton onClick={() => applyFlag("wrong_item", "wrong_item")}>Mark wrong item</ActionButton>
        <ActionButton onClick={() => applyFlag("wrong_variant", "wrong_variant")}>Mark wrong variant</ActionButton>
        <ActionButton onClick={() => applyFlag("bundle_multipack", "bundle_multipack")}>Mark bundle/multipack</ActionButton>
        <ActionButton onClick={() => applyFlag("correct_match", "correct_match")}>Mark correct match</ActionButton>
      </div>

      {savedAt ? (
        <p className="mt-3 text-xs font-semibold text-emerald-300">
          USER_VERIFIED correction saved locally. Future scans with the same UPC/title will load it before null fallback.
        </p>
      ) : null}
    </section>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
      <p className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</p>
      <p className="mt-1 break-words text-xs font-semibold text-zinc-200">{value}</p>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  inputMode
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: "decimal" | "numeric";
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-zinc-300">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode={inputMode}
        className="min-h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-300"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-zinc-300">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-300"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ActionButton({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-10 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-bold text-zinc-200 transition hover:border-sky-300 hover:text-white"
    >
      {children}
    </button>
  );
}
