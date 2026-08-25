import fs from "node:fs/promises";

import path from "node:path";

import {
  bundle
} from "@remotion/bundler";

import {
  getCompositions,
  renderMedia
} from "@remotion/renderer";

const projectId =
  process.argv[2];

if (!projectId) {
  throw new Error(
    "project id required"
  );
}

const root =
  process.env
    .VIDEO_STUDIO_DATA_DIR ||
  path.join(
    process.cwd(),
    ".video-studio-data"
  );

const projectFile =
  path.join(
    root,
    "projects",
    `${projectId}.json`
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
  async () =>
    JSON.parse(
      await fs.readFile(
        projectFile,
        "utf8"
      )
    );

const writeProject =
  async (
    project
  ) =>
    fs.writeFile(
      projectFile,

      JSON.stringify(
        {
          ...project,

          updatedAt:
            new Date()
              .toISOString()
        },

        null,
        2
      )
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
