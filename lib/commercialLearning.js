// lib/commercialLearning.js
// Self-improving commercial builder engine for BossListers (100% local, zero paid APIs).
// Every commercial rendered logs its recipe + automated visual/technical QC scorecard into
// data/commercial-learning.json. Human ratings, feedback tags, and real buyer outcomes
// (DMs / inquiries / sales) immediately re-rank recipes per item category so each new
// commercial starts smarter than the last — while NEVER overriding explicit user choices.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_LEARNING_STORE_PATH = path.join(process.cwd(), "data", "commercial-learning.json");

const CATEGORIES = ["trading-card", "resale-bundle", "single-item"];

const EXPLORATION_BG_POOL = [
  "studio-spotlight",
  "gold-rays",
  "navy-gold",
  "obsidian-velvet",
  "emerald-vault",
  "warm-bokeh",
];

const EXPLORATION_TRANSITIONS = ["slide-left", "zoom", "fade", "slide-up"];

const DEFAULT_RECIPES_BY_CATEGORY = {
  "trading-card": {
    bgPreset: "studio-spotlight",
    bgDim: 0.24,
    bgMotion: "subtle",
    cardBgPreset: "transparent",
    frameStyle: "gold-frame",
    removeBg: "card",
    cutInTransition: "zoom",
    cutInLayout: "pip",
    autoCloseup: true,
    autoBundleCutins: false,
  },
  "resale-bundle": {
    bgPreset: "studio-spotlight",
    bgDim: 0.18,
    bgMotion: "subtle",
    cardBgPreset: "transparent",
    frameStyle: "floating",
    removeBg: "cutout",
    cutInTransition: "slide-left",
    cutInLayout: "full",
    autoCloseup: false,
    autoBundleCutins: true,
  },
  "single-item": {
    bgPreset: "studio-spotlight",
    bgDim: 0.20,
    bgMotion: "subtle",
    cardBgPreset: "transparent",
    frameStyle: "floating",
    removeBg: "cutout",
    cutInTransition: "fade",
    cutInLayout: "full",
    autoCloseup: false,
    autoBundleCutins: false,
  },
};

function clamp(val, min, max, fallback) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function round1(val) {
  return Math.round(Number(val) * 10) / 10;
}

function round2(val) {
  return Math.round(Number(val) * 100) / 100;
}

function resolveLearningStorePath(explicitPath) {
  if (explicitPath) return path.resolve(explicitPath);
  if (process.env.COMMERCIAL_LEARNING_PATH) return path.resolve(process.env.COMMERCIAL_LEARNING_PATH);
  return DEFAULT_LEARNING_STORE_PATH;
}

function createEmptyStore() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    runs: [],
    playbooks: {},
  };
}

function loadLearningStore(storePath) {
  const filePath = resolveLearningStorePath(storePath);
  if (!fs.existsSync(filePath)) {
    const empty = createEmptyStore();
    recomputePlaybooks(empty);
    return empty;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const store = {
      version: 1,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      playbooks: parsed.playbooks && typeof parsed.playbooks === "object" ? parsed.playbooks : {},
    };
    recomputePlaybooks(store);
    return store;
  } catch {
    const empty = createEmptyStore();
    recomputePlaybooks(empty);
    return empty;
  }
}

