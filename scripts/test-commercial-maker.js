const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { plainDescription, commercialFileName, buildMakeRequest, makeCommercial } = require("../lib/commercialMaker");

const PRODUCT = {
  sku: "ebay-198039778989",
  slug: "orion-pax-figure-965925",
  title: "Transformers Orion Pax Figure",
  description: null,
  price: "25.99",
  image_url: "https://i.ebayimg.com/images/g/abc/s-l1600.jpg",
};
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "maker-"));

test("plainDescription: strips markup and hidden notes, keeps whole sentences, stays short", () => {
  assert.strictEqual(plainDescription(null), "");
  assert.strictEqual(plainDescription("<p>New in  box.</p>\n<!-- STYLEFRAME_MEDIA: {\"a\":1} -->"), "New in box.");
  const long = "First sentence here. Second sentence is here too. " + "Filler words go on and on. ".repeat(20);
  const out = plainDescription(long);
  assert.ok(out.length <= 220, String(out.length));
  assert.ok(out.endsWith("."));
  assert.ok(out.startsWith("First sentence here."));
});

test("commercialFileName: a safe .mp4 name the Send a video panel will list", () => {
  assert.strictEqual(commercialFileName(PRODUCT), "orion-pax-figure-965925_reel_9_16.mp4");
  assert.strictEqual(commercialFileName({ sku: "ebay-1" }), "ebay-1_reel_9_16.mp4");
  const odd = commercialFileName({ slug: "../..//Weird Name!!", sku: "x" });
  assert.match(odd, /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}\.mp4$/);
  assert.match(commercialFileName({ slug: "a".repeat(300), sku: "x" }), /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}\.mp4$/);
});

test("buildMakeRequest: turns a product row into what the maker needs", () => {
  const out = buildMakeRequest(PRODUCT);
  assert.strictEqual(out.ok, true);
  assert.deepStrictEqual(out.payload, {
    name: "Transformers Orion Pax Figure",
    description: "",
    price: 25.99,
    images: ["https://i.ebayimg.com/images/g/abc/s-l1600.jpg"],
  });
  assert.strictEqual(out.fileName, "orion-pax-figure-965925_reel_9_16.mp4");
});

test("buildMakeRequest: refuses a product with no price, no picture or no title; never invents one", () => {
  assert.match(buildMakeRequest({ ...PRODUCT, price: null }).error, /price/);
  assert.match(buildMakeRequest({ ...PRODUCT, price: "0" }).error, /price/);
  assert.match(buildMakeRequest({ ...PRODUCT, image_url: "" }).error, /picture/);
  assert.match(buildMakeRequest({ ...PRODUCT, image_url: "http://insecure.example/a.jpg" }).error, /picture/);
  assert.match(buildMakeRequest({ ...PRODUCT, title: "  " }).error, /title/);
  assert.strictEqual(buildMakeRequest(null).ok, false);
});

test("makeCommercial: runs the maker with a product file and an output path, and reports the file", async () => {
  const dir = tempDir();
  const calls = [];
  const run = async (args) => {
    calls.push(args);
    const product = JSON.parse(fs.readFileSync(args[args.indexOf("--json") + 1], "utf8"));
    assert.strictEqual(product.name, "Transformers Orion Pax Figure");
    fs.writeFileSync(args[args.indexOf("--out") + 1], Buffer.alloc(4096, 1));
    return { code: 0, stderr: "" };
  };
  const out = await makeCommercial(PRODUCT, { dir, run, pipelineDir: "C:/pipeline" });
  assert.deepStrictEqual(out, { ok: true, name: "orion-pax-figure-965925_reel_9_16.mp4", bytes: 4096 });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0][0], path.join("C:/pipeline", "make_commercial.py"));
  assert.ok(fs.existsSync(path.join(dir, out.name)));
});

test("makeCommercial: a failed run is reported, and no file is claimed", async () => {
  const dir = tempDir();
  const failed = await makeCommercial(PRODUCT, { dir, run: async () => ({ code: 1, stderr: "boom" }), pipelineDir: "C:/p" });
  assert.strictEqual(failed.ok, false);
  assert.match(failed.error, /could not be made/);
  const empty = await makeCommercial(PRODUCT, { dir, run: async () => ({ code: 0, stderr: "" }), pipelineDir: "C:/p" });
  assert.strictEqual(empty.ok, false);
  const thrown = await makeCommercial(PRODUCT, { dir, run: async () => { throw new Error("no python"); }, pipelineDir: "C:/p" });
  assert.strictEqual(thrown.ok, false);
});

test("makeCommercial: a bad product never starts the maker", async () => {
  let runs = 0;
  const out = await makeCommercial({ ...PRODUCT, price: null }, { dir: tempDir(), run: async () => { runs++; }, pipelineDir: "C:/p" });
  assert.strictEqual(out.ok, false);
  assert.strictEqual(runs, 0);
});

test("makeCommercial: a failed remake leaves the earlier good file alone", async () => {
  const dir = tempDir();
  const name = commercialFileName(PRODUCT);
  fs.writeFileSync(path.join(dir, name), Buffer.alloc(100, 7));
  const out = await makeCommercial(PRODUCT, { dir, run: async () => ({ code: 1, stderr: "x" }), pipelineDir: "C:/p" });
  assert.strictEqual(out.ok, false);
  assert.strictEqual(fs.statSync(path.join(dir, name)).size, 100);
});
