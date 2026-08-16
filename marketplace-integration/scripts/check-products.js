import { platformMatrix } from '../src/config/platforms.js';
import * as ebay from '../src/connectors/ebay.js';
import * as etsy from '../src/connectors/etsy.js';
import * as facebook from '../src/connectors/facebook.js';

/**
 * Cross-platform status monitor.
 *
 *   node scripts/check-products.js --all
 *   node scripts/check-products.js --facebook
 *   node scripts/check-products.js --etsy
 *   node scripts/check-products.js --ebay
 */

const RUNNERS = {
  ebay: async () => {
    const r = await ebay.listInventory();
    return r.ok ? r.data : r.error;
  },
  etsy: async () => {
    return etsy.info.configured()
      ? 'Etsy configured; list endpoint requires shop id. See docs/02-auth-flows.md.'
      : 'Etsy not configured.';
  },
  facebook: async () => {
    return facebook.info.configured()
      ? 'Facebook configured; marketplace listings require approved-partner token.'
      : 'Facebook not configured.';
  },
};

const targets = process.argv.slice(2);
const all = targets.includes('--all');
const selected = Object.keys(RUNNERS).filter((k) => targets.includes(`--${k}`));

const toCheck = all ? Object.keys(RUNNERS) : selected;
if (toCheck.length === 0) {
  console.log('No platform selected. Use --all, --ebay, --etsy, --facebook.');
  process.exit(0);
}

console.log('\n=== Cross-platform listing status ===\n');
for (const id of toCheck) {
  try {
    const out = await RUNNERS[id]();
    console.log(`- ${id}: ${out}`);
  } catch (e) {
    console.log(`- ${id}: ERROR ${e.message}`);
  }
}
console.log('\nMatrix:');
for (const row of platformMatrix()) {
  console.log(`  ${row.id}: ${row.status} (${row.connectToday ? 'connect today' : 'gated'})`);
}
