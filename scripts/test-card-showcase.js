const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const Module = require("node:module");
const ts = require("typescript");

const {
  createVault,
  addCard,
  findCardWithPhoto,
  getStoredSuggestedPrice,
} = require("../lib/cardVault");
const {
  buildCardShowcaseSpec,
  buildCardShowcaseProject,
  buildGeneralItemShowcaseRecord,
  formatCardShowcaseSlug,
} = require("../lib/cardCommercial");
const {
  cardShowcaseFileName,
  makeCardShowcaseCommercial,
} = require("../lib/commercialMaker");

const ROOT = path.resolve(__dirname, "..");

function loadTs(relativePath, requireMap = {}) {
  const absolutePath = path.join(ROOT, relativePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;

  const mod = new Module(absolutePath, module);
  mod.filename = absolutePath;
  mod.paths = Module._nodeModulePaths(path.dirname(absolutePath));
  const originalRequire = mod.require.bind(mod);
  mod.require = (request) => (request in requireMap ? requireMap[request] : originalRequire(request));
  mod._compile(transpiled, absolutePath);
  return mod.exports;
}

function tempDir(prefix = "card-showcase-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("vault selection: picks the first card that has a photo and skips photoless cards", () => {
  const dir = tempDir();
  try {
    const vault = createVault(path.join(dir, "vault.json"));
    addCard(vault, {
      frontImage: null,
      fields: { player: "No Photo Card", set: "Base", year: "2020", cardNumber: "1", identificationStatus: "confirmed" },
    });
    const withPhoto = addCard(vault, {
      frontImage: "/tmp/oddish.jpg",
      fields: { player: "Oddish", set: "Lost Origin", year: "2022", cardNumber: "001/196", identificationStatus: "confirmed" },
    });
    addCard(vault, {
      frontImage: "/tmp/second.jpg",
      fields: { player: "Second Card", set: "Base", year: "2023", cardNumber: "2", identificationStatus: "confirmed" },
    });

    const selected = findCardWithPhoto(vault);
    assert.equal(selected.id, withPhoto.id);
    assert.equal(selected.fields.player, "Oddish");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("vault selection: selects a specific card by id and errors cleanly if missing or lacking photo", () => {
  const dir = tempDir();
  try {
    const vault = createVault(path.join(dir, "vault.json"));
    const noPhoto = addCard(vault, {
      frontImage: null,
      fields: { player: "Photoless", set: "Base", year: "2021", cardNumber: "9", identificationStatus: "confirmed" },
    });
    const withPhoto = addCard(vault, {
      frontImage: "/tmp/card.jpg",
      fields: { player: "Ken Griffey Jr.", set: "Upper Deck", year: "1989", cardNumber: "1", identificationStatus: "confirmed" },
    });

    assert.equal(findCardWithPhoto(vault, withPhoto.id).id, withPhoto.id);
    assert.throws(() => findCardWithPhoto(vault, noPhoto.id), /no photo/i);
    assert.throws(() => findCardWithPhoto(vault, "card-does-not-exist"), /not found/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("price rule: never invents a price when none is stored; shows stored price only when already in vault", () => {
  assert.equal(getStoredSuggestedPrice({ id: "c1", fields: {} }), null);
  assert.equal(getStoredSuggestedPrice({ id: "c1", suggestedPrice: null }), null);
  assert.equal(getStoredSuggestedPrice({ id: "c1", suggestedPrice: 0 }), null);
  assert.equal(getStoredSuggestedPrice({ id: "c1", suggestedPrice: -5 }), null);
  assert.equal(getStoredSuggestedPrice({ id: "c1", suggestedPrice: "" }), null);
  assert.equal(getStoredSuggestedPrice({ id: "c1", suggestedPrice: 19.99 }), 19.99);
  assert.equal(getStoredSuggestedPrice({ id: "c1", seller_price_cents: 2450 }), 24.5);

  const unpricedSpec = buildCardShowcaseSpec({
    id: "card-unpriced",
    frontImage: "/img/oddish.jpg",
    fields: { player: "Oddish", set: "Lost Origin", year: "2022", cardNumber: "001/196" },
  });
  assert.equal(unpricedSpec.suggestedPrice, null);
  assert.ok(!JSON.stringify(unpricedSpec).includes("$"), "unpriced card showcase must never contain a price symbol");

  const pricedSpec = buildCardShowcaseSpec({
    id: "card-priced",
    frontImage: "/img/peterson.jpg",
    suggestedPrice: 19.99,
    fields: { player: "Adrian Peterson", set: "Bowman Chrome", year: "2007", cardNumber: "BC65" },
  });
  assert.equal(pricedSpec.suggestedPrice, 19.99);
});

test("card showcase project: 12s, 9:16, 30fps, Jardin's Outpost / BossListers branding, no voiceover, silent by default", () => {
  const project = buildCardShowcaseProject({
    id: "card-1",
    frontImage: "https://example.com/oddish.jpg",
    fields: { player: "Oddish", set: "Lost Origin", year: "2022", cardNumber: "001/196" },
  });

  assert.equal(project.projectType, "CARD_SHOWCASE");
  assert.equal(project.aspectRatio, "9:16");
  assert.equal(project.fps, 30);
  assert.equal(project.scenes.length, 1);
  assert.equal(project.scenes[0].durationSeconds, 12);
  assert.equal(project.audio.narrationUrl, undefined);
  assert.equal(project.audio.narrationVolume, 0);
  assert.equal(project.audio.musicUrl, undefined);

  assert.equal(project.cardShowcase.brandName, "Jardin's Outpost");
  assert.equal(project.cardShowcase.subBrand, "BossListers");
  assert.equal(project.cardShowcase.handle, "@jardinoutpost");
  assert.equal(project.cardShowcase.cardName, "Oddish");
  assert.equal(project.cardShowcase.setName, "Lost Origin");
  assert.equal(project.cardShowcase.year, "2022");
  assert.equal(project.cardShowcase.cardNumber, "001/196");
  assert.equal(project.cardShowcase.suggestedPrice, null);

  // Verify the TypeScript Zod schema accepts the generated project
  const typesMod = loadTs("lib/video-studio/types.ts");
  const parsed = typesMod.VideoProjectSchema.parse(project);
  assert.equal(parsed.projectType, "CARD_SHOWCASE");
  assert.equal(parsed.cardShowcase.suggestedPrice, null);
});

test("TS video-studio buildCardShowcaseDraft mirrors vault facts and validates via Zod", () => {
  const typesMod = loadTs("lib/video-studio/types.ts");
  const showcaseMod = loadTs("lib/video-studio/cardShowcase.ts", { "./types": typesMod });

  const draft = showcaseMod.buildCardShowcaseDraft({
    id: "card-ts-1",
    frontImage: "https://example.com/card.jpg",
    fields: {
      player: "Oddish",
      set: "Lost Origin",
      year: "2022",
      cardNumber: "001/196",
      graded: true,
      gradingCompany: "PSA",
      grade: "10",
    },
  });

  assert.equal(draft.projectType, "CARD_SHOWCASE");
  assert.equal(draft.aspectRatio, "9:16");
  assert.equal(draft.fps, 30);
  assert.equal(draft.scenes[0].durationSeconds, 12);
  assert.equal(draft.cardShowcase.detailTag, "PSA 10");
  assert.equal(draft.cardShowcase.suggestedPrice, null);
  assert.equal(showcaseMod.formatStoredPrice(draft.cardShowcase.suggestedPrice), "");
  assert.equal(showcaseMod.formatStoredPrice(25), "$25.00");
});

test("commercialMaker card-showcase mode: safe filename, Remotion volume lane, never auto-lists or auto-posts", async () => {
  const name = cardShowcaseFileName({
    id: "card-1",
    fields: { player: "Oddish", set: "Lost Origin", year: "2022", cardNumber: "001/196" },
  });
  assert.equal(name, "card-showcase-2022-lost-origin-oddish-001-196_reel_9_16.mp4");
  assert.match(name, /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}\.mp4$/);

  const dir = tempDir("maker-cs-");
  try {
    const calls = [];
    const fakeRun = async (args) => {
      calls.push(args);
      const outIdx = args.indexOf("--out");
      fs.writeFileSync(args[outIdx + 1], Buffer.alloc(2048, 3));
      return {
        code: 0,
        stderr: "",
        stdout: JSON.stringify({
          ok: true,
          card: {
            id: "card-1",
            name: "Oddish",
            set: "Lost Origin",
            year: "2022",
            cardNumber: "001/196",
            suggestedPrice: null,
          },
        }),
      };
    };

    const result = await makeCardShowcaseCommercial({
      vaultPath: "/tmp/fake-vault.json",
      dir,
      run: fakeRun,
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, "card-showcase");
    assert.equal(result.posted, false);
    assert.equal(result.listed, false);
    assert.equal(result.name, "card-showcase-2022-lost-origin-oddish-001-196_reel_9_16.mp4");
    assert.equal(result.bytes, 2048);
    assert.ok(fs.existsSync(path.join(dir, result.name)));
    assert.equal(calls.length, 1);
    assert.ok(calls[0][0].endsWith(path.join("scripts", "render-card-showcase.mjs")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI --dry-run reads vault photo + stored facts with zero re-typing", () => {
  const dir = tempDir("cli-cs-");
  try {
    const photoPath = path.join(dir, "oddish.jpg");
    fs.writeFileSync(photoPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    const vaultPath = path.join(dir, "vault.json");
    const vault = createVault(vaultPath);
    const added = addCard(vault, {
      frontImage: photoPath,
      fields: {
        cardGame: "Pokemon",
        player: "Oddish",
        set: "Lost Origin",
        year: "2022",
        cardNumber: "001/196",
        identificationStatus: "confirmed",
      },
      location: "Binder A",
      onHand: 1,
    });

    const proc = spawnSync(
      process.execPath,
      [path.join(ROOT, "scripts", "render-card-showcase.mjs"), "--vault", vaultPath, "--dry-run", "--json"],
      { encoding: "utf8", cwd: ROOT }
    );
    assert.equal(proc.status, 0, proc.stderr);
    const out = JSON.parse(proc.stdout);
    assert.equal(out.ok, true);
    assert.equal(out.dryRun, true);
    assert.equal(out.card.id, added.id);
    assert.equal(out.card.name, "Oddish");
    assert.equal(out.card.set, "Lost Origin");
    assert.equal(out.card.year, "2022");
    assert.equal(out.card.cardNumber, "001/196");
    assert.equal(out.card.suggestedPrice, null);
    assert.equal(out.video.width, 1080);
    assert.equal(out.video.height, 1920);
    assert.equal(out.video.fps, 30);
    assert.equal(out.video.durationSeconds, 12);
    assert.equal(out.video.hasVoiceover, false);
    assert.equal(out.posted, false);
    assert.equal(out.listed, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("brand hygiene: Card Showcase code contains none of the reference phrasing or auction lines", () => {
  const filesToCheck = [
    "lib/cardCommercial.js",
    "lib/video-studio/cardShowcase.ts",
    "video/CardShowcaseComposition.tsx",
    "scripts/render-card-showcase.mjs",
    "scripts/card_prep.py",
    "components/video-studio/CardShowcaseEditorPanel.tsx",
  ];
  const forbidden = [/today'?s card from the vault/i, /\bauction\b/i, /kaleidoscope/i];
  for (const rel of filesToCheck) {
    const content = fs.readFileSync(path.join(ROOT, rel), "utf8");
    for (const pattern of forbidden) {
      assert.equal(pattern.test(content), false, `${rel} must not match ${pattern}`);
    }
  }
  assert.ok(formatCardShowcaseSlug({ cardName: "Oddish" }).startsWith("card-showcase-"));
});

test("background replacement & cut-in pictures validate through Zod schema", () => {
  const typesMod = loadTs("lib/video-studio/types.ts");
  const project = buildCardShowcaseProject(
    {
      id: "card-bg-cutin",
      frontImage: "/cutouts/card.png",
      fields: { player: "Oddish", set: "Lost Origin", year: "2022", cardNumber: "001/196" },
    },
    {
      background: {
        preset: "gold-rays",
        imageUrl: "/backgrounds/bg-cta.jpg",
        dim: 0.35,
        motion: "subtle",
      },
      cardStage: {
        removeBg: "card",
        backgroundRemoved: true,
        backdropPreset: "dark-velvet",
        frameStyle: "floating",
        zoom: 1.08,
      },
      cutIns: [
        {
          id: "cut-back",
          imageUrl: "/cutouts/back.png",
          label: "Back of Card",
          layout: "split",
          transition: "slide-left",
          startSec: 5.0,
          durationSec: 2.3,
          removeBg: "card",
          backgroundRemoved: true,
        },
        {
          id: "cut-art",
          imageUrl: "/cutouts/art.png",
          label: "Art Detail",
          layout: "pip",
          position: "bottom-right",
          transition: "zoom",
          startSec: 7.4,
          durationSec: 2.0,
        },
      ],
    }
  );

  const parsed = typesMod.VideoProjectSchema.parse(project);
  assert.equal(parsed.cardShowcase.background.preset, "gold-rays");
  assert.equal(parsed.cardShowcase.cardStage.backgroundRemoved, true);
  assert.equal(parsed.cardShowcase.cardStage.frameStyle, "floating");
  assert.equal(parsed.cardShowcase.cutIns.length, 2);
  assert.equal(parsed.cardShowcase.cutIns[0].layout, "split");
  assert.equal(parsed.cardShowcase.cutIns[1].layout, "pip");
  assert.equal(parsed.cardShowcase.cutIns[1].position, "bottom-right");
  assert.equal(parsed.cardShowcase.suggestedPrice, null);
});

test("CLI --dry-run resolves background presets, stage options, --cut-in specs, and --auto-closeup", () => {
  const dir = tempDir("cli-bg-cutin-");
  try {
    const frontPath = path.join(dir, "front.jpg");
    const extraPic = path.join(dir, "detail.jpg");
    fs.writeFileSync(frontPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    fs.writeFileSync(extraPic, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

    const vaultPath = path.join(dir, "vault.json");
    const vault = createVault(vaultPath);
    addCard(vault, {
      frontImage: frontPath,
      fields: { player: "Oddish", set: "Lost Origin", year: "2022", cardNumber: "001/196", identificationStatus: "confirmed" },
    });

    const proc = spawnSync(
      process.execPath,
      [
        path.join(ROOT, "scripts", "render-card-showcase.mjs"),
        "--vault", vaultPath,
        "--bg-preset", "gold-rays",
        "--card-bg", "gold-glow",
        "--frame", "floating",
        "--bg-remove", "card",
        "--cut-in", `${extraPic}|label=Holo Check|layout=pip|pos=top-right|transition=zoom|start=5.1|dur=2.2|bg=cutout`,
        "--auto-closeup",
        "--dry-run",
        "--json",
      ],
      { encoding: "utf8", cwd: ROOT }
    );
    assert.equal(proc.status, 0, proc.stderr);
    const out = JSON.parse(proc.stdout);
    assert.equal(out.ok, true);
    assert.equal(out.background.preset, "gold-rays");
    assert.ok(out.background.imageUrl.endsWith(path.join("backgrounds", "bg-cta.jpg")));
    assert.equal(out.cardStage.removeBg, "card");
    assert.equal(out.cardStage.backdropPreset, "gold-glow");
    assert.equal(out.cardStage.frameStyle, "floating");
    assert.equal(out.cutIns.length, 2);
    assert.equal(out.cutIns[0].label, "Holo Check");
    assert.equal(out.cutIns[0].layout, "pip");
    assert.equal(out.cutIns[0].position, "top-right");
    assert.equal(out.cutIns[0].transition, "zoom");
    assert.equal(out.cutIns[0].removeBg, "cutout");
    assert.equal(out.cutIns[1].id, "cutin-auto-closeup");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("commercialMaker forwards background replacement and cut-in flags safely", async () => {
  const dir = tempDir("maker-bg-");
  try {
    let seenArgs = [];
    const fakeRun = async (args) => {
      seenArgs = args;
      const outIdx = args.indexOf("--out");
      fs.writeFileSync(args[outIdx + 1], Buffer.alloc(2048, 7));
      return {
        code: 0,
        stderr: "",
        stdout: JSON.stringify({ ok: true, card: { id: "c1", name: "Oddish" } }),
      };
    };

    const res = await makeCardShowcaseCommercial({
      vaultPath: "/tmp/vault.json",
      bgPreset: "studio-spotlight",
      cardBgPreset: "transparent",
      removeBg: "card",
      frameStyle: "floating",
      autoCloseup: true,
      dir,
      run: fakeRun,
    });

    assert.equal(res.ok, true);
    assert.ok(seenArgs.includes("--bg-preset"));
    assert.ok(seenArgs.includes("studio-spotlight"));
    assert.ok(seenArgs.includes("--card-bg"));
    assert.ok(seenArgs.includes("--bg-remove"));
    assert.ok(seenArgs.includes("--frame"));
    assert.ok(seenArgs.includes("--auto-closeup"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("scripts/card_prep.py removes background, straightens tilted card, extracts closeup, and replaces backdrop locally", () => {
  let pyBin = null;
  for (const bin of ["python3", "python"]) {
    const check = spawnSync(bin, ["-c", "import cv2, PIL, numpy"], { encoding: "utf8" });
    if (!check.error && check.status === 0) {
      pyBin = bin;
      break;
    }
  }
  if (!pyBin) return; // Skip cleanly on environments without Python/OpenCV

  const dir = tempDir("card-prep-py-");
  try {
    const rawCard = path.join(dir, "tilted-card.jpg");
    const cutoutOut = path.join(dir, "card-cutout.png");
    const closeupOut = path.join(dir, "card-closeup.png");
    const replacedOut = path.join(dir, "card-replaced.jpg");

    // Create a synthetic photo of a tilted yellow-bordered card on a dark desk
    const mkCard = spawnSync(
      pyBin,
      [
        "-c",
        [
          "import cv2, numpy as np, sys",
          "img = np.full((800, 600, 3), (38, 42, 50), dtype=np.uint8)",
          "pts = np.array([[130, 150], [475, 162], [462, 650], [118, 638]], dtype=np.int32)",
          "cv2.fillConvexPoly(img, pts, (120, 210, 245))",
          "inner = np.array([[155, 180], [450, 190], [438, 622], [142, 610]], dtype=np.int32)",
          "cv2.fillConvexPoly(img, inner, (70, 175, 110))",
          "art = np.array([[172, 220], [432, 228], [426, 408], [166, 400]], dtype=np.int32)",
          "cv2.fillConvexPoly(img, art, (215, 140, 65))",
          "cv2.imwrite(sys.argv[1], img)",
        ].join("\n"),
        rawCard,
      ],
      { encoding: "utf8" }
    );
    assert.equal(mkCard.status, 0, mkCard.stderr);

    const prep1 = spawnSync(
      pyBin,
      [path.join(ROOT, "scripts", "card_prep.py"), "--input", rawCard, "--output", cutoutOut, "--mode", "card"],
      { encoding: "utf8" }
    );
    assert.equal(prep1.status, 0, prep1.stderr);
    const meta1 = JSON.parse(prep1.stdout);
    assert.equal(meta1.ok, true);
    assert.equal(meta1.background_removed, true);
    assert.equal(meta1.width, 1000);
    assert.equal(meta1.height, 1400);
    assert.ok(fs.existsSync(cutoutOut));

    // Verify rounded transparent corner pixel (0,0) has alpha === 0
    const alphaCheck = spawnSync(
      pyBin,
      ["-c", "from PIL import Image; import sys; im=Image.open(sys.argv[1]); print(im.mode, im.getpixel((0,0))[3], im.getpixel((500,700))[3])", cutoutOut],
      { encoding: "utf8" }
    );
    assert.equal(alphaCheck.status, 0, alphaCheck.stderr);
    const [mode, cornerA, centerA] = alphaCheck.stdout.trim().split(" ");
    assert.equal(mode, "RGBA");
    assert.equal(Number(cornerA), 0, "rounded card corner must be transparent");
    assert.equal(Number(centerA), 255, "card center must be opaque");

    // Verify closeup extraction
    const prep2 = spawnSync(
      pyBin,
      [path.join(ROOT, "scripts", "card_prep.py"), "--input", rawCard, "--output", closeupOut, "--mode", "closeup", "--region", "art"],
      { encoding: "utf8" }
    );
    assert.equal(prep2.status, 0, prep2.stderr);
    const meta2 = JSON.parse(prep2.stdout);
    assert.equal(meta2.ok, true);
    assert.ok(meta2.width > 500 && meta2.height > 250);

    // Verify static background replacement
    const prep3 = spawnSync(
      pyBin,
      [path.join(ROOT, "scripts", "card_prep.py"), "--input", rawCard, "--output", replacedOut, "--mode", "card", "--replace-bg-preset", "emerald-vault"],
      { encoding: "utf8" }
    );
    assert.equal(prep3.status, 0, prep3.stderr);
    const meta3 = JSON.parse(prep3.stdout);
    assert.equal(meta3.ok, true);
    assert.equal(meta3.background_replaced, true);
    assert.ok(fs.existsSync(replacedOut));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("buildGeneralItemShowcaseRecord builds a 2-item bundle showcase without inventing a price", () => {
  const rec = buildGeneralItemShowcaseRecord({
    photoUrl: "/tmp/bundle.jpg",
    title: "Happy Smiles Bundle",
    subtitle: "Mint Breeze & Mouthwash Dispenser",
    detailTag: "2-Item Bundle · 6.76 fl oz + 6.4 fl oz",
  });

  const project = buildCardShowcaseProject(rec, {
    cardStage: { removeBg: "cutout", backgroundRemoved: true, frameStyle: "floating" },
  });

  assert.equal(project.cardShowcase.cardName, "Happy Smiles Bundle");
  assert.equal(project.cardShowcase.setName, "Mint Breeze & Mouthwash Dispenser");
  assert.equal(project.cardShowcase.detailTag, "2-Item Bundle · 6.76 fl oz + 6.4 fl oz");
  assert.equal(project.cardShowcase.suggestedPrice, null);
  assert.equal(project.cardShowcase.cardStage.frameStyle, "floating");
  assert.equal(project.cardShowcase.cardStage.removeBg, "cutout");
  assert.ok(formatCardShowcaseSlug(project.cardShowcase, "item-showcase").startsWith("item-showcase-"));
});

test("render-card-showcase CLI supports direct --photo general bundle mode with --auto-bundle-cutins", () => {
  const dir = tempDir("bundle-cli-");
  try {
    const photoPath = path.join(dir, "bundle.jpg");
    fs.writeFileSync(photoPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

    const proc = spawnSync(
      process.execPath,
      [
        path.join(ROOT, "scripts", "render-card-showcase.mjs"),
        "--photo", photoPath,
        "--title", "Happy Smiles Bundle",
        "--subtitle", "Mint Breeze & Mouthwash Dispenser",
        "--detail", "2-Item Bundle · 6.76 fl oz + 6.4 fl oz",
        "--auto-bundle-cutins",
        "--item1-label", "1 of 2 · Mint Breeze",
        "--item2-label", "2 of 2 · Dispenser",
        "--dry-run",
        "--json",
      ],
      { encoding: "utf8", cwd: ROOT }
    );
    assert.equal(proc.status, 0, proc.stderr);
    const out = JSON.parse(proc.stdout);
    assert.equal(out.ok, true);
    assert.equal(out.vaultPath, null);
    assert.equal(out.card.name, "Happy Smiles Bundle");
    assert.equal(out.card.suggestedPrice, null);
    assert.equal(out.cardStage.removeBg, "cutout");
    assert.equal(out.cardStage.frameStyle, "floating");
    assert.equal(out.cutIns.length, 2);
    assert.equal(out.cutIns[0].label, "1 of 2 · Mint Breeze");
    assert.equal(out.cutIns[1].label, "2 of 2 · Dispenser");
    assert.equal(out.cutIns[0].transition, "slide-left");
    assert.ok(out.video.outputPath.includes("item-showcase-"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("scripts/card_prep.py splits a 2-item bundle into individual cutouts and drops tiny edge clutter", () => {
  let pyBin = null;
  for (const bin of ["python3", "python"]) {
    const check = spawnSync(bin, ["-c", "import cv2, PIL, numpy"], { encoding: "utf8" });
    if (!check.error && check.status === 0) {
      pyBin = bin;
      break;
    }
  }
  if (!pyBin) return;

  const dir = tempDir("bundle-split-py-");
  try {
    const rawBundle = path.join(dir, "bundle.jpg");
    const cutoutOut = path.join(dir, "bundle-cutout.png");
    const splitDir = path.join(dir, "split");

    // Create a synthetic 2-item photo on a uniform wood-tone table + tiny stray corner debris
    const mkBundle = spawnSync(
      pyBin,
      [
        "-c",
        [
          "import cv2, numpy as np, sys",
          "img = np.full((600, 600, 3), (45, 78, 125), dtype=np.uint8)",
          "cv2.rectangle(img, (80, 180), (260, 520), (210, 170, 40), -1)",   // Left bottle
          "cv2.rectangle(img, (340, 100), (520, 520), (35, 115, 240), -1)",  // Right tall dispenser
          "cv2.rectangle(img, (575, 0), (600, 35), (20, 20, 220), -1)",      // Tiny stray top-right corner
          "cv2.imwrite(sys.argv[1], img)",
        ].join("\n"),
        rawBundle,
      ],
      { encoding: "utf8" }
    );
    assert.equal(mkBundle.status, 0, mkBundle.stderr);

    const prep = spawnSync(
      pyBin,
      [
        path.join(ROOT, "scripts", "card_prep.py"),
        "--input", rawBundle,
        "--output", cutoutOut,
        "--mode", "cutout",
        "--no-rmbg",
        "--split-out-dir", splitDir,
      ],
      { encoding: "utf8" }
    );
    assert.equal(prep.status, 0, prep.stderr);
    const meta = JSON.parse(prep.stdout);
    assert.equal(meta.ok, true);
    assert.equal(meta.background_removed, true);
    assert.equal(Array.isArray(meta.split_items), true);
    assert.equal(meta.split_items.length, 2);
    assert.ok(fs.existsSync(meta.split_items[0].path));
    assert.ok(fs.existsSync(meta.split_items[1].path));
    assert.ok(meta.split_items[0].width > 100 && meta.split_items[0].height > 200);
    assert.ok(meta.split_items[1].width > 100 && meta.split_items[1].height > 200);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

