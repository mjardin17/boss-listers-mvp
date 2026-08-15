"use client";

import { useEffect, useMemo, useState } from "react";
import { loadInventoryRepository, loadScanHistoryRepository } from "../../app/saas/repositories";
import type { InventoryRecord, ScanRecord } from "../../app/saas/schemas";
import { readUiSignals, subscribeUiSignals, emitUiSignal, type UiSignal } from "../../lib/realtime/uiSignalBus";
import { AIRecommendationPanel } from "./AIRecommendationPanel";
import { ExecutionTimeline } from "./ExecutionTimeline";
import { InventoryHealthPanel } from "./InventoryHealthPanel";
import { ListingQueue } from "./ListingQueue";
import { OpportunityFeed } from "./OpportunityFeed";
import { ProfitRadar } from "./ProfitRadar";
import { RelistSuggestions } from "./RelistSuggestions";
import { RiskCenter } from "./RiskCenter";
import { VelocityBoard } from "./VelocityBoard";
import { StoreHeatmapPanel } from "./StoreHeatmapPanel";
import { WhyThisScorePanel } from "./WhyThisScorePanel";
import { queueFromScan, type ExecutionQueueItem, type ExecutionStatus } from "./workflow";
import { LiveActivityFeed } from "../realtime/LiveActivityFeed";
import { VelocityTicker } from "../realtime/VelocityTicker";
import { MarketPulse } from "../realtime/MarketPulse";
import { InventoryTicker } from "../realtime/InventoryTicker";
import { ScanEventStream } from "../realtime/ScanEventStream";
import { OpportunityAlerts } from "../realtime/OpportunityAlerts";
import { ProfitHeatmap } from "../realtime/ProfitHeatmap";
import { LiveExecutionStatus } from "../realtime/LiveExecutionStatus";
import { applyOptimisticUpdate, commitOptimisticUpdate, rollbackOptimisticUpdate } from "../../lib/realtime/optimisticUpdates";

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

export function SourcingTerminal({ mode = "command-center" }: { mode?: string }) {
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [inventory, setInventory] = useState<InventoryRecord[]>([]);
  const [queue, setQueue] = useState<ExecutionQueueItem[]>([]);
  const [signals, setSignals] = useState<UiSignal[]>([]);

  useEffect(() => {
    let mounted = true;
    void Promise.all([loadScanHistoryRepository(), loadInventoryRepository()]).then(([nextScans, nextInventory]) => {
      if (!mounted) return;
      setScans(nextScans);
      setInventory(nextInventory);
      setQueue(loadQueue());
      setSignals(readUiSignals());
    });
    const unsubscribe = subscribeUiSignals((signal) => setSignals((current) => [signal, ...current].slice(0, 80)));
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  function upsertQueue(item: ExecutionQueueItem) {
    setQueue((current) => {
      const next = [item, ...current.filter((candidate) => candidate.id !== item.id)];
      saveQueue(next);
      emitUiSignal({
        type: "queue_updated",
        label: "Execution queued",
        detail: item.title,
        severity: "info",
        payload: { id: item.id, status: item.status }
      });
      return next;
    });
  }

  function queueScan(scan: ScanRecord) {
    upsertQueue(queueFromScan(scan));
  }

  function updateStatus(id: string, status: ExecutionStatus) {
    setQueue((current) => {
      const optimistic = applyOptimisticUpdate(
        current,
        current.map((item) =>
          item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item
        )
      );
      try {
        saveQueue(optimistic.optimistic);
        commitOptimisticUpdate(optimistic);
      } catch {
        return rollbackOptimisticUpdate(optimistic);
      }
      const next = current.map((item) =>
        item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item
      );
      emitUiSignal({
        type: status === "SYNCED" ? "sync_completed" : "queue_updated",
        label: `Execution ${status.toLowerCase()}`,
        detail: next.find((item) => item.id === id)?.title || id,
        severity: status === "FAILED" ? "danger" : status === "SYNCED" ? "success" : "info",
        payload: { id, status }
      });
      return next;
    });
  }

  const summary = useMemo(() => {
    const approved = queue.filter((item) => item.status === "APPROVED" || item.status === "PROCESSING").length;
    const risks = scans.filter((scan) => String(scan.listing.recommendation || "").toUpperCase().includes("RISK") || Number(scan.listing.confidenceScore || 0) < 40).length;
    const opportunities = scans.filter((scan) => Number(scan.listing.estimatedProfit ?? scan.listing.profitPotential) > 0).length;
    return { approved, risks, opportunities, queue: queue.length, inventory: inventory.length };
  }, [inventory.length, queue, scans]);

  const show = (name: string) => mode === "command-center" || mode === name;

  return (
    <main className="min-h-screen bg-zinc-950 px-4 pb-24 pt-6 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">Boss Listers OS</p>
          <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white">Execution Command Center</h1>
              <p className="mt-1 text-sm text-zinc-400">Human-approved sourcing, listing, inventory, and risk workflow.</p>
            </div>
            <div className="grid grid-cols-5 gap-2 text-center text-xs">
              <span className="rounded-md bg-zinc-950 px-3 py-2">Opp {summary.opportunities}</span>
              <span className="rounded-md bg-zinc-950 px-3 py-2">Risk {summary.risks}</span>
              <span className="rounded-md bg-zinc-950 px-3 py-2">Queue {summary.queue}</span>
              <span className="rounded-md bg-zinc-950 px-3 py-2">Approved {summary.approved}</span>
              <span className="rounded-md bg-zinc-950 px-3 py-2">Inv {summary.inventory}</span>
            </div>
          </div>
        </header>

        <ExecutionTimeline queue={queue} />
        <VelocityTicker scans={scans} />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-5 md:grid-cols-2">
            <MarketPulse scans={scans} />
            <OpportunityAlerts scans={scans} />
            <ProfitHeatmap scans={scans} />
            <ScanEventStream />
            <WhyThisScorePanel scans={scans} />
            <StoreHeatmapPanel scans={scans} inventory={inventory} />
          </div>
          <div className="flex flex-col gap-5">
            <LiveExecutionStatus queue={queue} events={signals} />
            <InventoryTicker inventory={inventory} />
            <LiveActivityFeed />
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <div className="flex flex-col gap-5">
            {show("sourcing") ? <OpportunityFeed scans={scans} onQueue={queueScan} /> : null}
            {show("opportunities") ? <ProfitRadar scans={scans} /> : null}
            {show("analytics") ? <VelocityBoard scans={scans} /> : null}
            {show("inventory") ? <InventoryHealthPanel inventory={inventory} /> : null}
            {show("risks") ? <RiskCenter scans={scans} onQueue={queueScan} /> : null}
          </div>
          <div className="flex flex-col gap-5">
            {show("execution") || show("listings") ? <ListingQueue queue={queue} onStatus={updateStatus} /> : null}
            {show("listings") ? <AIRecommendationPanel scans={scans} /> : null}
            {show("inventory") ? <RelistSuggestions inventory={inventory} onQueue={upsertQueue} /> : null}
          </div>
        </div>
      </div>
    </main>
  );
}
