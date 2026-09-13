// GET /api/commercials/status?jobId=...
// Check commercial generation status

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { jobId } = req.query;

    if (!jobId) {
      return res.status(400).json({ ok: false, error: "jobId required" });
    }

    const { data: job, error } = await supabase
      .from("commercial_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (error || !job) {
      return res.status(404).json({ ok: false, error: "Job not found" });
    }

    return res.status(200).json({
      ok: true,
      jobId: job.id,
      listingId: job.listing_id,
      status: job.status,
      videoUrl: job.video_url,
      videoPath: job.video_path,
      createdAt: job.created_at,
      completedAt: job.completed_at,
    });
  } catch (err) {
    console.error("[api/commercials/status]", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
