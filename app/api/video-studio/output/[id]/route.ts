import {
  createReadStream
} from "fs";

import {
  stat
} from "fs/promises";

import path from "path";

import {
  Readable
} from "stream";

import {
  NextResponse
} from "next/server";

import {
  withSession
} from "../../../../../lib/requireSessionApp";

import {
  getVideoProject
} from "../../../../../lib/video-studio/projectStore";

export const runtime =
  "nodejs";

// Login-gated and tenant-scoped: renders are written as <projectId>.mp4, and
// the project row records its tenant, so a caller can only fetch the render
// of a project that belongs to their own tenant.
async function GET_handler(
  _: Request,

  {
    params
  }: {
    params: {
      id: string;
    };
  },

  session: {
    tenantId: string;
  }
) {
  if (
    !/^[a-zA-Z0-9_-]+$/.test(
      params.id
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid id"
      },
      {
        status: 400
      }
    );
  }

  const project =
    await getVideoProject(
      params.id,
      session.tenantId
    ).catch(() => null);

  if (!project) {
    return NextResponse.json(
      {
        error:
          "Render not found"
      },
      {
        status: 404
      }
    );
  }

  const root =
    process.env
      .VIDEO_STUDIO_DATA_DIR ||
    path.join(
      process.cwd(),
      ".video-studio-data"
    );

  const file =
    path.join(
      root,
      "renders",
      `${params.id}.mp4`
    );

  try {
    const info =
      await stat(file);

    const body =
      Readable.toWeb(
        createReadStream(
          file
        )
      ) as ReadableStream;

    return new Response(
      body,
      {
        headers: {
          "Content-Type":
            "video/mp4",

          "Content-Length":
            String(
              info.size
            ),

          "Content-Disposition":
            `inline; filename="${params.id}.mp4"`
        }
      }
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Render not found"
      },
      {
        status: 404
      }
    );
  }
}

export const GET = withSession(GET_handler);