function saveLearningStore(store, storePath) {
  const filePath = resolveLearningStorePath(storePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  store.updatedAt = new Date().toISOString();
  const tmpPath = `${filePath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(tmpPath, filePath);
  return filePath;
}

/**
 * Classifies an item so cards, multi-item resale bundles, and single general products
 * each evolve their own tailored winning defaults.
 */
function detectItemCategory({
  isDirectItem = false,
  autoBundleCutins = false,
  title = "",
  subtitle = "",
  detailTag = "",
  cutIns = [],
} = {}) {
  const text = `${title} ${subtitle} ${detailTag}`.toLowerCase();
  const looksLikeBundle =
    Boolean(autoBundleCutins) ||
    /\b(bundle|2-item|two-item|3-item|lot|pair|set of \d|\d-pack|\d piece|\d-piece|combo)\b/i.test(text) ||
    (Array.isArray(cutIns) && cutIns.some((c) => c && String(c.id || "").includes("bundle-item")));

  if (looksLikeBundle) return "resale-bundle";
  if (isDirectItem) return "single-item";
  return "trading-card";
}

function normalizeRecipe(recipe, category) {
  const base = DEFAULT_RECIPES_BY_CATEGORY[category] || DEFAULT_RECIPES_BY_CATEGORY["trading-card"];
  const r = recipe && typeof recipe === "object" ? recipe : {};
  return {
    bgPreset: typeof r.bgPreset === "string" && r.bgPreset ? r.bgPreset : base.bgPreset,
    bgDim: round2(clamp(r.bgDim, 0, 0.92, base.bgDim)),
    bgMotion: r.bgMotion === "none" ? "none" : "subtle",
    cardBgPreset: typeof r.cardBgPreset === "string" && r.cardBgPreset ? r.cardBgPreset : base.cardBgPreset,
    frameStyle: typeof r.frameStyle === "string" && r.frameStyle ? r.frameStyle : base.frameStyle,
    removeBg: typeof r.removeBg === "string" && r.removeBg ? r.removeBg : base.removeBg,
    cutInTransition: typeof r.cutInTransition === "string" && r.cutInTransition ? r.cutInTransition : base.cutInTransition,
    cutInLayout: typeof r.cutInLayout === "string" && r.cutInLayout ? r.cutInLayout : base.cutInLayout,
    autoCloseup: typeof r.autoCloseup === "boolean" ? r.autoCloseup : base.autoCloseup,
    autoBundleCutins: typeof r.autoBundleCutins === "boolean" ? r.autoBundleCutins : base.autoBundleCutins,
  };
}

/**
 * Computes a run's combined effectiveness score (0-100):
 * - Starts from objective automated QC score.
 * - Blends in human star rating (1..5 -> 20..100) as soon as rated (45% weight).
 * - Applies concrete adjustments for feedback tags and real sales / DM inquiries so
 *   commercials that actually convert buyers rise to the top of the playbook.
 */
function computeEffectiveScore(run) {
  const qcScore =
    run && run.qc && typeof run.qc.overallScore === "number" && Number.isFinite(run.qc.overallScore)
      ? clamp(run.qc.overallScore, 0, 100, 75)
      : 75;

  const fb = run && run.feedback && typeof run.feedback === "object" ? run.feedback : {};
  let score = qcScore;

  if (typeof fb.rating === "number" && fb.rating >= 1 && fb.rating <= 5) {
    const humanScore = fb.rating * 20;
    score = qcScore * 0.55 + humanScore * 0.45;
  }

  const tags = Array.isArray(fb.tags) ? fb.tags : [];
  for (const tag of tags) {
    if (tag === "loved-backdrop" || tag === "clean-cutout" || tag === "great-cutins" || tag === "great-pacing") {
      score += 2.5;
    } else if (tag === "bg-too-dark" || tag === "bg-too-bright" || tag === "cutout-needs-work" || tag === "needs-more-cutins") {
      score -= 4.5;
    } else if (tag === "got-inquiries") {
      score += 6;
    } else if (tag === "item-sold") {
      score += 10;
    }
  }

  if (fb.sold) score += 8;
  if (typeof fb.inquiries === "number" && fb.inquiries > 0) {
    score += Math.min(8, fb.inquiries * 2);
  }
  if (typeof fb.views === "number" && fb.views >= 500) {
    score += Math.min(6, Math.log10(fb.views / 100) * 3);
  }

  return round1(clamp(score, 0, 100, qcScore));
}

function recencyWeight(index, total) {
  // Newer commercials carry slightly higher weight so recent improvements dominate stale runs
  if (total <= 1) return 1;
  const pos = index / Math.max(1, total - 1); // 0 oldest -> 1 newest
  return 0.7 + 0.6 * pos;
}

function pickWeightedBest(runs, extractor, fallbackValue) {
  const buckets = new Map();
  const total = runs.length;
  for (let i = 0; i < total; i += 1) {
    const run = runs[i];
    const key = extractor(run);
    if (key === undefined || key === null || key === "") continue;
    const w = recencyWeight(i, total);
    const cur = buckets.get(key) || { weightedSum: 0, weightTotal: 0, rawSum: 0, count: 0 };
    cur.weightedSum += run.effectiveScore * w;
    cur.weightTotal += w;
    cur.rawSum += run.effectiveScore;
    cur.count += 1;
    buckets.set(key, cur);
  }
  if (buckets.size === 0) return { best: fallbackValue, stats: {} };

  let bestKey = fallbackValue;
  let bestVal = -Infinity;
  const stats = {};

  for (const [key, b] of buckets.entries()) {
    const avg = b.weightedSum / Math.max(1e-6, b.weightTotal);
    stats[String(key)] = { avg: round1(b.rawSum / b.count), count: b.count };
    // Mild shrinkage toward prior (82) so a single noisy run doesn't wildly beat a proven winner
    const shrunk = (avg * b.count + 82 * 0.5) / (b.count + 0.5);
    if (shrunk > bestVal) {
      bestVal = shrunk;
      bestKey = key;
    }
  }
  return { best: bestKey, stats };
}

function calibrateBgDim(runs, baseDim) {
  if (!runs.length) return baseDim;
  // Take top-half scoring runs to anchor bgDim, then apply concrete QC + user contrast nudges
  const sorted = [...runs].sort((a, b) => b.effectiveScore - a.effectiveScore);
  const topSlice = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.6)));
  let dimSum = 0;
  let wSum = 0;
  for (const r of topSlice) {
    const d = r.recipe && typeof r.recipe.bgDim === "number" ? r.recipe.bgDim : baseDim;
    const w = Math.max(1, r.effectiveScore / 50);
    dimSum += d * w;
    wSum += w;
  }
  let calibrated = wSum > 0 ? dimSum / wSum : baseDim;

  // Apply explicit nudges from the most recent 5 runs' QC adjustments & human brightness tags
  const recent = runs.slice(-5);
  let nudge = 0;
  for (const r of recent) {
    const qcDelta = r.qc && r.qc.adjustments && typeof r.qc.adjustments.bgDimDelta === "number"
      ? r.qc.adjustments.bgDimDelta
      : 0;
    nudge += qcDelta * 0.6;
    const tags = r.feedback && Array.isArray(r.feedback.tags) ? r.feedback.tags : [];
    if (tags.includes("bg-too-bright")) nudge += 0.06;
    if (tags.includes("bg-too-dark")) nudge -= 0.06;
  }
  calibrated += clamp(nudge / Math.max(1, recent.length), -0.12, 0.14, 0);
  return round2(clamp(calibrated, 0.08, 0.72, baseDim));
}

function computeCategoryPlaybook(category, allRuns) {
  const base = DEFAULT_RECIPES_BY_CATEGORY[category] || DEFAULT_RECIPES_BY_CATEGORY["trading-card"];
  const catRuns = allRuns.filter((r) => r && r.category === category);

  if (catRuns.length === 0) {
    return {
      category,
      runCount: 0,
      avgScore: 0,
      bestScore: 0,
      trendDelta: 0,
      winningRecipe: { ...base },
      learnedRules: [
        `Baseline ${category} profile ready — renders and ratings will automatically optimize future reels.`,
      ],
      presetScores: {},
    };
  }

  for (const r of catRuns) {
    r.effectiveScore = computeEffectiveScore(r);
  }

  const scores = catRuns.map((r) => r.effectiveScore);
  const avgScore = round1(scores.reduce((a, b) => a + b, 0) / scores.length);
  const bestScore = round1(Math.max(...scores));

  let trendDelta = 0;
  if (catRuns.length >= 2) {
    const half = Math.max(1, Math.floor(catRuns.length / 2));
    const early = scores.slice(0, half);
    const late = scores.slice(-half);
    const earlyAvg = early.reduce((a, b) => a + b, 0) / early.length;
    const lateAvg = late.reduce((a, b) => a + b, 0) / late.length;
    trendDelta = round1(lateAvg - earlyAvg);
  }

  const bgPick = pickWeightedBest(catRuns, (r) => r.recipe && r.recipe.bgPreset, base.bgPreset);
  const stagePick = pickWeightedBest(catRuns, (r) => r.recipe && r.recipe.cardBgPreset, base.cardBgPreset);
  const framePick = pickWeightedBest(catRuns, (r) => r.recipe && r.recipe.frameStyle, base.frameStyle);
  const removePick = pickWeightedBest(catRuns, (r) => r.recipe && r.recipe.removeBg, base.removeBg);
  const transPick = pickWeightedBest(catRuns, (r) => r.recipe && r.recipe.cutInTransition, base.cutInTransition);
  const layoutPick = pickWeightedBest(catRuns, (r) => r.recipe && r.recipe.cutInLayout, base.cutInLayout);
  const closeupPick = pickWeightedBest(catRuns, (r) => String(Boolean(r.recipe && r.recipe.autoCloseup)), String(base.autoCloseup));
  const bundleCutinPick = pickWeightedBest(catRuns, (r) => String(Boolean(r.recipe && r.recipe.autoBundleCutins)), String(base.autoBundleCutins));

  // If QC or human feedback asked for more cut-ins on recent runs, automatically turn on auto cut-ins
  const recentNeedsCutins = catRuns.slice(-3).some((r) => {
    const tags = r.feedback && Array.isArray(r.feedback.tags) ? r.feedback.tags : [];
    const adj = r.qc && r.qc.adjustments ? r.qc.adjustments : {};
    return tags.includes("needs-more-cutins") || adj.recommendAutoCloseup || adj.recommendAutoBundleCutins;
  });

  const autoCloseup =
    category === "trading-card"
      ? (closeupPick.best === "true" || recentNeedsCutins)
      : closeupPick.best === "true";
  const autoBundleCutins =
    category === "resale-bundle"
      ? (bundleCutinPick.best === "true" || recentNeedsCutins)
      : false;

  const winningRecipe = {
    bgPreset: bgPick.best,
    bgDim: calibrateBgDim(catRuns, base.bgDim),
    bgMotion: "subtle",
    cardBgPreset: stagePick.best,
    frameStyle: framePick.best,
    removeBg: removePick.best,
    cutInTransition: transPick.best,
    cutInLayout: layoutPick.best,
    autoCloseup,
    autoBundleCutins,
  };

  // Build concise, factual learned rules from actual history
  const learnedRules = [];
  const bgStat = bgPick.stats[winningRecipe.bgPreset];
  if (bgStat) {
    learnedRules.push(
      `Top backdrop: ${winningRecipe.bgPreset} (${bgStat.avg}/100 avg across ${bgStat.count} ${bgStat.count === 1 ? "run" : "runs"})`
    );
  }
  learnedRules.push(
    `Calibrated scrim bgDim=${winningRecipe.bgDim} + ${winningRecipe.frameStyle} stage (${winningRecipe.removeBg === "none" ? "original photo" : `${winningRecipe.removeBg} bg-removal`})`
  );
  if (autoBundleCutins) {
    learnedRules.push(`Auto-split 2-item bundle cut-ins active (${winningRecipe.cutInTransition} transition)`);
  } else if (autoCloseup) {
    learnedRules.push(`Auto macro close-up cut-in active (${winningRecipe.cutInLayout} / ${winningRecipe.cutInTransition})`);
  }
  if (trendDelta > 0) {
    learnedRules.push(`Quality trending up +${trendDelta} pts across ${catRuns.length} ${category} commercials`);
  } else if (trendDelta < 0) {
    learnedRules.push(`Recent score dipped ${trendDelta} pts — calibrated recipe locked to top-scoring settings`);
  }

  return {
    category,
    runCount: catRuns.length,
    avgScore,
    bestScore,
    trendDelta,
    winningRecipe,
    learnedRules,
    presetScores: bgPick.stats,
  };
}

function recomputePlaybooks(store) {
  const runs = Array.isArray(store.runs) ? store.runs : [];
  store.playbooks = {};
  for (const cat of CATEGORIES) {
    store.playbooks[cat] = computeCategoryPlaybook(cat, runs);
  }
  return store.playbooks;
}

/**
 * Recommends the highest-performing learned recipe for a category, while NEVER overriding
 * any explicit parameter the user deliberately set. Optional `explore: true` tests an
 * untried backdrop or transition using UCB1-style exploration so the builder keeps discovering
 * better combinations over time.
 */
function recommendCommercialRecipe({
  category = "trading-card",
  explicitOverrides = {},
  storePath,
  explore = false,
} = {}) {
  const safeCat = CATEGORIES.includes(category) ? category : "trading-card";
  const store = loadLearningStore(storePath);
  const playbook = store.playbooks[safeCat] || computeCategoryPlaybook(safeCat, store.runs);
  const learned = { ...playbook.winningRecipe };
  const rationale = [...playbook.learnedRules];
  let explorationApplied = null;

  // Optional exploration: try an untested backdrop/transition only when caller didn't pin it
  if (explore && !explicitOverrides.bgPreset) {
    const tried = playbook.presetScores || {};
    const untried = EXPLORATION_BG_POOL.filter((p) => !tried[p]);
    if (untried.length > 0) {
      const candidate = untried[playbook.runCount % untried.length];
      learned.bgPreset = candidate;
      explorationApplied = { field: "bgPreset", value: candidate };
      rationale.push(`Exploration pass: testing untried backdrop "${candidate}" to compare against ${playbook.winningRecipe.bgPreset}`);
    } else if (!explicitOverrides.cutInTransition) {
      const nextTrans = EXPLORATION_TRANSITIONS[playbook.runCount % EXPLORATION_TRANSITIONS.length];
      learned.cutInTransition = nextTrans;
      explorationApplied = { field: "cutInTransition", value: nextTrans };
      rationale.push(`Exploration pass: testing "${nextTrans}" cut-in transition`);
    }
  }

  // Merge: explicit user overrides ALWAYS win
  const recipe = { ...learned };
  const appliedFromLearning = [];
  for (const key of Object.keys(learned)) {
    const override = explicitOverrides[key];
    if (override !== undefined && override !== null && override !== "") {
      recipe[key] = override;
    } else {
      appliedFromLearning.push(key);
    }
  }

  return {
    category: safeCat,
    recipe,
    appliedFromLearning,
    rationale,
    explorationApplied,
    categoryStats: {
      runCount: playbook.runCount,
      avgScore: playbook.avgScore,
      bestScore: playbook.bestScore,
      trendDelta: playbook.trendDelta,
    },
  };
}

/**
 * Records a completed commercial render + its automated QC audit, recomputing playbooks
 * so the very next commercial immediately benefits from what worked (and avoids what didn't).
 */
function recordCommercialRun(input, storePath) {
  const store = loadLearningStore(storePath);
  const category = CATEGORIES.includes(input.category)
    ? input.category
    : detectItemCategory(input);

  const prevPlaybook = store.playbooks[category] || computeCategoryPlaybook(category, store.runs);
  const prevBest = prevPlaybook.bestScore || 0;
  const prevAvg = prevPlaybook.avgScore || 0;

  const record = {
    id: input.id || `run-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`,
    createdAt: input.createdAt || new Date().toISOString(),
    category,
    title: String(input.title || "Untitled Commercial").slice(0, 200),
    fileName: String(input.fileName || ""),
    outputPath: String(input.outputPath || ""),
    prepStrategy: String(input.prepStrategy || "none"),
    cutInCount: Math.max(0, Number(input.cutInCount) || 0),
    recipe: normalizeRecipe(input.recipe, category),
    qc: input.qc || null,
    feedback: {
      rating: null,
      tags: [],
      notes: "",
      views: null,
      inquiries: null,
      sold: false,
    },
    effectiveScore: 75,
    ...(input.improvedFromRunId ? { improvedFromRunId: String(input.improvedFromRunId) } : {}),
  };

  record.effectiveScore = computeEffectiveScore(record);
  store.runs.push(record);
  // Keep latest 500 runs so file stays fast and compact forever
  if (store.runs.length > 500) {
    store.runs = store.runs.slice(-500);
  }

  recomputePlaybooks(store);
  const savedPath = saveLearningStore(store, storePath);
  const nextPlaybook = store.playbooks[category];

  return {
    run: record,
    playbook: nextPlaybook,
    storePath: savedPath,
    deltaFromPrevAvg: prevPlaybook.runCount > 0 ? round1(record.effectiveScore - prevAvg) : 0,
    isNewBest: prevPlaybook.runCount > 0 ? record.effectiveScore > prevBest : true,
  };
}

/**
 * Records human star rating, quick feedback tags, or real social/sales outcomes
 * on an existing commercial run and immediately updates the winning playbooks.
 */
function recordCommercialFeedback(feedbackInput, storePath) {
  if (!feedbackInput || !feedbackInput.runId) {
    throw new Error("runId is required to record commercial feedback");
  }
  const store = loadLearningStore(storePath);
  const idx = store.runs.findIndex((r) => r.id === feedbackInput.runId);
  if (idx === -1) {
    throw new Error(`Commercial run not found: ${feedbackInput.runId}`);
  }

  const run = store.runs[idx];
  const prevFb = run.feedback || {
    rating: null,
    tags: [],
    notes: "",
    views: null,
    inquiries: null,
    sold: false,
  };

  const nextFb = {
    rating:
      feedbackInput.rating !== undefined && feedbackInput.rating !== null
        ? Math.round(clamp(feedbackInput.rating, 1, 5, prevFb.rating || 3))
        : prevFb.rating,
    tags: Array.isArray(feedbackInput.tags)
      ? [...new Set(feedbackInput.tags.map((t) => String(t).trim()).filter(Boolean))].slice(0, 10)
      : prevFb.tags,
    notes:
      typeof feedbackInput.notes === "string"
        ? feedbackInput.notes.trim().slice(0, 400)
        : prevFb.notes,
    views:
      feedbackInput.views !== undefined && feedbackInput.views !== null
        ? Math.max(0, Math.round(Number(feedbackInput.views) || 0))
        : prevFb.views,
    inquiries:
      feedbackInput.inquiries !== undefined && feedbackInput.inquiries !== null
        ? Math.max(0, Math.round(Number(feedbackInput.inquiries) || 0))
        : prevFb.inquiries,
    sold:
      typeof feedbackInput.sold === "boolean"
        ? feedbackInput.sold
        : prevFb.sold || (Array.isArray(feedbackInput.tags) && feedbackInput.tags.includes("item-sold")),
    updatedAt: new Date().toISOString(),
  };

  run.feedback = nextFb;
  run.effectiveScore = computeEffectiveScore(run);
  recomputePlaybooks(store);
  saveLearningStore(store, storePath);

  return {
    run,
    playbook: store.playbooks[run.category],
  };
}

/**
 * Returns full progress summary for CLI --learning-report, API GET, and Video Studio UI.
 */
function summarizeLearningProgress(storePath) {
  const store = loadLearningStore(storePath);
  const runs = store.runs;
  const totalRuns = runs.length;
  const ratedRuns = runs.filter((r) => r.feedback && typeof r.feedback.rating === "number").length;
  const soldCount = runs.filter((r) => r.feedback && r.feedback.sold).length;

  let overallAvgScore = 0;
  let overallTrendDelta = 0;
  if (totalRuns > 0) {
    const scores = runs.map((r) => computeEffectiveScore(r));
    overallAvgScore = round1(scores.reduce((a, b) => a + b, 0) / scores.length);
    if (totalRuns >= 2) {
      const half = Math.max(1, Math.floor(totalRuns / 2));
      const earlyAvg = scores.slice(0, half).reduce((a, b) => a + b, 0) / half;
      const lateAvg = scores.slice(-half).reduce((a, b) => a + b, 0) / half;
      overallTrendDelta = round1(lateAvg - earlyAvg);
    }
  }

  return {
    ok: true,
    storePath: resolveLearningStorePath(storePath),
    totalRuns,
    ratedRuns,
    soldCount,
    overallAvgScore,
    overallTrendDelta,
    playbooks: store.playbooks,
    recentRuns: [...runs].reverse().slice(0, 15),
  };
}

module.exports = {
  CATEGORIES,
  DEFAULT_RECIPES_BY_CATEGORY,
  resolveLearningStorePath,
  detectItemCategory,
  computeEffectiveScore,
  loadLearningStore,
  saveLearningStore,
  recommendCommercialRecipe,
  recordCommercialRun,
  recordCommercialFeedback,
  summarizeLearningProgress,
};
