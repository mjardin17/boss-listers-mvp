#!/usr/bin/env node
/**
 * Universal Creative Production Connector — Command Center
 *
 * Unified production dashboard inside the existing system (Video Studio extended).
 * Displays:
 *   - Video Factory status, Commercial Maker status
 *   - Application registry, agent activity
 *   - Active jobs, production queues, render queues
 *   - Shared asset library, model assignments
 *   - Quality control results, errors and blockers
 *   - Resource usage, production history, Learning Core activity
 *
 * Allows user to initiate commercial or video production job from command center.
 * Keeps two production environments independently manageable.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  defaultRegistry,
} = require("./registry.js");
const {
  isAvailable,
  isVerified,
} = require("./manifest.js");
const { ensurePresets } = require("./presets.js");
const {
  defaultOrchestrator,
} = require("./agent-framework.js");
const {
  makeCommercialUnified,
} = require("./orchestrator.js");
const {
  produceVideo,
} = require("./video-factory.js");
const {
  workflowRegistry,
  getWorkflowDefinitions,
} = require("./workflows.js");
const {
  getStats: getAssetStats,
} = require("./asset-factory.js");
const {
  getStatus: getResourceStatus,
  getResourceUsage,
  getJobStatus,
  getAuditLogs,
} = require("./resource-manager.js");
const {
  getLearningStats,
  getTopPerformers,
} = require("./learning-core.js");
const {
  getDistributionStatus,
} = require("./crosspost-distribution.js");

// In-memory production history
const productionHistory = [];
const MAX_HISTORY = 500;

/**
 * Get Command Center dashboard data.
 */
function getDashboardData() {
  // Ensure presets are registered so dashboard shows all apps
  ensurePresets();

  // Application registry status
  const connectors = defaultRegistry.list();
  const appRegistry = connectors.map((c) => ({
    id: c.id,
    name: c.name,
    method: c.method,
    category: c.category,
    status: c.status,
    verified: isVerified(c),
    productionReady: isAvailable(c) && isVerified(c),
  }));

  // Agent activity
  const agents = defaultOrchestrator.listAgents();
  const agentActivity = agents.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    domain: a.domain,
    state: a.state,
    taskCount: a.taskCount,
    lastActive: a.lastActive,
  }));

  // Active jobs and queues
  const jobStatus = getJobStatus();

  // Resource usage
  const resourceStatus = getResourceStatus();

  // Asset library stats
  const assetStats = getAssetStats();

  // Learning Core activity
  const learningStats = getLearningStats();

  // CROSSPOST distribution status
  const distributionStatus = getDistributionStatus();

  // Recent production history
  const recentHistory = productionHistory.slice(-20);

  // Errors and blockers
  const errors = [];
  const blockers = [];

  // Check for connectors that should be available but aren't
  for (const c of connectors) {
    if (c.status === "unavailable") {
      blockers.push({
        type: "application-unavailable",
        id: c.id,
        name: c.name,
        message: `${c.name} (${c.id}) is not available — not installed or not working`,
        severity: "warning",
      });
    }
    if (c.status === "unverified") {
      blockers.push({
        type: "application-unverified",
        id: c.id,
        name: c.name,
        message: `${c.name} (${c.id}) has not been verified — do not use in production`,
        severity: "info",
      });
    }
  }

  // Check for failed jobs
  const failedJobs = jobStatus.activeJobs.filter((j) => j.status === "failed");
  for (const job of failedJobs) {
    errors.push({
      type: "job-failed",
      id: job.jobId,
      message: `Job ${job.jobId} (${job.jobType}) has failed`,
      severity: "error",
    });
  }

  // Recent audit logs
  const recentLogs = getAuditLogs(10);

  return {
    timestamp: new Date().toISOString(),
    environments: {
      commercialMaker: {
        available: true,
        modes: ["card-showcase", "commercial-cutter", "quick-commercial", "webhook"],
        productionReadyModes: ["card-showcase"], // only card-showcase is tested
      },
      videoFactory: {
        available: true,
        types: ["youtube", "documentary", "short-form", "bulk"],
      },
    },
    applicationRegistry: appRegistry,
    agentActivity,
    activeJobs: jobStatus.activeJobs,
    renderQueue: jobStatus.renderQueue,
    jobStats: {
      activeCount: jobStatus.activeCount,
      queuedCount: jobStatus.queuedCount,
    },
    sharedAssetLibrary: assetStats,
    modelAssignments: {
      topPerformers: getTopPerformers(),
    },
    qualityControl: {
      recentEvents: learningStats.byType || {},
    },
    errorsAndBlockers: { errors, blockers },
    resourceUsage: resourceStatus.resourceUsage,
    resourceLimits: resourceStatus.resourceLimits,
    productionHistory: recentHistory,
    learningCore: learningStats,
    crosspost: distributionStatus,
    recentAuditLogs: recentLogs,
  };
}

