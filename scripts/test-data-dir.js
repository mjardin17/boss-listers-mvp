#!/usr/bin/env node
/** Universal Creative data-dir: permanent storage outside tests, temp folder under node --test. */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const modPath = path.join(__dirname, "..", "lib", "universal-creative", "data-dir.js");

function rootIn(env) {
  const r = spawnSync(process.execPath, ["-e", `console.log(require(${JSON.stringify(modPath)}).dataRoot())`], {
    env: { ...process.env, NODE_TEST_CONTEXT: "", ...env },
    encoding: "utf8",
  });
  return r.stdout.trim();
}

test("uses DATA_DIR/universal-creative when DATA_DIR is set", () => {
  const dir = path.join(os.tmpdir(), "fake-render-disk");
  assert.equal(rootIn({ DATA_DIR: dir }), path.join(dir, "universal-creative"));
});

test("falls back to ./data/universal-creative without DATA_DIR", () => {
  assert.equal(rootIn({ DATA_DIR: "" }), path.join(process.cwd(), "data", "universal-creative"));
});

test("never points at real data while running under node --test", () => {
  const { dataRoot, dataPath } = require(modPath);
  assert.ok(dataRoot().startsWith(os.tmpdir()));
  assert.equal(dataPath("crm"), path.join(dataRoot(), "crm"));
});
