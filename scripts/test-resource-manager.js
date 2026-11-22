#!/usr/bin/env node
/**
 * M12 Resource Manager Tests
 */

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
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
} = require("../lib/universal-creative/resource-manager.js");

test("getResourceUsage returns valid usage data", () => {
  const usage = getResourceUsage();
  assert.ok(typeof usage.cpuPercent === "number");
  assert.ok(typeof usage.ramPercent === "number");
  assert.ok(typeof usage.cpuCount === "number");
  assert.ok(typeof usage.platform === "string");
  assert.ok(usage.cpuCount > 0);
  assert.ok(usage.timestamp);
});

test("checkResourceAvailability returns availability checks", () => {
  const result = checkResourceAvailability("render");
  assert.ok(typeof result.available === "boolean");
  assert.ok(Array.isArray(result.checks));
  assert.ok(result.usage);
  assert.ok(result.limits);
});

test("registerJob creates a job", () => {
  const result = registerJob("job-1", "render", {
    estimatedDurationMinutes: 10,
    requiresApproval: false,
  });
  assert.ok(result.ok);
  assert.ok(result.job);
  assert.equal(result.job.jobId, "job-1");
  assert.equal(result.job.jobType, "render");
  assert.equal(result.job.status, "queued");
});

test("registerJob rejects when resources exhausted", () => {
  // Fill up all concurrent job slots
  const limits = getResourceLimits();
  const maxJobs = limits.maxConcurrentRenders;

  // Register jobs up to the limit
  for (let i = 0; i < maxJobs; i++) {
    registerJob(`fill-job-${i}`, "render", {
      estimatedDurationMinutes: 5,
    });
  }

  // Next one should fail
  const result = registerJob("overflow-job", "render", {
    estimatedDurationMinutes: 5,
  });
  assert.ok(!result.ok);
  assert.equal(result.error, "Insufficient resources");

  // Cleanup: cancel all fill jobs
  for (let i = 0; i < maxJobs; i++) {
    cancelJob(`fill-job-${i}`, "test-cleanup");
  }
});

test("updateJobStatus changes job status", () => {
  registerJob("job-status-1", "render", { estimatedDurationMinutes: 5 });
  const result = updateJobStatus("job-status-1", "running");
  assert.ok(result.ok);
  assert.equal(result.job.status, "running");

  const completed = updateJobStatus("job-status-1", "completed");
  assert.ok(completed.ok);
  assert.equal(completed.job.status, "completed");
});

test("cancelJob removes job", () => {
  registerJob("job-cancel-1", "render", { estimatedDurationMinutes: 5 });
  const result = cancelJob("job-cancel-1", "user-cancelled");
  assert.ok(result.ok);
  assert.equal(result.job.status, "cancelled");
});

test("getJobStatus returns active jobs and queue", () => {
  registerJob("queue-job-1", "render", { estimatedDurationMinutes: 5 });
  registerJob("queue-job-2", "video", { estimatedDurationMinutes: 10 });
  const status = getJobStatus();
  assert.ok(status.activeCount >= 2);
  assert.ok(status.queuedCount >= 0);
});

test("getResourceLimits returns defaults", () => {
  const limits = getResourceLimits();
  assert.equal(limits.maxCpuPercent, DEFAULT_LIMITS.maxCpuPercent);
  assert.equal(limits.maxRamPercent, DEFAULT_LIMITS.maxRamPercent);
  assert.equal(limits.maxConcurrentRenders, DEFAULT_LIMITS.maxConcurrentRenders);
});

test("updateResourceLimits requires authorization", () => {
  const result = updateResourceLimits({ maxCpuPercent: 90 });
  assert.ok(!result.ok);
  assert.equal(result.error, "Authorization required to change resource limits");
});

test("updateResourceLimits succeeds with authorization", () => {
  const result = updateResourceLimits({ maxCpuPercent: 90 }, "admin-user");
  assert.ok(result.ok);
  assert.equal(result.limits.maxCpuPercent, 90);
});

test("recordJobCost requires approval above threshold", () => {
  const result = recordJobCost("job-cost-1", 100, "model-1");
  assert.ok(!result.ok);
  assert.equal(result.requiresApproval, true);
});

test("recordJobCost succeeds below threshold", () => {
  const result = recordJobCost("job-cost-2", 5, "model-1", "admin-user");
  assert.ok(result.ok);
  assert.equal(result.total, 5);
});

test("requiresApproval for destructive operations", () => {
  const result = requiresApproval("delete-asset", { destructive: true });
  assert.equal(result.requiresApproval, true);
});

test("requiresApproval for paid usage", () => {
  const result = requiresApproval("api-call", { paidUsage: true });
  assert.equal(result.requiresApproval, true);
});

test("requiresApproval for high cost", () => {
  const result = requiresApproval("render-job", { cost: 100 });
  assert.equal(result.requiresApproval, true);
});

test("requiresApproval false for low cost non-destructive", () => {
  const result = requiresApproval("render-job", { cost: 1 });
  assert.equal(result.requiresApproval, false);
});

test("writeAuditLog creates audit entry", () => {
  const log = writeAuditLog({ action: "test-action", details: { foo: "bar" } });
  assert.ok(log.id);
  assert.ok(log.timestamp);
  assert.equal(log.action, "test-action");
  assert.deepEqual(log.details, { foo: "bar" });
});

test("getAuditLogs returns entries", () => {
  const logs = getAuditLogs(5);
  assert.ok(Array.isArray(logs));
  assert.ok(logs.length > 0);
});

test("getStatus returns combined status", () => {
  const status = getStatus();
  assert.ok(status.resourceUsage);
  assert.ok(status.resourceLimits);
  assert.ok(typeof status.activeJobs === "number");
  assert.ok(typeof status.costTotal === "number");
});
