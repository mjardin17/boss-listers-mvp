const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  defaultRegistry,
  ConnectorRegistry,
} = require("../lib/universal-creative/registry.js");
const { runCommand } = require("../lib/universal-creative/executor.js");
const {
  ConnectorConfigSchema,
  defaultConnectorConfig,
  isAvailable,
  isVerified,
  hasCapability,
  ConnectionStatus,
} = require("../lib/universal-creative/manifest.js");
const { allPresets } = require("../lib/universal-creative/presets.js");
const { saveRegistry, loadRegistry, DEFAULT_FILE } = require("../lib/universal-creative/persistence.js");

function freshRegistry() {
  return new ConnectorRegistry("test");
}

function validConfig(overrides = {}) {
  return defaultConnectorConfig({
    id: "test-conn",
    name: "Test Connector",
    category: "video",
    method: "cli",
    domain: "local",
    ...overrides,
  });
}

test("ConnectorConfigSchema accepts a valid manifest", () => {
  const config = validConfig();
  assert.equal(ConnectorConfigSchema.safeParse(config).success, true);
});

test("ConnectorConfigSchema rejects a manifest missing id", () => {
  const { success } = ConnectorConfigSchema.safeParse({
    name: "No ID",
    category: "video",
    method: "cli",
    domain: "local",
  });
  assert.equal(success, false);
});

test("defaultConnectorConfig sets status unknown and empty history", () => {
  const config = validConfig();
  assert.equal(config.status, "unknown");
  assert.deepEqual(config.verification_history, []);
  assert.equal(isAvailable(config), false);
  assert.equal(isVerified(config), false);
});

test("registry register/list/get/unregister", () => {
  const reg = freshRegistry();
  const entry = reg.register(validConfig({ id: "conn-a" }));
  assert.equal(entry.config.id, "conn-a");
  assert.deepEqual(reg.list(), [entry.config]);
  assert.equal(reg.getConfig("conn-a").id, "conn-a");
  assert.equal(reg.unregister("conn-a"), true);
  assert.deepEqual(reg.list(), []);
  assert.equal(reg.unregister("conn-a"), false);
});

test("registry summary counts by status/method/category", () => {
  const reg = freshRegistry();
  reg.register(validConfig({ id: "c1", status: "available" }));
  reg.register(validConfig({ id: "c2", status: "unverified", method: "python_script", category: "audio" }));
  const s = reg.summary();
  assert.equal(s.total, 2);
  assert.equal(s.by_status.available, 1);
  assert.equal(s.by_status.unverified, 1);
  assert.equal(s.by_method.cli, 1);
  assert.equal(s.by_method.python_script, 1);
  assert.equal(s.by_category.video, 1);
  assert.equal(s.by_category.audio, 1);
  // production-ready requires available + verified; c1 is available but not verified
  assert.deepEqual(s.available, []);
  assert.deepEqual(s.unverified, ["c1", "c2"].sort());
});

test("getProductionReady only returns available + verified connectors", () => {
  const reg = freshRegistry();
  const availableUnverified = validConfig({ id: "u", status: "available" });
  reg.register(availableUnverified);
  assert.deepEqual(reg.getProductionReady(), []);

  const verified = validConfig({
    id: "v",
    status: "available",
    verification_history: [{ level: "smoke", status: "pass", checked_at: new Date().toISOString(), checked_by: "test" }],
  });
  reg.register(verified);
  assert.deepEqual(reg.getProductionReady(), [verified]);
});

test("getUnverified returns connectors with no passing verification", () => {
  const reg = freshRegistry();
  reg.register(validConfig({ id: "a" }));
  reg.register(
    validConfig({
      id: "b",
      verification_history: [{ level: "smoke", status: "fail", checked_at: new Date().toISOString(), checked_by: "test" }],
    })
  );
  reg.register(
    validConfig({
      id: "c",
      verification_history: [{ level: "smoke", status: "pass", checked_at: new Date().toISOString(), checked_by: "test" }],
    })
  );
  const ids = reg.getUnverified().map((c) => c.id).sort();
  assert.deepEqual(ids, ["a", "b"]);
});

test("isVerified / hasCapability helpers", () => {
  const config = validConfig({
    id: "cap",
    capabilities: [{ id: "ffmpeg.transcode", name: "Transcode", input_formats: [".mp4"], output_formats: [".webm"] }],
  });
  assert.equal(hasCapability(config, "ffmpeg.transcode"), true);
  assert.equal(hasCapability(config, "blender.render"), false);
});

test("presets register as unknown / unverified, never assumed available", () => {
  const reg = freshRegistry();
  reg.registerMany(allPresets, "presets");
  const byId = {};
  for (const c of reg.list()) byId[c.id] = c;

  // imagemagick is installed but registered unknown until probed
  assert.equal(byId["imagemagick-local"].status, "unknown");
  assert.equal(isVerified(byId["imagemagick-local"]), false);

  // ffmpeg not installed -> still unknown/unverified, never claimed available
  assert.equal(byId["ffmpeg-local"].status, "unknown");
  assert.equal(isAvailable(byId["ffmpeg-local"]), false);

  // blender not installed -> unknown
  assert.equal(byId["blender-local"].status, "unknown");
  assert.equal(isVerified(byId["blender-local"]), false);

  // All 28 presets present
  assert.equal(reg.list().length, allPresets.length);
});

