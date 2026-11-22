#!/usr/bin/env node
/**
 * Universal Creative Production Connector — Sales Pipeline
 *
 * Sales pipeline and deal management for Sales & Marketing Factory.
 * Connects CRM leads to closed deals, tracks pipeline stages, and forecasts revenue.
 *
 * Data model:
 *   - Deals: title, value, stage, probability, customer, lead, expected close date
 *   - Pipeline Stages: lead, qualified, proposal, negotiation, closed-won, closed-lost
 *   - Deal Activities: calls, emails, meetings, notes
 *
 * Rules:
 *   - Single source of truth (Zod schemas) — no duplicated schemas
 *   - All persistence through JSON repository files
 *   - Never invents prices or deal values — all from user input
 *   - Render-only safety: no auto-selling, no auto-commission
 *   - Depends on CRM module for customer/lead data
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { dataPath } = require("./data-dir.js");
const crypto = require("crypto");
const z = require("zod");

const PIPELINE_DIR = process.env.PIPELINE_DIR || dataPath("sales-marketing", "pipeline");
const DEALS_FILE = path.join(PIPELINE_DIR, "deals.json");
const DEAL_ACTIVITIES_FILE = path.join(PIPELINE_DIR, "deal-activities.json");
const PIPELINE_STAGES_FILE = path.join(PIPELINE_DIR, "pipeline-stages.json");

// Import CRM for customer/lead data
const { getCustomer, getLead, listLeads } = require("./crm.js");

/* ---------------------------------------------------------------- Zod schemas */

const PipelineStageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  order: z.number().int().nonnegative(),
  probability: z.number().min(0).max(100), // % chance of closing at this stage
  type: z.enum(["lead", "qualified", "proposal", "negotiation", "closed-won", "closed-lost"]),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
});

const DealSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  value: z.number().nonnegative(), // deal value in dollars — never invented
  currency: z.string().default("USD"),
  stageId: z.string().min(1),
  stage: z.string().optional(), // denormalized stage name for convenience
  customerId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
  probability: z.number().min(0).max(100).optional(),
  expectedCloseDate: z.string().datetime().optional().nullable(),
  actualCloseDate: z.string().datetime().optional().nullable(),
  owner: z.string().optional().nullable(), // sales rep
  source: z.string().optional().nullable(), // campaign, referral, inventory, manual
  tags: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const DealInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  value: z.number().nonnegative(),
  currency: z.string().optional(),
  stageId: z.string().min(1),
  customerId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
  probability: z.number().min(0).max(100).optional(),
  expectedCloseDate: z.string().datetime().optional().nullable(),
  owner: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

const DealActivitySchema = z.object({
  id: z.string().min(1),
  dealId: z.string().min(1),
  type: z.enum(["call", "email", "meeting", "note", "task"]),
  subject: z.string().min(1),
  notes: z.string().optional().nullable(),
  outcome: z.string().optional().nullable(),
  scheduledAt: z.string().datetime().optional().nullable(),
  completedAt: z.string().datetime().optional().nullable(),
  createdAt: z.string().datetime(),
});

const DealActivityInputSchema = z.object({
  dealId: z.string().min(1),
  type: z.enum(["call", "email", "meeting", "note", "task"]),
  subject: z.string().min(1),
  notes: z.string().optional().nullable(),
  outcome: z.string().optional().nullable(),
  scheduledAt: z.string().datetime().optional().nullable(),
});

/* ---------------------------------------------------------------- repository helpers */

function ensureDir() {
  fs.mkdirSync(PIPELINE_DIR, { recursive: true });
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
  return `deal-${crypto.randomBytes(8).toString("hex")}`;
}

function nowISO() {
  return new Date().toISOString();
}

/* ---------------------------------------------------------------- Pipeline Stages */

function createPipelineStage(input) {
  const validated = z.object({
    name: z.string().min(1),
    order: z.number().int().nonnegative(),
    probability: z.number().min(0).max(100),
    type: z.enum(["lead", "qualified", "proposal", "negotiation", "closed-won", "closed-lost"]),
    isActive: z.boolean().optional(),
  }).parse(input);

  const stages = readJson(PIPELINE_STAGES_FILE, { entries: [], nextId: 1 });
  const now = nowISO();
  const id = `stage-${crypto.randomBytes(8).toString("hex")}`;

  const stage = {
    id,
    name: validated.name,
    order: validated.order,
    probability: validated.probability,
    type: validated.type,
    isActive: validated.isActive ?? true,
    createdAt: now,
  };

  stages.entries.push(stage);
  writeJson(PIPELINE_STAGES_FILE, stages);
  return { ok: true, stage };
}

