// Dry run only: shows what an eBay draft for the Clock would send. Nothing is created.
const fs = require("fs"); const path = require("path");
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)
  .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")]; }));
Object.assign(process.env, env);
const { EbayConnector } = require("../lib/channels/apiConnectors");
(async () => {
  const c = new EbayConnector();
  const product = { sku: "BOOK-CLOCK-EBOOK", title: "The Clock That Stopped (ebook)", description: "Ebook.",
    price: 4.99, quantity: 999, condition: "NEW", currency: "USD", marketplace_id: "EBAY_US" };
  const r = await c.createListing(product, {}, { dryRun: true, tenantId: env.PLATFORM_OWNER_TENANT_ID });
  console.log(JSON.stringify(r, null, 2).slice(0, 1200));
})().catch((e) => console.error("DRY RUN FAILED:", e.message));
