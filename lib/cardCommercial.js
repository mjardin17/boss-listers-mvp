'use strict';

// Selectively adapted from mjardin17/boss-listers-mvp at
// e2e92b0bde78737bd9468b3c5ddb4d3b0dc3adaf, lib/cardCommercial.js.
// Retains deterministic opening/showcase/closing construction only.
// No vault, I/O, clock, randomness, authentication, rendering or publishing.
//
// CONTRACT (ordinary JSON-like data, not executable objects/Proxies):
// buildCardCommercial(rows, { openingDuration?, showcaseDuration?, closingDuration? })
// rows: at most 50 distinct items, each with EXACTLY these required fields:
//   itemId: canonical lowercase UUID (versions 1–8, RFC variant)
//   title: 1–160 characters of conservative, canonical plain text
//   titleVerified: true
//   quantity: positive safe integer
//   needsReview: false
//   frontImage: "bl-private:asset:<canonical UUID>" (opaque; never resolved here)
//   snapshotHash: 64 lowercase hexadecimal characters
// Durations: integer seconds in [1, 10]; defaults 3 / 4 / 3.
// Any invalid selection/options throw TypeError; no partial output or coercion.
// Output preserves selection order, includes only presentation text/asset refs,
// and never includes item IDs, snapshots, quantities, approval flags or costs.
// Empty rows return an empty scenes array with the same audio metadata shape.
// Audio volume is metadata only: no audio is generated or requested.
//
// TRUST BOUNDARY: flags/hash syntax cannot prove human review, ownership or
// freshness. A future authenticated adapter must establish those facts. Title
// screening is deliberately conservative English claim/monetary screening,
// not a universal semantic truth detector. Do not send raw model output here.

const UUID_SOURCE = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const UUID = new RegExp(`^${UUID_SOURCE}$`);
const PRIVATE_ASSET = new RegExp(`^bl-private:asset:${UUID_SOURCE}$`);
const SNAPSHOT = /^[0-9a-f]{64}$/;
// Deliberately narrow presentation contract: ASCII letters/digits plus NFC
// Latin accents that decompose to ASCII, and the punctuation below. Other
// scripts, compatibility characters and combining marks fail closed rather
// than trying to solve Unicode confusables or universal semantic moderation.
const TITLE_CHARACTERS = /^[A-Za-z0-9\u00c0-\u017f .,'’()#&+–—-]+$/u;
const LINK_TEXT = /\b[\p{L}\p{N}-]+\.[\p{L}]{2,}\b/u;
const CLAIMS = /\b(?:rare|rarer|rarest|rarity|scarce|scarcity|authentic|authenticity|authenticated|genuine|guarantee|guaranteed|certified|graded|grading|psa|bgs|sgc|cgc|hga|tag|gem|pristine|perfect|excellent|nm|vg|ex|unused|unplayed|unblemished|flawless|premium|near\s+mint|condition|new|used|damaged|investment|invest|profit|profitable|returns?|appreciation|sealed|factorysealed|unopened|nib|mib|moc|mint|limited|exclusive|chase|treasure\s+hunt|listed|listing|live|available|sale|selling|buy|shop|in\s+stock)\b/i;
const MONEY = /\b(?:price|prices|pricing|valuation|valuations|value|worth|cost|costs|purchase|shipping|delivery|fee|fees|msrp|rrp|asking|dollars?|euros?|pounds?|yen|usd|eur|gbp|cad|aud|nzd|jpy|cny|chf|inr|sek|nok|dkk|pln|czk|huf|ron|brl|mxn|zar|krw|hkd|sgd|twd|thb|idr|myr|php|rub|try|ils|aed|sar|ars|clp|cop|pkr|bdt|vnd|ngn|egp|uah|kes|ghs|bhd|kwd|qar|omr|bgn|isk|xau|xag|btc|eth|bucks?|cents?|pence|pennies|kron[ae]|kronor|pesos?|rupees?|yuan|won|baht|dirhams?|afn|all|amd|ang|aoa|awg|azn|bam|bbd|bif|bmd|bnd|bob|bsd|btn|bwp|byn|bzd|cdf|crc|cuc|cup|cve|djf|dop|dzd|ern|etb|fjd|fkp|gel|gip|gmd|gnf|gtq|gyd|hnl|htg|iqd|irr|jmd|jod|kgs|khr|kmf|kpw|kyd|kzt|lak|lbp|lkr|lrd|lsl|lyd|mad|mdl|mga|mkd|mmk|mnt|mop|mru|mur|mvr|mwk|mzn|nad|nio|npr|pab|pen|pgk|pyg|rsd|rwf|sbd|scr|sdg|shp|sle|sll|sos|srd|ssp|stn|svc|syp|szl|tjs|tmt|tnd|top|ttd|tzs|ugx|uyu|uzs|ves|vuv|wst|xaf|xcd|xof|xpf|yer|zmw|zwl|zwg|quid|francs?|dinars?|riyals?|rials?|roubles?|rubles?|lira|cash|cheap|bargain|discount|deal|free)\b/i;
const ROW_KEYS = ['itemId', 'title', 'titleVerified', 'quantity', 'needsReview', 'frontImage', 'snapshotHash'];
const DURATION_KEYS = ['openingDuration', 'showcaseDuration', 'closingDuration'];

function invalid(message) {
  // Never echo offending values, private fields, paths or user-supplied keys.
  throw new TypeError(`Invalid commercial input: ${message}`);
}

function strictRecord(value, allowedKeys, requiredKeys) {
  if (!value || typeof value !== 'object') invalid('expected a plain data object.');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid('expected a plain data object.');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  const result = Object.create(null);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (typeof key !== 'string' || !allowedKeys.includes(key) || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
      invalid('unknown fields, accessors and hidden fields are not allowed.');
    }
    result[key] = descriptor.value;
  }
  if (requiredKeys.some(key => !Object.hasOwn(result, key))) invalid('required fields are missing.');
  return result;
}

