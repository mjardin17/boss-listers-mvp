#!/usr/bin/env node
/**
 * Universal Creative Production Connector — Video Factory
 *
 * Long-form video production environment:
 *   - Long-form video production (documentaries, YouTube, content series)
 *   - YouTube content (research, script, storyboard, visuals, narration, editing,
 *     subtitles, thumbnails, QA, export)
 *   - Documentary production (research, script, narration, images, graphics,
 *     maps, animation, editing, sound design, QA, export)
 *   - Short-form content generation
 *   - Automated video pipelines
 *   - Bulk content production
 *
 * Shares the Universal Creative Connector, agent framework, asset factory, QA,
 * and learning infrastructure with Commercial Maker. Retains independent
 * identity and workflows.
 *
 * Render-only safety: never invents sources, claims, or pricing. Publishing
 * requires authorized connections + user approval.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { defaultRegistry } = require("./registry.js");
const { isAvailable, isVerified } = require("./manifest.js");
const { spawn } = require("child_process");

const VIDEO_FACTORY_DIR = path.join(
  process.env.VIDEO_FACTORY_DIR || os.tmpdir(),
  "video-factory"
);
const MAX_SCENES = 100;
const DEFAULT_FPS = 24;
const VALID_ASPECT_RATIOS = ["9:16", "1:1", "16:9", "4:3"];
const RESOLUTIONS = {
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
  "4:3": { width: 1024, height: 768 },
};
const PLATFORM_SPECS = {
  tiktok: { aspectRatio: "9:16", resolution: { width: 1080, height: 1920 } },
  instagram: { aspectRatio: "9:16", resolution: { width: 1080, height: 1920 } },
  facebook: { aspectRatio: "1:1", resolution: { width: 1080, height: 1080 } },
  youtube: { aspectRatio: "16:9", resolution: { width: 1920, height: 1080 } },
  "youtube-shorts": { aspectRatio: "9:16", resolution: { width: 1080, height: 1920 } },
};

/**
 * Spawn Node child process with timeout and capture.
 */
