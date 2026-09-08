// lib/video-studio/projectStore.ts
// Real, tenant-scoped Supabase persistence — replaces the flat-filesystem
// version this started with. Requires supabase/migrations/0011_video_studio_projects.sql
// to have been applied (public.video_studio_projects table + RLS policies,
// same pattern as lib/supabaseListings.js's tenant scoping).
//
// The whole VideoProject is stored as one jsonb column (see the migration's
// own comment for why — same shape as public.listings' input/outputs
// columns), so these functions parse/serialize the jsonb rather than
// mapping individual scene/audio/cta fields to their own columns.

import { rest } from "../supabaseRest";

import {
  VideoProjectSchema,
  type VideoProject
} from "./types";

type Row = {
  id: string;
  tenant_id: string;
  project: VideoProject;
  render_status: string;
  created_at: string;
  updated_at: string;
};

function rowToProject(row: Row): VideoProject {
  return VideoProjectSchema.parse(row.project);
}

export async function saveVideoProject(
  project: VideoProject,
  tenantId: string
): Promise<VideoProject> {
  if (!tenantId) {
    throw new Error("saveVideoProject requires tenantId");
  }

  const parsed = VideoProjectSchema.parse({
    ...project,
    updatedAt: new Date().toISOString()
  });

  await rest(
    process.env,
    "POST",
    "video_studio_projects?on_conflict=id",
    // rest()'s JS default (body = null) makes TS infer this parameter as
    // strictly `null | undefined` with no other type annotation to go on
    // — cast, not a real type mismatch (lib/supabaseListings.js's own
    // calls hit the same JS-inference quirk and aren't typed either).
    {
      id: parsed.id,
      tenant_id: tenantId,
      project: parsed,
      render_status: parsed.renderStatus,
      updated_at: parsed.updatedAt
    } as unknown as null,
    { Prefer: "resolution=merge-duplicates" } as unknown as null
  );

  return parsed;
}

export async function getVideoProject(
  id: string,
  tenantId: string
): Promise<VideoProject | null> {
  if (!tenantId) {
    throw new Error("getVideoProject requires tenantId");
  }

  const rows: Row[] = await rest(
    process.env,
    "GET",
    `video_studio_projects?id=eq.${encodeURIComponent(id)}&tenant_id=eq.${encodeURIComponent(tenantId)}`
  );

  return rows.length ? rowToProject(rows[0]) : null;
}

export async function listVideoProjects(
  tenantId: string
): Promise<VideoProject[]> {
  if (!tenantId) {
    throw new Error("listVideoProjects requires tenantId");
  }

  const rows: Row[] = await rest(
    process.env,
    "GET",
    `video_studio_projects?tenant_id=eq.${encodeURIComponent(tenantId)}&order=updated_at.desc`
  );

  return rows.map(rowToProject);
}
