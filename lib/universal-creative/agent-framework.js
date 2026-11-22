#!/usr/bin/env node
/**
 * Universal Creative Production Connector — Agent Framework
 *
 * Base agent classes and shared orchestrator for creative production agents.
 * Extends the existing lib/agents/executionAgent.ts pattern (reseller agent
 * mesh) with creative production agents. Agents collaborate through the
 * shared orchestrator; they never auto-post, auto-list, or invent prices.
 *
 * Agent types:
 *   - Commercial Maker: Director, Marketing Research, Creative Director,
 *     Scriptwriter, Product Photography, Scene Designer, Animation,
 *     Voiceover, Video Editor, Commercial QA, Campaign
 *   - Video Factory: Research, Script, Storyboard, Visual Production,
 *     Video Editing, Animation, Audio Production, Thumbnail, Subtitle,
 *     QA, Publishing Preparation
 *
 * All agents are render-only by default. Publishing requires explicit
 * user approval + authorized connections.
 */

const { EventEmitter } = require("events");
const { defaultRegistry } = require("./registry.js");
const { isAvailable, isVerified } = require("./manifest.js");

const AGENT_STATES = {
  idle: "idle",
  working: "working",
  completed: "completed",
  failed: "failed",
  blocked: "blocked",
};

/**
 * Base agent class. All creative agents extend this.
 */
class CreativeAgent {
  constructor(options = {}) {
    this.id = options.id || `agent-${Date.now()}`;
    this.name = options.name || "Unnamed Agent";
    this.type = options.type || "generic";
    this.domain = options.domain || "commercial"; // commercial, video-factory, shared
    this.state = AGENT_STATES.idle;
    this.capabilities = options.capabilities || [];
    this.permissions = options.permissions || [];
    this.memory = options.memory || {};
    this.eventBus = options.eventBus || new EventEmitter();
    this.connectorId = options.connectorId || null;
    this.requiresApproval = options.requiresApproval || false;
    this.taskHistory = [];
    this.maxTaskHistory = 100;
    this.createdAt = new Date().toISOString();
    this.lastActive = null;
  }

  /**
   * Check if agent has required capability.
   */
  hasCapability(capabilityId) {
    return this.capabilities.includes(capabilityId);
  }

  /**
   * Check if agent has required permission.
   */
  hasPermission(permissionId) {
    return this.permissions.includes(permissionId);
  }

  /**
   * Check if agent can execute a task (production-ready connector if needed).
   */
  canExecute(task) {
    if (this.state !== AGENT_STATES.idle) {
      return { ok: false, reason: `Agent ${this.id} is ${this.state}` };
    }
    if (task.requiresConnector && this.connectorId) {
      const config = defaultRegistry.getConfig(this.connectorId);
      if (!config || !isAvailable(config) || !isVerified(config)) {
        return {
          ok: false,
          reason: `Connector ${this.connectorId} not production-ready`,
        };
      }
    }
    return { ok: true };
  }

  /**
   * Execute a task. Subclasses must implement.
   */
  async execute(task) {
    throw new Error(`Agent ${this.id} does not implement execute()`);
  }

  /**
   * Record a completed task in history.
   */
  recordTask(task, result) {
    this.taskHistory.push({
      taskId: task.id || `task-${Date.now()}`,
      taskType: task.type,
      agentId: this.id,
      status: result.ok ? "completed" : "failed",
      result: result.ok ? "success" : result.error,
      timestamp: new Date().toISOString(),
    });
    if (this.taskHistory.length > this.maxTaskHistory) {
      this.taskHistory.shift();
    }
    this.lastActive = new Date().toISOString();
    this.state = AGENT_STATES.idle;
    this.eventBus.emit("agent:task-completed", { agentId: this.id, task, result });
  }

  /**
   * Set agent state.
   */
  setState(state) {
    this.state = state;
    this.eventBus.emit("agent:state-changed", { agentId: this.id, state });
  }

  getStatus() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      domain: this.domain,
      state: this.state,
      capabilities: this.capabilities,
      permissions: this.permissions,
      taskCount: this.taskHistory.length,
      lastActive: this.lastActive,
      createdAt: this.createdAt,
    };
  }
}

/**
 * Shared orchestrator — coordinates agents across domains.
 * Agents publish/subscribe via event bus; orchestrator routes tasks.
 */
