#!/usr/bin/env node
/**
 * Universal Creative Production Connector — Marketing Automation
 *
 * Marketing automation for Sales & Marketing Factory.
 * Provides email templates, drip campaigns, sequences, and trigger-based actions.
 *
 * Data model:
 *   - Email Templates: subject, body, variables, category
 *   - Automation Sequences: steps, triggers, timing, linked to campaigns
 *   - Sequence Executions: per-customer progress through a sequence
 *   - Triggers: events that start automation (lead created, deal stage changed, etc.)
 *
 * Rules:
 *   - Single source of truth (Zod schemas) — no duplicated schemas
 *   - All persistence through JSON repository files
 *   - Never auto-sends without explicit user approval
 *   - Render-only safety: no auto-email, no auto-contact
 *   - Depends on CRM for customer/lead data
 *   - Depends on Campaign Manager for campaign context
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const z = require("zod");

const AUTO_DIR = process.env.AUTO_DIR || path.join(os.tmpdir(), "sales-marketing", "automation");
const TEMPLATES_FILE = path.join(AUTO_DIR, "templates.json");
const SEQUENCES_FILE = path.join(AUTO_DIR, "sequences.json");
const EXECUTIONS_FILE = path.join(AUTO_DIR, "executions.json");
const TRIGGERS_FILE = path.join(AUTO_DIR, "triggers.json");

// Import CRM for customer data
const { listCustomers, getCustomer } = require("./crm.js");
// Import Campaign Manager for campaign context
const { getCampaign } = require("./campaign-manager.js");

/* ---------------------------------------------------------------- Zod schemas */

const EmailTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  category: z.enum(["welcome", "follow-up", "promotional", "transactional", "nurture"]),
  variables: z.array(z.string()).default([]), // e.g. ["firstName", "dealTitle"]
  createdBy: z.string().optional().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const TemplateInputSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  category: z.enum(["welcome", "follow-up", "promotional", "transactional", "nurture"]),
  variables: z.array(z.string()).optional(),
  createdBy: z.string().optional().nullable(),
});

const SequenceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  campaignId: z.string().optional().nullable(),
  trigger: z.string().min(1), // e.g. "lead-created", "deal-stage-changed", "manual"
  steps: z.array(z.object({
    id: z.string().min(1),
    type: z.enum(["email", "wait", "task", "condition"]),
    templateId: z.string().optional().nullable(),
    subject: z.string().optional().nullable(),
    body: z.string().optional().nullable(),
    waitDays: z.number().nonnegative().optional(),
    taskDescription: z.string().optional().nullable(),
    condition: z.string().optional().nullable(),
    offsetDays: z.number().nonnegative().default(0), // days after previous step
  })).default([]),
  isActive: z.boolean().default(true),
  createdBy: z.string().optional().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const SequenceInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  campaignId: z.string().optional().nullable(),
  trigger: z.string().min(1),
  steps: z.array(z.object({
    type: z.enum(["email", "wait", "task", "condition"]),
    templateId: z.string().optional().nullable(),
    subject: z.string().optional().nullable(),
    body: z.string().optional().nullable(),
    waitDays: z.number().nonnegative().optional(),
    taskDescription: z.string().optional().nullable(),
    condition: z.string().optional().nullable(),
    offsetDays: z.number().nonnegative().optional(),
  })).optional(),
  isActive: z.boolean().optional(),
  createdBy: z.string().optional().nullable(),
});

const ExecutionSchema = z.object({
  id: z.string().min(1),
  sequenceId: z.string().min(1),
  customerId: z.string().min(1),
  currentStep: z.number().nonnegative().default(0),
  status: z.enum(["active", "paused", "completed", "cancelled"]).default("active"),
  startedAt: z.string().datetime(),
  lastStepAt: z.string().datetime().optional().nullable(),
  completedAt: z.string().datetime().optional().nullable(),
  context: z.record(z.string(), z.unknown()).default({}),
});

const ExecutionInputSchema = z.object({
  sequenceId: z.string().min(1),
  customerId: z.string().min(1),
  context: z.record(z.string(), z.unknown()).optional(),
});

const TriggerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["lead-created", "deal-stage-changed", "deal-won", "customer-tagged", "manual"]),
  sequenceId: z.string().min(1),
  conditions: z.record(z.string(), z.unknown()).default({}),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
});

/* ---------------------------------------------------------------- repository helpers */

function ensureDir() {
  fs.mkdirSync(AUTO_DIR, { recursive: true });
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
  return `auto-${crypto.randomBytes(8).toString("hex")}`;
}

function nowISO() {
  return new Date().toISOString();
}

/* ---------------------------------------------------------------- Email Templates */

function createEmailTemplate(input) {
  const validatedResult = TemplateInputSchema.safeParse(input);
  if (!validatedResult.success) {
    return { ok: false, error: validatedResult.error.issues.map((e) => e.message).join(", ") };
  }
  const validated = validatedResult.data;

  const templates = readJson(TEMPLATES_FILE, { entries: [], nextId: 1 });
  const now = nowISO();
  const id = `template-${crypto.randomBytes(8).toString("hex")}`;

  const template = {
    id,
    name: validated.name,
    subject: validated.subject,
    body: validated.body,
    category: validated.category,
    variables: validated.variables ?? [],
    createdBy: validated.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };

  templates.entries.push(template);
  writeJson(TEMPLATES_FILE, templates);
  return { ok: true, template };
}

