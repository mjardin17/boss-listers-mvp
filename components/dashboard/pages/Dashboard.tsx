"use client";

import { useState, useEffect } from "react";

interface Product {
  sku: string;
  title: string;
  price: number;
  quantity: number;
  status: string;
  source: string;
  ebay_listing_id?: string;
  updated_at: string;
}

interface ChannelAccount {
  marketplace: string;
  account_label: string;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
}

const MARKETPLACE_STYLE: Record<string, { mono: string; color: string }> = {
  ebay: { mono: "eB", color: "#3b82f6" },
  facebook: { mono: "FB", color: "#4f7cff" },
  mercari: { mono: "Mc", color: "#f97364" },
  etsy: { mono: "Et", color: "#f1641e" },
  poshmark: { mono: "Po", color: "#c2185b" },
  depop: { mono: "De", color: "#ff2300" },
};

function timeAgo(iso: string | null) {
  if (!iso) return "Never synced";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function Dashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [accounts, setAccounts] = useState<ChannelAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [invRes, chanRes] = await Promise.all([
          fetch("/api/inventory"),
          fetch("/api/channels/status"),
        ]);
        const invData = await invRes.json();
        const chanData = await chanRes.json();
        if (invData.ok) setProducts(invData.products || []);
        if (chanData.ok) setAccounts(chanData.accounts || []);
        if (!invData.ok && !chanData.ok) setError("Could not load dashboard data.");
        else setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalProducts = products.length;
  const inventoryValue = products.reduce((sum, p) => sum + (p.price || 0) * (p.quantity || 0), 0);
  const errorAccounts = accounts.filter((a) => a.status === "error" || a.last_error);
  const connectedAccounts = accounts.filter((a) => a.status !== "error" && !a.last_error);
  const recentProducts = [...products]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 8);

  const STAT_CARDS = [
    { label: "Total Products", value: String(totalProducts), sub: "in shared inventory", tone: "default" },
    { label: "Inventory Value", value: `$${inventoryValue.toFixed(2)}`, sub: "price × qty, all products", tone: "green" },
    { label: "Connected Marketplaces", value: String(connectedAccounts.length), sub: `of ${accounts.length} configured`, tone: "accent" },
    { label: "Needs Attention", value: String(errorAccounts.length), sub: errorAccounts.length ? "sync errors" : "all clear", tone: errorAccounts.length ? "gold" : "green" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#f4f4f5]">Good morning, Josh</h1>
        <p className="text-sm text-[#71717a] mt-1">
          {loading ? "Loading your real inventory data…" : "Here's what's actually in your inventory right now."}
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-xl border border-[rgba(251,113,133,0.3)] bg-[rgba(251,113,133,0.1)] text-sm text-[#fb7185]">
          {error}
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {STAT_CARDS.map((stat, idx) => (
          <div key={idx} className="flex flex-col gap-2 p-4.5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#18181b]">
            <span className="text-xs uppercase font-bold letter-spacing text-[#71717a]">{stat.label}</span>
            <span className="text-2xl font-bold text-[#f4f4f5] font-mono letter-spacing">{stat.value}</span>
            <span className={`text-sm font-semibold ${
              stat.tone === "green" ? "text-[#34d399]" :
              stat.tone === "gold" ? "text-[#fbbf24]" :
              stat.tone === "accent" ? "text-[#818cf8]" :
              "text-[#71717a]"
            }`}>
              {stat.sub}
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recently Updated Products */}
        <div className="lg:col-span-2 p-4.5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#18181b]">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-bold text-[#f4f4f5]">Recently Updated Products</span>
          </div>
          {recentProducts.length === 0 ? (
            <div className="text-sm text-[#71717a] py-6 text-center">
              {loading ? "Loading…" : "No products in inventory yet."}
            </div>
          ) : (
            <div className="space-y-0">
              {recentProducts.map((p) => (
                <div key={p.sku} className="flex items-center justify-between py-2.5 border-b border-[rgba(255,255,255,0.08)] last:border-b-0">
                  <div className="min-w-0">
                    <div className="text-sm text-[#f4f4f5] truncate">{p.title}</div>
                    <div className="text-xs text-[#71717a] font-mono">{p.sku} · {p.source}</div>
                  </div>
                  <div className="text-xs text-[#71717a] font-mono flex-shrink-0 ml-3">{timeAgo(p.updated_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Marketplace Status */}
        <div className="p-4.5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#18181b]">
          <div className="text-xs uppercase font-bold letter-spacing text-[#71717a] mb-3">Marketplace Status</div>
          <div className="flex flex-col gap-2">
            {accounts.length === 0 && !loading && (
              <div className="text-sm text-[#71717a] py-4 text-center">No marketplace accounts connected yet.</div>
            )}
            {accounts.map((a) => {
              const style = MARKETPLACE_STYLE[a.marketplace] || { mono: a.marketplace.slice(0, 2).toUpperCase(), color: "#71717a" };
              const isError = a.status === "error" || a.last_error;
              return (
                <div key={`${a.marketplace}-${a.account_label}`} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#1f1f23] border border-[rgba(255,255,255,0.08)]">
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold text-[#0a0a10] flex-shrink-0"
                    style={{ background: style.color }}
                  >
                    {style.mono}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-[#f4f4f5] capitalize">{a.marketplace}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: isError ? "#fb7185" : "#34d399" }}
                      />
                      <span className="text-xs text-[#71717a] font-mono">
                        {isError ? (a.last_error || "Error") : timeAgo(a.last_sync_at)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
