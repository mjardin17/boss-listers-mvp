#!/usr/bin/env node
/**
 * Universal Creative Production Connector — Animation Studio
 *
 * Animation specifications for commercials:
 *   - Animated text (fade-in, slide, zoom, typewriter)
 *   - Logo animation (reveal, spin, pulse)
 *   - Product animation (float, rotate, zoom-in)
 *   - Motion graphics (lower thirds, price pop, badge)
 *   - Scene animation (transitions, camera movement)
 *   - Intro and outro creation
 *
 * Pure data layer — outputs animation specs for the rendering engine.
 * No rendering, no price invention, no claims.
 */

const VALID_ANIMATION_TYPES = [
  "fade-in",
  "fade-out",
  "slide-in",
  "slide-out",
  "zoom-in",
  "zoom-out",
  "rotate",
  "pulse",
  "bounce",
  "typewriter",
  "reveal",
  "float",
  "spin",
];
const VALID_EASING = [
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "bounce",
  "elastic",
];
const DEFAULT_DURATION = 1; // seconds

/**
 * Validate an animation spec.
 */
function validateAnimation(anim) {
  const errors = [];
  if (!anim.id) errors.push("Animation missing id");
  if (
    anim.animationType &&
    !VALID_ANIMATION_TYPES.includes(anim.animationType)
  ) {
    errors.push(
      `Animation ${anim.id}: invalid animation type '${anim.animationType}'`
    );
  }
  if (anim.duration !== undefined && (anim.duration <= 0 || anim.duration > 30)) {
    errors.push(`Animation ${anim.id}: duration must be between 0 and 30 seconds`);
  }
  if (anim.easing && !VALID_EASING.includes(anim.easing)) {
    errors.push(`Animation ${anim.id}: invalid easing '${anim.easing}'`);
  }
  return errors;
}

/**
 * Create an animated text spec.
 */
function createTextAnimation(options = {}) {
  const {
    id = `text-anim-${Date.now()}`,
    text,
    type = "fade-in",
    duration = DEFAULT_DURATION,
    easing = "ease-out",
    startDelay = 0,
    position = { x: 0.5, y: 0.5 },
    fontSize = 48,
    color = "#FFFFFF",
    fontFamily = "Arial",
    bold = true,
    shadow = true,
  } = options;

  const anim = {
    id,
    type: "text",
    animationType: type,
    duration,
    easing,
    startDelay,
    content: { text },
    style: { position, fontSize, color, fontFamily, bold, shadow },
    createdAt: new Date().toISOString(),
  };

  const errors = validateAnimation(anim);
  if (errors.length > 0) {
    throw new Error(`Invalid text animation: ${errors.join(", ")}`);
  }

  return anim;
}

/**
 * Create a logo animation spec.
 */
function createLogoAnimation(options = {}) {
  const {
    id = `logo-anim-${Date.now()}`,
    logoPath,
    type = "reveal",
    duration = DEFAULT_DURATION,
    easing = "ease-out",
    startDelay = 0,
    position = { x: 0.5, y: 0.2 },
    scale = 0.5,
    rotate = false,
    pulse = false,
  } = options;

  const anim = {
    id,
    type: "logo",
    animationType: type,
    duration,
    easing,
    startDelay,
    content: { logoPath },
    style: { position, scale, rotate, pulse },
    createdAt: new Date().toISOString(),
  };

  const errors = validateAnimation(anim);
  if (errors.length > 0) {
    throw new Error(`Invalid logo animation: ${errors.join(", ")}`);
  }

  return anim;
}

/**
 * Create a product animation spec.
 */
function createProductAnimation(options = {}) {
  const {
    id = `product-anim-${Date.now()}`,
    productImage,
    type = "float",
    duration = DEFAULT_DURATION,
    easing = "ease-in-out",
    startDelay = 0,
    position = { x: 0.5, y: 0.5 },
    scale = 0.8,
    rotate = 0,
    floatAmplitude = 20,
  } = options;

  const anim = {
    id,
    type: "product",
    animationType: type,
    duration,
    easing,
    startDelay,
    content: { productImage },
    style: { position, scale, rotate, floatAmplitude },
    createdAt: new Date().toISOString(),
  };

  const errors = validateAnimation(anim);
  if (errors.length > 0) {
    throw new Error(`Invalid product animation: ${errors.join(", ")}`);
  }

  return anim;
}

/**
 * Create a motion graphics spec (lower thirds, price pop, badge).
 */
