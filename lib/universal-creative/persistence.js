/**
 * Universal Creative Production Connector — JSON persistence
 *
 * Optional file-based persistence for the connector registry. Registrations
 * and verification history are saved to a JSON file (default:
 * `.universal-creative/registry.json`, gitignored) so the CLI and API routes
 * share state across process restarts. The in-memory registry remains the
 * source of truth while a process is running; this layer only loads/saves.
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_DIR = path.join(process.cwd(), ".universal-creative");
const DEFAULT_FILE = path.join(DEFAULT_DIR, "registry.json");

function ensureDir(dir = DEFAULT_DIR) {
  fs.mkdirSync(dir, { recursive: true });
}

function saveRegistry(registry, file = DEFAULT_FILE) {
  ensureDir(path.dirname(file));
  const entries = registry.toJSON();
  fs.writeFileSync(file, JSON.stringify(entries, null, 2), "utf8");
}

function loadRegistry(file = DEFAULT_FILE) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries)) throw new Error("registry file is not an array");
    return require("./registry.js").ConnectorRegistry.fromJSON(entries, "persisted");
  } catch {
    // Absent or corrupt file → start empty (never crash the app on a bad registry file).
    return new (require("./registry.js").ConnectorRegistry)("persisted");
  }
}

module.exports = {
  DEFAULT_DIR,
  DEFAULT_FILE,
  ensureDir,
  saveRegistry,
  loadRegistry,
};
