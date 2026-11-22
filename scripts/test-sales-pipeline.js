#!/usr/bin/env node
/**
 * Sales Pipeline Tests — M13 Sales & Marketing Factory
 */

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Use temp dir for pipeline tests
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-test-"));
process.env.PIPELINE_DIR = tmpDir;
process.env.CRM_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "crm-pipeline-test-"));

// Clear require cache
delete require.cache[require.resolve("../lib/universal-creative/sales-pipeline.js")];
delete require.cache[require.resolve("../lib/universal-creative/crm.js")];

const {
  createPipelineStage,
  listPipelineStages,
  initializeDefaultStages,
  createDeal,
  getDeal,
  listDeals,
  updateDeal,
  deleteDeal,
  getDealWithActivities,
  createDealActivity,
  listDealActivities,
  getPipelineStats,
  getForecast,
  PipelineStageSchema,
  DealSchema,
  DealInputSchema,
} = require("../lib/universal-creative/sales-pipeline.js");

const { createCustomer, createLead } = require("../lib/universal-creative/crm.js");

test("PipelineStageSchema validates valid stage", () => {
  const result = PipelineStageSchema.parse({
    id: "stage-1",
    name: "Qualified",
    order: 1,
    probability: 25,
    type: "qualified",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(result.name, "Qualified");
  assert.equal(result.probability, 25);
});

test("initializeDefaultStages creates default stages", () => {
  const result = initializeDefaultStages();
  assert.ok(result.ok);
  assert.ok(result.stages.length >= 6);
  // Should have closed-won stage
  const closedWon = result.stages.find((s) => s.type === "closed-won");
  assert.ok(closedWon);
  assert.equal(closedWon.probability, 100);
  // Should have closed-lost stage
  const closedLost = result.stages.find((s) => s.type === "closed-lost");
  assert.ok(closedLost);
  assert.equal(closedLost.probability, 0);
});

test("listPipelineStages returns stages ordered", () => {
  initializeDefaultStages();
  const result = listPipelineStages();
  assert.ok(result.ok);
  assert.ok(result.total >= 6);
  // Check ordering
  for (let i = 1; i < result.stages.length; i++) {
    assert.ok(result.stages[i].order >= result.stages[i - 1].order);
  }
});

test("createDeal creates a deal", () => {
  initializeDefaultStages();
  const stages = listPipelineStages();
  const qualifiedStage = stages.stages.find((s) => s.type === "qualified");

  const customer = createCustomer({ firstName: "Deal", lastName: "Customer", email: "deal@example.com" });
  const result = createDeal({
    title: "Summer Commercial Deal",
    value: 5000,
    stageId: qualifiedStage.id,
    customerId: customer.customer.id,
    owner: "sales-rep-1",
    source: "campaign",
    tags: ["video", "commercial"],
  });
  assert.ok(result.ok);
  assert.ok(result.deal.id);
  assert.equal(result.deal.title, "Summer Commercial Deal");
  assert.equal(result.deal.value, 5000);
  assert.equal(result.deal.stageId, qualifiedStage.id);
  assert.equal(result.deal.stage, "Qualified");
  assert.equal(result.deal.customerId, customer.customer.id);
  assert.equal(result.deal.owner, "sales-rep-1");
  assert.equal(result.deal.source, "campaign");
  assert.deepEqual(result.deal.tags, ["video", "commercial"]);
  assert.ok(result.deal.probability >= 0 && result.deal.probability <= 100);
});

test("createDeal rejects missing stage", () => {
  const result = createDeal({
    title: "Bad Deal",
    value: 1000,
    stageId: "nonexistent-stage",
  });
  assert.ok(!result.ok);
  assert.equal(result.error, "Pipeline stage not found: nonexistent-stage");
});

test("createDeal rejects missing customer", () => {
  initializeDefaultStages();
  const stages = listPipelineStages();
  const qualifiedStage = stages.stages.find((s) => s.type === "qualified");

  const result = createDeal({
    title: "Bad Customer Deal",
    value: 1000,
    stageId: qualifiedStage.id,
    customerId: "nonexistent-customer",
  });
  assert.ok(!result.ok);
  assert.equal(result.error, "Customer not found: nonexistent-customer");
});

test("createDeal rejects negative value", () => {
  initializeDefaultStages();
  const stages = listPipelineStages();
  const qualifiedStage = stages.stages.find((s) => s.type === "qualified");

  const result = createDeal({
    title: "Negative Deal",
    value: -500,
    stageId: qualifiedStage.id,
  });
  assert.ok(!result.ok);
});

test("getDeal retrieves a deal", () => {
  initializeDefaultStages();
  const stages = listPipelineStages();
  const proposalStage = stages.stages.find((s) => s.type === "proposal");

  const created = createDeal({
    title: "Retrieve Test",
    value: 3000,
    stageId: proposalStage.id,
  });
  const result = getDeal(created.deal.id);
  assert.ok(result.ok);
  assert.equal(result.deal.title, "Retrieve Test");
  assert.equal(result.deal.value, 3000);
});

test("getDeal returns error for missing deal", () => {
  const result = getDeal("nonexistent-deal");
  assert.ok(!result.ok);
  assert.equal(result.error, "Deal not found: nonexistent-deal");
});

test("listDeals returns all deals", () => {
  initializeDefaultStages();
  const stages = listPipelineStages();
  const leadStage = stages.stages.find((s) => s.type === "lead");

  createDeal({ title: "Deal A", value: 1000, stageId: leadStage.id });
  createDeal({ title: "Deal B", value: 2000, stageId: leadStage.id });
  const result = listDeals();
  assert.ok(result.ok);
  assert.ok(result.total >= 2);
  assert.ok(Array.isArray(result.deals));
});

test("listDeals filters by stage", () => {
  initializeDefaultStages();
  const stages = listPipelineStages();
  const qualifiedStage = stages.stages.find((s) => s.type === "qualified");
  const proposalStage = stages.stages.find((s) => s.type === "proposal");

  createDeal({ title: "Qualified Deal", value: 1000, stageId: qualifiedStage.id });
  createDeal({ title: "Proposal Deal", value: 2000, stageId: proposalStage.id });

    const result = listDeals({ stage: "Qualified" });
  assert.ok(result.ok);
  for (const d of result.deals) {
    assert.equal(d.stage, "Qualified");
  }
});

test("listDeals filters by min/max value", () => {
  initializeDefaultStages();
  const stages = listPipelineStages();
  const leadStage = stages.stages.find((s) => s.type === "lead");

  createDeal({ title: "Small Deal", value: 100, stageId: leadStage.id });
  createDeal({ title: "Large Deal", value: 10000, stageId: leadStage.id });

  const result = listDeals({ minValue: 500, maxValue: 5000 });
  assert.ok(result.ok);
  for (const d of result.deals) {
    assert.ok(d.value >= 500 && d.value <= 5000);
  }
});

test("updateDeal updates fields", () => {
  initializeDefaultStages();
  const stages = listPipelineStages();
  const leadStage = stages.stages.find((s) => s.type === "lead");
  const proposalStage = stages.stages.find((s) => s.type === "proposal");

  const created = createDeal({
    title: "Update Test",
    value: 2000,
    stageId: leadStage.id,
    owner: "rep-1",
  });

  const result = updateDeal(created.deal.id, {
    title: "Updated Deal",
    value: 3000,
    stageId: proposalStage.id,
    owner: "rep-2",
  });
  assert.ok(result.ok);
  assert.equal(result.deal.title, "Updated Deal");
  assert.equal(result.deal.value, 3000);
  assert.equal(result.deal.stage, "Proposal");
  assert.equal(result.deal.owner, "rep-2");
  assert.notEqual(result.deal.updatedAt, created.deal.updatedAt);
});

test("deleteDeal requires authorization", () => {
  initializeDefaultStages();
  const stages = listPipelineStages();
  const leadStage = stages.stages.find((s) => s.type === "lead");

  const created = createDeal({ title: "Temp Deal", value: 500, stageId: leadStage.id });
  const result = deleteDeal(created.deal.id);
  assert.ok(!result.ok);
  assert.equal(result.error, "Authorization required for deal deletion");
});

test("deleteDeal soft-deletes with authorization", () => {
  initializeDefaultStages();
  const stages = listPipelineStages();
  const leadStage = stages.stages.find((s) => s.type === "lead");

  const created = createDeal({ title: "Temp Deal 2", value: 500, stageId: leadStage.id });
  const result = deleteDeal(created.deal.id, "admin-user");
  assert.ok(result.ok);
  assert.equal(result.deal.deleted, true);
  assert.equal(result.deal.deletedBy, "admin-user");
});

test("createDealActivity creates an activity", () => {
  initializeDefaultStages();
  const stages = listPipelineStages();
  const leadStage = stages.stages.find((s) => s.type === "lead");

  const deal = createDeal({ title: "Activity Test", value: 1000, stageId: leadStage.id });
  const result = createDealActivity({
    dealId: deal.deal.id,
    type: "call",
    subject: "Initial discovery call",
    notes: "Customer interested in video commercial",
    outcome: "follow-up scheduled",
    scheduledAt: "2026-02-01T10:00:00.000Z",
  });
  assert.ok(result.ok);
  assert.equal(result.activity.dealId, deal.deal.id);
  assert.equal(result.activity.type, "call");
  assert.equal(result.activity.subject, "Initial discovery call");
  assert.equal(result.activity.outcome, "follow-up scheduled");
});

test("createDealActivity rejects missing deal", () => {
  const result = createDealActivity({
    dealId: "nonexistent-deal",
    type: "call",
    subject: "Test",
  });
  assert.ok(!result.ok);
  assert.equal(result.error, "Deal not found: nonexistent-deal");
});

test("listDealActivities returns activities for deal", () => {
  initializeDefaultStages();
  const stages = listPipelineStages();
  const leadStage = stages.stages.find((s) => s.type === "lead");

  const deal = createDeal({ title: "Activities Test", value: 1000, stageId: leadStage.id });
  createDealActivity({ dealId: deal.deal.id, type: "email", subject: "Follow up" });
  createDealActivity({ dealId: deal.deal.id, type: "meeting", subject: "Demo meeting" });

  const result = listDealActivities({ dealId: deal.deal.id });
  assert.ok(result.ok);
  assert.ok(result.total >= 2);
});

test("getDealWithActivities returns deal + activities", () => {
  initializeDefaultStages();
  const stages = listPipelineStages();
  const leadStage = stages.stages.find((s) => s.type === "lead");

  const deal = createDeal({ title: "With Activities", value: 1000, stageId: leadStage.id });
  createDealActivity({ dealId: deal.deal.id, type: "note", subject: "Important note" });

  const result = getDealWithActivities(deal.deal.id);
  assert.ok(result.ok);
  assert.equal(result.deal.title, "With Activities");
  assert.ok(Array.isArray(result.activities));
  assert.ok(result.activities.length >= 1);
});

test("getPipelineStats returns stats", () => {
  initializeDefaultStages();
  const stages = listPipelineStages();
  const leadStage = stages.stages.find((s) => s.type === "lead");
  const wonStage = stages.stages.find((s) => s.type === "closed-won");

  createDeal({ title: "Open Deal", value: 5000, stageId: leadStage.id, probability: 50 });
  createDeal({ title: "Won Deal", value: 3000, stageId: wonStage.id, probability: 100 });

  const result = getPipelineStats();
  assert.ok(result.totalDeals >= 2);
  assert.ok(typeof result.totalValue === "number");
  assert.ok(typeof result.weightedPipeline === "number");
  assert.ok(result.byStage);
  assert.ok(typeof result.averageDealSize === "number");
});

test("getForecast returns forecast", () => {
  initializeDefaultStages();
  const stages = listPipelineStages();
  const leadStage = stages.stages.find((s) => s.type === "lead");

  // Future deal
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  createDeal({ title: "Future Deal", value: 5000, stageId: leadStage.id, probability: 50, expectedCloseDate: futureDate });

  const result = getForecast();
  assert.ok(typeof result.totalForecast === "number");
  assert.ok(Array.isArray(result.months));
});

test("DealSchema validates valid deal", () => {
  const result = DealSchema.parse({
    id: "deal-1",
    title: "Test Deal",
    value: 1000,
    currency: "USD",
    stageId: "stage-1",
    stage: "Lead",
    probability: 25,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(result.title, "Test Deal");
  assert.equal(result.value, 1000);
});
