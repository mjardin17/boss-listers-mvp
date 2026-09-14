export type UiSignalType =
  | "scan_stage"
  | "scan_completed"
  | "scan_failed"
  | "opportunity_detected"
  | "risk_detected"
  | "queue_updated"
  | "inventory_updated"
  | "sync_completed"
  | "velocity_changed"
  | "demand_shifted";

export type UiSignal = {
  id: string;
  type: UiSignalType;
  label: string;
  detail?: string;
  severity?: "info" | "success" | "warning" | "danger";
  createdAt: string;
  payload?: unknown;
};

const EVENT_NAME = "boss-listers:ui-signal";
const STORAGE_KEY = "boss-listers.liveSignals.v1";

function makeSignal(input: Omit<UiSignal, "id" | "createdAt">): UiSignal {
  return {
    id: `${input.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...input
  };
}

export function readUiSignals(): UiSignal[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function emitUiSignal(input: Omit<UiSignal, "id" | "createdAt">) {
  if (typeof window === "undefined") return null;
  const signal = makeSignal(input);
  const next = [signal, ...readUiSignals()].slice(0, 80);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: signal }));
  return signal;
}

export function subscribeUiSignals(callback: (signal: UiSignal) => void) {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => callback((event as CustomEvent<UiSignal>).detail);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