/**
 * Initiate a commercial production job from the command center.
 */
async function initiateCommercialJob(options = {}) {
  const {
    product,
    mode = "card-showcase",
    dir,
    initiatedBy,
    requiresApproval = false,
  } = options;

  if (!product || !product.title) {
    return { ok: false, error: "Product with title is required" };
  }

  // Check if approval is needed
  const approvalCheck = requiresApproval("commercial-job", {
    destructive: false,
    paidUsage: false,
  });

  if (requiresApproval || approvalCheck.requiresApproval) {
    return {
      ok: false,
      error: "Job requires explicit approval before initiation",
      requiresApproval: true,
      reason: approvalCheck.reason,
    };
  }

  // Check resource availability
  const availability = checkResourceAvailability("render");
  if (!availability.available) {
    return {
      ok: false,
      error: "Insufficient resources for commercial job",
      details: availability.checks,
    };
  }

  // Register the job
  const jobId = `commercial-${Date.now()}`;
  const jobResult = registerJob(jobId, "commercial", {
    estimatedDurationMinutes: 10,
    requiresApproval: false,
  });

  if (!jobResult.ok) {
    return jobResult;
  }

  // Execute the commercial production
  try {
    updateJobStatus(jobId, "running");

    const result = await makeCommercialUnified({
      mode,
      product,
      dir,
    });

    if (result.ok) {
      updateJobStatus(jobId, "completed", { cost: 0 });

      // Record in production history
      productionHistory.push({
        id: jobId,
        type: "commercial",
        mode,
        product: product.title,
        status: "completed",
        output: result.name,
        bytes: result.bytes,
        initiatedBy,
        completedAt: new Date().toISOString(),
      });
      if (productionHistory.length > MAX_HISTORY) {
        productionHistory.shift();
      }

      return {
        ok: true,
        jobId,
        commercial: result,
        message: "Commercial produced successfully",
      };
    } else {
      updateJobStatus(jobId, "failed");

      productionHistory.push({
        id: jobId,
        type: "commercial",
        mode,
        product: product.title,
        status: "failed",
        error: result.error,
        initiatedBy,
        failedAt: new Date().toISOString(),
      });

      return {
        ok: false,
        jobId,
        error: result.error,
        message: "Commercial production failed",
      };
    }
  } catch (err) {
    updateJobStatus(jobId, "failed");
    return {
      ok: false,
      jobId,
      error: err instanceof Error ? err.message : String(err),
      message: "Commercial production failed with exception",
    };
  }
}

/**
 * Initiate a video production job from the command center.
 */
async function initiateVideoJob(options = {}) {
  const {
    title,
    topic,
    type = "youtube",
    aspectRatio = "16:9",
    initiatedBy,
  } = options;

  if (!title || !topic) {
    return { ok: false, error: "Title and topic are required" };
  }

  const availability = checkResourceAvailability("render");
  if (!availability.available) {
    return {
      ok: false,
      error: "Insufficient resources for video job",
      details: availability.checks,
    };
  }

  const jobId = `video-${Date.now()}`;
  const jobResult = registerJob(jobId, "video", {
    estimatedDurationMinutes: 30,
    requiresApproval: false,
  });

  if (!jobResult.ok) {
    return jobResult;
  }

  try {
    updateJobStatus(jobId, "running");

    const result = await produceVideo({
      type,
      title,
      topic,
      aspectRatio,
    });

    if (result.ok) {
      updateJobStatus(jobId, "completed");

      productionHistory.push({
        id: jobId,
        type: "video",
        videoType: type,
        title,
        status: "completed",
        qaScore: result.qa?.score,
        initiatedBy,
        completedAt: new Date().toISOString(),
      });
      if (productionHistory.length > MAX_HISTORY) {
        productionHistory.shift();
      }

      return {
        ok: true,
        jobId,
        video: result,
        message: "Video produced successfully",
      };
    } else {
      updateJobStatus(jobId, "failed");
      return {
        ok: false,
        jobId,
        error: result.error,
        message: "Video production failed",
      };
    }
  } catch (err) {
    updateJobStatus(jobId, "failed");
    return {
      ok: false,
      jobId,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

module.exports = {
  getDashboardData,
  initiateCommercialJob,
  initiateVideoJob,
  getProductionHistory: () => productionHistory,
  MAX_HISTORY,
};
