// lib/ownSoldHistory.js
// The seller's OWN eBay sales (last 60 days) from the Trading API SoldList, read
// with the same tenant token the inventory import uses. Real data only: an item
// shows here only if the seller actually sold it.
const { EbayInventoryFetcher } = require("./ebayInventoryFetcher");
const { sameItem } = require("./soldMatch");

const CACHE_MS = 30 * 60 * 1000;
const MAX_PAGES = 4;
const cache = new Map(); // tenantId -> { at, sales }

const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

/** Flattens a GetMyeBaySelling SoldList reply into { title, price, soldAt, itemId }. */
function parseSoldList(soldList) {
  const out = [];
  for (const ot of asArray(soldList?.OrderTransactionArray?.OrderTransaction)) {
    const txs = ot.Transaction ? [ot.Transaction] : asArray(ot.Order?.TransactionArray?.Transaction);
    for (const tx of txs) {
      const item = asArray(tx?.Item)[0] || tx?.Item || {};
      const priceNode = tx?.TotalTransactionPrice ?? tx?.TransactionPrice ?? item?.SellingStatus?.CurrentPrice;
      const price = Number(typeof priceNode === "object" ? priceNode["#text"] : priceNode);
      const title = String(item?.Title || "").trim();
      if (!title || !Number.isFinite(price) || price <= 0) continue;
      out.push({ title, price, soldAt: String(tx?.CreatedDate || ot.Order?.CreatedTime || ""), itemId: String(item?.ItemID || "") });
    }
  }
  return out;
}

async function fetchSoldPage(fetcher, token, page) {
  const body =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<SoldList><Include>true</Include><DurationInDays>60</DurationInDays>` +
    `<Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination>` +
    `</SoldList></GetMyeBaySellingRequest>`;
  const res = await fetch(fetcher.tradingApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "X-EBAY-API-SITEID": "0",
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1155",
      "X-EBAY-API-CALL-NAME": "GetMyeBaySelling",
      "X-EBAY-API-IAF-TOKEN": token,
    },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`eBay sold list HTTP ${res.status}`);
  const reply = fetcher.xmlParser.parse(await res.text()).GetMyeBaySellingResponse;
  if (!reply || reply.Ack === "Failure") throw new Error("eBay sold list failed");
  return {
    sales: parseSoldList(reply.SoldList),
    pages: Number(reply.SoldList?.PaginationResult?.TotalNumberOfPages || 1),
  };
}

/** All of this tenant's sales in the last 60 days, cached for 30 minutes. */
async function ownSales(tenantId, now = Date.now()) {
  const hit = cache.get(tenantId);
  if (hit && now - hit.at < CACHE_MS) return hit.sales;
  const fetcher = new EbayInventoryFetcher();
  const token = await fetcher.connector._getAccessToken(tenantId);
  const sales = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await fetchSoldPage(fetcher, token, page);
    sales.push(...r.sales);
    if (page >= r.pages) break;
  }
  cache.set(tenantId, { at: now, sales });
  return sales;
}

/** The seller's own past sales that are the same item as `title`. */
function matchOwnSales(title, sales) {
  return (sales || []).filter((s) => sameItem(title, { title: s.title, status: "sold" }));
}

module.exports = { ownSales, matchOwnSales, parseSoldList };
