import fs from "node:fs/promises";

import path from "node:path";

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

const { rest } = supabaseRestPkg;

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
