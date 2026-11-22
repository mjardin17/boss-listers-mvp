const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  CreativeAgent,
  AgentOrchestrator,
  AGENT_STATES,
} = require("../lib/universal-creative/agent-framework.js");
const {
  CommercialDirectorAgent,
  MarketingResearchAgent,
  CreativeDirectorAgent,
  ScriptwriterAgent,
  ProductPhotographyAgent,
  SceneDesignerAgent,
  AnimationAgentCommercial,
  VoiceoverAgent,
  VideoEditorAgent,
  CommercialQAAgent,
  CampaignAgent,
  registerAllCommercialAgents,
} = require("../lib/universal-creative/commercial-agents.js");

// ---------------------------------------------------------------
// Agent framework tests
// ---------------------------------------------------------------

test("CreativeAgent base class", () => {
  const agent = new CreativeAgent({
    id: "test-agent-1",
    name: "Test Agent",
    type: "test",
    domain: "commercial",
    capabilities: ["cap-1", "cap-2"],
    permissions: ["perm-1"],
  });
  assert.equal(agent.id, "test-agent-1");
  assert.equal(agent.name, "Test Agent");
  assert.equal(agent.state, AGENT_STATES.idle);
  assert.ok(agent.hasCapability("cap-1"));
  assert.ok(!agent.hasCapability("cap-3"));
  assert.ok(agent.hasPermission("perm-1"));
});

test("CreativeAgent execute throws if not implemented", async () => {
  const agent = new CreativeAgent({ id: "no-exec" });
  await assert.rejects(() => agent.execute({}), /does not implement execute/);
});

test("CreativeAgent recordTask updates state", () => {
  const agent = new CreativeAgent({ id: "record-test" });
  agent.setState(AGENT_STATES.working);
  assert.equal(agent.state, AGENT_STATES.working);
  agent.recordTask({ id: "task-1", type: "test" }, { ok: true });
  assert.equal(agent.state, AGENT_STATES.idle);
  assert.equal(agent.taskHistory.length, 1);
  assert.equal(agent.taskHistory[0].status, "completed");
});

test("AgentOrchestrator register/list agents", () => {
  const orch = new AgentOrchestrator({ domain: "test" });
  const agent = new CreativeAgent({ id: "orch-agent-1", name: "Orch Agent", type: "test", domain: "test" });
  orch.registerAgent(agent);

  const agents = orch.listAgents();
  assert.equal(agents.length, 1);
  assert.equal(agents[0].id, "orch-agent-1");

  const found = orch.getAgent("orch-agent-1");
  assert.equal(found.id, "orch-agent-1");
  assert.equal(orch.unregisterAgent("orch-agent-1"), true);
  assert.equal(orch.getAgent("orch-agent-1"), undefined);
});

test("AgentOrchestrator submitTask routes to agent", async () => {
  const orch = new AgentOrchestrator({ domain: "test" });
  const agent = new CreativeAgent({
    id: "router-agent",
    name: "Router",
    type: "test",
    domain: "test",
    capabilities: ["do-task"],
  });
  agent.execute = async (task) => ({ ok: true, result: `done: ${task.type}` });
  orch.registerAgent(agent);

  const result = await orch.submitTask({ id: "t1", type: "do-task", requiredCapability: "do-task" });
  assert.ok(result.ok);
  assert.equal(result.agentId, "router-agent");
  assert.ok(result.result.ok);
});

test("AgentOrchestrator queues when no agent available", async () => {
  const orch = new AgentOrchestrator({ domain: "test" });
  const result = await orch.submitTask({ id: "t2", type: "no-agent", requiredCapability: "nonexistent" });
  assert.equal(result.ok, false);
  assert.ok(result.queued);
});

test("AgentOrchestrator getStatus", () => {
  const orch = new AgentOrchestrator({ domain: "status-test" });
  const status = orch.getStatus();
  assert.equal(status.domain, "status-test");
  assert.equal(status.agentCount, 0);
});

// ---------------------------------------------------------------
// Commercial agent tests
// ---------------------------------------------------------------

test("CommercialDirectorAgent creates strategy", async () => {
  const agent = new CommercialDirectorAgent();
  const result = await agent.execute({
    product: { sku: "SKU-1", title: "Test Product", price: 29.99 },
    campaignGoal: "sales",
    targetAudience: "home buyers",
  });
  assert.ok(result.ok);
  assert.equal(result.agent, "commercial-director");
  assert.ok(result.strategy);
  assert.ok(result.strategy.tasks.length > 0);
});

test("MarketingResearchAgent researches product", async () => {
  const agent = new MarketingResearchAgent();
  const result = await agent.execute({
    product: { sku: "SKU-1", title: "Vintage Lamp", price: 45.00, condition: "Good" },
  });
  assert.ok(result.ok);
  assert.equal(result.agent, "marketing-research");
  assert.ok(result.research);
  assert.ok(result.research.keySellingPoints.length > 0);
});

