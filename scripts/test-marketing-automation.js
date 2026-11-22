#!/usr/bin/env node
/**
 * Marketing Automation Tests — M13 Sales & Marketing Factory
 */

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Use temp dir for automation tests
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "automation-test-"));
process.env.AUTO_DIR = tmpDir;
process.env.CRM_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "crm-auto-test-"));
process.env.CAMPAIGN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "campaign-auto-test-"));

// Clear require cache
delete require.cache[require.resolve("../lib/universal-creative/marketing-automation.js")];
delete require.cache[require.resolve("../lib/universal-creative/crm.js")];
delete require.cache[require.resolve("../lib/universal-creative/campaign-manager.js")];

const {
  createEmailTemplate,
  listEmailTemplates,
  renderTemplate,
  createSequence,
  listSequences,
  startExecution,
  listExecutions,
  advanceExecution,
  createTrigger,
  listTriggers,
  getAutomationStats,
  EmailTemplateSchema,
  TemplateInputSchema,
  SequenceSchema,
} = require("../lib/universal-creative/marketing-automation.js");

// Dependencies
const { createCustomer } = require("../lib/universal-creative/crm.js");
const { createCampaign } = require("../lib/universal-creative/campaign-manager.js");

test("TemplateInputSchema validates valid template", () => {
  const result = TemplateInputSchema.parse({
    name: "Welcome Email",
    subject: "Welcome {{firstName}}!",
    body: "Hi {{firstName}}, thanks for joining us.",
    category: "welcome",
    variables: ["firstName"],
  });
  assert.equal(result.name, "Welcome Email");
  assert.equal(result.subject, "Welcome {{firstName}}!");
  assert.deepEqual(result.variables, ["firstName"]);
});

test("TemplateInputSchema rejects missing subject", () => {
  assert.throws(() => {
    TemplateInputSchema.parse({ name: "Test", body: "body", category: "welcome" });
  });
});

test("createEmailTemplate creates a template", () => {
  const result = createEmailTemplate({
    name: "Follow Up",
    subject: "Following up on {{dealTitle}}",
    body: "Hi {{firstName}}, I wanted to follow up on {{dealTitle}}.",
    category: "follow-up",
    variables: ["firstName", "dealTitle"],
    createdBy: "marketing-team",
  });
  assert.ok(result.ok);
  assert.ok(result.template.id);
  assert.equal(result.template.name, "Follow Up");
  assert.equal(result.template.category, "follow-up");
  assert.deepEqual(result.template.variables, ["firstName", "dealTitle"]);
  assert.ok(result.template.createdAt);
  assert.ok(result.template.updatedAt);
});

test("listEmailTemplates returns all templates", () => {
  createEmailTemplate({ name: "T1", subject: "S1", body: "B1", category: "welcome" });
  createEmailTemplate({ name: "T2", subject: "S2", body: "B2", category: "nurture" });
  const result = listEmailTemplates();
  assert.ok(result.ok);
  assert.ok(result.total >= 2);
  assert.ok(Array.isArray(result.templates));
});

test("listEmailTemplates filters by category", () => {
  const result = listEmailTemplates({ category: "welcome" });
  assert.ok(result.ok);
  for (const t of result.templates) {
    assert.equal(t.category, "welcome");
  }
});

test("renderTemplate replaces variables", () => {
  const template = createEmailTemplate({
    name: "Render Test",
    subject: "Hello {{firstName}}",
    body: "Dear {{firstName}}, your deal {{dealTitle}} is ready.",
    category: "nurture",
    variables: ["firstName", "dealTitle"],
  });
  const result = renderTemplate(template.template.id, {
    firstName: "John",
    dealTitle: "Summer Commercial",
  });
  assert.ok(result.ok);
  assert.equal(result.subject, "Hello John");
  assert.equal(result.body, "Dear John, your deal Summer Commercial is ready.");
});

test("renderTemplate rejects missing template", () => {
  const result = renderTemplate("nonexistent-template", {});
  assert.ok(!result.ok);
  assert.equal(result.error, "Template not found: nonexistent-template");
});

