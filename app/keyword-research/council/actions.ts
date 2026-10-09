"use server";

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type {
  ActionResult,
  CouncilConsultation,
  CouncilExpertResponse
} from "../../../lib/youtube-keywords/types";

const promptSchema = z.string().trim().min(20).max(4000);

const responseSchema = z.object({
  personaName: z
    .enum(["The Strategist", "The Financial Analyst", "The Architect"])
    .describe("The exact council persona providing this review."),
  title: z
    .string()
    .min(2)
    .max(80)
    .describe("A concise title for this persona's advisory lens."),
  feedback: z
    .string()
    .min(120)
    .max(1800)
    .describe(
      "Markdown-formatted, highly specific feedback with concrete recommendations and next actions."
    ),
  actionabilityScore: z
    .number()
    .int()
    .min(1)
    .max(100)
    .describe(
      "A realistic score from 1-100 reflecting how executable the user's strategy is from this persona's perspective."
    )
});

const councilOutputSchema = z.object({
  responses: z
    .array(responseSchema)
    .length(3)
    .describe("Exactly three expert responses, one for each required persona.")
});

const personaOrder = [
  "The Strategist",
  "The Financial Analyst",
  "The Architect"
] as const;

function buildPlaywrightResponses(prompt: string): CouncilExpertResponse[] {
  return personaOrder.map((personaName, index) => ({
    personaName,
    title:
      personaName === "The Strategist"
        ? "Positioning and Retention"
        : personaName === "The Financial Analyst"
          ? "Monetization Efficiency"
          : "Systems and Automation",
    actionabilityScore: 86 - index * 4,
    feedback: `**Preview mode:** This deterministic response is only used during Playwright tests.

**Strategy reviewed:** ${prompt.slice(0, 220)}

**Next move:** Convert this strategy into one measurable experiment with a clear owner, success metric, and deadline.`
  }));
}

function assertRequiredPersonas(
  responses: CouncilExpertResponse[]
): CouncilExpertResponse[] {
  const orderedResponses = personaOrder.map((personaName) =>
    responses.find((response) => response.personaName === personaName)
  );

  if (orderedResponses.some((response) => !response)) {
    throw new Error("The council response did not include all required personas.");
  }

  return orderedResponses as CouncilExpertResponse[];
}

async function generateCouncilResponses(prompt: string): Promise<CouncilExpertResponse[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const { object } = await generateObject({
    model: openai(process.env.OPENAI_COUNCIL_MODEL || "gpt-4o"),
    schema: councilOutputSchema,
    schemaName: "CouncilConsultation",
    schemaDescription:
      "Three specialized AI council reviews of a business or content strategy.",
    temperature: 0.35,
    system: `You are the AI Council, a rigorous advisory panel for YouTube, creator, SaaS, and digital-business strategies.

Return exactly three responses, one from each persona:
1. The Strategist: content positioning, audience retention, concept hooks, packaging, viewer psychology, distribution angles.
2. The Financial Analyst: monetization efficiency, CPM/RPM potential, offer design, sponsorship fit, margins, cost control, revenue sequencing.
3. The Architect: system scalability, software implementation, workflow automation, data pipelines, operational leverage, bottleneck removal.

Rules:
- Be highly specific to the user's strategy. Do not give generic startup or creator advice.
- Each feedback field must be markdown-formatted and include exactly these sections:
  **Core read:** a direct diagnosis.
  **Recommendation:** the highest-leverage improvement.
  **Next move:** one concrete action the user can take this week.
- Calculate a realistic Actionability Score from 1-100 for each persona. Reward specificity, clear audience, measurable offer, monetization path, operational feasibility, and repeatable workflow. Penalize vague audience, unclear revenue model, weak retention loop, high production burden, or missing distribution plan.
- Use the exact personaName strings required by the schema.
- Do not include any extra personas or fields.`,
    prompt: `Evaluate this user strategy:\n\n"""${prompt}"""`
  });

  return assertRequiredPersonas(object.responses);
}

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase environment variables are not configured.");
  }

  return { url, anonKey };
}

function getUserScopedSupabase(accessToken: string) {
  const { url, anonKey } = getSupabaseConfig();

  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

function normalizeExpertResponses(value: unknown): CouncilExpertResponse[] {
  const parsed = z.array(responseSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

function toCouncilConsultation(row: {
  id: string;
  user_id: string;
  user_prompt: string;
  expert_responses: unknown;
  created_at: string;
}): CouncilConsultation {
  return {
    id: row.id,
    userId: row.user_id,
    userPrompt: row.user_prompt,
    expertResponses: normalizeExpertResponses(row.expert_responses),
    createdAt: row.created_at
  };
}

export async function submitToCouncil(
  prompt: string,
  accessToken?: string
): Promise<ActionResult<CouncilConsultation>> {
  try {
    const parsedPrompt = promptSchema.parse(prompt);
    const expertResponses =
      process.env.PLAYWRIGHT_MOCK_SUPABASE === "1" &&
      accessToken === "playwright-mock-token"
        ? buildPlaywrightResponses(parsedPrompt)
        : await generateCouncilResponses(parsedPrompt);

    if (
      process.env.PLAYWRIGHT_MOCK_SUPABASE === "1" &&
      accessToken === "playwright-mock-token"
    ) {
      return {
        ok: true,
        data: {
          id: "playwright-council-consultation",
          userId: "playwright-user",
          userPrompt: parsedPrompt,
          expertResponses,
          createdAt: new Date().toISOString()
        }
      };
    }

    if (!accessToken) {
      return {
        ok: true,
        data: {
          id: `unsaved-council-${Date.now()}`,
          userId: "local-preview",
          userPrompt: parsedPrompt,
          expertResponses,
          createdAt: new Date().toISOString()
        }
      };
    }

    const supabase = getUserScopedSupabase(accessToken);
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return { ok: false, error: "Your session expired. Please sign in again." };
    }

    const { data, error } = await supabase
      .from("council_consultations")
      .insert({
        user_id: user.id,
        user_prompt: parsedPrompt,
        expert_responses: expertResponses
      })
      .select("id,user_id,user_prompt,expert_responses,created_at")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message || "Unable to save council feedback." };
    }

    return { ok: true, data: toCouncilConsultation(data) };
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "Describe the strategy in 20 to 4000 characters."
        : error instanceof Error
          ? error.message
          : "Unable to convene the council.";
    return { ok: false, error: message };
  }
}

export async function getCouncilConsultations(
  accessToken: string
): Promise<ActionResult<CouncilConsultation[]>> {
  try {
    if (!accessToken) {
      return { ok: false, error: "Sign in to view council history." };
    }

    if (
      process.env.PLAYWRIGHT_MOCK_SUPABASE === "1" &&
      accessToken === "playwright-mock-token"
    ) {
      return { ok: true, data: [] };
    }

    const supabase = getUserScopedSupabase(accessToken);
    const { data, error } = await supabase
      .from("council_consultations")
      .select("id,user_id,user_prompt,expert_responses,created_at")
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true, data: (data || []).map(toCouncilConsultation) };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load council history.";
    return { ok: false, error: message };
  }
}
