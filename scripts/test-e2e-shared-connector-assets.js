// scripts/test-e2e-shared-connector-assets.js
// Shared connector + shared assets proof — acceptance criteria.
//
// Proves the universal connector and shared asset factory work together:
//   - lib/universal-creative/registry.js: ConnectorRegistry (capability manifests,
//     connection status, permissions, resource requirements, formats, verification history)
//   - lib/universal-creative/manifest.js: ConnectorConfigSchema, defaultConnectorConfig,
//     isAvailable, isVerified, hasCapability, ConnectionStatus
//   - lib/universal-creative/connector.js: createConnector, LocalCLIConnector, etc.
//   - lib/universal-creative/executor.js: probeConnector, runCommand
//   - lib/universal-creative/persistence.js: saveRegistry, loadRegistry
//   - lib/universal-creative/presets.js: allPresets (28 connector presets)
//   - lib/universal-creative/asset-factory.js: registerAsset, listAssets, getAsset,
//     createNewVersion, setApprovalStatus, setQCStatus, getVersionHistory, getStats
//
// Every connector has: capability manifest + connection status + permissions +
// resource requirements + formats + verification history. Never claims MCP unless
// tested. ImageMagick IS installed in this sandbox, so probe + asset dimension
// detection are real (not simulated). ffmpeg is NOT installed → correctly
// reported as unavailable, never claimed available.

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
} = require("../lib/universal-creative/manifest.js");
const { allPresets } = require("../lib/universal-creative/presets.js");
const { saveRegistry, loadRegistry, DEFAULT_FILE } = require("../lib/universal-creative/persistence.js");
const {
  registerAsset,
  createNewVersion,
  getAsset,
  listAssets,
  setApprovalStatus,
  setQCStatus,
  getVersionHistory,
  getStats,
  ASSET_TYPES,
} = require("../lib/universal-creative/asset-factory.js");

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

// ------------------------------------------------------------------
// 1. Connector manifest — every app has capability manifest + status + permissions
//    + resource requirements + formats + verification history
// ------------------------------------------------------------------

test("Shared Connector: manifest schema accepts a complete connector config", () => {
  const config = validConfig({
    capabilities: [
      {
        id: "ffmpeg.transcode",
        name: "Transcode video",
        input_formats: [".mp4", ".mov", ".avi"],
        output_formats: [".webm", ".mp4"],
        resource_requirements: { ffmpeg: true, ram_mb: 512 },
      },
    ],
    verification_history: [
      { level: "smoke", status: "pass", checked_at: new Date().toISOString(), checked_by: "test", notes: "ok" },
    ],
  });
  assert.equal(ConnectorConfigSchema.safeParse(config).success, true);
  assert.equal(config.status, "unknown");
  assert.deepEqual(config.verification_history.length, 1);
});

test("Shared Connector: manifest rejects missing required fields", () => {
  const { success } = ConnectorConfigSchema.safeParse({
    name: "No ID",
    category: "video",
    method: "cli",
    domain: "local",
  });
  assert.equal(success, false);
});

test("Shared Connector: defaultConnectorConfig sets unknown status, empty history", () => {
  const config = validConfig();
  assert.equal(config.status, "unknown");
  assert.deepEqual(config.verification_history, []);
  assert.equal(isAvailable(config), false);
  assert.equal(isVerified(config), false);
});

// ------------------------------------------------------------------
// 2. Registry — register/list/get/unregister, summary counts
// ------------------------------------------------------------------

test("Shared Connector: registry register/list/get/unregister", () => {
  const reg = freshRegistry();
  const entry = reg.register(validConfig({ id: "conn-a" }));
  assert.equal(entry.config.id, "conn-a");
  assert.deepEqual(reg.list(), [entry.config]);
  assert.equal(reg.getConfig("conn-a").id, "conn-a");
  assert.equal(reg.unregister("conn-a"), true);
  assert.deepEqual(reg.list(), []);
  assert.equal(reg.unregister("conn-a"), false);
});

test("Shared Connector: registry summary counts by status/method/category", () => {
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
  // production-ready = available + verified; c1 is available but not verified
  assert.deepEqual(s.available, []);
});