test("createSequence creates a sequence", () => {
  const campaign = createCampaign({ name: "Seq Campaign", type: "lead-gen" });

  const result = createSequence({
    name: "Lead Nurture Sequence",
    description: "Nurture new leads over 2 weeks",
    campaignId: campaign.campaign.id,
    trigger: "lead-created",
    steps: [
      { type: "email", templateId: null, subject: "Welcome", body: "Welcome!", offsetDays: 0 },
      { type: "wait", waitDays: 3 },
      { type: "email", templateId: null, subject: "Follow up", body: "Just checking in", offsetDays: 3 },
      { type: "task", taskDescription: "Call customer", offsetDays: 7 },
    ],
    createdBy: "marketing-team",
  });
  assert.ok(result.ok);
  assert.ok(result.sequence.id);
  assert.equal(result.sequence.name, "Lead Nurture Sequence");
  assert.equal(result.sequence.trigger, "lead-created");
  assert.equal(result.sequence.campaignId, campaign.campaign.id);
  assert.equal(result.sequence.steps.length, 4);
  assert.equal(result.sequence.isActive, true);
});

test("createSequence rejects missing campaign", () => {
  const result = createSequence({
    name: "Bad Sequence",
    trigger: "manual",
    campaignId: "nonexistent-campaign",
  });
  assert.ok(!result.ok);
  assert.equal(result.error, "Campaign not found: nonexistent-campaign");
});

test("listSequences returns all sequences", () => {
  createSequence({ name: "Seq A", trigger: "manual" });
  createSequence({ name: "Seq B", trigger: "lead-created" });
  const result = listSequences();
  assert.ok(result.ok);
  assert.ok(result.total >= 2);
  assert.ok(Array.isArray(result.sequences));
});

test("listSequences filters by trigger", () => {
  const result = listSequences({ trigger: "lead-created" });
  assert.ok(result.ok);
  for (const s of result.sequences) {
    assert.equal(s.trigger, "lead-created");
  }
});

test("startExecution starts a sequence for a customer", () => {
  const customer = createCustomer({ firstName: "Exec", lastName: "Test", email: "exec@example.com" });
  const sequence = createSequence({ name: "Exec Seq", trigger: "manual" });

  const result = startExecution({
    sequenceId: sequence.sequence.id,
    customerId: customer.customer.id,
    context: { source: "manual" },
  });
  assert.ok(result.ok);
  assert.equal(result.execution.sequenceId, sequence.sequence.id);
  assert.equal(result.execution.customerId, customer.customer.id);
  assert.equal(result.execution.status, "active");
  assert.equal(result.execution.currentStep, 0);
  assert.ok(result.execution.startedAt);
});

test("startExecution rejects missing sequence", () => {
  const result = startExecution({ sequenceId: "nonexistent-seq", customerId: "cust-1" });
  assert.ok(!result.ok);
  assert.equal(result.error, "Sequence not found: nonexistent-seq");
});

test("startExecution rejects missing customer", () => {
  const sequence = createSequence({ name: "No Customer Seq", trigger: "manual" });
  const result = startExecution({ sequenceId: sequence.sequence.id, customerId: "nonexistent-cust" });
  assert.ok(!result.ok);
  assert.equal(result.error, "Customer not found: nonexistent-cust");
});

test("listExecutions returns executions", () => {
  const customer = createCustomer({ firstName: "List", lastName: "Exec", email: "listexec@example.com" });
  const sequence = createSequence({ name: "List Seq", trigger: "manual" });
  startExecution({ sequenceId: sequence.sequence.id, customerId: customer.customer.id });

  const result = listExecutions();
  assert.ok(result.ok);
  assert.ok(result.total >= 1);
  assert.ok(Array.isArray(result.executions));
});

