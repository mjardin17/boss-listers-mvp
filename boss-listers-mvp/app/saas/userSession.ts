"use client";

import { useEffect, useState } from "react";
import {
  SCHEMA_VERSION,
  USER_SESSION_COLLECTION,
  type BossListersUserSession
} from "./schemas";
import { localStorageAdapter } from "./storageAdapters";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "./supabaseClient";

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getOrCreateLocalUserSession(): BossListersUserSession {
  const existing = localStorageAdapter.readCollection<BossListersUserSession>(
    USER_SESSION_COLLECTION
  )[0];
  const now = new Date().toISOString();

  if (existing) {
    const nextSession = {
      ...existing,
      lastSeenAt: now,
      syncStatus: isSupabaseConfigured() ? existing.syncStatus : "local"
    };
    localStorageAdapter.writeCollection(USER_SESSION_COLLECTION, [nextSession]);
    return nextSession;
  }

  const session: BossListersUserSession = {
    id: makeId("session"),
    anonymousId: makeId("anon"),
    authProvider: "anonymous",
    createdAt: now,
    lastSeenAt: now,
    syncStatus: "local"
  };
  localStorageAdapter.writeCollection(USER_SESSION_COLLECTION, [session]);
  return session;
}

async function getSupabaseUserSession(): Promise<BossListersUserSession | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  try {
    let authSession = (await supabase.auth.getSession()).data.session;
    if (!authSession) {
      const anonymous = await supabase.auth.signInAnonymously();
      authSession = anonymous.data.session;
    }
    const user = authSession?.user;
    if (!user) return null;

    const now = new Date().toISOString();
    const createdAt = user.created_at || now;
    const session: BossListersUserSession = {
      id: user.id,
      anonymousId: user.id,
      authProvider: user.is_anonymous ? "anonymous" : "future-auth",
      createdAt,
      lastSeenAt: now,
      syncStatus: "synced"
    };

    await supabase.from("users").upsert(
      {
        id: session.id,
        anonymous_id: session.anonymousId,
        auth_provider: session.authProvider,
        created_at: session.createdAt,
        last_seen_at: session.lastSeenAt
      },
      { onConflict: "id" }
    );

    localStorageAdapter.writeCollection(USER_SESSION_COLLECTION, [session]);
    return session;
  } catch (error) {
    console.info("Boss Listers Supabase auth unavailable; falling back locally.", error);
    return null;
  }
}

export async function getOrCreateUserSession(): Promise<BossListersUserSession> {
  const supabaseSession = await getSupabaseUserSession();
  return supabaseSession || getOrCreateLocalUserSession();
}

export function useBossListersAuth() {
  const [session, setSession] = useState<BossListersUserSession | null>(null);

  useEffect(() => {
    let mounted = true;
    void getOrCreateUserSession().then((nextSession) => {
      if (mounted) setSession(nextSession);
    });

    const supabase = getSupabaseBrowserClient();
    const subscription = supabase?.auth.onAuthStateChange(() => {
      void getOrCreateUserSession().then((nextSession) => {
        if (mounted) setSession(nextSession);
      });
    }).data.subscription;

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  return {
    session,
    userId: session?.id || "",
    isAuthenticated: Boolean(session && session.authProvider !== "anonymous"),
    schemaVersion: SCHEMA_VERSION,
    signIn: async (email?: string) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase || !email) return;
      await supabase.auth.signInWithOtp({ email });
    },
    signOut: async () => {
      const supabase = getSupabaseBrowserClient();
      if (supabase) await supabase.auth.signOut();
      setSession(getOrCreateLocalUserSession());
    }
  };
}
