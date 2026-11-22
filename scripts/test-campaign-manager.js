#!/usr/bin/env node
/**
 * Campaign Manager Tests — M13 Sales & Marketing Factory
 */

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Use temp dir for campaign tests
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "campaign-test-"));
process.env.CAMPAIGN_DIR = tmpDir;
process.env.CRM_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "crm-test-"));

// Clear require cache
delete require.cache[require.resolve("../lib/universal-creative/campaign-manager.js")];
delete require.cache[require.resolve("../lib/universal-creative/crm.js")];

const {
  createCampaign,
  getCampaign,
  listCampaigns,
  updateCampaign,
  deleteCampaign,
  getCampaignWithDetails,
  createCampaignAudience,
  listCampaignAudiences,
  buildAudienceFromCRM,
  linkCampaignCreative,
  listCampaignCreatives,
  recordCampaignPerformance,
  listCampaignPerformance,
  getCampaignStats,
  CampaignSchema,
  CampaignInputSchema,
} = require("../lib/universal-creative/campaign-manager.js");

// Need CRM for buildAudienceFromCRM
const { createCustomer, listCustomers } = require("../lib/universal-creative/crm.js");

test("CampaignInputSchema validates valid input", () => {
  const result = CampaignInputSchema.parse({
    name: "Summer Sale Campaign",
    type: "direct-response",
    channels: ["instagram", "facebook"],
    budget: 500,
  });
  assert.equal(result.name, "Summer Sale Campaign");
  assert.equal(result.type, "direct-response");
  assert.deepEqual(result.channels, ["instagram", "facebook"]);
  assert.equal(result.budget, 500);
});

test("CampaignInputSchema rejects invalid type", () => {
  assert.throws(() => {
    CampaignInputSchema.parse({ name: "Test", type: "invalid-type" });
  });
});

test("createCampaign creates a campaign", () => {
  const result = createCampaign({
    name: "Holiday Promotion",
    type: "product-launch",
    description: "Holiday product launch campaign",
    channels: ["instagram", "tiktok"],
    budget: 1000,
    targetAudience: "Holiday shoppers",
    createdBy: "marketing-team",
  });
  assert.ok(result.ok);
  assert.ok(result.campaign.id);
  assert.equal(result.campaign.name, "Holiday Promotion");
  assert.equal(result.campaign.type, "product-launch");
  assert.equal(result.campaign.status, "draft");
  assert.equal(result.campaign.budget, 1000);
  assert.deepEqual(result.campaign.channels, ["instagram", "tiktok"]);
  assert.ok(result.campaign.createdAt);
  assert.ok(result.campaign.updatedAt);
});

test("getCampaign retrieves a campaign", () => {
  const created = createCampaign({ name: "Test Campaign", type: "brand-awareness" });
  const result = getCampaign(created.campaign.id);
  assert.ok(result.ok);
  assert.equal(result.campaign.name, "Test Campaign");
  assert.equal(result.campaign.type, "brand-awareness");
});

test("getCampaign returns error for missing campaign", () => {
  const result = getCampaign("nonexistent-id");
  assert.ok(!result.ok);
  assert.equal(result.error, "Campaign not found: nonexistent-id");
});

test("listCampaigns returns all campaigns", () => {
  createCampaign({ name: "Campaign A", type: "seasonal" });
  createCampaign({ name: "Campaign B", type: "lead-gen" });
  const result = listCampaigns();
  assert.ok(result.ok);
  assert.ok(result.total >= 2);
  assert.ok(Array.isArray(result.campaigns));
});

test("listCampaigns filters by status", () => {
  createCampaign({ name: "Active Campaign", type: "direct-response", status: "active" });
  const result = listCampaigns({ status: "active" });
  assert.ok(result.ok);
  for (const c of result.campaigns) {
    assert.equal(c.status, "active");
  }
});

test("listCampaigns filters by channel", () => {
  createCampaign({ name: "YouTube Campaign", type: "brand-awareness", channels: ["youtube"] });
  const result = listCampaigns({ channel: "youtube" });
  assert.ok(result.ok);
  for (const c of result.campaigns) {
    assert.ok(c.channels.includes("youtube"));
  }
});