function listEmailTemplates(filter = {}) {
  const templates = readJson(TEMPLATES_FILE, { entries: [], nextId: 1 });
  let entries = templates.entries;

  if (filter.category) entries = entries.filter((t) => t.category === filter.category);

  entries.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return { ok: true, templates: entries, total: entries.length };
}

function renderTemplate(templateId, context = {}) {
  const templates = readJson(TEMPLATES_FILE, { entries: [], nextId: 1 });
  const template = templates.entries.find((t) => t.id === templateId);
  if (!template) return { ok: false, error: `Template not found: ${templateId}` };

  let subject = template.subject;
  let body = template.body;

  // Replace variables like {{firstName}}
  for (const [key, value] of Object.entries(context)) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    subject = subject.replace(regex, String(value ?? ""));
    body = body.replace(regex, String(value ?? ""));
  }

  return {
    ok: true,
    templateId,
    subject,
    body,
    variables: template.variables,
  };
}

/* ---------------------------------------------------------------- Automation Sequences */

function createSequence(input) {
  const validatedResult = SequenceInputSchema.safeParse(input);
  if (!validatedResult.success) {
    return { ok: false, error: validatedResult.error.issues.map((e) => e.message).join(", ") };
  }
  const validated = validatedResult.data;

  // Verify campaign exists if provided
  if (validated.campaignId) {
    const campaignResult = getCampaign(validated.campaignId);
    if (!campaignResult.ok) {
      return { ok: false, error: `Campaign not found: ${validated.campaignId}` };
    }
  }

  const sequences = readJson(SEQUENCES_FILE, { entries: [], nextId: 1 });
  const now = nowISO();
  const id = `sequence-${crypto.randomBytes(8).toString("hex")}`;

  const sequence = {
    id,
    name: validated.name,
    description: validated.description ?? null,
    campaignId: validated.campaignId ?? null,
    trigger: validated.trigger,
    steps: validated.steps ?? [],
    isActive: validated.isActive ?? true,
    createdBy: validated.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };

  sequences.entries.push(sequence);
  writeJson(SEQUENCES_FILE, sequences);
  return { ok: true, sequence };
}

function listSequences(filter = {}) {
  const sequences = readJson(SEQUENCES_FILE, { entries: [], nextId: 1 });
  let entries = sequences.entries;

  if (filter.trigger) entries = entries.filter((s) => s.trigger === filter.trigger);
  if (filter.campaignId) entries = entries.filter((s) => s.campaignId === filter.campaignId);
  if (filter.isActive !== undefined) entries = entries.filter((s) => s.isActive === filter.isActive);

  entries.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return { ok: true, sequences: entries, total: entries.length };
}

/* ---------------------------------------------------------------- Sequence Executions */

function startExecution(input) {
  const validatedResult = ExecutionInputSchema.safeParse(input);
  if (!validatedResult.success) {
    return { ok: false, error: validatedResult.error.issues.map((e) => e.message).join(", ") };
  }
  const validated = validatedResult.data;

  // Verify sequence exists
  const sequences = readJson(SEQUENCES_FILE, { entries: [], nextId: 1 });
  const sequence = sequences.entries.find((s) => s.id === validated.sequenceId);
  if (!sequence) {
    return { ok: false, error: `Sequence not found: ${validated.sequenceId}` };
  }

  // Verify customer exists
  const customerResult = getCustomer(validated.customerId);
  if (!customerResult.ok) {
    return { ok: false, error: `Customer not found: ${validated.customerId}` };
  }

  // Check if already active for this customer
  const executions = readJson(EXECUTIONS_FILE, { entries: [], nextId: 1 });
  const existing = executions.entries.find(
    (e) => e.sequenceId === validated.sequenceId && e.customerId === validated.customerId && e.status === "active"
  );
  if (existing) {
    return { ok: true, execution: existing };
  }

  const now = nowISO();
  const id = `exec-${crypto.randomBytes(8).toString("hex")}`;

  const execution = {
    id,
    sequenceId: validated.sequenceId,
    customerId: validated.customerId,
    currentStep: 0,
    status: "active",
    startedAt: now,
    lastStepAt: null,
    completedAt: null,
    context: validated.context ?? {},
  };

  executions.entries.push(execution);
  writeJson(EXECUTIONS_FILE, executions);
  return { ok: true, execution };
}

function listExecutions(filter = {}) {
  const executions = readJson(EXECUTIONS_FILE, { entries: [], nextId: 1 });
  let entries = executions.entries;

  if (filter.sequenceId) entries = entries.filter((e) => e.sequenceId === filter.sequenceId);
  if (filter.customerId) entries = entries.filter((e) => e.customerId === filter.customerId);
  if (filter.status) entries = entries.filter((e) => e.status === filter.status);

  entries.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  return { ok: true, executions: entries, total: entries.length };
}

