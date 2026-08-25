"use server";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { generateTopPerformingNiches } from "../../../lib/youtube-keywords/niches";
import type {
  ActionResult,
  CompetitionLevel,
  NicheMetric,
  TrackedNiche
} from "../../../lib/youtube-keywords/types";

const nicheSchema = z.object({
  nicheName: z.string().trim().min(2).max(140),
  category: z.string().trim().min(2).max(80),
  avgCpm: z.number().min(0).max(250),
  marketDemandScore: z.number().int().min(1).max(100),
  competitionLevel: z.enum(["Low", "Medium", "High"]),
  opportunityScore: z.number().int().min(1).max(100)
});

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

function toTrackedNiche(row: {
  id: string;
  user_id: string;
  niche_name: string;
  category: string;
  avg_cpm: number | string;
  market_demand_score: number;
  competition_level: CompetitionLevel;
  opportunity_score: number;
  created_at: string;
}): TrackedNiche {
  return {
    id: row.id,
    userId: row.user_id,
    nicheName: row.niche_name,
    category: row.category,
    avgCpm: Number(row.avg_cpm),
    marketDemandScore: row.market_demand_score,
    competitionLevel: row.competition_level,
    opportunityScore: row.opportunity_score,
    createdAt: row.created_at
  };
}

export async function getTopPerformingNiches(): Promise<ActionResult<NicheMetric[]>> {
  try {
    return { ok: true, data: generateTopPerformingNiches() };
  } catch {
    return { ok: false, error: "Unable to load top performing niches." };
  }
}

export async function trackNicheAction(
  accessToken: string,
  niche: NicheMetric
): Promise<ActionResult<TrackedNiche>> {
  try {
    if (!accessToken) {
      return { ok: false, error: "Sign in before tracking niches." };
    }

    const parsedNiche = nicheSchema.parse(niche);

    if (
      process.env.PLAYWRIGHT_MOCK_SUPABASE === "1" &&
      accessToken === "playwright-mock-token"
    ) {
      return {
        ok: true,
        data: {
          ...parsedNiche,
          id: "playwright-tracked-niche",
          userId: "playwright-user",
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
      .from("tracked_niches")
      .upsert(
        {
          user_id: user.id,
          niche_name: parsedNiche.nicheName,
          category: parsedNiche.category,
          avg_cpm: parsedNiche.avgCpm,
          market_demand_score: parsedNiche.marketDemandScore,
          competition_level: parsedNiche.competitionLevel,
          opportunity_score: parsedNiche.opportunityScore,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id,niche_name,category" }
      )
      .select(
        "id,user_id,niche_name,category,avg_cpm,market_demand_score,competition_level,opportunity_score,created_at"
      )
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message || "Unable to track this niche." };
    }

    return { ok: true, data: toTrackedNiche(data) };
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "The niche payload is invalid."
        : error instanceof Error
          ? error.message
          : "Unable to track this niche.";
    return { ok: false, error: message };
  }
}
