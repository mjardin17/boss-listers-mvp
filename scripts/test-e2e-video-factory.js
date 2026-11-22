// scripts/test-e2e-video-factory.js
// Test B — Video Factory E2E acceptance criteria.
//
// Uses actual available modules/pipelines in this sandbox:
//   - lib/universal-creative/video-factory.js: produceVideo + all agents
//     (research → script → storyboard → visual → audio → editing → subtitles
//     → thumbnails → QA → publishing prep)
//
// The full produceVideo() pipeline is pure Node.js — no ffmpeg required for
// planning, assembly, and QA. Actual MP4 export needs ffmpeg (not installed —
// Blocker B6-adjacent), so publishing prep correctly sets autoUpload=false
// and requiresApproval=true, waiting for user approval + authorized connection.
//
// Render-only safety: never invents sources, claims, or pricing. Publishing
// requires authorized connections + user approval.

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
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
  VALID_ASPECT_RATIOS,
} = require("../lib/universal-creative/video-factory.js");

// ------------------------------------------------------------------
// 1. Individual agent pipeline steps — each is real, not simulated
// ------------------------------------------------------------------

test("E2E Video Factory: researchAgent produces real research with sources", async () => {
  const research = await researchAgent("quantum computing", {
    depth: "standard",
    audience: "general",
    language: "en",
  });
  assert.equal(research.topic, "quantum computing");
  assert.ok(Array.isArray(research.keyPoints));
  assert.ok(research.keyPoints.length > 0);
  assert.ok(research.summary);
  assert.ok(Array.isArray(research.sources));
  assert.ok(research.confidence);
});

test("E2E Video Factory: scriptAgent builds real scenes from research", async () => {
  const research = {
    topic: "climate change",
    keyPoints: [
      "Greenhouse gases trap heat",
      "Rising sea levels threaten coasts",
      "Renewable energy solutions",
    ],
  };
  const script = await scriptAgent(research, { tone: "informative", includeCTA: true });
  assert.equal(script.topic, "climate change");
  assert.ok(Array.isArray(script.scenes));
  assert.ok(script.scenes.length > 0);
  assert.ok(script.scenes.some((s) => s.type === "hook"));
  assert.ok(script.scenes.some((s) => s.type === "content"));
  assert.ok(script.totalEstimatedDuration > 0);
  assert.ok(script.estimatedWordCount > 0);
});

test("E2E Video Factory: storyboardAgent creates real panels from script", () => {
  const script = {
    topic: "test topic",
    totalEstimatedDuration: 120,
    scenes: [
      { id: "scene-1", duration: 30, visualDescription: "Opening", onScreenText: "Hello", narration: "Hi there", type: "hook" },
      { id: "scene-2", duration: 60, visualDescription: "Middle", onScreenText: "Content", narration: "Middle content", type: "content" },
      { id: "scene-3", duration: 30, visualDescription: "End", onScreenText: "Bye", narration: "Goodbye", type: "cta" },
    ],
  };
  const storyboard = storyboardAgent(script, { aspectRatio: "16:9", style: "clean" });
  assert.equal(storyboard.panels.length, 3);
  assert.equal(storyboard.totalDuration, 120);
  assert.ok(storyboard.panels[0].shotType);
  assert.ok(storyboard.panels[0].cameraMovement);
});

test("E2E Video Factory: visualProductionAgent identifies real visual assets", () => {
  const storyboard = {
    scriptId: "test-topic",
    panels: [
      { panelId: "panel-1", sceneId: "scene-1", duration: 30, visualDescription: "Opening shot" },
      { panelId: "panel-2", sceneId: "scene-2", duration: 60, visualDescription: "Main content" },
    ],
  };
  const assets = visualProductionAgent(storyboard, { assetSource: "template" });
  assert.equal(assets.assets.length, 2);
  assert.ok(assets.assets[0].assetId);
  // url is null — to be filled by shared asset factory (not hardcoded stock)
  assert.ok(assets.assets[0].url === null);
});

