"use client";

import { useState } from "react";
import { importSalesHistoryText } from "../../lib/salesHistory/salesHistoryImporter";
import { loadSalesMemory, saveSalesMemory } from "../../lib/salesHistory/salesMemoryStore";
import type { UserVerifiedSale } from "../../lib/salesHistory/salesHistoryTypes";

export function SalesHistoryImportPanel() {
  const [pastedRows, setPastedRows] = useState("");
  const [imported, setImported] = useState<UserVerifiedSale[]>(() => loadSalesMemory().slice(0, 5));
  const [status, setStatus] = useState("");

  function importText(text: string) {
    const sales = importSalesHistoryText(text);
    if (!sales.length) {
      setStatus("No valid sales rows found. Required: title, sold price, sold date.");
      return;
    }
    const next = saveSalesMemory(sales);
    setImported(next.slice(0, 5));
    setStatus(`${sales.length} USER_VERIFIED_SALE rows imported.`);
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    importText(await file.text());
  }

  function exportSalesMemory() {
    const rows = loadSalesMemory();
    const csv = [
      "item title,sold price,sold date,platform,shipping charged,cost,SKU,UPC,category,condition",
      ...rows.map((sale) =>
        [
          sale.itemTitle,
          sale.soldPrice,
          sale.soldDate,
          sale.platform,
          sale.shippingCharged ?? "",
          sale.cost ?? "",
          sale.sku,
          sale.upc,
          sale.category,
          sale.condition
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(",")
      )
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "boss-listers-user-sales-history.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl shadow-black/20 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-emerald-300">User sales history</p>
          <h2 className="mt-1 text-lg font-bold text-white">Import real sold history</h2>
          <p className="mt-1 text-xs font-semibold text-zinc-400">
            CSV or pasted rows become USER_VERIFIED_SALE evidence. Missing fields stay blank.
          </p>
        </div>
        <button
          type="button"
          onClick={exportSalesMemory}
          className="min-h-10 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-bold text-zinc-200"
        >
          Export memory
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        <input
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          onChange={(event) => void handleFile(event.target.files?.[0] || null)}
          className="min-h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-semibold text-zinc-300"
        />
        <textarea
          value={pastedRows}
          onChange={(event) => setPastedRows(event.target.value)}
          rows={5}
          placeholder="item title,sold price,sold date,platform,shipping charged,cost,SKU,UPC,category,condition"
          className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-300"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => importText(pastedRows)}
            className="min-h-10 rounded-xl border border-emerald-400/40 bg-emerald-400 px-3 py-2 text-xs font-black text-zinc-950"
          >
            Import sales history
          </button>
          {status ? <span className="self-center text-xs font-semibold text-emerald-300">{status}</span> : null}
        </div>
      </div>

      {imported.length ? (
        <div className="mt-4 grid gap-2">
          {imported.map((sale) => (
            <div key={sale.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
              <p className="line-clamp-1 text-xs font-bold text-white">{sale.itemTitle}</p>
              <p className="mt-1 text-[11px] font-semibold text-zinc-400">
                ${sale.soldPrice.toFixed(2)} / {sale.soldDate} / {sale.platform} / USER_VERIFIED_SALE
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
