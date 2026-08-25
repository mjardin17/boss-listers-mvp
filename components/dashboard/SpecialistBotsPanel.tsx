"use client";

import { useEffect, useMemo, useState } from "react";

type InventoryBotItem = {
  internalSku: string;
  title: string;
  status: "ACTION_REQUIRED" | "WATCH" | "HEALTHY" | string;
  score: number;
  blockedReasons: string[];
  nextActions: string[];
};

type PostingBotItem = {
  internalSku: string;
  status: "READY" | "PARTIAL_READY" | "BLOCKED" | string;
  score: number;
  totalDrafts: number;
  readyDraftCount: number;
  adapterBlockedCount: number;
  blockers: string[];
  nextActions: string[];
};

type SpecialistBotsSnapshot = {
  ok: boolean;
  generatedAt: string;
  summary: {
    inventoryActionRequired: number;
    postingBlocked: number;
    postingPartialReady: number;
  };
  inventorySync?: {
    summary: {
      itemsReviewed: number;
      actionRequiredCount: number;
      watchCount: number;
      healthyCount: number;
      averageHealthScore: number;
    };
    actionRequired: InventoryBotItem[];
    watch: InventoryBotItem[];
  } | null;
  multiPlatformPosting?: {
    summary: {
      listingsReviewed: number;
      readyCount: number;
      partialReadyCount: number;
      blockedCount: number;
      averagePostingScore: number;
    };
    blocked: PostingBotItem[];
    partialReady: PostingBotItem[];
  } | null;
};

function statusClass(status: string) {
  if (status === "ACTION_REQUIRED" || status === "BLOCKED") return "border-red-500/30 bg-red-500/10 text-red-200";
  if (status === "WATCH" || status === "PARTIAL_READY") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
}

function compactStatus(status: string) {
  return status.replace(/_/g, " ").toLowerCase();
}

function BotMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md bg-zinc-950 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
    </div>
  );
}

function InventoryItem({ item }: { item: InventoryBotItem }) {
  return (
    <article className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{item.title}</p>
          <p className="mt-1 text-xs text-zinc-500">{item.internalSku || "No SKU"}</p>
        </div>
        <span className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-bold ${statusClass(item.status)}`}>
          {compactStatus(item.status)}
        </span>
      </div>
      <p className="mt-2 text-xs text-zinc-400">{item.blockedReasons[0] || item.nextActions[0] || "No immediate action."}</p>
    </article>
  );
}

function PostingItem({ item }: { item: PostingBotItem }) {
  return (
    <article className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{item.internalSku || "Listing draft"}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {item.readyDraftCount}/{item.totalDrafts} drafts ready
          </p>
        </div>
        <span className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-bold ${statusClass(item.status)}`}>
          {compactStatus(item.status)}
        </span>
      </div>
      <p className="mt-2 text-xs text-zinc-400">{item.blockers[0] || item.nextActions[0] || "Ready for queue review."}</p>
    </article>
  );
}

export function SpecialistBotsPanel() {
  const [snapshot, setSnapshot] = useState<SpecialistBotsSnapshot | null>(null);
  const [status, setStatus] = useState("Loading bot monitors...");
  const [error, setError] = useState("");

  async function refresh() {
    setError("");
    setStatus("Refreshing bot monitors...");
    try {
      const response = await fetch("/api/specialist-bots?maxItems=12", { cache: "no-store" });
      const data = (await response.json()) as SpecialistBotsSnapshot & { error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Specialist bot monitor failed.");
      setSnapshot(data);
      setStatus(`Last check ${new Date(data.generatedAt).toLocaleTimeString()}`);
    } catch (nextError: any) {
      setError(nextError?.message || "Specialist bot monitor failed.");
      setStatus("");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const inventoryItems = useMemo(
    () => [...(snapshot?.inventorySync?.actionRequired || []), ...(snapshot?.inventorySync?.watch || [])].slice(0, 4),
    [snapshot]
  );
  const postingItems = useMemo(
    () => [...(snapshot?.multiPlatformPosting?.blocked || []), ...(snapshot?.multiPlatformPosting?.partialReady || [])].slice(0, 4),
    [snapshot]
  );

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">Specialist Bots</p>
          <h2 className="mt-1 text-lg font-black text-white">Inventory sync and cross-posting monitors</h2>
          <p className="mt-1 text-sm text-zinc-400">{status || error}</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="min-h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-xs font-black text-zinc-100 hover:border-emerald-300"
        >
          Refresh
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <BotMetric label="Inv action" value={snapshot?.inventorySync?.summary.actionRequiredCount ?? 0} />
        <BotMetric label="Inv score" value={snapshot?.inventorySync?.summary.averageHealthScore ?? 0} />
        <BotMetric label="Post partial" value={snapshot?.multiPlatformPosting?.summary.partialReadyCount ?? 0} />
        <BotMetric label="Post score" value={snapshot?.multiPlatformPosting?.summary.averagePostingScore ?? 0} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Inventory Sync Watch</h3>
          <div className="mt-2 space-y-2">
            {inventoryItems.map((item) => (
              <InventoryItem key={`${item.internalSku}-${item.title}`} item={item} />
            ))}
            {!inventoryItems.length ? <p className="text-sm text-zinc-500">No inventory sync issues reported.</p> : null}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Multi-Platform Posting</h3>
          <div className="mt-2 space-y-2">
            {postingItems.map((item) => (
              <PostingItem key={`${item.internalSku}-${item.status}`} item={item} />
            ))}
            {!postingItems.length ? <p className="text-sm text-zinc-500">No posting blockers reported.</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
