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

import {
  resolveSession
} from "../../../../../lib/supabaseAuth";

export const runtime =
  "nodejs";

// See app/api/video-studio/projects/route.ts for why this exists — same
// session gate, same "not yet tenant-scoped in storage" caveat.
async function requireSession(
  request: Request
) {
  const authHeader =
    request.headers.get(
      "authorization"
    ) || "";
  const token =
    authHeader.startsWith(
      "Bearer "
    )
      ? authHeader.slice(7)
      : null;

  return token
    ? resolveSession(
        process.env,
        token
      )
    : null;
}

export async function GET(
  request: Request,
  {
    params
  }: {
    params: {
      id: string;
    };
  }
) {
  const session =
    await requireSession(
      request
    );

  if (!session) {
    return NextResponse.json(
      {
        error:
          "Unauthorized"
      },
      {
        status: 401
      }
    );
  }

  const project =
    await getVideoProject(
      params.id,
      session.tenantId
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
  const session =
    await requireSession(
      request
    );

  if (!session) {
    return NextResponse.json(
      {
        error:
          "Unauthorized"
      },
      {
        status: 401
      }
    );
  }

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
          project,
          session.tenantId
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
