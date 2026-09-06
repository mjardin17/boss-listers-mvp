// lib/safeUuid.js
// crypto.randomUUID() only exists in a "secure context" — HTTPS, or the
// literal hostname "localhost". Opening the app via a LAN IP over plain
// HTTP (e.g. http://10.0.0.33:3001, how it's used from a phone) is NOT a
// secure context, so crypto.randomUUID silently doesn't exist there and
// every call site crashes with "crypto.randomUUID is not a function" —
// this broke the eBay/Etsy "Connect" buttons (pages/channels.js) and photo
// upload session IDs (pages/capture.js) specifically when used this way.
// This value only needs to be unique per browser tab/session, not
// cryptographically unguessable, so a Math.random-based fallback is fine.
export function safeRandomUUID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
