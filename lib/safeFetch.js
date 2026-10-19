// lib/safeFetch.js
// SSRF-hardened HTTP(S) fetching for any URL that came from a user.
//
//   const { safeFetch } = require("./safeFetch");
//   const r = await safeFetch(url, { maxBytes: 10 * 1024 * 1024 });
//   // r = { status, headers, body (Buffer), finalUrl }
//
// Guarantees:
//   * https only (http opt-in via allowHttp), no embedded credentials, port 443 only
//   * every hostname is resolved and EVERY address must be public
//     (loopback, RFC1918, link-local/cloud-metadata, CGNAT/Tailscale, multicast,
//     reserved, IPv6 loopback/ULA/link-local, v4-mapped v6 are all rejected)
//   * the address is re-validated at connect time (custom `lookup`), so a DNS
//     rebinding answer cannot swap in a private IP after the pre-check
//   * redirects are followed manually, max 3 hops, each hop re-validated
//   * response body is capped (default 10MB) and decompression is capped too

const dns = require("dns");
const net = require("net");
const https = require("https");
const http = require("http");
const zlib = require("zlib");

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 20_000;
const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home.arpa"];

class UnsafeUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

// ---------- IP classification ----------

function ipv4ToInt(ip) {
  const p = ip.split(".").map(Number);
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}

// [base, prefixLength]
const BLOCKED_V4 = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT / Tailscale
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local incl. 169.254.169.254 metadata
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
].map(([base, bits]) => ({ base: ipv4ToInt(base), mask: bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0 }));

function isBlockedIPv4(ip) {
  const n = ipv4ToInt(ip);
  return BLOCKED_V4.some(({ base, mask }) => ((n & mask) >>> 0) === ((base & mask) >>> 0));
}

/** Expand any textual IPv6 address to 16 bytes, or null if unparseable. */
function parseIPv6(input) {
  let s = input.split("%")[0];
  let tail = null;
  const lastColon = s.lastIndexOf(":");
  if (s.includes(".")) {
    const v4 = s.slice(lastColon + 1);
    if (net.isIPv4(v4)) {
      const p = v4.split(".").map(Number);
      tail = [(p[0] << 8) | p[1], (p[2] << 8) | p[3]];
      s = s.slice(0, lastColon + 1) + "0:0";
    } else {
      return null;
    }
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 0) return null;
  const groups = halves.length === 1 ? head : [...head, ...Array(missing).fill("0"), ...rest];
  const words = groups.map((g) => parseInt(g, 16));
  if (words.some((w) => !Number.isInteger(w) || w < 0 || w > 0xffff)) return null;
  if (tail) {
    words[6] = tail[0];
    words[7] = tail[1];
  }
  const bytes = [];
  for (const w of words) bytes.push(w >> 8, w & 0xff);
  return bytes;
}

function isBlockedIPv6(ip) {
  const b = parseIPv6(ip);
  if (!b) return true; // fail closed
  const allZeroUntil = (n) => b.slice(0, n).every((x) => x === 0);
  // :: and ::1
  if (allZeroUntil(15) && (b[15] === 0 || b[15] === 1)) return true;
  // v4-mapped (::ffff:a.b.c.d) and v4-compatible (::a.b.c.d): judge the embedded v4
  if (allZeroUntil(10) && b[10] === 0xff && b[11] === 0xff) return isBlockedIPv4(b.slice(12).join("."));
  if (allZeroUntil(12)) return isBlockedIPv4(b.slice(12).join("."));
  // NAT64 64:ff9b::/96 - judge the embedded v4
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && b.slice(4, 12).every((x) => x === 0)) {
    return isBlockedIPv4(b.slice(12).join("."));
  }
  if ((b[0] & 0xfe) === 0xfc) return true; // fc00::/7 ULA
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // fe80::/10 link-local
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0xc0) return true; // fec0::/10 site-local
  if (b[0] === 0xff) return true; // multicast
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return true; // 2001:db8::/32 docs
  return false;
}

/** True when the textual IP must never be contacted. Unparseable input is blocked. */
function isBlockedIp(ip) {
  const family = net.isIP(ip);
  if (family === 4) return isBlockedIPv4(ip);
  if (family === 6) return isBlockedIPv6(ip);
  return true;
}

// ---------- URL / DNS validation ----------

