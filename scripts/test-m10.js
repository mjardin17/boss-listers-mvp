const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Set test env vars before requiring modules
const TEST_DIR = path.join(os.tmpdir(), `m10-test-${Date.now()}`);
process.env.LEARNING_STORE = path.join(TEST_DIR, "learning.json");
process.env.SKILL_STORE = path.join(TEST_DIR, "skills.json");
process.env.REGRESSION_STORE = path.join(TEST_DIR, "regression.json");
process.env.ARENA_EVAL_STORE = path.join(TEST_DIR, "arena-eval.json");
process.env.ARENA_SCORECARD_STORE = path.join(TEST_DIR, "scorecard.json");

// Clear cache and require
delete require.cache[require.resolve("../lib/universal-creative/learning-core.js")];
delete require.cache[require.resolve("../lib/universal-creative/empire-memory.js")];
delete require.cache[require.resolve("../lib/universal-creative/arena-evaluation.js")];

const {
  recordLearningEvent,
  getLearningEvents,
  recordSkill,
  getSkills,
  recordRegressionTest,
  getRegressionTests,
  runRegressionTest,
  getLearningStats,
  getTopPerformers,
} = require("../lib/universal-creative/learning-core.js");

const {
  recordProductionMemory,
  getProductionHistory,
  getMemorySummary,
  getTransferableSkills,
  recordUserCorrection,
  getDomainLeaders,
} = require("../lib/universal-creative/empire-memory.js");

const {
  createEvaluation,
  runEvaluation,
  getEvaluation,
  listEvaluations,
  getModelScorecard,
  getRecommendedModel,
  getMetricCategories,
  getPaidCreditUsage,
  canUsePaidCredits,
} = require("../lib/universal-creative/arena-evaluation.js");

// ---------------------------------------------------------------
// Learning Core tests
// ---------------------------------------------------------------

test("recordLearningEvent records verified event", () => {
  const result = recordLearningEvent({
    domain: "commercial",
    type: "success",
    agentId: "agent-1",
    productionId: "prod-1",
    input: "test input",
    output: "test output",
    qualityScore: 95,
    verified: true,
    lessonsLearned: ["RMBG-1.4 works well for product cutouts"],
    skillsGained: ["product-photography"],
  });
  assert.ok(result.ok);
  assert.ok(result.entry);
  assert.equal(result.entry.domain, "commercial");
  assert.equal(result.entry.verified, true);
  assert.equal(result.entry.qualityScore, 95);
  assert.equal(result.entry.output, "test output"); // verified output preserved
});

test("recordLearningEvent does not store unverified output", () => {
  const result = recordLearningEvent({
    domain: "video-factory",
    type: "failure",
    productionId: "prod-2",
    output: "sensitive-output-data",
    verified: false,
  });
  assert.ok(result.ok);
  assert.equal(result.entry.output, null); // unverified output nulled
  assert.equal(result.entry.verified, false);
});

test("getLearningEvents with filters", () => {
  const events = getLearningEvents({ domain: "commercial" });
  assert.ok(events.length >= 1);
  assert.ok(events.every((e) => e.domain === "commercial"));

  const verified = getLearningEvents({ verified: true });
  assert.ok(verified.length >= 1);
  assert.ok(verified.every((e) => e.verified === true));
});

test("recordSkill requires verification", () => {
  const result = recordSkill({
    skillId: "skill-1",
    name: "Test Skill",
    description: "A test skill",
    verified: false,
  });
  assert.ok(!result.ok);
  assert.ok(result.error);
});

test("recordSkill records verified skill", () => {
  const result = recordSkill({
    skillId: "skill-2",
    name: "Product Photography",
    description: "Expert product photo preparation",
    domain: "commercial",
    agents: ["product-photography"],
    successRate: 0.95,
    verified: true,
  });
  assert.ok(result.ok);
  assert.ok(result.skill);
  assert.equal(result.skill.verified, true);
});

test("getSkills", () => {
  const skills = getSkills({ verified: true });
  assert.ok(skills.length >= 1);
  assert.ok(skills.every((s) => s.verified === true));
});

test("recordRegressionTest requires verification", () => {
  const result = recordRegressionTest({
    testId: "reg-1",
    name: "Test Regression",
    description: "A regression test",
    verified: false,
  });
  assert.ok(!result.ok);
});

test("recordRegressionTest records verified test", () => {
  const result = recordRegressionTest({
    testId: "reg-2",
    name: "Audio Sync Regression",
    description: "Test for audio sync failures",
    domain: "video-factory",
    verified: true,
  });
  assert.ok(result.ok);
  assert.ok(result.test);
});

test("getRegressionTests", () => {
  const tests = getRegressionTests({ verified: true });
  assert.ok(tests.length >= 1);
});

test("runRegressionTest", () => {
  const result = runRegressionTest("reg-2");
  assert.ok(result.ok);
  assert.equal(result.test.runCount, 1);
  assert.ok(result.test.lastRun);
});

test("getLearningStats", () => {
  const stats = getLearningStats();
  assert.ok(stats.totalEvents >= 2);
  assert.ok(stats.byDomain);
  assert.ok(stats.byType);
  assert.ok(stats.byVerified);
});

test("getTopPerformers", () => {
  const performers = getTopPerformers();
  assert.ok(performers.topAgents);
  assert.ok(performers.topModels);
  assert.ok(performers.topWorkflows);
});

// ---------------------------------------------------------------
// Empire Memory tests
// ---------------------------------------------------------------

