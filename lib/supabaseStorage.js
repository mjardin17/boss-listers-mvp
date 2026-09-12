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

module.exports = {
  ensurePublicBucketExists,
  uploadPublicImage,
  createSignedUploadUrls,
  createSignedReadUrl,
  fetchObjectAsBlob,
};