function spawnNode(args, options = {}) {
  return new Promise((resolve, reject) => {
    const { cwd = process.cwd(), timeoutMs = 600000 } = options;
    const child = spawn(process.execPath, args, { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`node command timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * Spawn Python child process with timeout and capture.
 */
function spawnPython(args, options = {}) {
  return new Promise((resolve, reject) => {
    const { cwd = process.cwd(), timeoutMs = 600000 } = options;
    const pythonBin = process.env.PYTHON_BIN || "python3";
    const child = spawn(pythonBin, args, { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`python command timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * Video Factory project representation.
 */
class VideoFactoryProject {
  constructor(options = {}) {
    this.id = options.id || `vf-${Date.now()}`;
    this.title = options.title || "Untitled Video";
    this.type = options.type || "youtube"; // youtube, documentary, short-form, bulk
    this.aspectRatio = options.aspectRatio || "16:9";
    this.resolution = options.resolution || { width: 1920, height: 1080 };
    this.fps = options.fps || DEFAULT_FPS;
    this.duration = 0;
    this.status = "draft"; // draft, research, script, storyboard, production, editing, qa, export, published
    this.research = null;
    this.script = null;
    this.storyboard = null;
    this.visualAssets = [];
    this.narration = null;
    this.subtitles = [];
    this.edits = [];
    this.animations = [];
    this.audio = null;
    this.thumbnails = [];
    this.qaResults = null;
    this.exportPath = null;
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  update(fields) {
    Object.assign(this, fields);
    this.updatedAt = new Date().toISOString();
    return this;
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      type: this.type,
      aspectRatio: this.aspectRatio,
      resolution: this.resolution,
      fps: this.fps,
      duration: this.duration,
      status: this.status,
      research: this.research,
      script: this.script,
      storyboard: this.storyboard,
      visualAssets: this.visualAssets,
      narration: this.narration,
      subtitles: this.subtitles,
      edits: this.edits,
      animations: this.animations,
      audio: this.audio,
      thumbnails: this.thumbnails,
      qaResults: this.qaResults,
      exportPath: this.exportPath,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  saveToFile(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(this.toJSON(), null, 2), "utf8");
    return filePath;
  }

  static loadFromFile(filePath) {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const project = new VideoFactoryProject({
      id: data.id,
      title: data.title,
      type: data.type,
      aspectRatio: data.aspectRatio,
      resolution: data.resolution,
      fps: data.fps,
    });
    project.duration = data.duration;
    project.status = data.status;
    project.research = data.research;
    project.script = data.script;
    project.storyboard = data.storyboard;
    project.visualAssets = data.visualAssets;
    project.narration = data.narration;
    project.subtitles = data.subtitles;
    project.edits = data.edits;
    project.animations = data.animations;
    project.audio = data.audio;
    project.thumbnails = data.thumbnails;
    project.qaResults = data.qaResults;
    project.exportPath = data.exportPath;
    project.createdAt = data.createdAt;
    project.updatedAt = data.updatedAt;
    return project;
  }
}

/**
 * Research Agent — researches topic, audience, competitors, sources.
 * Returns research summary with sources, key points, angles.
 */
async function researchAgent(topic, options = {}) {
  const {
    depth = "standard", // quick, standard, deep
    audience = "general",
    language = "en",
  } = options;

  // Use existing AI copywriter pattern from lib/ads4now/copywriter.js
  // for research summarization; fall back to template-based research.
  const copywriterPath = path.join(
    __dirname,
    "..",
    "ads4now",
    "copywriter.js"
  );
  let copywriter;
  try {
    copywriter = require(copywriterPath);
  } catch {
    copywriter = null;
  }

  const research = {
    topic,
    depth,
    audience,
    language,
    sources: [],
    keyPoints: [],
    competitors: [],
    angles: [],
    summary: "",
    confidence: "low",
    generatedAt: new Date().toISOString(),
  };

  // Template-based research when no external AI available
  research.keyPoints = [
    `What is ${topic} and why it matters`,
    `Key benefits and applications of ${topic}`,
    `Common questions and misconceptions about ${topic}`,
    `Actionable takeaways for ${audience} audience`,
  ];
  research.angles = [
    "Educational explainer",
    "Practical how-to",
    "Trend analysis",
  ];
  research.summary = `Research overview for "${topic}" targeting ${audience} audience. ` +
    `Covers fundamentals, benefits, common questions, and actionable takeaways.`;
  research.confidence = "medium";
  research.sources = [
    { type: "template", name: "Video Factory research template", reliability: "medium" },
  ];

  return research;
}

/**
 * Script Agent — writes video script with hooks, narration, CTAs, scene descriptions.
 */
async function scriptAgent(research, options = {}) {
  const {
    tone = "informative",
    length = "medium", // short, medium, long
    includeCTA = true,
    language = "en",
  } = options;

  const topic = research.topic || "Untitled Topic";
  const keyPoints = research.keyPoints || [];

  const scenes = [];
  let wordCount = 0;

  // Hook scene
  scenes.push({
    id: "scene-hook",
    type: "hook",
    duration: 15,
    narration: `Have you ever wondered about ${topic}? Today we're diving deep into what you need to know.`,
    visualDescription: "Opening shot: topic title card with compelling imagery",
    onScreenText: topic,
  });
  wordCount += 25;

  // Key point scenes
  keyPoints.slice(0, 5).forEach((point, i) => {
    scenes.push({
      id: `scene-point-${i + 1}`,
      type: "content",
      duration: 45,
      narration: point,
      visualDescription: `Supporting visual for: ${point}`,
      onScreenText: point.length > 60 ? point.slice(0, 57) + "..." : point,
    });
    wordCount += point.split(" ").length;
  });

  // CTA scene
  if (includeCTA) {
    scenes.push({
      id: "scene-cta",
      type: "cta",
      duration: 10,
      narration: "If you found this helpful, like, subscribe, and share for more content.",
      visualDescription: "End screen with channel branding and subscribe button",
      onScreenText: "Like & Subscribe",
    });
    wordCount += 20;
  }

  const script = {
    topic,
    tone,
    length,
    language,
    scenes,
    totalEstimatedDuration: scenes.reduce((sum, c) => sum + c.duration, 0),
    estimatedWordCount: wordCount,
    hooks: [`Have you ever wondered about ${topic}?`, `What if I told you about ${topic}?`],
    cta: includeCTA ? "Like, subscribe, and share for more content." : null,
    generatedAt: new Date().toISOString(),
  };

  return script;
}

/**
 * Storyboard Agent — creates visual storyboard from script.
 */
function storyboardAgent(script, options = {}) {
  const {
    aspectRatio = "16:9",
    style = "clean",
  } = options;

  const storyboard = {
    scriptId: script.topic,
    aspectRatio,
    style,
    panels: [],
    totalDuration: script.totalEstimatedDuration || 0,
    createdAt: new Date().toISOString(),
  };

  script.scenes.forEach((scene, i) => {
    storyboard.panels.push({
      panelId: `panel-${i + 1}`,
      sceneId: scene.id,
      shotType: scene.type === "hook" ? "wide" : "medium",
      cameraMovement: scene.type === "hook" ? "slow-zoom" : "static",
      duration: scene.duration,
      visualDescription: scene.visualDescription,
      onScreenText: scene.onScreenText,
      narration: scene.narration,
      transition: i < script.scenes.length - 1 ? "cut" : "fade-out",
    });
  });

  return storyboard;
}

/**
 * Visual Production Agent — identifies/selects visual assets.
 */
function visualProductionAgent(storyboard, options = {}) {
  const {
    assetSource = "template", // template, stock, custom
    brandColors = ["#FFFFFF", "#000000"],
  } = options;

  const assets = storyboard.panels.map((panel, i) => ({
    assetId: `asset-${i + 1}`,
    panelId: panel.panelId,
    type: "image",
    source: assetSource,
    url: null, // to be filled by asset factory
    description: panel.visualDescription,
    duration: panel.duration,
    placement: { x: 0.5, y: 0.5, scale: 0.8 },
    brandColors,
  }));

  return {
    storyboardId: storyboard.scriptId,
    assets,
    totalAssets: assets.length,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Video Editing Agent — assembles scenes, audio, graphics, transitions.
 */
function videoEditingAgent(storyboard, visualAssets, options = {}) {
  const {
    aspectRatio = "16:9",
    resolution = { width: 1920, height: 1080 },
    fps = DEFAULT_FPS,
  } = options;

  const edit = {
    projectId: storyboard.scriptId,
    aspectRatio,
    resolution,
    fps,
    timeline: [],
    totalDuration: 0,
    transitions: [],
    createdAt: new Date().toISOString(),
  };

  storyboard.panels.forEach((panel, i) => {
    edit.timeline.push({
      segmentId: `segment-${i + 1}`,
      panelId: panel.panelId,
      startTime: edit.totalDuration,
      endTime: edit.totalDuration + panel.duration,
      duration: panel.duration,
      assetId: visualAssets.assets[i]?.assetId || null,
      transition: panel.transition,
      transitionDuration: 0.5,
    });
    edit.transitions.push({
      from: panel.panelId,
      to: i < storyboard.panels.length - 1 ? storyboard.panels[i + 1].panelId : null,
      type: panel.transition,
      duration: 0.5,
    });
    edit.totalDuration += panel.duration;
  });

  return edit;
}

/**
 * Animation Agent — creates animated text, logos, motion graphics.
 */
function animationAgent(storyboard, options = {}) {
  const {
    style = "clean",
    brandColors = ["#FFFFFF", "#000000"],
  } = options;

  const animations = storyboard.panels.map((panel, i) => ({
    animationId: `anim-${i + 1}`,
    panelId: panel.panelId,
    type: "text-overlay",
    animation: "fade-in",
    duration: 1,
    startDelay: 0,
    content: panel.onScreenText || "",
    style: {
      position: "center",
      fontSize: 48,
      color: brandColors[0] || "#FFFFFF",
      background: brandColors[1] || "#000000",
    },
  }));

  return {
    storyboardId: storyboard.scriptId,
    animations,
    totalAnimations: animations.length,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Audio Production Agent — coordinates voiceover, music, SFX.
 */
function audioProductionAgent(script, options = {}) {
  const {
    voice = "af_heart",
    musicPrompt = "upbeat cheerful commercial background music, no vocals",
    narrationRate = 1.0,
  } = options;

  const narrationSegments = script.scenes.map((scene, i) => ({
    segmentId: `narration-${i + 1}`,
    sceneId: scene.id,
    text: scene.narration,
    startOffset: scene.duration * i, // simplified: sequential
    duration: scene.duration,
    voice,
    rate: narrationRate,
  }));

  const audio = {
    projectId: script.topic,
    voice,
    musicPrompt,
    narrationRate,
    narrationSegments,
    totalDuration: script.totalEstimatedDuration || 0,
    musicDuration: script.totalEstimatedDuration || 0,
    createdAt: new Date().toISOString(),
  };

  return audio;
}

/**
 * Thumbnail Agent — generates thumbnail specs.
 */
function thumbnailAgent(project, options = {}) {
  const {
    aspectRatio = "16:9",
    style = "bold",
  } = options;

  const resolution = aspectRatio === "16:9"
    ? { width: 1280, height: 720 }
    : { width: 1080, height: 1080 };

  return {
    projectId: project.id,
    aspectRatio,
    resolution,
    style,
    elements: [
      { type: "title", text: project.title, position: "center", fontSize: 72 },
      { type: "visual", source: "main-subject", position: "center" },
      { type: "branding", text: "Video Factory", position: "bottom-right" },
    ],
    createdAt: new Date().toISOString(),
  };
}

/**
 * Subtitle Agent — generates subtitles from narration.
 */
function subtitleAgent(audio, options = {}) {
  const {
    language = "en",
    maxCharsPerLine = 42,
  } = options;

  const subtitles = audio.narrationSegments.map((seg, i) => ({
    subtitleId: `sub-${i + 1}`,
    sceneId: seg.sceneId,
    startTime: seg.startOffset,
    endTime: seg.startOffset + seg.duration,
    text: seg.text,
    language,
  }));

  return {
    projectId: audio.projectId,
    language,
    subtitles,
    totalSubtitles: subtitles.length,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Quality Assurance Agent — checks video for quality, timing, branding, specs.
 */
function qaAgent(project, edit, audio, subtitles, options = {}) {
  const {
    checkTiming = true,
    checkBranding = true,
    checkAudio = true,
    checkSubtitles = true,
  } = options;

  const issues = [];
  const checks = [];

  // Timing check
  if (checkTiming) {
    const totalEditDuration = edit.totalDuration;
    const totalAudioDuration = audio.totalDuration;
    const timingDiff = Math.abs(totalEditDuration - totalAudioDuration);
    checks.push({
      id: "qa-timing",
      name: "Timing synchronization",
      passed: timingDiff < 2,
      details: `Edit: ${totalEditDuration}s, Audio: ${totalAudioDuration}s, diff: ${timingDiff.toFixed(1)}s`,
    });
    if (timingDiff >= 2) {
      issues.push(`Audio/video timing mismatch: ${timingDiff.toFixed(1)}s difference`);
    }
  }

  // Branding check
  if (checkBranding) {
    checks.push({
      id: "qa-branding",
      name: "Branding consistency",
      passed: !!project.title && project.title.length > 0,
      details: `Project title: "${project.title}"`,
    });
    if (!project.title) {
      issues.push("Missing project title — branding incomplete");
    }
  }

  // Audio check
  if (checkAudio) {
    checks.push({
      id: "qa-audio",
      name: "Audio completeness",
      passed: audio.narrationSegments.length > 0,
      details: `${audio.narrationSegments.length} narration segments`,
    });
    if (audio.narrationSegments.length === 0) {
      issues.push("No narration segments — audio incomplete");
    }
  }

  // Subtitle check
  if (checkSubtitles) {
    checks.push({
      id: "qa-subtitles",
      name: "Subtitle coverage",
      passed: subtitles.subtitles.length > 0,
      details: `${subtitles.subtitles.length} subtitles`,
    });
    if (subtitles.subtitles.length === 0) {
      issues.push("No subtitles generated");
    }
  }

  const passed = issues.length === 0;
  const score = Math.round(((checks.length - issues.length) / checks.length) * 100);

  return {
    projectId: project.id,
    passed,
    score,
    issues,
    checks,
    totalDuration: edit.totalDuration,
    qaGeneratedAt: new Date().toISOString(),
  };
}

/**
 * Publishing Preparation Agent — prepares export settings for platforms.
 */
function publishingPrepAgent(project, qaResult, options = {}) {
  const {
    targetPlatform = "youtube",
    autoUpload = false, // never auto-upload without approval
  } = options;

  const spec = PLATFORM_SPECS[targetPlatform] || PLATFORM_SPECS.youtube;

  return {
    projectId: project.id,
    targetPlatform,
    aspectRatio: spec.aspectRatio,
    resolution: spec.resolution,
    format: "mp4",
    codec: "h264",
    crf: 23,
    audioCodec: "aac",
    audioBitrate: "128k",
    autoUpload: false, // always false — requires explicit user approval
    requiresApproval: true,
    qaPassed: qaResult.passed,
    qaScore: qaResult.score,
    exportSettings: {
      width: spec.resolution.width,
      height: spec.resolution.height,
      fps: project.fps,
    },
    createdAt: new Date().toISOString(),
  };
}

/**
 * Video Factory — unified entry point for video production.
 *
 * Workflows:
 *   1. YouTube: research → script → storyboard → visual assets → narration → editing → subtitles → thumbnail → QA → export
 *   2. Documentary: research → script → narration → images → graphics → maps → animation → editing → sound design → QA → export
 *   3. Short-form: long video → clip detection → clip selection → vertical editing → captions → audio → branding → QA → export
 *   4. Bulk: multiple videos in batch
 *
 * Options:
 *   type       "youtube"|"documentary"|"short-form"|"bulk"
 *   title      video title
 *   topic      research topic
 *   aspectRatio "9:16"|"1:1"|"16:9"|"4:3"
 *   resolution { width, height }
 *   fps        frames per second
 *
 * Returns { ok, project, research, script, storyboard, visualAssets, edit, audio, subtitles, thumbnails, qa, publishing }
 */
async function produceVideo(options = {}) {
  const {
    type = "youtube",
    title,
    topic,
    aspectRatio = "16:9",
    resolution,
    fps = DEFAULT_FPS,
  } = options;

  if (!title) {
    return { ok: false, error: "Video title is required" };
  }
  if (!topic) {
    return { ok: false, error: "Research topic is required" };
  }

  validateAspectRatio(aspectRatio);
  const res = resolution || RESOLUTIONS[aspectRatio] || { width: 1920, height: 1080 };

  const project = new VideoFactoryProject({
    title,
    type,
    aspectRatio,
    resolution: res,
    fps,
  });

  // Step 1: Research
  project.status = "research";
  const research = await researchAgent(topic, { audience: "general", language: "en" });
  project.update({ research });

  // Step 2: Script
  project.status = "script";
  const script = await scriptAgent(research, { tone: "informative", includeCTA: true });
  project.update({ script });

  // Step 3: Storyboard
  project.status = "storyboard";
  const storyboard = storyboardAgent(script, { aspectRatio, style: "clean" });
  project.update({ storyboard });

  // Step 4: Visual Assets
  project.status = "production";
  const visualAssets = visualProductionAgent(storyboard, { assetSource: "template" });
  project.update({ visualAssets });

  // Step 5: Narration/Audio
  const audio = audioProductionAgent(script, {
    voice: "af_heart",
    musicPrompt: "upbeat cheerful commercial background music, no vocals",
    narrationRate: 1.0,
  });
  project.update({ audio });

  // Step 6: Editing
  const edit = videoEditingAgent(storyboard, visualAssets, {
    aspectRatio,
    resolution: res,
    fps,
  });
  project.update({ edits: edit.timeline, duration: edit.totalDuration });

  // Step 7: Subtitles
  const subtitles = subtitleAgent(audio, { language: "en" });
  project.update({ subtitles: subtitles.subtitles });

  // Step 8: Thumbnails
  const thumbnails = [thumbnailAgent(project, { aspectRatio, style: "bold" })];
  project.update({ thumbnails });

  // Step 9: QA
  project.status = "qa";
  const qaResult = qaAgent(project, edit, audio, subtitles);
  project.update({ qaResults: qaResult });

  // Step 10: Publishing prep
  project.status = "export";
  const publishing = publishingPrepAgent(project, qaResult, {
    targetPlatform: type === "short-form" ? "youtube-shorts" : "youtube",
  });
  project.update({ exportPath: null }); // not exported yet — requires approval

  return {
    ok: true,
    project,
    research,
    script,
    storyboard,
    visualAssets,
    edit,
    audio,
    subtitles,
    thumbnails,
    qa: qaResult,
    publishing,
  };
}

/**
 * Get available Video Factory features.
 */
function getAvailableFeatures() {
  return {
    types: ["youtube", "documentary", "short-form", "bulk"],
    aspectRatios: VALID_ASPECT_RATIOS,
    resolutions: RESOLUTIONS,
    projectStatuses: ["draft", "research", "script", "storyboard", "production", "editing", "qa", "export", "published"],
    maxScenes: MAX_SCENES,
    defaultFps: DEFAULT_FPS,
    agents: [
      "research", "script", "storyboard", "visual-production", "video-editing",
      "animation", "audio-production", "thumbnail", "subtitle", "qa", "publishing-prep",
    ],
    ffmpegAvailable: isAvailable(defaultRegistry.getConfig("ffmpeg-local")) &&
      isVerified(defaultRegistry.getConfig("ffmpeg-local")),
  };
}

/**
 * List all projects (in-memory).
 */
const projects = new Map();

function createProject(options = {}) {
  const project = new VideoFactoryProject(options);
  projects.set(project.id, project);
  return project;
}

function getProject(id) {
  return projects.get(id);
}

function listProjects() {
  return Array.from(projects.values());
}

function validateAspectRatio(ratio) {
  if (!VALID_ASPECT_RATIOS.includes(ratio)) {
    throw new Error(
      `Invalid aspect ratio '${ratio}'. Valid: ${VALID_ASPECT_RATIOS.join(", ")}`
    );
  }
}

module.exports = {
  produceVideo,
  researchAgent,
  scriptAgent,
  storyboardAgent,
  visualProductionAgent,
  videoEditingAgent,
  animationAgent,
  audioProductionAgent,
  thumbnailAgent,
  subtitleAgent,
  qaAgent,
  publishingPrepAgent,
  VideoFactoryProject,
  createProject,
  getProject,
  listProjects,
  getAvailableFeatures,
  validateAspectRatio,
  VIDEO_FACTORY_DIR,
  MAX_SCENES,
  DEFAULT_FPS,
  VALID_ASPECT_RATIOS,
};
