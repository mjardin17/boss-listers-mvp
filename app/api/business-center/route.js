// app/api/business-center/route.js
// Business Center API: business profile, claims check, growth audit, landing pages.
// Coordinates with lib/universal-creative/business-center.js for all persistence.
// Auth: resolveSession (per AGENTS.md auth gate for app/api/**/route.js)
//
// Render-only safety: nothing here posts, sends or contacts anyone.
// Public lead capture is not exposed here; it needs its own reviewed public route.

import { resolveSession } from "../../../lib/supabaseAuth";
import {
  getProfile,
  saveProfile,
  checkClaims,
  runGrowthAudit,
  listOpportunities,
  listLandingPages,
  createLandingPage,
} from "../../../lib/universal-creative/business-center.js";
import { ZodError } from "zod";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function requireTenant(request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const session = token ? await resolveSession(process.env, token) : null;
  return session?.tenantId || null;
}

function errorResponse(err) {
  if (err instanceof ZodError) {
    return jsonResponse({ ok: false, error: "Validation failed", details: err.issues }, 400);
  }
  return jsonResponse({ ok: false, error: err.message }, 400);
}

export async function GET(request) {
  const tenantId = await requireTenant(request);
  if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

  const action = new URL(request.url).searchParams.get("action") || "profile";
  switch (action) {
    case "profile":
      return jsonResponse({ ok: true, profile: getProfile() });
    case "opportunities":
      return jsonResponse({ ok: true, opportunities: listOpportunities() });
    case "landing-pages":
      return jsonResponse({ ok: true, landingPages: listLandingPages() });
    default:
      return jsonResponse({ ok: false, error: `Unknown action: ${action}` }, 400);
  }
}

export async function POST(request) {
  const tenantId = await requireTenant(request);
  if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

  const action = new URL(request.url).searchParams.get("action") || "save-profile";
  try {
    switch (action) {
      case "save-profile":
        return jsonResponse({ ok: true, profile: saveProfile(await request.json()) });
      case "check-claims": {
        const body = await request.json();
        return jsonResponse({ ok: true, ...checkClaims(body?.text) });
      }
      case "run-audit":
        return jsonResponse({ ok: true, opportunities: runGrowthAudit() });
      case "create-landing-page":
        return jsonResponse({ ok: true, landingPage: createLandingPage(await request.json()) }, 201);
      default:
        return jsonResponse({ ok: false, error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    return errorResponse(err);
  }
}