function stripBrackets(host) {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

/**
 * Validate a user-supplied URL. Resolves DNS (all records) and throws
 * UnsafeUrlError unless the scheme, port and every resolved address are acceptable.
 * `lookup` is injectable for tests: async (hostname) => [{address, family}].
 * Returns { url: URL, addresses: string[] }.
 */
async function assertSafeUrl(input, options = {}) {
  const { allowHttp = false, lookup = (h) => dns.promises.lookup(h, { all: true }) } = options;

  let url;
  try {
    url = new URL(String(input));
  } catch {
    throw new UnsafeUrlError("Invalid URL");
  }
  const okProtocol = url.protocol === "https:" || (allowHttp && url.protocol === "http:");
  if (!okProtocol) throw new UnsafeUrlError("Only https URLs are allowed");
  if (url.username || url.password) throw new UnsafeUrlError("URLs with credentials are not allowed");
  const defaultPort = url.protocol === "https:" ? "443" : "80";
  if (url.port && url.port !== defaultPort) throw new UnsafeUrlError("Non-standard ports are not allowed");

  const host = stripBrackets(url.hostname).toLowerCase().replace(/\.$/, "");
  if (!host) throw new UnsafeUrlError("Invalid URL host");
  if (host === "localhost" || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new UnsafeUrlError("Host is not allowed");
  }

  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new UnsafeUrlError("Address is not allowed");
    return { url, addresses: [host] };
  }

  let records;
  try {
    records = await lookup(host);
  } catch {
    throw new UnsafeUrlError("Host could not be resolved");
  }
  const addresses = (Array.isArray(records) ? records : [records]).map((r) => r.address);
  if (addresses.length === 0) throw new UnsafeUrlError("Host could not be resolved");
  if (addresses.some(isBlockedIp)) throw new UnsafeUrlError("Host resolves to a non-public address");
  return { url, addresses };
}

/** net/tls `lookup` replacement that refuses non-public answers at connect time. */
function guardedLookup(hostname, options, callback) {
  const cb = typeof options === "function" ? options : callback;
  const opts = typeof options === "function" ? {} : options || {};
  dns.lookup(hostname, { all: true, family: opts.family || 0, verbatim: true }, (err, records) => {
    if (err) return cb(err);
    if (!records.length || records.some((r) => isBlockedIp(r.address))) {
      return cb(new UnsafeUrlError("Host resolves to a non-public address"));
    }
    if (opts.all) return cb(null, records);
    return cb(null, records[0].address, records[0].family);
  });
}

// ---------- fetching ----------

function decoderFor(encoding) {
  switch ((encoding || "").toLowerCase()) {
    case "gzip":
    case "x-gzip":
      return zlib.createGunzip();
    case "deflate":
      return zlib.createInflate();
    case "br":
      return zlib.createBrotliDecompress();
    default:
      return null;
  }
}

function requestOnce(url, { headers, timeoutMs, maxBytes, allowHttp }) {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "http:" && allowHttp ? http : https;
    const req = mod.request(
      url,
      {
        method: "GET",
        headers: { "Accept-Encoding": "gzip, deflate, br", ...headers },
        lookup: guardedLookup,
        agent: false,
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, headers: res.headers, body: Buffer.alloc(0) });
        }
        const declared = Number(res.headers["content-length"]);
        if (Number.isFinite(declared) && declared > maxBytes && !res.headers["content-encoding"]) {
          res.destroy();
          return reject(new UnsafeUrlError("Response too large"));
        }
        const decoder = decoderFor(res.headers["content-encoding"]);
        const stream = decoder ? res.pipe(decoder) : res;
        const chunks = [];
        let total = 0;
        let done = false;
        const fail = (err) => {
          if (done) return;
          done = true;
          req.destroy();
          reject(err);
        };
        stream.on("data", (chunk) => {
          total += chunk.length;
          if (total > maxBytes) return fail(new UnsafeUrlError("Response too large"));
          chunks.push(chunk);
        });
        stream.on("end", () => {
          if (done) return;
          done = true;
          resolve({ status, headers: res.headers, body: Buffer.concat(chunks) });
        });
        stream.on("error", fail);
        res.on("error", fail);
      }
    );
    // Idle timeout alone lets a slow-drip server hold the request open; also
    // enforce a total deadline for the whole request/response.
    req.setTimeout(timeoutMs, () => req.destroy(new Error("Request timed out")));
    const deadline = setTimeout(() => req.destroy(new Error("Request exceeded total time limit")), timeoutMs * 2);
    deadline.unref();
    req.on("close", () => clearTimeout(deadline));
    req.on("error", reject);
    req.end();
  });
}

/**
 * GET a user-supplied URL safely. Follows at most `maxRedirects` redirects,
 * re-validating each hop. Resolves to { status, headers, body, finalUrl }.
 * Throws UnsafeUrlError for anything that violates policy.
 */
async function safeFetch(input, options = {}) {
  const {
    headers = {},
    maxBytes = DEFAULT_MAX_BYTES,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    allowHttp = false,
    lookup,
  } = options;

  let current = String(input);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const { url } = await assertSafeUrl(current, { allowHttp, lookup });
    const res = await requestOnce(url, { headers, timeoutMs, maxBytes, allowHttp });
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      current = new URL(res.headers.location, url).toString();
      continue;
    }
    if (res.status >= 300 && res.status < 400) throw new UnsafeUrlError("Redirect without a location");
    return { status: res.status, headers: res.headers, body: res.body, finalUrl: url.toString() };
  }
  throw new UnsafeUrlError("Too many redirects");
}

module.exports = {
  safeFetch,
  assertSafeUrl,
  isBlockedIp,
  guardedLookup,
  UnsafeUrlError,
  DEFAULT_MAX_BYTES,
};
