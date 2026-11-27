const WINDOW_MS = 60_000;
const MAX_REQUESTS = 12;
const buckets = new Map();

function enforceCardScanRateLimit(key) {
  const now = Date.now();
  if (buckets.size > 1000) {
    for (const [bucketKey, bucket] of buckets.entries()) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  current.count += 1;
  if (current.count > MAX_REQUESTS) {
    throw Object.assign(new Error("Too many card scans. Wait a minute and try again."), { status: 429 });
  }
}

module.exports = { enforceCardScanRateLimit };
