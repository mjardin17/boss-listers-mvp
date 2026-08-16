// Mercari — (⚠️ partners only)
// STUB: No public US developer API. Integration restricted to approved partners.
// A Mercari Shops API exists (api.mercari-shops.com) but is Japan-focused.
export function availability() {
  return {
    ready: Boolean(process.env.MERCARI_ACCESS_TOKEN),
    note: 'Mercari does not maintain a public developer API in the US.',
  };
}

export async function createListing() {
  throw new Error('Mercari has no open listing API. Requires an approved partner agreement.');
}
