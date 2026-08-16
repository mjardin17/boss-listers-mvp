// Depop — Selling API (⚠️ partner-gated)
// STUB: private API, requires partner approval. Email business@depop.com.
export function availability() {
  return {
    ready: Boolean(process.env.DEPOP_OAUTH_CLIENT_ID),
    note: 'Depop Selling API is private; approved partners only.',
    docs: 'https://partnerapi.depop.com/api-docs',
  };
}

// Fill in once partner access is granted. Features: offers automation,
// order processing, shipping, sandbox environment.
export async function createListing(body, { accessToken } = {}) {
  const res = await fetch('https://partnerapi.depop.com/api/selling/listings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken || process.env.DEPOP_OAUTH_CLIENT_SECRET}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Depop error ${res.status}: ${await res.text()}`);
  return res.json();
}
