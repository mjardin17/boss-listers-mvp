import {
  spawn
} from "child_process";

import path from "path";

import {
  NextResponse
} from "next/server";

import {
  getVideoProject
} from "../../../../lib/video-studio/projectStore";

import {
  transitionRender
} from "../../../../lib/video-studio/renderJobs";

export const runtime =
  "nodejs";

export async function POST(
  request: Request
) {
  const {
    projectId
  } =
    await request.json();

  if (!projectId) {
    return NextResponse.json(
      {
        error:
          "projectId required"
      },
      {
        status: 400
      }
    );
  }

  const project =
    await getVideoProject(
      projectId
    );

  if (!project) {
    return NextResponse.json(
      {
        error:
          "Project not found"
      },
      {
        status: 404
      }
    );
  }

  await transitionRender(
    projectId,
    "QUEUED",
    {
      progress: 0
    }
  );

  const worker =
    path.join(
      process.cwd(),
      "scripts",
      "video-render-worker.mjs"
    );

  const child =
    spawn(
      process.execPath,
      [
        worker,
        projectId
      ],
      {
        detached: true,
        stdio:
          "ignore",
        env:
          process.env
      }
    );

  child.unref();

  return NextResponse.json(
    {
      projectId,
      status:
        "QUEUED"
    },
    {
      status: 202
    }
  );
}
