/**
 * Quantity sync planner: one unit count per SKU, shared by every channel.
 * Pure function, no network and no database, so it can be tested and previewed safely.
 *
 * How a sale is detected without order webhooks: each channel has a baseline (the count we
 * last set there). A channel showing LESS than its baseline sold the difference.
 *   new count = database count + (eBay live - eBay baseline) - (Shopify baseline - Shopify live)
 * eBay is the source of truth, so a higher eBay count is a restock. A higher Shopify count is
 * drift and is corrected. A listing that is no longer live on eBay goes to zero everywhere.
 *
 * Fails closed: an empty eBay read, or too many listings missing at once, blocks the plan.
 */

const MAX_GONE_FRACTION = 0.1; // more than this share missing from eBay at once = suspect read
const MIN_GONE_ALLOWED = 3;

const isCount = (n) => Number.isInteger(n) && n >= 0;

/**
 * @param {{ products: object[], ebay: Map<string, number>, shopify: Map<string, {qty:number,status:string}>,
 *           digitalSkus?: string[], maxGoneFraction?: number }} input
 *   products: rows with sku, ebay_listing_id, quantity, last_ebay_quantity, status, shopify_baseline
 * @returns {{ blocked: string|null, items: object[], skipped: object[], summary: object }}
 */
function planCounts({ products, ebay, shopify, digitalSkus = [], maxGoneFraction = MAX_GONE_FRACTION }) {
  const digital = new Set(digitalSkus.map((s) => String(s).toLowerCase()));
  const skipped = [];
  const counted = [];
  for (const p of products) {
    if (p.status !== "active" && p.status !== "out_of_stock") continue;
    if (digital.has(String(p.sku).toLowerCase())) { skipped.push({ sku: p.sku, why: "digital item, not counted" }); continue; }
    if (!p.ebay_listing_id) { skipped.push({ sku: p.sku, why: "no eBay listing id" }); continue; }
    counted.push(p);
  }

  const items = counted.map((p) => planOne(p, ebay, shopify));
  const gone = items.filter((i) => i.ebayGone).length;
  const allowed = Math.max(MIN_GONE_ALLOWED, Math.ceil(counted.length * maxGoneFraction));
  let blocked = null;
  if (counted.length && ebay.size === 0) blocked = "eBay returned no listings; refusing to zero the store";
  else if (gone > allowed) blocked = `${gone} of ${counted.length} listings are missing from eBay at once (limit ${allowed}); looks like a bad read`;

  return {
    blocked,
    items,
    skipped,
    summary: {
      counted: counted.length,
      changed: items.filter((i) => i.actions.length).length,
      gone,
      oversold: items.filter((i) => i.oversoldBy > 0).length,
      errors: items.filter((i) => i.error).length,
    },
  };
}

function planOne(p, ebay, shopify) {
  const dbQty = Number(p.quantity);
  const item = { sku: p.sku, ebayListingId: String(p.ebay_listing_id), dbQty, newQty: dbQty, ebayGone: false, oversoldBy: 0, actions: [], notes: [] };
  const ebayLive = ebay.get(item.ebayListingId);
  const shop = shopify.get(p.sku);
  const shopActive = Boolean(shop && shop.status === "ACTIVE");

  if (ebayLive !== undefined && !isCount(ebayLive)) return { ...item, error: `bad eBay count: ${ebayLive}` };
  if (shopActive && !isCount(shop.qty)) return { ...item, error: `bad Shopify count: ${shop.qty}` };
  if (!isCount(dbQty)) return { ...item, error: `bad database count: ${p.quantity}` };

  let shopSold = 0;
  if (shopActive) {
    const base = p.shopify_baseline;
    if (base === null || base === undefined) item.notes.push("no Shopify baseline yet: no sale inferred");
    else if (shop.qty < base) shopSold = base - shop.qty;
    else if (shop.qty > base) item.notes.push(`Shopify shows ${shop.qty}, baseline ${base}: drift, corrected`);
  }

  let raw;
  if (ebayLive === undefined) {
    item.ebayGone = true;
    item.notes.push("not live on eBay (sold out or ended)");
    raw = 0;
  } else {
    const ebayBase = isCount(p.last_ebay_quantity) ? p.last_ebay_quantity : dbQty;
    raw = dbQty + (ebayLive - ebayBase) - shopSold;
  }
  item.newQty = Math.max(0, raw);
  item.oversoldBy = raw < 0 ? -raw : 0;
  if (item.oversoldBy) item.notes.push(`OVERSOLD by ${item.oversoldBy}: more sold than existed`);
  item.ebaySold = ebayLive === undefined ? null : Math.max(0, (isCount(p.last_ebay_quantity) ? p.last_ebay_quantity : dbQty) - ebayLive);
  item.shopifySold = shopSold;

  if (item.newQty !== dbQty) item.actions.push({ channel: "db", set: item.newQty });
  if (!item.ebayGone && ebayLive !== item.newQty) {
    item.actions.push(item.newQty === 0 ? { channel: "ebay", set: 0, manual: "end the eBay listing" } : { channel: "ebay", set: item.newQty });
  }
  if (shopActive && shop.qty !== item.newQty) item.actions.push({ channel: "shopify", set: item.newQty, compare: shop.qty });
  return item;
}

