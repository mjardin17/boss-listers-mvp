/**
 * Universal Creative Production Connector — Connector Implementations
 *
 * Concrete connector types for each supported integration method:
 *   - LocalCLIConnector   (CLI binaries, e.g. FFmpeg, ImageMagick)
 *   - PythonConnector     (local Python scripts, e.g. RMBG-1.4 matting)
 *   - NativeAPIConnector  (HTTP REST, e.g. a local app API)
 *   - MCPConnector        (MCP stdio / HTTP — unverified until tested)
 *   - CloudConnector      (placeholder — no cloud provider wired yet)
 *   - PluginConnector     (placeholder — no plugin host wired yet)
 *   - DesktopConnector    (macOS AppleScript / Windows automation — placeholder)
 *
 * Every connector exposes: config, probe(), run(commandId, args), and
 * summarize(). Status is set by the registry after probing — connectors
 * never self-declare availability.
 */

const { probeConnector, runCommand } = require("./executor.js");

function makeVerificationRecord(level, status, checkedBy, notes, evidence) {
  return {
    level,
    status,
    checked_at: new Date().toISOString(),
    checked_by: checkedBy,
    notes,
    evidence,
  };
}

class BaseConnector {
  constructor() {
    this._config = null;
  }

  get config() {
    return this._config;
  }

  set config(value) {
    this._config = value;
  }

  async probe(options = {}) {
    const result = await probeConnector(this.config, {
      max_output_bytes: options.max_output_bytes,
    });
    return {
      connector_id: this.config.id,
      status: result.status,
      method: this.config.method,
      probed_at: new Date().toISOString(),
      latency_ms: result.latency_ms,
      output: result.output,
      error: result.error,
      verification: makeVerificationRecord(
        "smoke",
        result.status === "available" ? "pass" : "fail",
        "universal-connector probe",
        result.error,
        result.output ? { output: result.output } : undefined
      ),
    };
  }

  run() {
    throw new Error("subclass must implement run");
  }

  summarize() {
    return {
      id: this.config.id,
      name: this.config.name,
      status: this.config.status,
      method: this.config.method,
      verified: (this.config.verification_history || []).some(
        (r) => r.status === "pass"
      ),
      capabilities: this.config.capabilities || [],
    };
  }

  findCommand(commandId) {
    const cmd = (this.config.commands || []).find((c) => c.id === commandId);
    if (!cmd) {
      throw new Error(
        `command ${commandId} not found on connector ${this.config.id}`
      );
    }
    return cmd;
  }
}

class LocalCLIConnector extends BaseConnector {
  constructor(config) {
    super();
    if (config.method !== "cli" && config.method !== "native_api") {
      throw new Error(
        `LocalCLIConnector expects method cli/native_api, got ${config.method}`
      );
    }
    this._config = config;
  }

  async run(commandId, args = {}, options = {}) {
    const cmd = this.findCommand(commandId);
    const flattenedArgs = [];
    for (const [key, value] of Object.entries(args || {})) {
      flattenedArgs.push(`--${key}`);
      if (value !== undefined && value !== null && value !== "") {
        flattenedArgs.push(String(value));
      }
    }
    const runCmd = { ...cmd, args: [...cmd.args, ...flattenedArgs] };
    return runCommand(this.config, runCmd, {
      timeout_seconds: options.timeout_seconds,
      max_output_bytes: options.max_output_bytes,
    });
  }
}

class PythonConnector extends BaseConnector {
  constructor(config) {
    super();
    this._config = config;
  }

  async run(commandId, args = {}, options = {}) {
    const cmd = this.findCommand(commandId);
    const scriptArg =
      args.script || args.script_path || (cmd.args && cmd.args[0]) || "";
    const restArgs = args.args || [];
    return runCommand(
      this.config,
      { ...cmd, args: [String(scriptArg), ...restArgs] },
      {
        timeout_seconds: options.timeout_seconds,
        max_output_bytes: options.max_output_bytes,
        extra_env: { PYTHON_BIN: "python3", ...(cmd.env || {}) },
      }
    );
  }
}

class NativeAPIConnector extends BaseConnector {
  constructor(config) {
    super();
    this._config = config;
  }

