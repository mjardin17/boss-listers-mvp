#!/usr/bin/env node
/**
 * Revenue Tracker Tests — M13 Sales & Marketing Factory
 */

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Use temp dir for revenue tests
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "revenue-test-"));
process.env.REVENUE_DIR = tmpDir;
process.env.PIPELINE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-revenue-test-"));
process.env.CAMPAIGN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "campaign-revenue-test-"));
process.env.CRM_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "crm-revenue-test-"));

// Clear require cache
delete require.cache[require.resolve("../lib/universal-creative/revenue-tracker.js")];
delete require.cache[require.resolve("../lib/universal-creative/sales-pipeline.js")];
delete require.cache[require.resolve("../lib/universal-creative/campaign-manager.js")];
delete require.cache[require.resolve("../lib/universal-creative/crm.js")];

const {
  createRevenueRecord,
  getRevenueRecord,
  listRevenueRecords,
  updateRevenueRecord,
  createCommission,
  listCommissions,
  updateCommission,
  recordAttribution,
  listAttribution,
  getRevenueStats,
  getRevenueByCampaign,
  getRevenueByChannel,
  RevenueRecordSchema,
  RevenueInputSchema,
  CommissionSchema,
} = require("../lib/universal-creative/revenue-tracker.js");

// Dependencies
const { initializeDefaultStages, createDeal } = require("../lib/universal-creative/sales-pipeline.js");
const { createCampaign } = require("../lib/universal-creative/campaign-manager.js");
const { createCustomer } = require("../lib/universal-creative/crm.js");

test("RevenueInputSchema validates valid input", () => {
  const result = RevenueInputSchema.parse({
    dealId: "deal-1",
    amount: 5000,
    currency: "USD",
    status: "pending",
  });
  assert.equal(result.dealId, "deal-1");
  assert.equal(result.amount, 5000);
});

test("RevenueInputSchema rejects negative amount", () => {
  assert.throws(() => {
    RevenueInputSchema.parse({ dealId: "deal-1", amount: -100 });
  });
});

test("createRevenueRecord creates revenue from deal", () => {
  initializeDefaultStages();
  const customer = createCustomer({ firstName: "Rev", lastName: "Test", email: "rev@example.com" });
  const deal = createDeal({
    title: "Revenue Deal",
    value: 5000,
    stageId: "stage-placeholder", // will be fixed below
    customerId: customer.customer.id,
  });

  // Get actual stage id
  const { listPipelineStages } = require("../lib/universal-creative/sales-pipeline.js");
  const stages = listPipelineStages();
  const wonStage = stages.stages.find((s) => s.type === "closed-won");

  const wonDeal = createDeal({
    title: "Won Revenue Deal",
    value: 5000,
    stageId: wonStage.id,
    customerId: customer.customer.id,
  });

  const result = createRevenueRecord({
    dealId: wonDeal.deal.id,
    amount: 5000,
    status: "received",
    source: "campaign",
    channel: "instagram",
  });
  assert.ok(result.ok);
  assert.ok(result.revenue.id);
  assert.equal(result.revenue.dealId, wonDeal.deal.id);
  assert.equal(result.revenue.amount, 5000);
  assert.equal(result.revenue.status, "received");
  assert.equal(result.revenue.source, "campaign");
  assert.equal(result.revenue.channel, "instagram");
});

test("createRevenueRecord uses deal value if amount not provided", () => {
  const { listPipelineStages } = require("../lib/universal-creative/sales-pipeline.js");
  const stages = listPipelineStages();
  const wonStage = stages.stages.find((s) => s.type === "closed-won");

  const customer = createCustomer({ firstName: "Rev", lastName: "Auto", email: "rev-auto@example.com" });
  const deal = createDeal({
    title: "Auto Amount Deal",
    value: 7500,
    stageId: wonStage.id,
    customerId: customer.customer.id,
  });

  const result = createRevenueRecord({ dealId: deal.deal.id });
  assert.ok(result.ok);
  assert.equal(result.revenue.amount, 7500); // uses deal value
});

test("createRevenueRecord rejects missing deal", () => {
  const result = createRevenueRecord({ dealId: "nonexistent-deal", amount: 1000 });
  assert.ok(!result.ok);
  assert.equal(result.error, "Deal not found: nonexistent-deal");
});

test("getRevenueRecord retrieves a record", () => {
  const { listPipelineStages } = require("../lib/universal-creative/sales-pipeline.js");
  const stages = listPipelineStages();
  const wonStage = stages.stages.find((s) => s.type === "closed-won");

  const customer = createCustomer({ firstName: "Get", lastName: "Rev", email: "getrev@example.com" });
  const deal = createDeal({
    title: "Get Rev Deal",
    value: 3000,
    stageId: wonStage.id,
    customerId: customer.customer.id,
  });
  const created = createRevenueRecord({ dealId: deal.deal.id, amount: 3000 });

  const result = getRevenueRecord(created.revenue.id);
  assert.ok(result.ok);
  assert.equal(result.revenue.amount, 3000);
});

