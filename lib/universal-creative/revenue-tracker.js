#!/usr/bin/env node
/**
 * Universal Creative Production Connector — Revenue Tracker
 *
 * Revenue tracking and commission management for Sales & Marketing Factory.
 * Connects closed-won deals to revenue, calculates commissions, and attributes
 * revenue to campaigns for ROI measurement.
 *
 * Data model:
 *   - Revenue records: amount, source deal, campaign, date, status
 *   - Commission records: rate, amount, payee, deal, status
 *   - Revenue attribution: links revenue to campaigns and channels
 *
 * Rules:
 *   - Single source of truth (Zod schemas) — no duplicated schemas
 *   - All persistence through JSON repository files
 *   - Never invents prices or revenue — all from actual deals
 *   - Render-only safety: no auto-commission payment, no auto-invoicing
 *   - Depends on Sales Pipeline for deal data
 *   - Depends on Campaign Manager for campaign attribution
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { dataPath } = require("./data-dir.js");
const crypto = require("crypto");
const z = require("zod");

const REVENUE_DIR = process.env.REVENUE_DIR || dataPath("sales-marketing", "revenue");
const REVENUE_FILE = path.join(REVENUE_DIR, "revenue.json");
const COMMISSION_FILE = path.join(REVENUE_DIR, "commissions.json");
const ATTRIBUTION_FILE = path.join(REVENUE_DIR, "attribution.json");

// Import Sales Pipeline for deal data
const { getDeal, listDeals } = require("./sales-pipeline.js");
// Import Campaign Manager for campaign data
const { getCampaign } = require("./campaign-manager.js");

/* ---------------------------------------------------------------- Zod schemas */

