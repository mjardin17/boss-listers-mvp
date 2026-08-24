"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { calculateDealMetrics, SAMPLE_SOLD_COMP_DATA, formatCurrency, formatPercent } from "../lib/calculations";
import { loadRecentScans, saveRecentScan } from "../lib/storage";
import type { DealAnalysis, DealInput } from "../types/deal";
import { ResultsCard } from "./ResultsCard";

type FormState = {
  itemName: string;
  buyCost: string;
  shippingEstimate: string;
  photoName: string;
};

const initialFormState: FormState = {
  itemName: "",
  buyCost: "",
  shippingEstimate: "6.99",
  photoName: ""
};

function parseCurrencyInput(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function createScanId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `scan-${Date.now()}`;
}

export function BossListerForm() {
  const [form, setForm] = useState<FormState>(initialFormState);
  const [analysis, setAnalysis] = useState<DealAnalysis | null>(null);
  const [recentScans, setRecentScans] = useState<DealAnalysis[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const canAnalyze = useMemo(() => {
    return Boolean(form.itemName.trim() || form.photoName) && parseCurrencyInput(form.buyCost) > 0;
  }, [form.buyCost, form.itemName, form.photoName]);

  useEffect(() => {
    setRecentScans(loadRecentScans());
  }, []);

  function updateForm(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    updateForm("photoName", file?.name || "");
  }

  function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAnalyze) {
      return;
    }

    setIsAnalyzing(true);

    const input: DealInput = {
      itemName: form.itemName.trim() || form.photoName,
      marketplace: "eBay",
      buyCost: parseCurrencyInput(form.buyCost),
      shippingEstimate: parseCurrencyInput(form.shippingEstimate),
      photoName: form.photoName || undefined
    };

    const nextAnalysis: DealAnalysis = {
      id: createScanId(),
      createdAt: new Date().toISOString(),
      input,
      comps: SAMPLE_SOLD_COMP_DATA,
      metrics: calculateDealMetrics(input, SAMPLE_SOLD_COMP_DATA)
    };

    window.setTimeout(() => {
      setAnalysis(nextAnalysis);
      setIsAnalyzing(false);
    }, 350);
  }

  function handleSaveScan() {
    if (!analysis) {
      return;
    }

    setRecentScans(saveRecentScan(analysis));
  }

  function handleClear() {
    setForm(initialFormState);
    setAnalysis(null);
    setIsAnalyzing(false);
  }

  function handleOpenScan(scan: DealAnalysis) {
    setAnalysis(scan);
    setForm({
      itemName: scan.input.itemName,
      buyCost: String(scan.input.buyCost),
      shippingEstimate: String(scan.input.shippingEstimate),
      photoName: scan.input.photoName || ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-4 px-4 pb-8 pt-5 sm:pt-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Retail arbitrage</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-white">Boss Listers AI</h1>
        </div>
        <div className="rounded-[8px] border border-zinc-800 bg-zinc-900 px-3 py-2 text-right">
          <p className="text-[11px] font-medium text-zinc-500">Market</p>
          <p className="text-sm font-bold text-white">eBay</p>
        </div>
      </header>

      <form onSubmit={handleAnalyze} className="rounded-[8px] border border-zinc-800 bg-zinc-900 p-4 shadow-2xl shadow-black/25">
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-zinc-200">Item Name</span>
            <input
              value={form.itemName}
              onChange={(event) => updateForm("itemName", event.target.value)}
              placeholder="LEGO set, clearance toy, appliance..."
              className="mt-2 min-h-12 w-full rounded-[8px] border border-zinc-700 bg-zinc-950 px-3 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-zinc-200">Photo Upload / Camera</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoChange}
              className="mt-2 block min-h-12 w-full cursor-pointer rounded-[8px] border border-dashed border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-zinc-300 file:mr-3 file:rounded-[8px] file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:font-bold file:text-white"
            />
            {form.photoName ? <span className="mt-2 block truncate text-xs text-emerald-300">{form.photoName}</span> : null}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-semibold text-zinc-200">Buy Cost</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.buyCost}
                onChange={(event) => updateForm("buyCost", event.target.value)}
                placeholder="0.00"
                className="mt-2 min-h-12 w-full rounded-[8px] border border-zinc-700 bg-zinc-950 px-3 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-zinc-200">Shipping Estimate</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.shippingEstimate}
                onChange={(event) => updateForm("shippingEstimate", event.target.value)}
                className="mt-2 min-h-12 w-full rounded-[8px] border border-zinc-700 bg-zinc-950 px-3 text-base text-white outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
              />
            </label>
          </div>

          <div className="rounded-[8px] border border-zinc-800 bg-zinc-950 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Comp source</span>
              <span className="font-bold text-white">{SAMPLE_SOLD_COMP_DATA.sampleSales} sold comps</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-zinc-400">Average sold price</span>
              <span className="font-bold text-emerald-300">{formatCurrency(SAMPLE_SOLD_COMP_DATA.averageSoldPrice)}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="submit"
              disabled={!canAnalyze || isAnalyzing}
              className="col-span-2 min-h-12 rounded-[8px] bg-emerald-400 px-4 text-sm font-black uppercase tracking-wide text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              {isAnalyzing ? "Analyzing" : "Analyze"}
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="min-h-12 rounded-[8px] border border-zinc-700 bg-zinc-950 px-4 text-sm font-bold text-zinc-200 transition hover:border-zinc-500"
            >
              Clear
            </button>
          </div>

          <button
            type="button"
            onClick={handleSaveScan}
            disabled={!analysis}
            className="min-h-12 w-full rounded-[8px] border border-emerald-400/40 bg-emerald-400/10 px-4 text-sm font-bold text-emerald-200 transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-950 disabled:text-zinc-600"
          >
            Save Scan
          </button>
        </div>
      </form>

      {analysis ? <ResultsCard analysis={analysis} /> : <EmptyResultPreview />}

      <section className="rounded-[8px] border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Recent Scans</h2>
          <span className="text-xs font-semibold text-zinc-500">Last 5</span>
        </div>
        <div className="mt-3 space-y-2">
          {recentScans.length ? (
            recentScans.map((scan) => (
              <button
                key={scan.id}
                type="button"
                onClick={() => handleOpenScan(scan)}
                className="grid min-h-16 w-full grid-cols-[1fr_auto] items-center gap-3 rounded-[8px] border border-zinc-800 bg-zinc-950 p-3 text-left transition hover:border-zinc-600"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-white">{scan.input.itemName}</span>
                  <span className="mt-1 block text-xs text-zinc-500">
                    Profit {formatCurrency(scan.metrics.profit)} · ROI {formatPercent(scan.metrics.roi)}
                  </span>
                </span>
                <span
                  className={`rounded-[8px] px-3 py-2 text-xs font-black ${
                    scan.metrics.decision === "BUY" ? "bg-emerald-400 text-zinc-950" : "bg-red-500 text-white"
                  }`}
                >
                  {scan.metrics.decision}
                </span>
              </button>
            ))
          ) : (
            <div className="rounded-[8px] border border-dashed border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-500">
              Saved scans will appear here for quick in-store comparison.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function EmptyResultPreview() {
  return (
    <section className="rounded-[8px] border border-dashed border-zinc-800 bg-zinc-900/60 p-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-[8px] bg-zinc-950 p-3">
          <p className="text-[11px] text-zinc-500">Buy rule</p>
          <p className="mt-1 text-sm font-bold text-white">ROI 50%+</p>
        </div>
        <div className="rounded-[8px] bg-zinc-950 p-3">
          <p className="text-[11px] text-zinc-500">Profit</p>
          <p className="mt-1 text-sm font-bold text-white">$10+</p>
        </div>
        <div className="rounded-[8px] bg-zinc-950 p-3">
          <p className="text-[11px] text-zinc-500">Speed</p>
          <p className="mt-1 text-sm font-bold text-white">60 sec</p>
        </div>
      </div>
    </section>
  );
}
