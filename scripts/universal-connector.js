#!/usr/bin/env node
/**
 * Universal Creative Production Connector — CLI
 *
 * Commands:
 *   list                              list all registered connectors
 *   summary                           registry summary (counts by status/method/category)
 *   register <json-file>              register one or many connectors from JSON
 *   probe <connector-id>              probe one connector (updates status + history)
 *   probe-all                         probe every registered connector
 *   run <connector-id> <command-id>   run a command (JSON args on stdin)
 *   show <connector-id>               print full manifest + history
 *   production-ready                  list connectors safe for production jobs
 *   unverified                        list connectors needing owner attention
 *
 * Examples:
 *   node scripts/universal-connector.js list
 *   echo '{"ffmpeg":"-version"}' | node scripts/universal-connector.js run ffmpeg-local probe
 */

const fs = require("fs");
const { execSync } = require("child_process");
const { saveRegistry, loadRegistry } = require("../lib/universal-creative/persistence.js");
const { defaultRegistry } = require("../lib/universal-creative/registry.js");
const {
  ConnectorConfigSchema,
  defaultConnectorConfig,
  isAvailable,
  isVerified,
} = require("../lib/universal-creative/manifest.js");
const { allPresets } = require("../lib/universal-creative/presets.js");

function ensurePresets() {
  const existing = defaultRegistry.list();
  if (existing.length === 0) {
    defaultRegistry.registerMany(allPresets, "presets");
  }
}

function loadPersisted() {
  try {
    const loaded = loadRegistry();
    for (const entry of loaded.toJSON()) {
      if (!defaultRegistry.getConfig(entry.config.id)) {
        defaultRegistry.register(entry.config, entry.source);
        const e = defaultRegistry.getEntry(entry.config.id);
        if (e) {
          e.added_at = entry.added_at;
          e.updated_at = entry.updated_at;
        }
      }
    }
  } catch {
    // No persisted registry yet — start fresh.
  }
}

loadPersisted();

function die(code, message) {
  console.error(message);
  process.exit(code);
}

function readStdin() {
  let data = "";
  process.stdin.on("data", (chunk) => (data += chunk));
  return new Promise((resolve) => process.stdin.on("end", () => resolve(data)));
}

async function cmdList() {
  ensurePresets();
  const connectors = defaultRegistry.list();
  if (connectors.length === 0) {
    console.log("No connectors registered.");
    return;
  }
  console.log(`${connectors.length} connector(s):`);
  for (const c of connectors) {
    const verified = isVerified(c);
    const ready = isAvailable(c) && verified;
    console.log(
      `  ${c.id.padEnd(26)} ${c.status.padEnd(14)} ${(ready ? "READY" : verified ? "VERIFIED" : "PENDING").padEnd(10)} ${c.method} | ${c.name}`
    );
  }
}

async function cmdSummary() {
  ensurePresets();
  const s = defaultRegistry.summary();
  console.log(`Registry summary — ${s.total} connector(s)`);
  console.log("\nBy status:");
  for (const [k, v] of Object.entries(s.by_status)) console.log(`  ${k.padEnd(16)} ${v}`);
  console.log("\nBy method:");
  for (const [k, v] of Object.entries(s.by_method)) console.log(`  ${k.padEnd(16)} ${v}`);
  console.log("\nBy category:");
  for (const [k, v] of Object.entries(s.by_category)) console.log(`  ${k.padEnd(16)} ${v}`);
  console.log(`\nUnverified (${s.unverified.length}): ${s.unverified.join(", ") || "none"}`);
  console.log(`Production-ready (${s.available.length}): ${s.available.join(", ") || "none"}`);
}

async function cmdRegister(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    die(1, `cannot read ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    die(1, `invalid JSON in ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const configs = Array.isArray(parsed) ? parsed : [parsed];
  const results = [];
  for (const cfg of configs) {
    try {
      const validated = ConnectorConfigSchema.parse(cfg);
      const entry = defaultRegistry.register(validated, "cli");
      results.push({ id: validated.id, status: validated.status, ok: true });
    } catch (err) {
      results.push({ id: cfg?.id ?? "(unknown)", ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  saveRegistry(defaultRegistry);
  console.log(JSON.stringify(results, null, 2));
}

async function cmdProbe(id) {
  ensurePresets();
  try {
    const result = await defaultRegistry.probe(id);
    saveRegistry(defaultRegistry);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    die(1, err instanceof Error ? err.message : String(err));
  }
}

async function cmdProbeAll() {
  ensurePresets();
  const results = await defaultRegistry.probeAll();
  console.log(JSON.stringify(results, null, 2));
}

async function cmdRun(id, commandId) {
  const stdin = await readStdin();
  let args = {};
  if (stdin.trim()) {
    try {
      args = JSON.parse(stdin);
    } catch (err) {
      die(1, `invalid JSON on stdin: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  try {
    const result = await defaultRegistry.run(id, commandId, args);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    die(1, err instanceof Error ? err.message : String(err));
  }
}

async function cmdShow(id) {
  ensurePresets();
  const entry = defaultRegistry.getEntry(id);
  if (!entry) die(1, `connector not registered: ${id}`);
  console.log(JSON.stringify(entry, null, 2));
}

async function cmdProductionReady() {
  ensurePresets();
  const ready = defaultRegistry.getProductionReady();
  if (ready.length === 0) {
    console.log("No production-ready connectors.");
    return;
  }
  console.log(`${ready.length} production-ready connector(s):`);
  for (const c of ready) console.log(`  ${c.id} — ${c.name} (${c.method})`);
}

async function cmdUnverified() {
  ensurePresets();
  const unverified = defaultRegistry.getUnverified();
  if (unverified.length === 0) {
    console.log("All connectors verified.");
    return;
  }
  console.log(`${unverified.length} unverified connector(s):`);
  for (const c of unverified) console.log(`  ${c.id} — ${c.status} (${c.method})`);
}

async function main() {
  const [, , command, ...rest] = process.argv;
  switch (command) {
    case "list":
      await cmdList();
      break;
    case "summary":
      await cmdSummary();
      break;
    case "register":
      if (!rest[0]) die(1, "usage: register <json-file>");
      await cmdRegister(rest[0]);
      break;
    case "probe":
      if (!rest[0]) die(1, "usage: probe <connector-id>");
      await cmdProbe(rest[0]);
      break;
    case "probe-all":
      await cmdProbeAll();
      break;
    case "run":
      if (!rest[0] || !rest[1]) die(1, "usage: run <connector-id> <command-id>");
      await cmdRun(rest[0], rest[1]);
      break;
    case "show":
      if (!rest[0]) die(1, "usage: show <connector-id>");
      await cmdShow(rest[0]);
      break;
    case "production-ready":
      await cmdProductionReady();
      break;
    case "unverified":
      await cmdUnverified();
      break;
    default:
      die(1, `unknown command: ${command}\nUsage: universal-connector.js <list|summary|register|probe|probe-all|run|show|production-ready|unverified>`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
