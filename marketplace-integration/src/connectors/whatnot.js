// Whatnot — Seller API (⚠️ waitlist)
// STUB: no access without Developer Preview approval.
// Shape documented from the GraphQL Seller API so it's ready to fill in.
const GQL = process.env.WHATNOT_GRAPHQL_URL || 'https://api.stage.whatnot.com/seller-api/graphql';

export function availability() {
  return {
    ready: Boolean(process.env.WHATNOT_API_KEY),
    note: 'Whatnot Seller API is in Developer Preview and not accepting new applicants.',
    docs: 'https://developers.whatnot.com',
  };
}

// Example mutation once approved (verify against current schema)
export async function createListing(vars, { accessToken } = {}) {
  const query = `mutation createListing($input: CreateListingInput!) {
    createListing(input: $input) { id productId status }
  }`;
  const res = await fetch(GQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken || process.env.WHATNOT_API_KEY}`,
    },
    body: JSON.stringify({ query, variables: { input: vars } }),
  });
  if (!res.ok) throw new Error(`Whatnot error ${res.status}: ${await res.text()}`);
  return res.json();
}
