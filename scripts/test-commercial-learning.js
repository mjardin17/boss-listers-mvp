const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  detectItemCategory,
  computeEffectiveScore,
  recommendCommercialRecipe,
  recordCommercialRun,
  recordCommercialFeedback,
  summarizeLearningProgress,
} = require("../lib/commercialLearning");

const ROOT = path.resolve(__dirname, "..");

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("detectItemCategory separates trading cards, multi-item resale bundles, and single general items", () => {
  assert.equal(detectItemCategory({ isDirectItem: false, title: "Oddish", subtitle: "Lost Origin" }), "trading-card");
  assert.equal(
    detectItemCategory({
      isDirectItem: true,
      title: "Happy Smiles Bundle",
      subtitle: "Mint Breeze & Dispenser",
      detailTag: "2-Item Bundle · 6.76 fl oz + 6.4 fl oz",
    }),
    "resale-bundle"
  );
  assert.equal(
    detectItemCategory({ isDirectItem: true, autoBundleCutins: true, title: "Two Bottles" }),
    "resale-bundle"
  );
  assert.equal(
    detectItemCategory({ isDirectItem: true, title: "Vintage Coleman Lantern", subtitle: "1974 Model" }),
    "single-item"
  );
});

test("learning engine shifts winning recipe toward higher-scoring commercials and calibrates bgDim", () => {
  const dir = tempDir("learn-opt-");
  const storePath = path.join(dir, "learning.json");
  try {
    // Run 1: mediocre warm-bokeh run with bright text backdrop (QC suggests +0.10 bgDimDelta)
    recordCommercialRun(
      {
        category: "resale-bundle",
        title: "Bundle A",
        recipe: {
          bgPreset: "warm-bokeh",
          bgDim: 0.14,
          frameStyle: "gold-frame",
          removeBg: "cutout",
          cutInTransition: "fade",
          autoBundleCutins: false,
        },
        qc: {
          ok: true,
          overallScore: 72,
          scores: { technical: 100, cutout: 84, contrast: 65, pacing: 70, framing: 82 },
          issues: ["Backdrop behind bottom text is bright"],
          strengths: [],
          adjustments: { bgDimDelta: 0.1, recommendAutoBundleCutins: true },
        },
      },
      storePath
    );

    // Run 2 & 3: crisp studio-spotlight + floating + auto-bundle cut-ins
    recordCommercialRun(
      {
        category: "resale-bundle",
        title: "Bundle B",
        recipe: {
          bgPreset: "studio-spotlight",
          bgDim: 0.22,
          frameStyle: "floating",
          removeBg: "cutout",
          cutInTransition: "slide-left",
          autoBundleCutins: true,
        },
        qc: {
          ok: true,
          overallScore: 95,
          scores: { technical: 100, cutout: 98, contrast: 96, pacing: 96, framing: 94 },
          issues: [],
          strengths: ["Strong subject separation"],
          adjustments: {},
        },
      },
      storePath
    );

    const third = recordCommercialRun(
      {
        category: "resale-bundle",
        title: "Bundle C",
        recipe: {
          bgPreset: "studio-spotlight",
          bgDim: 0.20,
          frameStyle: "floating",
          removeBg: "cutout",
          cutInTransition: "slide-left",
          autoBundleCutins: true,
        },
        qc: {
          ok: true,
          overallScore: 98,
          scores: { technical: 100, cutout: 99, contrast: 99, pacing: 100, framing: 96 },
          issues: [],
          strengths: ["Dynamic multi-cut pacing"],
          adjustments: {},
        },
      },
      storePath
    );

    assert.equal(third.isNewBest, true);
    assert.ok(third.playbook.trendDelta > 0, `expected positive trendDelta, got ${third.playbook.trendDelta}`);

    const rec = recommendCommercialRecipe({ category: "resale-bundle", storePath });
    assert.equal(rec.recipe.bgPreset, "studio-spotlight");
    assert.equal(rec.recipe.frameStyle, "floating");
    assert.equal(rec.recipe.cutInTransition, "slide-left");
    assert.equal(rec.recipe.autoBundleCutins, true);
    assert.ok(rec.recipe.bgDim >= 0.18 && rec.recipe.bgDim <= 0.36);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("explicit user overrides are never overwritten by learned defaults", () => {
  const dir = tempDir("learn-override-");
  const storePath = path.join(dir, "learning.json");
  try {
    recordCommercialRun(
      {
        category: "trading-card",
        title: "Oddish",
        recipe: { bgPreset: "studio-spotlight", bgDim: 0.24, frameStyle: "gold-frame" },
        qc: {
          ok: true,
          overallScore: 96,
          scores: { technical: 100, cutout: 97, contrast: 95, pacing: 94, framing: 95 },
          adjustments: {},
        },
      },
      storePath
    );

    const rec = recommendCommercialRecipe({
      category: "trading-card",
      explicitOverrides: { bgPreset: "emerald-vault", bgDim: 0.4, frameStyle: "minimal" },
      storePath,
      explore: true,
    });

    assert.equal(rec.recipe.bgPreset, "emerald-vault");
    assert.equal(rec.recipe.bgDim, 0.4);
    assert.equal(rec.recipe.frameStyle, "minimal");
    assert.ok(!rec.appliedFromLearning.includes("bgPreset"));
    assert.ok(!rec.appliedFromLearning.includes("bgDim"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("human ratings, brightness tags, and real sales outcomes immediately re-rank winning recipes", () => {
  const dir = tempDir("learn-feedback-");
  const storePath = path.join(dir, "learning.json");
  try {
    const r1 = recordCommercialRun(
      {
        category: "trading-card",
        title: "Card 1",
        recipe: { bgPreset: "studio-spotlight", bgDim: 0.24, frameStyle: "gold-frame" },
        qc: {
          ok: true,
          overallScore: 90,
          scores: { technical: 100, cutout: 92, contrast: 88, pacing: 86, framing: 90 },
          adjustments: {},
        },
      },
      storePath
    );

    const r2 = recordCommercialRun(
      {
        category: "trading-card",
        title: "Card 2",
        recipe: { bgPreset: "gold-rays", bgDim: 0.30, frameStyle: "gold-frame" },
        qc: {
          ok: true,
          overallScore: 86,
          scores: { technical: 100, cutout: 92, contrast: 82, pacing: 84, framing: 88 },
          adjustments: {},
        },
      },
      storePath
    );

    // Initially studio-spotlight wins on QC alone (90 vs 86)
    assert.equal(recommendCommercialRecipe({ category: "trading-card", storePath }).recipe.bgPreset, "studio-spotlight");

    // User rates Card 1 poorly ("bg-too-bright") and marks Card 2 as 5-star + sold!
    recordCommercialFeedback(
      { runId: r1.run.id, rating: 2, tags: ["bg-too-bright"] },
      storePath
    );
    const soldUpdate = recordCommercialFeedback(
      { runId: r2.run.id, rating: 5, tags: ["loved-backdrop", "item-sold"], inquiries: 4, sold: true },
      storePath
    );

    assert.ok(soldUpdate.run.effectiveScore > 95);
    assert.equal(soldUpdate.playbook.winningRecipe.bgPreset, "gold-rays");
    assert.ok(soldUpdate.playbook.winningRecipe.bgDim > 0.30, "bg-too-bright feedback should nudge bgDim higher");

    const summary = summarizeLearningProgress(storePath);
    assert.equal(summary.totalRuns, 2);
    assert.equal(summary.ratedRuns, 2);
    assert.equal(summary.soldCount, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("explore mode tests untried high-potential backdrops without breaking category memory", () => {
  const dir = tempDir("learn-explore-");
  const storePath = path.join(dir, "learning.json");
  try {
    recordCommercialRun(
      {
        category: "single-item",
        title: "Lantern",
        recipe: { bgPreset: "studio-spotlight", bgDim: 0.2, frameStyle: "floating" },
        qc: {
          ok: true,
          overallScore: 91,
          scores: { technical: 100, cutout: 95, contrast: 90, pacing: 82, framing: 92 },
          adjustments: {},
        },
      },
      storePath
    );

    const rec = recommendCommercialRecipe({ category: "single-item", storePath, explore: true });
    assert.ok(rec.explorationApplied, "expected exploration to pick an untried backdrop");
    assert.notEqual(rec.recipe.bgPreset, "studio-spotlight");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI --learning-report, --rate, and next-run learned recipe application work end-to-end", () => {
  const dir = tempDir("learn-cli-");
  const storePath = path.join(dir, "learning.json");
  const photoPath = path.join(dir, "bundle.jpg");
  try {
    fs.writeFileSync(photoPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

    // Seed a high-scoring resale-bundle run with gold-rays + dim 0.28
    const seeded = recordCommercialRun(
      {
        category: "resale-bundle",
        title: "Seeded Bundle",
        recipe: {
          bgPreset: "gold-rays",
          bgDim: 0.28,
          frameStyle: "floating",
          removeBg: "cutout",
          cutInTransition: "zoom",
          autoBundleCutins: true,
        },
        qc: {
          ok: true,
          overallScore: 97,
          scores: { technical: 100, cutout: 98, contrast: 96, pacing: 97, framing: 95 },
          adjustments: {},
        },
      },
      storePath
    );

    // Rate it via CLI
    const rateProc = spawnSync(
      process.execPath,
      [
        path.join(ROOT, "scripts", "render-card-showcase.mjs"),
        "--learning-store", storePath,
        "--rate", seeded.run.id,
        "--stars", "5",
        "--tags", "loved-backdrop,clean-cutout",
        "--sold",
        "--json",
      ],
      { encoding: "utf8", cwd: ROOT }
    );
    assert.equal(rateProc.status, 0, rateProc.stderr);
    const rated = JSON.parse(rateProc.stdout);
    assert.equal(rated.ok, true);
    assert.equal(rated.run.feedback.rating, 5);
    assert.equal(rated.run.feedback.sold, true);

    // Inspect report via CLI
    const repProc = spawnSync(
      process.execPath,
      [
        path.join(ROOT, "scripts", "render-card-showcase.mjs"),
        "--learning-store", storePath,
        "--learning-report",
        "--json",
      ],
      { encoding: "utf8", cwd: ROOT }
    );
    assert.equal(repProc.status, 0, repProc.stderr);
    const report = JSON.parse(repProc.stdout);
    assert.equal(report.totalRuns, 1);
    assert.equal(report.soldCount, 1);

    // Next bundle commercial with NO explicit backdrop/dim flags automatically inherits learned winner!
    const nextProc = spawnSync(
      process.execPath,
      [
        path.join(ROOT, "scripts", "render-card-showcase.mjs"),
        "--learning-store", storePath,
        "--photo", photoPath,
        "--title", "Next 2-Item Bundle",
        "--detail", "2-Item Bundle",
        "--dry-run",
        "--json",
      ],
      { encoding: "utf8", cwd: ROOT }
    );
    assert.equal(nextProc.status, 0, nextProc.stderr);
    const nextSpec = JSON.parse(nextProc.stdout);
    assert.equal(nextSpec.category, "resale-bundle");
    assert.equal(nextSpec.background.preset, "gold-rays");
    assert.equal(nextSpec.background.dim, 0.28);
    assert.equal(nextSpec.cardStage.frameStyle, "floating");
    assert.equal(nextSpec.cutIns.length, 2, "learned autoBundleCutins should automatically enable 2 solo cut-ins");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("scripts/commercial_qc.py audits a real rendered MP4 when present", () => {
  const sampleMp4 = path.join(
    ROOT,
    "public",
    "commercials",
    "item-showcase-happy-smiles-2-item-bundle_reel_9_16.mp4"
  );
  if (!fs.existsSync(sampleMp4)) return;

  let pyBin = null;
  for (const bin of ["python3", "python"]) {
    const probe = spawnSync(bin, ["-c", "import cv2, numpy"], { encoding: "utf8" });
    if (!probe.error && probe.status === 0) {
      pyBin = bin;
      break;
    }
  }
  if (!pyBin) return;

  const res = spawnSync(
    pyBin,
    [
      path.join(ROOT, "scripts", "commercial_qc.py"),
      "--video", sampleMp4,
      "--category", "resale-bundle",
      "--prep-strategy", "rmbg14_onnx",
      "--bg-removed",
      "--coverage-pct", "61.3",
      "--bg-dim", "0.16",
      "--frame-style", "floating",
      "--cutin-count", "2",
    ],
    { encoding: "utf8", cwd: ROOT }
  );
  assert.equal(res.status, 0, res.stderr);
  const qc = JSON.parse(res.stdout);
  assert.equal(qc.ok, true);
  assert.ok(qc.overallScore >= 85 && qc.overallScore <= 100);
  assert.equal(qc.metrics.framesAnalyzed, 6);
  assert.equal(qc.metrics.width, 1080);
  assert.equal(qc.metrics.height, 1920);
  assert.ok(computeEffectiveScore({ qc }) >= 85);
});
