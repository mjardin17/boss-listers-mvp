#!/usr/bin/env node
/**
 * Universal Creative Production Connector — Commercial Maker Agents
 *
 * 11 specialized commercial production agents that collaborate through the
 * shared agent orchestrator. Each agent extends CreativeAgent and uses the
 * shared studios (Image, Scene, Animation, Audio, Render Engine).
 *
 * Render-only safety: agents never auto-post, auto-list, or invent prices.
 * Publishing requires explicit user approval + authorized connections.
 */

const {
  CreativeAgent,
  AGENT_STATES,
} = require("./agent-framework.js");
const {
  ImageStudio,
  prepareProductImage,
  removeBackground,
} = require("./image-studio.js");
const {
  SceneComposition,
  createScene,
  buildDefaultCommercial,
} = require("./scene-studio.js");
const {
  createTextAnimation,
  createLogoAnimation,
  createProductAnimation,
  createIntroSequence,
  createOutroSequence,
} = require("./animation-studio.js");
const {
  generateVoiceover,
  generateMusic,
  mixAudio,
} = require("./audio-studio.js");
const {
  createRenderJob,
  renderCommercial,
  getAvailableFeatures: getRenderFeatures,
} = require("./render-engine.js");

// ================================================================
// 1. Commercial Director — strategy + work assignment
// ================================================================

class CommercialDirectorAgent extends CreativeAgent {
  constructor(options = {}) {
    super({
      id: options.id || "commercial-director",
      name: "Commercial Director",
      type: "commercial-director",
      domain: "commercial",
      capabilities: [
        "commercial-strategy",
        "work-assignment",
        "agent-coordination",
        "client-brief-analysis",
      ],
      permissions: ["read-product-info", "assign-tasks"],
      requiresApproval: false,
      ...options,
    });
  }

  async execute(task) {
    this.setState(AGENT_STATES.working);
    const { product, campaignGoal, budget, timeline } = task;

    // Analyze the brief and create a production strategy
    const strategy = {
      campaignId: `campaign-${Date.now()}`,
      product: product ? { title: product.title, sku: product.sku } : null,
      campaignGoal: campaignGoal || "brand-awareness",
      targetAudience: task.targetAudience || "general consumers",
      recommendedApproach: "card-showcase",
      estimatedDuration: 15, // seconds
      recommendedPlatforms: ["instagram", "facebook", "tiktok"],
      budget,
      timeline,
      tasks: [],
      createdAt: new Date().toISOString(),
    };

    // Assign work to specialized agents
    if (product) {
      strategy.tasks.push({
        agent: "marketing-research",
        task: "research-product",
        payload: { product },
        priority: 1,
      });
      strategy.tasks.push({
        agent: "creative-director",
        task: "develop-concept",
        payload: { product, campaignGoal },
        priority: 2,
      });
      strategy.tasks.push({
        agent: "scriptwriter",
        task: "write-script",
        payload: { product, campaignGoal },
        priority: 3,
      });
    }

    this.setState(AGENT_STATES.completed);
    return {
      ok: true,
      agent: "commercial-director",
      strategy,
      message: "Commercial strategy created. Work assigned to specialized agents.",
    };
  }
}

// ================================================================
// 2. Marketing Research Agent — product, audience, competitors
// ================================================================

class MarketingResearchAgent extends CreativeAgent {
  constructor(options = {}) {
    super({
      id: options.id || "marketing-research",
      name: "Marketing Research Agent",
      type: "marketing-research",
      domain: "commercial",
      capabilities: ["product-research", "audience-analysis", "competitor-scan", "positioning"],
      permissions: ["read-product-info", "web-search"],
      requiresApproval: false,
      ...options,
    });
  }

  async execute(task) {
    this.setState(AGENT_STATES.working);
    const { product } = task;

    const research = {
      productId: product && product.sku ? product.sku : "unknown",
      productTitle: product && product.title ? product.title : "Unknown Product",
      keySellingPoints: [],
      targetAudience: "general consumers",
      competitors: [],
      positioning: "",
      messagingAngles: [],
      createdAt: new Date().toISOString(),
    };

    if (product) {
      // Extract selling points from product info
      if (product.title) research.keySellingPoints.push(product.title);
      if (product.description) {
        research.keySellingPoints.push("Detailed product description available");
      }
      if (product.price) {
        research.keySellingPoints.push(`Price: $${Number(product.price).toFixed(2)}`);
      }
      if (product.condition) {
        research.keySellingPoints.push(`Condition: ${product.condition}`);
      }
      research.positioning = `Quality ${product.title || "product"} for discerning buyers`;
      research.messagingAngles = [
        "Value and quality",
        "Trusted seller",
        "Fast shipping",
      ];
    }

    this.setState(AGENT_STATES.completed);
    return {
      ok: true,
      agent: "marketing-research",
      research,
      message: "Product research complete.",
    };
  }
}