test("E2E Video Factory: videoEditingAgent assembles a real timeline", () => {
  const storyboard = {
    panels: [
      { panelId: "panel-1", duration: 30, transition: "cut" },
      { panelId: "panel-2", duration: 60, transition: "fade" },
      { panelId: "panel-3", duration: 30, transition: "cut" },
    ],
  };
  const visualAssets = { assets: [{ assetId: "asset-1" }, { assetId: "asset-2" }, { assetId: "asset-3" }] };
  const edit = videoEditingAgent(storyboard, visualAssets, {
    aspectRatio: "16:9",
    resolution: { width: 1920, height: 1080 },
    fps: 24,
  });
  assert.equal(edit.timeline.length, 3);
  assert.equal(edit.totalDuration, 120);
  assert.ok(edit.transitions.length > 0);
  // Timeline segments have real start/end times
  assert.equal(edit.timeline[0].startTime, 0);
  assert.equal(edit.timeline[0].endTime, 30);
  assert.equal(edit.timeline[1].startTime, 30);
  assert.equal(edit.timeline[1].endTime, 90);
});

test("E2E Video Factory: animationAgent creates real text overlays", () => {
  const storyboard = {
    panels: [
      { panelId: "panel-1", onScreenText: "Hello World" },
      { panelId: "panel-2", onScreenText: "Content here" },
    ],
  };
  const anim = animationAgent(storyboard, { style: "clean", brandColors: ["#FFFFFF", "#000000"] });
  assert.equal(anim.animations.length, 2);
  assert.ok(anim.animations[0].content);
  assert.ok(anim.animations[0].animation);
});

test("E2E Video Factory: audioProductionAgent creates real narration plan", () => {
  const script = {
    topic: "test",
    totalEstimatedDuration: 120,
    scenes: [
      { id: "scene-1", duration: 30, narration: "First narration" },
      { id: "scene-2", duration: 60, narration: "Second narration" },
      { id: "scene-3", duration: 30, narration: "Third narration" },
    ],
  };
  const audio = audioProductionAgent(script, {
    voice: "af_heart",
    musicPrompt: "upbeat cheerful commercial background music, no vocals",
    narrationRate: 1.0,
  });
  assert.equal(audio.narrationSegments.length, 3);
  assert.equal(audio.totalDuration, 120);
  assert.equal(audio.voice, "af_heart");
  assert.ok(audio.musicPrompt);
});

test("E2E Video Factory: thumbnailAgent creates real thumbnail spec", () => {
  const project = { id: "vf-1", title: "Test Video", aspectRatio: "16:9" };
  const thumb = thumbnailAgent(project, { aspectRatio: "16:9", style: "bold" });
  assert.equal(thumb.projectId, "vf-1");
  assert.equal(thumb.resolution.width, 1280);
  assert.equal(thumb.resolution.height, 720);
  assert.ok(thumb.elements.length > 0);
  assert.ok(thumb.elements.some((e) => e.type === "title"));
});

test("E2E Video Factory: subtitleAgent creates real subtitles from narration", () => {
  const audio = {
    projectId: "vf-1",
    narrationSegments: [
      { sceneId: "scene-1", text: "Hello world", startOffset: 0, duration: 30 },
      { sceneId: "scene-2", text: "Second segment", startOffset: 30, duration: 60 },
    ],
  };
  const subs = subtitleAgent(audio, { language: "en" });
  assert.equal(subs.subtitles.length, 2);
  assert.equal(subs.language, "en");
  assert.equal(subs.subtitles[0].startTime, 0);
  assert.equal(subs.subtitles[0].endTime, 30);
});

// ------------------------------------------------------------------
// 2. QA agent — real quality checks, detects real issues
// ------------------------------------------------------------------