function selectionRows(rows) {
  if (!Array.isArray(rows) || Object.getPrototypeOf(rows) !== Array.prototype) invalid('selection must be a plain array.');
  const descriptors = Object.getOwnPropertyDescriptors(rows);
  const length = descriptors.length.value;
  if (length > 50 || Reflect.ownKeys(descriptors).length !== length + 1) invalid('selection must be dense, bounded and contain no extra fields.');
  const selected = [];
  for (let i = 0; i < length; i++) {
    const descriptor = descriptors[String(i)];
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) invalid('selection must contain data rows, not holes or accessors.');
    selected.push(descriptor.value);
  }
  return selected;
}

function validateRow(input) {
  const row = strictRecord(input, ROW_KEYS, ROW_KEYS);
  if (typeof row.itemId !== 'string' || !UUID.test(row.itemId)) invalid('itemId must be a canonical UUID.');
  if (typeof row.title !== 'string' || row.title.length < 1 || row.title.length > 160 ||
      row.title !== row.title.trim() || row.title !== row.title.normalize('NFKC') ||
      !TITLE_CHARACTERS.test(row.title) || LINK_TEXT.test(row.title)) {
    invalid('title must be bounded canonical plain text without markup or links.');
  }
  const screenedTitle = row.title.normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[’]/g, "'").replace(/[–—]/g, '-');
  if (!/^[A-Za-z0-9 .,'()#&+\-]+$/.test(screenedTitle) || !/[A-Za-z]/.test(screenedTitle) ||
      /\p{M}/u.test(row.title) || /\d[.,]\d|\b\d+[A-Za-z]{2,}\b|\b\d+\s*(?:k|m|kr)\b/i.test(screenedTitle)) {
    invalid('title uses unsupported Unicode or price-like notation.');
  }
  // Common separated-letter evasions; false positives intentionally fail closed.
  const compact = screenedTitle.toLowerCase().replace(/[^a-z0-9]/g, '')
    .replace(/[013457]/g, digit => ({0:'o',1:'i',3:'e',4:'a',5:'s',7:'t'})[digit]);
  if (['rare','scarce','sealed','unopened','authentic','treasurehunt','investment','twentybucks','oneofakind'].some(word => compact.includes(word))) {
    invalid('title contains unsupported claim language.');
  }
  if (CLAIMS.test(screenedTitle) || MONEY.test(screenedTitle)) invalid('titles cannot contain promotional claims or monetary language.');
  if (row.titleVerified !== true) invalid('title must be explicitly verified.');
  if (!Number.isSafeInteger(row.quantity) || row.quantity <= 0) invalid('quantity must be a positive safe integer.');
  if (row.needsReview !== false) invalid('review-required records are not approved.');
  if (typeof row.frontImage !== 'string' || !PRIVATE_ASSET.test(row.frontImage)) invalid('frontImage must be an opaque private asset reference.');
  if (typeof row.snapshotHash !== 'string' || !SNAPSHOT.test(row.snapshotHash)) invalid('snapshotHash must be lowercase SHA-256 hexadecimal.');
  return row;
}

function validateDurations(options) {
  const input = strictRecord(options, DURATION_KEYS, []);
  for (const key of Object.keys(input)) {
    if (!Number.isSafeInteger(input[key]) || input[key] < 1 || input[key] > 10) invalid('durations must be integer seconds from 1 to 10.');
  }
  return { openingDuration: 3, showcaseDuration: 4, closingDuration: 3, ...input };
}

function buildCardCommercial(rows, options = {}) {
  const durations = validateDurations(options);
  const approved = selectionRows(rows).map(validateRow);
  const seen = new Set();
  for (const row of approved) {
    if (seen.has(row.itemId)) invalid('duplicate item identifiers are not allowed.');
    seen.add(row.itemId);
  }
  const audio = { volume_levels: { music: 0.3 } };
  if (!approved.length) return { scenes: [], audio };
  const firstImage = approved[0].frontImage;
  const scenes = [{ type: 'title', duration: durations.openingDuration,
    text: 'Collection Preview', product_images: [firstImage] }];
  for (const row of approved) {
    scenes.push({ type: 'product_showcase', duration: durations.showcaseDuration,
      caption: row.title, product_images: [row.frontImage], motion: '1' });
  }
  scenes.push({ type: 'product_loop', duration: durations.closingDuration,
    caption: 'End of Collection Preview', product_images: [firstImage] });
  return { scenes, audio };
}

// Server-only handoff: require an explicit manifest, compare every authoritative
// presentation field immediately before constructing scenes. This checks data
// consistency, NOT cryptographic authenticity or future inventory freshness.
// The Node adapter verifies the content-bound asset and performs a fresh read.
function buildBoundCardCommercial(rows, manifest, options = {}) {
  const approved = selectionRows(rows).map(validateRow);
  const bindings = selectionRows(manifest);
  if (bindings.length !== approved.length) invalid('manifest selection mismatch.');
  const keys = [...ROW_KEYS, 'frontSha256', 'backSha256'];
  for (let i = 0; i < approved.length; i++) {
    const binding = strictRecord(bindings[i], keys, keys);
    if (typeof binding.frontSha256 !== 'string' || typeof binding.backSha256 !== 'string' ||
        !SNAPSHOT.test(binding.frontSha256) || !SNAPSHOT.test(binding.backSha256) ||
        ROW_KEYS.some(key => binding[key] !== approved[i][key])) invalid('manifest revision mismatch.');
  }
  return buildCardCommercial(approved, options);
}

module.exports = { buildCardCommercial, buildBoundCardCommercial };
