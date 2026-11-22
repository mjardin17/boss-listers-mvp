#!/usr/bin/env node
/**
 * Universal Creative Production Connector — Empire Memory
 *
 * Connects both Video Factory and Commercial Maker to the existing Learning Core.
 * Provides unified memory across both production systems:
 *   - Shared production history and outcomes
 *   - Cross-system skill transfer
 *   - Unified quality tracking
 *   - Production history for both domains
 *
 * Extends the existing Learning Core without replacing it.
 */

const {
  recordLearningEvent,
  getLearningEvents,
  recordSkill,
  getSkills,
  recordRegressionTest,
  getRegressionTests,
  getLearningStats,
  getTopPerformers,
  DOMAINS,
} = require("./learning-core.js");

const MEMORY_TYPES = [
  "production",
  "agent-decision",
  "model-selection",
  "workflow-execution",
  "quality-outcome",
  "user-correction",
];

/**
 * Record a production memory entry for either Video Factory or Commercial Maker.
 */
function recordProductionMemory(options = {}) {
  const {
    domain = "shared",
    productionId,
    type = "production",
    agentId = null,
    modelId = null,
    workflowId = null,
    input = null,
    output = null,
    qualityScore = null,
    verified = false,
    userCorrection = null,
    lessonsLearned = [],
    skillsGained = [],
    metadata = {},
  } = options;

  if (!DOMAINS.includes(domain)) {
    return { ok: false, error: `Invalid domain. Valid: ${DOMAINS.join(", ")}` };
  }

  return recordLearningEvent({
    domain,
    type,
    agentId,
    modelId,
    workflowId,
    productionId,
    input,
    output,
    qualityScore,
    verified,
    userCorrection,
    lessonsLearned,
    skillsGained,
    metadata,
  });
}

/**
 * Get production history for a domain or specific production.
 */
function getProductionHistory(filter = {}) {
  return getLearningEvents(filter);
}

/**
 * Get memory summary for a domain.
 */
function getMemorySummary(domain = "shared") {
  if (!DOMAINS.includes(domain)) {
    return { ok: false, error: `Invalid domain. Valid: ${DOMAINS.join(", ")}` };
  }

  const stats = getLearningStats();
  const events = getLearningEvents({ domain });

  return {
    domain,
    totalMemories: events.length,
    verifiedMemories: events.filter((e) => e.verified).length,
    averageQualityScore: stats.averageQualityScore,
    byType: {},
    recentEvents: events.slice(0, 10),
  };
}

/**
 * Cross-system skill transfer — share verified skills between domains.
 */
function getTransferableSkills(sourceDomain, targetDomain) {
  if (!DOMAINS.includes(sourceDomain) || !DOMAINS.includes(targetDomain)) {
    return { ok: false, error: "Invalid domain" };
  }

  const skills = getSkills({ domain: sourceDomain, verified: true });

  return {
    sourceDomain,
    targetDomain,
    transferableSkills: skills.map((s) => ({
      skillId: s.skillId,
      name: s.name,
      description: s.description,
      successRate: s.successRate,
      applicableAgents: s.agents,
      applicableModels: s.models,
      applicableApplications: s.applications,
    })),
  };
}

/**
 * Record a user correction that both systems should learn from.
 */
function recordUserCorrection(options = {}) {
  const {
    domain = "shared",
    productionId = null,
    agentId = null,
    originalOutput = null,
    correctedOutput = null,
    correctionReason = null,
    verified = false,
  } = options;

  return recordLearningEvent({
    domain,
    type: "correction",
    agentId,
    productionId,
    input: originalOutput,
    output: verified ? correctedOutput : null,
    qualityScore: verified ? 100 : null,
    verified,
    userCorrection: {
      reason: correctionReason,
      original: originalOutput,
      corrected: verified ? correctedOutput : null,
    },
    lessonsLearned: verified ? [correctionReason || "User correction applied"] : [],
    skillsGained: [],
    metadata: { correctionType: "user-correction" },
  });
}

/**
 * Get agents/models/workflows that perform best in a domain.
 */
function getDomainLeaders(domain = "shared") {
  if (!DOMAINS.includes(domain)) {
    return { ok: false, error: `Invalid domain. Valid: ${DOMAINS.join(", ")}` };
  }

  const performers = getTopPerformers({ domain });

  return {
    domain,
    topAgents: performers.topAgents.slice(0, 5),
    topModels: performers.topModels.slice(0, 5),
    topWorkflows: performers.topWorkflows.slice(0, 5),
  };
}

module.exports = {
  recordProductionMemory,
  getProductionHistory,
  getMemorySummary,
  getTransferableSkills,
  recordUserCorrection,
  getDomainLeaders,
  MEMORY_TYPES,
  DOMAINS,
};
