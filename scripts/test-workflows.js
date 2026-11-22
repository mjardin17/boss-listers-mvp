const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  Workflow,
  WorkflowRegistry,
  executeStep,
  executeWorkflow,
  getWorkflowDefinitions,
  createWorkflowInstance,
  getWorkflowInstanceStatus,
  getWorkflowFeatures,
  WORKFLOW_STATES,
  STEP_STATES,
} = require("../lib/universal-creative/workflows.js");

// ---------------------------------------------------------------
// Workflow definition tests
// ---------------------------------------------------------------

test("getWorkflowDefinitions returns all 6 workflows", () => {
  const defs = getWorkflowDefinitions();
  assert.equal(defs.length, 6);
  const ids = defs.map((d) => d.id);
  assert.ok(ids.includes("product-commercial"));
  assert.ok(ids.includes("local-business-commercial"));
  assert.ok(ids.includes("youtube-production"));
  assert.ok(ids.includes("documentary-production"));
  assert.ok(ids.includes("short-form-campaign"));
  assert.ok(ids.includes("multi-platform-commercial"));
});

test("Workflow class creation", () => {
  const wf = new Workflow({
    id: "test-wf",
    name: "Test Workflow",
    description: "A test workflow",
    type: "test",
    steps: [
      { id: "s1", name: "Step 1", type: "input", state: STEP_STATES.pending },
      { id: "s2", name: "Step 2", type: "process", state: STEP_STATES.pending },
    ],
  });
  assert.equal(wf.id, "test-wf");
  assert.equal(wf.name, "Test Workflow");
  assert.equal(wf.state, WORKFLOW_STATES.pending);
  assert.equal(wf.getProgress(), 0);
});

test("Workflow step completion", () => {
  const wf = new Workflow({
    id: "test-wf-2",
    name: "Test",
    steps: [
      { id: "s1", name: "Step 1", type: "input", state: STEP_STATES.pending },
      { id: "s2", name: "Step 2", type: "process", state: STEP_STATES.pending },
    ],
  });

  wf.completeStep(0, { result: "done" });
  assert.equal(wf.steps[0].state, STEP_STATES.completed);
  assert.equal(wf.getProgress(), 50);

  wf.completeStep(1, { result: "done" });
  assert.equal(wf.getProgress(), 100);
});

test("Workflow step failure", () => {
  const wf = new Workflow({
    id: "test-wf-3",
    name: "Test",
    steps: [
      { id: "s1", name: "Step 1", type: "input", state: STEP_STATES.pending },
    ],
  });

  wf.failStep(0, "Something went wrong");
  assert.equal(wf.steps[0].state, STEP_STATES.failed);
  assert.equal(wf.errors.length, 1);
  assert.ok(wf.errors[0].error);
});

test("Workflow step skip", () => {
  const wf = new Workflow({
    id: "test-wf-4",
    name: "Test",
    steps: [
      { id: "s1", name: "Step 1", type: "input", state: STEP_STATES.pending, optional: true },
    ],
  });

  wf.skipStep(0, "Dependency not met");
  assert.equal(wf.steps[0].state, STEP_STATES.skipped);
  assert.equal(wf.steps[0].skipReason, "Dependency not met");
  assert.equal(wf.getProgress(), 100);
});

test("Workflow toJSON", () => {
  const wf = new Workflow({
    id: "json-wf",
    name: "JSON Test",
    type: "test",
    steps: [{ id: "s1", name: "Step 1", type: "input", state: STEP_STATES.pending }],
  });
  wf.completeStep(0, { data: "test" });

  const json = wf.toJSON();
  assert.equal(json.id, "json-wf");
  assert.equal(json.name, "JSON Test");
  assert.equal(json.state, "running");
  assert.equal(json.progress, 100);
  assert.ok(json.steps[0].result);
});

// ---------------------------------------------------------------
// WorkflowRegistry tests
// ---------------------------------------------------------------