  async probe(options = {}) {
    const baseUrl = this.config.base_url;
    if (!baseUrl) {
      return {
        connector_id: this.config.id,
        status: "unavailable",
        method: "native_api",
        probed_at: new Date().toISOString(),
        latency_ms: 0,
        error: "no base_url configured",
        verification: makeVerificationRecord(
          "smoke",
          "fail",
          "universal-connector probe",
          "no base_url"
        ),
      };
    }
    const url = new URL("/health", baseUrl).toString();
    const started = Date.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const latency = Date.now() - started;
      const body = await res.text().catch(() => "");
      return {
        connector_id: this.config.id,
        status: res.ok ? "available" : "degraded",
        method: "native_api",
        probed_at: new Date().toISOString(),
        latency_ms: latency,
        output: body.slice(0, 2000) || undefined,
        error: res.ok ? undefined : `HTTP ${res.status}`,
        verification: makeVerificationRecord(
          "smoke",
          res.ok ? "pass" : "fail",
          "universal-connector probe",
          res.ok ? undefined : `HTTP ${res.status}`,
          { status: res.status, body: body.slice(0, 500) }
        ),
      };
    } catch (err) {
      return {
        connector_id: this.config.id,
        status: "unavailable",
        method: "native_api",
        probed_at: new Date().toISOString(),
        latency_ms: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
        verification: makeVerificationRecord(
          "smoke",
          "fail",
          "universal-connector probe",
          err instanceof Error ? err.message : String(err)
        ),
      };
    }
  }

  async run() {
    throw new Error(
      `NativeAPIConnector.run not implemented for ${this.config.id} (use probe only)`
    );
  }
}

class MCPConnector extends BaseConnector {
  constructor(config) {
    super();
    this._config = config;
  }

  async probe(options = {}) {
    return {
      connector_id: this.config.id,
      status: "unverified",
      method: "mcp",
      probed_at: new Date().toISOString(),
      latency_ms: 0,
      error: "MCP integration not yet tested — do not use in production",
      verification: makeVerificationRecord(
        "smoke",
        "skip",
        "universal-connector register",
        "MCP not tested; per directive, no untested MCP claims"
      ),
    };
  }

  async run() {
    throw new Error(
      `MCP connector ${this.config.id} is unverified and cannot run commands`
    );
  }
}

class CloudConnector extends BaseConnector {
  constructor(config) {
    super();
    this._config = config;
  }

  async probe() {
    return {
      connector_id: this.config.id,
      status: "unavailable",
      method: "cloud_execution",
      probed_at: new Date().toISOString(),
      latency_ms: 0,
      error: "no cloud provider configured",
      verification: makeVerificationRecord(
        "smoke",
        "skip",
        "universal-connector register",
        "no cloud provider"
      ),
    };
  }

  async run() {
    throw new Error(`cloud connector ${this.config.id} not wired`);
  }
}

class PluginConnector extends BaseConnector {
  constructor(config) {
    super();
    this._config = config;
  }

  async probe() {
    return {
      connector_id: this.config.id,
      status: "unavailable",
      method: "plugin",
      probed_at: new Date().toISOString(),
      latency_ms: 0,
      error: "no plugin host configured",
      verification: makeVerificationRecord(
        "smoke",
        "skip",
        "universal-connector register",
        "no plugin host"
      ),
    };
  }

  async run() {
    throw new Error(`plugin connector ${this.config.id} not wired`);
  }
}

class DesktopConnector extends BaseConnector {
  constructor(config) {
    super();
    this._config = config;
  }

  async probe() {
    return {
      connector_id: this.config.id,
      status: "unavailable",
      method: "desktop_automation",
      probed_at: new Date().toISOString(),
      latency_ms: 0,
      error: "no desktop automation bridge configured",
      verification: makeVerificationRecord(
        "smoke",
        "skip",
        "universal-connector register",
        "no desktop bridge"
      ),
    };
  }

  async run() {
    throw new Error(`desktop connector ${this.config.id} not wired`);
  }
}

function createConnector(config) {
  switch (config.method) {
    case "mcp":
      return new MCPConnector(config);
    case "native_api":
      return new NativeAPIConnector(config);
    case "python_script":
      return new PythonConnector(config);
    case "cli":
      return new LocalCLIConnector(config);
    case "plugin":
      return new PluginConnector(config);
    case "desktop_automation":
      return new DesktopConnector(config);
    case "remote_execution":
    case "cloud_execution":
      return new CloudConnector(config);
    default:
      throw new Error(`unsupported integration method: ${config.method}`);
  }
}

module.exports = {
  Connector: BaseConnector,
  LocalCLIConnector,
  PythonConnector,
  NativeAPIConnector,
  MCPConnector,
  CloudConnector,
  PluginConnector,
  DesktopConnector,
  createConnector,
};
