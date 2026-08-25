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

export const runtime =
  "nodejs";

export async function GET(
  _: Request,

  {
    params
  }: {
    params: {
      id: string;
    };
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
