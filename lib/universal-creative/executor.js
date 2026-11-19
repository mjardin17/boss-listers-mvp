/**
 * Universal Creative Production Connector — Process / Command Executor
 *
 * Runs connector commands (CLI binaries, Python scripts, macOS desktop
 * automation) with timeouts, retries, working directories, env vars, and
 * artifact capture. Never runs a command whose connector is not registered
 * and approved — callers must check registry status before executing.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

class ExecutionError extends Error {
  constructor(result, message) {
    super(message ?? `command ${result.command_id} exited ${result.exit_code}`);
    this.name = "ExecutionError";
    this.result = result;
  }
}

function resolveCommand(config, command) {
  const executable = command.executable;
  const args = command.args ?? [];
  const cwd = command.cwd || config.working_directory || process.cwd();
  const env = { ...process.env, ...(command.env || {}) };
  return { executable, args, cwd, env };
}

function runCommand(config, command, options = {}) {
  const { executable, args, cwd, env } = resolveCommand(config, command);
  const timeoutSeconds = options.timeout_seconds ?? command.timeout_seconds ?? 300;
  const maxBytes = options.max_output_bytes ?? 8 * 1024 * 1024;

  return new Promise((resolve, reject) => {
    let child;
    let killedByTimeout = false;
    const started = Date.now();

    try {
      child = spawn(executable, args, { cwd, env, windowsHide: true });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(`failed to spawn ${executable}: ${String(err)}`));
      return;
    }

    let stdoutData = "";
    let stderrData = "";
    let stdoutTruncated = false;
    let stderrTruncated = false;

    child.stdout.on("data", (chunk) => {
      stdoutData += chunk.toString("utf8");
      if (stdoutData.length > maxBytes) {
        stdoutData = stdoutData.slice(0, maxBytes);
        stdoutTruncated = true;
        child.stdout.removeAllListeners("data");
        child.stdout.pause();
      }
    });
    child.stderr.on("data", (chunk) => {
      stderrData += chunk.toString("utf8");
      if (stderrData.length > maxBytes) {
        stderrData = stderrData.slice(0, maxBytes);
        stderrTruncated = true;
        child.stderr.removeAllListeners("data");
        child.stderr.pause();
      }
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code, signal) => {
      const durationMs = Date.now() - started;
      const exitCode = typeof code === "number" ? code : -1;
      const artifacts = [];
      for (const line of stdoutData.split("\n")) {
        const trimmed = line.trim();
        if (
          trimmed &&
          (trimmed.endsWith(".mp4") ||
            trimmed.endsWith(".png") ||
            trimmed.endsWith(".jpg") ||
            trimmed.endsWith(".json"))
        ) {
          artifacts.push(trimmed);
        }
      }

      const result = {
        connector_id: config.id,
        command_id: command.id,
        exit_code: exitCode,
        stdout: stdoutData,
        stderr: stderrData,
        duration_ms: durationMs,
        artifacts,
        ran_at: new Date().toISOString(),
      };

      if (signal === "SIGTERM" || killedByTimeout || exitCode !== 0) {
        const message = killedByTimeout
          ? `command ${command.id} timed out after ${timeoutSeconds}s`
          : signal
            ? `command ${command.id} killed by signal ${signal}`
            : `command ${command.id} exited ${exitCode}`;
        reject(new ExecutionError(result, message));
        return;
      }
      resolve(result);
    });

    if (timeoutSeconds > 0) {
      const timer = setTimeout(() => {
        killedByTimeout = true;
        try {
          if (child && !child.killed) child.kill("SIGTERM");
        } catch {}
      }, timeoutSeconds * 1000);
      timer.unref?.();
    }
  });
}

async function runPythonScript(config, scriptPath, args = [], options = {}) {
  const python = (options.extra_env && options.extra_env.PYTHON_BIN) || "python3";
  return runCommand(
    config,
    {
      id: `python:${path.basename(scriptPath)}`,
      name: `Python: ${path.basename(scriptPath)}`,
      executable: python,
      args: [scriptPath, ...args],
      cwd:
        (options.extra_env && options.extra_env.PYTHON_CWD) ||
        config.working_directory ||
        process.cwd(),
      env: options.extra_env,
      timeout_seconds: options.timeout_seconds,
    },
    {
      timeout_seconds: options.timeout_seconds,
      max_output_bytes: options.max_output_bytes,
    }
  );
}

async function probeConnector(config, options = {}) {
  const started = Date.now();
  const command =
    (config.commands && config.commands[0]) ||
    (config.executable_path
      ? {
          id: "probe",
          name: "probe",
          executable: config.executable_path,
          args: ["--version"],
          timeout_seconds: 10,
        }
      : undefined);

  if (!command) {
    return {
      status: "unavailable",
      latency_ms: Date.now() - started,
      error: "no command or executable_path configured",
    };
  }

  try {
    const result = await runCommand(config, command, {
      timeout_seconds: command.timeout_seconds,
      max_output_bytes: options.max_output_bytes,
    });
    return {
      status: "available",
      latency_ms: Date.now() - started,
      output: result.stdout.trim() || undefined,
    };
  } catch (err) {
    if (err instanceof ExecutionError) {
      const availability = err.result.exit_code === 127 ? "unavailable" : "degraded";
      return {
        status: availability,
        latency_ms: Date.now() - started,
        output: err.result.stdout.trim() || undefined,
        error: err.result.stderr.trim() || err.message,
      };
    }
    return {
      status: "unavailable",
      latency_ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function makeWorkDir(prefix = "ucc-") {
  const dir = path.join(os.tmpdir(), `${prefix}${Date.now()}-${process.pid}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = {
  ExecutionError,
  runCommand,
  runPythonScript,
  probeConnector,
  makeWorkDir,
};
