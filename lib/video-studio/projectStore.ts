import {
  promises as fs
} from "fs";

import path from "path";

import {
  VideoProjectSchema,
  type VideoProject
} from "./types";

const ROOT =
  process.env
    .VIDEO_STUDIO_DATA_DIR ||
  path.join(
    process.cwd(),
    ".video-studio-data"
  );

const PROJECTS =
  path.join(
    ROOT,
    "projects"
  );

async function ensure() {
  await fs.mkdir(
    PROJECTS,
    {
      recursive: true
    }
  );
}

function fileFor(
  id: string
) {
  if (
    !/^[a-zA-Z0-9_-]+$/.test(
      id
    )
  ) {
    throw new Error(
      "Invalid project id"
    );
  }

  return path.join(
    PROJECTS,
    `${id}.json`
  );
}

export async function saveVideoProject(
  project: VideoProject
) {
  await ensure();

  const parsed =
    VideoProjectSchema.parse({
      ...project,
      updatedAt:
        new Date()
          .toISOString()
    });

  await fs.writeFile(
    fileFor(parsed.id),
    JSON.stringify(
      parsed,
      null,
      2
    ),
    "utf8"
  );

  return parsed;
}

export async function getVideoProject(
  id: string
) {
  await ensure();

  try {
    return VideoProjectSchema.parse(
      JSON.parse(
        await fs.readFile(
          fileFor(id),
          "utf8"
        )
      )
    );
  } catch (error: any) {
    if (
      error?.code ===
      "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}

export async function listVideoProjects() {
  await ensure();

  const files =
    (
      await fs.readdir(
        PROJECTS
      )
    ).filter(
      (name) =>
        name.endsWith(
          ".json"
        )
    );

  const projects =
    await Promise.all(
      files.map(
        async (name) => {
          const raw =
            await fs.readFile(
              path.join(
                PROJECTS,
                name
              ),
              "utf8"
            );

          return VideoProjectSchema.parse(
            JSON.parse(raw)
          );
        }
      )
    );

  return projects.sort(
    (a, b) =>
      b.updatedAt.localeCompare(
        a.updatedAt
      )
  );
}
