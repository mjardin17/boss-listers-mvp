// lib/supabaseListings.js
// Replaces lib/store.js - Supabase-backed listing storage

const { rest } = require('./supabaseRest');

async function saveListing(env, payload) {
  const sessionId = payload.sessionId || payload.input?.sessionId || 'anon';
  const row = await rest(env, 'POST', '/listings', {
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

async function listListings(env, sessionId) {
  const query = sessionId
    ? `/listings?session_id=eq.${encodeURIComponent(sessionId)}&order=created_at.desc`
    : '/listings?order=created_at.desc';

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

async function getListing(env, id) {
  const rows = await rest(env, 'GET', `/listings?id=eq.${id}`);
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

async function deleteListing(env, id) {
  const rows = await rest(env, 'DELETE', `/listings?id=eq.${id}`, null);
  return rows.length > 0;
}

module.exports = { saveListing, listListings, getListing, deleteListing };
