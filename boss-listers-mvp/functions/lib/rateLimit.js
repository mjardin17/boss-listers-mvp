// lib/rateLimit.js
// In-memory sliding-window rate limiter.
// Valid because this service mounts a Render disk and therefore runs as a
// single instance. If you ever remove the disk and scale horizontally,
// replace this with a Redis-backed limiter.

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX || 10);
const MAX_TRACKED_KEYS = 5_000;

/** key -> number[] of request timestamps */
const buckets = new Map();

/**
 * Prefer the authenticated Basic Auth user over IP: X-Forwarded-For is
 * client-controlled, and every /api/* route already requires credentials.
 */
function clientKey(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Basic ')) {
    try {
      const user = Buffer.from(header.slice(6), 'base64')
        .toString('utf8')
        .split(':')[0];
      if (user) return `user:${user}`;
    } catch {
      // fall through to IP
    }
  }
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded || '';
  const ip = raw.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  return `ip:${ip}`;
}

function sweep(now) {
  for (const [key, hits] of buckets) {
    const live = hits.filter((t) => now - t < WINDOW_MS);
    if (live.length) buckets.set(key, live);
    else buckets.delete(key);
  }
}

function checkRateLimit(req) {
  const now = Date.now();
  if (buckets.size > MAX_TRACKED_KEYS) sweep(now);

  const key = clientKey(req);
  const hits = (buckets.get(key) || []).filter((t) => now - t < WINDOW_MS);

  if (hits.length >= MAX_REQUESTS) {
    return {
      allowed: false,
      limit: MAX_REQUESTS,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((WINDOW_MS - (now - hits[0])) / 1000)),
    };
  }

  const updated = [...hits, now];
  buckets.set(key, updated);
  return {
    allowed: true,
    limit: MAX_REQUESTS,
    remaining: MAX_REQUESTS - updated.length,
    retryAfter: 0,
  };
}

/** Returns false and sends 429 when the caller is over budget. */
function enforceRateLimit(req, res) {
  const result = checkRateLimit(req);
  res.setHeader('X-RateLimit-Limit', String(result.limit));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));

  if (!result.allowed) {
    res.setHeader('Retry-After', String(result.retryAfter));
    res.status(429).json({
      ok: false,
      error: `Rate limit exceeded. Try again in ${result.retryAfter}s.`,
    });
    return false;
  }
  return true;
}

module.exports = { checkRateLimit, enforceRateLimit };
