"use client";

import type { ScanRecord } from "../../app/saas/schemas";
import { listingTitle, velocityOf } from "../dashboard/workflow";

export function VelocityTicker({ scans }: { scans: ScanRecord[] }) {
  const rows = scans.slice(0, 8);
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
      <div className="flex gap-4 overflow-x-auto text-xs">
        {rows.map((scan) => (
          <span key={scan.id} className="shrink-0 text-zinc-300">
            <b className="text-sky-300">{velocityOf(scan.listing)}</b> {listingTitle(scan.listing).slice(0, 42)}
          </span>
        ))}
        {!rows.length ? <span className="text-zinc-500">Velocity ticker awaiting scans.</span> : null}
      </div>
    </div>
  );
}
