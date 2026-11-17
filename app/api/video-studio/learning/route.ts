import { NextResponse } from "next/server";

import { resolveSession } from "../../../../lib/supabaseAuth";
import { CommercialFeedbackInputSchema } from "../../../../lib/video-studio/learning";

// CommonJS learning store shared across CLI, worker, and API routes
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  recordCommercialFeedback,
  summarizeLearningProgress
} = require("../../../../lib/commercialLearning");

export const runtime = "nodejs";

async function requireSession(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  return token ? resolveSession(process.env, token) : null;
}

export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = summarizeLearningProgress();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[video-studio/learning][GET]", err);
    return NextResponse.json(
      { ok: false, error: "Could not load commercial learning playbook" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rawBody = await request.json().catch(() => ({}));
    const parsed = CommercialFeedbackInputSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid commercial feedback payload",
          details: parsed.error.flatten()
        },
        { status: 400 }
      );
    }

    const updated = recordCommercialFeedback(parsed.data);
    const summary = summarizeLearningProgress();
    return NextResponse.json({
      ok: true,
      run: updated.run,
      playbook: updated.playbook,
      summary
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not save commercial feedback";
    const status = msg.includes("not found") ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