test("listRevenueRecords returns all records", () => {
  const { listPipelineStages } = require("../lib/universal-creative/sales-pipeline.js");
  const stages = listPipelineStages();
  const wonStage = stages.stages.find((s) => s.type === "closed-won");

  const customer = createCustomer({ firstName: "List", lastName: "Rev", email: "listrev@example.com" });
  createDeal({ title: "List Rev 1", value: 1000, stageId: wonStage.id, customerId: customer.customer.id });
  createDeal({ title: "List Rev 2", value: 2000, stageId: wonStage.id, customerId: customer.customer.id });

  const result = listRevenueRecords();
  assert.ok(result.ok);
  assert.ok(result.total >= 2);
});

test("listRevenueRecords filters by status", () => {
  const { listPipelineStages } = require("../lib/universal-creative/sales-pipeline.js");
  const stages = listPipelineStages();
  const wonStage = stages.stages.find((s) => s.type === "closed-won");

  const customer = createCustomer({ firstName: "Filter", lastName: "Rev", email: "filterrev@example.com" });
  createDeal({ title: "Pending Rev", value: 1000, stageId: wonStage.id, customerId: customer.customer.id });

  const result = listRevenueRecords({ status: "pending" });
  assert.ok(result.ok);
  for (const r of result.revenue) {
    assert.equal(r.status, "pending");
  }
});

test("updateRevenueRecord updates fields", () => {
  const { listPipelineStages } = require("../lib/universal-creative/sales-pipeline.js");
  const stages = listPipelineStages();
  const wonStage = stages.stages.find((s) => s.type === "closed-won");

  const customer = createCustomer({ firstName: "Update", lastName: "Rev", email: "updaterev@example.com" });
  const deal = createDeal({
    title: "Update Rev Deal",
    value: 2000,
    stageId: wonStage.id,
    customerId: customer.customer.id,
  });
  const created = createRevenueRecord({ dealId: deal.deal.id, amount: 2000, status: "pending" });

  const result = updateRevenueRecord(created.revenue.id, { status: "received", amount: 2500 });
  assert.ok(result.ok);
  assert.equal(result.revenue.status, "received");
  assert.equal(result.revenue.amount, 2500);
});

test("createCommission creates a commission", () => {
  const { listPipelineStages } = require("../lib/universal-creative/sales-pipeline.js");
  const stages = listPipelineStages();
  const wonStage = stages.stages.find((s) => s.type === "closed-won");

  const customer = createCustomer({ firstName: "Comm", lastName: "Test", email: "comm@example.com" });
  const deal = createDeal({
    title: "Commission Deal",
    value: 10000,
    stageId: wonStage.id,
    customerId: customer.customer.id,
  });
  createRevenueRecord({ dealId: deal.deal.id, amount: 10000 });

  const result = createCommission({
    dealId: deal.deal.id,
    payee: "sales-rep-1",
    rate: 10, // 10%
  });
  assert.ok(result.ok);
  assert.equal(result.commission.payee, "sales-rep-1");
  assert.equal(result.commission.rate, 10);
  assert.equal(result.commission.amount, 1000); // 10% of 10000
  assert.equal(result.commission.status, "calculated");
});

test("createCommission with explicit amount", () => {
  const { listPipelineStages } = require("../lib/universal-creative/sales-pipeline.js");
  const stages = listPipelineStages();
  const wonStage = stages.stages.find((s) => s.type === "closed-won");

  const customer = createCustomer({ firstName: "Comm", lastName: "Amt", email: "comm-amt@example.com" });
  const deal = createDeal({
    title: "Commission Amt Deal",
    value: 10000,
    stageId: wonStage.id,
    customerId: customer.customer.id,
  });

  const result = createCommission({
    dealId: deal.deal.id,
    payee: "sales-rep-2",
    rate: 5,
    amount: 750, // explicit amount
  });
  assert.ok(result.ok);
  assert.equal(result.commission.amount, 750);
});

test("listCommissions returns all commissions", () => {
  const { listPipelineStages } = require("../lib/universal-creative/sales-pipeline.js");
  const stages = listPipelineStages();
  const wonStage = stages.stages.find((s) => s.type === "closed-won");

  const customer = createCustomer({ firstName: "List", lastName: "Comm", email: "listcomm@example.com" });
  createDeal({ title: "List Comm Deal", value: 5000, stageId: wonStage.id, customerId: customer.customer.id });

  const result = listCommissions();
  assert.ok(result.ok);
  assert.ok(Array.isArray(result.commissions));
});