test("updateCampaign updates fields", () => {
  const created = createCampaign({ name: "Original", type: "seasonal", budget: 100 });
  const result = updateCampaign(created.campaign.id, { name: "Updated", status: "active", budget: 200 });
  assert.ok(result.ok);
  assert.equal(result.campaign.name, "Updated");
  assert.equal(result.campaign.status, "active");
  assert.equal(result.campaign.budget, 200);
  assert.notEqual(result.campaign.updatedAt, created.campaign.updatedAt);
});

test("deleteCampaign requires authorization", () => {
  const created = createCampaign({ name: "Temp", type: "seasonal" });
  const result = deleteCampaign(created.campaign.id);
  assert.ok(!result.ok);
  assert.equal(result.error, "Authorization required for campaign deletion");
});

test("deleteCampaign soft-deletes with authorization", () => {
  const created = createCampaign({ name: "Temp", type: "seasonal" });
  const result = deleteCampaign(created.campaign.id, "admin-user");
  assert.ok(result.ok);
  assert.equal(result.campaign.deleted, true);
  assert.equal(result.campaign.deletedBy, "admin-user");
  assert.equal(result.campaign.status, "cancelled");
});

test("createCampaignAudience creates an audience", () => {
  const campaign = createCampaign({ name: "Audience Test", type: "lead-gen" });
  const result = createCampaignAudience({
    campaignId: campaign.campaign.id,
    name: "VIP Customers",
    description: "High-value customers",
    customerIds: ["cust-1", "cust-2"],
    criteria: { status: "customer" },
  });
  assert.ok(result.ok);
  assert.equal(result.audience.campaignId, campaign.campaign.id);
  assert.equal(result.audience.name, "VIP Customers");
  assert.deepEqual(result.audience.customerIds, ["cust-1", "cust-2"]);
  assert.equal(result.audience.size, 2);
});

test("createCampaignAudience rejects missing campaign", () => {
  const result = createCampaignAudience({
    campaignId: "nonexistent-campaign",
    name: "Test Audience",
  });
  assert.ok(!result.ok);
  assert.equal(result.error, "Campaign not found: nonexistent-campaign");
});

test("listCampaignAudiences returns audiences for campaign", () => {
  const campaign = createCampaign({ name: "Audience List Test", type: "retargeting" });
  createCampaignAudience({ campaignId: campaign.campaign.id, name: "Audience 1", customerIds: ["a", "b"] });
  createCampaignAudience({ campaignId: campaign.campaign.id, name: "Audience 2", customerIds: ["c"] });
  const result = listCampaignAudiences({ campaignId: campaign.campaign.id });
  assert.ok(result.ok);
  assert.ok(result.total >= 2);
});

test("linkCampaignCreative links a creative to campaign", () => {
  const campaign = createCampaign({ name: "Creative Test", type: "product-launch" });
  const result = linkCampaignCreative({
    campaignId: campaign.campaign.id,
    creativeType: "commercial",
    creativeId: "commercial-123",
    creativeName: "Summer Commercial",
    role: "hero",
    platform: "instagram",
  });
  assert.ok(result.ok);
  assert.equal(result.creative.campaignId, campaign.campaign.id);
  assert.equal(result.creative.creativeType, "commercial");
  assert.equal(result.creative.creativeName, "Summer Commercial");
  assert.equal(result.creative.role, "hero");
  assert.equal(result.creative.platform, "instagram");
});

test("listCampaignCreatives returns creatives for campaign", () => {
  const campaign = createCampaign({ name: "Creatives List Test", type: "direct-response" });
  linkCampaignCreative({ campaignId: campaign.campaign.id, creativeType: "video", creativeId: "vid-1", creativeName: "Video 1" });
  linkCampaignCreative({ campaignId: campaign.campaign.id, creativeType: "image", creativeId: "img-1", creativeName: "Image 1" });
  const result = listCampaignCreatives({ campaignId: campaign.campaign.id });
  assert.ok(result.ok);
  assert.ok(result.total >= 2);
});

