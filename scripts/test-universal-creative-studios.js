const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  defaultRegistry,
} = require("../lib/universal-creative/registry.js");
const {
  isAvailable,
  isVerified,
} = require("../lib/universal-creative/manifest.js");
const { allPresets } = require("../lib/universal-creative/presets.js");

// Register all presets so connector configs exist for studio readiness checks
defaultRegistry.registerMany(allPresets, "test-presets");

// Image Studio
const {
  removeBackground,
  replaceBackground,
  prepareProductImage,
  enhanceImage,
  getAvailableOperations,
} = require("../lib/universal-creative/image-studio.js");

// Scene Studio
const {
  createScene,
  validateScene,
  SceneComposition,
  buildDefaultCommercial,
  getAvailableFeatures: getSceneFeatures,
} = require("../lib/universal-creative/scene-studio.js");

// Animation Studio
const {
  createTextAnimation,
  createLogoAnimation,
  createProductAnimation,
  createMotionGraphics,
  createIntroSequence,
  createOutroSequence,
  createSceneAnimation,
  validateAnimation,
  getAvailableFeatures: getAnimFeatures,
} = require("../lib/universal-creative/animation-studio.js");

// Audio Studio
const {
  generateVoiceover,
  generateMusic,
  mixAudio,
  syncNarrationToScenes,
  addSoundEffect,
  getAvailableFeatures: getAudioFeatures,
  VALID_VOICES,
} = require("../lib/universal-creative/audio-studio.js");

// Render Engine
const {
  createRenderJob,
  getRenderJob,
  listRenderJobs,
  cancelRenderJob,
  getAvailableFeatures: getRenderFeatures,
  clearQueue,
  VALID_ASPECT_RATIOS,
} = require("../lib/universal-creative/render-engine.js");

// ---------------------------------------------------------------
// Image Studio tests
// ---------------------------------------------------------------

test("image studio getAvailableOperations returns all operations", () => {
  const ops = getAvailableOperations();
  assert.equal(ops.length, 4);
  const ids = ops.map((o) => o.id);
  assert.ok(ids.includes("remove-background"));
  assert.ok(ids.includes("replace-background"));
  assert.ok(ids.includes("prepare-product-image"));
  assert.ok(ids.includes("enhance-image"));
});

