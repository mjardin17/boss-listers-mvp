#!/usr/bin/env node
/**
 * Sales & Marketing Factory Tests — M13 Sales & Marketing Factory
 */

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Use temp dirs for all modules
process.env.AUTO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "factory-auto-test-"));
process.env.CRM_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "factory-crm-test-"));
process.env.CAMPAIGN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "factory-campaign-test-"));
process.env.PIPELINE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "factory-pipeline-test-"));
process.env.REVENUE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "factory-revenue-test-"));

// Clear require cache in dependency order
delete require.cache[require.resolve("../lib/universal-creative/sales-marketing-factory.js")];
delete require.cache[require.resolve("../lib/universal-creative/analytics.js")];
delete require.cache[require.resolve("../lib/universal-creative/marketing-automation.js")];
delete require.cache[require.resolve("../lib/universal-creative/revenue-tracker.js")];
delete require.cache[require.resolve("../lib/universal-creative/sales-pipeline.js")];
delete require.cache[require.resolve("../lib/universal-creative/campaign-manager.js")];
delete require.cache[require.resolve("../lib/universal-creative/crm.js")];

const factory = require("../lib/universal-creative/sales-marketing-factory.js");

test("factory exports all module functions", () => {
  assert.ok(typeof factory.createCustomer === "function");
  assert.ok(typeof factory.createLead === "function");
  assert.ok(typeof factory.createCampaign === "function");
  assert.ok(typeof factory.createDeal === "function");
  assert.ok(typeof factory.createRevenueRecord === "function");
  assert.ok(typeof factory.createCommission === "function");
  assert.ok(typeof factory.createEmailTemplate === "function");
  assert.ok(typeof factory.createSequence === "function");
  assert.ok(typeof factory.getDashboardSummary === "function");
  assert.ok(typeof factory.getFunnelMetrics === "function");
  assert.ok(typeof factory.getCampaignROI === "function");
  assert.ok(typeof factory.getRevenueAnalytics === "function");
});

test("factory exports factory-level operations", () => {
  assert.ok(typeof factory.createLeadFromInventory === "function");
  assert.ok(typeof factory.createCommercialForCampaign === "function");
  assert.ok(typeof factory.createDealFromLead === "function");
  assert.ok(typeof factory.runFullWorkflow === "function");
  assert.ok(typeof factory.getFactoryStatus === "function");
  assert.ok(typeof factory.initializeFactory === "function");
});

test("initializeFactory creates default stages", () => {
  const result = factory.initializeFactory();
  assert.ok(result.ok);
  assert.ok(Array.isArray(result.defaultStages));
  assert.ok(result.defaultStages.length >= 6);
  assert.ok(Array.isArray(result.modules));
  assert.ok(result.modules.includes("crm"));
  assert.ok(result.modules.includes("campaigns"));
  assert.ok(result.modules.includes("pipeline"));
  assert.ok(result.modules.includes("revenue"));
  assert.ok(result.modules.includes("automation"));
  assert.ok(result.modules.includes("analytics"));
});

test("createLeadFromInventory creates customer + lead", () => {
  const item = {
    id: "item-001",
    sku: "SKU-001",
    title: "Vintage Camera",
    price: 250,
    category: "electronics",
    contactFirstName: "John",
    contactLastName: "Doe",
    contactEmail: "john@example.com",
  };

  const result = factory.createLeadFromInventory(item, { source: "inventory", score: 70 });
  assert.ok(result.ok);
  assert.ok(result.customer);
  assert.ok(result.lead);
  assert.equal(result.customer.firstName, "John");
  assert.equal(result.customer.lastName, "Doe");
  assert.equal(result.customer.email, "john@example.com");
  assert.equal(result.lead.score, 70);
  assert.equal(result.lead.source, "inventory");
  assert.equal(result.inventoryItem.title, "Vintage Camera");
});

test("getFactoryStatus returns all modules", () => {
  factory.initializeFactory();
  const customerResult = factory.createCustomer({
    firstName: "Status",
    lastName: "Test",
    email: "status@example.com",
    status: "customer",
  });
  factory.createLead({
    customerId: customerResult.customer.id,
    source: "manual",
    status: "closed-won",
  });

  const result = factory.getFactoryStatus();
  assert.ok(result.timestamp);
  assert.ok(result.modules);
  assert.ok(result.modules.crm);
  assert.ok(result.modules.campaigns);
  assert.ok(result.modules.pipeline);
  assert.ok(result.modules.revenue);
  assert.ok(result.modules.automation);
  assert.ok(result.analytics);
  assert.ok(result.funnel);
  assert.ok(Array.isArray(result.campaignROI));
  assert.ok(Array.isArray(result.revenueByCampaign));
  assert.ok(Array.isArray(result.revenueByChannel));
});

test("createDealFromLead creates deal + revenue + commission", () => {
  factory.initializeFactory();
  const customer = factory.createCustomer({
    firstName: "Deal",
    lastName: "From Lead",
    email: "dealfromlead@example.com",
  });
  const lead = factory.createLead({
    customerId: customer.customer.id,
    source: "manual",
    expectedValue: 5000,
  });

  const result = factory.createDealFromLead(lead.lead.id, {
    title: "Camera Sale",
    value: 5000,
    owner: "sales-rep-1",
    commissionRate: 10,
    commissionPayee: "sales-rep-1",
  });
  assert.ok(result.ok);
  assert.ok(result.deal);
  assert.equal(result.deal.title, "Camera Sale");
  assert.equal(result.deal.value, 5000);
  assert.ok(result.revenue);
  assert.equal(result.revenue.amount, 5000);
  assert.ok(result.commission);
  assert.equal(result.commission.amount, 500); // 10% of 5000
});

test("runFullWorkflow returns summary", () => {
  factory.initializeFactory();
  const result = factory.runFullWorkflow({
    campaignName: "Test Campaign",
  });
  assert.ok(result.ok);
  assert.ok(result.results);
  assert.ok(Array.isArray(result.results.steps));
  assert.ok(result.summary);
  assert.ok(result.summary.timestamp);
});

test("getDashboardSummary returns full dashboard", () => {
  factory.initializeFactory();
  const result = factory.getDashboardSummary();
  assert.ok(result.timestamp);
  assert.ok(result.crm);
  assert.ok(result.campaigns);
  assert.ok(result.pipeline);
  assert.ok(result.revenue);
  assert.ok(result.automation);
  assert.ok(result.funnel);
  assert.ok(Array.isArray(result.topCampaignsByROI));
});
