// Tracks access-gated platforms and their approval status.
// A 'gated' platform with no credentials shows the dev exactly how to apply.
import { PLATFORMS } from '../config/platforms.js';

export function gateStatus() {
  return Object.values(PLATFORMS)
    .filter((p) => p.access === 'gated')
    .map((p) => ({
      name: p.name,
      status: p.status,
      instructions: GATE_STEPS[p.name],
    }));
}

export const GATE_STEPS = {
  Whatnot:
    'Seller API is in Developer Preview and NOT accepting new applicants. ' +
    'Monitor developers.whatnot.com and join the waitlist. Build against the staging ' +
    'GraphQL playground (api.stage.whatnot.com/seller-api/graphql) once approved.',
  Depop:
    'Selling API is private. Email business@depop.com to request partner access, ' +
    'then use the OAuth2 flow + sandbox (simulate purchases for testing).',
  Mercari:
    'No public US developer API. US integration is restricted to approved partners ' +
    '(carriers, payments) under direct agreements. A Mercari Shops API exists in Japan.',
  'Facebook Marketplace':
    'Requires approval for the Meta Marketplace Partner Program. You need a Meta ' +
    'Business Manager account, then the Marketplace Partner Item API to ingest/update ' +
    'listings. Apply at facebook.com/business/marketplace-partners.',
};

export function isReady(name) {
  const p = PLATFORMS[name];
  if (!p) return false;
  return p.creds.every((c) => process.env[c]);
}
