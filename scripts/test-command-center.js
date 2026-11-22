#!/usr/bin/env node
/**
 * M12 Command Center Tests
 */

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  getDashboardData,
  initiateCommercialJob,
  initiateVideoJob,
  getProductionHistory,
  MAX_HISTORY,
} = require("../lib/universal-creative/command-center.js");

test("getDashboardData returns dashboard structure", () => {
  const data = getDashboardData();
  assert.ok(data.timestamp);
  assert.ok(data.environments);
  assert.ok(data.environments.commercialMaker);
  assert.ok(data.environments.videoFactory);
  assert.ok(Array.isArray(data.applicationRegistry));
  assert.ok(data.applicationRegistry.length > 0);
  assert.ok(Array.isArray(data.agentActivity));
  assert.ok(data.jobStats);
  assert.ok(data.sharedAssetLibrary);
  assert.ok(data.modelAssignments);
  assert.ok(data.qualityControl);
  assert.ok(data.errorsAndBlockers);
  assert.ok(data.errorsAndBlockers.errors);
  assert.ok(data.errorsAndBlockers.blockers);
  assert.ok(data.resourceUsage);
  assert.ok(data.resourceLimits);
  assert.ok(Array.isArray(data.productionHistory));
  assert.ok(data.learningCore);
  assert.ok(data.crosspost);
  assert.ok(Array.isArray(data.recentAuditLogs));
});

test("dashboard has expected environments", () => {
  const data = getDashboardData();
  assert.equal(data.environments.commercialMaker.available, true);
  assert.ok(Array.isArray(data.environments.commercialMaker.modes));
  assert.equal(data.environments.videoFactory.available, true);
  assert.ok(Array.isArray(data.environments.videoFactory.types));
});

test("dashboard app registry has expected fields", () => {
  const data = getDashboardData();
  const app = data.applicationRegistry[0];
  assert.ok(app.id);
  assert.ok(app.name);
  assert.ok(app.method);
  assert.ok(app.category);
  assert.ok(app.status);
  assert.ok(typeof app.verified === "boolean");
  assert.ok(typeof app.productionReady === "boolean");
});

test("MAX_HISTORY is defined", () => {
  assert.ok(MAX_HISTORY > 0);
});

test("getProductionHistory returns array", () => {
  const history = getProductionHistory();
  assert.ok(Array.isArray(history));
});

test("initiateCommercialJob requires product title", async () => {
  const result = await initiateCommercialJob({});
  assert.ok(!result.ok);
  assert.equal(result.error, "Product with title is required");
});

test("initiateCommercialJob requires product object", async () => {
  const result = await initiateCommercialJob({ product: null });
  assert.ok(!result.ok);
  assert.equal(result.error, "Product with title is required");
});

test("initiateVideoJob requires title and topic", async () => {
  const result = await initiateVideoJob({});
  assert.ok(!result.ok);
  assert.equal(result.error, "Title and topic are required");
});

test("initiateVideoJob requires topic", async () => {
  const result = await initiateVideoJob({ title: "Test" });
  assert.ok(!result.ok);
  assert.equal(result.error, "Title and topic are required");
});
