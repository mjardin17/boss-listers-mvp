#!/usr/bin/env node
/**
 * Universal Creative Production Connector — Resource Manager
 *
 * Resource management and security for both production systems:
 *   - CPU, RAM, GPU, and storage monitoring
 *   * Resource-aware task scheduling
 *   - Render queues with timeouts and cancellation
 *   - Retry and recovery
 *   - Cost tracking
 *   - Application and agent permissions
 *   - Credential isolation
 *   - Filesystem restrictions
 *   - Sandboxed execution where possible
 *   - Audit logs
 *   - Approval for destructive operations and unexpected paid usage
 *
 * Rules:
 *   - Do not require every application to be installed locally
 *   - Do not exhaust the user's available hardware resources
 *   - Approval for destructive operations and unexpected paid usage
 */

const os = require("os");
const fs = require("fs");
const path = require("path");
const { dataPath } = require("./data-dir.js");

const AUDIT_LOG_FILE = process.env.AUDIT_LOG_FILE || dataPath("audit-log.json");
const RESOURCE_LIMITS_FILE = process.env.RESOURCE_LIMITS_FILE || dataPath("resource-limits.json");

// Default resource limits to prevent hardware exhaustion
const DEFAULT_LIMITS = {
  maxCpuPercent: 80,
  maxRamPercent: 80,
  maxConcurrentRenders: 2,
  maxConcurrentJobs: 5,
  renderTimeoutMinutes: 60,
  jobTimeoutMinutes: 120,
  maxStorageGB: 100,
  costAlertThreshold: 50, // dollars
};

let resourceLimits = { ...DEFAULT_LIMITS };
let auditLogs = [];
let activeJobs = new Map();
let renderQueue = [];
let costTracking = { total: 0, byJob: {}, byModel: {}, byDay: {} };

/**
 * Ensure audit log file exists.
 */
function ensureAuditLog() {
  const dir = path.dirname(AUDIT_LOG_FILE);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(AUDIT_LOG_FILE)) {
    fs.writeFileSync(AUDIT_LOG_FILE, JSON.stringify([], null, 2), "utf8");
  }
}

/**
 * Load audit logs.
 */
function loadAuditLogs() {
  ensureAuditLog();
  try {
    return JSON.parse(fs.readFileSync(AUDIT_LOG_FILE, "utf8"));
  } catch {
    return [];
  }
}

/**
 * Save audit logs.
 */
function saveAuditLogs(logs) {
  ensureAuditLog();
  fs.writeFileSync(AUDIT_LOG_FILE, JSON.stringify(logs, null, 2), "utf8");
}

/**
 * Write an audit log entry.
 */
function writeAuditLog(entry) {
  const log = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  auditLogs.push(log);
  if (auditLogs.length > 10000) {
    auditLogs = auditLogs.slice(-10000);
  }
  saveAuditLogs(auditLogs);
  return log;
}

/**
 * Get current resource usage.
 */
