import { NextResponse } from "next/server";
import { kdpErrorResponse, parseKdpRequest } from "../_shared";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { packageData, persisted } = await parseKdpRequest(request);
    return NextResponse.json({
      ok: true,
      persisted,
      metadata: packageData.metadata
    });
  } catch (error) {
    return kdpErrorResponse(error);
  }
}
