#!/usr/bin/env node
/**
 * Analytics Tests — M13 Sales & Marketing Factory
 */

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Use temp dirs for all modules
process.env.AUTO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "analytics-auto-test-"));
process.env.CRM_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "analytics-crm-test-"));
process.env.CAMPAIGN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "analytics-campaign-test-"));
process.env.PIPELINE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "analytics-pipeline-test-"));
process.env.REVENUE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "analytics-revenue-test-"));

// Clear require cache in dependency order
delete require.cache[require.resolve("../lib/universal-creative/analytics.js")];
delete require.cache[require.resolve("../lib/universal-creative/marketing-automation.js")];
delete require.cache[require.resolve("../lib/universal-creative/revenue-tracker.js")];
delete require.cache[require.resolve("../lib/universal-creative/sales-pipeline.js")];
delete require.cache[require.resolve("../lib/universal-creative/campaign-manager.js")];
delete require.cache[require.resolve("../lib/universal-creative/crm.js")];

const {
  getFunnelMetrics,
  getCampaignROI,
  getRevenueAnalytics,
  getDashboardSummary,
} = require("../lib/universal-creative/analytics.js");

// Dependencies for seeding data
const { createCustomer, createLead } = require("../lib/universal-creative/crm.js");
const { createCampaign, recordCampaignPerformance } = require("../lib/universal-creative/campaign-manager.js");
const { initializeDefaultStages, createDeal } = require("../lib/universal-creative/sales-pipeline.js");
const { createRevenueRecord } = require("../lib/universal-creative/revenue-tracker.js");
const { createEmailTemplate, createSequence, startExecution } = require("../lib/universal-creative/marketing-automation.js");

test("getFunnelMetrics returns funnel data", () => {
  // Create some leads
  const c1 = createCustomer({ firstName: "F1", lastName: "L", email: "f1@example.com", status: "lead" });
  createLead({ customerId: c1.customer.id, source: "manual", status: "qualified", score: 50 });
  createLead({ customerId: c1.customer.id, source: "manual", status: "closed-won", score: 100 });
  createLead({ customerId: c1.customer.id, source: "manual", status: "closed-lost", score: 20 });

  const result = getFunnelMetrics();
  assert.ok(typeof result.totalLeads === "number");
  assert.ok(typeof result.qualifiedLeads === "number");
  assert.ok(typeof result.closedWon === "number");
  assert.ok(typeof result.closedLost === "number");
  assert.ok(typeof result.conversionRate === "number");
  assert.ok(typeof result.averageDealValue === "number");
  assert.ok(typeof result.totalCustomers === "number");
});

test("getCampaignROI returns ROI data", () => {
  const campaign = createCampaign({ name: "ROI Campaign", type: "direct-response", budget: 1000 });
  recordCampaignPerformance({
    campaignId: campaign.campaign.id,
    channel: "instagram",
    impressions: 10000,
    clicks: 500,
    conversions: 25,
    cost: 500,
    revenue: 2000,
  });

  const result = getCampaignROI();
  assert.ok(Array.isArray(result));
  if (result.length > 0) {
    const entry = result.find((r) => r.campaignId === campaign.campaign.id);
    if (entry) {
      assert.ok(typeof entry.roas === "number");
      assert.ok(typeof entry.profit === "number");
      assert.ok(typeof entry.profitMargin === "number");
      assert.ok(typeof entry.totalCost === "number");
      assert.ok(typeof entry.totalRevenue === "number");
    }
  }
});

test("getRevenueAnalytics returns revenue data", () => {
  const result = getRevenueAnalytics();
  assert.ok(typeof result.totalRevenue === "number");
  assert.ok(typeof result.receivedRevenue === "number");
  assert.ok(typeof result.pendingRevenue === "number");
  assert.ok(typeof result.totalCommission === "number");
  assert.ok(Array.isArray(result.byCampaign));
  assert.ok(Array.isArray(result.byChannel));
});

test("getDashboardSummary returns full dashboard", () => {
  // Seed some data
  initializeDefaultStages();
  const customer = createCustomer({ firstName: "Dash", lastName: "Board", email: "dash@example.com", status: "customer" });
  createLead({ customerId: customer.customer.id, source: "manual", status: "closed-won" });
  const campaign = createCampaign({ name: "Dash Campaign", type: "brand-awareness" });
  createEmailTemplate({ name: "Dash T", subject: "S", body: "B", category: "welcome" });
  const sequence = createSequence({ name: "Dash Seq", trigger: "manual" });
  startExecution({ sequenceId: sequence.sequence.id, customerId: customer.customer.id });

  const result = getDashboardSummary();
  assert.ok(result.timestamp);
  assert.ok(result.crm);
  assert.ok(result.campaigns);
  assert.ok(result.pipeline);
  assert.ok(result.revenue);
  assert.ok(result.automation);
  assert.ok(result.funnel);
  assert.ok(Array.isArray(result.topCampaignsByROI));

  // Check CRM section
  assert.ok(typeof result.crm.totalCustomers === "number");
  assert.ok(typeof result.crm.totalLeads === "number");

  // Check pipeline section
  assert.ok(typeof result.pipeline.totalValue === "number");

  // Check revenue section
  assert.ok(typeof result.revenue.totalRevenue === "number");
});

test("DateRangeSchema validates valid date range", () => {
  const { DateRangeSchema } = require("../lib/universal-creative/analytics.js");
  const result = DateRangeSchema.parse({
    startDate: "2026-01-01T00:00:00.000Z",
    endDate: "2026-01-31T23:59:59.999Z",
  });
  assert.equal(result.startDate, "2026-01-01T00:00:00.000Z");
  assert.equal(result.endDate, "2026-01-31T23:59:59.999Z");
});

test("FunnelMetricsSchema validates valid funnel metrics", () => {
  const { FunnelMetricsSchema } = require("../lib/universal-creative/analytics.js");
  const result = FunnelMetricsSchema.parse({
    totalLeads: 100,
    qualifiedLeads: 50,
    proposals: 25,
    negotiations: 10,
    closedWon: 5,
    closedLost: 10,
    conversionRate: 5.0,
    averageDealValue: 1000,
  });
  assert.equal(result.totalLeads, 100);
  assert.equal(result.conversionRate, 5.0);
});

test("CampaignROISchema validates valid ROI", () => {
  const { CampaignROISchema } = require("../lib/universal-creative/analytics.js");
  const result = CampaignROISchema.parse({
    campaignId: "campaign-1",
    campaignName: "Test Campaign",
    totalCost: 500,
    totalRevenue: 2000,
    roas: 4.0,
    profit: 1500,
    profitMargin: 75.0,
    conversions: 25,
  });
  assert.equal(result.campaignId, "campaign-1");
  assert.equal(result.roas, 4.0);
  assert.equal(result.profit, 1500);
});
