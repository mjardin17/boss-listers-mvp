#!/usr/bin/env node
/**
 * Universal Creative Production Connector — Campaign Manager
 *
 * Marketing campaign management for Sales & Marketing Factory.
 * Connects CRM customers/leads with creative production (commercials, videos)
 * and distribution channels (CROSSPOST, social, email).
 *
 * Data model:
 *   - Campaigns: name, type, status, budget, dates, target audience, channels
 *   - Campaign Audiences: customer segments linked to campaigns
 *   - Campaign Creatives: commercial/video assets linked to campaigns
 *   - Campaign Performance: impressions, clicks, conversions, cost
 *
 * Rules:
 *   - Single source of truth (Zod schemas) — no duplicated schemas
 *   - All persistence through JSON repository files
 *   - Never invents prices, discounts, or claims
 *   - Render-only safety: no auto-post, no auto-list, no auto-spend
 *   - Depends on CRM module for customer/lead data
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const z = require("zod");

const CAMPAIGN_DIR = process.env.CAMPAIGN_DIR || path.join(os.tmpdir(), "sales-marketing", "campaigns");
const CAMPAIGNS_FILE = path.join(CAMPAIGN_DIR, "campaigns.json");
const CAMPAIGN_AUDIENCES_FILE = path.join(CAMPAIGN_DIR, "campaign-audiences.json");
const CAMPAIGN_CREATIVES_FILE = path.join(CAMPAIGN_DIR, "campaign-creatives.json");
const CAMPAIGN_PERFORMANCE_FILE = path.join(CAMPAIGN_DIR, "campaign-performance.json");

// Import CRM for customer/lead data
const { listCustomers, listLeads, getCrmStats } = require("./crm.js");

/* ---------------------------------------------------------------- Zod schemas */

const CampaignSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  type: z.enum(["brand-awareness", "direct-response", "product-launch", "retargeting", "seasonal", "lead-gen"]),
  status: z.enum(["draft", "active", "paused", "completed", "cancelled"]).default("draft"),
  budget: z.number().nonnegative().optional().nullable(), // dollars, never invented
  currency: z.string().default("USD"),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  targetAudience: z.string().optional().nullable(), // description of target
  channels: z.array(z.string()).default([]), // instagram, facebook, tiktok, youtube, email
  creativeIds: z.array(z.string()).default([]), // linked commercial/video asset ids
  customerSegmentIds: z.array(z.string()).default([]), // linked CRM segments
  createdBy: z.string().optional().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const CampaignInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  type: z.enum(["brand-awareness", "direct-response", "product-launch", "retargeting", "seasonal", "lead-gen"]),
  status: z.enum(["draft", "active", "paused", "completed", "cancelled"]).optional(),
  budget: z.number().nonnegative().optional().nullable(),
  currency: z.string().optional(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  targetAudience: z.string().optional().nullable(),
  channels: z.array(z.string()).optional(),
  creativeIds: z.array(z.string()).optional(),
  customerSegmentIds: z.array(z.string()).optional(),
  createdBy: z.string().optional().nullable(),
});

const CampaignAudienceSchema = z.object({
  id: z.string().min(1),
  campaignId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  customerIds: z.array(z.string()).default([]),
  criteria: z.record(z.string(), z.unknown()).default({}), // filter criteria used
  size: z.number().nonnegative().default(0),
  createdAt: z.string().datetime(),
});

const CampaignCreativeSchema = z.object({
  id: z.string().min(1),
  campaignId: z.string().min(1),
  creativeType: z.enum(["commercial", "video", "image", "audio"]),
  creativeId: z.string().min(1), // id from asset factory or commercial/video output
  creativeName: z.string().min(1),
  role: z.enum(["hero", "supporting", "cta", "branding"]).default("supporting"),
  platform: z.string().optional().nullable(),
  createdAt: z.string().datetime(),
});

const CampaignPerformanceSchema = z.object({
  id: z.string().min(1),
  campaignId: z.string().min(1),
  date: z.string().datetime(),
  channel: z.string(),
  impressions: z.number().nonnegative().default(0),
  clicks: z.number().nonnegative().default(0),
  conversions: z.number().nonnegative().default(0),
  cost: z.number().nonnegative().default(0), // never auto-spent
  revenue: z.number().nonnegative().default(0),
  createdAt: z.string().datetime(),
});

/* ---------------------------------------------------------------- repository helpers */

function ensureDir() {
  fs.mkdirSync(CAMPAIGN_DIR, { recursive: true });
}

