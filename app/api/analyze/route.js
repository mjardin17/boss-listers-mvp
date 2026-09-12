// app/api/analyze/route.js
// POST /api/analyze — the actual missing piece behind pages/capture.js's
// "Generate Listing" button, which has been calling this exact path all
// along while it 404'd. The real logic (photo analysis, pricing, comps,
// cross-listing generation) already existed in lib/analyzeService.js —
// it was just never connected to a route. This is the connection.
//
// Lives under app/api (App Router) rather than pages/api because
// analyzeFormData() expects a WHATWG FormData with real File objects
// (file.arrayBuffer()) — exactly what Next's Request.formData() gives you
// here, with no multipart-parsing library needed. pages/api's classic
// req/res does not support this without formidable + manual glue.
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { analyzeFormData, RequestValidationError } from "../../../lib/analyzeService";

export const runtime = "nodejs"; // needs fs-extra — not Edge-compatible

export async function POST(request) {
  const requestId = randomUUID();
  try {
    const formData = await request.formData();
    const payload = await analyzeFormData(formData, { requestId });
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof RequestValidationError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[api/analyze]", requestId, err?.message, err?.stack);
    return NextResponse.json(
      { ok: false, error: err?.message || "Analyze failed", requestId },
      { status: 500 }
    );
  }
}