test("recordCampaignPerformance records metrics", () => {
  const campaign = createCampaign({ name: "Performance Test", type: "direct-response" });
  const result = recordCampaignPerformance({
    campaignId: campaign.campaign.id,
    channel: "instagram",
    impressions: 10000,
    clicks: 500,
    conversions: 25,
    cost: 500,
    revenue: 2000,
  });
  assert.ok(result.ok);
  assert.equal(result.performance.campaignId, campaign.campaign.id);
  assert.equal(result.performance.channel, "instagram");
  assert.equal(result.performance.impressions, 10000);
  assert.equal(result.performance.clicks, 500);
  assert.equal(result.performance.conversions, 25);
  assert.equal(result.performance.cost, 500);
  assert.equal(result.performance.revenue, 2000);
});

test("listCampaignPerformance returns performance for campaign", () => {
  const campaign = createCampaign({ name: "Perf List Test", type: "seasonal" });
  recordCampaignPerformance({ campaignId: campaign.campaign.id, channel: "facebook", impressions: 5000, clicks: 100 });
  recordCampaignPerformance({ campaignId: campaign.campaign.id, channel: "instagram", impressions: 8000, clicks: 200 });
  const result = listCampaignPerformance({ campaignId: campaign.campaign.id });
  assert.ok(result.ok);
  assert.ok(result.total >= 2);
});

test("getCampaignWithDetails returns campaign + audiences + creatives + performance", () => {
  const campaign = createCampaign({ name: "Details Test", type: "brand-awareness" });
  createCampaignAudience({ campaignId: campaign.campaign.id, name: "Audience", customerIds: ["a"] });
  linkCampaignCreative({ campaignId: campaign.campaign.id, creativeType: "commercial", creativeId: "c-1", creativeName: "Commercial" });
  recordCampaignPerformance({ campaignId: campaign.campaign.id, channel: "tiktok", impressions: 1000, clicks: 50 });

  const result = getCampaignWithDetails(campaign.campaign.id);
  assert.ok(result.ok);
  assert.equal(result.campaign.name, "Details Test");
  assert.ok(Array.isArray(result.audiences));
  assert.ok(result.audiences.length >= 1);
  assert.ok(Array.isArray(result.creatives));
  assert.ok(result.creatives.length >= 1);
  assert.ok(Array.isArray(result.performance));
  assert.ok(result.performance.length >= 1);
});

test("buildAudienceFromCRM builds audience from CRM customers", () => {
  const campaign = createCampaign({ name: "CRM Audience Test", type: "lead-gen" });
  createCustomer({ firstName: "CRM", lastName: "Customer", email: "crm@example.com", status: "customer" });

  const result = buildAudienceFromCRM(campaign.campaign.id, "CRM Customers", { status: "customer" });
  assert.ok(result.ok);
  assert.equal(result.audience.name, "CRM Customers");
  assert.ok(result.audience.size >= 1);
  assert.ok(Array.isArray(result.audience.customerIds));
});

test("getCampaignStats returns stats", () => {
  createCampaign({ name: "Stats Campaign 1", type: "direct-response", status: "active" });
  createCampaign({ name: "Stats Campaign 2", type: "brand-awareness", status: "paused" });
  const campaign = createCampaign({ name: "Stats Campaign 3", type: "seasonal", status: "completed" });
  recordCampaignPerformance({ campaignId: campaign.campaign.id, channel: "instagram", impressions: 10000, clicks: 500, conversions: 50, cost: 100, revenue: 500 });

  const result = getCampaignStats();
  assert.ok(result.totalCampaigns >= 3);
  assert.ok(result.byStatus);
  assert.ok(result.byType);
  assert.ok(typeof result.ctr === "number");
  assert.ok(typeof result.conversionRate === "number");
  assert.ok(typeof result.roas === "number");
});

test("CampaignSchema validates valid campaign", () => {
  const result = CampaignSchema.parse({
    id: "campaign-1",
    name: "Test",
    type: "seasonal",
    status: "draft",
    channels: ["instagram"],
    creativeIds: [],
    customerSegmentIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(result.name, "Test");
  assert.equal(result.type, "seasonal");
});
