import { appendRecord, listRecords } from "./localDatabase";

type CacheEntry<T = unknown> = {
  id: string;
  key: string;
  namespace: string;
  value: T;
  expiresAt: string;
  createdAt?: string;
  updatedAt?: string;
};

const TTL_MS: Record<string, number> = {
  upc_lookup: 1000 * 60 * 60 * 24 * 14,
  pricing_response: 1000 * 60 * 30,
  market_comps: 1000 * 60 * 20,
  listing_adaptation: 1000 * 60 * 60 * 24,
  platform_rules: 1000 * 60 * 60 * 24 * 30,
  shipping_profiles: 1000 * 60 * 60 * 24 * 30
};

function cacheId(namespace: string, key: string) {
  return `${namespace}:${key}`.toLowerCase().replace(/[^a-z0-9:_-]+/g, "-").slice(0, 180);
}

export async function getCachedValue<T>(namespace: keyof typeof TTL_MS | string, key: string): Promise<T | null> {
  if (!key) return null;
  const id = cacheId(namespace, key);
  const records = await listRecords<CacheEntry<T>>("cache");
  const found = records.find((entry) => entry.id === id);
  if (!found) return null;
  if (new Date(found.expiresAt).getTime() <= Date.now()) return null;
  return found.value;
}

export async function setCachedValue<T>(
  namespace: keyof typeof TTL_MS | string,
  key: string,
  value: T,
  ttlMs = TTL_MS[namespace] || 1000 * 60 * 15
) {
  if (!key) return null;
  return appendRecord<CacheEntry<T>>(
    "cache",
    {
      id: cacheId(namespace, key),
      key,
      namespace,
      value,
      expiresAt: new Date(Date.now() + ttlMs).toISOString()
    },
    { maxRecords: 1500 }
  );
}

export async function getOrSetCachedValue<T>(
  namespace: keyof typeof TTL_MS | string,
  key: string,
  loader: () => Promise<T>,
  ttlMs?: number
): Promise<T> {
  const cached = await getCachedValue<T>(namespace, key);
  if (cached != null) return cached;
  const value = await loader();
  if (value != null) await setCachedValue(namespace, key, value, ttlMs);
  return value;
}
