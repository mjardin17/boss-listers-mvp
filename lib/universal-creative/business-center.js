/**
 * Universal Creative Production Connector — Business Center
 *
 * Ported from the Arena "growth-factory" prototype (2026-11-21). Only the
 * pieces that did not already exist in lib/universal-creative are here:
 *
 *   - Business profile: the shared context every module reads (products,
 *     target customer, brand voice, approved claims, average order value,
 *     AI spend limit).
 *   - Claims check: flags risky or unapproved marketing claims before any
 *     copy is used.
 *   - Growth audit: rule-based opportunities built from real CRM and
 *     campaign data. Money impact is only ever a labelled ESTIMATE.
 *   - Landing pages: tied to a campaign; only served while that campaign is
 *     active. Lead capture requires consent, dedupes by email, honours an
 *     idempotency key, and writes into the existing CRM.
 *
 * Rules:
 *   - CRM and campaigns stay in crm.js and campaign-manager.js (one system per job).
 *   - No invented data. Estimates are labelled and never counted as revenue.
 *   - Render-only safety: nothing here sends, posts or contacts anyone.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const z = require("zod");

const crm = require("./crm.js");
const campaigns = require("./campaign-manager.js");

const BC_DIR = process.env.BUSINESS_CENTER_DIR || path.join(os.tmpdir(), "sales-marketing", "business-center");
const PROFILE_FILE = path.join(BC_DIR, "profile.json");
const AUDIT_FILE = path.join(BC_DIR, "opportunities.json");
const LANDING_FILE = path.join(BC_DIR, "landing-pages.json");
const IDEM_FILE = path.join(BC_DIR, "idempotency.json");

const ASSUMED_CONVERSION = 0.05; // used ONLY for labelled estimates
const RISKY_CLAIMS = ["guarantee", "guaranteed", "#1", "cure", "best in", "100%", "risk-free"];

/* ---------------------------------------------------------------- storage */

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

const nowIso = () => new Date().toISOString();

/* crm.js and campaign-manager.js return { ok, ... } envelopes; unwrap them here. */
function unwrap(res, key) {
  if (!res || res.ok === false) throw new Error((res && res.error) || `${key} call failed`);
  return res[key];
}
const findCampaign = (id) => {
  const res = campaigns.getCampaign(id);
  return res && res.ok ? res.campaign : null;
};
const allCampaigns = () => unwrap(campaigns.listCampaigns(), "campaigns");
const allLeads = () => unwrap(crm.listLeads(), "leads");
const allCustomers = () => unwrap(crm.listCustomers(), "customers");

/* ---------------------------------------------------------------- schemas */

const ProfileInputSchema = z.object({
  name: z.string().trim().max(200).optional(),
  industry: z.string().trim().max(200).optional(),
  location: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  email: z.union([z.string().trim().email(), z.literal("")]).optional(),
  products: z.string().trim().max(5000).optional(),
  targetCustomer: z.string().trim().max(2000).optional(),
  brandVoice: z.string().trim().max(2000).optional(),
  approvedClaims: z.array(z.string().trim().min(1).max(300)).max(100).optional(),
  avgOrderValueCents: z.number().int().nonnegative().optional(),
  aiSpendLimitCents: z.number().int().nonnegative().optional(),
});

const EMPTY_PROFILE = Object.freeze({
  name: "",
  industry: "",
  location: "",
  phone: "",
  email: "",
  products: "",
  targetCustomer: "",
  brandVoice: "",
  approvedClaims: [],
  avgOrderValueCents: 0,
  aiSpendLimitCents: 5000,
  updatedAt: null,
});

const LandingInputSchema = z.object({
  campaignId: z.string().min(1),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase letters, numbers and dashes"),
  headline: z.string().trim().min(1).max(200),
  body: z.string().trim().max(5000).default(""),
  offer: z.string().trim().max(500).default(""),
  cta: z.string().trim().min(1).max(80).default("Get in touch"),
});

const LeadCaptureSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email(),
  phone: z.string().trim().max(50).optional().nullable(),
  timeline: z.string().trim().max(200).optional().default(""),
  consent: z.boolean(),
});

/* ---------------------------------------------------------------- profile */

function getProfile() {
  return { ...EMPTY_PROFILE, ...readJson(PROFILE_FILE, {}) };
}

function saveProfile(input) {
  const parsed = ProfileInputSchema.parse(input || {});
  const next = { ...getProfile(), ...parsed, updatedAt: nowIso() };
  writeJson(PROFILE_FILE, next);
  return next;
}

/* ---------------------------------------------------------------- claims check */

/**
 * Flags risky phrases unless the owner listed them as approved claims.
 * @param {string} text
 * @returns {{ ok: boolean, flagged: string[] }}
 */
function checkClaims(text) {
  const lower = String(text || "").toLowerCase();
  const approved = getProfile().approvedClaims.map((c) => c.toLowerCase());
  const flagged = RISKY_CLAIMS.filter(
    (phrase) => lower.includes(phrase) && !approved.some((a) => a.includes(phrase))
  );
  return { ok: flagged.length === 0, flagged };
}

/* ---------------------------------------------------------------- growth audit */

const PROFILE_FIELDS = [
  ["name", "Business name"],
  ["industry", "Industry"],
  ["products", "Products/services"],
  ["targetCustomer", "Target customer"],
  ["brandVoice", "Brand voice"],
  ["avgOrderValueCents", "Average order value"],
];

function opportunity(area, detected, evidence, impactCents, basis, action) {
  return {
    id: crypto.randomUUID(),
    area,
    detected,
    evidence,
    estimatedImpactCents: impactCents,
    impactBasis: basis,
    recommendedAction: action,
    status: "open",
    createdAt: nowIso(),
  };
}

function runGrowthAudit() {
  const profile = getProfile();
  const found = [];

  const missing = PROFILE_FIELDS.filter(([k]) => !profile[k]).map(([, label]) => label);
  if (missing.length) {
    found.push(
      opportunity("Business profile", "Incomplete business profile", `Missing: ${missing.join(", ")}`, 0,
        "Not estimated until the profile is complete", "Complete the business profile")
    );
  }

  const openStatuses = ["new", "contacted", "qualified", "proposal", "negotiation"];
  const leads = allLeads();
  const stale = leads.filter(
    (l) => openStatuses.includes(l.status) && Date.now() - Date.parse(l.updatedAt) > 7 * 86400000
  ).length;
  if (stale > 0) {
    const aov = profile.avgOrderValueCents;
    found.push(
      opportunity("Follow-up", "Leads with no update in 7+ days", `${stale} open lead(s) untouched for over a week`,
        aov ? Math.round(stale * aov * ASSUMED_CONVERSION) : 0,
        aov
          ? `ESTIMATE: ${stale} x average order value x ${ASSUMED_CONVERSION * 100}% assumed conversion. Assumption, not measured.`
          : "Not estimated: set average order value in the business profile",
        "Work the stale leads in the CRM")
    );
  }

  const active = allCampaigns().filter((c) => c.status === "active").length;
  if (active === 0) {
    found.push(
      opportunity("Campaigns", "No active campaign", "0 campaigns are active", 0, "Not estimated",
        "Create a campaign and approve it")
    );
  }

  const won = leads.filter((l) => l.status === "closed-won").length;
  if (leads.length >= 10 && won / leads.length < 0.1) {
    found.push(
      opportunity("Conversion", "Low lead-to-customer conversion",
        `${won} of ${leads.length} leads closed (${Math.round((won / leads.length) * 100)}%)`, 0, "Not estimated",
        "Review the offer, follow-up speed and lead qualification")
    );
  }

  writeJson(AUDIT_FILE, { runAt: nowIso(), opportunities: found });
  return found;
}