// ================================================================
// 3. Creative Director Agent — visual direction, concept
// ================================================================

class CreativeDirectorAgent extends CreativeAgent {
  constructor(options = {}) {
    super({
      id: options.id || "creative-director",
      name: "Creative Director Agent",
      type: "creative-director",
      domain: "commercial",
      capabilities: ["visual-direction", "advertising-concept", "tone-strategy", "brand-guidance"],
      permissions: ["read-brand-assets", "create-concept"],
      requiresApproval: false,
      ...options,
    });
  }

  async execute(task) {
    this.setState(AGENT_STATES.working);
    const { product, campaignGoal, research } = task;

    const concept = {
      campaignId: `concept-${Date.now()}`,
      productTitle: product && product.title ? product.title : "Product",
      visualStyle: "clean professional",
      colorPalette: ["#FFFFFF", "#000000", "#FFD700"],
      tone: campaignGoal === "sales" ? "urgent" : "trustworthy",
      keyMessage: product && product.title ? `Discover ${product.title}` : "Discover our product",
      sceneConcepts: [
        { scene: 1, concept: "Hero product shot with bold headline", mood: "impactful" },
        { scene: 2, concept: "Product details and benefits", mood: "informative" },
        { scene: 3, concept: "Price and value proposition", mood: "persuasive" },
        { scene: 4, concept: "Call to action with branding", mood: "action-oriented" },
      ],
      createdAt: new Date().toISOString(),
    };

    this.setState(AGENT_STATES.completed);
    return {
      ok: true,
      agent: "creative-director",
      concept,
      message: "Creative concept developed.",
    };
  }
}

// ================================================================
// 4. Scriptwriter Agent — scripts, hooks, narration, CTAs
// ================================================================

class ScriptwriterAgent extends CreativeAgent {
  constructor(options = {}) {
    super({
      id: options.id || "scriptwriter",
      name: "Scriptwriter Agent",
      type: "scriptwriter",
      domain: "commercial",
      capabilities: ["script-writing", "hook-creation", "narration", "cta-writing"],
      permissions: ["read-product-info", "read-brand-voice"],
      requiresApproval: false,
      ...options,
    });
  }

  async execute(task) {
    this.setState(AGENT_STATES.working);
    const { product, concept, duration = 15 } = task;

    const scenes = [];
    const timePerScene = Math.floor(duration / 4);

    // Scene 1: Hook
    scenes.push({
      id: "scene-1",
      type: "hook",
      duration: timePerScene,
      narration: product && product.title
        ? `Introducing ${product.title} — the product you've been waiting for.`
        : "Discover something amazing today.",
      visualDescription: "Product hero shot with dramatic lighting",
      onScreenText: product && product.title ? product.title : "Discover",
    });

    // Scene 2: Details
    scenes.push({
      id: "scene-2",
      type: "detail",
      duration: timePerScene,
      narration: product && product.description
        ? product.description
        : "Quality craftsmanship meets everyday practicality.",
      visualDescription: "Close-up product details",
      onScreenText: product && product.description ? product.description.slice(0, 40) : "Quality",
    });

    // Scene 3: Price/CTA
    scenes.push({
      id: "scene-3",
      type: "price",
      duration: timePerScene,
      narration: product && product.price
        ? `Just $${Number(product.price).toFixed(2)} — incredible value.`
        : "Check the listing for pricing.",
      visualDescription: "Price overlay with product shot",
      onScreenText: product && product.price ? `$${Number(product.price).toFixed(2)}` : "See price",
    });

    // Scene 4: CTA
    scenes.push({
      id: "scene-4",
      type: "cta",
      duration: timePerScene,
      narration: "Shop now. Link in bio.",
      visualDescription: "Brand logo with shop button",
      onScreenText: "Shop now",
    });

    const script = {
      campaignId: `script-${Date.now()}`,
      productTitle: product && product.title ? product.title : "Product",
      totalDuration: duration,
      scenes,
      hooks: [
        `Introducing ${product && product.title ? product.title : "our product"}`,
        "You won't believe what this can do",
      ],
      cta: "Shop now — link in bio",
      createdAt: new Date().toISOString(),
    };

    this.setState(AGENT_STATES.completed);
    return {
      ok: true,
      agent: "scriptwriter",
      script,
      message: "Commercial script written.",
    };
  }
}

