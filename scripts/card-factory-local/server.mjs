import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { chmodSync, mkdirSync } from "node:fs";
import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const MAX_BODY_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IDENTIFICATION_BYTES = 64 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function json(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": payload.length,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(payload);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("Request body exceeds 10 MB.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.status = 400;
    throw error;
  }
}

function decodeImage(value, label) {
  if (!value || typeof value !== "object") {
    const error = new Error(`${label} image is required.`);
    error.status = 400;
    throw error;
  }
  const mediaType = String(value.mediaType || "").toLowerCase();
  if (!ALLOWED_TYPES.has(mediaType)) {
    const error = new Error(`${label} image must be JPEG, PNG, or WebP.`);
    error.status = 415;
    throw error;
  }
  const encoded = String(value.base64 || "");
  if (!encoded || encoded.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    const error = new Error(`${label} image is missing or exceeds 4 MB.`);
    error.status = 413;
    throw error;
  }
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) {
    const error = new Error(`${label} image is missing or exceeds 4 MB.`);
    error.status = 413;
    throw error;
  }
  const valid =
    (mediaType === "image/jpeg" && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (mediaType === "image/png" && bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ||
    (mediaType === "image/webp" && bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP");
  if (!valid) {
    const error = new Error(`${label} image content does not match its declared type.`);
    error.status = 415;
    throw error;
  }
  return { bytes, mediaType };
}

function openDatabase(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS staged_cards (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      title TEXT NOT NULL,
      identification_json TEXT NOT NULL,
      review_status TEXT NOT NULL CHECK (review_status IN ('confirmed_by_user', 'needs_review')),
      front_image_path TEXT NOT NULL,
      back_image_path TEXT,
      image_pair_sha256 TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(workspace_id, idempotency_key),
      UNIQUE(workspace_id, image_pair_sha256)
    );
    CREATE INDEX IF NOT EXISTS staged_cards_created_at_idx
      ON staged_cards(workspace_id, created_at DESC);
  `);
  return db;
}

function publicCard(row) {
  return {
    id: row.id,
    title: row.title,
    identification: JSON.parse(row.identification_json),
    reviewStatus: row.review_status,
    hasFrontImage: Boolean(row.front_image_path),
    hasBackImage: Boolean(row.back_image_path),
    createdAt: row.created_at,
    syncStatus: "local_only",
  };
}

export function createLocalCardFactoryServer({ dataDir, token, workspaceId }) {
  if (!dataDir || typeof dataDir !== "string") throw new Error("dataDir is required.");
  if (typeof token !== "string" || token.length < 32) throw new Error("A 32-character CARD_FACTORY_LOCAL_TOKEN is required.");
  if (typeof workspaceId !== "string" || !workspaceId.trim()) throw new Error("CARD_FACTORY_LOCAL_WORKSPACE_ID is required.");

  const root = path.resolve(dataDir);
  const imageDir = path.join(root, "images");
  const dbPath = path.join(root, "card-factory.sqlite");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  mkdirSync(imageDir, { recursive: true, mode: 0o700 });
  chmodSync(root, 0o700);
  chmodSync(imageDir, 0o700);
  const db = openDatabase(dbPath);
  chmodSync(dbPath, 0o600);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { ok: true, service: "bosslisters-card-factory-local" });
    }
    if (!safeEqual((req.headers.authorization || "").replace(/^Bearer\s+/i, ""), token)) {
      return json(res, 401, { ok: false, error: "Unauthorized" });
    }

    if (req.method === "GET" && url.pathname === "/api/cards") {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
      const rows = db.prepare(
        "SELECT * FROM staged_cards WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?"
      ).all(workspaceId, limit);
      return json(res, 200, { ok: true, cards: rows.map(publicCard), syncStatus: "local_only" });
    }

    if (req.method === "POST" && url.pathname === "/api/cards") {
      const writtenFiles = [];
      try {
        const body = await readJson(req);
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          return json(res, 400, { ok: false, error: "A JSON object is required." });
        }
        if (body.userConfirmed !== true) {
          return json(res, 422, { ok: false, error: "Confirm the card details before staging." });
        }
        const idempotencyKey = String(body.idempotencyKey || "").trim();
        if (!idempotencyKey || idempotencyKey.length > 128) {
          return json(res, 400, { ok: false, error: "A valid idempotencyKey is required." });
        }
        const title = String(body.title || "Trading Card").trim().slice(0, 200);
        if (!body.identification || typeof body.identification !== "object" || Array.isArray(body.identification)) {
          return json(res, 400, { ok: false, error: "Identification fields are required." });
        }
        const identificationJson = JSON.stringify(body.identification);
        if (Buffer.byteLength(identificationJson) > MAX_IDENTIFICATION_BYTES) {
          return json(res, 413, { ok: false, error: "Identification data exceeds 64 KB." });
        }
        const front = decodeImage(body.front, "Front");
        const back = body.back ? decodeImage(body.back, "Back") : null;
        const hash = createHash("sha256")
          .update(front.bytes).update(Buffer.from([0])).update(back?.bytes || Buffer.alloc(0))
          .digest("hex");

        const existingKey = db.prepare(
          "SELECT * FROM staged_cards WHERE workspace_id = ? AND idempotency_key = ?"
        ).get(workspaceId, idempotencyKey);
        if (existingKey) return json(res, 200, { ok: true, card: publicCard(existingKey), idempotentReplay: true });

        const duplicate = db.prepare(
          "SELECT id FROM staged_cards WHERE workspace_id = ? AND image_pair_sha256 = ?"
        ).get(workspaceId, hash);
        if (duplicate) return json(res, 409, { ok: false, error: "This exact photo pair is already staged.", duplicateId: duplicate.id });

        const id = randomBytes(16).toString("hex");
        const frontName = `${id}-front.${front.mediaType.split("/")[1] === "jpeg" ? "jpg" : front.mediaType.split("/")[1]}`;
        const backName = back ? `${id}-back.${back.mediaType.split("/")[1] === "jpeg" ? "jpg" : back.mediaType.split("/")[1]}` : null;
        const frontPath = path.join(imageDir, frontName);
        const backPath = backName ? path.join(imageDir, backName) : null;
        await writeFile(frontPath, front.bytes, { flag: "wx", mode: 0o600 });
        writtenFiles.push(frontPath);
        if (back && backPath) {
          await writeFile(backPath, back.bytes, { flag: "wx", mode: 0o600 });
          writtenFiles.push(backPath);
        }
        const createdAt = new Date().toISOString();
        try {
          db.prepare(`
            INSERT INTO staged_cards (
              id, workspace_id, title, identification_json, review_status,
              front_image_path, back_image_path, image_pair_sha256, idempotency_key, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id, workspaceId, title, identificationJson,
            body.reviewStatus === "needs_review" ? "needs_review" : "confirmed_by_user",
            frontPath, backPath, hash, idempotencyKey, createdAt
          );
        } catch (insertError) {
          if (!String(insertError.code || "").includes("CONSTRAINT")) throw insertError;
          const sameKey = db.prepare(
            "SELECT * FROM staged_cards WHERE workspace_id = ? AND idempotency_key = ?"
          ).get(workspaceId, idempotencyKey);
          if (sameKey) {
            for (const file of writtenFiles) await unlink(file).catch(() => {});
            writtenFiles.length = 0;
            return json(res, 200, { ok: true, card: publicCard(sameKey), idempotentReplay: true });
          }
          const samePhotos = db.prepare(
            "SELECT id FROM staged_cards WHERE workspace_id = ? AND image_pair_sha256 = ?"
          ).get(workspaceId, hash);
          if (samePhotos) {
            for (const file of writtenFiles) await unlink(file).catch(() => {});
            writtenFiles.length = 0;
            return json(res, 409, { ok: false, error: "This exact photo pair is already staged.", duplicateId: samePhotos.id });
          }
          throw insertError;
        }
        const row = db.prepare("SELECT * FROM staged_cards WHERE id = ?").get(id);
        return json(res, 201, { ok: true, card: publicCard(row), syncStatus: "local_only" });
      } catch (error) {
        for (const file of writtenFiles) await unlink(file).catch(() => {});
        const status = Number(error.status) || 500;
        return json(res, status, {
          ok: false,
          error: status >= 500 ? "Local staging failed. No cloud inventory was changed." : error.message,
        });
      }
    }
    return json(res, 404, { ok: false, error: "Not found" });
  });

  server.on("close", () => db.close());
  return server;
}

async function main() {
  const token = process.env.CARD_FACTORY_LOCAL_TOKEN || "";
  const workspaceId = process.env.CARD_FACTORY_LOCAL_WORKSPACE_ID || "";
  const dataDir = process.env.CARD_FACTORY_LOCAL_DATA_DIR || path.resolve("data/card-factory-local");
  const host = process.env.CARD_FACTORY_LOCAL_HOST || "127.0.0.1";
  const port = Number(process.env.CARD_FACTORY_LOCAL_PORT || 8787);
  if (host !== "127.0.0.1" && host !== "::1" && process.env.CARD_FACTORY_ALLOW_NON_LOOPBACK !== "true") {
    throw new Error("Non-loopback binding requires CARD_FACTORY_ALLOW_NON_LOOPBACK=true and a trusted HTTPS reverse proxy.");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("CARD_FACTORY_LOCAL_PORT must be 1–65535.");
  const server = createLocalCardFactoryServer({ dataDir, token, workspaceId });
  server.listen(port, host, () => {
    console.log(`Card Factory local service listening on ${host}:${port}; data remains on this machine.`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
