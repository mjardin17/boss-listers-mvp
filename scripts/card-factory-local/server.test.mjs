import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLocalCardFactoryServer } from "./server.mjs";

const TOKEN = "test-token-".padEnd(40, "x");
const PNG = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const image = { mediaType: "image/png", base64: PNG.toString("base64") };

async function fixture(t) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "bosslisters-card-factory-"));
  const server = createLocalCardFactoryServer({ dataDir, token: TOKEN, workspaceId: "test-workspace" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  });
  return { base, dataDir, server };
}

function payload(overrides = {}) {
  return {
    userConfirmed: true,
    idempotencyKey: "scan-001",
    title: "1999 Pokémon Oddish",
    identification: { player: "Oddish", year: 1999, set: "Base" },
    front: image,
    ...overrides,
  };
}

test("health is minimal and does not require authentication", async (t) => {
  const { base } = await fixture(t);
  const response = await fetch(`${base}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: "bosslisters-card-factory-local" });
});

test("staging requires bearer authentication and explicit confirmation", async (t) => {
  const { base } = await fixture(t);
  const denied = await fetch(`${base}/api/cards`);
  assert.equal(denied.status, 401);
  const unconfirmed = await fetch(`${base}/api/cards`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(payload({ userConfirmed: false })),
  });
  assert.equal(unconfirmed.status, 422);
});

test("stages locally, is idempotent, and lists no cloud sync", async (t) => {
  const { base } = await fixture(t);
  const send = () => fetch(`${base}/api/cards`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(payload()),
  });
  const first = await send();
  assert.equal(first.status, 201);
  const firstBody = await first.json();
  assert.equal(firstBody.syncStatus, "local_only");
  assert.equal(firstBody.card.reviewStatus, "confirmed_by_user");
  const replay = await send();
  assert.equal(replay.status, 200);
  const replayBody = await replay.json();
  assert.equal(replayBody.idempotentReplay, true);
  assert.equal(replayBody.card.id, firstBody.card.id);
  const list = await fetch(`${base}/api/cards`, { headers: { authorization: `Bearer ${TOKEN}` } });
  const listBody = await list.json();
  assert.equal(listBody.cards.length, 1);
  assert.equal(listBody.cards[0].syncStatus, "local_only");
});

test("rejects exact duplicate image pairs under a different idempotency key", async (t) => {
  const { base } = await fixture(t);
  const send = (idempotencyKey) => fetch(`${base}/api/cards`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(payload({ idempotencyKey })),
  });
  assert.equal((await send("one")).status, 201);
  const duplicate = await send("two");
  assert.equal(duplicate.status, 409);
  assert.ok((await duplicate.json()).duplicateId);
});

test("rejects mismatched image bytes and preserves needs_review", async (t) => {
  const { base } = await fixture(t);
  const bad = await fetch(`${base}/api/cards`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(payload({ front: { mediaType: "image/jpeg", base64: image.base64 } })),
  });
  assert.equal(bad.status, 415);

  const good = await fetch(`${base}/api/cards`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(payload({ idempotencyKey: "review", reviewStatus: "needs_review" })),
  });
  assert.equal(good.status, 201);
  assert.equal((await good.json()).card.reviewStatus, "needs_review");
});

test("staged records survive closing and reopening the local service", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "bosslisters-card-factory-persist-"));
  let server = createLocalCardFactoryServer({ dataDir, token: TOKEN, workspaceId: "persistent-workspace" });
  const listen = async () => {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${server.address().port}`;
  };
  const close = async () => new Promise((resolve) => server.close(resolve));
  t.after(async () => {
    if (server.listening) await close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const firstBase = await listen();
  const staged = await fetch(`${firstBase}/api/cards`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(payload({ idempotencyKey: "persist-me" })),
  });
  assert.equal(staged.status, 201);
  await close();

  server = createLocalCardFactoryServer({ dataDir, token: TOKEN, workspaceId: "persistent-workspace" });
  const secondBase = await listen();
  const listed = await fetch(`${secondBase}/api/cards`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  const body = await listed.json();
  assert.equal(body.cards.length, 1);
  assert.equal(body.cards[0].title, "1999 Pokémon Oddish");
});

test("workspace isolation prevents another workspace from listing staged cards", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "bosslisters-card-factory-isolation-"));
  let server = createLocalCardFactoryServer({ dataDir, token: TOKEN, workspaceId: "workspace-a" });
  const listen = async () => {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${server.address().port}`;
  };
  const close = async () => new Promise((resolve) => server.close(resolve));
  t.after(async () => {
    if (server.listening) await close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const firstBase = await listen();
  const staged = await fetch(`${firstBase}/api/cards`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(payload({ idempotencyKey: "workspace-a-card" })),
  });
  assert.equal(staged.status, 201);
  await close();

  server = createLocalCardFactoryServer({ dataDir, token: TOKEN, workspaceId: "workspace-b" });
  const secondBase = await listen();
  const listed = await fetch(`${secondBase}/api/cards`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  assert.deepEqual((await listed.json()).cards, []);
});