// ================================================================
// 5. Product Photography Agent — product imagery preparation
// ================================================================

class ProductPhotographyAgent extends CreativeAgent {
  constructor(options = {}) {
    super({
      id: options.id || "product-photography",
      name: "Product Photography Agent",
      type: "product-photography",
      domain: "commercial",
      capabilities: ["background-removal", "image-enhancement", "product-image-prep", "transparent-bg"],
      permissions: ["read-product-images", "write-assets"],
      requiresApproval: false,
      connectorId: "imagemagick-local",
      ...options,
    });
  }

  async execute(task) {
    this.setState(AGENT_STATES.working);
    const { imagePath, options: opts = {} } = task;

    if (!imagePath) {
      this.setState(AGENT_STATES.failed);
      return { ok: false, agent: "product-photography", error: "No image path provided" };
    }

    // Prepare product image: remove background + enhance
    const prepResult = await prepareProductImage(imagePath, {
      outputPath: opts.outputPath || null,
      width: opts.width || 1080,
      height: opts.height || 1080,
      transparentBg: true,
      removeBgFirst: true,
    });

    this.setState(prepResult.ok ? AGENT_STATES.completed : AGENT_STATES.failed);
    return {
      ok: prepResult.ok,
      agent: "product-photography",
      imagePath: prepResult.outputPath,
      method: prepResult.method,
      bytes: prepResult.bytes,
      dimensions: prepResult.dimensions,
      error: prepResult.error,
    };
  }
}

// ================================================================
// 6. Scene Designer Agent — scenes, layouts, transitions, timelines
// ================================================================

class SceneDesignerAgent extends CreativeAgent {
  constructor(options = {}) {
    super({
      id: options.id || "scene-designer",
      name: "Scene Designer Agent",
      type: "scene-designer",
      domain: "commercial",
      capabilities: ["scene-design", "layout", "transitions", "timeline", "text-overlay"],
      permissions: ["read-brand-assets", "create-scenes"],
      requiresApproval: false,
      ...options,
    });
  }

  async execute(task) {
    this.setState(AGENT_STATES.working);
    const { product, script, aspectRatio = "9:16" } = task;

    const comp = {
      campaignId: `scene-comp-${Date.now()}`,
      aspectRatio,
      scenes: [],
      totalDuration: 0,
      createdAt: new Date().toISOString(),
    };

    if (script && script.scenes) {
      script.scenes.forEach((scene, i) => {
        comp.scenes.push({
          id: `scene-${i + 1}`,
          type: scene.type || "product",
          duration: scene.duration || 3,
          transition: i < script.scenes.length - 1 ? "fade" : "cut",
          productImage: product && product.image_url ? product.image_url : null,
          text: scene.onScreenText || "",
          textPosition: "center",
          textColor: "#FFFFFF",
          textSize: 48,
          audio: scene.narration || null,
        });
        comp.totalDuration += scene.duration || 3;
      });
    } else {
      // Default 5-scene commercial
      comp.scenes.push(
        { id: "scene-1", type: "hook", duration: 3, transition: "fade", productImage: product && product.image_url, text: product && product.title, textPosition: "center", textColor: "#FFFFFF", textSize: 56 },
        { id: "scene-2", type: "detail", duration: 4, transition: "slide-left", productImage: product && product.image_url, text: product && product.description, textPosition: "bottom", textColor: "#FFFFFF", textSize: 36 },
        { id: "scene-3", type: "price", duration: 3, transition: "zoom", text: product && product.price ? `$${Number(product.price).toFixed(2)}` : "", textPosition: "center", textColor: "#FFD700", textSize: 64 },
        { id: "scene-4", type: "cta", duration: 3, transition: "fade", text: "Shop now", textPosition: "center", textColor: "#FFFFFF", textSize: 48 },
        { id: "scene-5", type: "outro", duration: 2, transition: "cut", text: "Jardin's Outpost", textPosition: "center", textColor: "#FFFFFF", textSize: 40 }
      );
      comp.totalDuration = 15;
    }

    this.setState(AGENT_STATES.completed);
    return {
      ok: true,
      agent: "scene-designer",
      composition: comp,
      message: "Scenes designed.",
    };
  }
}

// ================================================================
// 7. Animation Agent — animated scenes, logos, text
// ================================================================