/**
 * Says why a listing is missing from eBay's active list, from one eBay GetItem result.
 * "active" means eBay still lists it, so the list read missed it and nothing must be zeroed.
 * @param {object|undefined} item  the Item node of a Trading API GetItem response
 * @returns {"sold"|"ended"|"active"|"unknown"}
 */
function classifyEbayItem(item) {
  const status = item && item.SellingStatus && item.SellingStatus.ListingStatus;
  if (!status) return "unknown";
  if (status === "Active") return "active";
  const listed = Number(item.Quantity);
  const sold = Number(item.SellingStatus.QuantitySold || 0);
  return Number.isFinite(listed) && listed > 0 && sold >= listed ? "sold" : "ended";
}

/**
 * Decides what an unattended run may do with a plan.
 * It always may change the BossListers count. It may change eBay (lower a quantity, or end a
 * listing whose count reached zero) only when `ebayWrites` is on. Anything that is oversold,
 * has an error, or needs a change on any other site is held.
 * @param {{ blocked: string|null, items: object[] }} plan  from planCounts
 * @param {{ ebayWrites?: boolean }} [options]
 * @returns {{ blocked: string|null,
 *             apply: { sku: string, ebayListingId: string, from: number, to: number, needsEbayProof: boolean }[],
 *             ebay: { sku: string, ebayListingId: string, set: number, end: boolean }[],
 *             held: { sku: string, reason: string }[] }}
 */
function autoSteps(plan, { ebayWrites = false } = {}) {
  if (plan.blocked) return { blocked: plan.blocked, apply: [], ebay: [], held: [] };
  const apply = [];
  const ebay = [];
  const held = [];
  for (const item of plan.items) {
    if (item.error) { held.push({ sku: item.sku, reason: item.error }); continue; }
    if (item.newQty === item.dbQty && !item.actions.length) continue;
    if (item.oversoldBy > 0) { held.push({ sku: item.sku, reason: `sold ${item.oversoldBy} more than were in stock` }); continue; }
    const blocker = item.actions.find((a) => a.channel !== "db" && !(a.channel === "ebay" && ebayWrites));
    if (blocker) { held.push({ sku: item.sku, reason: blocker.manual ? `needs you to ${blocker.manual}` : `needs a change on ${blocker.channel}` }); continue; }
    if (item.newQty !== item.dbQty) {
      apply.push({ sku: item.sku, ebayListingId: item.ebayListingId, from: item.dbQty, to: item.newQty, needsEbayProof: Boolean(item.ebayGone) });
    }
    const ebayAction = item.actions.find((a) => a.channel === "ebay");
    if (ebayAction) ebay.push({ sku: item.sku, ebayListingId: item.ebayListingId, set: ebayAction.set, end: ebayAction.set === 0 });
  }
  return { blocked: null, apply, ebay, held };
}

module.exports = { planCounts, classifyEbayItem, autoSteps, MAX_GONE_FRACTION, MIN_GONE_ALLOWED };
