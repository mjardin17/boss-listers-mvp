// middleware.js
// HTTP Basic Auth gate for all routes except _next static assets and health.
// Fails closed: if env vars are missing, returns 503.
//
// Runs on Next.js Edge Runtime, which does NOT support Node's `crypto` module
// (`timingSafeEqual` throws "The edge runtime does not support Node.js
// 'crypto' module" on every call — this previously made EVERY login attempt
// fail with "Invalid credentials" regardless of correct credentials, since
// the throw was silently caught and mapped to a 401). Fixed by comparing
// SHA-256 digests computed via Web Crypto's `crypto.subtle`, which IS
// available in the Edge Runtime and gives the same constant-time-compare
// property (fixed-length digest bytes, no early-exit on the raw secret).

import { NextResponse } from 'next/server';

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function middleware(request) {
  const user = process.env.APP_BASIC_AUTH_USER;
  const pass = process.env.APP_BASIC_AUTH_PASS;

  if (!user || !pass) {
    return NextResponse.json(
      { ok: false, error: 'Server not configured (missing credentials)' },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return new NextResponse(
      JSON.stringify({ ok: false, error: 'Unauthorized' }),
      {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Boss Listers"',
          'Content-Type': 'application/json',
        },
      }
    );
  }

  const [scheme, encoded] = authHeader.split(' ');
  if (scheme !== 'Basic' || !encoded) {
    return NextResponse.json(
      { ok: false, error: 'Invalid authorization header' },
      { status: 401 }
    );
  }

  try {
    const decoded = atob(encoded);
    const idx = decoded.indexOf(':');
    const username = idx === -1 ? decoded : decoded.slice(0, idx);
    const password = idx === -1 ? '' : decoded.slice(idx + 1);

    const [expectedUserHash, expectedPassHash, actualUserHash, actualPassHash] =
      await Promise.all([
        sha256Hex(user),
        sha256Hex(pass),
        sha256Hex(username),
        sha256Hex(password),
      ]);

    if (expectedUserHash !== actualUserHash || expectedPassHash !== actualPassHash) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: 'Invalid credentials' },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health).*)'],
};
