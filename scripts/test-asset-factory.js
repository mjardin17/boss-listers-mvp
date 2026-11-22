const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  registerAsset,
  createNewVersion,
  getAsset,
  listAssets,
  setApprovalStatus,
  setQCStatus,
  getVersionHistory,
  getVersionPath,
  deleteAsset,
  getAssetTypes,
  getStats,
  ASSET_TYPES,
  APPROVAL_STATUSES,
  QC_STATUSES,
  loadRegistry,
  saveRegistry,
} = require("../lib/universal-creative/asset-factory.js");

// Override ASSETS_DIR to use temp directory for tests
const TEST_DIR = path.join(os.tmpdir(), `asset-test-${Date.now()}`);
process.env.ASSETS_DIR = TEST_DIR;

// Clear module cache to pick up new env var
delete require.cache[require.resolve("../lib/universal-creative/asset-factory.js")];
const {
  registerAsset: ra2,
  createNewVersion: cnv2,
  getAsset: ga2,
  listAssets: la2,
  setApprovalStatus: sas2,
  setQCStatus: sqs2,
  getVersionHistory: gvh2,
  getVersionPath: gvp2,
  deleteAsset: da2,
  getAssetTypes: gat2,
  getStats: gs2,
  saveRegistry: saveRegistry2,
} = require("../lib/universal-creative/asset-factory.js");

// ---------------------------------------------------------------
// Asset factory tests
// ---------------------------------------------------------------

test("getAssetTypes returns all types", () => {
  assert.ok(Array.isArray(ASSET_TYPES));
  assert.ok(ASSET_TYPES.includes("logo"));
  assert.ok(ASSET_TYPES.includes("product-photo"));
  assert.ok(ASSET_TYPES.includes("background"));
  assert.ok(ASSET_TYPES.includes("music"));
});

test("APPROVAL_STATUSES and QC_STATUSES", () => {
  assert.ok(APPROVAL_STATUSES.includes("pending"));
  assert.ok(APPROVAL_STATUSES.includes("approved"));
  assert.ok(APPROVAL_STATUSES.includes("rejected"));
  assert.ok(QC_STATUSES.includes("unverified"));
  assert.ok(QC_STATUSES.includes("passed"));
  assert.ok(QC_STATUSES.includes("failed"));
});