test("probeConnector marks installed imagemagick available", async () => {
  const reg = freshRegistry();
  reg.registerMany(allPresets, "presets");
  const result = await reg.probe("imagemagick-local");
  assert.equal(result.connector_id, "imagemagick-local");
  assert.equal(result.status, "available");
  assert.equal(result.method, "cli");
  assert.ok(result.latency_ms >= 0);
  assert.ok(result.output);
  assert.equal(result.verification.status, "pass");

  // Config updated + history appended
  const config = reg.getConfig("imagemagick-local");
  assert.equal(config.status, "available");
  assert.equal(config.verification_history.length, 1);
  assert.ok(config.last_verified_at);
});

test("probeConnector marks missing ffmpeg unavailable (no false claim)", async () => {
  const reg = freshRegistry();
  reg.registerMany(allPresets, "presets");
  const result = await reg.probe("ffmpeg-local");
  assert.equal(result.connector_id, "ffmpeg-local");
  assert.equal(result.status, "unavailable");
  assert.equal(result.method, "cli");
  assert.ok(result.error);
  assert.equal(result.verification.status, "fail");

  const config = reg.getConfig("ffmpeg-local");
  assert.equal(config.status, "unavailable");
  assert.equal(isAvailable(config), false);
  assert.equal(isVerified(config), false);
});

test("MCP connector registers unverified and cannot run", async () => {
  const reg = freshRegistry();
  const mcp = defaultConnectorConfig({
    id: "some-mcp-server",
    name: "Some MCP Server",
    category: "ai_model",
    method: "mcp",
    domain: "local",
    executable_path: "/some/mcp",
  });
  reg.register(mcp);
  const result = await reg.probe("some-mcp-server");
  assert.equal(result.status, "unverified");
  assert.equal(result.verification.status, "skip");
  assert.ok(result.error.match(/not yet tested/));
  assert.equal(isVerified(reg.getConfig("some-mcp-server")), false);

  await assert.rejects(() => reg.run("some-mcp-server", "any-cmd", {}), /unverified/);
});

test("runCommand on imagemagick produces output", async () => {
  const reg = freshRegistry();
  reg.registerMany(allPresets, "presets");
  await reg.probe("imagemagick-local");
  const config = reg.getConfig("imagemagick-local");

  const outFile = path.join(os.tmpdir(), `ucc-test-${Date.now()}.png`);
  try {
    const result = await runCommand(config, {
      id: "convert-test",
      name: "ImageMagick convert test",
      executable: config.executable_path,
      args: ["logo:", "-resize", "200x200", outFile],
      timeout_seconds: 30,
    });
    assert.equal(result.exit_code, 0);
    assert.equal(result.connector_id, "imagemagick-local");
    assert.equal(result.command_id, "convert-test");
    assert.ok(result.duration_ms >= 0);
    assert.ok(fs.existsSync(outFile), `output file ${outFile} should exist`);
  } finally {
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
  }
});

test("run throws for unverified connector", async () => {
  const reg = freshRegistry();
  reg.register(validConfig({ id: "bad", status: "unavailable" }));
  await assert.rejects(() => reg.run("bad", "probe", {}), /not available\/verified/);
});

test("verification history is append-only across probes", async () => {
  const reg = freshRegistry();
  reg.registerMany(allPresets, "presets");
  await reg.probe("ffmpeg-local");
  await reg.probe("ffmpeg-local");
  const config = reg.getConfig("ffmpeg-local");
  assert.equal(config.verification_history.length, 2);
  // First entry preserved unchanged
  assert.equal(config.verification_history[0].status, "fail");
  assert.equal(config.verification_history[1].status, "fail");
});

test("persistence save/load round-trip preserves manifests and history", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ucc-persist-"));
  const file = path.join(dir, "registry.json");
  try {
    const reg = freshRegistry();
    const config = validConfig({
      id: "persist-me",
      status: "available",
      verification_history: [
        { level: "smoke", status: "pass", checked_at: new Date().toISOString(), checked_by: "test", notes: "ok" },
      ],
    });
    reg.register(config);

    saveRegistry(reg, file);
    assert.ok(fs.existsSync(file));

    const loaded = loadRegistry(file);
    const loadedConfig = loaded.getConfig("persist-me");
    assert.equal(loadedConfig.id, "persist-me");
    assert.equal(loadedConfig.status, "available");
    assert.equal(loadedConfig.verification_history.length, 1);
    assert.equal(loadedConfig.verification_history[0].notes, "ok");

    // Missing file -> empty registry, no crash
    const empty = loadRegistry(path.join(dir, "does-not-exist.json"));
    assert.deepEqual(empty.list(), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("probeAll probes every registered connector", async () => {
  const reg = freshRegistry();
  reg.registerMany(allPresets, "presets");
  const results = await reg.probeAll();
  assert.equal(results.length, allPresets.length);
  // At least imagemagick available, ffmpeg unavailable
  const byId = {};
  for (const r of results) byId[r.connector_id] = r;
  assert.equal(byId["imagemagick-local"].status, "available");
  assert.equal(byId["ffmpeg-local"].status, "unavailable");
});
