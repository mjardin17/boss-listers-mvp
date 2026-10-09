import { NextResponse } from "next/server";
import {
  analyzeFormData,
  normalizeDashboardListing,
  RequestValidationError
} from "../../../lib/analyzeService";
import {
  ApiError,
  beginDuplicateSuppression,
  enforceContentLength,
  enforceRateLimit,
  fingerprintFormData,
  withApiRequest
} from "../../../lib/apiRuntime";
import { validateServerEnvironment } from "../../../lib/envValidation";
import { getListing } from "../../../lib/store";
import { validateOrRepairAnalyzeDashboardPayload } from "../../../lib/normalizedListingSchema";
import { normalizeBarcodeValue } from "../../../lib/barcodeService";
import { applyResellerScanAnalysisToPayload } from "../../../lib/arbitrageEngine";
import { withSession } from "../../../lib/requireSessionApp";

export const runtime = "nodejs";

// Vision runs on Claude (~20-30s per scan), so the old 10s budget is far too
// short. Override with env ANALYZE_TIMEOUT_MS; keep it above
// ANTHROPIC_VISION_TIMEOUT_MS (default 45s) plus pricing/comps time.
const DEFAULT_ANALYZE_TIMEOUT_MS = 70000;
const ANALYZE_TIMEOUT_MS = Number(process.env.ANALYZE_TIMEOUT_MS) > 0
  ? Number(process.env.ANALYZE_TIMEOUT_MS)
  : DEFAULT_ANALYZE_TIMEOUT_MS;
const ANALYZE_TIMEOUT_MESSAGE =
  "The photo scan took too long to finish. Try again, or use fewer or clearer photos.";

function valueFromForm(formData, key) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function fallbackTitleFromFormData(formData) {
  const explicitTitle =
    valueFromForm(formData, "titleHint") ||
    valueFromForm(formData, "model") ||
    valueFromForm(formData, "brand");
  if (explicitTitle.trim()) return explicitTitle.trim();

  const firstFile = formData
    .getAll("photos")
    .find((value) => value && typeof value === "object" && value.name);
  const filename = String(firstFile?.name || "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return filename ? filename.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Scanned item";
}

function buildAnalyzeFailurePayload({ formData, requestId, requestBytes, message, code }) {
  const barcode = normalizeBarcodeValue(valueFromForm(formData, "barcode") || valueFromForm(formData, "upc"));
  const title = fallbackTitleFromFormData(formData);

  return applyResellerScanAnalysisToPayload({
    ok: false,
    error: message,
    code,
    analysis: {
      itemTitle: title,
      upc: barcode,
      sellThrough: "Unavailable",
      recommendation: "",
      recommendationExplanation: message,
      sourceBadges: barcode ? ["Barcode"] : [],
      marketDataUnavailable: true
    },
    pricing: null,
    listing: null,
    scanStatus: {
      usedVision: false,
      visionAttempted: false,
      fallbackActivated: true,
      barcodeDetected: Boolean(barcode),
      warning: message
    },
    instrumentation: {
      requestId,
      requestBytes,
      timeoutFallback: code === "ANALYZE_TIMEOUT",
      malformedPayloadRepair: false
    }
  });
}

function withAnalyzeTimeout(operation, fallbackFactory) {
  let timeoutId;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(fallbackFactory()), ANALYZE_TIMEOUT_MS);
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timeoutId));
}

// Login gate + request runtime. withSession rejects missing/invalid bearer
// tokens with 401 before anything runs; the session's userId then replaces
// the header-derived identity (those headers are client-controlled), so rate
// limiting and duplicate suppression key off the authenticated user.
function guarded(inner) {
  return withSession((req, _routeContext, session) =>
    withApiRequest((request, context) =>
      inner(
        request,
        { ...context, identity: { ...context.identity, userId: session.userId } },
        session
      )
    )(req)
  );
}

// Future queue/offline processing should wrap analyzeFormData here, not inside UI components.
export const GET = guarded(async function GET(req, context, session) {
  validateServerEnvironment();
  try {
    const { searchParams } = new URL(req.url);
    const listingId = searchParams.get("listingId");
    if (!listingId) {
      return NextResponse.json({ ok: false, error: "Missing listingId" }, { status: 400 });
    }

    const item = await getListing(listingId, session.tenantId);
    const listing = normalizeDashboardListing(item);
    return listing
      ? NextResponse.json({ ok: true, listing, requestId: context.requestId })
      : NextResponse.json(
          { ok: false, error: "Listing not found", requestId: context.requestId },
          { status: 404 }
        );
  } catch (error) {
    throw new ApiError(error.message || "Analyze lookup failed", {
      status: 500,
      code: "ANALYZE_LOOKUP_FAILED"
    });
  }
});

export const POST = guarded(async function POST(req, context, session) {
  validateServerEnvironment();
  const requestBytes = enforceContentLength(req);
  const rateLimitKey = `${context.identity.userId}:${context.identity.ip}`;
  enforceRateLimit(rateLimitKey);

  let releaseDuplicate = () => {};
  let formData = null;
  try {
    formData = await req.formData();
    const fingerprint = fingerprintFormData(formData);
    releaseDuplicate = beginDuplicateSuppression(`${rateLimitKey}:${fingerprint}`);
    const payload = await withAnalyzeTimeout(
      analyzeFormData(formData, {
        requestId: context.requestId,
        userId: session.userId,
        tenantId: session.tenantId,
        requestBytes
      }).then((result) => applyResellerScanAnalysisToPayload(validateOrRepairAnalyzeDashboardPayload(result))),
      () =>
        buildAnalyzeFailurePayload({
          formData,
          requestId: context.requestId,
          requestBytes,
          message: ANALYZE_TIMEOUT_MESSAGE,
          code: "ANALYZE_TIMEOUT"
        })
    );
    if (payload.instrumentation?.timeoutFallback) {
      context.logWarn("scan.fallback_payload.generated", {
        requestId: context.requestId,
        reason: "api_timeout",
        schemaValid: true
      });
    }
    return NextResponse.json({
      ...payload,
      requestId: context.requestId
    }, { status: payload.ok === false ? 504 : 200 });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      throw new ApiError(error.message, {
        status: 400,
        code: "REQUEST_VALIDATION_FAILED",
        expose: true
      });
    }
    context.logError("scan.pipeline.failed", {
      requestId: context.requestId,
      error
    });
    const failurePayload = buildAnalyzeFailurePayload({
      formData: formData || new FormData(),
      requestId: context.requestId,
      requestBytes,
      message: "Analyze pipeline failed before a trustworthy result was produced.",
      code: "ANALYZE_PIPELINE_FAILED"
    });
    context.logWarn("scan.failure_payload.generated", {
      requestId: context.requestId,
      reason: "pipeline_error",
      schemaValid: true
    });
    return NextResponse.json({
      ...failurePayload,
      requestId: context.requestId
    }, { status: 500 });
  } finally {
    releaseDuplicate();
  }
});