test("image studio prepareProductImage fails gracefully on missing file", async () => {
  const result = await prepareProductImage("/nonexistent/image.jpg");
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test("image studio enhanceImage fails gracefully on missing file", async () => {
  const result = await enhanceImage("/nonexistent/image.jpg");
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

// ---------------------------------------------------------------
// Scene Studio tests
// ---------------------------------------------------------------

test("scene studio createScene creates valid scene", () => {
  const scene = createScene({
    id: "scene-1",
    type: "product",
    duration: 3,
    transition: "fade",
    productImage: "https://example.com/product.jpg",
    text: "Amazing Product!",
    textPosition: "center",
    textColor: "#FFFFFF",
    textSize: 48,
  });
  assert.equal(scene.id, "scene-1");
  assert.equal(scene.type, "product");
  assert.equal(scene.duration, 3);
  assert.equal(scene.transition, "fade");
  assert.equal(scene.text, "Amazing Product!");
});

test("scene studio validateScene rejects invalid transitions", () => {
  assert.throws(() => {
    createScene({
      id: "bad",
      transition: "invalid-transition",
    });
  });
});

test("scene studio SceneComposition add/reorder/remove scenes", () => {
  const comp = new SceneComposition({
    id: "comp-1",
    name: "Test Commercial",
    aspectRatio: "9:16",
    resolution: { width: 1080, height: 1920 },
  });

  comp.addScene(createScene({ id: "s1", duration: 3 }));
  comp.addScene(createScene({ id: "s2", duration: 4 }));
  comp.addScene(createScene({ id: "s3", duration: 2 }));

  assert.equal(comp.scenes.length, 3);
  assert.equal(comp.totalDuration, 9);

  comp.reorderScene("s3", 0);
  assert.equal(comp.scenes[0].id, "s3");

  comp.removeScene("s2");
  assert.equal(comp.scenes.length, 2);
  assert.equal(comp.totalDuration, 5);

  const preview = comp.getScenePreview("s1");
  assert.ok(preview);
  assert.equal(preview.sceneId, "s1");
});

test("scene studio buildDefaultCommercial creates 5 scenes", () => {
  const product = {
    title: "Test Product",
    description: "A great product",
    price: 29.99,
    image_url: "https://example.com/product.jpg",
    cta: "Shop now",
  };
  const comp = buildDefaultCommercial(product, { brandName: "Test Brand" });
  assert.equal(comp.scenes.length, 5);
  assert.equal(comp.scenes[0].id, "scene-hook");
  assert.equal(comp.scenes[4].id, "scene-outro");
  assert.equal(comp.name, "Test Product Commercial");
});

test("scene studio toJSON round-trip", () => {
  const comp = new SceneComposition({
    id: "comp-json",
    name: "JSON Test",
    aspectRatio: "1:1",
  });
  comp.addScene(createScene({ id: "s1", duration: 3 }));

  const json = comp.toJSON();
  assert.equal(json.id, "comp-json");
  assert.equal(json.name, "JSON Test");
  assert.equal(json.aspectRatio, "1:1");
  assert.equal(json.sceneCount, 1);

  // Save and load
  const tmpFile = path.join(os.tmpdir(), `comp-test-${Date.now()}.json`);
  try {
    comp.saveToFile(tmpFile);
    const loaded = SceneComposition.loadFromFile(tmpFile);
    assert.equal(loaded.id, "comp-json");
    assert.equal(loaded.name, "JSON Test");
    assert.equal(loaded.scenes.length, 1);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

// ---------------------------------------------------------------
// Animation Studio tests
// ---------------------------------------------------------------

test("animation studio createTextAnimation", () => {
  const anim = createTextAnimation({
    id: "ta-1",
    text: "Hello World",
    type: "fade-in",
    duration: 2,
    position: { x: 0.5, y: 0.5 },
    fontSize: 48,
    color: "#FFFFFF",
  });
  assert.equal(anim.id, "ta-1");
  assert.equal(anim.type, "text");
  assert.equal(anim.animationType, "fade-in");
  assert.equal(anim.content.text, "Hello World");
});

test("animation studio createLogoAnimation", () => {
  const anim = createLogoAnimation({
    id: "la-1",
    logoPath: "/path/to/logo.png",
    type: "reveal",
    duration: 2,
    scale: 0.5,
  });
  assert.equal(anim.id, "la-1");
  assert.equal(anim.type, "logo");
  assert.equal(anim.animationType, "reveal");
  assert.equal(anim.content.logoPath, "/path/to/logo.png");
});

test("animation studio createProductAnimation", () => {
  const anim = createProductAnimation({
    id: "pa-1",
    productImage: "/path/to/product.png",
    type: "float",
    duration: 3,
    scale: 0.8,
  });
  assert.equal(anim.id, "pa-1");
  assert.equal(anim.type, "product");
  assert.equal(anim.animationType, "float");
  assert.equal(anim.content.productImage, "/path/to/product.png");
});

test("animation studio createIntroSequence", () => {
  const intro = createIntroSequence({
    brandName: "Test Brand",
    tagline: "Great products",
    duration: 5,
  });
  assert.equal(intro.name, "Test Brand Intro");
  assert.ok(intro.animations.length > 0);
  assert.ok(intro.animations.some((a) => a.id === "intro-brand"));
});

test("animation studio createOutroSequence", () => {
  const outro = createOutroSequence({
    brandName: "Test Brand",
    cta: "Buy now",
    duration: 4,
  });
  assert.equal(outro.name, "Test Brand Outro");
  assert.ok(outro.animations.some((a) => a.id === "outro-cta"));
});

test("animation studio validateAnimation rejects invalid type", () => {
  assert.throws(() => {
    createTextAnimation({
      id: "bad",
      type: "invalid-type",
    });
  });
});

// ---------------------------------------------------------------
// Audio Studio tests
// ---------------------------------------------------------------

test("audio studio getAvailableFeatures", () => {
  const features = getAudioFeatures();
  assert.ok(Array.isArray(features.voices));
  assert.ok(features.voices.length > 0);
  assert.ok(Array.isArray(features.musicPrompts));
  assert.ok(features.musicPrompts.length > 0);
});

test("audio studio VALID_VOICES contains expected voices", () => {
  assert.ok(VALID_VOICES.includes("af_heart"));
  assert.ok(VALID_VOICES.includes("am_adam"));
});

test("audio studio addSoundEffect", () => {
  const sfx = addSoundEffect({ type: "whoosh", startTime: 1, volume: 0.5 });
  assert.equal(sfx.id.startsWith("sfx-"), true);
  assert.equal(sfx.type, "whoosh");
  assert.equal(sfx.startTime, 1);
  assert.equal(sfx.volume, 0.5);
});

test("audio studio addSoundEffect rejects invalid type", () => {
  assert.throws(() => {
    addSoundEffect({ type: "invalid-sfx" });
  });
});

test("audio studio syncNarrationToScenes", () => {
  const scenes = [
    { id: "s1", duration: 3 },
    { id: "s2", duration: 4 },
  ];
  const narrationSegments = [
    { sceneId: "s1", text: "First scene narration", startOffset: 0, duration: 3 },
  ];
  const result = syncNarrationToScenes(scenes, narrationSegments);
  assert.equal(result.totalDuration, 7);
  assert.equal(result.segments.length, 2);
  assert.equal(result.segments[0].startTime, 0);
  assert.equal(result.segments[0].endTime, 3);
  assert.equal(result.segments[0].narrationText, "First scene narration");
  assert.equal(result.segments[1].startTime, 3);
  assert.equal(result.segments[1].endTime, 7);
  assert.equal(result.segments[1].narrationText, null);
});

// ---------------------------------------------------------------
// Render Engine tests
// ---------------------------------------------------------------

test("render engine getAvailableFeatures", () => {
  const features = getRenderFeatures();
  assert.ok(Array.isArray(features.aspectRatios));
  assert.ok(features.aspectRatios.includes("9:16"));
  assert.ok(features.aspectRatios.includes("1:1"));
  assert.ok(features.aspectRatios.includes("16:9"));
  assert.ok(Array.isArray(features.renderStates));
  assert.ok(features.renderStates.includes("QUEUED"));
  assert.ok(features.renderStates.includes("SUCCEEDED"));
  assert.ok(features.renderStates.includes("FAILED"));
});

test("render engine VALID_ASPECT_RATIOS", () => {
  assert.ok(VALID_ASPECT_RATIOS.includes("9:16"));
  assert.ok(VALID_ASPECT_RATIOS.includes("1:1"));
  assert.ok(VALID_ASPECT_RATIOS.includes("16:9"));
});

test("render engine createRenderJob and listRenderJobs", () => {
  clearQueue();
  const job = createRenderJob({
    commercialId: "comm-1",
    productId: "prod-1",
    aspectRatio: "9:16",
    platform: "tiktok",
    priority: 5,
  });
  assert.equal(job.id.startsWith("render-"), true);
  assert.equal(job.status, "QUEUED");
  assert.equal(job.aspectRatio, "9:16");
  assert.equal(job.platform, "tiktok");
  assert.equal(job.priority, 5);
  assert.equal(job.progress, 0);

  const jobs = listRenderJobs();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].id, job.id);
});

test("render engine cancelRenderJob", () => {
  clearQueue();
  const job = createRenderJob({ id: "render-cancel-test" });
  assert.equal(cancelRenderJob("render-cancel-test"), true);
  assert.equal(job.status, "CANCELLED");
  assert.equal(cancelRenderJob("nonexistent"), false);
});

test("render engine validateAspectRatio rejects invalid", () => {
  assert.throws(() => {
    createRenderJob({ aspectRatio: "invalid" });
  });
});

test("render engine getRenderJob returns null for missing", () => {
  clearQueue();
  assert.equal(getRenderJob("nonexistent"), undefined);
});
