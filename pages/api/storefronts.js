// pages/api/storefronts.js
// GET → one overview of every storefront the owner runs.
//   eBay: active and draft offers from the eBay API; sold orders need the order-read permission.
//   Facebook Page and Instagram: connection check plus the most recent posts.
//   Website, Etsy, Amazon: link or status only (not checked here). Shopify is retired.
// Auth: owner session required. Read-only; nothing is published or changed here.

const fs = require("fs");
const path = require("path");
const { requireOwnerSession } = require("../../lib/requireSession");
const { EbayConnector } = require("../../lib/channels/apiConnectors");
const { readEbayStorefront, readFacebook, readInstagram, mergeActiveListings } = require("../../lib/storefrontsRead");
const { EbayInventoryFetcher } = require("../../lib/ebayInventoryFetcher");

function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// Details go to the server log only. The browser gets a fixed message, so no eBay internals leak.
async function ebayStorefront(tenantId) {
  try {
    const c = new EbayConnector();
    const accessToken = await c._getAccessToken(tenantId);
    const store = await readEbayStorefront({ accessToken, base: EbayConnector.apiBase(), fetchImpl: fetch });
    // The offers only cover listings BossListers made. Add the ones listed on eBay itself.
    try {
      const all = await new EbayInventoryFetcher().fetchAllListings(tenantId, {});
      return { ...store, active: mergeActiveListings(store.active, all), fullList: true };
    } catch (err) {
      console.error("[api/storefronts] eBay full list failed:", err.message);
      return { ...store, fullList: false, listNote: "Only listings made in BossListers are shown. The full eBay list could not be read right now." };
    }
  } catch (err) {
    console.error("[api/storefronts] eBay read failed:", err.message);
    return { connected: false, error: "eBay could not be read right now" };
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const session = await requireOwnerSession(req, res);
  if (!session) return;
  loadEnvLocal();

  const [ebay, facebook, instagram] = await Promise.all([
    ebayStorefront(process.env.PLATFORM_OWNER_TENANT_ID),
    readFacebook({ pageId: process.env.FB_PAGE_ID, token: process.env.FB_ACCESS_TOKEN, fetchImpl: fetch })
      .catch((err) => { console.error("[api/storefronts] Facebook:", err.message); return { connected: false, error: "Facebook Page check failed" }; }),
    readInstagram({ token: process.env.IG_ACCESS_TOKEN || process.env.INSTAGRAM_ACCESS_TOKEN, fetchImpl: fetch })
      .catch((err) => { console.error("[api/storefronts] Instagram:", err.message); return { connected: false, error: "Instagram check failed" }; }),
  ]);

  return res.status(200).json({
    ok: true,
    storefronts: {
      ebay,
      facebook,
      instagram,
      site: { connected: false, linkOnly: true, url: "https://jardins-outpost.pages.dev", note: "Your main store (replaced Shopify). Its shop section reads active, published items from the products table, so eBay-synced items and new items you add both show there." },
      etsy: { connected: false, note: "No shop yet" },
      amazon: { connected: false, note: "Account not connected (plan decision pending)" },
    },
  });
}
