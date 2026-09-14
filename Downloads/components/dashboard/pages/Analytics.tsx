"use client";

const STATS = [
  { label: "Revenue (30d)", value: "$24,680", sub: "+18.2%", tone: "green" },
  { label: "Profit (30d)", value: "$9,412", sub: "+11.4%", tone: "green" },
  { label: "Sell-Through Rate", value: "38.2%", sub: "+3.1 pts", tone: "accent" },
  { label: "Avg. ROI", value: "184%", sub: "across all SKUs", tone: "gold" },
];

const BEST_PRODUCTS = [
  { name: "Herman Miller Aeron Chair", sold: 14, revenue: 4380 },
  { name: "Nikon F3 Camera Body", sold: 9, revenue: 2115 },
  { name: "Polaroid SX-70", sold: 11, revenue: 1848 },
  { name: "Sony WH-1000XM4", sold: 21, revenue: 3255 },
];

const SLOW_MOVERS = [
  { name: "Kilim Wool Runner Rug", days: 118 },
  { name: "Coach Crossbody — Tan", days: 96 },
  { name: "Ceramic Table Lamp Set", days: 84 },
];

const REVENUE_DATA = [32, 28, 41, 38, 52, 48, 61, 58, 70, 66, 78, 84];

export default function Analytics() {
  const maxRevenue = Math.max(...REVENUE_DATA);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#f4f4f5]">Analytics</h1>
        <p className="text-sm text-[#71717a] mt-1">Performance across every connected marketplace</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {STATS.map((stat, idx) => (
          <div key={idx} className="flex flex-col gap-2 p-4.5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#18181b]">
            <span className="text-xs uppercase font-bold letter-spacing text-[#71717a]">{stat.label}</span>
            <span className="text-2xl font-bold text-[#f4f4f5] font-mono letter-spacing">{stat.value}</span>
            <span className={`text-sm font-semibold ${
              stat.tone === "green" ? "text-[#34d399]" :
              stat.tone === "gold" ? "text-[#fbbf24]" :
              "text-[#818cf8]"
            }`}>
              {stat.sub}
            </span>
          </div>
        ))}
      </div>

      {/* Revenue Trend */}
      <div className="p-4.5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#18181b]">
        <div className="text-sm font-bold text-[#f4f4f5] mb-4">Revenue Trend — 12 Weeks</div>
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

      {/* Best Products + Slow Movers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Best Products */}
        <div className="p-4.5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#18181b]">
          <div className="text-sm font-bold text-[#f4f4f5] mb-4">Best Products</div>
          <div className="space-y-0">
            {BEST_PRODUCTS.map((product, idx) => (
              <div key={idx} className="flex items-center gap-3 py-2.5 border-b border-[rgba(255,255,255,0.08)] last:border-b-0">
                <div className="w-5.5 h-5.5 rounded-lg bg-[#27272a] flex items-center justify-center text-xs font-bold text-[#a1a1aa] flex-shrink-0">
                  {idx + 1}
                </div>
                <span className="text-sm font-semibold text-[#f4f4f5] flex-1 min-w-0">{product.name}</span>
                <span className="text-xs text-[#71717a] font-mono">{product.sold} sold</span>
                <span className="text-sm font-bold text-[#34d399] font-mono flex-shrink-0">${product.revenue}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Slow Movers */}
        <div className="p-4.5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#18181b]">
          <div className="text-sm font-bold text-[#f4f4f5] mb-4">Slow Movers</div>
          <div className="space-y-0">
            {SLOW_MOVERS.map((product, idx) => (
              <div key={idx} className="flex items-center gap-3 py-2.5 border-b border-[rgba(255,255,255,0.08)] last:border-b-0">
                <div className="w-2 h-2 rounded-full bg-[#fb7185] flex-shrink-0" />
                <span className="text-sm font-semibold text-[#f4f4f5] flex-1 min-w-0">{product.name}</span>
                <span className="text-xs text-[#71717a] font-mono">{product.days}d idle</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
