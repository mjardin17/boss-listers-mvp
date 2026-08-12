// lib/supabaseListings.js
// Replaces lib/store.js - Supabase-backed listing storage
//
// Every function requires tenantId: listings are tenant-scoped data.
// This module uses the service-role REST client (bypasses RLS by design —
// see 0005/0007 migration notes), so tenant isolation is enforced HERE,
// in application code, not by the database. Callers (functions/api/*.js)
// get tenantId from context.data, set by functions/_middleware.js after
// verifying the caller's auth token. Never accept tenantId from the
// request body/query — it must come from the authenticated session.

const { rest } = require('./supabaseRest');

async function saveListing(env, tenantId, payload) {
  if (!tenantId) throw new Error('saveListing requires tenantId');
  const sessionId = payload.sessionId || payload.input?.sessionId || 'anon';
  const row = await rest(env, 'POST', '/listings', {
    tenant_id: tenantId,
    session_id: sessionId,
    input: payload.input || {},
    outputs: payload.outputs || [],
    image_paths: payload.imageUrls || [],
  });
  return {
    id: row[0]?.id,
    createdAt: row[0]?.created_at,
    payload,
  };
}

async function listListings(env, tenantId, sessionId) {
  if (!tenantId) throw new Error('listListings requires tenantId');
  const base = `/listings?tenant_id=eq.${encodeURIComponent(tenantId)}`;
  const query = sessionId
    ? `${base}&session_id=eq.${encodeURIComponent(sessionId)}&order=created_at.desc`
    : `${base}&order=created_at.desc`;

  const rows = await rest(env, 'GET', query);
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    payload: {
      sessionId: r.session_id,
      input: r.input,
      outputs: r.outputs,
      imageUrls: r.image_paths,
    },
  }));
}

async function getListing(env, tenantId, id) {
  if (!tenantId) throw new Error('getListing requires tenantId');
  const rows = await rest(
    env,
    'GET',
    `/listings?id=eq.${id}&tenant_id=eq.${encodeURIComponent(tenantId)}`,
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.id,
    createdAt: r.created_at,
    payload: {
      sessionId: r.session_id,
      input: r.input,
      outputs: r.outputs,
      imageUrls: r.image_paths,
    },
  };
}

async function deleteListing(env, tenantId, id) {
  if (!tenantId) throw new Error('deleteListing requires tenantId');
  const rows = await rest(
    env,
    'DELETE',
    `/listings?id=eq.${id}&tenant_id=eq.${encodeURIComponent(tenantId)}`,
    null,
  );
  return rows.length > 0;
}

module.exports = { saveListing, listListings, getListing, deleteListing };
