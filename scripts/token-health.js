#!/usr/bin/env node
// scripts/token-health.js — read-only Facebook/Instagram token health report.
// Run: node scripts/token-health.js            (report only)
//      node scripts/token-health.js --refresh  (renew the Instagram token and write it to .env.local)
// Exit code is 1 if any token is expired/invalid/expiring, so a scheduler can alert on it.

const fs = require("fs");
const path = require("path");
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());
const { checkAll, refreshInstagramToken } = require("../lib/metaTokenHealth");

function replaceEnvValue(file, key, value) {
  const text = fs.readFileSync(file, "utf8");
  const re = new RegExp(`^${key}=.*$`, "m");
  if (!re.test(text)) throw new Error(`${key} not found in ${file}`);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text.replace(re, () => `${key}=${value}`));
  fs.renameSync(tmp, file);
}

(async () => {
  const rows = await checkAll(process.env);
  for (const r of rows) console.log(`${r.platform.padEnd(10)} ${r.status.padEnd(9)} ${r.detail}`);

  if (process.argv.includes("--refresh")) {
    const ig = rows.find((r) => r.platform === "instagram");
    if (ig.status !== "ok") {
      console.log("instagram  not refreshed: token must be valid to refresh it");
    } else {
      const res = await refreshInstagramToken(process.env.IG_ACCESS_TOKEN);
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
