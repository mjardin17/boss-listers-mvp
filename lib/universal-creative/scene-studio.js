#!/usr/bin/env node
/**
 * Universal Creative Production Connector — Scene Studio
 *
 * Multi-scene commercial editor:
 *   - Scene ordering, timing, transitions
 *   - Text overlays, product placement, background selection
 *   - Scene-specific audio, scene previews, timeline controls
 *   - Outputs scene JSON for the rendering engine
 *
 * Pure data layer — no rendering, no price invention, no claims.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_SCENE_DURATION = 3; // seconds
const MAX_SCENES = 20;
const VALID_TRANSITIONS = [
  "fade",
  "slide-left",
  "slide-right",
  "slide-up",
  "slide-down",
  "zoom",
  "cut",
  "wipe",
];
const VALID_ASPECT_RATIOS = ["9:16", "1:1", "16:9"];

/**
 * Validate a scene object.
 */
function validateScene(scene) {
  const errors = [];
  if (!scene.id) errors.push("Scene missing id");
  if (scene.duration === undefined || scene.duration <= 0)
    errors.push(`Scene ${scene.id}: duration must be positive`);
  if (scene.duration && scene.duration > 60)
    errors.push(`Scene ${scene.id}: duration exceeds 60s`);
  if (scene.transition && !VALID_TRANSITIONS.includes(scene.transition)) {
    errors.push(
      `Scene ${scene.id}: invalid transition '${scene.transition}'`
    );
  }
  return errors;
}

/**
 * Create a new scene.
 */
function createScene(options = {}) {
  const {
    id = `scene-${Date.now()}`,
    type = "product", // product, text, logo, background, cta
    duration = DEFAULT_SCENE_DURATION,
    transition = "fade",
    background = null,
    productImage = null,
    text = null,
    textPosition = "center",
    textColor = "#FFFFFF",
    textSize = 48,
    audio = null,
    productPlacement = null, // { x, y, scale, rotation }
    overlay = null,
  } = options;

  const scene = {
    id,
    type,
    duration,
    transition,
    background,
    productImage,
    text,
    textPosition,
    textColor,
    textSize,
    audio,
    productPlacement,
    overlay,
    createdAt: new Date().toISOString(),
  };

  const errors = validateScene(scene);
  if (errors.length > 0) {
    throw new Error(`Invalid scene: ${errors.join(", ")}`);
  }

  return scene;
}

/**
 * Scene composition — holds ordered scenes with timeline metadata.
 */
