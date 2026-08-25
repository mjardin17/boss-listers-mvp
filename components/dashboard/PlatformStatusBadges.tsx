"use client";

import type { InventoryRecord, PlatformListingStatus } from "../../app/saas/schemas";

const STATUS_CLASS: Record<string, string> = {
  Draft: "border-zinc-700 bg-zinc-950 text-zinc-300",
  Pending: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  Active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  Sold: "border-violet-500/30 bg-violet-500/10 text-violet-200",
  "Delist Required": "border-amber-500/30 bg-amber-500/10 text-amber-200",
  Failed: "border-red-500/30 bg-red-500/10 text-red-200",
  "Not Created": "border-zinc-700 bg-zinc-950 text-zinc-400",
  "Draft Ready": "border-zinc-700 bg-zinc-950 text-zinc-300",
  Delisted: "border-zinc-700 bg-zinc-950 text-zinc-400",
  Error: "border-red-500/30 bg-red-500/10 text-red-200"
};

function displayStatus(status: PlatformListingStatus) {
  if (status === "Not Created" || status === "Draft Ready") return "Draft";
  if (status === "Error") return "Failed";
  return status;
}

export function PlatformStatusBadges({ item }: { item: InventoryRecord }) {
  const platforms = [
    { label: "eBay", status: item.ebayStatus },
    { label: "Mercari", status: item.mercariStatus },
    { label: "Poshmark", status: item.poshmarkStatus }
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {platforms.map((platform) => {
        const status = displayStatus(platform.status);
        return (
          <span
            key={platform.label}
            className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-[11px] font-bold ${STATUS_CLASS[status] || STATUS_CLASS.Draft}`}
          >
            <span className="text-zinc-400">{platform.label}</span>
            {status}
          </span>
        );
      })}
    </div>
  );
}
