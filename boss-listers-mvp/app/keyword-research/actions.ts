"use server";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { generateKeywordMetrics } from "../../lib/youtube-keywords/scoring";
import type {
  ActionResult,
  KeywordMetric,
  SavedKeyword
} from "../../lib/youtube-keywords/types";

const keywordMetricSchema = z.object({
  seedKeyword: z.string().trim().min(1).max(120),
  relatedKeyword: z.string().trim().min(1).max(160),
  searchVolume: z.number().int().min(1000).max(500000),
  competitionIndex: z.number().min(0.01).max(1),
  magicScore: z.number().int().min(1).max(100)
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

function toSavedKeyword(row: {
  id: string;
  user_id: string;
  seed_keyword: string;
  related_keyword: string;
  search_volume: number;
  competition_index: number | string;
  magic_score: number;
  created_at: string;
}): SavedKeyword {
  return {
    id: row.id,
    userId: row.user_id,
    seedKeyword: row.seed_keyword,
    relatedKeyword: row.related_keyword,
    searchVolume: row.search_volume,
    competitionIndex: Number(row.competition_index),
    magicScore: row.magic_score,
    createdAt: row.created_at
  };
}

export async function researchKeywordAction(
  seedKeyword: string
): Promise<ActionResult<KeywordMetric[]>> {
  try {
    const seed = z.string().trim().min(2).max(120).parse(seedKeyword);
    return { ok: true, data: generateKeywordMetrics(seed) };
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "Enter a seed keyword between 2 and 120 characters."
        : "Unable to generate keyword research right now.";
    return { ok: false, error: message };
  }
}

export async function saveKeywordAction(
  accessToken: string,
  keyword: KeywordMetric
): Promise<ActionResult<SavedKeyword>> {
  try {
    if (!accessToken) {
      return { ok: false, error: "Sign in before saving keywords." };
    }

    const parsedKeyword = keywordMetricSchema.parse(keyword);
    const supabase = getUserScopedSupabase(accessToken);
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return { ok: false, error: "Your session expired. Please sign in again." };
    }

    const { data, error } = await supabase
      .from("saved_keywords")
      .upsert(
        {
          user_id: user.id,
          seed_keyword: parsedKeyword.seedKeyword,
          related_keyword: parsedKeyword.relatedKeyword,
          search_volume: parsedKeyword.searchVolume,
          competition_index: parsedKeyword.competitionIndex,
          magic_score: parsedKeyword.magicScore,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id,seed_keyword,related_keyword" }
      )
      .select(
        "id,user_id,seed_keyword,related_keyword,search_volume,competition_index,magic_score,created_at"
      )
      .single();

    if (error || !data) {
      return {
        ok: false,
        error: error?.message || "Unable to save this keyword."
      };
    }

    return { ok: true, data: toSavedKeyword(data) };
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "The keyword payload is invalid."
        : error instanceof Error
          ? error.message
          : "Unable to save this keyword.";
    return { ok: false, error: message };
  }
}

export async function getSavedKeywordsAction(
  accessToken: string
): Promise<ActionResult<SavedKeyword[]>> {
  try {
    if (!accessToken) {
      return { ok: false, error: "Sign in to view saved keywords." };
    }

    const supabase = getUserScopedSupabase(accessToken);
    const { data, error } = await supabase
      .from("saved_keywords")
      .select(
        "id,user_id,seed_keyword,related_keyword,search_volume,competition_index,magic_score,created_at"
      )
      .order("created_at", { ascending: false });

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true, data: (data || []).map(toSavedKeyword) };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load saved keywords.";
    return { ok: false, error: message };
  }
}
