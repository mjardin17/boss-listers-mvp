"use client";

import { useState, useEffect } from "react";

const STAT_CARDS = [
  { label: "Revenue (30d)", value: "$24,680", sub: "+18.2% vs prior", tone: "green" },
  { label: "Active Listings", value: "1,299", sub: "across 6 marketplaces", tone: "default" },
  { label: "Open Orders", value: "47", sub: "12 need shipping", tone: "gold" },
  { label: "Listings Pending", value: "23", sub: "queued to publish", tone: "accent" },
];

const MARKETPLACES = [
  { id: "ebay", name: "eBay", mono: "eB", color: "#3b82f6", status: "live", listings: 342, lastSync: "2m ago" },
  { id: "facebook", name: "Facebook Marketplace", mono: "FB", color: "#4f7cff", status: "live", listings: 288, lastSync: "4m ago" },
  { id: "mercari", name: "Mercari", mono: "Mc", color: "#f97364", status: "syncing", listings: 201, lastSync: "Syncing…" },
  { id: "etsy", name: "Etsy", mono: "Et", color: "#f1641e", status: "live", listings: 96, lastSync: "11m ago" },
  { id: "poshmark", name: "Poshmark", mono: "Po", color: "#c2185b", status: "error", listings: 154, lastSync: "Failed 1h ago" },
  { id: "depop", name: "Depop", mono: "De", color: "#ff2300", status: "live", listings: 118, lastSync: "6m ago" },
];

const ACTIVITY_FEED = [
  { t: "2m ago", text: "Relisted 12 stale items on Poshmark to refresh search ranking", kind: "relist" },
  { t: "9m ago", text: "Generated title + description for SKU-20291 (Vintage Denim Jacket)", kind: "gen" },
  { t: "18m ago", text: "Dropped price 8% on 3 slow movers across eBay + Mercari", kind: "price" },
  { t: "34m ago", text: "Published 6 new listings to Facebook Marketplace", kind: "publish" },
  { t: "1h ago", text: "Flagged Poshmark sync error — auth token expired", kind: "error" },
  { t: "2h ago", text: "Found 4 items matching your sourcing criteria at estate sale feed", kind: "find" },
];

const REVENUE_DATA = [32, 28, 41, 38, 52, 48, 61, 58, 70, 66, 78, 84];

export default function Dashboard() {
  const maxRevenue = Math.max(...REVENUE_DATA);
  const colors = {
    green: "#34d399",
    accent: "#6366f1",
    accentLight: "#818cf8",
    gold: "#fbbf24",
    red: "#fb7185",
    textSecondary: "#a1a1aa",
    textTertiary: "#71717a",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#f4f4f5]">Good morning, Josh</h1>
        <p className="text-sm text-[#71717a] mt-1">Here's how the empire is performing today.</p>
      </div>

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

      {/* Revenue Chart + Marketplace Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 p-4.5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#18181b]">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-bold text-[#f4f4f5]">Revenue — Last 12 Weeks</span>
            <span className="text-xs font-bold font-mono text-[#34d399]">+18.2%</span>
          </div>

          <div className="flex items-end gap-1.5 h-32">
            {REVENUE_DATA.map((value, idx) => {
              const height = (value / maxRevenue) * 100;
              const isLast = idx === REVENUE_DATA.length - 1;
              return (
                <div
                  key={idx}
                  className="flex-1 rounded-t"
                  style={{
                    height: `${height}%`,
                    background: isLast ? "linear-gradient(180deg, #818cf8, #4f46e5)" : "rgba(99, 102, 241, 0.28)",
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Marketplace Status */}
        <div className="p-4.5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#18181b]">
          <div className="text-xs uppercase font-bold letter-spacing text-[#71717a] mb-3">Marketplace Status</div>
          <div className="flex flex-col gap-2">
            {MARKETPLACES.map((m) => (
              <div key={m.id} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#1f1f23] border border-[rgba(255,255,255,0.08)]">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold text-[#0a0a10] flex-shrink-0"
                  style={{ background: m.color }}
                >
                  {m.mono}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-[#f4f4f5]">{m.name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{
                        background: m.status === "live" ? "#34d399" :
                                  m.status === "syncing" ? "#fbbf24" :
                                  "#fb7185",
                        animation: m.status === "syncing" ? "pulse 1.2s infinite" : "none",
                      }}
                    />
                    <span className="text-xs text-[#71717a] font-mono">{m.lastSync}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI Activity Feed */}
      <div className="p-4.5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#18181b]">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-bold text-[#f4f4f5]">AI Activity Feed</span>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#34d399] animate-pulse" />
            <span className="text-xs text-[#71717a] font-mono">LIVE</span>
          </div>
        </div>

        <div className="space-y-0">
          {ACTIVITY_FEED.map((activity, idx) => (
            <div key={idx} className="flex gap-3 py-2.5 border-b border-[rgba(255,255,255,0.08)] last:border-b-0">
              <div
                className="w-5.5 h-5.5 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  background: activity.kind === "error" ? "rgba(251, 113, 133, 0.15)" : "rgba(99, 102, 241, 0.15)",
                }}
              >
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: activity.kind === "error" ? "#fb7185" : "#818cf8",
                  }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[#f4f4f5] leading-snug">{activity.text}</div>
                <div className="text-xs text-[#71717a] font-mono mt-0.5">{activity.t}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
