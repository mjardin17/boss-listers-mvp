#!/usr/bin/env node
/**
 * M11 CROSSPOST Distribution Tests
 */

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  prepareForPlatform,
  prepareForMultiplePlatforms,
  submitForPublishing,
  confirmPublishing,
  getAvailablePlatforms,
  getDistributionStatus,
  PLATFORMS,
  PUBLISH_MODES,
} = require("../lib/universal-creative/crosspost-distribution.js");

// Create a temp commercial file for testing
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crosspost-test-"));
const commercialPath = path.join(tmpDir, "test-commercial.mp4");
fs.writeFileSync(commercialPath, Buffer.alloc(1024 * 100), "utf8"); // 100KB dummy

test("prepareForPlatform returns platform settings", () => {
  const result = prepareForPlatform(commercialPath, {
    platformId: "youtube",
    title: "Test Commercial",
    description: "A test commercial",
  });
  assert.ok(result.ok);
  assert.equal(result.exportSettings.platform, "youtube");
  assert.equal(result.exportSettings.platformName, "YouTube");
  assert.equal(result.exportSettings.aspectRatio, "16:9");
  assert.equal(result.exportSettings.title, "Test Commercial");
  assert.equal(result.exportSettings.publishMode, "preview");
  assert.equal(result.exportSettings.autoPublish, false);
  assert.equal(result.exportSettings.requiresApproval, false);
});

test("prepareForPlatform rejects unknown platform", () => {
  const result = prepareForPlatform(commercialPath, { platformId: "nonexistent" });
  assert.ok(!result.ok);
  assert.equal(result.error, "Unknown platform: nonexistent");
});

test("prepareForPlatform rejects missing file", () => {
  const result = prepareForPlatform("/nonexistent/path.mp4", { platformId: "youtube" });
  assert.ok(!result.ok);
});

test("prepareForMultiplePlatforms prepares all platforms", () => {
  const result = prepareForMultiplePlatforms(commercialPath, {
    platforms: ["youtube", "instagram", "facebook", "tiktok"],
    title: "Multi-platform Test",
  });
  assert.ok(result.ok);
  assert.equal(result.totalPlatforms, 4);
  assert.equal(result.preparations.length, 4);
  assert.equal(result.failed.length, 0);
});

test("prepareForMultiplePlatforms handles unknown platforms", () => {
  const result = prepareForMultiplePlatforms(commercialPath, {
    platforms: ["youtube", "nonexistent"],
  });
  assert.ok(!result.ok);
  assert.equal(result.failed.length, 1);
});

test("submitForPublishing requires user approval", async () => {
  const result = await submitForPublishing("prep-1", {
    userApproved: false,
    authorizedConnections: [{ platform: "instagram" }],
  });
  assert.ok(!result.ok);
  assert.equal(result.error, "Publishing requires explicit user approval");
  assert.equal(result.requiresApproval, true);
});

test("submitForPublishing requires authorized connections", async () => {
  const result = await submitForPublishing("prep-1", {
    userApproved: true,
    authorizedConnections: [],
  });
  assert.ok(!result.ok);
  assert.equal(result.error, "Publishing requires at least one authorized connection");
});

test("submitForPublishing succeeds with approval + connections", async () => {
  const result = await submitForPublishing("prep-1", {
    userApproved: true,
    authorizedConnections: [{ platform: "instagram" }],
  });
  assert.ok(result.ok);
  assert.equal(result.requiresConfirmation, true);
});

test("confirmPublishing requires user confirmation", async () => {
  const result = await confirmPublishing("conf-1", {
    userConfirmed: false,
    platform: "instagram",
  });
  assert.ok(!result.ok);
  assert.equal(result.error, "Publishing confirmation not provided by user");
});

test("confirmPublishing succeeds with confirmation", async () => {
  const result = await confirmPublishing("conf-1", {
    userConfirmed: true,
    platform: "instagram",
  });
  assert.ok(result.ok);
  assert.equal(result.published, true);
  assert.equal(result.platform, "instagram");
});

test("getAvailablePlatforms returns all platforms", () => {
  const platforms = getAvailablePlatforms();
  assert.equal(platforms.length, PLATFORMS.length);
  assert.ok(platforms.find((p) => p.id === "youtube"));
  assert.ok(platforms.find((p) => p.id === "tiktok"));
  assert.ok(platforms.find((p) => p.id === "instagram"));
  assert.ok(platforms.find((p) => p.id === "facebook"));
});

test("getDistributionStatus returns correct status", () => {
  const status = getDistributionStatus();
  assert.equal(status.requiresApproval, true);
  assert.equal(status.autoPublishDisabled, true);
  assert.equal(status.confirmationRequired, true);
});

// Cleanup (temp dir in /tmp, cleaned by OS)
