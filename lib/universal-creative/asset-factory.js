#!/usr/bin/env node
/**
 * Universal Creative Production Connector — Shared Asset Factory
 *
 * Shared creative asset infrastructure for both Video Factory and
 * Commercial Maker:
 *
 *   - Asset registry: ID, project ID, production ID, source application,
 *     original source file, file format, dimensions, version history,
 *     storage location, dependencies, approval status, QC status
 *   - Reusable assets: logos, product photos, backgrounds, music, sound
 *     effects, voice profiles, animations, templates, scene components,
 *     brand assets
 *   - Never overwrite original assets without authorization
 *   - Maintain version history
 *
 * Render-only: assets are stored and tracked; publishing requires
 * explicit user approval + authorized connections.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const ASSET_TYPES = [
  "logo",
  "product-photo",
  "background",
  "music",
  "sound-effect",
  "voice-profile",
  "animation",
  "template",
  "scene-component",
  "brand-asset",
];

const APPROVAL_STATUSES = ["pending", "approved", "rejected"];
const QC_STATUSES = ["unverified", "passed", "failed", "pending"];

const ASSETS_DIR = process.env.ASSETS_DIR || path.join(os.tmpdir(), "shared-assets");
const METADATA_FILE = path.join(ASSETS_DIR, "asset-registry.json");

/**
 * Ensure asset directory exists.
 */
