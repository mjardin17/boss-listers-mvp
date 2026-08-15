import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createRequestId, logError, logInfo, logWarn } from "./serverLog";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 12;
const DUPLICATE_TTL_MS = 20_000;
const MAX_REQUEST_BYTES = 28 * 1024 * 1024;

const rateBuckets = new Map();
const inFlightRequests = new Map();

export class ApiError extends Error {
  constructor(message, { status = 500, code = "SERVER_ERROR", expose = false } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.expose = expose;
  }
}

function getClientIp(req) {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

export function getRequestIdentity(req) {
  return {
    ip: getClientIp(req),
    userId:
      req.headers.get("x-boss-listers-user-id") ||
      req.headers.get("x-user-id") ||
      "anonymous"
  };
}

export function enforceContentLength(req) {
  const contentLength = Number(req.headers.get("content-length")) || 0;
  if (contentLength > MAX_REQUEST_BYTES) {
    throw new ApiError("Upload is too large. Use up to five compressed product photos.", {
      status: 413,
      code: "UPLOAD_TOO_LARGE",
      expose: true
    });
  }
  return contentLength;
}

export function enforceRateLimit(key) {
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }
  current.count += 1;
  if (current.count > RATE_LIMIT_MAX) {
    throw new ApiError("Too many scans. Wait a minute and try again.", {
      status: 429,
      code: "RATE_LIMITED",
      expose: true
    });
  }
}

export function fingerprintFormData(formData) {
  const hash = createHash("sha256");
  for (const [key, value] of formData.entries()) {
    hash.update(key);
    if (value && typeof value === "object" && typeof value.arrayBuffer === "function") {
      hash.update(String(value.name || ""));
      hash.update(String(value.size || 0));
      hash.update(String(value.type || ""));
      hash.update(String(value.lastModified || ""));
    } else {
      hash.update(String(value || "").slice(0, 500));
    }
  }
  return hash.digest("hex");
}

export function beginDuplicateSuppression(key) {
  const now = Date.now();
  for (const [fingerprint, entry] of inFlightRequests.entries()) {
    if (entry.expiresAt <= now) inFlightRequests.delete(fingerprint);
  }
  if (inFlightRequests.has(key)) {
    throw new ApiError("Duplicate scan already in progress.", {
      status: 409,
      code: "DUPLICATE_REQUEST",
      expose: true
    });
  }
  inFlightRequests.set(key, { expiresAt: now + DUPLICATE_TTL_MS });
  return () => inFlightRequests.delete(key);
}

export function safeApiError(error, requestId) {
  const status = error instanceof ApiError ? error.status : 500;
  const code = error instanceof ApiError ? error.code : "SERVER_ERROR";
  const message =
    error instanceof ApiError && error.expose
      ? error.message
      : "Boss Listers could not complete this request. Please try again.";
  return NextResponse.json(
    {
      ok: false,
      error: message,
      code,
      requestId,
      scanStatus: {
        usedVision: false,
        visionAttempted: false,
        warning: message
      }
    },
    { status }
  );
}

export function withApiRequest(handler) {
  return async function wrapped(req) {
    const requestId = createRequestId();
    const startedAt = Date.now();
    const identity = getRequestIdentity(req);
    try {
      const response = await handler(req, {
        requestId,
        startedAt,
        identity,
        logInfo,
        logWarn,
        logError
      });
      logInfo("api.request.completed", {
        requestId,
        userId: identity.userId,
        path: new URL(req.url).pathname,
        status: response.status,
        durationMs: Date.now() - startedAt
      });
      return response;
    } catch (error) {
      logError("api.request.failed", {
        requestId,
        userId: identity.userId,
        path: new URL(req.url).pathname,
        durationMs: Date.now() - startedAt,
        error
      });
      return safeApiError(error, requestId);
    }
  };
}
