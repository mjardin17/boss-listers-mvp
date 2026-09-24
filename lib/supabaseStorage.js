// lib/supabaseStorage.js
// Supabase Storage operations for product photos.

const BUCKET = process.env.SUPABASE_BUCKET || "product-photos";

function assertConfigured() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
}

/** One-time setup — creates the public bucket if it doesn't exist yet.
 * Safe to call every time: a 409/"already exists" response is treated as
 * success, not an error. */
async function ensurePublicBucketExists() {
  assertConfigured();
  const headers = {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
  const res = await fetch(`${process.env.SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  if (res.ok) return { created: true };
  const body = await res.text();
  const alreadyExists = res.status === 400 && /already exists|Duplicate/i.test(body);
  if (!alreadyExists) {
    throw new Error(`Failed to create bucket "${BUCKET}": HTTP ${res.status} ${body}`);
  }
  // Bucket already existed (e.g. created by an earlier session) but may not
  // be public — found live 2026-08-31: it existed with public:false, which
  // silently made every uploaded image URL 404 with "Bucket not found"
  // even though the upload itself succeeded. Force it public every time.
  const patchRes = await fetch(`${process.env.SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ public: true }),
  });
  if (!patchRes.ok) {
    const patchBody = await patchRes.text();
    throw new Error(`Bucket "${BUCKET}" exists but could not be made public: HTTP ${patchRes.status} ${patchBody}`);
  }
  return { created: false, alreadyExists: true, madePublic: true };
}

/** Uploads a raw image buffer to the PUBLIC bucket and returns a real,
 * publicly-fetchable https:// URL — required by eBay (and every other
 * marketplace API), which pulls product images by URL from its own
 * servers and cannot see a local disk path or a LAN address. Also fixes
 * photos surviving a Render redeploy, since local disk there is wiped. */
async function uploadPublicImage(buffer, filename, contentType) {
  assertConfigured();
  const path = `uploads/${Date.now()}-${filename}`;
  const res = await fetch(
    `${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
    {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": contentType || "image/jpeg",
        "x-upsert": "true",
      },
      body: buffer,
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Image upload failed (HTTP ${res.status}): ${detail}`);
  }
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function createSignedUploadUrls(env, count) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase not configured');
  }

  const urls = [];
  for (let i = 0; i < count; i++) {
    const path = `product-photos/${crypto.randomUUID()}.jpg`;
    const url = `${env.SUPABASE_URL}/storage/v1/object/sign/${env.SUPABASE_BUCKET}/${path}?token_ttl=${env.UPLOAD_URL_TTL_SECONDS || 60}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    if (!res.ok) throw new Error(`Failed to create signed URL: ${res.status}`);
    const data = await res.json();
    urls.push({ path, signedUrl: data.signedURL });
  }
  return urls;
}

async function createSignedReadUrl(env, path, ttlSeconds = 600) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase not configured');
  }

  const url = `${env.SUPABASE_URL}/storage/v1/object/sign/${env.SUPABASE_BUCKET}/${path}?token_ttl=${ttlSeconds}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });

  if (!res.ok) throw new Error(`Failed to create signed URL: ${res.status}`);
  const data = await res.json();
  return data.signedURL;
}

async function fetchObjectAsBlob(env, path) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase not configured');
  }

  const url = `${env.SUPABASE_URL}/storage/v1/object/authenticated/${env.SUPABASE_BUCKET}/${path}`;
  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });

  if (!res.ok) throw new Error(`Failed to fetch object: ${res.status}`);
  return res.blob();
}

/** Given a URL that may be a localhost dev URL or a relative /uploads/ path,
 * resolves it to a publicly-fetchable Supabase Storage HTTPS URL by reading
 * the corresponding local file and uploading it. If the URL is already
 * public (https:// and not localhost), returns it unchanged.
 *
 * Best-effort: if the local file doesn't exist or upload fails, returns the
 * original URL rather than crashing the save. The caller can still proceed
 * with the local URL (which at least works for on-screen previews). */
async function ensurePublicUrl(url) {
  if (!url || typeof url !== "string") return url;

  // Already a public URL (not localhost) — nothing to do.
  if (/^https?:\/\//i.test(url) && !/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(url)) {
    return url;
  }

  // Extract the filename from either a full localhost URL or a relative path.
  // Examples:
  //   http://localhost:3001/uploads/1788198862494-abc.jpg  → uploads/1788198862494-abc.jpg
  //   /uploads/1788198862494-abc.jpg                       → uploads/1788198862494-abc.jpg
  let relativePath;
  try {
    if (/^https?:\/\//i.test(url)) {
      relativePath = new URL(url).pathname.replace(/^\//, "");
    } else {
      relativePath = url.replace(/^\//, "");
    }
  } catch {
    return url; // malformed URL — pass through
  }

  if (!relativePath.startsWith("uploads/")) return url;

  const path = require("path");
  const fs = require("fs").promises;
  const localFile = path.join(process.cwd(), "public", relativePath);

  let buffer;
  try {
    buffer = await fs.readFile(localFile);
  } catch {
    // File doesn't exist on disk (e.g. already deleted, or running on Render
    // where local uploads are wiped). Return original — can't fix what we
    // can't read.
    return url;
  }

  const filename = path.basename(relativePath);
  const ext = path.extname(filename).toLowerCase();
  const contentType =
    ext === ".png" ? "image/png" :
    ext === ".webp" ? "image/webp" :
    ext === ".gif" ? "image/gif" :
    "image/jpeg";

  try {
    await ensurePublicBucketExists();
    return await uploadPublicImage(buffer, filename, contentType);
  } catch {
    // Upload failed (Supabase down, bucket misconfigured, etc.) — return
    // original so the save doesn't crash.
    return url;
  }
}

module.exports = {
  ensurePublicBucketExists,
  uploadPublicImage,
  ensurePublicUrl,
  createSignedUploadUrls,
  createSignedReadUrl,
  fetchObjectAsBlob,
};
