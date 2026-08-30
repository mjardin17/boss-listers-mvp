"use client";

import { useState } from "react";

const MARKETPLACES = [
  { id: "ebay", name: "eBay", mono: "eB", color: "#3b82f6" },
  { id: "facebook", name: "Facebook Marketplace", mono: "FB", color: "#4f7cff" },
  { id: "mercari", name: "Mercari", mono: "Mc", color: "#f97364" },
  { id: "etsy", name: "Etsy", mono: "Et", color: "#f1641e" },
  { id: "poshmark", name: "Poshmark", mono: "Po", color: "#c2185b" },
  { id: "depop", name: "Depop", mono: "De", color: "#ff2300" },
];

export default function ListingEditor() {
  const [title, setTitle] = useState("Vintage Levi's 501 Denim Jacket — Medium, Excellent Condition");
  const [description, setDescription] = useState(
    "Classic 501 straight-leg denim jacket in a rich indigo wash. Excellent pre-owned condition — no rips, stains, or fading. Button closures all intact. A true wardrobe staple that only gets better with age."
  );
  const [price, setPrice] = useState(128);
  const [targets, setTargets] = useState<Record<string, boolean>>({
    ebay: true,
    facebook: true,
    mercari: false,
    etsy: false,
    poshmark: true,
    depop: true,
  });

  const targetCount = Object.values(targets).filter(Boolean).length;

  const toggleTarget = (id: string) => {
    setTargets(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#f4f4f5]">Listing Editor</h1>
        <p className="text-sm text-[#71717a] mt-1">SKU-20291 — Vintage Levi's 501 Denim Jacket</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Form */}
        <div className="lg:col-span-2 space-y-4">
          {/* Photos */}
          <div className="p-4.5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#18181b]">
            <div className="text-xs uppercase font-bold letter-spacing text-[#71717a] mb-3">Photos</div>
            <div className="grid grid-cols-3 gap-2.5">
              {[0, 1, 2, 3, 4, 5].map(i => (
                <div
                  key={i}
                  className={`aspect-square rounded-lg border-2 flex items-center justify-center cursor-pointer transition-all ${
                    i === 0
                      ? "border-[#6366f1] bg-[repeating-linear-gradient(45deg,_#27272a,_#27272a_5px,_#1f1f23_5px,_#1f1f23_10px)]"
                      : "border-dashed border-[rgba(255,255,255,0.08)] bg-[#1f1f23] hover:bg-[#27272a]"
                  }`}
                >
                  {i === 0 && (
                    <span className="absolute top-1 left-1 text-xs font-bold text-[#0a0a10] bg-[#818cf8] px-1 py-0.5 rounded-md font-mono">
                      PRIMARY
                    </span>
                  )}
                  <span className="text-xs text-[#71717a] font-mono">+ photo</span>
                </div>
              ))}
            </div>
          </div>

          {/* Title & Description */}
          <div className="p-4.5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#18181b] space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs uppercase font-bold letter-spacing text-[#71717a]">Title</label>
                <button className="flex items-center gap-1.5 text-xs font-bold text-[#818cf8] hover:text-[#a78bfa] transition-colors">
                  ✦ Generate with AI
                </button>
              </div>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] text-[#f4f4f5] text-sm font-medium focus:outline-none focus:border-[#6366f1]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs uppercase font-bold letter-spacing text-[#71717a]">Description</label>
                <button className="flex items-center gap-1.5 text-xs font-bold text-[#818cf8] hover:text-[#a78bfa] transition-colors">
                  ✦ Generate with AI
                </button>
              </div>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={5}
                className="w-full px-3 py-2.5 rounded-lg bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] text-[#a1a1aa] text-sm font-medium focus:outline-none focus:border-[#6366f1]"
              />
            </div>

            <div>
              <label className="text-xs uppercase font-bold letter-spacing text-[#71717a] mb-2 block">SEO Keywords</label>
              <div className="flex flex-wrap gap-2">
                {["vintage denim", "levi's 501", "trucker jacket", "y2k fashion", "unisex outerwear"].map(k => (
                  <span
                    key={k}
                    className="inline-flex px-3 py-1.5 rounded-full text-xs font-semibold text-[#818cf8] bg-[rgba(99,102,241,0.12)] border border-[rgba(99,102,241,0.28)]"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs uppercase font-bold letter-spacing text-[#71717a] mb-2 block">Category</label>
              <div className="flex items-center gap-2 h-9 px-3 rounded-lg bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] text-sm text-[#a1a1aa]">
                <span>Clothing</span>
                <span className="text-[#71717a]">›</span>
                <span>Men's</span>
                <span className="text-[#71717a]">›</span>
                <span className="text-[#f4f4f5] font-semibold">Jackets & Coats</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Price + Publish */}
        <div className="space-y-4">
          {/* AI Price Suggestion */}
          <div className="p-4.5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#18181b]">
            <label className="text-xs uppercase font-bold letter-spacing text-[#71717a] mb-3 block">AI Price Suggestion</label>

            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-xs text-[#71717a]">$</span>
              <input
                type="number"
                value={price}
                onChange={e => setPrice(Number(e.target.value))}
                className="bg-transparent border-none outline-none text-[2.5rem] font-black text-[#f4f4f5] font-mono p-0 w-28"
              />
            </div>

            <div className="text-xs font-semibold text-[#34d399] mb-3">Within suggested range — competitive</div>

            <div className="relative h-1.5 rounded-full bg-[#27272a] mb-1.5">
              <div
                className="absolute rounded-full bg-gradient-to-r from-[#818cf8] to-[#6366f1]"
                style={{ left: "22%", right: "30%", top: 0, bottom: 0 }}
              />
              <div
                className="absolute w-0.5 h-[0.375rem] -top-0.75 rounded bg-[#f4f4f5]"
                style={{ left: "48%" }}
              />
            </div>

            <div className="flex justify-between text-xs text-[#71717a] font-mono">
              <span>Low $98</span>
              <span>Median $124</span>
              <span>High $162</span>
            </div>
          </div>

          {/* Publish Targets */}
          <div className="p-4.5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#18181b]">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs uppercase font-bold letter-spacing text-[#71717a]">Publish Targets</label>
              <span className="text-xs text-[#71717a] font-mono">{targetCount}/6</span>
            </div>

            <div className="space-y-1.5">
              {MARKETPLACES.map(m => {
                const active = targets[m.id];
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleTarget(m.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                      active
                        ? "bg-[rgba(99,102,241,0.08)] border border-[rgba(99,102,241,0.35)]"
                        : "bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] hover:bg-[#27272a]"
                    }`}
                  >
                    <div
                      className="w-5.5 h-5.5 rounded-md flex items-center justify-center text-[0.6rem] font-black text-[#0a0a10] flex-shrink-0"
                      style={{ background: m.color }}
                    >
                      {m.mono}
                    </div>
                    <span className={`text-sm font-semibold flex-1 text-left ${active ? "text-[#f4f4f5]" : "text-[#a1a1aa]"}`}>
                      {m.name}
                    </span>
                    <div
                      className={`w-4 h-4 rounded-md border-1.5 flex items-center justify-center flex-shrink-0 ${
                        active
                          ? "border-[#6366f1] bg-[#6366f1]"
                          : "border-[#71717a]"
                      }`}
                    >
                      {active && <div className="w-1.5 h-1.5 bg-[#0a0a10] rounded-sm" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            <button className="w-full py-3 rounded-lg bg-gradient-to-br from-[#818cf8] to-[#4f46e5] text-white text-sm font-bold hover:from-[#a78bfa] hover:to-[#6366f1] transition-all">
              Publish to {targetCount} Marketplaces
            </button>
            <button className="w-full py-3 rounded-lg bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] text-[#a1a1aa] text-sm font-semibold hover:bg-[#27272a] transition-colors">
              Save Draft
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