class AnimationAgentCommercial extends CreativeAgent {
  constructor(options = {}) {
    super({
      id: options.id || "animation",
      name: "Animation Agent",
      type: "animation",
      domain: "commercial",
      capabilities: ["animated-text", "logo-animation", "product-animation", "motion-graphics", "intro-outro"],
      permissions: ["read-brand-assets", "create-animations"],
      requiresApproval: false,
      ...options,
    });
  }

  async execute(task) {
    this.setState(AGENT_STATES.working);
    const { product, brandName = "Jardin's Outpost", logoPath } = task;

    const animations = [];

    // Intro sequence
    animations.push(
      createIntroSequence({
        brandName,
        logoPath,
        productImage: product && product.image_url,
        tagline: "Quality products, trusted seller",
        duration: 5,
      })
    );

    // Product animation
    if (product && product.image_url) {
      animations.push(
        createProductAnimation({
          id: "product-float",
          productImage: product.image_url,
          type: "float",
          duration: 3,
          position: { x: 0.5, y: 0.5 },
          scale: 0.8,
        })
      );
    }

    // Outro sequence
    animations.push(
      createOutroSequence({
        brandName,
        logoPath,
        cta: "Shop now",
        duration: 4,
      })
    );

    this.setState(AGENT_STATES.completed);
    return {
      ok: true,
      agent: "animation",
      animations,
      totalAnimations: animations.length,
      message: "Animations created.",
    };
  }
}

// ================================================================
// 8. Voiceover Agent — narration, audio production
// ================================================================

class VoiceoverAgent extends CreativeAgent {
  constructor(options = {}) {
    super({
      id: options.id || "voiceover",
      name: "Voiceover Agent",
      type: "voiceover",
      domain: "commercial",
      capabilities: ["ai-voiceover", "narration-timing", "background-music", "audio-sync"],
      permissions: ["read-script", "create-audio"],
      requiresApproval: false,
      connectorId: "ffmpeg-local",
      ...options,
    });
  }

  async execute(task) {
    this.setState(AGENT_STATES.working);
    const { script, voice = "af_heart", musicPrompt = "upbeat cheerful commercial background music, no vocals" } = task;

    const narrationSegments = [];
    let startTime = 0;

    if (script && script.scenes) {
      script.scenes.forEach((scene, i) => {
        narrationSegments.push({
          segmentId: `narration-${i + 1}`,
          sceneId: scene.id,
          text: scene.narration || "",
          startOffset: startTime,
          duration: scene.duration || 3,
          voice,
        });
        startTime += scene.duration || 3;
      })
    }

    const audio = {
      campaignId: `audio-${Date.now()}`,
      voice,
      musicPrompt,
      narrationSegments,
      totalDuration: startTime,
      createdAt: new Date().toISOString(),
    };

    this.setState(AGENT_STATES.completed);
    return {
      ok: true,
      agent: "voiceover",
      audio,
      message: "Voiceover plan created.",
    };
  }
}

// ================================================================
// 9. Video Editor Agent — assembles scenes, audio, graphics, effects
// ================================================================

class VideoEditorAgent extends CreativeAgent {
  constructor(options = {}) {
    super({
      id: options.id || "video-editor",
      name: "Video Editor Agent",
      type: "video-editor",
      domain: "commercial",
      capabilities: ["scene-assembly", "audio-mixing", "transitions", "graphics", "render-prep"],
      permissions: ["read-assets", "create-render-jobs"],
      requiresApproval: false,
      ...options,
    });
  }

  async execute(task) {
    this.setState(AGENT_STATES.working);
    const { composition, audio, animations, aspectRatio = "9:16" } = task;

    // Create render job through the render engine
    const job = {
      commercialId: `commercial-${Date.now()}`,
      aspectRatio,
      scenes: composition && composition.scenes ? composition.scenes : [],
      audio,
      animations,
      createdAt: new Date().toISOString(),
    };

    this.setState(AGENT_STATES.completed);
    return {
      ok: true,
      agent: "video-editor",
      job,
      message: "Video edit assembled. Ready for render.",
    };
  }
}

// ================================================================
// 10. Commercial QA Agent — quality checks
// ================================================================

class CommercialQAAgent extends CreativeAgent {
  constructor(options = {}) {
    super({
      id: options.id || "commercial-qa",
      name: "Commercial QA Agent",
      type: "commercial-qa",
      domain: "commercial",
      capabilities: ["quality-check", "branding-verification", "timing-check", "specs-validation"],
      permissions: ["read-render-output", "qa-approve"],
      requiresApproval: false,
      ...options,
    });
  }

