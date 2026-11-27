const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { readBible, FILES } = require("../lib/bibleFiles");

test("readBible returns each Bible file's text", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bible-"));
  for (const name of FILES) fs.writeFileSync(path.join(dir, name), `# ${name}\nentry`);
  const out = readBible(dir);
  assert.deepStrictEqual(Object.keys(out), FILES);
  assert.match(out["BIBLE.md"], /entry/);
});

test("a missing Bible file is reported, not thrown", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bible-empty-"));
  const out = readBible(dir);
  assert.strictEqual(out["README.md"], "(missing: README.md)");
});

test("the Bible route refuses requests without a sign-in", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "pages", "api", "bible.js"), "utf8");
  assert.match(src, /requireOwnerSession/);
});

test("readProjects returns the project list and tolerates a missing file", () => {
  const { readProjects } = require("../lib/bibleFiles");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "home-"));
  assert.deepStrictEqual(readProjects(dir), { updated: null, projects: [] });
  fs.writeFileSync(path.join(dir, "projects.json"), JSON.stringify({ updated: "x", projects: [{ name: "a" }] }));
  assert.strictEqual(readProjects(dir).projects[0].name, "a");
});

test("the home route refuses requests without the owner session", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "pages", "api", "home.js"), "utf8");
  assert.match(src, /requireOwnerSession/);
});
