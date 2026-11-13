// lib/stockList.js
// Rules for the in-house stock list: everything Josh physically has, whether or not it is
// listed anywhere. Pure functions, no network and no database.
//
// The stage is worked out from the product itself, so it can never disagree with the stock
// count or with what is live on a selling site:
//   intake        something is still missing (name, price, photo, condition, quantity)
//   needs_review  complete, waiting for Josh
//   ready         Josh approved it; not listed anywhere yet
//   listed        live on a selling site
//   sold          none left
//   archived      ended
// A new item is saved as an unlisted draft: the store view and the stock sync both ignore drafts.

const STAGES = [
  { id: "intake", label: "Intake" },
  { id: "needs_review", label: "Needs review" },
  { id: "ready", label: "Ready" },
  { id: "listed", label: "Listed" },
  { id: "sold", label: "Sold" },
  { id: "archived", label: "Archived" },
];
const SKU_PREFIX = "IH-"; // in-house
const MAX_TITLE = 255;
const MAX_LOCATION = 80;
const MAX_CONDITION = 40;
const RE_APPROVE_FIELDS = ["title", "price", "condition", "quantity"];

const text = (v) => String(v ?? "").trim();
const isWholeCount = (n) => Number.isInteger(n) && n >= 0;

/** @returns {string[]} what is still missing before Josh can approve it, in plain words */
function missingForApproval(p) {
  const missing = [];
  if (!text(p.title)) missing.push("a name");
  if (!(Number(p.price) > 0)) missing.push("your price");
  if (!text(p.image_url)) missing.push("a photo");
  if (!text(p.condition)) missing.push("a condition");
  if (!(Number(p.quantity) >= 1)) missing.push("a quantity of 1 or more");
  return missing;
}

/** @returns {"intake"|"needs_review"|"ready"|"listed"|"sold"|"archived"} */
function stockStage(p) {
  if (p.status === "ended") return "archived";
  if (p.status === "out_of_stock") return "sold";
  if (p.status === "active") return "listed";
  if (missingForApproval(p).length) return "intake";
  return p.approved_at ? "ready" : "needs_review";
}

/**
 * Turns the Add form into a database row.
 * @param {{ title?: string, quantity?: number|string, price?: number|string, condition?: string, location?: string, description?: string }} input
 * @param {{ tenantId: string, now?: number }} context
 * @returns {{ ok: boolean, row?: object, error?: string }}
 */
function newItemRow(input, { tenantId, now = Date.now() }) {
  const title = text(input && input.title).slice(0, MAX_TITLE);
  if (!title) return { ok: false, error: "Give the item a name" };
  const quantity = Number(input.quantity ?? 1);
  if (!isWholeCount(quantity)) return { ok: false, error: "The quantity must be a whole number, 0 or more" };
  const price = input.price === undefined || input.price === null || input.price === "" ? 0 : Number(input.price);
  if (!Number.isFinite(price) || price < 0) return { ok: false, error: "The price must be a number, 0 or more" };
  return {
    ok: true,
    row: {
      tenant_id: tenantId,
      sku: `${SKU_PREFIX}${now.toString(36).toUpperCase()}`,
      title,
      description: text(input.description) || null,
      price,
      quantity,
      condition: text(input.condition).slice(0, MAX_CONDITION) || null,
      location: text(input.location).slice(0, MAX_LOCATION) || null,
      image_url: null,
      status: "draft",
      source: "manual",
      published: false,
      approved_at: null,
    },
  };
}

/**
 * Checks an edit and returns only the fields that may change.
 * Changing what Josh approved (name, price, condition, count) sends a ready item back for approval.
 * @returns {{ ok: boolean, changes?: object, error?: string }}
 */
function editableFields(current, input) {
  const changes = {};
  const stage = stockStage(current);
  if (input.title !== undefined) {
    const title = text(input.title).slice(0, MAX_TITLE);
    if (!title) return { ok: false, error: "The name cannot be empty" };
    changes.title = title;
  }
  if (input.price !== undefined) {
    const price = Number(input.price);
    if (input.price === "" || !Number.isFinite(price) || price < 0) return { ok: false, error: "The price must be a number, 0 or more" };
    changes.price = price;
  }
  if (input.quantity !== undefined) {
    if (stage === "listed" || stage === "sold") return { ok: false, error: "This item is on a selling site. Its count is kept by the automatic sync, so it cannot be typed in here." };
    const quantity = Number(input.quantity);
    if (input.quantity === "" || !isWholeCount(quantity)) return { ok: false, error: "The quantity must be a whole number, 0 or more" };
    changes.quantity = quantity;
  }
  if (input.condition !== undefined) changes.condition = text(input.condition).slice(0, MAX_CONDITION) || null;
  if (input.location !== undefined) changes.location = text(input.location).slice(0, MAX_LOCATION) || null;
  if (!Object.keys(changes).length) return { ok: false, error: "Nothing to change" };

  const approvedThingChanged = RE_APPROVE_FIELDS.some((f) => f in changes && String(changes[f] ?? "") !== String(current[f] ?? "") && Number(changes[f]) !== Number(current[f]));
  if (current.approved_at && approvedThingChanged) changes.approved_at = null;
  return { ok: true, changes };
}

const isDigital = (p, digitalSkus) => digitalSkus.some((s) => String(s).toLowerCase() === String(p.sku).toLowerCase());

/**
 * Items and units per stage. A digital item never runs out, so its count is not a real
 * number of units and is left out of the unit totals.
 * @returns {Record<string, { items: number, units: number }>}
 */
function summarize(products, { digitalSkus = [] } = {}) {
  const out = Object.fromEntries(STAGES.map((s) => [s.id, { items: 0, units: 0 }]));
  for (const p of products) {
    const stage = stockStage(p);
    const units = isDigital(p, digitalSkus) ? 0 : Number(p.quantity) || 0;
    out[stage] = { items: out[stage].items + 1, units: out[stage].units + units };
  }
  return out;
}

/** An in-house item that was put away can come back. An ended selling-site listing cannot. */
function canBringBack(p) {
  return stockStage(p) === "archived" && p.source === "manual" && !p.ebay_listing_id;
}

module.exports = { STAGES, stockStage, missingForApproval, newItemRow, editableFields, summarize, canBringBack, isDigital };