class SceneComposition {
  constructor(options = {}) {
    this.id = options.id || `composition-${Date.now()}`;
    this.name = options.name || "Untitled Commercial";
    this.aspectRatio = options.aspectRatio || "9:16";
    this.resolution = options.resolution || { width: 1080, height: 1920 };
    this.fps = options.fps || 24;
    this.totalDuration = 0;
    this.scenes = [];
    this.globalAudio = null;
    this.watermark = null;
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Add a scene to the composition.
   */
  addScene(scene) {
    if (this.scenes.length >= MAX_SCENES) {
      throw new Error(`Maximum ${MAX_SCENES} scenes reached`);
    }
    const validated = typeof scene === "string" ? createScene({ id: scene }) : scene;
    this.scenes.push(validated);
    this.recomputeDuration();
    this.updatedAt = new Date().toISOString();
    return validated;
  }

  /**
   * Insert a scene at a specific index.
   */
  insertScene(index, scene) {
    if (index < 0 || index > this.scenes.length) {
      throw new Error(`Invalid insert index: ${index}`);
    }
    const validated = typeof scene === "string" ? createScene({ id: scene }) : scene;
    this.scenes.splice(index, 0, validated);
    this.recomputeDuration();
    this.updatedAt = new Date().toISOString();
    return validated;
  }

  /**
   * Remove a scene by id.
   */
  removeScene(sceneId) {
    const initialLength = this.scenes.length;
    this.scenes = this.scenes.filter((s) => s.id !== sceneId);
    if (this.scenes.length === initialLength) {
      throw new Error(`Scene not found: ${sceneId}`);
    }
    this.recomputeDuration();
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Reorder scenes.
   */
  reorderScene(sceneId, newIndex) {
    const scene = this.scenes.find((s) => s.id === sceneId);
    if (!scene) throw new Error(`Scene not found: ${sceneId}`);
    if (newIndex < 0 || newIndex >= this.scenes.length) {
      throw new Error(`Invalid new index: ${newIndex}`);
    }
    this.scenes.splice(this.scenes.indexOf(scene), 1);
    this.scenes.splice(newIndex, 0, scene);
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Update a scene's properties.
   */
  updateScene(sceneId, updates) {
    const scene = this.scenes.find((s) => s.id === sceneId);
    if (!scene) throw new Error(`Scene not found: ${sceneId}`);
    Object.assign(scene, updates);
    const errors = validateScene(scene);
    if (errors.length > 0) {
      throw new Error(`Invalid scene update: ${errors.join(", ")}`);
    }
    this.recomputeDuration();
    this.updatedAt = new Date().toISOString();
    return scene;
  }

  /**
   * Recompute total duration from scenes.
   */
  recomputeDuration() {
    this.totalDuration = this.scenes.reduce(
      (sum, s) => sum + (s.duration || 0),
      0
    );
  }

  /**
   * Set global audio for the composition.
   */
  setGlobalAudio(audio) {
    this.globalAudio = audio;
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Set watermark for the composition.
   */
  setWatermark(watermark) {
    this.watermark = watermark;
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Get a preview spec for a specific scene (for preview generation).
   */
  getScenePreview(sceneId) {
    const scene = this.scenes.find((s) => s.id === sceneId);
    if (!scene) return null;
    return {
      sceneId: scene.id,
      duration: scene.duration,
      transition: scene.transition,
      hasProductImage: !!scene.productImage,
      hasText: !!scene.text,
      hasAudio: !!scene.audio,
      aspectRatio: this.aspectRatio,
      resolution: this.resolution,
    };
  }

  /**
   * Export composition as JSON (for rendering engine).
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      aspectRatio: this.aspectRatio,
      resolution: this.resolution,
      fps: this.fps,
      totalDuration: this.totalDuration,
      sceneCount: this.scenes.length,
      scenes: this.scenes,
      globalAudio: this.globalAudio,
      watermark: this.watermark,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * Save composition to a JSON file.
   */
  saveToFile(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(this.toJSON(), null, 2), "utf8");
    return filePath;
  }

  /**
   * Load composition from a JSON file.
   */
  static loadFromFile(filePath) {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const comp = new SceneComposition({
      id: data.id,
      name: data.name,
      aspectRatio: data.aspectRatio,
      resolution: data.resolution,
      fps: data.fps,
    });
    comp.totalDuration = data.totalDuration;
    comp.scenes = data.scenes;
    comp.globalAudio = data.globalAudio;
    comp.watermark = data.watermark;
    comp.createdAt = data.createdAt;
    comp.updatedAt = data.updatedAt;
    return comp;
  }
}

/**
 * Build a default 5-scene commercial from product info (StoryForge-style mission builder).
 * Scenes: Hook -> Detail -> Price -> CTA -> Outro
 */
function buildDefaultCommercial(product, options = {}) {
  const {
    aspectRatio = "9:16",
    resolution = { width: 1080, height: 1920 },
    brandName = "Jardin's Outpost",
  } = options;

  const comp = new SceneComposition({
    name: `${product.title || "Product"} Commercial`,
    aspectRatio,
    resolution,
  });

  // Scene 1: Hook — product introduction
  comp.addScene(
    createScene({
      id: "scene-hook",
      type: "product",
      duration: 3,
      transition: "fade",
      productImage: product.image_url || null,
      text: product.title || "",
      textPosition: "center",
      textColor: "#FFFFFF",
      textSize: 56,
      productPlacement: { x: 0.5, y: 0.4, scale: 0.8, rotation: 0 },
    })
  );

  // Scene 2: Detail — product features/details
  comp.addScene(
    createScene({
      id: "scene-detail",
      type: "product",
      duration: 3,
      transition: "slide-left",
      productImage: product.image_url || null,
      text: product.description || "",
      textPosition: "bottom",
      textColor: "#FFFFFF",
      textSize: 36,
      productPlacement: { x: 0.5, y: 0.3, scale: 0.7, rotation: 0 },
    })
  );

  // Scene 3: Price — pricing and offer
  comp.addScene(
    createScene({
      id: "scene-price",
      type: "cta",
      duration: 3,
      transition: "zoom",
      text: product.price
        ? `$${Number(product.price).toFixed(2)}`
        : "See price in listing",
      textPosition: "center",
      textColor: "#FFD700",
      textSize: 64,
      productPlacement: { x: 0.5, y: 0.5, scale: 0.6, rotation: 0 },
    })
  );

  // Scene 4: CTA — call to action
  comp.addScene(
    createScene({
      id: "scene-cta",
      type: "cta",
      duration: 2,
      transition: "fade",
      text: product.cta || "Shop now",
      textPosition: "center",
      textColor: "#FFFFFF",
      textSize: 48,
      productPlacement: null,
    })
  );

  // Scene 5: Outro — branding
  comp.addScene(
    createScene({
      id: "scene-outro",
      type: "logo",
      duration: 2,
      transition: "fade",
      text: brandName,
      textPosition: "center",
      textColor: "#FFFFFF",
      textSize: 40,
      productPlacement: null,
    })
  );

  return comp;
}

/**
 * Get available scene studio features.
 */
function getAvailableFeatures() {
  return {
    transitions: VALID_TRANSITIONS,
    aspectRatios: VALID_ASPECT_RATIOS,
    maxScenes: MAX_SCENES,
    defaultSceneDuration: DEFAULT_SCENE_DURATION,
    sceneTypes: ["product", "text", "logo", "background", "cta"],
    textPositions: ["center", "top", "bottom", "left", "right"],
  };
}

module.exports = {
  createScene,
  validateScene,
  SceneComposition,
  buildDefaultCommercial,
  getAvailableFeatures,
  DEFAULT_SCENE_DURATION,
  MAX_SCENES,
  VALID_TRANSITIONS,
  VALID_ASPECT_RATIOS,
};
