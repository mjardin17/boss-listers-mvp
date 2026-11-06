// Lists the owner's eBay policy IDs and merchant location key (read-only).
const fs = require("fs"); const path = require("path");
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)
  .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")]; }));
Object.assign(process.env, env);
const { EbayConnector } = require("../lib/channels/apiConnectors");
(async () => {
  const c = new EbayConnector();
  const tok = await c._getAccessToken(env.PLATFORM_OWNER_TENANT_ID);
  const base = EbayConnector.apiBase();
  const h = { Authorization: `Bearer ${tok}`, Accept: "application/json" };
  const get = async (p) => (await fetch(base + p, { headers: h })).json();
  const f = await get("/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US");
  const p = await get("/sell/account/v1/payment_policy?marketplace_id=EBAY_US");
  const r = await get("/sell/account/v1/return_policy?marketplace_id=EBAY_US");
  const l = await get("/sell/inventory/v1/location?limit=5");
  const first = (x, k) => (x?.[k] || [])[0]?.[k.replace(/s$/, "Id")] || null;
  console.log(JSON.stringify({
    fulfillment: f.fulfillmentPolicies?.[0]?.fulfillmentPolicyId || null,
    payment: p.paymentPolicies?.[0]?.paymentPolicyId || null,
    return: r.returnPolicies?.[0]?.returnPolicyId || null,
    location: l.locations?.[0]?.merchantLocationKey || null,
    counts: { fulfillment: f.total ?? (f.fulfillmentPolicies||[]).length, payment: p.total ?? (p.paymentPolicies||[]).length, return: r.total ?? (r.returnPolicies||[]).length, locations: (l.locations||[]).length },
    errors: [f.errors, p.errors, r.errors, l.errors].filter(Boolean).map(e => JSON.stringify(e).slice(0,160)),
  }, null, 2));
})().catch((e) => console.error("FAILED:", e.message));
