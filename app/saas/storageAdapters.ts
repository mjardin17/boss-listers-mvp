export type StorageAdapterName = "localStorage" | "cloud";

export type StorageAdapter = {
  name: StorageAdapterName;
  readCollection<T>(collectionKey: string): T[];
  writeCollection<T>(collectionKey: string, records: T[]): void;
  upsertRecord<T extends { id: string }>(collectionKey: string, record: T): T[];
  removeRecord<T extends { id: string }>(collectionKey: string, recordId: string): T[];
};

function canUseLocalStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function safeParseCollection<T>(value: string | null): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export const localStorageAdapter: StorageAdapter = {
  name: "localStorage",
  readCollection<T>(collectionKey: string) {
    if (!canUseLocalStorage()) return [];
    return safeParseCollection<T>(window.localStorage.getItem(collectionKey));
  },
  writeCollection<T>(collectionKey: string, records: T[]) {
    if (!canUseLocalStorage()) return;
    window.localStorage.setItem(collectionKey, JSON.stringify(records));
  },
  upsertRecord<T extends { id: string }>(collectionKey: string, record: T) {
    const records = this.readCollection(collectionKey) as T[];
    const nextRecords = records.some((item) => item.id === record.id)
      ? records.map((item) => (item.id === record.id ? record : item))
      : [record, ...records];
    this.writeCollection(collectionKey, nextRecords);
    return nextRecords;
  },
  removeRecord<T extends { id: string }>(collectionKey: string, recordId: string) {
    const records = this.readCollection(collectionKey) as T[];
    const nextRecords = records.filter((item) => item.id !== recordId);
    this.writeCollection(collectionKey, nextRecords);
    return nextRecords;
  }
};

export const cloudStorageAdapter: StorageAdapter = {
  name: "cloud",
  readCollection<T>() {
    // Placeholder only: cloud persistence is intentionally disabled until a provider is configured.
    console.info("Boss Listers cloud storage adapter is not connected yet.");
    return [] as T[];
  },
  writeCollection() {
    // No-op by design. Do not enable NEXT_PUBLIC_STORAGE_PROVIDER=cloud for the MVP local flow.
    console.info("Boss Listers cloud storage adapter write skipped; provider not connected.");
  },
  upsertRecord<T extends { id: string }>(_collectionKey: string, record: T) {
    // No-op by design. A real adapter should persist and then return the synced collection.
    console.info("Boss Listers cloud storage adapter upsert skipped; provider not connected.");
    return [record];
  },
  removeRecord<T extends { id: string }>() {
    // No-op by design. A real adapter should delete remotely and return the synced collection.
    console.info("Boss Listers cloud storage adapter remove skipped; provider not connected.");
    return [] as T[];
  }
};

export function getStorageAdapter() {
  const provider =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_STORAGE_PROVIDER : undefined;
  return provider === "cloud" ? cloudStorageAdapter : localStorageAdapter;
}
