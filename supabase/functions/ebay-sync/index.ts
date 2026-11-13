/**
 * Supabase Edge Function: ebay-sync
 *
 * Called every 15 minutes by the pg_cron job "ebay-sync-every-15-min".
 * It keeps one stock count per item: when something sells or ends on eBay, the BossListers
 * count drops to match, so the store never offers an item that is gone. See core.mjs.
 *
 * Auth: Supabase checks the caller's key (JWT checking is on). The schedule sends the project's
 * public key, which is not a secret, so core.mjs also ignores any call made less than five
 * minutes after the last run. A stranger with the public key can therefore do nothing extra.
 * Secrets it needs (set in Supabase, never in this repo): EBAY_CLIENT_ID, EBAY_CLIENT_SECRET.
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are built in.
 */
import { XMLParser } from "npm:fast-xml-parser@5.11.1";
import { runSync } from "./core.mjs";
import { planCounts, autoSteps, classifyEbayItem } from "./plan.mjs";
import config from "./config.json" with { type: "json" };

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", isArray: (name: string) => name === "Item" });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const result = await runSync({
    fetchImpl: fetch,
    parseXml: (text: string) => xml.parse(text),
    env: {
      supabaseUrl: Deno.env.get("SUPABASE_URL"),
      serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      ebayClientId: Deno.env.get("EBAY_CLIENT_ID"),
      ebayClientSecret: Deno.env.get("EBAY_CLIENT_SECRET"),
    },
    config,
    planner: { planCounts, autoSteps, classifyEbayItem },
  });
  return json(result, result.blocked ? 500 : 200);
});
