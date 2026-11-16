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