function listPipelineStages(filter = {}) {
  const stages = readJson(PIPELINE_STAGES_FILE, { entries: [], nextId: 1 });
  let entries = stages.entries;

  if (filter.isActive !== undefined) entries = entries.filter((s) => s.isActive === filter.isActive);
  if (filter.type) entries = entries.filter((s) => s.type === filter.type);

  entries.sort((a, b) => a.order - b.order);
  return { ok: true, stages: entries, total: entries.length };
}

function initializeDefaultStages() {
  const existing = listPipelineStages();
  if (existing.total > 0) return existing;

  const defaultStages = [
    { name: "Lead", order: 0, probability: 10, type: "lead" },
    { name: "Qualified", order: 1, probability: 25, type: "qualified" },
    { name: "Proposal", order: 2, probability: 50, type: "proposal" },
    { name: "Negotiation", order: 3, probability: 75, type: "negotiation" },
    { name: "Closed Won", order: 4, probability: 100, type: "closed-won" },
    { name: "Closed Lost", order: 5, probability: 0, type: "closed-lost" },
  ];

  const results = [];
  for (const s of defaultStages) {
    const created = createPipelineStage(s);
    if (created.ok) results.push(created.stage);
  }
  return { ok: true, stages: results };
}

/* ---------------------------------------------------------------- Deals */

function createDeal(input) {
  const validatedResult = DealInputSchema.safeParse(input);
  if (!validatedResult.success) {
    return { ok: false, error: validatedResult.error.issues.map(e => e.message).join(', ') };
  }
  const validated = validatedResult.data;
  const stages = readJson(PIPELINE_STAGES_FILE, { entries: [], nextId: 1 });

  // Verify stage exists
  const stage = stages.entries.find((s) => s.id === validated.stageId);
  if (!stage) {
    return { ok: false, error: `Pipeline stage not found: ${validated.stageId}` };
  }

  // Verify customer exists if provided
  if (validated.customerId) {
    const customerResult = getCustomer(validated.customerId);
    if (!customerResult.ok) {
      return { ok: false, error: `Customer not found: ${validated.customerId}` };
    }
  }

  // Verify lead exists if provided
  if (validated.leadId) {
    const leads = listLeads();
    if (!leads.ok || !leads.leads.find((l) => l.id === validated.leadId)) {
      return { ok: false, error: `Lead not found: ${validated.leadId}` };
    }
  }

  const deals = readJson(DEALS_FILE, { entries: [], nextId: 1 });
  const now = nowISO();
  const id = `deal-${crypto.randomBytes(8).toString("hex")}`;

  const probability = validated.probability ?? stage.probability;

  const deal = {
    id,
    title: validated.title,
    description: validated.description ?? null,
    value: validated.value,
    currency: validated.currency ?? "USD",
    stageId: validated.stageId,
    stage: stage.name,
    customerId: validated.customerId ?? null,
    leadId: validated.leadId ?? null,
    probability,
    expectedCloseDate: validated.expectedCloseDate ?? null,
    actualCloseDate: null,
    owner: validated.owner ?? null,
    source: validated.source ?? null,
    tags: validated.tags ?? [],
    createdAt: now,
    updatedAt: now,
  };

  deals.entries.push(deal);
  writeJson(DEALS_FILE, deals);
  return { ok: true, deal };
}

function getDeal(dealId) {
  const deals = readJson(DEALS_FILE, { entries: [], nextId: 1 });
  const deal = deals.entries.find((d) => d.id === dealId);
  if (!deal) return { ok: false, error: `Deal not found: ${dealId}` };
  return { ok: true, deal };
}

