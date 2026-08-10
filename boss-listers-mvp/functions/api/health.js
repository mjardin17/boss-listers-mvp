// functions/api/health.js
// Liveness check (no auth required, no dependency probes)

export async function onRequestGet() {
  return new Response(
    JSON.stringify({ ok: true, timestamp: new Date().toISOString() }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
