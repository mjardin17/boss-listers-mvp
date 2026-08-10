// middleware.js
// HTTP Basic Auth gate for all /api/* routes
// Fails closed: if env vars are missing, returns 503

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

export function middleware(request) {
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
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    const idx = decoded.indexOf(':');
    const username = idx === -1 ? decoded : decoded.slice(0, idx);
    const password = idx === -1 ? '' : decoded.slice(idx + 1);

    const expectedUser = Buffer.from(user);
    const expectedPass = Buffer.from(pass);
    const actualUser = Buffer.from(username);
    const actualPass = Buffer.from(password);

    if (
      expectedUser.length !== actualUser.length ||
      expectedPass.length !== actualPass.length ||
      !timingSafeEqual(expectedUser, actualUser) ||
      !timingSafeEqual(expectedPass, actualPass)
    ) {
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