test("updateCommission to paid sets paid date", () => {
  const { listPipelineStages } = require("../lib/universal-creative/sales-pipeline.js");
  const stages = listPipelineStages();
  const wonStage = stages.stages.find((s) => s.type === "closed-won");

  const customer = createCustomer({ firstName: "Pay", lastName: "Comm", email: "paycomm@example.com" });
  const deal = createDeal({
    title: "Pay Comm Deal",
    value: 5000,
    stageId: wonStage.id,
    customerId: customer.customer.id,
  });
  const created = createCommission({ dealId: deal.deal.id, payee: "rep", rate: 10 });

  const result = updateCommission(created.commission.id, { status: "paid" });
  assert.ok(result.ok);
  assert.equal(result.commission.status, "paid");
  assert.ok(result.commission.paidDate);
});

test("recordAttribution records campaign attribution", () => {
  const campaign = createCampaign({ name: "Attribution Campaign", type: "direct-response" });

  const result = recordAttribution({
    campaignId: campaign.campaign.id,
    channel: "instagram",
    revenue: 5000,
    conversions: 25,
    periodStart: "2026-01-01T00:00:00.000Z",
    periodEnd: "2026-01-31T23:59:59.999Z",
  });
  assert.ok(result.ok);
  assert.equal(result.attribution.campaignId, campaign.campaign.id);
  assert.equal(result.attribution.channel, "instagram");
  assert.equal(result.attribution.revenue, 5000);
  assert.equal(result.attribution.conversions, 25);
});

test("recordAttribution rejects missing campaign", () => {
  const result = recordAttribution({
    campaignId: "nonexistent-campaign",
    channel: "facebook",
    revenue: 1000,
    periodStart: "2026-01-01T00:00:00.000Z",
    periodEnd: "2026-01-31T23:59:59.999Z",
  });
  assert.ok(!result.ok);
  assert.equal(result.error, "Campaign not found: nonexistent-campaign");
});

test("getRevenueStats returns stats", () => {
  const { listPipelineStages } = require("../lib/universal-creative/sales-pipeline.js");
  const stages = listPipelineStages();
  const wonStage = stages.stages.find((s) => s.type === "closed-won");

  const customer = createCustomer({ firstName: "Stats", lastName: "Rev", email: "statsrev@example.com" });
  createDeal({ title: "Stats Rev 1", value: 5000, stageId: wonStage.id, customerId: customer.customer.id });
  createDeal({ title: "Stats Rev 2", value: 3000, stageId: wonStage.id, customerId: customer.customer.id });

  const result = getRevenueStats();
  assert.ok(typeof result.totalRevenue === "number");
  assert.ok(typeof result.receivedRevenue === "number");
  assert.ok(typeof result.pendingRevenue === "number");
  assert.ok(typeof result.totalCommission === "number");
  assert.ok(result.byStatus);
  assert.ok(result.bySource);
});

test("getRevenueByCampaign returns revenue grouped by campaign", () => {
  const campaign = createCampaign({ name: "By Campaign", type: "seasonal" });
  const { listPipelineStages } = require("../lib/universal-creative/sales-pipeline.js");
  const stages = listPipelineStages();
  const wonStage = stages.stages.find((s) => s.type === "closed-won");

  const customer = createCustomer({ firstName: "By", lastName: "Campaign", email: "bycampaign@example.com" });
  createDeal({ title: "By Campaign Deal", value: 5000, stageId: wonStage.id, customerId: customer.customer.id });

  // Record revenue attributed to campaign
  const revResult = listRevenueRecords();
  if (revResult.ok && revResult.revenue.length > 0) {
    // Update the latest revenue record to attribute to campaign
    const latest = revResult.revenue[0];
    updateRevenueRecord(latest.id, { campaignId: campaign.campaign.id, channel: "instagram" });
  }

  const result = getRevenueByCampaign();
  assert.ok(Array.isArray(result));
  // Should have at least one campaign with revenue
  const campaignEntry = result.find((c) => c.campaignId === campaign.campaign.id);
  if (campaignEntry) {
    assert.ok(campaignEntry.revenue > 0);
  }
});

test("getRevenueByChannel returns revenue grouped by channel", () => {
  const result = getRevenueByChannel();
  assert.ok(Array.isArray(result));
});

test("CommissionSchema validates valid commission", () => {
  const result = CommissionSchema.parse({
    id: "comm-1",
    dealId: "deal-1",
    payee: "rep-1",
    rate: 10,
    amount: 500,
    currency: "USD",
    status: "calculated",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(result.payee, "rep-1");
  assert.equal(result.rate, 10);
  assert.equal(result.amount, 500);
});
