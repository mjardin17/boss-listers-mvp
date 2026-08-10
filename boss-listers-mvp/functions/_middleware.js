// functions/_middleware.js
// Auth gate (optional for MVP)

export async function onRequest(context) {
  // MVP: Skip auth for testing. Enable Basic Auth later via env vars.
  return context.next();
}