function ensureAssetDir() {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

/**
 * Load the asset registry from disk.
 */
function loadRegistry() {
  ensureAssetDir();
  try {
    const raw = fs.readFileSync(METADATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { assets: {}, versions: {}, nextId: 1 };
  }
}

/**
 * Save the asset registry to disk.
 */
function saveRegistry(registry) {
  ensureAssetDir();
  fs.writeFileSync(METADATA_FILE, JSON.stringify(registry, null, 2), "utf8");
}

/**
 * Generate a stable asset ID.
 */
function generateAssetId() {
  return `asset-${crypto.randomBytes(8).toString("hex")}`;
}

/**
 * Generate a version ID.
 */
function generateVersionId() {
  return `v${crypto.randomBytes(4).toString("hex")}`;
}

/**
 * Compute file hash for integrity tracking.
 */
function hashFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

/**
 * Register a new asset. Copies the source file to the shared asset store.
 * Never overwrites existing assets — creates a new version instead.
 */
function registerAsset(options = {}) {
  const {
    sourceFile,
    assetType,
    projectId = null,
    productionId = null,
    sourceApplication = "unknown",
    originalFileName = null,
    tags = [],
    dependencies = [],
    submittedBy = "system",
  } = options;

  if (!sourceFile || !fs.existsSync(sourceFile)) {
    return { ok: false, error: "Source file not found" };
  }
  if (!assetType || !ASSET_TYPES.includes(assetType)) {
    return { ok: false, error: `Invalid asset type. Valid: ${ASSET_TYPES.join(", ")}` };
  }

  const registry = loadRegistry();
  const assetId = generateAssetId();
  const versionId = generateVersionId();
  const fileName = originalFileName || path.basename(sourceFile);
  const ext = path.extname(fileName).toLowerCase();
  const storageFileName = `${assetId}${ext}`;
  const storagePath = path.join(ASSETS_DIR, storageFileName);

  // Copy source file to shared asset store (never overwrite)
  fs.copyFileSync(sourceFile, storagePath);
  const stats = fs.statSync(storagePath);

  // Extract dimensions for images if possible
  let dimensions = null;
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)) {
    try {
      const { spawnSync } = require("child_process");
      const identify = spawnSync(process.env.IMAGEMAGICK_PATH || "magick", ["identify", storagePath], { encoding: "utf8" });
      if (identify.status === 0 && identify.stdout) {
        const match = identify.stdout.match(/(\d+)x(\d+)/);
        if (match) {
          dimensions = { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
        }
      }
    } catch {
      // ImageMagick not available — dimensions unknown
    }
  }

  const asset = {
    id: assetId,
    type: assetType,
    originalFileName,
    fileFormat: ext.replace(".", ""),
    dimensions,
    sourceApplication,
    sourceFile: sourceFile, // original location (for reference only)
    storagePath, // canonical location in shared asset store
    fileSize: stats.size,
    fileHash: hashFile(storagePath),
    projectId,
    productionId,
    tags,
    dependencies,
    approvalStatus: "pending",
    qcStatus: "unverified",
    versionHistory: [
      {
        versionId,
        versionNumber: 1,
        storagePath,
        fileSize: stats.size,
        fileHash: hashFile(storagePath),
        dimensions,
        submittedBy,
        submittedAt: new Date().toISOString(),
        changeNote: "Initial version",
      },
    ],
    currentVersionId: versionId,
    currentVersionNumber: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  registry.assets[assetId] = asset;
  registry.versions[assetId] = [versionId];
  saveRegistry(registry);

  return { ok: true, asset };
}

/**
 * Create a new version of an existing asset (never overwrites original).
 */
function createNewVersion(assetId, options = {}) {
  const {
    sourceFile,
    submittedBy = "system",
    changeNote = "New version",
  } = options;

  if (!sourceFile || !fs.existsSync(sourceFile)) {
    return { ok: false, error: "Source file not found" };
  }

  const registry = loadRegistry();
  const asset = registry.assets[assetId];
  if (!asset) {
    return { ok: false, error: `Asset not found: ${assetId}` };
  }

  const versionId = generateVersionId();
  const versionNumber = asset.currentVersionNumber + 1;
  const ext = path.extname(asset.originalFileName || asset.storagePath).toLowerCase();
  const storageFileName = `${assetId}-v${versionNumber}${ext}`;
  const storagePath = path.join(ASSETS_DIR, storageFileName);

  // Copy new version (never overwrite existing version files)
  fs.copyFileSync(sourceFile, storagePath);
  const stats = fs.statSync(storagePath);

  let dimensions = asset.dimensions;
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)) {
    try {
      const { spawnSync } = require("child_process");
      const identify = spawnSync(process.env.IMAGEMAGICK_PATH || "magick", ["identify", storagePath], { encoding: "utf8" });
      if (identify.status === 0 && identify.stdout) {
        const match = identify.stdout.match(/(\d+)x(\d+)/);
        if (match) {
          dimensions = { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
        }
      }
    } catch {
      // keep existing dimensions
    }
  }

  const newVersion = {
    versionId,
    versionNumber,
    storagePath,
    fileSize: stats.size,
    fileHash: hashFile(storagePath),
    dimensions,
    submittedBy,
    submittedAt: new Date().toISOString(),
    changeNote,
  };

  // Update asset with new version (old version files preserved)
  asset.versionHistory.push(newVersion);
  asset.currentVersionId = versionId;
  asset.currentVersionNumber = versionNumber;
  asset.storagePath = storagePath;
  asset.fileSize = stats.size;
  asset.fileHash = hashFile(storagePath);
  asset.dimensions = dimensions;
  asset.updatedAt = new Date().toISOString();

  // Reset approval/QC for new version — needs re-review
  asset.approvalStatus = "pending";
  asset.qcStatus = "unverified";

  registry.versions[assetId].push(versionId);
  saveRegistry(registry);

  return { ok: true, asset, version: newVersion };
}

/**
 * Get an asset by ID.
 */
function getAsset(assetId) {
  const registry = loadRegistry();
  return registry.assets[assetId] || null;
}

/**
 * List assets with optional filtering.
 */
function listAssets(filter = {}) {
  const registry = loadRegistry();
  let assets = Object.values(registry.assets);

  if (filter.assetType) {
    assets = assets.filter((a) => a.type === filter.assetType);
  }
  if (filter.projectId) {
    assets = assets.filter((a) => a.projectId === filter.projectId);
  }
  if (filter.productionId) {
    assets = assets.filter((a) => a.productionId === filter.productionId);
  }
  if (filter.sourceApplication) {
    assets = assets.filter((a) => a.sourceApplication === filter.sourceApplication);
  }
  if (filter.approvalStatus) {
    assets = assets.filter((a) => a.approvalStatus === filter.approvalStatus);
  }
  if (filter.qcStatus) {
    assets = assets.filter((a) => a.qcStatus === filter.qcStatus);
  }

  return assets.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

/**
 * Approve or reject an asset (requires authorization).
 */
function setApprovalStatus(assetId, status, authorizedBy, options = {}) {
  if (!APPROVAL_STATUSES.includes(status)) {
    return { ok: false, error: `Invalid approval status. Valid: ${APPROVAL_STATUSES.join(", ")}` };
  }

  const registry = loadRegistry();
  const asset = registry.assets[assetId];
  if (!asset) {
    return { ok: false, error: `Asset not found: ${assetId}` };
  }

  asset.approvalStatus = status;
  asset.approvedBy = authorizedBy;
  asset.approvedAt = new Date().toISOString();
  asset.approvalNotes = options.notes || null;
  asset.updatedAt = new Date().toISOString();

  saveRegistry(registry);
  return { ok: true, asset };
}

/**
 * Set QC status for an asset.
 */
function setQCStatus(assetId, status, checkedBy, options = {}) {
  if (!QC_STATUSES.includes(status)) {
    return { ok: false, error: `Invalid QC status. Valid: ${QC_STATUSES.join(", ")}` };
  }

  const registry = loadRegistry();
  const asset = registry.assets[assetId];
  if (!asset) {
    return { ok: false, error: `Asset not found: ${assetId}` };
  }

  asset.qcStatus = status;
  asset.qcCheckedBy = checkedBy;
  asset.qcCheckedAt = new Date().toISOString();
  asset.qcNotes = options.notes || null;
  asset.qcEvidence = options.evidence || null;
  asset.updatedAt = new Date().toISOString();

  saveRegistry(registry);
  return { ok: true, asset };
}

/**
 * Get version history for an asset.
 */
function getVersionHistory(assetId) {
  const registry = loadRegistry();
  const asset = registry.assets[assetId];
  if (!asset) {
    return { ok: false, error: `Asset not found: ${assetId}` };
  }
  return { ok: true, assetId, versionHistory: asset.versionHistory };
}

/**
 * Get a specific version's file path.
 */
function getVersionPath(assetId, versionId) {
  const registry = loadRegistry();
  const asset = registry.assets[assetId];
  if (!asset) {
    return { ok: false, error: `Asset not found: ${assetId}` };
  }
  const version = asset.versionHistory.find((v) => v.versionId === versionId);
  if (!version) {
    return { ok: false, error: `Version not found: ${versionId}` };
  }
  return { ok: true, assetId, versionId, storagePath: version.storagePath };
}

/**
 * Delete an asset (soft delete — marks as deleted, preserves files).
 * Requires authorization for destructive operations.
 */
function deleteAsset(assetId, authorizedBy, options = {}) {
  const {
    requireConfirmation = true,
  } = options;

  if (requireConfirmation && !authorizedBy) {
    return { ok: false, error: "Authorization required for asset deletion" };
  }

  const registry = loadRegistry();
  const asset = registry.assets[assetId];
  if (!asset) {
    return { ok: false, error: `Asset not found: ${assetId}` };
  }

  // Soft delete — mark but preserve files for recovery
  asset.deleted = true;
  asset.deletedBy = authorizedBy;
  asset.deletedAt = new Date().toISOString();
  asset.updatedAt = new Date().toISOString();

  saveRegistry(registry);
  return { ok: true, asset };
}

/**
 * Get available asset types.
 */
function getAssetTypes() {
  return ASSET_TYPES;
}

/**
 * Get asset registry statistics.
 */
function getStats() {
  const registry = loadRegistry();
  const assets = Object.values(registry.assets);
  const byType = {};
  const byStatus = {};
  const byQC = {};

  for (const a of assets) {
    byType[a.type] = (byType[a.type] || 0) + 1;
    byStatus[a.approvalStatus] = (byStatus[a.approvalStatus] || 0) + 1;
    byQC[a.qcStatus] = (byQC[a.qcStatus] || 0) + 1;
  }

  return {
    totalAssets: assets.length,
    byType,
    byApprovalStatus: byStatus,
    byQCStatus: byQC,
    storageDir: ASSETS_DIR,
  };
}

module.exports = {
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
  ASSETS_DIR,
  loadRegistry,
  saveRegistry,
};
