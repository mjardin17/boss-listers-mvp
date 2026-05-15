// lib/store.js
const fs = require("fs-extra");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "store.json");

fs.ensureDirSync(DATA_DIR);
if (!fs.existsSync(DB_PATH)) fs.writeJsonSync(DB_PATH, { listings: {} });

let memory = fs.readJsonSync(DB_PATH);

async function saveFile() {
  await fs.writeJson(DB_PATH, memory, { spaces: 2 });
}

async function saveListing(payload) {
  const id = uuidv4();
  const item = { id, createdAt: new Date().toISOString(), payload };
  memory.listings[id] = item;
  await saveFile();
  return item;
}

async function listListings(sessionId) {
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
  return memory.listings[id] || null;
}

async function deleteListing(id) {
  if (memory.listings[id]) {
    delete memory.listings[id];
    await saveFile();
    return true;
  }
  return false;
}

module.exports = { saveListing, listListings, getListing, deleteListing };
