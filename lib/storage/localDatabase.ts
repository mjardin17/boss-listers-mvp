import { readCollection, writeCollection } from "./persistenceAdapter";

export type StoredRecord<T = unknown> = T & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export function makeStorageId(prefix = "record") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function appendRecord<T extends Record<string, any>>(
  collection: string,
  record: T,
  { maxRecords = 500 }: { maxRecords?: number } = {}
) {
  const now = new Date().toISOString();
  const existing = await readCollection<StoredRecord<T>>(collection);
  const next = {
    id: String(record.id || makeStorageId(collection)),
    createdAt: String(record.createdAt || now),
    updatedAt: now,
    ...record
  } as StoredRecord<T>;
  const records = [next, ...existing.records.filter((item) => item.id !== next.id)].slice(0, maxRecords);
  await writeCollection(collection, records);
  return next;
}

export async function listRecords<T>(collection: string) {
  return (await readCollection<T>(collection)).records;
}
