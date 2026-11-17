import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  bundle
} from "@remotion/bundler";

import {
  getCompositions,
  renderMedia
} from "@remotion/renderer";

// lib/supabaseRest.js is CommonJS — import its default (module.exports)
// rather than a named import, which Node's ESM/CJS interop can't always
// statically resolve for a dynamically assigned module.exports object.
import supabaseRestPkg from "../lib/supabaseRest.js";
import commercialLearningPkg from "../lib/commercialLearning.js";

const { rest } = supabaseRestPkg;
const { detectItemCategory, recordCommercialRun } = commercialLearningPkg;

const projectId =
  process.argv[2];

const tenantId =
  process.argv[3];

if (!projectId) {
  throw new Error(
    "project id required"
  );
}

if (!tenantId) {
  throw new Error(
    "tenant id required — this worker reads/writes tenant-scoped Supabase rows"
  );
}

const root =
  process.env
    .VIDEO_STUDIO_DATA_DIR ||
  path.join(
    process.cwd(),
    ".video-studio-data"
  );

const outputDir =
  path.join(
    root,
    "renders"
  );

await fs.mkdir(
  outputDir,
  {
    recursive: true
  }
);

const readProject =
  async () => {
    const rows =
      await rest(
        process.env,
        "GET",
        `video_studio_projects?id=eq.${encodeURIComponent(projectId)}&tenant_id=eq.${encodeURIComponent(tenantId)}`
      );

    if (!rows.length) {
      throw new Error(
        `video project ${projectId} not found for tenant ${tenantId}`
      );
    }

    return rows[0].project;
  };

const writeProject =
  async (
    project
  ) =>
    rest(
      process.env,
      "POST",
      "video_studio_projects?on_conflict=id",
      {
        id:
          projectId,
        tenant_id:
          tenantId,
        render_status:
          project.renderStatus,
        project: {
          ...project,

          updatedAt:
            new Date()
              .toISOString()
        }
      },
      { Prefer: "resolution=merge-duplicates" }
    );

try {
  let project =
    await readProject();

  await writeProject({
    ...project,

    renderStatus:
      "RENDERING",

    renderProgress:
      5,

    renderError:
      undefined
  });

  const serveUrl =
    await bundle({
      entryPoint:
        path.join(
          process.cwd(),
          "video",
          "index.ts"
        ),
      publicDir:
        path.join(
          process.cwd(),
          "public"
        )
    });

  const compositions =
    await getCompositions(
      serveUrl,
      {
        inputProps: {
          project
        }
      }
    );

  const composition =
    compositions.find(
      (candidate) =>
        candidate.id ===
        "BossListerVideo"
    );

  if (!composition) {
    throw new Error(
      "BossListerVideo composition not found"
    );
  }

  const durationInFrames =
    project.scenes.reduce(
      (
        sum,
        scene
      ) =>
        sum +
        Math.max(
          1,
          Math.round(
            scene.durationSeconds *
              project.fps
          )
        ),
      0
    );

  const outputLocation =
    path.join(
      outputDir,
      `${project.id}.mp4`
    );

  await renderMedia({
    composition: {
      ...composition,
      durationInFrames
    },

    serveUrl,

    codec:
      "h264",

    outputLocation,

    inputProps: {
      project
    },

    onProgress:
      async ({
        progress
      }) => {
        if (
          progress === 1 ||
          Math.round(
            progress *
              100
          ) %
            10 ===
            0
        ) {
          project =
            await readProject();

          await writeProject({
            ...project,

            renderStatus:
              "RENDERING",

            renderProgress:
              Math.max(
                5,
                Math.round(
                  progress *
                    100
                )
              )
          });
        }
      }
  });

  project =
    await readProject();

  await writeProject({
    ...project,

    renderStatus:
      "SUCCEEDED",

    renderProgress:
      100,

    outputUrl:
      `/api/video-studio/output/${project.id}`
  });

  // Record finished showcase renders in local learning memory so Video Studio UI renders
  // also continuously sharpen future commercials (never fails a completed render).
  if (project.projectType === "CARD_SHOWCASE" && project.cardShowcase) {
    try {
      const sc = project.cardShowcase;
      const category = detectItemCategory({
        isDirectItem: sc.cardStage?.removeBg === "cutout" || sc.cardStage?.frameStyle === "floating",
        title: sc.cardName || project.title,
        subtitle: sc.setName || "",
        detailTag: sc.detailTag || "",
        cutIns: sc.cutIns || [],
      });
      let qc = null;
      for (const pyBin of ["python3", "python"]) {
        const qcScript = path.join(process.cwd(), "scripts", "commercial_qc.py");
        const probe = spawnSync(
          pyBin,
          [
            qcScript,
            "--video", outputLocation,
            "--category", category,
            "--prep-strategy", sc.cardStage?.backgroundRemoved ? (sc.cardStage.removeBg || "card") : "none",
            ...(sc.cardStage?.backgroundRemoved ? ["--bg-removed"] : []),
            "--frame-style", sc.cardStage?.frameStyle || "gold-frame",
            "--cutin-count", String(Array.isArray(sc.cutIns) ? sc.cutIns.length : 0),
            ...(typeof sc.background?.dim === "number" ? ["--bg-dim", String(sc.background.dim)] : []),
          ],
          { encoding: "utf8", windowsHide: true, timeout: 60_000 }
        );
        if (!probe.error && probe.status === 0) {
          qc = JSON.parse(probe.stdout || "null");
          break;
        }
      }
      recordCommercialRun({
        category,
        title: sc.cardName || project.title,
        fileName: path.basename(outputLocation),
        outputPath: outputLocation,
        prepStrategy: sc.cardStage?.backgroundRemoved ? (sc.cardStage.removeBg || "card") : "none",
        cutInCount: Array.isArray(sc.cutIns) ? sc.cutIns.length : 0,
        recipe: {
          bgPreset: sc.background?.preset || "studio-spotlight",
          bgDim: typeof sc.background?.dim === "number" ? sc.background.dim : 0.22,
          bgMotion: sc.background?.motion || "subtle",
          cardBgPreset: sc.cardStage?.backdropPreset || "transparent",
          frameStyle: sc.cardStage?.frameStyle || "gold-frame",
          removeBg: sc.cardStage?.removeBg || "card",
          cutInTransition: (sc.cutIns && sc.cutIns[0]?.transition) || "slide-left",
          cutInLayout: (sc.cutIns && sc.cutIns[0]?.layout) || "full",
          autoCloseup: false,
          autoBundleCutins: false,
        },
        qc,
      });
    } catch {
      // Learning telemetry must never fail a completed video render
    }
  }

} catch (error) {
  const project =
    await readProject()
      .catch(
        () => null
      );

  if (project) {
    await writeProject({
      ...project,

      renderStatus:
        "FAILED",

      renderError:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }

  process.exitCode =
    1;
}
