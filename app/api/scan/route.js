import { NextResponse } from "next/server";
import { analyzeFormData, RequestValidationError } from "../../../lib/analyzeService";
import { validateOrRepairAnalyzeDashboardPayload } from "../../../lib/normalizedListingSchema";
import { applyResellerScanAnalysisToPayload } from "../../../lib/arbitrageEngine";
import { withSession } from "../../../lib/requireSessionApp";

export const runtime = "nodejs";

async function POST_handler(req, _context, session) {
  try {
    const formData = await req.formData();
    const payload = applyResellerScanAnalysisToPayload(
      validateOrRepairAnalyzeDashboardPayload(await analyzeFormData(formData, {
        userId: session.userId,
        tenantId: session.tenantId
      }))
    );
    return NextResponse.json(payload);
  } catch (error) {
    console.error("scan error", error);
    const status = error instanceof RequestValidationError ? 400 : 500;
    return NextResponse.json(
      {
        ok: false,
        error: error.message?.includes("OpenAI vision request failed")
          ? "Image analysis service is unavailable right now. Please try again."
          : error.message || "Scan failed"
      },
      { status }
    );
  }
}

export const POST = withSession(POST_handler);
