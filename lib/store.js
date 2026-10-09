// lib/store.js
// NOTE: DATA_DIR (/var/data/store on Render) is not mounted during npm run build.
// All disk I/O is lazy-loaded on first request, not at module import time.
//
// Tenant scoping: every listing carries payload.tenantId. When a caller passes
// a tenantId, only listings owned by that tenant are visible or mutable
// (legacy rows with no tenantId are invisible to tenant-scoped callers).
// Callers that omit tenantId get the old unscoped behaviour, so route handlers
// MUST pass session.tenantId.

const fs = require("fs-extra");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "store.json");

let memory = null;
let initialized = false;

async function ensureInitialized() {
  if (initialized) return;
  await fs.ensureDir(DATA_DIR);
  if (!await fs.pathExists(DB_PATH)) {
    await fs.writeJson(DB_PATH, { listings: {} }, { spaces: 2 });
  }
  memory = await fs.readJson(DB_PATH);
  initialized = true;
}

async function saveFile() {
  await fs.writeJson(DB_PATH, memory, { spaces: 2 });
}

function ownedBy(item, tenantId) {
  if (tenantId === undefined || tenantId === null) return true;
  return Boolean(item) && Boolean(tenantId) && item.payload?.tenantId === tenantId;
}

function findListing(id) {
  return Object.prototype.hasOwnProperty.call(memory.listings, id) ? memory.listings[id] : null;
}

async function saveListing(payload) {
  await ensureInitialized();
  const id = uuidv4();
  const item = { id, createdAt: new Date().toISOString(), payload };
  memory.listings[id] = item;
  await saveFile();
  return item;
}

async function updateListing(id, payload, tenantId) {
  await ensureInitialized();
  const existing = findListing(id);
  if (!existing || !ownedBy(existing, tenantId)) return null;
  // An update can never move a listing to another tenant.
  const nextPayload = existing.payload?.tenantId
    ? { ...payload, tenantId: existing.payload.tenantId }
    : payload;
  const item = {
    ...existing,
    updatedAt: new Date().toISOString(),
    payload: nextPayload
  };
  memory.listings[id] = item;
  await saveFile();
  return item;
}

async function listListings(sessionId, tenantId) {
  await ensureInitialized();
  const all = Object.values(memory.listings || {}).filter((i) => ownedBy(i, tenantId));
  if (!sessionId) {
    return all.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
  }
  return all
    .filter(
      (i) =>
        (i.payload.sessionId ||
          i.payload.input?.sessionId ||
          "anon") === sessionId
    )
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getListing(id, tenantId) {
  await ensureInitialized();
  const item = findListing(id);
  return ownedBy(item, tenantId) ? item : null;
}

async function deleteListing(id, tenantId) {
  await ensureInitialized();
  const item = findListing(id);
  if (item && ownedBy(item, tenantId)) {
    delete memory.listings[id];
    await saveFile();
    return true;
  }
  return false;
}

module.exports = { saveListing, updateListing, listListings, getListing, deleteListing };
