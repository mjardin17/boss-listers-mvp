const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { listCommercials, resolveVideoAddress } = require("../lib/commercialFiles");

function tempDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "commercials-"));
  for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), Buffer.alloc(bytes, 1));
  return dir;
}
const ENV = { SUPABASE_URL: "https://proj.supabase.co" };

test("listCommercials: only .mp4 files, with size, newest first; a missing folder is an empty list", () => {
  const dir = tempDir({ "a_instagram_9_16.mp4": 10, "notes.txt": 5, "b_facebook_1_1.mp4": 20 });
  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(path.join(dir, "a_instagram_9_16.mp4"), old, old);
  const list = listCommercials(dir);
  assert.deepStrictEqual(list.map((f) => [f.name, f.bytes]), [["b_facebook_1_1.mp4", 20], ["a_instagram_9_16.mp4", 10]]);
  assert.deepStrictEqual(listCommercials(path.join(dir, "nope")), []);
});

test("a public video address is passed straight through, with no upload", async () => {
  let uploads = 0;
  const out = await resolveVideoAddress({ videoUrl: "https://cdn.example.com/v.mp4" }, { live: true, env: ENV, upload: async () => { uploads++; } });
  assert.deepStrictEqual(out, { ok: true, videoUrl: "https://cdn.example.com/v.mp4", uploaded: false });
  assert.strictEqual(uploads, 0);
});

test("preview of a commercial file: checks the file, uploads nothing, says it would upload", async () => {
  const dir = tempDir({ "item_instagram_9_16.mp4": 2048 });
  let uploads = 0;
  const out = await resolveVideoAddress({ commercial: "item_instagram_9_16.mp4" }, { live: false, dir, env: ENV, upload: async () => { uploads++; } });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.uploaded, false);
  assert.strictEqual(out.wouldUpload, true);
  assert.strictEqual(out.bytes, 2048);
  assert.match(out.videoUrl, /^https:\/\/proj\.supabase\.co\/storage\/v1\/object\/public\//);
  assert.strictEqual(uploads, 0);
});

test("live with a commercial file: uploads it as video/mp4 and uses the returned public address", async () => {
  const dir = tempDir({ "item.mp4": 64 });
  const seen = [];
  const upload = async (buffer, name, type) => { seen.push([buffer.length, name, type]); return "https://proj.supabase.co/storage/v1/object/public/product-photos/uploads/1-item.mp4"; };
  const out = await resolveVideoAddress({ commercial: "item.mp4" }, { live: true, dir, env: ENV, upload });
  assert.deepStrictEqual(out, { ok: true, videoUrl: "https://proj.supabase.co/storage/v1/object/public/product-photos/uploads/1-item.mp4", uploaded: true, bytes: 64 });
  assert.deepStrictEqual(seen, [[64, "item.mp4", "video/mp4"]]);
});

test("a file name that could leave the commercials folder is refused", async () => {
  const dir = tempDir({ "ok.mp4": 1 });
  for (const bad of ["../ok.mp4", "..\\ok.mp4", "/etc/passwd", "a/b.mp4", "ok.mp4/..", "ok.mov", ".mp4", "", "x".repeat(200) + ".mp4"]) {
    const out = await resolveVideoAddress({ commercial: bad }, { live: true, dir, env: ENV, upload: async () => "https://x.y/z.mp4" });
    assert.strictEqual(out.ok, false, bad);
  }
});

test("a missing file, an empty file and an over-size file are refused with a plain reason", async () => {
  const dir = tempDir({ "empty.mp4": 0, "big.mp4": 50 });
  const up = async () => "https://x.y/z.mp4";
  assert.match((await resolveVideoAddress({ commercial: "gone.mp4" }, { live: true, dir, env: ENV, upload: up })).error, /not found/);
  assert.match((await resolveVideoAddress({ commercial: "empty.mp4" }, { live: true, dir, env: ENV, upload: up })).error, /empty/);
  assert.match((await resolveVideoAddress({ commercial: "big.mp4" }, { live: true, dir, env: ENV, upload: up, maxBytes: 10 })).error, /too large/);
});

test("neither or both of videoUrl and commercial is refused", async () => {
  assert.strictEqual((await resolveVideoAddress({}, { env: ENV })).ok, false);
  assert.strictEqual((await resolveVideoAddress({ videoUrl: "https://a.b/c.mp4", commercial: "c.mp4" }, { env: ENV })).ok, false);
});

test("a failed upload is reported and nothing is treated as uploaded", async () => {
  const dir = tempDir({ "item.mp4": 8 });
  const out = await resolveVideoAddress({ commercial: "item.mp4" }, { live: true, dir, env: ENV, upload: async () => { throw new Error("storage said no"); } });
  assert.strictEqual(out.ok, false);
  assert.match(out.error, /storage said no/);
});