test("registerAsset creates new asset", () => {
  // Create a test image file
  const tmpFile = path.join(os.tmpdir(), `test-asset-${Date.now()}.png`);
  fs.writeFileSync(tmpFile, "fake-png-content-for-testing");

  try {
    const result = ra2({
      sourceFile: tmpFile,
      assetType: "product-photo",
      projectId: "proj-1",
      sourceApplication: "test",
      originalFileName: "test-product.png",
      tags: ["test", "product"],
      submittedBy: "test-user",
    });

    assert.ok(result.ok);
    assert.ok(result.asset);
    assert.equal(result.asset.type, "product-photo");
    assert.equal(result.asset.originalFileName, "test-product.png");
    assert.equal(result.asset.fileFormat, "png");
    assert.equal(result.asset.projectId, "proj-1");
    assert.equal(result.asset.sourceApplication, "test");
    assert.ok(result.asset.id);
    assert.ok(result.asset.storagePath);
    assert.ok(fs.existsSync(result.asset.storagePath));
    assert.equal(result.asset.approvalStatus, "pending");
    assert.equal(result.asset.qcStatus, "unverified");
    assert.equal(result.asset.currentVersionNumber, 1);
    assert.equal(result.asset.versionHistory.length, 1);
    assert.ok(fs.existsSync(result.asset.storagePath));
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    // Clean up test assets dir
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

test("registerAsset rejects invalid type", () => {
  const tmpFile = path.join(os.tmpdir(), `test-invalid-${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, "test");
  try {
    const result = ra2({
      sourceFile: tmpFile,
      assetType: "invalid-type",
    });
    assert.ok(!result.ok);
    assert.ok(result.error);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

test("getAsset retrieves registered asset", () => {
  const tmpFile = path.join(os.tmpdir(), `test-get-${Date.now()}.png`);
  fs.writeFileSync(tmpFile, "test-content");
  try {
    const regResult = ra2({
      sourceFile: tmpFile,
      assetType: "logo",
      submittedBy: "test",
    });
    assert.ok(regResult.ok);

    const asset = ga2(regResult.asset.id);
    assert.ok(asset);
    assert.equal(asset.id, regResult.asset.id);
    assert.equal(asset.type, "logo");
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

test("getAsset returns null for missing", () => {
  const asset = ga2("nonexistent-id");
  assert.equal(asset, null);
});

test("listAssets with filters", () => {
  // Register multiple assets
  const files = [];
  try {
    for (let i = 0; i < 3; i++) {
      const f = path.join(os.tmpdir(), `test-list-${i}-${Date.now()}.png`);
      fs.writeFileSync(f, `content-${i}`);
      files.push(f);
      ra2({
        sourceFile: f,
        assetType: i === 0 ? "logo" : "background",
        projectId: i === 0 ? "proj-a" : "proj-b",
        submittedBy: "test",
      });
    }

    const all = la2();
    assert.ok(all.length >= 3);

    const logos = la2({ assetType: "logo" });
    assert.ok(logos.length >= 1);
    assert.ok(logos.every((a) => a.type === "logo"));

    const projA = la2({ projectId: "proj-a" });
    assert.ok(projA.length >= 1);
    assert.ok(projA.every((a) => a.projectId === "proj-a"));
  } finally {
    files.forEach((f) => {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

test("setApprovalStatus approves/rejects asset", () => {
  const tmpFile = path.join(os.tmpdir(), `test-approve-${Date.now()}.png`);
  fs.writeFileSync(tmpFile, "content");
  try {
    const reg = ra2({ sourceFile: tmpFile, assetType: "music", submittedBy: "test" });
    assert.ok(reg.ok);

    const approved = sas2(reg.asset.id, "approved", "reviewer-1", { notes: "Looks good" });
    assert.ok(approved.ok);
    assert.equal(approved.asset.approvalStatus, "approved");
    assert.equal(approved.asset.approvedBy, "reviewer-1");
    assert.ok(approved.asset.approvedAt);

    const rejected = sas2(reg.asset.id, "rejected", "reviewer-2", { notes: "Needs work" });
    assert.ok(rejected.ok);
    assert.equal(rejected.asset.approvalStatus, "rejected");
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

test("setApprovalStatus rejects invalid status", () => {
  const tmpFile = path.join(os.tmpdir(), `test-approve2-${Date.now()}.png`);
  fs.writeFileSync(tmpFile, "content");
  try {
    const reg = ra2({ sourceFile: tmpFile, assetType: "music", submittedBy: "test" });
    const result = sas2(reg.asset.id, "invalid-status", "user");
    assert.ok(!result.ok);
    assert.ok(result.error);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

test("setQCStatus sets QC status", () => {
  const tmpFile = path.join(os.tmpdir(), `test-qc-${Date.now()}.png`);
  fs.writeFileSync(tmpFile, "content");
  try {
    const reg = ra2({ sourceFile: tmpFile, assetType: "sound-effect", submittedBy: "test" });
    const result = sqs2(reg.asset.id, "passed", "qa-reviewer", { notes: "Audio quality good" });
    assert.ok(result.ok);
    assert.equal(result.asset.qcStatus, "passed");
    assert.equal(result.asset.qcCheckedBy, "qa-reviewer");
    assert.ok(result.asset.qcCheckedAt);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

test("getVersionHistory returns versions", () => {
  const tmpFile = path.join(os.tmpdir(), `test-version-${Date.now()}.png`);
  fs.writeFileSync(tmpFile, "v1-content");
  try {
    const reg = ra2({ sourceFile: tmpFile, assetType: "template", submittedBy: "test" });
    const history = gvh2(reg.asset.id);
    assert.ok(history.ok);
    assert.equal(history.versionHistory.length, 1);
    assert.equal(history.versionHistory[0].versionNumber, 1);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

test("createNewVersion adds version without overwriting", () => {
  const tmpFile1 = path.join(os.tmpdir(), `test-v1-${Date.now()}.png`);
  const tmpFile2 = path.join(os.tmpdir(), `test-v2-${Date.now()}.png`);
  fs.writeFileSync(tmpFile1, "version-1");
  fs.writeFileSync(tmpFile2, "version-2-content");
  try {
    const reg = ra2({ sourceFile: tmpFile1, assetType: "animation", submittedBy: "test" });
    assert.ok(reg.ok);
    assert.equal(reg.asset.currentVersionNumber, 1);
    assert.equal(reg.asset.versionHistory.length, 1);

    const v2 = cnv2(reg.asset.id, {
      sourceFile: tmpFile2,
      submittedBy: "test",
      changeNote: "Updated animation",
    });
    assert.ok(v2.ok);
    assert.equal(v2.version.versionNumber, 2);
    assert.equal(v2.asset.currentVersionNumber, 2);
    assert.equal(v2.asset.versionHistory.length, 2);

    // Original version file should still exist
    assert.ok(fs.existsSync(reg.asset.versionHistory[0].storagePath));
    // New version file should exist
    assert.ok(fs.existsSync(v2.version.storagePath));
    // They should be different files
    assert.notStrictEqual(reg.asset.versionHistory[0].storagePath, v2.version.storagePath);
  } finally {
    [tmpFile1, tmpFile2].forEach((f) => {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

test("getVersionPath returns version storage path", () => {
  const tmpFile = path.join(os.tmpdir(), `test-vpath-${Date.now()}.png`);
  fs.writeFileSync(tmpFile, "content");
  try {
    const reg = ra2({ sourceFile: tmpFile, assetType: "brand-asset", submittedBy: "test" });
    const vPath = gvp2(reg.asset.id, reg.asset.currentVersionId);
    assert.ok(vPath.ok);
    assert.equal(vPath.storagePath, reg.asset.storagePath);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

test("deleteAsset soft deletes asset", () => {
  const tmpFile = path.join(os.tmpdir(), `test-delete-${Date.now()}.png`);
  fs.writeFileSync(tmpFile, "content");
  try {
    const reg = ra2({ sourceFile: tmpFile, assetType: "scene-component", submittedBy: "test" });
    const deleted = da2(reg.asset.id, "admin-user", { requireConfirmation: true });
    assert.ok(deleted.ok);
    assert.equal(deleted.asset.deleted, true);
    assert.equal(deleted.asset.deletedBy, "admin-user");
    assert.ok(deleted.asset.deletedAt);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

test("deleteAsset requires authorization", () => {
  const result = da2("some-id", undefined, { requireConfirmation: true });
  assert.ok(!result.ok);
  assert.ok(result.error);
});

test("getStats returns registry stats", () => {
  const stats = gs2();
  assert.ok(stats.totalAssets >= 0);
  assert.ok(stats.byType);
  assert.ok(stats.byApprovalStatus);
  assert.ok(stats.byQCStatus);
  assert.ok(stats.storageDir);
});

test("loadRegistry/saveRegistry round-trip", () => {
  try {
    const registry = { assets: {}, versions: {}, nextId: 1 };
    saveRegistry2(registry);
    // Just verify save doesn't throw
    assert.ok(fs.existsSync(path.join(TEST_DIR, "asset-registry.json")));
  } finally {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
});
