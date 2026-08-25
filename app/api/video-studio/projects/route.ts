import {
  NextResponse
} from "next/server";

import {
  listVideoProjects,
  saveVideoProject
} from "../../../../lib/video-studio/projectStore";

import {
  VideoProjectSchema
} from "../../../../lib/video-studio/types";

export const runtime =
  "nodejs";

export async function GET() {
  return NextResponse.json({
    projects:
      await listVideoProjects()
  });
}

export async function POST(
  request: Request
) {
  try {
    const project =
      VideoProjectSchema.parse(
        await request.json()
      );

    return NextResponse.json(
      {
        project:
          await saveVideoProject(
            project
          )
      },
      {
        status: 201
      }
    );
  } catch (
    error: any
  ) {
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Invalid project"
      },
      {
        status: 400
      }
    );
  }
}
