// lib/store.js
// NOTE: DATA_DIR (/var/data/store on Render) is not mounted during npm run build.
// All disk I/O is lazy-loaded on first request, not at module import time.

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

async function saveListing(payload) {
  await ensureInitialized();
  const id = uuidv4();
  const item = { id, createdAt: new Date().toISOString(), payload };
  memory.listings[id] = item;
  await saveFile();
  return item;
}

async function updateListing(id, payload) {
  const existing = memory.listings[id];
  if (!existing) return null;
  const item = {
    ...existing,
    updatedAt: new Date().toISOString(),
    payload
  };
  memory.listings[id] = item;
  await saveFile();
  return item;
}

async function listListings(sessionId) {
  await ensureInitialized();
  const all = Object.values(memory.listings || {});
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

async function getListing(id) {
  await ensureInitialized();
  return memory.listings[id] || null;
}

async function deleteListing(id) {
  await ensureInitialized();
  if (memory.listings[id]) {
    delete memory.listings[id];
    await saveFile();
    return true;
  }
  return false;
}

module.exports = { saveListing, updateListing, listListings, getListing, deleteListing };
