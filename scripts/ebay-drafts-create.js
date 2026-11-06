// Creates eBay DRAFT offers for the three ebooks (inventory item + unpublished offer). Never publishes.
const fs = require("fs"); const path = require("path");
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)
  .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")]; }));
Object.assign(process.env, env);
const { EbayConnector } = require("../lib/channels/apiConnectors");
const BOOKS = [
  ["BOOK-CLOCK-EBOOK", "The Clock That Stopped (ebook)"],
  ["BOOK-IRON-LEGENDS-EBOOK", "Iron Legends: The Council Wakes (ebook)"],
  ["BOOK-LITTLE-ZEUS-EBOOK", "Little Zeus Gets His Thunderbolt (ebook)"],
];
(async () => {
  const c = new EbayConnector();
  for (const [sku, title] of BOOKS) {
    const product = { sku, title, description: "Ebook (EPUB and PDF).", price: 4.99, quantity: 999,
      condition: "NEW", currency: "USD", marketplace_id: "EBAY_US" };
    try {
      const r = await c.createListing(product, { fulfillment_policy_id: "291164901014", payment_policy_id: "290642380014", return_policy_id: "290642401014", merchant_location_key: "JJ_NEW_BEDFORD_MAIN" }, { dryRun: false, tenantId: env.PLATFORM_OWNER_TENANT_ID });
      console.log(sku, "draft result:", JSON.stringify({ ok: r.ok, published: r.published, offerId: r.offerId || null, note: r.note || null }).slice(0, 300));
    } catch (e) { console.log(sku, "FAILED:", String(e.message).slice(0, 300)); }
  }
})();
