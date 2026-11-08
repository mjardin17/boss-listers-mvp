'use strict';

// Synthetic contract fixtures only. No inventory, credentials or real images.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { buildCardCommercial } = require('../lib/cardCommercial');

const ITEM = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ASSET = 'bl-private:asset:33333333-3333-4333-8333-333333333333';
function row(changes = {}) {
  return { itemId: ITEM, title: 'Synthetic Series Example #12', titleVerified: true,
    quantity: 2, needsReview: false, frontImage: ASSET, snapshotHash: 'a'.repeat(64), ...changes };
}
function rejectsRow(changes) {
  assert.throws(() => buildCardCommercial([row(changes)]), TypeError);
}
function deepFreeze(value) {
  Object.freeze(value);
  for (const nested of Object.values(value)) if (nested && typeof nested === 'object') deepFreeze(nested);
  return value;
}

test('valid approved selection yields exactly the neutral recovered scene structure', () => {
  assert.deepEqual(buildCardCommercial([row()]), {
    scenes: [
      { type: 'title', duration: 3, text: 'Collection Preview', product_images: [ASSET] },
      { type: 'product_showcase', duration: 4, caption: 'Synthetic Series Example #12', product_images: [ASSET], motion: '1' },
      { type: 'product_loop', duration: 3, caption: 'End of Collection Preview', product_images: [ASSET] },
    ],
    audio: { volume_levels: { music: 0.3 } },
  });
});

test('empty selection returns an honest empty result', () => {
  assert.deepEqual(buildCardCommercial([]), { scenes: [], audio: { volume_levels: { music: 0.3 } } });
});

test('selection must be an explicit dense bounded plain array', () => {
  for (const input of [undefined, null, {}, '', 1, new Set(), [null], [undefined], new Array(1), Array(51).fill(row())]) {
    assert.throws(() => buildCardCommercial(input), TypeError);
  }
  const extra = [row()]; extra.privateNote = 'must not leak';
  assert.throws(() => buildCardCommercial(extra), TypeError);
  const symbol = [row()]; symbol[Symbol('private')] = true;
  assert.throws(() => buildCardCommercial(symbol), TypeError);
  class Rows extends Array {}
  assert.throws(() => buildCardCommercial(new Rows(row())), TypeError);
});

test('fifty distinct rows are accepted; duplicate item identifiers are rejected', () => {
  const rows = Array.from({ length: 50 }, (_, index) => row({ itemId: `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111` }));
  assert.equal(buildCardCommercial(rows).scenes.length, 52);
  assert.throws(() => buildCardCommercial([row(), row()]), TypeError);
});

test('every row field is required', () => {
  for (const field of Object.keys(row())) {
    const input = row(); delete input[field];
    assert.throws(() => buildCardCommercial([input]), TypeError, field);
  }
});

