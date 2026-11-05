const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createVault, addCard, listCards, exportFeed } = require("../lib/cardVault");

function tempVaultPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "card-vault-"));
  return { dir, file: path.join(dir, "vault.json") };
}

const identified = {
  sport: "baseball", player: "Ken Griffey Jr.", set: "Upper Deck", year: "1989",
  cardNumber: "1", identificationStatus: "confirmed",
};

test("adds a card with an id and saves it to disk", () => {
  const { file, dir } = tempVaultPath();
  try {
    const vault = createVault(file);
    const card = addCard(vault, { frontImage: "front.jpg", backImage: "back.jpg", fields: identified, location: "Binder A", onHand: 2 });
    assert.match(card.id, /^card-/);
    assert.equal(card.onHand, 2);
    assert.equal(card.listed, 0);
    assert.ok(fs.existsSync(file));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("rejects listed copies that exceed copies on hand", () => {
  const { file, dir } = tempVaultPath();
  try {
    const vault = createVault(file);
    assert.throws(() => addCard(vault, { fields: identified, onHand: 1, listed: 2 }), /listed/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("rejects a negative or fractional on-hand count", () => {
  const { file, dir } = tempVaultPath();
  try {
    const vault = createVault(file);
    assert.throws(() => addCard(vault, { fields: identified, onHand: -1 }), /onHand/);
    assert.throws(() => addCard(vault, { fields: identified, onHand: 1.5 }), /onHand/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a card with no set is flagged for review, never guessed", () => {
  const { file, dir } = tempVaultPath();
  try {
    const vault = createVault(file);
    const card = addCard(vault, { fields: { player: "Unknown" }, onHand: 1 });
    assert.equal(card.needsReview, true);
    assert.equal(listCards(vault, { needsReview: true }).length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the feed sends copies not yet listed, with a title built from the fields", () => {
  const { file, dir } = tempVaultPath();
  try {
    const vault = createVault(file);
    addCard(vault, { fields: identified, location: "Binder A", onHand: 3, listed: 1 });
    const [row] = exportFeed(vault);
    assert.equal(row.quantity, 2);
    assert.equal(row.location, "Binder A");
    assert.equal(row.title, "1989 Upper Deck Ken Griffey Jr. #1");
    assert.equal(row.price, undefined, "the feed never invents a price");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("reloads the same cards from disk", () => {
  const { file, dir } = tempVaultPath();
  try {
    addCard(createVault(file), { fields: identified, onHand: 1 });
    assert.equal(listCards(createVault(file)).length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a corrupt vault file is an error, not silently replaced", () => {
  const { file, dir } = tempVaultPath();
  try {
    fs.writeFileSync(file, "{ not json");
    assert.throws(() => createVault(file), /corrupt/i);
    assert.equal(fs.readFileSync(file, "utf8"), "{ not json", "the bad file is left in place");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
