#!/usr/bin/env node
/**
 * Universal Creative Production Connector — CRM Module
 *
 * Customer Relationship Management foundation for Sales & Marketing Factory.
 * Provides shared customer, lead, and contact data used by Campaign Manager,
 * Sales Pipeline, Revenue Tracker, Marketing Automation, and Analytics.
 *
 * Data model:
 *   - Customers: profiles, tags, status, lifetime value
 *   - Leads: source, score, status, conversion tracking
 *   - Contacts: email, phone, address, primary flag
 *
 * Rules:
 *   - Single source of truth (Zod schemas) — no duplicated schemas
 *   - All persistence through JSON repository files
 *   - No invented data — all customer info comes from user or inventory
 *   - Render-only safety: no auto-contact, no auto-email, no auto-sell
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { dataPath } = require("./data-dir.js");
const crypto = require("crypto");
const z = require("zod");

const CRM_DIR = process.env.CRM_DIR || dataPath("sales-marketing", "crm");
const CUSTOMERS_FILE = path.join(CRM_DIR, "customers.json");
const LEADS_FILE = path.join(CRM_DIR, "leads.json");
const CONTACTS_FILE = path.join(CRM_DIR, "contacts.json");

/* ---------------------------------------------------------------- Zod schemas */

const CustomerSchema = z.object({
  id: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  status: z.enum(["lead", "prospect", "customer", "inactive"]).default("lead"),
  tags: z.array(z.string()).default([]),
  lifetimeValue: z.number().nonnegative().default(0),
  source: z.string().optional().nullable(), // inventory, manual, import, campaign
  sourceReference: z.string().optional().nullable(), // SKU, campaign id, etc.
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const LeadSchema = z.object({
  id: z.string().min(1),
  customerId: z.string().min(1),
  source: z.enum(["inventory", "manual", "import", "campaign", "referral"]),
  status: z.enum(["new", "contacted", "qualified", "proposal", "negotiation", "closed-won", "closed-lost"]).default("new"),
  score: z.number().min(0).max(100).default(0),
  notes: z.string().optional().nullable(),
  expectedValue: z.number().nonnegative().optional().nullable(),
  convertedAt: z.string().datetime().optional().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const ContactSchema = z.object({
  id: z.string().min(1),
  customerId: z.string().min(1),
  type: z.enum(["email", "phone", "address", "social"]),
  value: z.string().min(1),
  isPrimary: z.boolean().default(false),
  label: z.string().optional().nullable(), // work, home, mobile, etc.
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const CustomerInputSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  status: z.enum(["lead", "prospect", "customer", "inactive"]).optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional().nullable(),
  sourceReference: z.string().optional().nullable(),
});

const LeadInputSchema = z.object({
  customerId: z.string().min(1),
  source: z.enum(["inventory", "manual", "import", "campaign", "referral"]),
  status: z.enum(["new", "contacted", "qualified", "proposal", "negotiation", "closed-won", "closed-lost"]).optional(),
  score: z.number().min(0).max(100).optional(),
  notes: z.string().optional().nullable(),
  expectedValue: z.number().nonnegative().optional().nullable(),
});

const ContactInputSchema = z.object({
  customerId: z.string().min(1),
  type: z.enum(["email", "phone", "address", "social"]),
  value: z.string().min(1),
  isPrimary: z.boolean().optional(),
  label: z.string().optional().nullable(),
});

/* ---------------------------------------------------------------- repository helpers */

function ensureDir() {
  fs.mkdirSync(CRM_DIR, { recursive: true });
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
  return `crm-${crypto.randomBytes(8).toString("hex")}`;
}

function nowISO() {
  return new Date().toISOString();
}

/* ---------------------------------------------------------------- Customers */

function createCustomer(input) {
  const validated = CustomerInputSchema.parse(input);
  const customers = readJson(CUSTOMERS_FILE, { entries: [], nextId: 1 });
  const now = nowISO();
  const id = `customer-${crypto.randomBytes(8).toString("hex")}`;

  const customer = {
    id,
    firstName: validated.firstName,
    lastName: validated.lastName,
    email: validated.email ?? null,
    phone: validated.phone ?? null,
    company: validated.company ?? null,
    status: validated.status ?? "lead",
    tags: validated.tags ?? [],
    lifetimeValue: 0,
    source: validated.source ?? null,
    sourceReference: validated.sourceReference ?? null,
    createdAt: now,
    updatedAt: now,
  };

  customers.entries.push(customer);
  writeJson(CUSTOMERS_FILE, customers);
  return { ok: true, customer };
}

function getCustomer(customerId) {
  const customers = readJson(CUSTOMERS_FILE, { entries: [], nextId: 1 });
  const customer = customers.entries.find((c) => c.id === customerId);
  if (!customer) return { ok: false, error: `Customer not found: ${customerId}` };
  return { ok: true, customer };
}

function listCustomers(filter = {}) {
  const customers = readJson(CUSTOMERS_FILE, { entries: [], nextId: 1 });
  let entries = customers.entries;

  if (filter.status) entries = entries.filter((c) => c.status === filter.status);
  if (filter.source) entries = entries.filter((c) => c.source === filter.source);
  if (filter.tag) entries = entries.filter((c) => (c.tags || []).includes(filter.tag));
  if (filter.search) {
    const s = filter.search.toLowerCase();
    entries = entries.filter(
      (c) =>
        c.firstName.toLowerCase().includes(s) ||
        c.lastName.toLowerCase().includes(s) ||
        (c.email || "").toLowerCase().includes(s) ||
        (c.company || "").toLowerCase().includes(s)
    );
  }

  entries.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return { ok: true, customers: entries, total: entries.length };
}

function updateCustomer(customerId, updates) {
  const customers = readJson(CUSTOMERS_FILE, { entries: [], nextId: 1 });
  const idx = customers.entries.findIndex((c) => c.id === customerId);
  if (idx === -1) return { ok: false, error: `Customer not found: ${customerId}` };

  const validated = CustomerInputSchema.partial().parse(updates);
  customers.entries[idx] = {
    ...customers.entries[idx],
    ...validated,
    updatedAt: nowISO(),
  };
  writeJson(CUSTOMERS_FILE, customers);
  return { ok: true, customer: customers.entries[idx] };
}

function deleteCustomer(customerId, authorizedBy) {
  if (!authorizedBy) {
    return { ok: false, error: "Authorization required for customer deletion" };
  }
  const customers = readJson(CUSTOMERS_FILE, { entries: [], nextId: 1 });
  const idx = customers.entries.findIndex((c) => c.id === customerId);
  if (idx === -1) return { ok: false, error: `Customer not found: ${customerId}` };

  // Soft delete — preserve data for audit
  customers.entries[idx].deleted = true;
  customers.entries[idx].deletedBy = authorizedBy;
  customers.entries[idx].deletedAt = nowISO();
  customers.entries[idx].status = "inactive";
  writeJson(CUSTOMERS_FILE, customers);
  return { ok: true, customer: customers.entries[idx] };
}

/* ---------------------------------------------------------------- Leads */

function createLead(input) {
  const validated = LeadInputSchema.parse(input);
  const leads = readJson(LEADS_FILE, { entries: [], nextId: 1 });
  const customers = readJson(CUSTOMERS_FILE, { entries: [], nextId: 1 });

  // Verify customer exists
  if (!customers.entries.find((c) => c.id === validated.customerId)) {
    return { ok: false, error: `Customer not found: ${validated.customerId}` };
  }

  const now = nowISO();
  const id = `lead-${crypto.randomBytes(8).toString("hex")}`;

  const lead = {
    id,
    customerId: validated.customerId,
    source: validated.source,
    status: validated.status ?? "new",
    score: validated.score ?? 0,
    notes: validated.notes ?? null,
    expectedValue: validated.expectedValue ?? null,
    convertedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  leads.entries.push(lead);
  writeJson(LEADS_FILE, leads);
  return { ok: true, lead };
}

function getLead(leadId) {
  const leads = readJson(LEADS_FILE, { entries: [], nextId: 1 });
  const lead = leads.entries.find((l) => l.id === leadId);
  if (!lead) return { ok: false, error: `Lead not found: ${leadId}` };
  return { ok: true, lead };
}

function listLeads(filter = {}) {
  const leads = readJson(LEADS_FILE, { entries: [], nextId: 1 });
  let entries = leads.entries;

  if (filter.status) entries = entries.filter((l) => l.status === filter.status);
  if (filter.source) entries = entries.filter((l) => l.source === filter.source);
  if (filter.customerId) entries = entries.filter((l) => l.customerId === filter.customerId);
  if (filter.minScore !== undefined) {
    entries = entries.filter((l) => (l.score || 0) >= filter.minScore);
  }

  entries.sort((a, b) => (b.score || 0) - (a.score || 0));
  return { ok: true, leads: entries, total: entries.length };
}

function updateLead(leadId, updates) {
  const leads = readJson(LEADS_FILE, { entries: [], nextId: 1 });
  const idx = leads.entries.findIndex((l) => l.id === leadId);
  if (idx === -1) return { ok: false, error: `Lead not found: ${leadId}` };

  const validated = LeadInputSchema.partial().parse(updates);
  leads.entries[idx] = {
    ...leads.entries[idx],
    ...validated,
    updatedAt: nowISO(),
  };
  // If converted to closed-won, set convertedAt
  if (validated.status === "closed-won" && !leads.entries[idx].convertedAt) {
    leads.entries[idx].convertedAt = nowISO();
  }
  writeJson(LEADS_FILE, leads);
  return { ok: true, lead: leads.entries[idx] };
}

function scoreLead(leadId, score, reason) {
  if (score < 0 || score > 100) {
    return { ok: false, error: "Lead score must be between 0 and 100" };
  }
  const leads = readJson(LEADS_FILE, { entries: [], nextId: 1 });
  const idx = leads.entries.findIndex((l) => l.id === leadId);
  if (idx === -1) return { ok: false, error: `Lead not found: ${leadId}` };

  leads.entries[idx].score = score;
  leads.entries[idx].updatedAt = nowISO();
  if (reason) {
    leads.entries[idx].notes = (leads.entries[idx].notes || "") + ` | Scored ${score}: ${reason}`;
  }
  writeJson(LEADS_FILE, leads);
  return { ok: true, lead: leads.entries[idx] };
}

/* ---------------------------------------------------------------- Contacts */

function createContact(input) {
  const validated = ContactInputSchema.parse(input);
  const contacts = readJson(CONTACTS_FILE, { entries: [], nextId: 1 });
  const customers = readJson(CUSTOMERS_FILE, { entries: [], nextId: 1 });

  if (!customers.entries.find((c) => c.id === validated.customerId)) {
    return { ok: false, error: `Customer not found: ${validated.customerId}` };
  }

  const now = nowISO();
  const id = `contact-${crypto.randomBytes(8).toString("hex")}`;

  const contact = {
    id,
    customerId: validated.customerId,
    type: validated.type,
    value: validated.value,
    isPrimary: validated.isPrimary ?? false,
    label: validated.label ?? null,
    createdAt: now,
    updatedAt: now,
  };

  // If primary, unset other primary contacts of same type
  if (contact.isPrimary) {
    contacts.entries = contacts.entries.map((c) =>
      c.customerId === contact.customerId && c.type === contact.type
        ? { ...c, isPrimary: false }
        : c
    );
  }

  contacts.entries.push(contact);
  writeJson(CONTACTS_FILE, contacts);
  return { ok: true, contact };
}

function listContacts(filter = {}) {
  const contacts = readJson(CONTACTS_FILE, { entries: [], nextId: 1 });
  let entries = contacts.entries;

  if (filter.customerId) entries = entries.filter((c) => c.customerId === filter.customerId);
  if (filter.type) entries = entries.filter((c) => c.type === filter.type);
  if (filter.isPrimary !== undefined) {
    entries = entries.filter((c) => c.isPrimary === filter.isPrimary);
  }

  return { ok: true, contacts: entries, total: entries.length };
}

/* ---------------------------------------------------------------- Customer with contacts/leads */

function getCustomerWithDetails(customerId) {
  const customerResult = getCustomer(customerId);
  if (!customerResult.ok) return customerResult;

  const contactsResult = listContacts({ customerId });
  const leadsResult = listLeads({ customerId });

  return {
    ok: true,
    customer: customerResult.customer,
    contacts: contactsResult.ok ? contactsResult.contacts : [],
    leads: leadsResult.ok ? leadsResult.leads : [],
  };
}

/* ---------------------------------------------------------------- Customer segmentation */

function segmentCustomers(filter = {}) {
  const { customers } = listCustomers();
  const segments = {};

  // By status
  segments.byStatus = {};
  for (const c of customers) {
    segments.byStatus[c.status] = (segments.byStatus[c.status] || 0) + 1;
  }

  // By source
  segments.bySource = {};
  for (const c of customers) {
    segments.bySource[c.source || "unknown"] = (segments.bySource[c.source || "unknown"] || 0) + 1;
  }

  // By tag
  segments.byTag = {};
  for (const c of customers) {
    for (const tag of c.tags || []) {
      segments.byTag[tag] = (segments.byTag[tag] || 0) + 1;
    }
  }

  // High value customers (lifetimeValue > 0)
  segments.highValue = customers.filter((c) => (c.lifetimeValue || 0) > 0);

  // Recent customers (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  segments.recent = customers.filter((c) => c.createdAt >= thirtyDaysAgo);

  return { ok: true, segments, total: customers.length };
}

/* ---------------------------------------------------------------- Stats */

function getCrmStats() {
  const customers = readJson(CUSTOMERS_FILE, { entries: [], nextId: 1 }).entries;
  const leads = readJson(LEADS_FILE, { entries: [], nextId: 1 }).entries;
  const contacts = readJson(CONTACTS_FILE, { entries: [], nextId: 1 }).entries;

  const byStatus = {};
  for (const c of customers) byStatus[c.status] = (byStatus[c.status] || 0) + 1;

  const leadByStatus = {};
  for (const l of leads) leadByStatus[l.status] = (leadByStatus[l.status] || 0) + 1;

  const convertedLeads = leads.filter((l) => l.status === "closed-won").length;
  const conversionRate = leads.length > 0 ? Math.round((convertedLeads / leads.length) * 100) : 0;

  return {
    totalCustomers: customers.length,
    totalLeads: leads.length,
    totalContacts: contacts.length,
    customersByStatus: byStatus,
    leadsByStatus: leadByStatus,
    convertedLeads,
    conversionRate,
    totalLifetimeValue: customers.reduce((sum, c) => sum + (c.lifetimeValue || 0), 0),
  };
}

module.exports = {
  // Schemas
  CustomerSchema,
  LeadSchema,
  ContactSchema,
  CustomerInputSchema,
  LeadInputSchema,
  ContactInputSchema,
  // Customers
  createCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
  deleteCustomer,
  getCustomerWithDetails,
  // Leads
  createLead,
  getLead,
  listLeads,
  updateLead,
  scoreLead,
  // Contacts
  createContact,
  listContacts,
  // Segmentation
  segmentCustomers,
  // Stats
  getCrmStats,
  // Constants
  CRM_DIR,
};