test("CreativeDirectorAgent develops concept", async () => {
  const agent = new CreativeDirectorAgent();
  const result = await agent.execute({
    product: { title: "Vintage Lamp" },
    campaignGoal: "sales",
  });
  assert.ok(result.ok);
  assert.equal(result.agent, "creative-director");
  assert.ok(result.concept);
  assert.ok(result.concept.sceneConcepts.length > 0);
});

test("ScriptwriterAgent writes script", async () => {
  const agent = new ScriptwriterAgent();
  const result = await agent.execute({
    product: { title: "Vintage Lamp", price: 45.00, description: "A beautiful vintage lamp" },
    duration: 15,
  });
  assert.ok(result.ok);
  assert.equal(result.agent, "scriptwriter");
  assert.ok(result.script);
  assert.ok(result.script.scenes.length > 0);
  assert.ok(result.script.totalDuration > 0);
});

test("SceneDesignerAgent designs scenes", async () => {
  const agent = new SceneDesignerAgent();
  const result = await agent.execute({
    product: { title: "Vintage Lamp", image_url: "https://example.com/lamp.jpg" },
    aspectRatio: "9:16",
  });
  assert.ok(result.ok);
  assert.equal(result.agent, "scene-designer");
  assert.ok(result.composition);
  assert.ok(result.composition.scenes.length > 0);
});

test("AnimationAgent creates animations", async () => {
  const agent = new AnimationAgentCommercial();
  const result = await agent.execute({
    product: { title: "Vintage Lamp", image_url: "https://example.com/lamp.jpg" },
    brandName: "Test Brand",
  });
  assert.ok(result.ok);
  assert.equal(result.agent, "animation");
  assert.ok(result.animations.length > 0);
});

test("VoiceoverAgent creates audio plan", async () => {
  const agent = new VoiceoverAgent();
  const result = await agent.execute({
    script: {
      scenes: [
        { id: "s1", duration: 3, narration: "First narration" },
        { id: "s2", duration: 4, narration: "Second narration" },
      ],
    },
    voice: "af_heart",
  });
  assert.ok(result.ok);
  assert.equal(result.agent, "voiceover");
  assert.ok(result.audio);
  assert.equal(result.audio.narrationSegments.length, 2);
});

test("VideoEditorAgent assembles edit", async () => {
  const agent = new VideoEditorAgent();
  const result = await agent.execute({
    composition: {
      scenes: [
        { id: "s1", duration: 3 },
        { id: "s2", duration: 4 },
      ],
    },
    aspectRatio: "9:16",
  });
  assert.ok(result.ok);
  assert.equal(result.agent, "video-editor");
  assert.ok(result.job);
});

test("CommercialQAAgent checks quality", async () => {
  const agent = new CommercialQAAgent();
  const result = await agent.execute({
    product: { title: "Test Product", price: 19.99 },
    script: {
      scenes: [
        { id: "s1", duration: 3 },
        { id: "s2", duration: 4 },
      ],
    },
  });
  assert.ok(result.ok);
  assert.equal(result.agent, "commercial-qa");
  assert.ok(result.passed);
  assert.ok(result.score >= 0);
});

test("CampaignAgent prepares variations", async () => {
  const agent = new CampaignAgent();
  const result = await agent.execute({
    commercial: { id: "comm-1" },
    platforms: ["instagram", "facebook", "tiktok"],
  });
  assert.ok(result.ok);
  assert.equal(result.agent, "campaign");
  assert.equal(result.variations.length, 3);
  assert.ok(result.variations.every((v) => v.requiresApproval === true));
  assert.ok(result.variations.every((v) => v.autoPost === false));
});

// ---------------------------------------------------------------
// Register all agents test
// ---------------------------------------------------------------

test("registerAllCommercialAgents registers 11 agents", () => {
  const orch = new AgentOrchestrator({ domain: "commercial" });
  const agents = registerAllCommercialAgents(orch);
  assert.equal(agents.length, 11);
  const agentIds = agents.map((a) => a.id);
  assert.ok(agentIds.includes("commercial-director"));
  assert.ok(agentIds.includes("marketing-research"));
  assert.ok(agentIds.includes("creative-director"));
  assert.ok(agentIds.includes("scriptwriter"));
  assert.ok(agentIds.includes("product-photography"));
  assert.ok(agentIds.includes("scene-designer"));
  assert.ok(agentIds.includes("animation"));
  assert.ok(agentIds.includes("voiceover"));
  assert.ok(agentIds.includes("video-editor"));
  assert.ok(agentIds.includes("commercial-qa"));
  assert.ok(agentIds.includes("campaign"));

  // Verify all registered with orchestrator
  const registered = orch.listAgents({ domain: "commercial" });
  assert.equal(registered.length, 11);
});
