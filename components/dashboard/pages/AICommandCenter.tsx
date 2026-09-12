"use client";

import { useState } from "react";

const COMMANDS = [
  { label: "List everything on eBay", tag: "Bulk publish", icon: "nodes" },
  { label: "Relist stale inventory", tag: "Automation", icon: "stack" },
  { label: "Update prices", tag: "Pricing", icon: "bars" },
  { label: "Find items worth buying", tag: "Sourcing", icon: "dot" },
  { label: "Show today's profit", tag: "Analytics", icon: "spark" },
];

const HISTORY = [
  { q: "Show today's profit", a: "Today's profit is $1,842 across 6 marketplaces, up 12% vs. yesterday. Top contributor: eBay ($712).", t: "10:14 AM" },
  { q: "Relist stale inventory", a: "Relisted 12 items idle 45+ days on Poshmark and Depop. Estimated visibility lift: +18%.", t: "9:52 AM" },
  { q: "Find items worth buying", a: "Found 4 candidates matching your margin threshold (>60% ROI) from today's estate sale feed.", t: "9:20 AM" },
];

export default function AICommandCenter() {
  const [query, setQuery] = useState("");

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="text-center space-y-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#818cf8] to-[#4f46e5] flex items-center justify-center mx-auto shadow-[0_8px_24px_rgba(99,102,241,0.35)]">
          <div
            className="w-4 h-4 bg-white"
            style={{
              clipPath: "polygon(50% 0%, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0% 50%, 38% 38%)",
            }}
          />
        </div>
        <h1 className="text-2xl font-bold text-[#f4f4f5]">AI Command Center</h1>
        <p className="text-sm text-[#71717a]">Tell CrossPost AI what to do, in plain English.</p>
      </div>

      {/* Input */}
      <div className="max-w-lg mx-auto w-full">
        <div className="p-3.5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#18181b] flex items-center gap-2.5">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="e.g. Relist stale inventory on Poshmark"
            className="flex-1 bg-transparent border-none outline-none text-base text-[#f4f4f5] placeholder-[#71717a]"
          />
          <button
            disabled={!query}
            className="w-8.5 h-8.5 rounded-lg bg-gradient-to-br from-[#818cf8] to-[#4f46e5] flex items-center justify-center flex-shrink-0 disabled:opacity-50"
          >
            <div className="w-0 h-0 border-t-[5px] border-b-[5px] border-l-[8px] border-t-transparent border-b-transparent border-l-white ml-0.5" />
          </button>
        </div>
      </div>

      {/* Suggested Commands */}
      <div className="flex flex-wrap gap-2 justify-center max-w-2xl mx-auto">
        {COMMANDS.map((cmd, idx) => (
          <button
            key={idx}
            onClick={() => setQuery(cmd.label)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-semibold text-[#f4f4f5] bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] hover:bg-[#27272a] hover:border-[rgba(255,255,255,0.12)] transition-all whitespace-nowrap"
          >
            <span className="text-xs">✨</span>
            {cmd.label}
          </button>
        ))}
      </div>

      {/* Recent Commands */}
      <div className="max-w-lg mx-auto w-full">
        <div className="text-xs uppercase font-bold letter-spacing text-[#71717a] mb-3">Recent Commands</div>
        <div className="space-y-2.5">
          {HISTORY.map((cmd, idx) => (
            <div key={idx} className="p-4 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#18181b]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-[#f4f4f5]">{cmd.q}</span>
                <span className="text-xs text-[#71717a] font-mono flex-shrink-0">{cmd.t}</span>
              </div>
              <div className="text-sm text-[#a1a1aa] leading-snug">{cmd.a}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