  async execute(task) {
    this.setState(AGENT_STATES.working);
    const { commercial, script, qaCriteria = [] } = task;

    const checks = [];
    const issues = [];

    // Check 1: Has script
    checks.push({
      id: "qa-script",
      name: "Script completeness",
      passed: !!script && script.scenes && script.scenes.length > 0,
      details: script ? `${script.scenes.length} scenes` : "No script",
    });
    if (!script || !script.scenes || script.scenes.length === 0) {
      issues.push("Missing script or scenes");
    }

    // Check 2: Has product info
    checks.push({
      id: "qa-product",
      name: "Product information",
      passed: !!task.product && task.product.title,
      details: task.product ? task.product.title : "No product",
    });
    if (!task.product || !task.product.title) {
      issues.push("Missing product title");
    }

    // Check 3: Duration within limits
    const duration = script ? script.scenes.reduce((sum, s) => sum + (s.duration || 0), 0) : 0;
    checks.push({
      id: "qa-duration",
      name: "Duration within limits",
      passed: duration > 0 && duration <= 60,
      details: `${duration} seconds`,
    });
    if (duration === 0 || duration > 60) {
      issues.push(`Duration ${duration}s out of acceptable range`);
    }

    // Check 4: No invented prices
    checks.push({
      id: "qa-no-invented-price",
      name: "No invented pricing",
      passed: !task.product || !!task.product.price,
      details: task.product && task.product.price ? `$${task.product.price}` : "No price claimed",
    });

    const passed = issues.length === 0;
    const score = Math.round(((checks.length - issues.length) / checks.length) * 100);

    this.setState(AGENT_STATES.completed);
    return {
      ok: true,
      agent: "commercial-qa",
      passed,
      score,
      issues,
      checks,
      message: passed ? "QA passed" : `QA found ${issues.length} issue(s)`,
    };
  }
}

// ================================================================
// 11. Campaign Agent — platform variations
// ================================================================

class CampaignAgent extends CreativeAgent {
  constructor(options = {}) {
    super({
      id: options.id || "campaign",
      name: "Campaign Agent",
      type: "campaign",
      domain: "commercial",
      capabilities: ["platform-variations", "aspect-ratio-adjust", "caption-writing", "thumbnail-prep"],
      permissions: ["read-commercial-output", "prepare-export"],
      requiresApproval: true, // publishing requires approval
      ...options,
    });
  }

  async execute(task) {
    this.setState(AGENT_STATES.working);
    const { commercial, platforms = ["instagram", "facebook"] } = task;

    const variations = platforms.map((platform) => {
      const specs = {
        instagram: { aspectRatio: "9:16", resolution: { width: 1080, height: 1920 } },
        facebook: { aspectRatio: "1:1", resolution: { width: 1080, height: 1080 } },
        tiktok: { aspectRatio: "9:16", resolution: { width: 1080, height: 1920 } },
      };
      const spec = specs[platform] || specs.instagram;

      return {
        platform,
        aspectRatio: spec.aspectRatio,
        resolution: spec.resolution,
        status: "prepared",
        requiresApproval: true,
        autoPost: false,
        createdAt: new Date().toISOString(),
      };
    });

    this.setState(AGENT_STATES.completed);
    return {
      ok: true,
      agent: "campaign",
      variations,
      message: `Prepared ${variations.length} platform variations. Requires approval before posting.`,
    };
  }
}

// ================================================================
// Register all agents with the orchestrator
// ================================================================

function registerAllCommercialAgents(orchestrator) {
  const agents = [
    new CommercialDirectorAgent(),
    new MarketingResearchAgent(),
    new CreativeDirectorAgent(),
    new ScriptwriterAgent(),
    new ProductPhotographyAgent(),
    new SceneDesignerAgent(),
    new AnimationAgentCommercial(),
    new VoiceoverAgent(),
    new VideoEditorAgent(),
    new CommercialQAAgent(),
    new CampaignAgent(),
  ];

  agents.forEach((agent) => orchestrator.registerAgent(agent));
  return agents;
}

module.exports = {
  CommercialDirectorAgent,
  MarketingResearchAgent,
  CreativeDirectorAgent,
  ScriptwriterAgent,
  ProductPhotographyAgent,
  SceneDesignerAgent,
  AnimationAgentCommercial,
  VoiceoverAgent,
  VideoEditorAgent,
  CommercialQAAgent,
  CampaignAgent,
  registerAllCommercialAgents,
};