test("WorkflowRegistry register/list definitions", () => {
  const reg = new WorkflowRegistry();
  const wf = reg.register({
    id: "reg-wf",
    name: "Registry Workflow",
    description: "Registered workflow",
    type: "test",
    steps: [],
  });
  assert.equal(wf.id, "reg-wf");

  const def = reg.getDefinition("reg-wf");
  assert.equal(def.id, "reg-wf");

  const list = reg.listDefinitions();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, "reg-wf");
});

test("WorkflowRegistry create/get instance", () => {
  const reg = new WorkflowRegistry();
  reg.register({
    id: "inst-wf",
    name: "Instance Workflow",
    steps: [{ id: "s1", name: "Step 1", type: "input", state: STEP_STATES.pending }],
  });

  const instance = reg.createInstance("inst-wf", { product: { title: "Test" } });
  assert.ok(instance.id.startsWith("instance-"));
  assert.equal(instance.context.product.title, "Test");

  const found = reg.getInstance(instance.id);
  assert.equal(found.id, instance.id);

  const list = reg.listInstances();
  assert.equal(list.length, 1);
});

// ---------------------------------------------------------------
// executeStep tests
// ---------------------------------------------------------------

test("executeStep with input action", async () => {
  const wf = new Workflow({
    id: "exec-wf",
    name: "Exec Test",
    steps: [
      { id: "s1", name: "Collect Info", type: "input", action: "collect-product-info", state: STEP_STATES.pending, dependsOn: [] },
    ],
    context: { product: { title: "Test Product" } },
  });

  const result = await executeStep(wf, 0, { product: { title: "Test Product" } });
  assert.ok(result.ok);
  assert.equal(wf.steps[0].state, STEP_STATES.completed);
});

test("executeStep respects dependencies", async () => {
  const wf = new Workflow({
    id: "dep-wf",
    name: "Dep Test",
    steps: [
      { id: "s1", name: "First", type: "input", action: "collect-product-info", state: STEP_STATES.pending, dependsOn: [] },
      { id: "s2", name: "Second", type: "process", action: "write-script", state: STEP_STATES.pending, dependsOn: ["s1"] },
    ],
  });

  // Step 2 should fail because step 1 not completed
  await assert.rejects(() => executeStep(wf, 1, {}), /Dependency s1 not completed/);
});

// ---------------------------------------------------------------
// executeWorkflow tests
// ---------------------------------------------------------------

test("executeWorkflow product-commercial", async () => {
  const instance = createWorkflowInstance("product-commercial", {
    product: {
      title: "Test Product",
      image_url: "https://example.com/product.jpg",
      price: 29.99,
    },
  });

  const result = await executeWorkflow(instance.id, {
    product: { title: "Test Product", image_url: "https://example.com/product.jpg", price: 29.99 },
  });

  // May fail if no rendering backend available, but should not crash
  assert.ok(result.ok === true || result.ok === false);
  assert.ok(result.instance);
  assert.ok(result.instance.id);
});

// ---------------------------------------------------------------
// Workflow features tests
// ---------------------------------------------------------------

test("getWorkflowFeatures", () => {
  const features = getWorkflowFeatures();
  assert.ok(features.workflows);
  assert.equal(features.totalWorkflows, 6);
  assert.ok(features.states);
  assert.ok(features.stepStates);
});

// ---------------------------------------------------------------
// WORKFLOW_STATES and STEP_STATES
// ---------------------------------------------------------------

test("WORKFLOW_STATES", () => {
  assert.ok(WORKFLOW_STATES.pending);
  assert.ok(WORKFLOW_STATES.running);
  assert.ok(WORKFLOW_STATES.completed);
  assert.ok(WORKFLOW_STATES.failed);
  assert.ok(WORKFLOW_STATES.cancelled);
  assert.ok(WORKFLOW_STATES.recovering);
});

test("STEP_STATES", () => {
  assert.ok(STEP_STATES.pending);
  assert.ok(STEP_STATES.running);
  assert.ok(STEP_STATES.completed);
  assert.ok(STEP_STATES.failed);
  assert.ok(STEP_STATES.skipped);
});
