import { NextResponse } from "next/server";
import { kdpErrorResponse, parseKdpRequest } from "../_shared";
import { withSession } from "../../../../lib/requireSessionApp";

export const runtime = "nodejs";

async function POST_handler(request: Request, _context: unknown, session: { userId: string }) {
  try {
    const { packageData, persisted } = await parseKdpRequest(request, session.userId);
    return NextResponse.json({
      ok: true,
      persisted,
      metadata: packageData.metadata
    });
  } catch (error) {
    return kdpErrorResponse(error);
  }
}

export const POST = withSession(POST_handler);
