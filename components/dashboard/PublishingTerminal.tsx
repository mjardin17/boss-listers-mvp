"use client";

import { useEffect, useMemo, useState } from "react";
import { loadInventoryRepository, loadScanHistoryRepository } from "../../app/saas/repositories";
import type { InventoryRecord, ScanRecord } from "../../app/saas/schemas";
import { InventoryEventsTimeline } from "./InventoryEventsTimeline";
import { InventoryHealthPanel } from "./InventoryHealthPanel";
import { ListingQueue } from "./ListingQueue";
import { SpecialistBotsPanel } from "./SpecialistBotsPanel";
import { SyncJobsDashboard } from "./SyncJobsDashboard";
import {
  queueFromInventory,
  queueFromScan,
  type ExecutionQueueItem,
  type ExecutionStatus
} from "./workflow";

const QUEUE_KEY = "boss-listers.executionQueue.v1";

function loadQueue(): ExecutionQueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(QUEUE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: ExecutionQueueItem[]) {
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(0, 100)));
}

function publishingQueueFromInventory(inventory: InventoryRecord[]) {
  return inventory
    .filter((item) => item.status !== "Sold" && item.status !== "Archived")
    .map((item) => {
      const needsDelist =
        item.ebayStatus === "Delist Required" ||
        item.mercariStatus === "Delist Required" ||
        item.poshmarkStatus === "Delist Required";
      const failed =
        item.ebayStatus === "Failed" ||
        item.mercariStatus === "Failed" ||
        item.poshmarkStatus === "Failed" ||
        item.ebayStatus === "Error" ||
        item.mercariStatus === "Error" ||
        item.poshmarkStatus === "Error";
      const queueItem = queueFromInventory(item, needsDelist ? "DELIST" : "CREATE_LISTING");
      return {
        ...queueItem,
        status: failed ? "FAILED" : item.syncStatus === "pending" ? "PROCESSING" : queueItem.status,
        platform: "Inventory"
      } satisfies ExecutionQueueItem;
    });
}

export function PublishingTerminal({ mode = "publishing" }: { mode?: "publishing" | "inventory" | "execution" | "listings" }) {
  const [inventory, setInventory] = useState<InventoryRecord[]>([]);
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [queue, setQueue] = useState<ExecutionQueueItem[]>([]);

  useEffect(() => {
    let mounted = true;
    void Promise.all([loadInventoryRepository(), loadScanHistoryRepository()]).then(([nextInventory, nextScans]) => {
      if (!mounted) return;
      setInventory(nextInventory);
      setScans(nextScans);
      setQueue(loadQueue());
    });
    return () => {
      mounted = false;
    };
  }, []);

  const derivedQueue = useMemo(() => {
    const inventoryQueue = publishingQueueFromInventory(inventory);
    const scanQueue = scans.slice(0, 5).map((scan) => queueFromScan(scan));
    const merged = [...queue, ...inventoryQueue, ...scanQueue];
    const seen = new Set<string>();
    return merged.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [inventory, queue, scans]);

  function updateStatus(id: string, status: ExecutionStatus) {
    setQueue((current) => {
      const existing = derivedQueue.find((item) => item.id === id);
      const updated =
        current.some((item) => item.id === id)
          ? current.map((item) => (item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item))
          : existing
            ? [{ ...existing, status, updatedAt: new Date().toISOString() }, ...current]
            : current;
      saveQueue(updated);
      return updated;
    });
  }

  const showInventory = mode === "publishing" || mode === "inventory";
  const showQueue = mode === "publishing" || mode === "execution" || mode === "listings";

  return (
    <main className="min-h-screen bg-zinc-950 px-4 pb-24 pt-6 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">Boss Listers MVP Phase 2</p>
          <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white">Inventory Publishing Infrastructure</h1>
              <p className="mt-1 text-sm text-zinc-400">Queue status, inventory events, and marketplace publication readiness.</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <span className="rounded-md bg-zinc-950 px-3 py-2">Queue {derivedQueue.length}</span>
              <span className="rounded-md bg-zinc-950 px-3 py-2">Inv {inventory.length}</span>
              <span className="rounded-md bg-zinc-950 px-3 py-2">Live API off</span>
            </div>
          </div>
        </header>

        <SyncJobsDashboard queue={derivedQueue} />
        <SpecialistBotsPanel />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="flex flex-col gap-5">
            {showQueue ? <ListingQueue queue={derivedQueue} onStatus={updateStatus} /> : null}
            {showInventory ? <InventoryHealthPanel inventory={inventory} /> : null}
          </div>
          <InventoryEventsTimeline inventory={inventory} />
        </div>
      </div>
    </main>
  );
}
