#!/usr/bin/env node
/**
 * Universal Creative Production Connector — Learning Core
 *
 * Unified learning infrastructure for both Video Factory and Commercial Maker:
 *   - Learn from successful productions, failed renders, incorrect scenes,
 *     audio sync errors, QC failures, user corrections, model comparisons,
 *     workflow improvements
 *   - Convert verified improvements into reusable skills
 *   - Create regression tests from recurring failures
 *   - Track which agents, models, applications, workflows produce best results
 *   - Never permanently learn from unverified output
 *
 * Extends existing lib/commercialLearning.js pattern without replacing it.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { dataPath } = require("./data-dir.js");

const LEARNING_STORE = process.env.LEARNING_STORE || dataPath("learning-core.json");
const SKILL_STORE = process.env.SKILL_STORE || dataPath("skills-core.json");
const REGRESSION_STORE = process.env.REGRESSION_STORE || dataPath("regression-core.json");

const DOMAINS = ["commercial", "video-factory", "shared"];
const LEARNING_TYPES = [
  "success",
  "failure",
  "production",
  "correction",
  "model-comparison",
  "workflow-improvement",
  "qa-failure",
];

/**
 * Ensure store files exist.
 */
function ensureStore(file) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify({ entries: [], nextId: 1 }, null, 2), "utf8");
  }
}

/**
 * Load a JSON store.
 */
