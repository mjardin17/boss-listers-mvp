"use client";

const MARKETPLACES = [
  { id: "ebay", name: "eBay", mono: "eB", color: "#3b82f6", status: "live", listings: 342, lastSync: "2m ago", future: false },
  { id: "facebook", name: "Facebook Marketplace", mono: "FB", color: "#4f7cff", status: "live", listings: 288, lastSync: "4m ago", future: false },
  { id: "mercari", name: "Mercari", mono: "Mc", color: "#f97364", status: "syncing", listings: 201, lastSync: "Syncing…", future: false },
  { id: "etsy", name: "Etsy", mono: "Et", color: "#f1641e", status: "live", listings: 96, lastSync: "11m ago", future: false },
  { id: "poshmark", name: "Poshmark", mono: "Po", color: "#c2185b", status: "error", listings: 154, lastSync: "Failed 1h ago", future: false },
  { id: "depop", name: "Depop", mono: "De", color: "#ff2300", status: "live", listings: 118, lastSync: "6m ago", future: false },
  { id: "amazon", name: "Amazon", mono: "Az", color: "#ff9900", status: "coming", listings: 0, lastSync: "—", future: true },
  { id: "shopify", name: "Shopify", mono: "Sh", color: "#95bf47", status: "coming", listings: 0, lastSync: "—", future: true },
];

export default function CrossPostingCenter() {
  const liveCount = MARKETPLACES.filter(m => m.status === "live").length;
  const totalListings = MARKETPLACES.reduce((a, m) => a + m.listings, 0);
  const health = Math.round((liveCount / MARKETPLACES.filter(m => !m.future).length) * 100);

  const getStatusInfo = (status: string) => {
    switch(status) {
      case "live": return { label: "Live syncing", color: "#34d399" };
      case "syncing": return { label: "Syncing…", color: "#fbbf24" };
      case "error": return { label: "Sync error", color: "#fb7185" };
      case "coming": return { label: "Coming soon", color: "#71717a" };
      default: return { label: "", color: "#71717a" };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#f4f4f5]">Cross-Posting Center</h1>
          <p className="text-sm text-[#71717a] mt-1">{liveCount} marketplaces connected · {totalListings} live listings</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-30 h-1.5 rounded-full bg-[#27272a] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#818cf8] to-[#34d399]"
              style={{ width: `${health}%` }}
            />
          </div>
          <span className="text-xs font-bold font-mono text-[#34d399] flex-shrink-0">{health}% Healthy</span>
        </div>
      </div>

      {/* Marketplace Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {MARKETPLACES.map(m => {
          const statusInfo = getStatusInfo(m.status);
          return (
            <div
              key={m.id}
              className={`p-4 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#18181b] flex flex-col gap-3 ${
                m.future ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-8.5 h-8.5 rounded-lg flex items-center justify-center text-sm font-black text-[#0a0a10] flex-shrink-0"
                  style={{ background: m.color }}
                >
                  {m.mono}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-[#f4f4f5]">{m.name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{
                        background: statusInfo.color,
                        animation: m.status === "syncing" ? "pulse 1.2s infinite" : "none",
                      }}
                    />
                    <span className="text-xs text-[#71717a] font-semibold">{statusInfo.label}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[rgba(255,255,255,0.08)]">
                <div>
                  <div className="text-lg font-black text-[#f4f4f5] font-mono">{m.listings}</div>
                  <div className="text-xs text-[#71717a] uppercase letter-spacing font-bold">listings</div>
                </div>
                <button
                  disabled={m.future}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    m.future
                      ? "text-[#71717a] bg-[#27272a] cursor-not-allowed"
                      : "text-[#f4f4f5] bg-[#27272a] hover:bg-[#1f1f23]"
                  }`}
                >
                  {m.future ? "Notify Me" : "Sync Now"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