test("advanceExecution moves to next step", () => {
  const customer = createCustomer({ firstName: "Adv", lastName: "Exec", email: "advexec@example.com" });
  const sequence = createSequence({
    name: "Advance Seq",
    trigger: "manual",
    steps: [
      { type: "email", subject: "Step 1", body: "First email", offsetDays: 0 },
      { type: "email", subject: "Step 2", body: "Second email", offsetDays: 3 },
    ],
  });

  const exec = startExecution({ sequenceId: sequence.sequence.id, customerId: customer.customer.id });
  assert.equal(exec.execution.currentStep, 0);

  const advanced = advanceExecution(exec.execution.id);
  assert.ok(advanced.ok);
  assert.equal(advanced.execution.currentStep, 1);
  assert.ok(advanced.execution.lastStepAt);
  assert.equal(advanced.completed, false);
  assert.ok(advanced.nextStep);
  assert.equal(advanced.nextStep.subject, "Step 2");
});

test("advanceExecution completes sequence when no more steps", () => {
  const customer = createCustomer({ firstName: "Complete", lastName: "Exec", email: "completeexec@example.com" });
  const sequence = createSequence({
    name: "Single Step Seq",
    trigger: "manual",
    steps: [{ type: "email", subject: "Only", body: "Just one", offsetDays: 0 }],
  });

  const exec = startExecution({ sequenceId: sequence.sequence.id, customerId: customer.customer.id });
  const advanced = advanceExecution(exec.execution.id);
  assert.ok(advanced.ok);
  assert.equal(advanced.completed, true);
  assert.equal(advanced.execution.status, "completed");
});

test("createTrigger creates a trigger", () => {
  const sequence = createSequence({ name: "Trigger Seq", trigger: "manual" });

  const result = createTrigger({
    name: "New Lead Trigger",
    type: "lead-created",
    sequenceId: sequence.sequence.id,
    conditions: { source: "website" },
  });
  assert.ok(result.ok);
  assert.equal(result.trigger.name, "New Lead Trigger");
  assert.equal(result.trigger.type, "lead-created");
  assert.equal(result.trigger.sequenceId, sequence.sequence.id);
  assert.deepEqual(result.trigger.conditions, { source: "website" });
  assert.equal(result.trigger.isActive, true);
});

test("listTriggers returns all triggers", () => {
  const sequence = createSequence({ name: "Triggers Seq", trigger: "manual" });
  createTrigger({ name: "T1", type: "lead-created", sequenceId: sequence.sequence.id });
  createTrigger({ name: "T2", type: "deal-won", sequenceId: sequence.sequence.id });
  const result = listTriggers();
  assert.ok(result.ok);
  assert.ok(result.total >= 2);
  assert.ok(Array.isArray(result.triggers));
});

test("listTriggers filters by type", () => {
  const result = listTriggers({ type: "deal-won" });
  assert.ok(result.ok);
  for (const t of result.triggers) {
    assert.equal(t.type, "deal-won");
  }
});

test("getAutomationStats returns stats", () => {
  createEmailTemplate({ name: "Stats T", subject: "S", body: "B", category: "welcome" });
  const customer = createCustomer({ firstName: "Stats", lastName: "Auto", email: "statsauto@example.com" });
  const sequence = createSequence({ name: "Stats Seq", trigger: "manual" });
  startExecution({ sequenceId: sequence.sequence.id, customerId: customer.customer.id });
  createTrigger({ name: "Stats Trigger", type: "lead-created", sequenceId: sequence.sequence.id });

  const result = getAutomationStats();
  assert.ok(typeof result.totalTemplates === "number");
  assert.ok(typeof result.totalSequences === "number");
  assert.ok(typeof result.totalExecutions === "number");
  assert.ok(typeof result.totalTriggers === "number");
  assert.ok(result.executionByStatus);
  assert.ok(result.sequenceByTrigger);
});

test("EmailTemplateSchema validates valid template", () => {
  const result = EmailTemplateSchema.parse({
    id: "template-1",
    name: "Test Template",
    subject: "Hello {{name}}",
    body: "Body",
    category: "welcome",
    variables: ["name"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(result.name, "Test Template");
  assert.equal(result.category, "welcome");
});
