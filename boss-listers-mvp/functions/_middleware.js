// functions/_middleware.js
// Real auth gate: every /api/* request must carry a valid Supabase access
// token (Authorization: Bearer <token>) that resolves to a user who belongs
// to a tenant. Resolves tenantId/userId and attaches them to context.data
// so downstream functions/api/*.js handlers can scope every query.
//
// /api/health is exempt (liveness probe, no tenant data).
// Previously this file skipped auth entirely ("MVP: Skip auth for testing")
// — every /api/* route was unauthenticated in production. Fixed here as
// part of adding real multi-tenant auth.

import { resolveSession } from '../lib/supabaseAuth.js';

const PUBLIC_PATHS = new Set(['/api/health']);

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (!url.pathname.startsWith('/api/') || PUBLIC_PATHS.has(url.pathname)) {
    return next();
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Unauthorized — sign in required' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let session;
  try {
    session = await resolveSession(env, token);
  } catch (err) {
    console.error('[middleware] session resolve failed', err.message);
    return new Response(
      JSON.stringify({ ok: false, error: 'Auth check failed' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!session) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Invalid session or no tenant' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  context.data.userId = session.userId;
  context.data.tenantId = session.tenantId;
  context.data.role = session.role;
  context.data.accessToken = session.accessToken;

  return next();
}