function advanceExecution(executionId) {
  const executions = readJson(EXECUTIONS_FILE, { entries: [], nextId: 1 });
  const idx = executions.entries.findIndex((e) => e.id === executionId);
  if (idx === -1) return { ok: false, error: `Execution not found: ${executionId}` };

  const execution = executions.entries[idx];
  if (execution.status !== "active") {
    return { ok: false, error: `Execution is ${execution.status}, cannot advance` };
  }

  const sequences = readJson(SEQUENCES_FILE, { entries: [], nextId: 1 });
  const sequence = sequences.entries.find((s) => s.id === execution.sequenceId);
  if (!sequence) return { ok: false, error: `Sequence not found: ${execution.sequenceId}` };

  const nextStepIndex = execution.currentStep + 1;
  if (nextStepIndex >= sequence.steps.length) {
    execution.status = "completed";
    execution.completedAt = nowISO();
    writeJson(EXECUTIONS_FILE, executions);
    return { ok: true, execution, completed: true };
  }

  execution.currentStep = nextStepIndex;
  execution.lastStepAt = nowISO();
  writeJson(EXECUTIONS_FILE, executions);
  return { ok: true, execution, completed: false, nextStep: sequence.steps[nextStepIndex] };
}

/* ---------------------------------------------------------------- Triggers */

function createTrigger(input) {
  const validatedResult = z.object({
    name: z.string().min(1),
    type: z.enum(["lead-created", "deal-stage-changed", "deal-won", "customer-tagged", "manual"]),
    sequenceId: z.string().min(1),
    conditions: z.record(z.string(), z.unknown()).optional(),
    isActive: z.boolean().optional(),
  }).safeParse(input);

  if (!validatedResult.success) {
    return { ok: false, error: validatedResult.error.issues.map((e) => e.message).join(", ") };
  }
  const validated = validatedResult.data;

  // Verify sequence exists
  const sequences = readJson(SEQUENCES_FILE, { entries: [], nextId: 1 });
  if (!sequences.entries.find((s) => s.id === validated.sequenceId)) {
    return { ok: false, error: `Sequence not found: ${validated.sequenceId}` };
  }

  const triggers = readJson(TRIGGERS_FILE, { entries: [], nextId: 1 });
  const now = nowISO();
  const id = `trigger-${crypto.randomBytes(8).toString("hex")}`;

  const trigger = {
    id,
    name: validated.name,
    type: validated.type,
    sequenceId: validated.sequenceId,
    conditions: validated.conditions ?? {},
    isActive: validated.isActive ?? true,
    createdAt: now,
  };

  triggers.entries.push(trigger);
  writeJson(TRIGGERS_FILE, triggers);
  return { ok: true, trigger };
}

function listTriggers(filter = {}) {
  const triggers = readJson(TRIGGERS_FILE, { entries: [], nextId: 1 });
  let entries = triggers.entries;

  if (filter.type) entries = entries.filter((t) => t.type === filter.type);
  if (filter.sequenceId) entries = entries.filter((t) => t.sequenceId === filter.sequenceId);
  if (filter.isActive !== undefined) entries = entries.filter((t) => t.isActive === filter.isActive);

  return { ok: true, triggers: entries, total: entries.length };
}

/* ---------------------------------------------------------------- Stats */

function getAutomationStats() {
  const templates = readJson(TEMPLATES_FILE, { entries: [], nextId: 1 }).entries;
  const sequences = readJson(SEQUENCES_FILE, { entries: [], nextId: 1 }).entries;
  const executions = readJson(EXECUTIONS_FILE, { entries: [], nextId: 1 }).entries;
  const triggers = readJson(TRIGGERS_FILE, { entries: [], nextId: 1 }).entries;

  const executionByStatus = {};
  for (const e of executions) {
    executionByStatus[e.status] = (executionByStatus[e.status] || 0) + 1;
  }

  const sequenceByTrigger = {};
  for (const s of sequences) {
    sequenceByTrigger[s.trigger] = (sequenceByTrigger[s.trigger] || 0) + 1;
  }

  return {
    totalTemplates: templates.length,
    totalSequences: sequences.length,
    totalExecutions: executions.length,
    totalTriggers: triggers.length,
    activeSequences: sequences.filter((s) => s.isActive).length,
    activeExecutions: executionByStatus.active || 0,
    completedExecutions: executionByStatus.completed || 0,
    executionByStatus,
    sequenceByTrigger,
  };
}

module.exports = {
  // Schemas
  EmailTemplateSchema,
  TemplateInputSchema,
  SequenceSchema,
  SequenceInputSchema,
  ExecutionSchema,
  ExecutionInputSchema,
  TriggerSchema,
  // Templates
  createEmailTemplate,
  listEmailTemplates,
  renderTemplate,
  // Sequences
  createSequence,
  listSequences,
  // Executions
  startExecution,
  listExecutions,
  advanceExecution,
  // Triggers
  createTrigger,
  listTriggers,
  // Stats
  getAutomationStats,
  // Constants
  AUTO_DIR,
};
