"use client";

import type { ScanRecord } from "../../app/saas/schemas";
import { listingTitle, velocityOf } from "./workflow";

export function VelocityBoard({ scans }: { scans: ScanRecord[] }) {
  const movers = scans.filter((scan) => /FAST|HIGH|MODERATE|HEALTHY/i.test(String(velocityOf(scan.listing)))).slice(0, 8);
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-sky-300">Velocity Board</h2>
      <div className="mt-3 space-y-2">
        {movers.map((scan) => (
          <div key={scan.id} className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
            <p className="line-clamp-1 text-sm font-semibold text-white">{listingTitle(scan.listing)}</p>
            <p className="mt-1 text-xs text-sky-200">{velocityOf(scan.listing)} velocity</p>
          </div>
        ))}
        {!movers.length ? <p className="text-sm text-zinc-500">No fast movers detected yet.</p> : null}
      </div>
    </section>
  );
}