const RevenueRecordSchema = z.object({
  id: z.string().min(1),
  dealId: z.string().min(1),
  amount: z.number().nonnegative(),
  currency: z.string().default("USD"),
  date: z.string().datetime(),
  status: z.enum(["pending", "received", "refunded", "disputed"]).default("pending"),
  source: z.string().optional().nullable(), // campaign, referral, direct, inventory
  campaignId: z.string().optional().nullable(),
  channel: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const RevenueInputSchema = z.object({
  dealId: z.string().min(1),
  amount: z.number().nonnegative().optional(),
  currency: z.string().optional(),
  date: z.string().datetime().optional(),
  status: z.enum(["pending", "received", "refunded", "disputed"]).optional(),
  source: z.string().optional().nullable(),
  campaignId: z.string().optional().nullable(),
  channel: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});

const CommissionSchema = z.object({
  id: z.string().min(1),
  dealId: z.string().min(1),
  revenueId: z.string().optional().nullable(),
  payee: z.string().min(1), // sales rep or agent
  rate: z.number().min(0).max(100), // commission percentage
  amount: z.number().nonnegative(), // calculated commission amount
  currency: z.string().default("USD"),
  status: z.enum(["calculated", "approved", "paid", "voided"]).default("calculated"),
  paidDate: z.string().datetime().optional().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const CommissionInputSchema = z.object({
  dealId: z.string().min(1),
  payee: z.string().min(1),
  rate: z.number().min(0).max(100),
  amount: z.number().nonnegative().optional(), // if not provided, calculated from revenue
  currency: z.string().optional(),
  status: z.enum(["calculated", "approved", "paid", "voided"]).optional(),
});

const AttributionSchema = z.object({
  id: z.string().min(1),
  campaignId: z.string().min(1),
  channel: z.string().min(1),
  revenue: z.number().nonnegative(),
  conversions: z.number().nonnegative().default(0),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  createdAt: z.string().datetime(),
});

/* ---------------------------------------------------------------- repository helpers */

function ensureDir() {
  fs.mkdirSync(REVENUE_DIR, { recursive: true });
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
  return `rev-${crypto.randomBytes(8).toString("hex")}`;
}

function nowISO() {
  return new Date().toISOString();
}

/* ---------------------------------------------------------------- Revenue Records */

function createRevenueRecord(input) {
  const validatedResult = RevenueInputSchema.safeParse(input);
  if (!validatedResult.success) {
    return { ok: false, error: validatedResult.error.issues.map((e) => e.message).join(", ") };
  }
  const validated = validatedResult.data;

  // Verify deal exists
  const dealResult = getDeal(validated.dealId);
  if (!dealResult.ok) {
    return { ok: false, error: `Deal not found: ${validated.dealId}` };
  }

  const deal = dealResult.deal;
  const amount = validated.amount !== undefined ? validated.amount : deal.value;

  const revenue = readJson(REVENUE_FILE, { entries: [], nextId: 1 });
  const now = nowISO();
  const id = `revenue-${crypto.randomBytes(8).toString("hex")}`;

  const record = {
    id,
    dealId: validated.dealId,
    amount,
    currency: validated.currency ?? deal.currency ?? "USD",
    date: validated.date ?? now,
    status: validated.status ?? "pending",
    source: validated.source ?? deal.source ?? null,
    campaignId: validated.campaignId ?? null,
    channel: validated.channel ?? null,
    description: validated.description ?? `Revenue from deal: ${deal.title}`,
    createdAt: now,
    updatedAt: now,
  };

  revenue.entries.push(record);
  writeJson(REVENUE_FILE, revenue);
  return { ok: true, revenue: record };
}

function getRevenueRecord(revenueId) {
  const revenue = readJson(REVENUE_FILE, { entries: [], nextId: 1 });
  const record = revenue.entries.find((r) => r.id === revenueId);
  if (!record) return { ok: false, error: `Revenue record not found: ${revenueId}` };
  return { ok: true, revenue: record };
}

function listRevenueRecords(filter = {}) {
  const revenue = readJson(REVENUE_FILE, { entries: [], nextId: 1 });
  let entries = revenue.entries;

  if (filter.dealId) entries = entries.filter((r) => r.dealId === filter.dealId);
  if (filter.status) entries = entries.filter((r) => r.status === filter.status);
  if (filter.campaignId) entries = entries.filter((r) => r.campaignId === filter.campaignId);
  if (filter.channel) entries = entries.filter((r) => r.channel === filter.channel);
  if (filter.source) entries = entries.filter((r) => r.source === filter.source);
  if (filter.minAmount !== undefined) {
    entries = entries.filter((r) => r.amount >= filter.minAmount);
  }
  if (filter.maxAmount !== undefined) {
    entries = entries.filter((r) => r.amount <= filter.maxAmount);
  }

  entries.sort((a, b) => new Date(b.date) - new Date(a.date));
  return { ok: true, revenue: entries, total: entries.length };
}

function updateRevenueRecord(revenueId, updates) {
  const revenue = readJson(REVENUE_FILE, { entries: [], nextId: 1 });
  const idx = revenue.entries.findIndex((r) => r.id === revenueId);
  if (idx === -1) return { ok: false, error: `Revenue record not found: ${revenueId}` };

  const validatedResult = RevenueInputSchema.partial().safeParse(updates);
  if (!validatedResult.success) {
    return { ok: false, error: validatedResult.error.issues.map((e) => e.message).join(", ") };
  }

  revenue.entries[idx] = {
    ...revenue.entries[idx],
    ...validatedResult.data,
    updatedAt: nowISO(),
  };
  writeJson(REVENUE_FILE, revenue);
  return { ok: true, revenue: revenue.entries[idx] };
}

/* ---------------------------------------------------------------- Commissions */

function createCommission(input) {
  const validatedResult = CommissionInputSchema.safeParse(input);
  if (!validatedResult.success) {
    return { ok: false, error: validatedResult.error.issues.map((e) => e.message).join(", ") };
  }
  const validated = validatedResult.data;

  // Verify deal exists
  const dealResult = getDeal(validated.dealId);
  if (!dealResult.ok) {
    return { ok: false, error: `Deal not found: ${validated.dealId}` };
  }

  const deal = dealResult.deal;

  // Calculate commission amount if not provided
  let amount = validated.amount;
  if (amount === undefined) {
    // Find associated revenue record
    const revenueResult = listRevenueRecords({ dealId: validated.dealId });
    const revenueAmount = revenueResult.ok && revenueResult.revenue.length > 0
      ? revenueResult.revenue[0].amount
      : deal.value;
    amount = Math.round(revenueAmount * (validated.rate / 100) * 100) / 100;
  }

  const commissions = readJson(COMMISSION_FILE, { entries: [], nextId: 1 });
  const now = nowISO();
  const id = `comm-${crypto.randomBytes(8).toString("hex")}`;

  const commission = {
    id,
    dealId: validated.dealId,
    revenueId: null,
    payee: validated.payee,
    rate: validated.rate,
    amount,
    currency: validated.currency ?? deal.currency ?? "USD",
    status: validated.status ?? "calculated",
    paidDate: null,
    createdAt: now,
    updatedAt: now,
  };

  commissions.entries.push(commission);
  writeJson(COMMISSION_FILE, commissions);
  return { ok: true, commission };
}

function listCommissions(filter = {}) {
  const commissions = readJson(COMMISSION_FILE, { entries: [], nextId: 1 });
  let entries = commissions.entries;

  if (filter.dealId) entries = entries.filter((c) => c.dealId === filter.dealId);
  if (filter.payee) entries = entries.filter((c) => c.payee === filter.payee);
  if (filter.status) entries = entries.filter((c) => c.status === filter.status);

  entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return { ok: true, commissions: entries, total: entries.length };
}

function updateCommission(commissionId, updates) {
  const commissions = readJson(COMMISSION_FILE, { entries: [], nextId: 1 });
  const idx = commissions.entries.findIndex((c) => c.id === commissionId);
  if (idx === -1) return { ok: false, error: `Commission not found: ${commissionId}` };

  const validatedResult = CommissionInputSchema.partial().safeParse(updates);
  if (!validatedResult.success) {
    return { ok: false, error: validatedResult.error.issues.map((e) => e.message).join(", ") };
  }

  // If status changes to paid, set paid date
  let paidDate = commissions.entries[idx].paidDate;
  if (validatedResult.data.status === "paid" && !paidDate) {
    paidDate = nowISO();
  }

  commissions.entries[idx] = {
    ...commissions.entries[idx],
    ...validatedResult.data,
    paidDate,
    updatedAt: nowISO(),
  };
  writeJson(COMMISSION_FILE, commissions);
  return { ok: true, commission: commissions.entries[idx] };
}

/* ---------------------------------------------------------------- Attribution */

function recordAttribution(input) {
  const validatedResult = z.object({
    campaignId: z.string().min(1),
    channel: z.string().min(1),
    revenue: z.number().nonnegative(),
    conversions: z.number().nonnegative().optional(),
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
  }).safeParse(input);

  if (!validatedResult.success) {
    return { ok: false, error: validatedResult.error.issues.map((e) => e.message).join(", ") };
  }
  const validated = validatedResult.data;

  // Verify campaign exists
  const campaignResult = getCampaign(validated.campaignId);
  if (!campaignResult.ok) {
    return { ok: false, error: `Campaign not found: ${validated.campaignId}` };
  }

  const attribution = readJson(ATTRIBUTION_FILE, { entries: [], nextId: 1 });
  const now = nowISO();
  const id = `attr-${crypto.randomBytes(8).toString("hex")}`;

  const record = {
    id,
    campaignId: validated.campaignId,
    channel: validated.channel,
    revenue: validated.revenue,
    conversions: validated.conversions ?? 0,
    periodStart: validated.periodStart,
    periodEnd: validated.periodEnd,
    createdAt: now,
  };

  attribution.entries.push(record);
  writeJson(ATTRIBUTION_FILE, attribution);
  return { ok: true, attribution: record };
}

function listAttribution(filter = {}) {
  const attribution = readJson(ATTRIBUTION_FILE, { entries: [], nextId: 1 });
  let entries = attribution.entries;

  if (filter.campaignId) entries = entries.filter((a) => a.campaignId === filter.campaignId);
  if (filter.channel) entries = entries.filter((a) => a.channel === filter.channel);

  entries.sort((a, b) => new Date(b.periodEnd) - new Date(a.periodEnd));
  return { ok: true, attribution: entries, total: entries.length };
}

/* ---------------------------------------------------------------- Revenue stats */

function getRevenueStats(filter = {}) {
  const revenue = readJson(REVENUE_FILE, { entries: [], nextId: 1 }).entries;
  const commissions = readJson(COMMISSION_FILE, { entries: [], nextId: 1 }).entries;

  let totalRevenue = 0;
  let receivedRevenue = 0;
  let pendingRevenue = 0;

  for (const r of revenue) {
    if (r.status === "received") {
      receivedRevenue += r.amount;
    } else if (r.status === "pending") {
      pendingRevenue += r.amount;
    }
    totalRevenue += r.amount;
  }

  let totalCommission = 0;
  let paidCommission = 0;
  let pendingCommission = 0;

  for (const c of commissions) {
    totalCommission += c.amount;
    if (c.status === "paid") paidCommission += c.amount;
    else if (c.status === "calculated" || c.status === "approved") pendingCommission += c.amount;
  }

  const byStatus = {};
  for (const r of revenue) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  }

  const bySource = {};
  for (const r of revenue) {
    bySource[r.source || "unknown"] = (bySource[r.source || "unknown"] || 0) + 1;
  }

  return {
    totalRevenue,
    receivedRevenue,
    pendingRevenue,
    totalCommission,
    paidCommission,
    pendingCommission,
    totalRecords: revenue.length,
    totalCommissions: commissions.length,
    byStatus,
    bySource,
  };
}

function getRevenueByCampaign() {
  const revenue = readJson(REVENUE_FILE, { entries: [], nextId: 1 }).entries;
  const byCampaign = {};

  for (const r of revenue) {
    const key = r.campaignId || "unattributed";
    if (!byCampaign[key]) {
      byCampaign[key] = { campaignId: r.campaignId, revenue: 0, count: 0 };
    }
    byCampaign[key].revenue += r.amount;
    byCampaign[key].count += 1;
  }

  return Object.values(byCampaign).sort((a, b) => b.revenue - a.revenue);
}

function getRevenueByChannel() {
  const revenue = readJson(REVENUE_FILE, { entries: [], nextId: 1 }).entries;
  const byChannel = {};

  for (const r of revenue) {
    const key = r.channel || "unknown";
    if (!byChannel[key]) byChannel[key] = { channel: key, revenue: 0, count: 0 };
    byChannel[key].revenue += r.amount;
    byChannel[key].count += 1;
  }

  return Object.values(byChannel).sort((a, b) => b.revenue - a.revenue);
}

module.exports = {
  // Schemas
  RevenueRecordSchema,
  RevenueInputSchema,
  CommissionSchema,
  CommissionInputSchema,
  AttributionSchema,
  // Revenue
  createRevenueRecord,
  getRevenueRecord,
  listRevenueRecords,
  updateRevenueRecord,
  // Commissions
  createCommission,
  listCommissions,
  updateCommission,
  // Attribution
  recordAttribution,
  listAttribution,
  // Stats
  getRevenueStats,
  getRevenueByCampaign,
  getRevenueByChannel,
  // Constants
  REVENUE_DIR,
};