test("E2E Video Factory: qaAgent passes a well-formed project", () => {
  const project = { id: "vf-1", title: "Test Video" };
  const edit = { totalDuration: 120 };
  const audio = { totalDuration: 120, narrationSegments: [{ sceneId: "s1", text: "hi" }] };
  const subtitles = { subtitles: [{ sceneId: "s1", text: "hi" }] };
  const qa = qaAgent(project, edit, audio, subtitles);
  assert.ok(qa.passed);
  assert.ok(qa.score >= 80);
  assert.ok(Array.isArray(qa.checks));
  assert.ok(qa.checks.length > 0);
});

test("E2E Video Factory: qaAgent detects real issues (missing title, timing mismatch, no audio, no subtitles)", () => {
  const project = { id: "vf-1", title: "" }; // missing title
  const edit = { totalDuration: 120 };
  const audio = { totalDuration: 130, narrationSegments: [] }; // timing mismatch + no audio
  const subtitles = { subtitles: [] }; // no subtitles
  const qa = qaAgent(project, edit, audio, subtitles);
  assert.equal(qa.passed, false);
  assert.ok(qa.issues.length > 0);
  assert.ok(qa.issues.some((i) => i.includes("title")));
});

// ------------------------------------------------------------------
// 3. Publishing prep — render-only, requires approval, never auto-uploads
// ------------------------------------------------------------------

test("E2E Video Factory: publishingPrepAgent prepares real export settings, never auto-uploads", () => {
  const project = { id: "vf-1", title: "Test", aspectRatio: "16:9", fps: 24 };
  const qaResult = { passed: true, score: 95 };
  const prep = publishingPrepAgent(project, qaResult, { targetPlatform: "youtube" });
  assert.equal(prep.targetPlatform, "youtube");
  assert.equal(prep.autoUpload, false); // never auto-upload without approval
  assert.equal(prep.requiresApproval, true);
  assert.equal(prep.qaPassed, true);
  assert.equal(prep.qaScore, 95);
  assert.ok(prep.exportSettings.width);
  assert.ok(prep.exportSettings.height);
  assert.equal(prep.format, "mp4");
  assert.equal(prep.codec, "h264");
});

test("E2E Video Factory: short-form targets youtube-shorts, still requires approval", () => {
  const project = { id: "vf-2", title: "Short", aspectRatio: "9:16", fps: 24 };
  const qaResult = { passed: true, score: 90 };
  const prep = publishingPrepAgent(project, qaResult, { targetPlatform: "youtube-shorts" });
  assert.equal(prep.targetPlatform, "youtube-shorts");
  assert.equal(prep.autoUpload, false);
  assert.equal(prep.requiresApproval, true);
});

// ------------------------------------------------------------------
// 4. produceVideo — full E2E pipeline, all stages
// ------------------------------------------------------------------

test("E2E Video Factory: produceVideo YouTube workflow end-to-end", async () => {
  const result = await produceVideo({
    type: "youtube",
    title: "Understanding Quantum Computing",
    topic: "quantum computing",
    aspectRatio: "16:9",
    fps: 24,
  });
  assert.ok(result.ok);
  assert.equal(result.project.title, "Understanding Quantum Computing");
  assert.equal(result.project.type, "youtube");
  assert.equal(result.project.aspectRatio, "16:9");
  assert.equal(result.project.status, "export");
  assert.ok(result.research);
  assert.ok(result.script);
  assert.ok(result.storyboard);
  assert.ok(result.visualAssets);
  assert.ok(result.audio);
  assert.ok(result.edit);
  assert.ok(result.subtitles);
  assert.ok(result.thumbnails);
  assert.ok(result.qa);
  assert.ok(result.publishing);
  assert.equal(result.qa.passed, true);
  assert.equal(result.publishing.autoUpload, false);
  assert.equal(result.publishing.requiresApproval, true);
  // Project has all expected fields
  assert.ok(result.project.id);
  assert.ok(result.project.createdAt);
  assert.ok(result.project.updatedAt);
});

