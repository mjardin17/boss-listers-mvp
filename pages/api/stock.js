// pages/api/stock.js
// The in-house stock list: everything Josh physically has, listed or not. Owner session only.
//   GET  → { items: [...with stage and what is missing], summary, stages }
//   POST → { action: "add" | "update" | "approve" | "unapprove" | "archive" | "photo", ... }
// Nothing here lists, posts or changes any selling site. The count of an item that is live on
// a selling site is kept by the automatic sync and cannot be typed in here.

const { loadEnvConfig } = require("@next/env");
const { requireOwnerSession } = require("../../lib/requireSession");
const { listStock, getStockItem, insertStockItem, updateStockItem } = require("../../lib/supabaseInventory");
const { uploadPublicImage } = require("../../lib/supabaseStorage");
const { STAGES, stockStage, missingForApproval, newItemRow, editableFields, summarize } = require("../../lib/stockList");

const SKU_RULE = /^[A-Za-z0-9._-]{1,80}$/;
const PHOTO_RULE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export const config = { api: { bodyParser: { sizeLimit: "12mb" } } };

const present = (p) => ({ ...p, stage: stockStage(p), missing: missingForApproval(p) });
const bad = (res, error, status = 400) => res.status(status).json({ ok: false, error });

async function savePhoto(sku, dataUrl) {
  const m = PHOTO_RULE.exec(String(dataUrl || ""));
  if (!m) return { error: "The photo must be a JPEG, PNG or WebP image" };
  const buffer = Buffer.from(m[2], "base64");
  if (!buffer.length || buffer.length > MAX_PHOTO_BYTES) return { error: "The photo is too large (8 MB at most)" };
  return { url: await uploadPublicImage(buffer, `${sku}.${PHOTO_EXT[m[1]]}`, m[1]) };
}

async function act(session, body) {
  const { action, sku } = body;
  if (action === "add") {
    const made = newItemRow(body, { tenantId: session.tenantId });
    if (!made.ok) return { status: 400, error: made.error };
    return { item: await insertStockItem(made.row) };
  }
  if (typeof sku !== "string" || !SKU_RULE.test(sku)) return { status: 400, error: "Choose an item" };
  const current = await getStockItem(session.tenantId, sku);
  if (!current) return { status: 404, error: "Item not found" };
  const stage = stockStage(current);

  let changes;
  if (action === "update") {
    const edit = editableFields(current, body.fields || {});
    if (!edit.ok) return { status: 400, error: edit.error };
    changes = edit.changes;
  } else if (action === "approve") {
    if (stage !== "needs_review") {
      const missing = missingForApproval(current);
      return { status: 400, error: missing.length ? `Still needs ${missing.join(", ")}` : "Only an item waiting for review can be approved" };
    }
    changes = { approved_at: new Date().toISOString() };
  } else if (action === "unapprove") {
    if (stage !== "ready") return { status: 400, error: "Only a ready item can be sent back for review" };
    changes = { approved_at: null };
  } else if (action === "archive") {
    if (stage === "listed") return { status: 400, error: "This item is live on a selling site. End the listing there first." };
    changes = { status: "ended", approved_at: null };
  } else if (action === "photo") {
    if (stage === "listed" || stage === "sold") return { status: 400, error: "The photo of a listed item is managed on its selling site" };
    const photo = await savePhoto(sku, body.photo);
    if (photo.error) return { status: 400, error: photo.error };
    changes = { image_url: photo.url, approved_at: null };
  } else {
    return { status: 400, error: "Unknown action" };
  }

  const saved = await updateStockItem(session.tenantId, sku, changes, current.updated_at);
  if (!saved) return { status: 409, error: "This item changed while you were editing it. Reload and try again." };
  return { item: saved };
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return bad(res, "Method not allowed", 405);
  }
  const session = await requireOwnerSession(req, res);
  if (!session) return;
  loadEnvConfig(process.cwd());

  try {
    if (req.method === "GET") {
      const products = await listStock(session.tenantId);
      return res.status(200).json({ ok: true, stages: STAGES, summary: summarize(products), items: products.map(present) });
    }
    const out = await act(session, req.body || {});
    if (out.error) return bad(res, out.error, out.status);
    return res.status(200).json({ ok: true, item: present(out.item) });
  } catch (err) {
    console.error("[api/stock]", err.message);
    return bad(res, req.method === "GET" ? "Your stock list could not be loaded right now" : "That could not be saved right now", err.statusCode && err.statusCode < 500 ? err.statusCode : 500);
  }
}
