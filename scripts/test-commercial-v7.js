const assert = require("node:assert/strict");
const { test } = require("node:test");
const v7 = require("../lib/commercialV7");

test("local script writer supports all ten truthful styles and judge scores them", () => {
  assert.equal(v7.STYLES.length, 10);
  for (const style of v7.STYLES) {
    const draft = v7.fallbackScript({ title: "Real item", price: "", description: "Visible cotton fabric" }, style);
    const judged = v7.judgeScript(draft);
    assert.ok(judged.script.scenes.length >= 3);
    assert.ok(judged.score.total > 0);
    assert.ok(draft.scenes.every((scene) => scene.voice && scene.text));
  }
  const testimonial = v7.fallbackScript({ title: "Thing" }, "testimonial-style");
  assert.match(testimonial.scenes[2].text, /No customer review/);
});

test("Ollama-compatible writer is tested against a stub, never a live endpoint", async () => {
  let seenUrl = "";
  const result = await v7.writeWithOllama({ title: "Sample" }, "talking-head", {
    baseUrl: "http://127.0.0.1:11434/v1", model: "test-model",
    fetch: async (url, init) => {
      seenUrl = url;
      const body = JSON.parse(init.body);
      assert.equal(body.model, "test-model");
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ scenes: [
        { duration: 3, voice: "Host", text: "Here is one", visual: "Show item" },
        { duration: 3, voice: "Host", text: "Notice the finish", visual: "Close detail" },
        { duration: 3, voice: "Host", text: "Explore the listing", visual: "End frame" },
      ] }) } }] }) };
    },
  });
  assert.equal(seenUrl, "http://127.0.0.1:11434/v1/chat/completions");
  assert.equal(result.script.generatedBy, "local-model");
  await assert.rejects(() => v7.writeWithOllama({}, "talking-head", { fetch: async () => ({ ok: false, status: 503 }) }), /returned 503/);
});

test("URL price parsing never fabricates a fallback amount", () => {
  const { parsePrice } = require("../lib/ads4now/urlIngest");
  assert.equal(parsePrice(null), null);
  assert.equal(parsePrice("not listed"), null);
  assert.equal(parsePrice("$12.50"), 12.5);
  assert.equal(v7.cleanProduct({ title: "Item", price: null }).price, "");
});

test("AI film cost is displayed and confirmation stays a no-spend stub", () => {
  const estimate = v7.costEstimate(12, 0.03);
  assert.equal(estimate.total, 0.36);
  assert.equal(estimate.paidCallEnabled, false);
  assert.throws(() => v7.confirmFilmSpend(estimate, false), /Explicit confirmation/);
  assert.equal(v7.confirmFilmSpend(estimate, true).paidCallMade, false);
});

test("captions, formats, compliance and seller price remain explicit", () => {
  assert.deepEqual(v7.RATIOS["9:16"], [1080, 1920]);
  assert.deepEqual(v7.RATIOS["3:4"], [1080, 1440]);
  const p = { title: "Actual item", price: "" };
  const pack = v7.captionPack(p, { scenes: [{ text: "A closer look" }] }, "shorts");
  assert.doesNotMatch(pack.caption, /\$/);
  assert.equal(pack.preset, "shorts");
  assert.equal(v7.complianceCheck("Guaranteed best-selling cure").ok, false);
  assert.equal(v7.complianceCheck("A product spotlight", { aiGeneratedLabel: true }).aiGeneratedLabel, true);
});

test("product lock preserves photo identity; shot chains, reruns and one-second repairs are isolated", () => {
  const shots = require("../lib/commercialV7Shots");
  const photo = "/uploads/seller-photo.jpg";
  const original = shots.chainShots([
    shots.makeShot({ id: "a", productPhoto: photo, camera: "soft" }),
    shots.makeShot({ id: "b", productPhoto: photo, camera: "bold" }),
  ]);
  assert.deepEqual(original[1].startKeyframe, original[0].endKeyframe);
  const rerun = shots.rerunShot(original, "b", { camera: "mid" });
  assert.equal(rerun[1].productPhoto, photo);
  assert.equal(rerun[1].redrawProduct, false);
  assert.deepEqual(rerun[1].startKeyframe, original[1].startKeyframe);
  const fixed = shots.repairOneSecond(rerun, "b", 1, "Correct one caption");
  assert.equal(fixed[1].repairs[1], "Correct one caption");
  assert.equal(fixed[0].repairs, undefined);
  assert.throws(() => shots.makeShot({ id: "x", productPhoto: photo, camera: "warp" }), /camera/);
});

test("batch limit, local presenter record and MCP definition are suggestion-only", () => {
  const products = Array.from({ length: 10 }, (_, i) => ({ id: `real-${i}`, title: `Item ${i}`, price: "" }));
  const batch = v7.makeBatch(products);
  assert.equal(batch.length, 10);
  assert.equal(batch[0].postingPlan, "suggestion-only");
  assert.deepEqual(batch[0].cuts, ["A", "B"]);
  assert.throws(() => v7.makeBatch([...products, {}]), /at most 10/);
  const persona = v7.presenterRecord({ name: "Seller persona", references: { front: "/local/front.jpg" } });
  assert.equal(persona.references.front, "/local/front.jpg");
  assert.equal(persona.generation, "stub-only");
  assert.equal(v7.mcpToolDefinition().name, "make_commercial");
});