test("recordProductionMemory records production", () => {
  const result = recordProductionMemory({
    domain: "commercial",
    productionId: "prod-memory-1",
    agentId: "commercial-director",
    qualityScore: 90,
    verified: true,
  });
  assert.ok(result.ok);
});

test("getProductionHistory", () => {
  const history = getProductionHistory({ domain: "commercial" });
  assert.ok(history.length >= 1);
});

test("getMemorySummary", () => {
  const summary = getMemorySummary("commercial");
  assert.equal(summary.domain, "commercial");
  assert.ok(summary.totalMemories >= 1);
  assert.ok(summary.recentEvents);
});

test("getTransferableSkills", () => {
  const result = getTransferableSkills("commercial", "video-factory");
  assert.equal(result.sourceDomain, "commercial");
  assert.equal(result.targetDomain, "video-factory");
  assert.ok(Array.isArray(result.transferableSkills));
});

test("recordUserCorrection", () => {
  const result = recordUserCorrection({
    domain: "commercial",
    productionId: "prod-correction-1",
    correctionReason: "Price was invented — should not have been",
    verified: true,
  });
  assert.ok(result.ok);
  assert.equal(result.entry.type, "correction");
});

test("getDomainLeaders", () => {
  const leaders = getDomainLeaders("commercial");
  assert.equal(leaders.domain, "commercial");
  assert.ok(Array.isArray(leaders.topAgents));
  assert.ok(Array.isArray(leaders.topModels));
  assert.ok(Array.isArray(leaders.topWorkflows));
});

// ---------------------------------------------------------------
// Arena Evaluation tests
// ---------------------------------------------------------------

test("getMetricCategories", () => {
  const categories = getMetricCategories();
  assert.ok(Array.isArray(categories));
  assert.ok(categories.includes("script-quality"));
  assert.ok(categories.includes("video-quality"));
  assert.ok(categories.includes("audio-quality"));
});

test("canUsePaidCredits defaults to false", () => {
  assert.equal(canUsePaidCredits(), false);
});

test("getPaidCreditUsage", () => {
  const usage = getPaidCreditUsage();
  assert.equal(usage.authorized, false);
  assert.equal(usage.consumed, 0);
});

test("createEvaluation requires at least 2 models", () => {
  const result = createEvaluation({
    name: "Single Model Test",
    taskType: "script",
    models: [{ modelId: "model-1", modelName: "Model 1", tier: "local" }],
  });
  assert.ok(!result.ok);
  assert.ok(result.error);
});

test("createEvaluation with paid models requires authorization", () => {
  const result = createEvaluation({
    name: "Paid Model Test",
    taskType: "script",
    models: [
      { modelId: "model-1", modelName: "Model 1", tier: "local" },
      { modelId: "model-2", modelName: "Model 2", tier: "paid" },
    ],
  });
  assert.ok(!result.ok);
  assert.ok(result.error);
});

test("createEvaluation with local models succeeds", () => {
  const result = createEvaluation({
    name: "Local Model Comparison",
    taskType: "script",
    models: [
      { modelId: "model-a", modelName: "Model A", tier: "local" },
      { modelId: "model-b", modelName: "Model B", tier: "local" },
    ],
    metrics: ["script-quality", "instruction-accuracy"],
  });
  assert.ok(result.ok);
  assert.ok(result.evaluation);
  assert.equal(result.evaluation.status, "pending");
  assert.equal(result.evaluation.models.length, 2);
});

test("runEvaluation completes and generates scorecards", async () => {
  const createResult = createEvaluation({
    name: "Script Quality Test",
    taskType: "script",
    models: [
      { modelId: "model-a", modelName: "Model A", tier: "local" },
      { modelId: "model-b", modelName: "Model B", tier: "local" },
    ],
    metrics: ["script-quality", "instruction-accuracy", "completion-rate"],
  });
  assert.ok(createResult.ok);

  const runResult = await runEvaluation(createResult.evaluation.id);
  assert.ok(runResult.ok);
  assert.equal(runResult.evaluation.status, "completed");
  assert.ok(runResult.evaluation.scorecards);
  assert.equal(runResult.evaluation.scorecards.length, 2);
  assert.ok(runResult.evaluation.winner);
});

test("getEvaluation retrieves evaluation", () => {
  // Create one first
  const createResult = createEvaluation({
    name: "Retrieve Test",
    taskType: "image",
    models: [
      { modelId: "model-x", modelName: "Model X", tier: "local" },
      { modelId: "model-y", modelName: "Model Y", tier: "local" },
    ],
  });
  const eval = getEvaluation(createResult.evaluation.id);
  assert.ok(eval);
  assert.equal(eval.id, createResult.evaluation.id);
});

test("listEvaluations", () => {
  const evals = listEvaluations();
  assert.ok(Array.isArray(evals));
  assert.ok(evals.length >= 1);
});

test("getModelScorecard", () => {
  // Create and run an evaluation first
  const createResult = createEvaluation({
    name: "Scorecard Test",
    taskType: "script",
    models: [
      { modelId: "score-model", modelName: "Score Model", tier: "local" },
      { modelId: "other-model", modelName: "Other Model", tier: "local" },
    ],
  });
  // Don't run — just check that getModelScorecard handles no results
  const result = getModelScorecard("nonexistent-model");
  assert.ok(!result.ok);
  assert.ok(result.error);
});

test("getRecommendedModel", () => {
  const result = getRecommendedModel("script");
  assert.ok(result.recommendations);
  assert.ok(result.note);
});