class AgentOrchestrator {
  constructor(options = {}) {
    this.id = options.id || `orchestrator-${Date.now()}`;
    this.eventBus = new EventEmitter();
    this.agents = new Map();
    this.taskQueue = [];
    this.completedTasks = [];
    this.maxTaskHistory = 500;
    this.domain = options.domain || "shared";
    this.createdAt = new Date().toISOString();
  }

  /**
   * Register an agent with the orchestrator.
   */
  registerAgent(agent) {
    agent.eventBus = this.eventBus;
    this.agents.set(agent.id, agent);
    this.eventBus.emit("orchestrator:agent-registered", { agentId: agent.id, agent: agent.getStatus() });
    return agent;
  }

  /**
   * Unregister an agent.
   */
  unregisterAgent(agentId) {
    return this.agents.delete(agentId);
  }

  /**
   * Get an agent by id.
   */
  getAgent(agentId) {
    return this.agents.get(agentId);
  }

  /**
   * List all agents, optionally filtered by domain or type.
   */
  listAgents(filter = {}) {
    let agents = Array.from(this.agents.values());
    if (filter.domain) {
      agents = agents.filter((a) => a.domain === filter.domain);
    }
    if (filter.type) {
      agents = agents.filter((a) => a.type === filter.type);
    }
    if (filter.state) {
      agents = agents.filter((a) => a.state === filter.state);
    }
    return agents.map((a) => a.getStatus());
  }

  /**
   * Find the best agent for a task based on capabilities and domain.
   */
  findBestAgent(task) {
    const candidates = Array.from(this.agents.values()).filter((a) => {
      if (a.state !== AGENT_STATES.idle) return false;
      if (task.requiredCapability && !a.hasCapability(task.requiredCapability)) return false;
      if (task.requiredPermission && !a.hasPermission(task.requiredPermission)) return false;
      if (task.domain && a.domain !== task.domain && a.domain !== "shared") return false;
      return true;
    });

    if (candidates.length === 0) return null;

    // Prefer agents with fewer recent tasks (load balancing)
    return candidates.sort((a, b) => a.taskHistory.length - b.taskHistory.length)[0];
  }

  /**
   * Submit a task to the orchestrator. Routes to best available agent.
   */
  async submitTask(task) {
    const agent = this.findBestAgent(task);
    if (!agent) {
      this.taskQueue.push({ ...task, queuedAt: new Date().toISOString() });
      return {
        ok: false,
        reason: "No available agent",
        queued: true,
        queuePosition: this.taskQueue.length,
      };
    }

    const canExecute = agent.canExecute(task);
    if (!canExecute.ok) {
      this.taskQueue.push({ ...task, queuedAt: new Date().toISOString() });
      return {
        ok: false,
        reason: canExecute.reason,
        queued: true,
        queuePosition: this.taskQueue.length,
      };
    }

    agent.setState(AGENT_STATES.working);
    try {
      const result = await agent.execute(task);
      agent.recordTask(task, result);
      this.completedTasks.push({
        taskId: task.id || `task-${Date.now()}`,
        agentId: agent.id,
        taskType: task.type,
        status: result.ok ? "completed" : "failed",
        timestamp: new Date().toISOString(),
      });
      if (this.completedTasks.length > this.maxTaskHistory) {
        this.completedTasks.shift();
      }
      // Process queued tasks
      this._processQueue();
      return { ok: true, agentId: agent.id, result };
    } catch (err) {
      agent.recordTask(task, { ok: false, error: err instanceof Error ? err.message : String(err) });
      this._processQueue();
      return { ok: false, agentId: agent.id, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Process queued tasks when agents become available.
   */
  async _processQueue() {
    if (this.taskQueue.length === 0) return;
    const task = this.taskQueue.shift();
    await this.submitTask(task);
  }

  /**
   * Get orchestrator status.
   */
  getStatus() {
    return {
      id: this.id,
      domain: this.domain,
      agentCount: this.agents.size,
      agentsByDomain: {},
      queueLength: this.taskQueue.length,
      completedTaskCount: this.completedTasks.length,
      createdAt: this.createdAt,
    };
  }
}

/**
 * Create a shared orchestrator instance.
 */
const defaultOrchestrator = new AgentOrchestrator({ domain: "shared" });

module.exports = {
  CreativeAgent,
  AgentOrchestrator,
  AGENT_STATES,
  defaultOrchestrator,
};