function listDeals(filter = {}) {
  const deals = readJson(DEALS_FILE, { entries: [], nextId: 1 });
  let entries = deals.entries;

  if (filter.stageId) entries = entries.filter((d) => d.stageId === filter.stageId);
  if (filter.stage) entries = entries.filter((d) => d.stage === filter.stage);
  if (filter.customerId) entries = entries.filter((d) => d.customerId === filter.customerId);
  if (filter.leadId) entries = entries.filter((d) => d.leadId === filter.leadId);
  if (filter.owner) entries = entries.filter((d) => d.owner === filter.owner);
  if (filter.source) entries = entries.filter((d) => d.source === filter.source);
  if (filter.minValue !== undefined) {
    entries = entries.filter((d) => d.value >= filter.minValue);
  }
  if (filter.maxValue !== undefined) {
    entries = entries.filter((d) => d.value <= filter.maxValue);
  }

  entries.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return { ok: true, deals: entries, total: entries.length };
}

function updateDeal(dealId, updates) {
  const deals = readJson(DEALS_FILE, { entries: [], nextId: 1 });
  const idx = deals.entries.findIndex((d) => d.id === dealId);
  if (idx === -1) return { ok: false, error: `Deal not found: ${dealId}` };

  const validatedResult = DealInputSchema.partial().safeParse(updates);
  if (!validatedResult.success) {
    return { ok: false, error: validatedResult.error.issues.map(e => e.message).join(', ') };
  }
  const validated = validatedResult.data;
  const stages = readJson(PIPELINE_STAGES_FILE, { entries: [], nextId: 1 });

  // If stage changed, update stage name and probability
  if (validated.stageId && validated.stageId !== deals.entries[idx].stageId) {
    const stage = stages.entries.find((s) => s.id === validated.stageId);
    if (stage) {
      validated.stage = stage.name;
      if (validated.probability === undefined) validated.probability = stage.probability;
    }
  }

  // If closed won/lost, set actual close date
  if (validated.stageId) {
    const stage = stages.entries.find((s) => s.id === validated.stageId);
    if (stage && (stage.type === "closed-won" || stage.type === "closed-lost")) {
      if (!deals.entries[idx].actualCloseDate) validated.actualCloseDate = nowISO();
    }
  }

  deals.entries[idx] = {
    ...deals.entries[idx],
    ...validated,
    updatedAt: nowISO(),
  };
  writeJson(DEALS_FILE, deals);
  return { ok: true, deal: deals.entries[idx] };
}

function deleteDeal(dealId, authorizedBy) {
  if (!authorizedBy) {
    return { ok: false, error: "Authorization required for deal deletion" };
  }
  const deals = readJson(DEALS_FILE, { entries: [], nextId: 1 });
  const idx = deals.entries.findIndex((d) => d.id === dealId);
  if (idx === -1) return { ok: false, error: `Deal not found: ${dealId}` };

  deals.entries[idx].deleted = true;
  deals.entries[idx].deletedBy = authorizedBy;
  deals.entries[idx].deletedAt = nowISO();
  writeJson(DEALS_FILE, deals);
  return { ok: true, deal: deals.entries[idx] };
}

/* ---------------------------------------------------------------- Deal Activities */

function createDealActivity(input) {
  const validatedResult = DealActivityInputSchema.safeParse(input);
  if (!validatedResult.success) {
    return { ok: false, error: validatedResult.error.issues.map(e => e.message).join(', ') };
  }
  const validated = validatedResult.data;
  const deals = readJson(DEALS_FILE, { entries: [], nextId: 1 });
  if (!deals.entries.find((d) => d.id === validated.dealId)) {
    return { ok: false, error: `Deal not found: ${validated.dealId}` };
  }

  const activities = readJson(DEAL_ACTIVITIES_FILE, { entries: [], nextId: 1 });
  const now = nowISO();
  const id = `activity-${crypto.randomBytes(8).toString("hex")}`;

  const activity = {
    id,
    dealId: validated.dealId,
    type: validated.type,
    subject: validated.subject,
    notes: validated.notes ?? null,
    outcome: validated.outcome ?? null,
    scheduledAt: validated.scheduledAt ?? null,
    completedAt: null,
    createdAt: now,
  };

  activities.entries.push(activity);
  writeJson(DEAL_ACTIVITIES_FILE, activities);

  // Update deal's updatedAt
  const dealIdx = deals.entries.findIndex((d) => d.id === validated.dealId);
  if (dealIdx >= 0) {
    deals.entries[dealIdx].updatedAt = now;
    writeJson(DEALS_FILE, deals);
  }

  return { ok: true, activity };
}