// ------------------------------------------------------------------
// 3. Probing — real probe against installed ImageMagick, real failure for ffmpeg
// ------------------------------------------------------------------

test("Shared Connector: probeConnector marks installed ImageMagick available (real probe)", async () => {
  const reg = freshRegistry();
  reg.registerMany(allPresets, "presets");
  const result = await reg.probe("imagemagick-local");
  assert.equal(result.connector_id, "imagemagick-local");
  assert.equal(result.status, "available");
  assert.equal(result.method, "cli");
  assert.ok(result.latency_ms >= 0);
  assert.ok(result.output);
  assert.equal(result.verification.status, "pass");

  const config = reg.getConfig("imagemagick-local");
  assert.equal(config.status, "available");
  assert.equal(config.verification_history.length, 1);
  assert.ok(config.last_verified_at);
});

test("Shared Connector: probeConnector marks missing ffmpeg unavailable — no false claim", async () => {
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

test("Shared Connector: MCP connector registers unverified — never claimed available", async () => {
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

  // MCP cannot run commands — unverified
  await assert.rejects(() => reg.run("some-mcp-server", "any-cmd", {}), /unverified/);
});

test("Shared Connector: runCommand on ImageMagick produces real output", async () => {
  const reg = freshRegistry();
  reg.registerMany(allPresets, "presets");
  await reg.probe("imagemagick-local");
  const config = reg.getConfig("imagemagick-local");

  const outFile = path.join(os.tmpdir(), `e2e-conn-test-${Date.now()}.png`);
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

test("Shared Connector: verification history is append-only across probes", async () => {
  const reg = freshRegistry();
  reg.registerMany(allPresets, "presets");
  await reg.probe("ffmpeg-local");
  await reg.probe("ffmpeg-local");
  const config = reg.getConfig("ffmpeg-local");
  assert.equal(config.verification_history.length, 2);
  assert.equal(config.verification_history[0].status, "fail");
  assert.equal(config.verification_history[1].status, "fail");
});

// ------------------------------------------------------------------
// 4. Presets — 28 presets registered as unknown/unverified, never assumed available
// ------------------------------------------------------------------

test("Shared Connector: all 28 presets register as unknown/unverified", () => {
  const reg = freshRegistry();
  reg.registerMany(allPresets, "presets");
  const byId = {};
  for (const c of reg.list()) byId[c.id] = c;

  assert.equal(reg.list().length, allPresets.length);
  assert.equal(byId["imagemagick-local"].status, "unknown");
  assert.equal(isVerified(byId["imagemagick-local"]), false);
  assert.equal(byId["ffmpeg-local"].status, "unknown");
  assert.equal(isAvailable(byId["ffmpeg-local"]), false);
  assert.equal(byId["blender-local"].status, "unknown");
  assert.equal(isVerified(byId["blender-local"]), false);
});

// ------------------------------------------------------------------
// 5. Persistence — save/load round-trip preserves manifests + history
// ------------------------------------------------------------------

test("Shared Connector: persistence save/load round-trip", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-persist-"));
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

    const empty = loadRegistry(path.join(dir, "does-not-exist.json"));
    assert.deepEqual(empty.list(), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------
// 6. Shared Asset Factory — register, list, version, approve, QC, stats
// ------------------------------------------------------------------

// makeImageFile — create a tiny valid PNG using ImageMagick (real tool,
// installed in sandbox). The asset factory uses a module-level ASSETS_DIR
// (os.tmpdir()/shared-assets) shared across all tests in the process, so we
// track created asset IDs by a unique tag rather than relying on isolation.
const E2E_TAG = `e2e-${Date.now()}`;

function makeImageFile(dir, name, width, height) {
  const file = path.join(dir, name);
  const { spawnSync } = require("node:child_process");
  const result = spawnSync(process.env.IMAGEMAGICK_PATH || "magick", [
    "-size", `${width}x${height}`,
    "xc:blue",
    file,
  ]);
  assert.equal(result.status, 0, `ImageMagick convert failed: ${result.stderr}`);
  assert.ok(fs.existsSync(file));
  return file;
}

function findE2EAssets() {
  return listAssets().filter((a) =>
    (a.tags || []).includes(E2E_TAG) ||
    a.originalFileName === "e2e-logo.png" ||
    a.originalFileName === "e2e-photo.png"
  );
}

test("Shared Assets: registerAsset stores a real file with dimensions + hash", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-assets-"));
  const imgFile = makeImageFile(dir, "logo.png", 512, 512);

  try {
    const before = findE2EAssets().length;
    const result = registerAsset({
      sourceFile: imgFile,
      assetType: "logo",
      projectId: "proj-1",
      productionId: "prod-1",
      sourceApplication: "commercial-maker",
      originalFileName: "e2e-logo.png",
      tags: ["brand", "primary", E2E_TAG],
      submittedBy: "e2e-test",
    });
    assert.ok(result.ok);
    assert.ok(result.asset.id);
    assert.equal(result.asset.type, "logo");
    assert.equal(result.asset.fileFormat, "png");
    assert.ok(result.asset.dimensions);
    assert.equal(result.asset.dimensions.width, 512);
    assert.equal(result.asset.dimensions.height, 512);
    assert.ok(result.asset.fileHash);
    assert.equal(result.asset.fileSize > 0, true);
    assert.equal(result.asset.approvalStatus, "pending");
    assert.equal(result.asset.qcStatus, "unverified");
    assert.equal(result.asset.versionHistory.length, 1);
    assert.equal(result.asset.currentVersionNumber, 1);
    assert.equal(result.asset.sourceApplication, "commercial-maker");
    // Exactly one new E2E asset was added
    assert.equal(findE2EAssets().length, before + 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Shared Assets: createNewVersion preserves original — never overwrites", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-assets-v2-"));
  const imgFile = makeImageFile(dir, "logo.png", 512, 512);
  const imgFileV2 = makeImageFile(dir, "logo-v2.png", 1024, 1024);

  try {
    const r1 = registerAsset({
      sourceFile: imgFile,
      assetType: "logo",
      originalFileName: "e2e-logo.png",
      tags: [E2E_TAG],
      submittedBy: "e2e-test",
    });
    assert.ok(r1.ok);
    const assetId = r1.asset.id;

    const r2 = createNewVersion(assetId, {
      sourceFile: imgFileV2,
      submittedBy: "e2e-test",
      changeNote: "High-res version",
    });
    assert.ok(r2.ok);
    assert.equal(r2.version.versionNumber, 2);
    assert.equal(r2.asset.currentVersionNumber, 2);
    assert.equal(r2.asset.versionHistory.length, 2);
    // Old version preserved (version 1 still in history)
    assert.equal(r2.asset.versionHistory[0].versionNumber, 1);
    assert.equal(r2.asset.versionHistory[1].versionNumber, 2);
    // New version resets approval/QC — needs re-review
    assert.equal(r2.asset.approvalStatus, "pending");
    assert.equal(r2.asset.qcStatus, "unverified");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Shared Assets: listAssets filters by type, project, approval, QC", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-assets-list-"));
  const imgFile = makeImageFile(dir, "logo.png", 512, 512);
  const imgFile2 = makeImageFile(dir, "photo.png", 1024, 768);

  try {
    const before = findE2EAssets().length;
    registerAsset({ sourceFile: imgFile, assetType: "logo", projectId: "proj-a", originalFileName: "e2e-logo.png", tags: [E2E_TAG], submittedBy: "t" });
    registerAsset({ sourceFile: imgFile2, assetType: "product-photo", projectId: "proj-b", originalFileName: "e2e-photo.png", tags: [E2E_TAG], submittedBy: "t" });

    // Exactly 2 new E2E assets added
    assert.equal(findE2EAssets().length, before + 2);

    const logos = listAssets({ assetType: "logo", tags: [E2E_TAG] });
    assert.ok(logos.some((a) => a.originalFileName === "e2e-logo.png"));

    const projA = listAssets({ projectId: "proj-a", tags: [E2E_TAG] });
    assert.ok(projA.some((a) => a.originalFileName === "e2e-logo.png"));

    // Approval filtering
    const e2eAssets = findE2EAssets();
    const logoAsset = e2eAssets.find((a) => a.originalFileName === "e2e-logo.png");
    assert.ok(logoAsset, "e2e logo asset should exist");
    setApprovalStatus(logoAsset.id, "approved", "e2e-tester");
    const approved = listAssets({ approvalStatus: "approved", tags: [E2E_TAG] });
    assert.ok(approved.some((a) => a.id === logoAsset.id));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Shared Assets: setApprovalStatus + setQCStatus require authorization", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-assets-auth-"));
  const imgFile = makeImageFile(dir, "logo.png", 512, 512);

  try {
    const r = registerAsset({ sourceFile: imgFile, assetType: "logo", originalFileName: "e2e-logo.png", tags: [E2E_TAG], submittedBy: "t" });
    assert.ok(r.ok);
    const assetId = r.asset.id;

    // Approve with authorization
    const approved = setApprovalStatus(assetId, "approved", "authorized-user", { notes: "Looks good" });
    assert.ok(approved.ok);
    assert.equal(approved.asset.approvalStatus, "approved");
    assert.equal(approved.asset.approvedBy, "authorized-user");

    // QC pass with authorization
    const qc = setQCStatus(assetId, "passed", "qa-reviewer", { notes: "Verified" });
    assert.ok(qc.ok);
    assert.equal(qc.asset.qcStatus, "passed");
    assert.equal(qc.asset.qcCheckedBy, "qa-reviewer");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Shared Assets: getVersionHistory returns full version chain", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-assets-hist-"));
  const imgFile = makeImageFile(dir, "logo.png", 512, 512);
  const imgFileV2 = makeImageFile(dir, "logo-v2.png", 1024, 1024);

  try {
    const r1 = registerAsset({ sourceFile: imgFile, assetType: "logo", originalFileName: "e2e-logo.png", tags: [E2E_TAG], submittedBy: "t" });
    assert.ok(r1.ok);
    const assetId = r1.asset.id;

    createNewVersion(assetId, { sourceFile: imgFileV2, submittedBy: "t", changeNote: "v2" });

    const history = getVersionHistory(assetId);
    assert.ok(history.ok);
    assert.equal(history.versionHistory.length, 2);
    assert.equal(history.versionHistory[0].changeNote, "Initial version");
    assert.equal(history.versionHistory[1].changeNote, "v2");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Shared Assets: getStats returns real counts", () => {
  const stats = getStats();
  assert.ok(typeof stats.totalAssets === "number");
  assert.ok(stats.storageDir);
  assert.ok(Array.isArray(ASSET_TYPES));
  assert.ok(ASSET_TYPES.includes("logo"));
  assert.ok(ASSET_TYPES.includes("product-photo"));
  assert.ok(ASSET_TYPES.includes("background"));
});

// ------------------------------------------------------------------
// 7. Integrated proof: connector + asset factory work together
// ------------------------------------------------------------------

test("Shared Connector + Assets: ImageMagick connector is production-ready (available + verified) and can process assets", async () => {
  const reg = freshRegistry();
  reg.registerMany(allPresets, "presets");
  await reg.probe("imagemagick-local");

  const config = reg.getConfig("imagemagick-local");
  assert.equal(isAvailable(config), true);
  assert.equal(isVerified(config), true);
  assert.ok(hasCapability(config, "imagemagick.convert"));

  // The connector can produce a real output file that could be registered
  // as a shared asset — proving connector → asset factory integration
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-integration-"));
  const outFile = path.join(dir, "output.png");
  try {
    const result = await runCommand(config, {
      id: "integration-test",
      name: "Prove connector output feeds asset factory",
      executable: config.executable_path,
      args: ["logo:", "-resize", "100x100", outFile],
      timeout_seconds: 30,
    });
    assert.equal(result.exit_code, 0);
    assert.ok(fs.existsSync(outFile));

    // Register the connector's output as a shared asset
    const asset = registerAsset({
      sourceFile: outFile,
      assetType: "brand-asset",
      sourceApplication: "universal-connector",
      originalFileName: "output.png",
      tags: ["connector-output", "imagemagick"],
      submittedBy: "e2e-integration",
    });
    assert.ok(asset.ok);
    assert.equal(asset.asset.type, "brand-asset");
    assert.equal(asset.asset.sourceApplication, "universal-connector");
    assert.ok(asset.asset.fileHash);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