function readJson(file, defaultData) {
  ensureDir();
  try {
    const raw = fs.readFileSync(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return defaultData;
  }
}

function writeJson(file, data) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function generateId() {
  return `campaign-${crypto.randomBytes(8).toString("hex")}`;
}

function nowISO() {
  return new Date().toISOString();
}

/* ---------------------------------------------------------------- Campaigns */

function createCampaign(input) {
  const validated = CampaignInputSchema.parse(input);
  const campaigns = readJson(CAMPAIGNS_FILE, { entries: [], nextId: 1 });
  const now = nowISO();
  const id = `campaign-${crypto.randomBytes(8).toString("hex")}`;

  const campaign = {
    id,
    name: validated.name,
    description: validated.description ?? null,
    type: validated.type,
    status: validated.status ?? "draft",
    budget: validated.budget ?? null,
    currency: validated.currency ?? "USD",
    startDate: validated.startDate ?? null,
    endDate: validated.endDate ?? null,
    targetAudience: validated.targetAudience ?? null,
    channels: validated.channels ?? [],
    creativeIds: validated.creativeIds ?? [],
    customerSegmentIds: validated.customerSegmentIds ?? [],
    createdBy: validated.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };

  campaigns.entries.push(campaign);
  writeJson(CAMPAIGNS_FILE, campaigns);
  return { ok: true, campaign };
}

function getCampaign(campaignId) {
  const campaigns = readJson(CAMPAIGNS_FILE, { entries: [], nextId: 1 });
  const campaign = campaigns.entries.find((c) => c.id === campaignId);
  if (!campaign) return { ok: false, error: `Campaign not found: ${campaignId}` };
  return { ok: true, campaign };
}

function listCampaigns(filter = {}) {
  const campaigns = readJson(CAMPAIGNS_FILE, { entries: [], nextId: 1 });
  let entries = campaigns.entries;

  if (filter.status) entries = entries.filter((c) => c.status === filter.status);
  if (filter.type) entries = entries.filter((c) => c.type === filter.type);
  if (filter.channel) {
    entries = entries.filter((c) => (c.channels || []).includes(filter.channel));
  }
  if (filter.search) {
    const s = filter.search.toLowerCase();
    entries = entries.filter(
      (c) => c.name.toLowerCase().includes(s) || (c.description || "").toLowerCase().includes(s)
    );
  }

  entries.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return { ok: true, campaigns: entries, total: entries.length };
}

function updateCampaign(campaignId, updates) {
  const campaigns = readJson(CAMPAIGNS_FILE, { entries: [], nextId: 1 });
  const idx = campaigns.entries.findIndex((c) => c.id === campaignId);
  if (idx === -1) return { ok: false, error: `Campaign not found: ${campaignId}` };

  const validated = CampaignInputSchema.partial().parse(updates);
  campaigns.entries[idx] = {
    ...campaigns.entries[idx],
    ...validated,
    updatedAt: nowISO(),
  };
  writeJson(CAMPAIGNS_FILE, campaigns);
  return { ok: true, campaign: campaigns.entries[idx] };
}

function deleteCampaign(campaignId, authorizedBy) {
  if (!authorizedBy) {
    return { ok: false, error: "Authorization required for campaign deletion" };
  }
  const campaigns = readJson(CAMPAIGNS_FILE, { entries: [], nextId: 1 });
  const idx = campaigns.entries.findIndex((c) => c.id === campaignId);
  if (idx === -1) return { ok: false, error: `Campaign not found: ${campaignId}` };

  campaigns.entries[idx].deleted = true;
  campaigns.entries[idx].deletedBy = authorizedBy;
  campaigns.entries[idx].deletedAt = nowISO();
  campaigns.entries[idx].status = "cancelled";
  writeJson(CAMPAIGNS_FILE, campaigns);
  return { ok: true, campaign: campaigns.entries[idx] };
}

/* ---------------------------------------------------------------- Campaign Audiences */

function createCampaignAudience(input) {
  const validated = z.object({
    campaignId: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional().nullable(),
    customerIds: z.array(z.string()).optional(),
    criteria: z.record(z.string(), z.unknown()).optional(),
  }).parse(input);

  const campaigns = readJson(CAMPAIGNS_FILE, { entries: [], nextId: 1 });
  if (!campaigns.entries.find((c) => c.id === validated.campaignId)) {
    return { ok: false, error: `Campaign not found: ${validated.campaignId}` };
  }

  const audiences = readJson(CAMPAIGN_AUDIENCES_FILE, { entries: [], nextId: 1 });
  const now = nowISO();
  const id = `audience-${crypto.randomBytes(8).toString("hex")}`;

  const audience = {
    id,
    campaignId: validated.campaignId,
    name: validated.name,
    description: validated.description ?? null,
    customerIds: validated.customerIds ?? [],
    criteria: validated.criteria ?? {},
    size: (validated.customerIds ?? []).length,
    createdAt: now,
  };

  audiences.entries.push(audience);
  writeJson(CAMPAIGN_AUDIENCES_FILE, audiences);
  return { ok: true, audience };
}

function listCampaignAudiences(filter = {}) {
  const audiences = readJson(CAMPAIGN_AUDIENCES_FILE, { entries: [], nextId: 1 });
  let entries = audiences.entries;

  if (filter.campaignId) entries = entries.filter((a) => a.campaignId === filter.campaignId);

  return { ok: true, audiences: entries, total: entries.length };
}

/* ---------------------------------------------------------------- Campaign Creatives */

function linkCampaignCreative(input) {
  const validated = z.object({
    campaignId: z.string().min(1),
    creativeType: z.enum(["commercial", "video", "image", "audio"]),
    creativeId: z.string().min(1),
    creativeName: z.string().min(1),
    role: z.enum(["hero", "supporting", "cta", "branding"]).optional(),
    platform: z.string().optional().nullable(),
  }).parse(input);

  const campaigns = readJson(CAMPAIGNS_FILE, { entries: [], nextId: 1 });
  if (!campaigns.entries.find((c) => c.id === validated.campaignId)) {
    return { ok: false, error: `Campaign not found: ${validated.campaignId}` };
  }

  const creatives = readJson(CAMPAIGN_CREATIVES_FILE, { entries: [], nextId: 1 });
  const now = nowISO();
  const id = `creative-${crypto.randomBytes(8).toString("hex")}`;

  const creative = {
    id,
    campaignId: validated.campaignId,
    creativeType: validated.creativeType,
    creativeId: validated.creativeId,
    creativeName: validated.creativeName,
    role: validated.role ?? "supporting",
    platform: validated.platform ?? null,
    createdAt: now,
  };

  creatives.entries.push(creative);

  // Also add creativeId to campaign's creativeIds
  const campaignIdx = campaigns.entries.findIndex((c) => c.id === validated.campaignId);
  if (campaignIdx >= 0) {
    if (!campaigns.entries[campaignIdx].creativeIds) campaigns.entries[campaignIdx].creativeIds = [];
    campaigns.entries[campaignIdx].creativeIds.push(id);
    campaigns.entries[campaignIdx].updatedAt = now;
  }

  writeJson(CAMPAIGN_CREATIVES_FILE, creatives);
  writeJson(CAMPAIGNS_FILE, campaigns);
  return { ok: true, creative };
}

function listCampaignCreatives(filter = {}) {
  const creatives = readJson(CAMPAIGN_CREATIVES_FILE, { entries: [], nextId: 1 });
  let entries = creatives.entries;

  if (filter.campaignId) entries = entries.filter((c) => c.campaignId === filter.campaignId);
  if (filter.creativeType) entries = entries.filter((c) => c.creativeType === filter.creativeType);

  return { ok: true, creatives: entries, total: entries.length };
}

/* ---------------------------------------------------------------- Campaign Performance */

function recordCampaignPerformance(input) {
  const validated = z.object({
    campaignId: z.string().min(1),
    date: z.string().datetime().optional(),
    channel: z.string().min(1),
    impressions: z.number().nonnegative().optional(),
    clicks: z.number().nonnegative().optional(),
    conversions: z.number().nonnegative().optional(),
    cost: z.number().nonnegative().optional(),
    revenue: z.number().nonnegative().optional(),
  }).parse(input);

  const campaigns = readJson(CAMPAIGNS_FILE, { entries: [], nextId: 1 });
  if (!campaigns.entries.find((c) => c.id === validated.campaignId)) {
    return { ok: false, error: `Campaign not found: ${validated.campaignId}` };
  }

  const performance = readJson(CAMPAIGN_PERFORMANCE_FILE, { entries: [], nextId: 1 });
  const now = nowISO();
  const id = `perf-${crypto.randomBytes(8).toString("hex")}`;

  const entry = {
    id,
    campaignId: validated.campaignId,
    date: validated.date ?? now,
    channel: validated.channel,
    impressions: validated.impressions ?? 0,
    clicks: validated.clicks ?? 0,
    conversions: validated.conversions ?? 0,
    cost: validated.cost ?? 0,
    revenue: validated.revenue ?? 0,
    createdAt: now,
  };

  performance.entries.push(entry);
  writeJson(CAMPAIGN_PERFORMANCE_FILE, performance);
  return { ok: true, performance: entry };
}

function listCampaignPerformance(filter = {}) {
  const performance = readJson(CAMPAIGN_PERFORMANCE_FILE, { entries: [], nextId: 1 });
  let entries = performance.entries;

  if (filter.campaignId) entries = entries.filter((p) => p.campaignId === filter.campaignId);
  if (filter.channel) entries = entries.filter((p) => p.channel === filter.channel);

  entries.sort((a, b) => new Date(b.date) - new Date(a.date));
  return { ok: true, performance: entries, total: entries.length };
}

/* ---------------------------------------------------------------- Campaign with audiences + creatives */

function getCampaignWithDetails(campaignId) {
  const campaignResult = getCampaign(campaignId);
  if (!campaignResult.ok) return campaignResult;

  const audiencesResult = listCampaignAudiences({ campaignId });
  const creativesResult = listCampaignCreatives({ campaignId });
  const performanceResult = listCampaignPerformance({ campaignId });

  return {
    ok: true,
    campaign: campaignResult.campaign,
    audiences: audiencesResult.ok ? audiencesResult.audiences : [],
    creatives: creativesResult.ok ? creativesResult.creatives : [],
    performance: performanceResult.ok ? performanceResult.performance : [],
  };
}

/* ---------------------------------------------------------------- Build audience from CRM segments */

function buildAudienceFromCRM(campaignId, segmentName, filter = {}) {
  const customersResult = listCustomers(filter);
  if (!customersResult.ok) return customersResult;

  const customerIds = customersResult.customers.map((c) => c.id);

  return createCampaignAudience({
    campaignId,
    name: segmentName,
    description: `Built from CRM filter: ${JSON.stringify(filter)}`,
    customerIds,
    criteria: filter,
    size: customerIds.length,
  });
}

/* ---------------------------------------------------------------- Stats */

function getCampaignStats() {
  const campaigns = readJson(CAMPAIGNS_FILE, { entries: [], nextId: 1 }).entries;
  const performance = readJson(CAMPAIGN_PERFORMANCE_FILE, { entries: [], nextId: 1 }).entries;

  const byStatus = {};
  const byType = {};
  for (const c of campaigns) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    byType[c.type] = (byType[c.type] || 0) + 1;
  }

  const totalImpressions = performance.reduce((sum, p) => sum + (p.impressions || 0), 0);
  const totalClicks = performance.reduce((sum, p) => sum + (p.clicks || 0), 0);
  const totalConversions = performance.reduce((sum, p) => sum + (p.conversions || 0), 0);
  const totalCost = performance.reduce((sum, p) => sum + (p.cost || 0), 0);
  const totalRevenue = performance.reduce((sum, p) => sum + (p.revenue || 0), 0);

  const ctr = totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 100 : 0;
  const conversionRate = totalClicks > 0 ? Math.round((totalConversions / totalClicks) * 100) : 0;
  const roas = totalCost > 0 ? Math.round((totalRevenue / totalCost) * 100) / 100 : 0;

  return {
    totalCampaigns: campaigns.length,
    activeCampaigns: byStatus.active || 0,
    byStatus,
    byType,
    totalImpressions,
    totalClicks,
    totalConversions,
    totalCost,
    totalRevenue,
    ctr,
    conversionRate,
    roas,
  };
}

module.exports = {
  // Schemas
  CampaignSchema,
  CampaignInputSchema,
  CampaignAudienceSchema,
  CampaignCreativeSchema,
  CampaignPerformanceSchema,
  // Campaigns
  createCampaign,
  getCampaign,
  listCampaigns,
  updateCampaign,
  deleteCampaign,
  getCampaignWithDetails,
  // Audiences
  createCampaignAudience,
  listCampaignAudiences,
  buildAudienceFromCRM,
  // Creatives
  linkCampaignCreative,
  listCampaignCreatives,
  // Performance
  recordCampaignPerformance,
  listCampaignPerformance,
  // Stats
  getCampaignStats,
  // Constants
  CAMPAIGN_DIR,
};
