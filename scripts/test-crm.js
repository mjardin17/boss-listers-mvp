#!/usr/bin/env node
/**
 * CRM Module Tests — M13 Sales & Marketing Factory
 */

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Use temp dir for CRM tests
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-test-"));
process.env.CRM_DIR = tmpDir;

// Clear require cache so fresh module loads
delete require.cache[require.resolve("../lib/universal-creative/crm.js")];

const {
  createCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
  deleteCustomer,
  getCustomerWithDetails,
  createLead,
  getLead,
  listLeads,
  updateLead,
  scoreLead,
  createContact,
  listContacts,
  segmentCustomers,
  getCrmStats,
  CustomerSchema,
  LeadSchema,
  ContactSchema,
  CustomerInputSchema,
  LeadInputSchema,
  ContactInputSchema,
} = require("../lib/universal-creative/crm.js");

test("CustomerInputSchema validates valid input", () => {
  const result = CustomerInputSchema.parse({
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
    phone: "555-1234",
  });
  assert.equal(result.firstName, "John");
  assert.equal(result.lastName, "Doe");
  assert.equal(result.email, "john@example.com");
});

test("CustomerInputSchema rejects invalid email", () => {
  assert.throws(() => {
    CustomerInputSchema.parse({ firstName: "John", lastName: "Doe", email: "not-email" });
  });
});

test("createCustomer creates a customer", () => {
  const result = createCustomer({
    firstName: "Jane",
    lastName: "Smith",
    email: "jane@example.com",
    phone: "555-5678",
    status: "prospect",
    tags: ["vip", "local"],
    source: "manual",
  });
  assert.ok(result.ok);
  assert.ok(result.customer.id);
  assert.equal(result.customer.firstName, "Jane");
  assert.equal(result.customer.lastName, "Smith");
  assert.equal(result.customer.status, "prospect");
  assert.deepEqual(result.customer.tags, ["vip", "local"]);
  assert.equal(result.customer.lifetimeValue, 0);
  assert.ok(result.customer.createdAt);
  assert.ok(result.customer.updatedAt);
});

test("getCustomer retrieves a customer", () => {
  const created = createCustomer({
    firstName: "Bob",
    lastName: "Wilson",
    email: "bob@example.com",
  });
  const result = getCustomer(created.customer.id);
  assert.ok(result.ok);
  assert.equal(result.customer.firstName, "Bob");
  assert.equal(result.customer.email, "bob@example.com");
});

test("getCustomer returns error for missing customer", () => {
  const result = getCustomer("nonexistent-id");
  assert.ok(!result.ok);
  assert.equal(result.error, "Customer not found: nonexistent-id");
});

test("listCustomers returns all customers", () => {
  createCustomer({ firstName: "Alice", lastName: "Brown", email: "alice@example.com", status: "customer" });
  createCustomer({ firstName: "Charlie", lastName: "Davis", email: "charlie@example.com", status: "lead" });
  const result = listCustomers();
  assert.ok(result.ok);
  assert.ok(result.total >= 2);
  assert.ok(Array.isArray(result.customers));
});

test("listCustomers filters by status", () => {
  const result = listCustomers({ status: "customer" });
  assert.ok(result.ok);
  for (const c of result.customers) {
    assert.equal(c.status, "customer");
  }
});

test("updateCustomer updates fields", () => {
  const created = createCustomer({ firstName: "Original", lastName: "Name", email: "orig@example.com" });
  const result = updateCustomer(created.customer.id, { firstName: "Updated", status: "customer" });
  assert.ok(result.ok);
  assert.equal(result.customer.firstName, "Updated");
  assert.equal(result.customer.status, "customer");
  assert.notEqual(result.customer.updatedAt, created.customer.updatedAt);
});

test("deleteCustomer requires authorization", () => {
  const created = createCustomer({ firstName: "Temp", lastName: "User", email: "temp@example.com" });
  const result = deleteCustomer(created.customer.id);
  assert.ok(!result.ok);
  assert.equal(result.error, "Authorization required for customer deletion");
});

test("deleteCustomer soft-deletes with authorization", () => {
  const created = createCustomer({ firstName: "Temp", lastName: "User", email: "temp2@example.com" });
  const result = deleteCustomer(created.customer.id, "admin-user");
  assert.ok(result.ok);
  assert.equal(result.customer.deleted, true);
  assert.equal(result.customer.deletedBy, "admin-user");
  assert.equal(result.customer.status, "inactive");
});

test("createLead creates a lead", () => {
  const customer = createCustomer({ firstName: "Lead", lastName: "Test", email: "lead@example.com" });
  const result = createLead({
    customerId: customer.customer.id,
    source: "manual",
    score: 75,
    notes: "Interested in commercial video",
    expectedValue: 5000,
  });
  assert.ok(result.ok);
  assert.equal(result.lead.customerId, customer.customer.id);
  assert.equal(result.lead.source, "manual");
  assert.equal(result.lead.score, 75);
  assert.equal(result.lead.status, "new");
  assert.equal(result.lead.expectedValue, 5000);
});

test("createLead rejects missing customer", () => {
  const result = createLead({
    customerId: "nonexistent-customer",
    source: "manual",
  });
  assert.ok(!result.ok);
  assert.equal(result.error, "Customer not found: nonexistent-customer");
});

