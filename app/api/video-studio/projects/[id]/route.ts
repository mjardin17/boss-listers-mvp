import {
  NextResponse
} from "next/server";

import {
  getVideoProject,
  saveVideoProject
} from "../../../../../lib/video-studio/projectStore";

import {
  VideoProjectSchema
} from "../../../../../lib/video-studio/types";

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
  const project =
    await getVideoProject(
      params.id
    );

  if (!project) {
    return NextResponse.json(
      {
        error:
          "Not found"
      },
      {
        status: 404
      }
    );
  }

  return NextResponse.json({
    project
  });
}

export async function PUT(
  request: Request,
  {
    params
  }: {
    params: {
      id: string;
    };
  }
) {
  try {
    const body =
      await request.json();

    const project =
      VideoProjectSchema.parse({
        ...body,
        id:
          params.id
      });

    return NextResponse.json({
      project:
        await saveVideoProject(
          project
        )
    });
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
