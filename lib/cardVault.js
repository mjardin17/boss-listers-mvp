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

module.exports = { createVault, addCard, listCards, exportFeed };
