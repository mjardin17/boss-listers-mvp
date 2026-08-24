// lib/edgeAuth.js
// Constant-time auth comparison for Workers (no node:crypto available)

function constantTimeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = new TextEncoder().encode(a);
  const bufB = new TextEncoder().encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;

  let diff = 0;
  for (let i = 0; i < bufA.byteLength; i++) {
    diff |= bufA[i] ^ bufB[i];
  }
  return diff === 0;
}

function parseBasicAuth(authHeader) {
  if (!authHeader || !authHeader.startsWith('Basic ')) return null;
  try {
    const encoded = authHeader.slice(6);
    const decoded = atob(encoded);
    const [username, password] = decoded.split(':', 2);
    return { username, password };
  } catch {
    return null;
  }
}

function checkBasicAuth(authHeader, expectedUser, expectedPass) {
  const creds = parseBasicAuth(authHeader);
  if (!creds) return false;
  return constantTimeCompare(creds.username, expectedUser) &&
         constantTimeCompare(creds.password, expectedPass);
}

module.exports = { constantTimeCompare, parseBasicAuth, checkBasicAuth };
