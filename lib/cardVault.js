// lib/cardVault.js
// A local store for physical trading cards. It keeps what the owner has on hand and what is listed,
// and exports a feed of copies not yet listed for BossListers inventory. It never invents a price:
// valuation is a separate step that needs real evidence (see cardPricing.js).

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { emptyCardFields } = require("./cardFields");

const CONFIRMED = "confirmed";

function readFile(file) {
  if (!fs.existsSync(file)) return { version: 1, cards: [] };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new Error(`Card vault is corrupt: ${file}. It was left in place; fix or restore it by hand.`);
  }
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.cards)) {
    throw new Error(`Card vault has an unexpected shape: ${file}. It was left in place.`);
  }
  return parsed;
}

function writeFile(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function createVault(file) {
  const data = readFile(file);
  return { file, data };
}

function whole(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a whole number of 0 or more`);
  return value;
}

function storedPrice(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const num = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num * 100) / 100;
}

function getStoredSuggestedPrice(card) {
  if (!card || typeof card !== "object") return null;
  for (const key of ["suggestedPrice", "suggested_price", "sellerPrice", "seller_price", "price"]) {
    const val = storedPrice(card[key]);
    if (val !== null) return val;
  }
  if (Number.isInteger(card.seller_price_cents) && card.seller_price_cents > 0) {
    return Math.round(card.seller_price_cents) / 100;
  }
  return null;
}

function addCard(vault, input) {
  const onHand = whole(input.onHand ?? 1, "onHand");
  const listed = whole(input.listed ?? 0, "listed");
  if (listed > onHand) throw new Error("listed copies cannot exceed copies on hand");
  const fields = { ...emptyCardFields(), ...(input.fields || {}) };
  const status = fields.identificationStatus ?? null;
  const needsReview = !fields.set || status !== CONFIRMED;
  const card = {
    id: `card-${crypto.randomUUID()}`,
    frontImage: input.frontImage ?? null,
    backImage: input.backImage ?? null,
    fields,
    location: input.location ?? "Unassigned",
    onHand,
    listed,
    needsReview,
    createdAt: new Date().toISOString(),
  };
  if (input.suggestedPrice !== undefined && input.suggestedPrice !== null) {
    const price = storedPrice(input.suggestedPrice);
    if (price === null) throw new Error("suggestedPrice must be a positive number when provided");
    card.suggestedPrice = price;
  }
  vault.data.cards.push(card);
  writeFile(vault.file, vault.data);
  return card;
}

function listCards(vault, filter = {}) {
  return vault.data.cards.filter((card) => {
    if (filter.needsReview !== undefined && card.needsReview !== filter.needsReview) return false;
    if (filter.location !== undefined && card.location !== filter.location) return false;
    return true;
  });
}

function findCardWithPhoto(vault, cardId) {
  const cards = Array.isArray(vault) ? vault : (vault && vault.data && Array.isArray(vault.data.cards) ? vault.data.cards : []);
  const hasPhoto = (card) => Boolean(card && typeof card.frontImage === "string" && card.frontImage.trim().length > 0);
  if (cardId) {
    const match = cards.find((card) => card && (card.id === cardId || card.source_key === cardId));
    if (!match) throw new Error(`Card not found in vault: ${cardId}`);
    if (!hasPhoto(match)) throw new Error(`Card has no photo in vault: ${cardId}`);
    return match;
  }
  const first = cards.find(hasPhoto);
  if (!first) throw new Error("No vault card with a photo was found");
  return first;
}

function titleOf(fields) {
  const parts = [fields.year, fields.set, fields.player].filter(Boolean);
  const number = fields.cardNumber ? ` #${fields.cardNumber}` : "";
  return `${parts.join(" ")}${number}`.trim();
}

function exportFeed(vault) {
  return listCards(vault)
    .filter((card) => card.onHand - card.listed > 0)
    .map((card) => ({
      sku: card.id,
      title: titleOf(card.fields),
      quantity: card.onHand - card.listed,
      location: card.location,
      needsReview: card.needsReview,
    }));
}

module.exports = {
  createVault,
  addCard,
  listCards,
  exportFeed,
  findCardWithPhoto,
  getStoredSuggestedPrice,
  titleOf,
};
