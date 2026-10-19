#!/usr/bin/env node
// scripts/token-health.js — read-only Facebook/Instagram token health report.
// Run: node scripts/token-health.js            (report only)
//      node scripts/token-health.js --refresh  (renew the Instagram token and write it to .env.local)
//      node scripts/token-health.js --exchange-fb  (put a fresh Graph Explorer token in FB_ACCESS_TOKEN first; swaps it for the never-expiring Page token)
// Exit code is 1 if any token is expired/invalid/expiring, so a scheduler can alert on it.

const fs = require("fs");
const path = require("path");
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());
const { checkAll, refreshInstagramToken, exchangeFacebookPageToken } = require("../lib/metaTokenHealth");

function replaceEnvValue(file, key, value) {
  const text = fs.readFileSync(file, "utf8");
  const re = new RegExp(`^${key}=.*$`, "m");
  if (!re.test(text)) throw new Error(`${key} not found in ${file}`);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text.replace(re, () => `${key}=${value}`));
  fs.renameSync(tmp, file);
}

(async () => {
  if (process.argv.includes("--exchange-fb")) {
    const res = await exchangeFacebookPageToken({
      userToken: process.env.FB_ACCESS_TOKEN, appId: process.env.FB_APP_ID,
      appSecret: process.env.FB_APP_SECRET, pageId: process.env.FB_PAGE_ID,
    });
    if (!res.ok) {
      console.log(`facebook   exchange failed: ${res.error}`);
      process.exit(1);
    }
    replaceEnvValue(path.join(process.cwd(), ".env.local"), "FB_ACCESS_TOKEN", res.token);
    process.env.FB_ACCESS_TOKEN = res.token;
    console.log("facebook   exchanged for a Page token (written to .env.local)");
  }

  const rows = await checkAll(process.env);
  for (const r of rows) console.log(`${r.platform.padEnd(10)} ${r.status.padEnd(9)} ${r.detail}`);

  if (process.argv.includes("--refresh")) {
    const ig = rows.find((r) => r.platform === "instagram");
    if (ig.status !== "ok") {
      console.log("instagram  not refreshed: token must be valid to refresh it");
    } else {
      const res = await refreshInstagramToken(process.env.IG_ACCESS_TOKEN || process.env.INSTAGRAM_ACCESS_TOKEN);
      if (!res.ok) {
        console.log(`instagram  refresh failed: ${res.error}`);
      } else {
        replaceEnvValue(path.join(process.cwd(), ".env.local"), "IG_ACCESS_TOKEN", res.token);
        console.log(`instagram  refreshed, good for ${res.expiresInDays} more days (written to .env.local)`);
      }
    }
  }
  process.exit(rows.some((r) => r.status !== "ok") ? 1 : 0);
})().catch((e) => { console.error("token-health failed:", e.message); process.exit(1); });