test("listLeads returns leads", () => {
  const customer = createCustomer({ firstName: "Lead", lastName: "List", email: "leads@example.com" });
  createLead({ customerId: customer.customer.id, source: "inventory", score: 50 });
  createLead({ customerId: customer.customer.id, source: "campaign", score: 90 });
  const result = listLeads();
  assert.ok(result.ok);
  assert.ok(result.total >= 2);
  assert.ok(result.leads[0].score >= result.leads[1].score);
});

test("scoreLead updates score", () => {
  const customer = createCustomer({ firstName: "Score", lastName: "Test", email: "score@example.com" });
  const lead = createLead({ customerId: customer.customer.id, source: "manual", score: 30 });
  const result = scoreLead(lead.lead.id, 85, "High engagement");
  assert.ok(result.ok);
  assert.equal(result.lead.score, 85);
  assert.ok(result.lead.notes.includes("High engagement"));
});

test("scoreLead rejects out of range", () => {
  const customer = createCustomer({ firstName: "Score", lastName: "Bad", email: "scorebad@example.com" });
  const lead = createLead({ customerId: customer.customer.id, source: "manual", score: 30 });
  const result = scoreLead(lead.lead.id, 150);
  assert.ok(!result.ok);
  assert.equal(result.error, "Lead score must be between 0 and 100");
});

test("createContact creates a contact", () => {
  const customer = createCustomer({ firstName: "Contact", lastName: "Test", email: "contact@example.com" });
  const result = createContact({
    customerId: customer.customer.id,
    type: "email",
    value: "contact@example.com",
    isPrimary: true,
    label: "work",
  });
  assert.ok(result.ok);
  assert.equal(result.contact.customerId, customer.customer.id);
  assert.equal(result.contact.type, "email");
  assert.equal(result.contact.value, "contact@example.com");
  assert.equal(result.contact.isPrimary, true);
});

test("listContacts filters by customer", () => {
  const customer = createCustomer({ firstName: "Contact", lastName: "Filter", email: "contactfilter@example.com" });
  createContact({ customerId: customer.customer.id, type: "email", value: "a@b.com", isPrimary: true });
  createContact({ customerId: customer.customer.id, type: "phone", value: "555-0000" });
  const result = listContacts({ customerId: customer.customer.id });
  assert.ok(result.ok);
  assert.ok(result.total >= 2);
});

test("getCustomerWithDetails returns customer + contacts + leads", () => {
  const customer = createCustomer({ firstName: "Detail", lastName: "Test", email: "detail@example.com", tags: ["vip"] });
  createLead({ customerId: customer.customer.id, source: "manual", score: 60 });
  createContact({ customerId: customer.customer.id, type: "email", value: "detail@example.com", isPrimary: true });

  const result = getCustomerWithDetails(customer.customer.id);
  assert.ok(result.ok);
  assert.equal(result.customer.firstName, "Detail");
  assert.ok(Array.isArray(result.contacts));
  assert.ok(result.contacts.length >= 1);
  assert.ok(Array.isArray(result.leads));
  assert.ok(result.leads.length >= 1);
});

test("segmentCustomers returns segments", () => {
  createCustomer({ firstName: "Seg", lastName: "A", email: "seg-a@example.com", status: "customer", tags: ["vip"], lifetimeValue: 1000 });
  createCustomer({ firstName: "Seg", lastName: "B", email: "seg-b@example.com", status: "lead", tags: ["local"] });
  const result = segmentCustomers();
  assert.ok(result.ok);
  assert.ok(result.segments.byStatus);
  assert.ok(result.segments.bySource);
  assert.ok(result.segments.byTag);
  assert.ok(result.segments.highValue);
  assert.ok(result.segments.recent);
  assert.ok(result.total >= 2);
});

test("getCrmStats returns stats", () => {
  createCustomer({ firstName: "Stats", lastName: "A", email: "stats-a@example.com", status: "customer", lifetimeValue: 500 });
  createCustomer({ firstName: "Stats", lastName: "B", email: "stats-b@example.com", status: "lead" });
  const customerA = createCustomer({ firstName: "Stats", lastName: "C", email: "stats-c@example.com", status: "lead" });
  createLead({ customerId: customerA.customer.id, source: "manual", status: "closed-won", score: 100 });
  createLead({ customerId: customerA.customer.id, source: "manual", status: "closed-lost", score: 20 });

  const result = getCrmStats();
  assert.ok(result.totalCustomers >= 3);
  assert.ok(result.totalLeads >= 2);
  assert.ok(result.customersByStatus);
  assert.ok(result.leadsByStatus);
  assert.ok(typeof result.conversionRate === "number");
});

test("ContactSchema validates valid contact", () => {
  const result = ContactSchema.parse({
    id: "contact-1",
    customerId: "customer-1",
    type: "email",
    value: "test@example.com",
    isPrimary: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(result.type, "email");
  assert.equal(result.value, "test@example.com");
});

test("LeadSchema validates valid lead", () => {
  const result = LeadSchema.parse({
    id: "lead-1",
    customerId: "customer-1",
    source: "inventory",
    status: "new",
    score: 50,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(result.source, "inventory");
  assert.equal(result.score, 50);
});