test('item identifiers must be canonical nonnil UUIDs', () => {
  for (const itemId of ['', 'card-1', 42, null, '00000000-0000-0000-0000-000000000000', `${ITEM}/path`, ` ${ITEM}`, `${ITEM}\n`, 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA']) rejectsRow({ itemId });
});

test('title must be nonempty, bounded, canonical plain text', () => {
  for (const title of ['', ' ', ' padded', 'padded ', 'x'.repeat(161), 12, {}, null, 'line\nline', 'tab\ttext', 'hidden\u200btext', '\u202EExample', 'Ｆｕｌｌｗｉｄｔｈ']) rejectsRow({ title });
  assert.equal(buildCardCommercial([row({ title: 'Pokémon Synthetic Example #12' })]).scenes[1].caption, 'Pokémon Synthetic Example #12');
  assert.equal(buildCardCommercial([row({ title: 'x'.repeat(160) })]).scenes[1].caption.length, 160);
});

test('title approval is explicit, boolean and never inferred from needsReview', () => {
  for (const titleVerified of [false, undefined, null, 'true', 1]) rejectsRow({ titleVerified });
});

test('quantities must be positive safe integers without coercion', () => {
  for (const quantity of [0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, '2', true, null]) rejectsRow({ quantity });
  for (const quantity of [1, Number.MAX_SAFE_INTEGER]) assert.equal(buildCardCommercial([row({ quantity })]).scenes.length, 3);
});

test('needsReview must be exactly false', () => {
  for (const needsReview of [true, undefined, null, 0, 'false']) rejectsRow({ needsReview });
});

test('asset references must use the exact opaque private namespace', () => {
  for (const frontImage of ['', null, 1, {}, 'asset-1', 'bl-private:asset:not-a-uuid', 'bl-private:asset:00000000-0000-0000-0000-000000000000', `${ASSET}?token=private`, `${ASSET}#fragment`, `${ASSET}/file`, ` ${ASSET}`, `${ASSET}\n`]) rejectsRow({ frontImage });
});

test('public, executable, blob and data URLs are rejected as asset references', () => {
  for (const frontImage of ['https://example.invalid/photo.jpg', 'http://example.invalid/photo.jpg', '//example.invalid/photo.jpg', 'data:image/png;base64,AAAA', 'javascript:alert(1)', 'blob:https://example.invalid/id', 'ftp://example.invalid/photo.jpg']) rejectsRow({ frontImage });
});

test('filesystem paths and encoded traversal are rejected as asset references', () => {
  for (const frontImage of ['/private/photo.jpg', './photo.jpg', '../photo.jpg', 'photo.jpg', 'C:\\private\\photo.jpg', '\\\\host\\share\\photo.jpg', '~/photo.jpg', 'file:///private/photo.jpg', 'bl-private:asset:%2e%2e%2fsecret']) rejectsRow({ frontImage });
});

test('snapshot hashes must be exactly 64 lowercase hexadecimal characters', () => {
  for (const snapshotHash of ['', null, 123, 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), 'A'.repeat(64), 'a'.repeat(64) + '\n', 'sha256:' + 'a'.repeat(64)]) rejectsRow({ snapshotHash });
});

test('unknown fields including private metadata, pricing and valuations are rejected', () => {
  for (const key of ['sku', 'category', 'unitIds', 'tenantId', 'location', 'note', 'price', 'valuation', 'shippingCost', 'purchaseCost', 'sellerPrice', 'backImage', 'jobId']) rejectsRow({ [key]: 'not approved' });
  const input = row(); Object.defineProperty(input, '__proto__', { value: {}, enumerable: true });
  assert.throws(() => buildCardCommercial([input]), TypeError);
  const symbol = row(); symbol[Symbol('private')] = 'hidden';
  assert.throws(() => buildCardCommercial([symbol]), TypeError);
});

test('output is an allowlisted presentation, with no internal identifiers or inventory fields', () => {
  const output = buildCardCommercial([row({ quantity: 987654321 })]);
  const json = JSON.stringify(output);
  for (const secret of [ITEM, 'a'.repeat(64), '987654321']) assert.equal(json.includes(secret), false);
  for (const key of ['itemId', 'snapshotHash', 'titleVerified', 'quantity', 'needsReview', 'tenantId', 'location', 'price', 'valuation', 'shippingCost', 'purchaseCost']) assert.equal(json.includes(`"${key}"`), false);
  assert.equal(json.includes(ASSET), true, 'only the opaque presentation asset reference is retained');
});

test('authenticity, rarity, sealing and marketplace claims are rejected in titles', () => {
  for (const phrase of ['Rare', 'Rarity', 'Authentic', 'Authenticity verified', 'Genuine', 'Guaranteed', 'Certified authentic', 'Factory sealed', 'Factory-sealed', 'Factorysealed', 'Unopened', 'NIB', 'MIB', 'MOC', 'Mint', 'Limited edition', 'Exclusive', 'Chase', 'Treasure Hunt', 'Super Treasure Hunt', 'Listed', 'Live', 'Available on eBay', 'In stock', 'For sale', 'Buy now', 'Shop now', 'RÁRE', 'AUTHENTIC']) rejectsRow({ title: `Synthetic ${phrase} Example` });
});

test('monetary, purchase, shipping and valuation language is rejected in titles', () => {
  for (const phrase of ['$12', '€12', '£12', 'USD 12', '12 dollars', 'EUR 12', 'CAD 12', 'Price 12', 'Valuation 12', 'Market value 12', 'Purchase cost 12', 'Free shipping', 'Delivery fee 12', 'Worth 12', 'MSRP 12']) rejectsRow({ title: `Synthetic ${phrase}` });
});

test('titles cannot carry markup, scripts, links, executable or multiline content', () => {
  for (const title of ['<script>alert(1)</script>', '<img src=x>', '&lt;script&gt;', 'https://example.invalid', 'www.example.invalid', 'example.com', 'javascript:alert(1)', 'Example\u0000Text', 'Example\nText', '${process.env.SECRET}', '`code`']) rejectsRow({ title });
});

test('all rows are validated; invalid rows are not silently filtered out', () => {
  assert.throws(() => buildCardCommercial([row(), row({ itemId: OTHER, needsReview: true })]), TypeError);
});

test('identical input yields deeply equal output without mutation or retained state', () => {
  const rows = deepFreeze([row(), row({ itemId: OTHER, title: 'Second Synthetic Example' })]);
  const options = deepFreeze({ openingDuration: 2, showcaseDuration: 5, closingDuration: 2 });
  const before = JSON.stringify(rows);
  const first = buildCardCommercial(rows, options);
  assert.deepEqual(first, buildCardCommercial(rows, options));
  first.scenes[0].product_images.push('modified output');
  assert.equal(buildCardCommercial(rows, options).scenes[0].product_images.length, 1);
  assert.equal(JSON.stringify(rows), before);
});

test('showcase order follows the explicit selection order, without sorting or aggregation', () => {
  const rows = [row({ itemId: OTHER, title: 'Second Synthetic Example' }), row()];
  assert.deepEqual(buildCardCommercial(rows).scenes.filter(s => s.type === 'product_showcase').map(s => s.caption), rows.map(r => r.title));
});

test('durations accept only integer seconds between one and ten', () => {
  for (const duration of [1, 10]) {
    const result = buildCardCommercial([row()], { openingDuration: duration, showcaseDuration: duration, closingDuration: duration });
    assert.deepEqual(result.scenes.map(s => s.duration), [duration, duration, duration]);
  }
  for (const key of ['openingDuration', 'showcaseDuration', 'closingDuration']) {
    for (const value of [0, -1, 11, 1.5, '3', true, null, undefined, NaN, Infinity]) {
      assert.throws(() => buildCardCommercial([row()], { [key]: value }), TypeError);
    }
  }
});

test('options cannot supply arbitrary copy, media, prices or executable content', () => {
  for (const options of [null, [], 'text', { title: 'Listed now' }, { closing: 'Authentic' }, { price: 10 }, { images: ['https://example.invalid'] }, { html: '<script/>' }]) {
    assert.throws(() => buildCardCommercial([row()], options), TypeError);
  }
  assert.throws(() => buildCardCommercial([], { openingDuration: 0 }), TypeError);
});

test('accessors are rejected without executing user code in rows, arrays or options', () => {
  let reads = 0;
  const getter = () => { reads++; throw new Error('must not execute'); };
  const input = row(); Object.defineProperty(input, 'title', { get: getter, enumerable: true });
  assert.throws(() => buildCardCommercial([input]), TypeError);
  const rows = []; Object.defineProperty(rows, '0', { get: getter, enumerable: true });
  assert.throws(() => buildCardCommercial(rows), TypeError);
  const options = {}; Object.defineProperty(options, 'openingDuration', { get: getter, enumerable: true });
  assert.throws(() => buildCardCommercial([row()], options), TypeError);
  assert.equal(reads, 0);
});

test('custom prototypes and hidden fields are rejected; null-prototype data is accepted', () => {
  class Record { constructor() { Object.assign(this, row()); } }
  assert.throws(() => buildCardCommercial([new Record()]), TypeError);
  const hidden = row(); Object.defineProperty(hidden, 'title', { value: hidden.title, enumerable: false });
  assert.throws(() => buildCardCommercial([hidden]), TypeError);
  assert.equal(buildCardCommercial([Object.assign(Object.create(null), row())], Object.create(null)).scenes.length, 3);
});

test('validation errors do not echo rejected input or private metadata', () => {
  const sentinel = 'PRIVATE-SYNTHETIC-SENTINEL';
  assert.throws(() => buildCardCommercial([row({ privateNote: sentinel })]), error => error instanceof TypeError && !error.message.includes(sentinel));
  assert.throws(() => buildCardCommercial([row({ frontImage: '/private/' + sentinel })]), error => error instanceof TypeError && !error.message.includes(sentinel));
});

test('module has no imports and runs with filesystem, database, network, clock and randomness unavailable', () => {
  // The harness only reads this source. Evaluated production code receives no I/O capabilities.
  const source = readFileSync(require.resolve('../lib/cardCommercial'), 'utf8');
  assert.doesNotMatch(source, /\brequire\s*\(|\bimport\s*(?:\(|["'{*])/);
  const attempts = [];
  const denied = name => () => { attempts.push(name); throw new Error('Denied capability: ' + name); };
  const sandbox = { module: { exports: {} }, require: denied('require'), fetch: denied('fetch'),
    XMLHttpRequest: denied('XMLHttpRequest'), WebSocket: denied('WebSocket'), Worker: denied('Worker'),
    setTimeout: denied('setTimeout'), setInterval: denied('setInterval'), queueMicrotask: denied('queueMicrotask'),
    process: new Proxy({}, { get: denied('process') }),
    indexedDB: new Proxy({}, { get: denied('indexedDB') }),
    localStorage: new Proxy({}, { get: denied('localStorage') }),
    console: new Proxy({}, { get: denied('console') }),
    denied, inputJSON: JSON.stringify([row()]) };
  const result = vm.runInNewContext(`
    Math.random = denied('random');
    Date = new Proxy(function () {}, { apply: denied('clock'), construct: denied('clock'), get: denied('clock') });
    ${source}
    const input = JSON.parse(inputJSON);
    const one = module.exports.buildCardCommercial(input);
    const two = module.exports.buildCardCommercial(input);
    if (JSON.stringify(one) !== JSON.stringify(two)) throw new Error('Nondeterministic');
    module.exports.buildCardCommercial([]);
    try { module.exports.buildCardCommercial([{...input[0], price: 1}]); throw new Error('Accepted price'); }
    catch (error) { if (!(error instanceof TypeError)) throw error; }
    JSON.stringify(one);
  `, sandbox, { timeout: 1000, contextCodeGeneration: { strings: false, wasm: false } });
  assert.deepEqual(JSON.parse(result), buildCardCommercial([row()]));
  assert.deepEqual(attempts, []);
});


test('Phase 0 rejects audited confusables, currencies, claims and combining marks', () => {
  const titles = ['Synthetic R\u0430re Example','Synthetic Factory Se\u0430led Example',
    'Synthetic Example 20 SEK','Synthetic Example twenty bucks','Synthetic Scarce Example','\u0301',
    'Synthetic PSA 10','Synthetic graded card','Synthetic investment','Synthetic profit',
    'Synthetic pristine condition','Synthetic authenticated','Synthetic 12.50','Synthetic 12,50',
    'Synthetic R-A-R-E','Synthetic s e a l e d','Synthetic 20 NOK','Synthetic 10 pesos',
    'Synthetic 5 BTC','Synthetic 20 PLN','Synthetic 20USD','Synthetic 10kr','Synthetic R4RE','Synthetic S3aled','Synthetic factorysealed','Synthetic 新品',
    'Synthetic rаrе','Synthetic KExample','Synthetic A\u0301','1234'];
  for (const title of titles) rejectsRow({title});
});

test('Phase 0 preserves supported ordinary descriptive Latin titles', () => {
  for (const title of ['2024 Pokémon Pikachu #25','2023 Topps Baseball Player #12',
    'Pokémon Évoli #133','Synthetic Series Blue Example #7','Synthetic Example — Series 2']) {
    assert.equal(buildCardCommercial([row({title})]).scenes[1].caption,title);
  }
});

test('bound builder requires complete matching private manifest without leaking it', () => {
  const {buildBoundCardCommercial} = require('../lib/cardCommercial');
  const input = row(), binding = {...input,frontSha256:'b'.repeat(64),backSha256:'c'.repeat(64)};
  assert.deepEqual(buildBoundCardCommercial([input],[binding]),buildCardCommercial([input]));
  assert.throws(()=>buildBoundCardCommercial([input]),TypeError);
  assert.throws(()=>buildBoundCardCommercial([input],[]),TypeError);
  for (const patch of [{itemId:OTHER},{snapshotHash:'d'.repeat(64)},{frontImage:'bl-private:asset:'+OTHER},
    {title:'Another Example'},{quantity:3},{frontSha256:''},{backSha256:null},{privatePath:'/not-permitted'}]) {
    assert.throws(()=>buildBoundCardCommercial([input],[{...binding,...patch}]),TypeError);
  }
  const text=JSON.stringify(buildBoundCardCommercial([input],[binding]));
  for (const privateValue of [ITEM,input.snapshotHash,binding.frontSha256,binding.backSha256]) assert.equal(text.includes(privateValue),false);
});
