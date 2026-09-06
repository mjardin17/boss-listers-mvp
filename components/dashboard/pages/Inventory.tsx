"use client";

import { useState, useEffect } from "react";

const MARKETPLACES = [
  { id: "ebay", name: "eBay", mono: "eB", color: "#3b82f6" },
  { id: "facebook", name: "Facebook", mono: "FB", color: "#4f7cff" },
  { id: "mercari", name: "Mercari", mono: "Mc", color: "#f97364" },
  { id: "etsy", name: "Etsy", mono: "Et", color: "#f1641e" },
  { id: "poshmark", name: "Poshmark", mono: "Po", color: "#c2185b" },
  { id: "depop", name: "Depop", mono: "De", color: "#ff2300" },
];

interface Product {
  sku: string;
  title: string;
  quantity: number;
  price: number;
  status: string;
  source: string;
  ebay_listing_id?: string;
}

export default function Inventory() {
  const [inventoryRows, setInventoryRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  useEffect(() => {
    const fetchInventory = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/inventory");
        if (!res.ok) throw new Error("Failed to fetch inventory");
        const data = await res.json();

        if (data.ok && data.products) {
          // Transform Supabase products into UI format
          const rows = data.products.map((product: Product) => ({
            sku: product.sku,
            title: product.title,
            qty: product.quantity || 0,
            price: product.price || 0,
            live: product.source === "ebay" ? ["ebay"] : [],
          }));
          setInventoryRows(rows);
          setError(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setInventoryRows([]);
      } finally {
        setLoading(false);
      }
    };

    fetchInventory();
  }, []);

  const toggleRow = (sku: string) => {
    const newSet = new Set(selectedRows);
    if (newSet.has(sku)) {
      newSet.delete(sku);
    } else {
      newSet.add(sku);
    }
    setSelectedRows(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === inventoryRows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(inventoryRows.map(r => r.sku)));
    }
  };

  const syncToFacebook = async () => {
    if (selectedRows.size === 0) return;
    setSyncing(true);
    setSyncStatus(null);

    try {
      const skus = Array.from(selectedRows);
      const results = [];
      for (const sku of skus) {
        const res = await fetch("/api/inventory/sync-facebook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sku, dryRun: false, confirm: true }),
        });
        const data = await res.json();
        if (!data.ok) {
          throw new Error(`Failed to sync ${sku}: ${data.error}`);
        }
        results.push(data);
      }
      setSyncStatus(`✓ Synced ${skus.length} item(s) to Facebook`);
      setSelectedRows(new Set());
    } catch (err) {
      setSyncStatus(`✗ Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#f4f4f5]">Inventory</h1>
        <p className="text-sm text-[#71717a] mt-1">
          {loading ? "Loading…" : `${inventoryRows.length} item${inventoryRows.length === 1 ? "" : "s"} in your inventory`}
        </p>
      </div>

      {/* Bulk Actions Bar */}
      {selectedRows.size > 0 && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[rgba(99,102,241,0.1)] border border-[rgba(99,102,241,0.3)]">
          <span className="text-sm font-semibold text-[#f4f4f5]">{selectedRows.size} selected</span>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={syncToFacebook}
              disabled={syncing}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-[#f4f4f5] bg-[#4f7cff] border border-[rgba(79,124,255,0.5)] hover:opacity-90 disabled:opacity-50"
            >
              {syncing ? "Syncing..." : "Sync to Facebook"}
            </button>
            <button
              onClick={() => setSelectedRows(new Set())}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-[#f4f4f5] bg-[#27272a] border border-[rgba(255,255,255,0.08)]"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Sync Status Message */}
      {syncStatus && (
        <div className={`p-3 rounded-xl border text-sm ${
          syncStatus.startsWith("✓")
            ? "bg-[rgba(52,211,153,0.1)] border-[rgba(52,211,153,0.3)] text-[#34d399]"
            : "bg-[rgba(251,113,133,0.1)] border-[rgba(251,113,133,0.3)] text-[#fb7185]"
        }`}>
          {syncStatus}
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden md:block rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#18181b] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[#1f1f23]">
                <th className="w-7 p-2"><input type="checkbox" checked={selectedRows.size === inventoryRows.length} onChange={toggleSelectAll} /></th>
                <th className="w-12" />
                <th className="px-4 py-2.5 text-left text-xs uppercase font-bold text-[#71717a]">Item</th>
                <th className="px-4 py-2.5 text-left text-xs uppercase font-bold text-[#71717a]">Qty</th>
                <th className="px-4 py-2.5 text-left text-xs uppercase font-bold text-[#71717a]">Price</th>
                <th className="px-4 py-2.5 text-left text-xs uppercase font-bold text-[#71717a]">Marketplaces</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {inventoryRows.map((row) => (
                  <tr key={row.sku} className="border-b border-[rgba(255,255,255,0.08)] hover:bg-[#1f1f23]/50">
                    <td className="p-2"><input type="checkbox" checked={selectedRows.has(row.sku)} onChange={() => toggleRow(row.sku)} /></td>
                    <td className="px-3 py-2">
                      <div className="w-10 h-10 rounded-lg bg-[repeating-linear-gradient(45deg,_#27272a,_#27272a_4px,_#1f1f23_4px,_#1f1f23_8px)] border border-[rgba(255,255,255,0.08)]" />
                    </td>
                    <td className="px-4 py-2.5 min-w-0">
                      <div className="text-sm font-semibold text-[#f4f4f5] truncate">{row.title}</div>
                      <div className="text-xs text-[#71717a] font-mono">{row.sku}</div>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-[#a1a1aa] font-mono">{row.qty}</td>
                    <td className="px-4 py-2.5 text-sm font-bold text-[#34d399] font-mono">${row.price.toFixed(2)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        {MARKETPLACES.map(m => (
                          <div
                            key={m.id}
                            className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                              row.live.includes(m.id) ? "text-[#0a0a10]" : "text-[#71717a]"
                            }`}
                            style={{
                              background: row.live.includes(m.id) ? m.color : "#27272a",
                              opacity: row.live.includes(m.id) ? 1 : 0.5,
                            }}
                          >
                            {m.mono}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-center text-[#71717a]">⋯</td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {inventoryRows.map((row) => (
            <div key={row.sku} className="p-3.5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#18181b] space-y-3">
              <div className="flex gap-3 items-start">
                <input type="checkbox" checked={selectedRows.has(row.sku)} onChange={() => toggleRow(row.sku)} className="mt-0.5" />
                <div className="w-10 h-10 rounded-lg bg-[repeating-linear-gradient(45deg,_#27272a,_#27272a_4px,_#1f1f23_4px,_#1f1f23_8px)] border border-[rgba(255,255,255,0.08)] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[#f4f4f5]">{row.title}</div>
                  <div className="text-xs text-[#71717a] font-mono">{row.sku}</div>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#a1a1aa] font-mono">Qty {row.qty}</span>
                <span className="font-bold text-[#34d399] font-mono">${row.price.toFixed(2)}</span>
              </div>
              <div className="flex gap-1 flex-wrap">
                {MARKETPLACES.map(m => (
                  <div
                    key={m.id}
                    className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      row.live.includes(m.id) ? "text-[#0a0a10]" : "text-[#71717a]"
                    }`}
                    style={{
                      background: row.live.includes(m.id) ? m.color : "#27272a",
                      opacity: row.live.includes(m.id) ? 1 : 0.5,
                    }}
                  >
                    {m.mono}
                  </div>
                ))}
              </div>
            </div>
        ))}
      </div>
    </div>
  );
}