function createMotionGraphics(options = {}) {
  const {
    id = `motion-${Date.now()}`,
    type = "lower-third",
    duration = DEFAULT_DURATION,
    easing = "ease-out",
    startDelay = 0,
    position = { x: 0.5, y: 0.85 },
    text = null,
    textColor = "#FFFFFF",
    bgColor = "#000000",
    bgOpacity = 0.7,
    width = 0.8,
    height = 0.1,
  } = options;

  const anim = {
    id,
    type: "motion-graphics",
    animationType: type,
    duration,
    easing,
    startDelay,
    content: { text },
    style: { position, textColor, bgColor, bgOpacity, width, height },
    createdAt: new Date().toISOString(),
  };

  const errors = validateAnimation(anim);
  if (errors.length > 0) {
    throw new Error(`Invalid motion graphics: ${errors.join(", ")}`);
  }

  return anim;
}

/**
 * Create an intro sequence (animated logo + text + product reveal).
 */
function createIntroSequence(options = {}) {
  const {
    brandName = "Jardin's Outpost",
    logoPath = null,
    productImage = null,
    tagline = null,
    duration = 5,
  } = options;

  const animations = [];
  let delay = 0;

  // Logo reveal
  if (logoPath) {
    animations.push(
      createLogoAnimation({
        id: "intro-logo",
        logoPath,
        type: "reveal",
        duration: 2,
        startDelay: delay,
        position: { x: 0.5, y: 0.3 },
        scale: 0.6,
      })
    );
    delay += 1;
  }

  // Brand name text
  animations.push(
    createTextAnimation({
      id: "intro-brand",
      text: brandName,
      type: "fade-in",
      duration: 1.5,
      startDelay: delay,
      position: { x: 0.5, y: 0.45 },
      fontSize: 56,
      color: "#FFFFFF",
      bold: true,
    })
  );
  delay += 1;

  // Tagline
  if (tagline) {
    animations.push(
      createTextAnimation({
        id: "intro-tagline",
        text: tagline,
        type: "fade-in",
        duration: 1.5,
        startDelay: delay,
        position: { x: 0.5, y: 0.55 },
        fontSize: 32,
        color: "#CCCCCC",
        bold: false,
      })
    );
  }

  // Product reveal
  if (productImage) {
    animations.push(
      createProductAnimation({
        id: "intro-product",
        productImage,
        type: "zoom-in",
        duration: 2,
        startDelay: delay,
        position: { x: 0.5, y: 0.6 },
        scale: 0.8,
      })
    );
  }

  return {
    id: `intro-${Date.now()}`,
    name: `${brandName} Intro`,
    duration,
    animations,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Create an outro sequence (CTA + branding).
 */
function createOutroSequence(options = {}) {
  const {
    brandName = "Jardin's Outpost",
    cta = "Shop now",
    logoPath = null,
    duration = 4,
  } = options;

  const animations = [];
  let delay = 0;

  // CTA text
  animations.push(
    createTextAnimation({
      id: "outro-cta",
      text: cta,
      type: "pulse",
      duration: 2,
      startDelay: delay,
      position: { x: 0.5, y: 0.5 },
      fontSize: 64,
      color: "#FFD700",
      bold: true,
    })
  );
  delay += 1;

  // Logo
  if (logoPath) {
    animations.push(
      createLogoAnimation({
        id: "outro-logo",
        logoPath,
        type: "fade-in",
        duration: 1.5,
        startDelay: delay,
        position: { x: 0.5, y: 0.75 },
        scale: 0.4,
      })
    );
  }

  // Brand name
  animations.push(
    createTextAnimation({
      id: "outro-brand",
      text: brandName,
      type: "fade-in",
      duration: 1.5,
      startDelay: delay,
      position: { x: 0.5, y: 0.85 },
      fontSize: 40,
      color: "#FFFFFF",
      bold: true,
    })
  );

  return {
    id: `outro-${Date.now()}`,
    name: `${brandName} Outro`,
    duration,
    animations,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Create scene animation (transitions, camera movement per scene).
 */
function createSceneAnimation(sceneId, options = {}) {
  const {
    type = "fade",
    duration = DEFAULT_DURATION,
    easing = "ease-in-out",
    cameraMovement = null, // { type: "pan"|"zoom"|"static", direction, amount }
    elements = [], // array of element animation ids
  } = options;

  return {
    id: `scene-anim-${sceneId}`,
    sceneId,
    type,
    duration,
    easing,
    cameraMovement,
    elements,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Get available animation features.
 */
function getAvailableFeatures() {
  return {
    animationTypes: VALID_ANIMATION_TYPES,
    easingOptions: VALID_EASING,
    defaultDuration: DEFAULT_DURATION,
    elementTypes: ["text", "logo", "product", "motion-graphics"],
  };
}

module.exports = {
  createTextAnimation,
  createLogoAnimation,
  createProductAnimation,
  createMotionGraphics,
  createIntroSequence,
  createOutroSequence,
  createSceneAnimation,
  validateAnimation,
  getAvailableFeatures,
  VALID_ANIMATION_TYPES,
  VALID_EASING,
  DEFAULT_DURATION,
};
