// lib/supabaseStorage.js
// Supabase Storage operations for product photos

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

module.exports = { createSignedUploadUrls, createSignedReadUrl, fetchObjectAsBlob };
