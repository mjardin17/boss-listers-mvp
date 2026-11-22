#!/usr/bin/env node
/**
 * Business Center tests — profile, claims check, growth audit, landing pages, lead capture.
 */

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "bc-test-"));
process.env.CRM_DIR = path.join(root, "crm");
process.env.CAMPAIGN_DIR = path.join(root, "campaigns");
process.env.BUSINESS_CENTER_DIR = path.join(root, "bc");

for (const m of ["crm.js", "campaign-manager.js", "business-center.js"]) {
  delete require.cache[require.resolve(`../lib/universal-creative/${m}`)];
}

const bc = require("../lib/universal-creative/business-center.js");
const crm = require("../lib/universal-creative/crm.js");
const campaigns = require("../lib/universal-creative/campaign-manager.js");

test("profile starts empty and saves validated fields", () => {
  assert.equal(bc.getProfile().name, "");
  const saved = bc.saveProfile({ name: "Jardins Outpost", avgOrderValueCents: 4000, approvedClaims: ["Free shipping"] });
  assert.equal(saved.name, "Jardins Outpost");
  assert.equal(bc.getProfile().avgOrderValueCents, 4000);
  assert.ok(saved.updatedAt);
});

test("profile rejects bad input", () => {
  assert.throws(() => bc.saveProfile({ email: "not-an-email" }));
  assert.throws(() => bc.saveProfile({ avgOrderValueCents: -5 }));
});

test("claims check flags risky phrases unless approved", () => {
  assert.deepEqual(bc.checkClaims("Great cards, fast shipping").flagged, []);
  assert.deepEqual(bc.checkClaims("100% guaranteed mint").flagged.sort(), ["100%", "guarantee", "guaranteed"].sort());
  bc.saveProfile({ approvedClaims: ["Free shipping", "100% authentic"] });
  assert.equal(bc.checkClaims("100% authentic cards").ok, true);
});

test("growth audit reports incomplete profile and no active campaign", () => {
  const opps = bc.runGrowthAudit();
  const areas = opps.map((o) => o.area);
  assert.ok(areas.includes("Business profile"));
  assert.ok(areas.includes("Campaigns"));
  assert.deepEqual(bc.listOpportunities().map((o) => o.id), opps.map((o) => o.id));
  for (const o of opps) assert.ok(o.impactBasis.length > 0);
});

test("landing page requires an existing campaign and clean claims", () => {
  assert.throws(() => bc.createLandingPage({ campaignId: "nope", slug: "x", headline: "Hi" }), /Campaign not found/);
  const c = campaigns.createCampaign({ name: "Spring cards", type: "lead-gen" }).campaign;
  assert.throws(
    () => bc.createLandingPage({ campaignId: c.id, slug: "spring", headline: "Guaranteed best in town" }),
    /Unapproved claims/
  );
  assert.throws(() => bc.createLandingPage({ campaignId: c.id, slug: "Bad Slug", headline: "Hi" }));
});

test("landing page is only public while its campaign is active", () => {
  const c = campaigns.createCampaign({ name: "Summer cards", type: "lead-gen" }).campaign;
  bc.createLandingPage({ campaignId: c.id, slug: "summer", headline: "Summer card sale", offer: "10% off" });
  assert.equal(bc.getPublicLanding("summer"), null);
  campaigns.updateCampaign(c.id, { status: "active" });
  const view = bc.getPublicLanding("summer");
  assert.equal(view.headline, "Summer card sale");
  assert.equal(bc.getPublicLanding("missing"), null);
});

test("lead capture needs consent, dedupes by email and replays idempotent keys", () => {
  assert.throws(
    () => bc.captureLead("summer", { firstName: "A", lastName: "B", email: "a@example.com", consent: false }),
    /Consent/
  );
  const first = bc.captureLead("summer", { firstName: "A", lastName: "B", email: "A@example.com", consent: true, timeline: "this week" }, "k1");
  assert.equal(first.duplicateContact, false);
  const replay = bc.captureLead("summer", { firstName: "A", lastName: "B", email: "a@example.com", consent: true }, "k1");
  assert.equal(replay.replayed, true);
  assert.equal(replay.leadId, first.leadId);
  const second = bc.captureLead("summer", { firstName: "A", lastName: "B", email: "a@example.com", consent: true });
  assert.equal(second.duplicateContact, true);
  assert.equal(second.customerId, first.customerId);
  assert.equal(crm.listCustomers().customers.length, 1);
  assert.equal(crm.listLeads().leads.length, 2);
  assert.ok(crm.getLead(first.leadId).lead.score >= 50);
});

test("lead capture rejects pages whose campaign is not active", () => {
  assert.throws(
    () => bc.captureLead("spring-none", { firstName: "A", lastName: "B", email: "c@example.com", consent: true }),
    /Page not found/
  );
});

test("each new lead adds one unread alert; replays do not", () => {
  const before = bc.listAlerts().length;
  const r = bc.captureLead("summer", { firstName: "D", lastName: "E", email: "d@example.com", consent: true }, "alert-k");
  bc.captureLead("summer", { firstName: "D", lastName: "E", email: "d@example.com", consent: true }, "alert-k");
  const alerts = bc.listAlerts();
  assert.equal(alerts.length, before + 1);
  assert.equal(alerts[0].id, r.alertId);
  assert.equal(alerts[0].type, "new-lead");
  assert.equal(alerts[0].read, false);
  assert.ok(!("email" in alerts[0]) && !("firstName" in alerts[0]), "alerts hold no personal details");
});

test("alerts can be marked read one at a time or all at once", () => {
  const unread = bc.unreadAlertCount();
  assert.ok(unread >= 1);
  const first = bc.listAlerts({ unreadOnly: true })[0];
  bc.markAlertRead(first.id);
  assert.equal(bc.unreadAlertCount(), unread - 1);
  assert.throws(() => bc.markAlertRead("missing"), /Alert not found/);
  bc.markAllAlertsRead();
  assert.equal(bc.unreadAlertCount(), 0);
});

test("phone push is off by default and never leaks personal details", async () => {
  delete process.env.LEAD_ALERT_WEBHOOK_URL;
  const id = bc.listAlerts()[0].id;
  assert.deepEqual(await bc.pushLeadAlert(id), { sent: false, reason: "not configured" });

  process.env.LEAD_ALERT_WEBHOOK_URL = "http://insecure.example.com/x";
  assert.equal((await bc.pushLeadAlert(id)).reason, "webhook must be https");

  process.env.LEAD_ALERT_WEBHOOK_URL = "https://push.example.com/topic";
  let sentBody = "";
  const ok = await bc.pushLeadAlert(id, async (_url, opts) => { sentBody = opts.body; return { ok: true, status: 200 }; });
  assert.equal(ok.sent, true);
  assert.match(sentBody, /New lead on \/p\/summer/);
  assert.doesNotMatch(sentBody, /@|example\.com|\bD\b/);

  const failed = await bc.pushLeadAlert(id, async () => { throw new Error("down"); });
  assert.deepEqual(failed, { sent: false, reason: "webhook failed" });
  delete process.env.LEAD_ALERT_WEBHOOK_URL;
});
