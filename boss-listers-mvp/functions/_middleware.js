// functions/_middleware.js
// HTTP Basic Auth gate for all routes (except /api/health)

import { checkBasicAuth } from '../lib/edgeAuth.js';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Skip auth for health check
  if (url.pathname === '/api/health') {
    return context.next();
  }

  // All other routes require Basic Auth
  const authHeader = request.headers.get('Authorization');
  const user = env.APP_BASIC_AUTH_USER;
  const pass = env.APP_BASIC_AUTH_PASS;

  if (!user || !pass) {
    return new Response(JSON.stringify({ ok: false, error: 'Server not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!checkBasicAuth(authHeader, user, pass)) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Basic realm="Boss Listers"',
      },
    });
  }

  return context.next();
}