function listOpportunities() {
  return readJson(AUDIT_FILE, { opportunities: [] }).opportunities;
}

/* ---------------------------------------------------------------- landing pages */

function listLandingPages() {
  return readJson(LANDING_FILE, { entries: [] }).entries;
}

function createLandingPage(input) {
  const parsed = LandingInputSchema.parse(input || {});
  if (!findCampaign(parsed.campaignId)) throw new Error("Campaign not found");
  const pages = listLandingPages();
  if (pages.some((p) => p.slug === parsed.slug)) throw new Error(`Slug "${parsed.slug}" is already used`);
  const claims = checkClaims(`${parsed.headline} ${parsed.body} ${parsed.offer}`);
  if (!claims.ok) throw new Error(`Unapproved claims: ${claims.flagged.join(", ")}`);
  const page = { id: crypto.randomUUID(), ...parsed, views: 0, createdAt: nowIso() };
  writeJson(LANDING_FILE, { entries: [...pages, page] });
  return page;
}

/** Returns the public view of a page, or null unless its campaign is active. */
function getPublicLanding(slug) {
  const page = listLandingPages().find((p) => p.slug === slug);
  if (!page) return null;
  const campaign = findCampaign(page.campaignId);
  if (!campaign || campaign.status !== "active") return null;
  const pages = listLandingPages().map((p) => (p.id === page.id ? { ...p, views: p.views + 1 } : p));
  writeJson(LANDING_FILE, { entries: pages });
  return {
    slug: page.slug,
    headline: page.headline,
    body: page.body,
    offer: page.offer,
    cta: page.cta,
    business: getProfile().name,
  };
}

function scoreCapturedLead({ phone, timeline }) {
  let score = 20; // valid email + consent + campaign
  if (phone) score += 20;
  const t = (timeline || "").toLowerCase();
  if (/now|today|asap|this week|urgent/.test(t)) score += 30;
  else if (/month/.test(t)) score += 15;
  else if (t) score += 5;
  return Math.min(100, score);
}

/**
 * Captures a lead from a landing page into the existing CRM.
 * Requires consent, dedupes by email, and replays the same result for a repeated idempotency key.
 */
function captureLead(slug, input, idempotencyKey) {
  const idem = readJson(IDEM_FILE, {});
  if (idempotencyKey && idem[idempotencyKey]) return { ...idem[idempotencyKey], replayed: true };

  const parsed = LeadCaptureSchema.parse(input || {});
  if (!parsed.consent) throw new Error("Consent is required to capture a lead");
  const page = listLandingPages().find((p) => p.slug === slug);
  const campaign = page && findCampaign(page.campaignId);
  if (!campaign || campaign.status !== "active") throw new Error("Page not found");

  const email = parsed.email.toLowerCase();
  const existing = allCustomers().find((c) => (c.email || "").toLowerCase() === email);
  const customer =
    existing ||
    unwrap(crm.createCustomer({
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      email,
      phone: parsed.phone || null,
      source: "campaign",
      sourceReference: campaign.id,
    }), "customer");
  const lead = unwrap(crm.createLead({
    customerId: customer.id,
    source: "campaign",
    score: scoreCapturedLead(parsed),
    notes: `Landing page ${slug}${parsed.timeline ? `; timeline: ${parsed.timeline}` : ""}; consent given ${nowIso()}`,
  }), "lead");

  const result = { customerId: customer.id, leadId: lead.id, duplicateContact: Boolean(existing) };
  if (idempotencyKey) writeJson(IDEM_FILE, { ...idem, [idempotencyKey]: result });
  return result;
}

module.exports = {
  ProfileInputSchema,
  LandingInputSchema,
  LeadCaptureSchema,
  getProfile,
  saveProfile,
  checkClaims,
  runGrowthAudit,
  listOpportunities,
  listLandingPages,
  createLandingPage,
  getPublicLanding,
  captureLead,
  ASSUMED_CONVERSION,
  BC_DIR,
};