function loadStore(file) {
  ensureStore(file);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * Save a JSON store.
 */
function saveStore(file, data) {
  ensureStore(file);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

/**
 * Record a learning event from a production.
 * Only verified output is permanently learned from.
 */
function recordLearningEvent(options = {}) {
  const {
    domain = "shared",
    type = "success",
    agentId = null,
    modelId = null,
    applicationId = null,
    workflowId = null,
    productionId = null,
    input = null,
    output = null,
    qualityScore = null,
    verified = false,
    userCorrection = null,
    lessonsLearned = [],
    skillsGained = [],
    metadata = {},
  } = options;

  if (!DOMAINS.includes(domain)) {
    return { ok: false, error: `Invalid domain. Valid: ${DOMAINS.join(", ")}` };
  }
  if (!LEARNING_TYPES.includes(type)) {
    return { ok: false, error: `Invalid type. Valid: ${LEARNING_TYPES.join(", ")}` };
  }

  // Never permanently learn from unverified output
  const storeEntry = {
    id: `learn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    domain,
    type,
    agentId,
    modelId,
    applicationId,
    workflowId,
    productionId,
    input,
    output: verified ? output : null, // null out output if not verified
    qualityScore,
    verified,
    userCorrection: verified ? userCorrection : null,
    lessonsLearned: verified ? lessonsLearned : [],
    skillsGained: verified ? skillsGained : [],
    metadata,
    createdAt: new Date().toISOString(),
  };

  const store = loadStore(LEARNING_STORE);
  store.entries.push(storeEntry);
  store.nextId = (store.nextId || 1) + 1;
  saveStore(LEARNING_STORE, store);

  return { ok: true, entry: storeEntry };
}

/**
 * Get learning events with optional filtering.
 */
function getLearningEvents(filter = {}) {
  const store = loadStore(LEARNING_STORE);
  let entries = store.entries;

  if (filter.domain) entries = entries.filter((e) => e.domain === filter.domain);
  if (filter.type) entries = entries.filter((e) => e.type === filter.type);
  if (filter.agentId) entries = entries.filter((e) => e.agentId === filter.agentId);
  if (filter.modelId) entries = entries.filter((e) => e.modelId === filter.modelId);
  if (filter.workflowId) entries = entries.filter((e) => e.workflowId === filter.workflowId);
  if (filter.verified !== undefined) entries = entries.filter((e) => e.verified === filter.verified);
  if (filter.productionId) entries = entries.filter((e) => e.productionId === filter.productionId);

  return entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Record a verified skill gained from learning.
 */
function recordSkill(options = {}) {
  const {
    skillId = `skill-${Date.now()}`,
    name,
    description,
    domain = "shared",
    sourceEventId = null,
    agents = [],
    models = [],
    applications = [],
    workflows = [],
    successRate = null,
    usageCount = 0,
    verified = false,
  } = options;

  if (!verified) {
    return { ok: false, error: "Skill must be verified before recording" };
  }

  const store = loadStore(SKILL_STORE);
  const skill = {
    skillId,
    name,
    description,
    domain,
    sourceEventId,
    agents,
    models,
    applications,
    workflows,
    successRate,
    usageCount,
    verified,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  store.entries.push(skill);
  saveStore(SKILL_STORE, store);

  return { ok: true, skill };
}

/**
 * Get all skills, optionally filtered.
 */
function getSkills(filter = {}) {
  const store = loadStore(SKILL_STORE);
  let skills = store.entries;

  if (filter.domain) skills = skills.filter((s) => s.domain === filter.domain);
  if (filter.verified !== undefined) skills = skills.filter((s) => s.verified === filter.verified);

  return skills.sort((a, b) => (b.successRate || 0) - (a.successRate || 0));
}

/**
 * Record a regression test from a recurring failure.
 */
function recordRegressionTest(options = {}) {
  const {
    testId = `regression-${Date.now()}`,
    name,
    description,
    failurePattern = null,
    relatedEventIds = [],
    testScript = null,
    expectedResult = null,
    domain = "shared",
    verified = false,
  } = options;

  if (!verified) {
    return { ok: false, error: "Regression test must be verified before recording" };
  }

  const store = loadStore(REGRESSION_STORE);
  const test = {
    testId,
    name,
    description,
    failurePattern,
    relatedEventIds,
    testScript,
    expectedResult,
    domain,
    verified,
    lastRun: null,
    lastResult: null,
    runCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  store.entries.push(test);
  saveStore(REGRESSION_STORE, store);

  return { ok: true, test };
}

/**
 * Get regression tests.
 */
function getRegressionTests(filter = {}) {
  const store = loadStore(REGRESSION_STORE);
  let tests = store.entries;

  if (filter.domain) tests = tests.filter((t) => t.domain === filter.domain);
  if (filter.verified !== undefined) tests = tests.filter((t) => t.verified === filter.verified);

  return tests;
}

/**
 * Run a regression test (placeholder — actual execution depends on test script).
 */
function runRegressionTest(testId) {
  const store = loadStore(REGRESSION_STORE);
  const test = store.entries.find((t) => t.testId === testId);
  if (!test) {
    return { ok: false, error: `Regression test not found: ${testId}` };
  }

  test.runCount = (test.runCount || 0) + 1;
  test.lastRun = new Date().toISOString();
  test.lastResult = "passed"; // placeholder — actual execution would determine this
  test.updatedAt = new Date().toISOString();

  saveStore(REGRESSION_STORE, store);

  return { ok: true, test };
}

/**
 * Get learning statistics.
 */
function getLearningStats() {
  const store = loadStore(LEARNING_STORE);
  const entries = store.entries;

  const byDomain = {};
  const byType = {};
  const byVerified = { true: 0, false: 0 };
  let totalQualityScore = 0;
  let qualityCount = 0;

  for (const e of entries) {
    byDomain[e.domain] = (byDomain[e.domain] || 0) + 1;
    byType[e.type] = (byType[e.type] || 0) + 1;
    byVerified[e.verified] = (byVerified[e.verified] || 0) + 1;
    if (e.qualityScore !== null) {
      totalQualityScore += e.qualityScore;
      qualityCount++;
    }
  }

  const skillStore = loadStore(SKILL_STORE);
  const regressionStore = loadStore(REGRESSION_STORE);

  return {
    totalEvents: entries.length,
    byDomain,
    byType,
    byVerified,
    averageQualityScore: qualityCount > 0 ? totalQualityScore / qualityCount : null,
    totalSkills: skillStore.entries.length,
    verifiedSkills: skillStore.entries.filter((s) => s.verified).length,
    totalRegressionTests: regressionStore.entries.length,
    verifiedRegressionTests: regressionStore.entries.filter((t) => t.verified).length,
  };
}

/**
 * Get best-performing agents/models/workflows based on learning data.
 */
function getTopPerformers(filter = {}) {
  const store = loadStore(LEARNING_STORE);
  const verified = store.entries.filter((e) => e.verified && e.qualityScore !== null);

  const byAgent = {};
  const byModel = {};
  const byWorkflow = {};

  for (const e of verified) {
    if (e.agentId) {
      if (!byAgent[e.agentId]) byAgent[e.agentId] = { scores: [], count: 0 };
      byAgent[e.agentId].scores.push(e.qualityScore);
      byAgent[e.agentId].count++;
    }
    if (e.modelId) {
      if (!byModel[e.modelId]) byModel[e.modelId] = { scores: [], count: 0 };
      byModel[e.modelId].scores.push(e.qualityScore);
      byModel[e.modelId].count++;
    }
    if (e.workflowId) {
      if (!byWorkflow[e.workflowId]) byWorkflow[e.workflowId] = { scores: [], count: 0 };
      byWorkflow[e.workflowId].scores.push(e.qualityScore);
      byWorkflow[e.workflowId].count++;
    }
  }

  const avg = (scores) => scores.reduce((a, b) => a + b, 0) / scores.length;

  const topAgents = Object.entries(byAgent)
    .map(([id, data]) => ({ id, avgScore: avg(data.scores), count: data.count }))
    .sort((a, b) => b.avgScore - a.avgScore);

  const topModels = Object.entries(byModel)
    .map(([id, data]) => ({ id, avgScore: avg(data.scores), count: data.count }))
    .sort((a, b) => b.avgScore - a.avgScore);

  const topWorkflows = Object.entries(byWorkflow)
    .map(([id, data]) => ({ id, avgScore: avg(data.scores), count: data.count }))
    .sort((a, b) => b.avgScore - a.avgScore);

  return { topAgents, topModels, topWorkflows };
}

module.exports = {
  recordLearningEvent,
  getLearningEvents,
  recordSkill,
  getSkills,
  recordRegressionTest,
  getRegressionTests,
  runRegressionTest,
  getLearningStats,
  getTopPerformers,
  DOMAINS,
  LEARNING_TYPES,
  LEARNING_STORE,
  SKILL_STORE,
  REGRESSION_STORE,
};