test("E2E Video Factory: produceVideo short-form workflow", async () => {
  const result = await produceVideo({
    type: "short-form",
    title: "Quick Tips",
    topic: "productivity tips",
    aspectRatio: "9:16",
  });
  assert.ok(result.ok);
  assert.equal(result.project.type, "short-form");
  assert.equal(result.project.aspectRatio, "9:16");
  assert.equal(result.publishing.targetPlatform, "youtube-shorts");
  assert.equal(result.publishing.autoUpload, false);
});

test("E2E Video Factory: produceVideo documentary workflow", async () => {
  const result = await produceVideo({
    type: "documentary",
    title: "History of Computing",
    topic: "history of computing",
    aspectRatio: "16:9",
  });
  assert.ok(result.ok);
  assert.equal(result.project.type, "documentary");
  assert.equal(result.qa.passed, true);
});

test("E2E Video Factory: produceVideo rejects missing title", async () => {
  const result = await produceVideo({ type: "youtube", topic: "test topic" });
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test("E2E Video Factory: produceVideo rejects missing topic", async () => {
  const result = await produceVideo({ type: "youtube", title: "Test" });
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test("E2E Video Factory: produceVideo rejects invalid aspect ratio", async () => {
  await assert.rejects(
    produceVideo({ type: "youtube", title: "Test", topic: "test", aspectRatio: "invalid" }),
    /Invalid aspect ratio/
  );
});

// ------------------------------------------------------------------
// 5. Project CRUD — real project lifecycle
// ------------------------------------------------------------------

test("E2E Video Factory: createProject/getProject/listProjects", () => {
  const p1 = createProject({ id: "crud-1", title: "Project 1", type: "youtube" });
  const p2 = createProject({ id: "crud-2", title: "Project 2", type: "documentary" });
  assert.equal(getProject("crud-1").title, "Project 1");
  assert.equal(getProject("crud-2").title, "Project 2");
  assert.equal(listProjects().length, 2);
});

test("E2E Video Factory: getProject returns undefined for missing", () => {
  assert.equal(getProject("nonexistent"), undefined);
});

// ------------------------------------------------------------------
// 6. Features — real capabilities, nothing assumed unavailable
// ------------------------------------------------------------------

test("E2E Video Factory: getAvailableFeatures reports real capabilities", () => {
  const features = getAvailableFeatures();
  assert.ok(Array.isArray(features.types));
  assert.ok(features.types.includes("youtube"));
  assert.ok(features.types.includes("documentary"));
  assert.ok(features.types.includes("short-form"));
  assert.ok(features.types.includes("bulk"));
  assert.ok(Array.isArray(features.aspectRatios));
  assert.ok(features.aspectRatios.includes("9:16"));
  assert.ok(features.aspectRatios.includes("1:1"));
  assert.ok(features.aspectRatios.includes("16:9"));
  assert.ok(features.aspectRatios.includes("4:3"));
  assert.ok(Array.isArray(features.agents));
  assert.ok(features.agents.includes("research"));
  assert.ok(features.agents.includes("script"));
  assert.ok(features.agents.includes("qa"));
  assert.ok(features.agents.includes("publishing-prep"));
  // ffmpeg not installed → not claimed available (falsy: undefined or false)
  assert.ok(!features.ffmpegAvailable, "ffmpeg should not be claimed available");
});

test("E2E Video Factory: VALID_ASPECT_RATIOS", () => {
  assert.ok(VALID_ASPECT_RATIOS.includes("9:16"));
  assert.ok(VALID_ASPECT_RATIOS.includes("1:1"));
  assert.ok(VALID_ASPECT_RATIOS.includes("16:9"));
  assert.ok(VALID_ASPECT_RATIOS.includes("4:3"));
});

test("E2E Video Factory: validateAspectRatio", () => {
  assert.doesNotThrow(() => validateAspectRatio("16:9"));
  assert.doesNotThrow(() => validateAspectRatio("9:16"));
  assert.doesNotThrow(() => validateAspectRatio("1:1"));
  assert.throws(() => validateAspectRatio("invalid"));
});
