/**
 * Universal Creative Production Connector — Connector Registry
 *
 * Single source of truth for every creative application integrated into the
 * ecosystem. Holds capability manifests, connection status, permissions,
 * resource requirements, supported formats, and verification history.
 *
 * Rules (from directive + AGENTS.md):
 *  - No app is assumed available: status starts `unknown`/`unverified`.
 *  - No MCP claims unless tested: MCP connectors register as `unverified`.
 *  - Verification history is append-only; never rewritten.
 *  - Registry is a plain in-memory store with optional JSON persistence so the
 *    CLI and API routes share the same state within a process.
 */

const { ConnectorConfigSchema, isAvailable, isVerified, nowISO } = require("./manifest.js");
const { createConnector } = require("./connector.js");

const DEFAULT_SOURCE = "universal-connector";

class ConnectorRegistry {
  constructor(source = DEFAULT_SOURCE) {
    this.entries = new Map();
    this.connectors = new Map();
    this.source = source;
  }

  /* ------------------------------------------------- registration */

  register(config, source) {
    const validated = ConnectorConfigSchema.parse(config);
    const now = nowISO();
    const existing = this.entries.get(validated.id);
    const entry = {
      config: validated,
      added_at: existing ? existing.added_at : now,
      updated_at: now,
      source: source || this.source,
    };
    this.entries.set(validated.id, entry);
    this.connectors.set(validated.id, createConnector(validated));
    return entry;
  }

  registerMany(configs, source) {
    return configs.map((c) => this.register(c, source));
  }

  unregister(connectorId) {
    const had = this.entries.has(connectorId);
    this.entries.delete(connectorId);
    this.connectors.delete(connectorId);
    return had;
  }

  /* ------------------------------------------------- queries */

  getConfig(connectorId) {
    return this.entries.get(connectorId) && this.entries.get(connectorId).config;
  }

  getConnector(connectorId) {
    return this.connectors.get(connectorId);
  }

  getEntry(connectorId) {
    return this.entries.get(connectorId);
  }

  list(filter) {
    let result = Array.from(this.entries.values()).map((e) => e.config);
    if (filter) {
      if (filter.status)
        result = result.filter((c) => c.status === filter.status);
      if (filter.method)
        result = result.filter((c) => c.method === filter.method);
      if (filter.category)
        result = result.filter((c) => c.category === filter.category);
    }
    return result;
  }

  getProductionReady() {
    return this.list({ status: "available" }).filter((c) => isVerified(c));
  }

  getUnverified() {
    return this.list().filter((c) => !isVerified(c));
  }

  summary() {
    const all = this.list();
    const byStatus = {};
    const byMethod = {};
    const byCategory = {};
    for (const c of all) {
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
      byMethod[c.method] = (byMethod[c.method] || 0) + 1;
      byCategory[c.category] = (byCategory[c.category] || 0) + 1;
    }
    return {
      total: all.length,
      by_status: byStatus,
      by_method: byMethod,
      by_category: byCategory,
      unverified: this.getUnverified().map((c) => c.id),
      available: this.getProductionReady().map((c) => c.id),
    };
  }

  /* ------------------------------------------------- probing / status */

  async probe(connectorId) {
    const connector = this.connectors.get(connectorId);
    const entry = this.entries.get(connectorId);
    const config = entry && entry.config;
    if (!connector || !config) {
      throw new Error(`connector not registered: ${connectorId}`);
    }

    const result = await connector.probe();

    entry.config.status = result.status;
    entry.config.last_status_at = new Date().toISOString();
    entry.config.verification_history = entry.config.verification_history || [];
    entry.config.verification_history.push(result.verification);
    if (result.status === "available") {
      entry.config.last_verified_at = new Date().toISOString();
    }
    entry.updated_at = new Date().toISOString();
    this.entries.set(connectorId, entry);
    this.connectors.set(connectorId, connector);

    return result;
  }

  async probeAll() {
    const ids = Array.from(this.entries.keys());
    const results = [];
    for (const id of ids) {
      try {
        results.push(await this.probe(id));
      } catch (err) {
        results.push({
          connector_id: id,
          status: "blocked",
          method:
            (this.entries.get(id) && this.entries.get(id).config.method) ||
            "unknown",
          probed_at: new Date().toISOString(),
          latency_ms: 0,
          error: err instanceof Error ? err.message : String(err),
          verification: makeVerificationRecordReg(
            "smoke",
            "error",
            "universal-connector probe-all",
            err instanceof Error ? err.message : String(err)
          ),
        });
      }
    }
    return results;
  }

  /* ------------------------------------------------- command execution */

  async run(connectorId, commandId, args, options = {}) {
    const connector = this.connectors.get(connectorId);
    const entry = this.entries.get(connectorId);
    const config = entry && entry.config;
    if (!connector || !config) {
      throw new Error(`connector not registered: ${connectorId}`);
    }
    if (!isAvailable(config) && !isVerified(config)) {
      throw new Error(
        `connector ${connectorId} is not available/verified (status ${config.status}); probe and approve before running`
      );
    }
    return connector.run(commandId, args, options);
  }

  /* ------------------------------------------------- persistence */

  toJSON() {
    return Array.from(this.entries.values());
  }

  static fromJSON(entries, source = DEFAULT_SOURCE) {
    const registry = new ConnectorRegistry(source);
    for (const entry of entries) {
      registry.register(entry.config, entry.source);
      const stored = registry.entries.get(entry.config.id);
      if (stored) {
        stored.added_at = entry.added_at;
        stored.updated_at = entry.updated_at;
      }
    }
    return registry;
  }
}

function makeVerificationRecordReg(level, status, checkedBy, notes, evidence) {
  return {
    level,
    status,
    checked_at: new Date().toISOString(),
    checked_by: checkedBy,
    notes,
    evidence,
  };
}

const defaultRegistry = new ConnectorRegistry("universal-connector");

module.exports = {
  ConnectorRegistry,
  defaultRegistry,
  DEFAULT_SOURCE,
};