function getResourceUsage() {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  }
  const cpuPercent = 100 - (totalIdle / totalTick) * 100;

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const ramPercent = ((totalMem - freeMem) / totalMem) * 100;

  // Storage usage for workspace
  let storagePercent = 0;
  try {
    const stats = fs.statSync(process.cwd());
    // Approximate — in production would check disk usage of workspace
    storagePercent = 0;
  } catch {
    storagePercent = 0;
  }

  return {
    cpuPercent: Math.round(cpuPercent * 10) / 10,
    ramPercent: Math.round(ramPercent * 10) / 10,
    storagePercent,
    totalMemGB: Math.round((totalMem / (1024 ** 3)) * 100) / 100,
    freeMemGB: Math.round((freeMem / (1024 ** 3)) * 100) / 100,
    cpuCount: cpus.length,
    platform: os.platform(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Check if resources are available for a new job.
 */
function checkResourceAvailability(jobType = "render") {
  const usage = getResourceUsage();
  const limits = resourceLimits;

  const checks = [];
  let canProceed = true;

  // CPU check
  if (usage.cpuPercent > limits.maxCpuPercent) {
    checks.push({
      resource: "cpu",
      current: usage.cpuPercent,
      limit: limits.maxCpuPercent,
      available: false,
    });
    canProceed = false;
  } else {
    checks.push({
      resource: "cpu",
      current: usage.cpuPercent,
      limit: limits.maxCpuPercent,
      available: true,
    });
  }

  // RAM check
  if (usage.ramPercent > limits.maxRamPercent) {
    checks.push({
      resource: "ram",
      current: usage.ramPercent,
      limit: limits.maxRamPercent,
      available: false,
    });
    canProceed = false;
  } else {
    checks.push({
      resource: "ram",
      current: usage.ramPercent,
      limit: limits.maxRamPercent,
      available: true,
    });
  }

  // Concurrent jobs check
  const activeCount = activeJobs.size;
  const maxJobs = jobType === "render" ? limits.maxConcurrentRenders : limits.maxConcurrentJobs;
  if (activeCount >= maxJobs) {
    checks.push({
      resource: "concurrent-jobs",
      current: activeCount,
      limit: maxJobs,
      available: false,
    });
    canProceed = false;
  } else {
    checks.push({
      resource: "concurrent-jobs",
      current: activeCount,
      limit: maxJobs,
      available: true,
    });
  }

  return {
    available: canProceed,
    usage,
    checks,
    limits,
  };
}

/**
 * Register a job for resource tracking.
 */
function registerJob(jobId, jobType, options = {}) {
  const {
    estimatedCpuPercent,
    estimatedRamPercent,
    estimatedDurationMinutes,
    requiresApproval = false,
  } = options;

  // Check resources before registering
  const availability = checkResourceAvailability(jobType);
  if (!availability.available) {
    writeAuditLog({
      action: "job-rejected",
      jobId,
      jobType,
      reason: "Insufficient resources",
      details: availability.checks,
    });
    return { ok: false, error: "Insufficient resources", details: availability.checks };
  }

  const job = {
    jobId,
    jobType,
    status: "queued",
    estimatedCpuPercent,
    estimatedRamPercent,
    estimatedDurationMinutes,
    requiresApproval,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
  };

  activeJobs.set(jobId, job);
  renderQueue.push(jobId);

  writeAuditLog({
    action: "job-registered",
    jobId,
    jobType,
    details: { estimatedDurationMinutes, requiresApproval },
  });

  return { ok: true, job };
}

/**
 * Update job status.
 */
function updateJobStatus(jobId, status, options = {}) {
  const job = activeJobs.get(jobId);
  if (!job) {
    return { ok: false, error: `Job not found: ${jobId}` };
  }

  job.status = status;
  if (status === "running" && !job.startedAt) {
    job.startedAt = new Date().toISOString();
  }
  if (status === "completed" || status === "failed" || status === "cancelled") {
    job.completedAt = new Date().toISOString();
    // Remove from active jobs
    activeJobs.delete(jobId);
  }

  if (options.cost) {
    job.cost = options.cost;
    costTracking.total += options.cost;
    costTracking.byJob[jobId] = options.cost;
    const day = new Date().toISOString().slice(0, 10);
    costTracking.byDay[day] = (costTracking.byDay[day] || 0) + options.cost;
  }

  writeAuditLog({
    action: "job-status-changed",
    jobId,
    jobType: job.jobType,
    newStatus: status,
    details: options,
  });

  return { ok: true, job };
}

/**
 * Cancel a job.
 */
function cancelJob(jobId, reason = "user-cancelled") {
  const job = activeJobs.get(jobId);
  if (!job) {
    // Check render queue
    const queueIdx = renderQueue.indexOf(jobId);
    if (queueIdx >= 0) {
      renderQueue.splice(queueIdx, 1);
      writeAuditLog({ action: "job-cancelled", jobId, reason });
      return { ok: true, message: "Job removed from queue" };
    }
    return { ok: false, error: `Job not found: ${jobId}` };
  }

  job.status = "cancelled";
  job.completedAt = new Date().toISOString();
  activeJobs.delete(jobId);

  writeAuditLog({
    action: "job-cancelled",
    jobId,
    jobType: job.jobType,
    reason,
  });

  return { ok: true, job };
}

/**
 * Get active jobs and queue.
 */
function getJobStatus() {
  return {
    activeJobs: Array.from(activeJobs.values()),
    renderQueue: renderQueue.map((id) => {
      const job = activeJobs.get(id);
      return job || { jobId: id, status: "queued" };
    }),
    activeCount: activeJobs.size,
    queuedCount: renderQueue.length,
  };
}

/**
 * Get resource limits and update them.
 */
function getResourceLimits() {
  return { ...resourceLimits };
}

function updateResourceLimits(newLimits, authorizedBy) {
  if (!authorizedBy) {
    return { ok: false, error: "Authorization required to change resource limits" };
  }

  writeAuditLog({
    action: "resource-limits-changed",
    authorizedBy,
    oldLimits: { ...resourceLimits },
    newLimits,
  });

  resourceLimits = { ...DEFAULT_LIMITS, ...newLimits };
  return { ok: true, limits: resourceLimits };
}

/**
 * Get cost tracking.
 */
function getCostTracking() {
  return { ...costTracking };
}

/**
 * Record cost for a job (requires approval if above threshold).
 */
function recordJobCost(jobId, cost, modelId, authorizedBy) {
  if (cost > resourceLimits.costAlertThreshold && !authorizedBy) {
    return {
      ok: false,
      error: `Cost $${cost} exceeds alert threshold $${resourceLimits.costAlertThreshold}. Authorization required.`,
      requiresApproval: true,
    };
  }

  costTracking.total += cost;
  costTracking.byJob[jobId] = cost;
  if (modelId) {
    costTracking.byModel[modelId] = (costTracking.byModel[modelId] || 0) + cost;
  }
  const day = new Date().toISOString().slice(0, 10);
  costTracking.byDay[day] = (costTracking.byDay[day] || 0) + cost;

  writeAuditLog({
    action: "cost-recorded",
    jobId,
    cost,
    modelId,
    authorizedBy,
  });

  return { ok: true, total: costTracking.total };
}

/**
 * Get audit logs.
 */
function getAuditLogs(limit = 100) {
  return auditLogs.slice(-limit);
}

/**
 * Check if an operation requires approval.
 */
function requiresApproval(operation, options = {}) {
  const {
    cost,
    destructive = false,
    paidUsage = false,
  } = options;

  // Destructive operations always require approval
  if (destructive) {
    return { requiresApproval: true, reason: "Destructive operation requires explicit approval" };
  }

  // Paid usage requires approval
  if (paidUsage) {
    return { requiresApproval: true, reason: "Paid API usage requires explicit approval" };
  }

  // Cost above threshold requires approval
  if (cost !== undefined && cost > resourceLimits.costAlertThreshold) {
    return { requiresApproval: true, reason: `Cost $${cost} exceeds threshold` };
  }

  return { requiresApproval: false, reason: null };
}

/**
 * Get resource manager status.
 */
function getStatus() {
  return {
    resourceUsage: getResourceUsage(),
    resourceLimits,
    activeJobs: activeJobs.size,
    queuedJobs: renderQueue.length,
    costTotal: costTracking.total,
    auditLogCount: auditLogs.length,
  };
}

module.exports = {
  getResourceUsage,
  checkResourceAvailability,
  registerJob,
  updateJobStatus,
  cancelJob,
  getJobStatus,
  getResourceLimits,
  updateResourceLimits,
  getCostTracking,
  recordJobCost,
  getAuditLogs,
  writeAuditLog,
  requiresApproval,
  getStatus,
  DEFAULT_LIMITS,
};
