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

import {
  resolveSession
} from "../../../../lib/supabaseAuth";

export const runtime =
  "nodejs";

// These routes require a valid logged-in session, same as every other
// /api/* route in this app (see lib/clientAuth.js) — before this they
// were open to anyone, unauthenticated. Project storage is now tenant-
// scoped Supabase (see 0011_video_studio_projects.sql), not a flat
// filesystem, so session.tenantId is what actually isolates one tenant's
// projects from another's.
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
  request: Request
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

  return NextResponse.json({
    projects:
      await listVideoProjects(
        session.tenantId
      )
  });
}

export async function POST(
  request: Request
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
    const project =
      VideoProjectSchema.parse(
        await request.json()
      );

    return NextResponse.json(
      {
        project:
          await saveVideoProject(
            project,
            session.tenantId
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