function listDealActivities(filter = {}) {
  const activities = readJson(DEAL_ACTIVITIES_FILE, { entries: [], nextId: 1 });
  let entries = activities.entries;

  if (filter.dealId) entries = entries.filter((a) => a.dealId === filter.dealId);
  if (filter.type) entries = entries.filter((a) => a.type === filter.type);

  entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return { ok: true, activities: entries, total: entries.length };
}

/* ---------------------------------------------------------------- Deal with activities */

function getDealWithActivities(dealId) {
  const dealResult = getDeal(dealId);
  if (!dealResult.ok) return dealResult;

  const activitiesResult = listDealActivities({ dealId });
  return {
    ok: true,
    deal: dealResult.deal,
    activities: activitiesResult.ok ? activitiesResult.activities : [],
  };
}

/* ---------------------------------------------------------------- Pipeline stats / forecasting */

function getPipelineStats() {
  const deals = readJson(DEALS_FILE, { entries: [], nextId: 1 }).entries;
  const stages = readJson(PIPELINE_STAGES_FILE, { entries: [], nextId: 1 }).entries;

  const byStage = {};
  const weightedByStage = {};
  let totalValue = 0;
  let weightedTotal = 0;
  let openValue = 0;
  let wonValue = 0;
  let lostValue = 0;

  for (const d of deals) {
    if (d.deleted) continue;

    totalValue += d.value;
    const weight = d.probability / 100;
    weightedTotal += d.value * weight;

    const stageName = d.stage || "unknown";
    byStage[stageName] = (byStage[stageName] || 0) + 1;
    weightedByStage[stageName] = (weightedByStage[stageName] || 0) + d.value * weight;

    const stageObj = stages.find((s) => s.id === d.stageId || s.name === d.stage);
    if (stageObj && stageObj.type === "closed-won") {
      wonValue += d.value;
    } else if (stageObj && stageObj.type === "closed-lost") {
      lostValue += d.value;
    } else {
      openValue += d.value;
    }
  }

  const openDeals = deals.filter((d) => !d.deleted && !["closed-won", "closed-lost"].includes((d.stage || "").toLowerCase().replace(" ", "-")));
  const openWeighted = openDeals.reduce((sum, d) => sum + d.value * (d.probability / 100), 0);

  return {
    totalDeals: deals.filter((d) => !d.deleted).length,
    totalValue,
    weightedPipeline: weightedTotal,
    openValue,
    openWeightedValue: openWeighted,
    wonValue,
    lostValue,
    byStage,
    weightedByStage,
    averageDealSize: deals.filter((d) => !d.deleted).length > 0 ? totalValue / deals.filter((d) => !d.deleted).length : 0,
  };
}

function getForecast() {
  const deals = readJson(DEALS_FILE, { entries: [], nextId: 1 }).entries;
  const now = new Date();

  // Group by expected close month
  const byMonth = {};
  for (const d of deals) {
    if (d.deleted) continue;
    if (["closed-won", "closed-lost"].includes((d.stage || "").toLowerCase().replace(" ", "-"))) continue;
    if (!d.expectedCloseDate) continue;

    const closeDate = new Date(d.expectedCloseDate);
    if (closeDate < now) continue; // only future

    const monthKey = closeDate.toISOString().slice(0, 7); // YYYY-MM
    if (!byMonth[monthKey]) byMonth[monthKey] = { value: 0, weighted: 0, count: 0 };
    byMonth[monthKey].value += d.value;
    byMonth[monthKey].weighted += d.value * (d.probability / 100);
    byMonth[monthKey].count += 1;
  }

  const months = Object.entries(byMonth).map(([month, data]) => ({
    month,
    ...data,
  }));

  return {
    totalForecast: months.reduce((sum, m) => sum + m.weighted, 0),
    months,
  };
}

module.exports = {
  // Schemas
  PipelineStageSchema,
  DealSchema,
  DealInputSchema,
  DealActivitySchema,
  DealActivityInputSchema,
  // Stages
  createPipelineStage,
  listPipelineStages,
  initializeDefaultStages,
  // Deals
  createDeal,
  getDeal,
  listDeals,
  updateDeal,
  deleteDeal,
  getDealWithActivities,
  // Activities
  createDealActivity,
  listDealActivities,
  // Stats
  getPipelineStats,
  getForecast,
  // Constants
  PIPELINE_DIR,
};
