// pages/api/sync/history.js
// GET /api/sync/history
// List recent sync runs with detailed results

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function rest(path, options = {}) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    const err = new Error("Supabase not configured");
    err.statusCode = 503;
    throw err;
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "Unknown error");
    const err = new Error(`Supabase ${options.method || "GET"} ${path} failed (${res.status}): ${detail}`);
    err.statusCode = 502;
    throw err;
  }

  return res.status === 204 ? null : res.json();
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    // Get query params
    const limit = Math.min(parseInt(req.query.limit || "50"), 500);
    const offset = parseInt(req.query.offset || "0");

    // Fetch sync runs
    const syncRuns = await rest(
      `sync_runs?select=*&order=created_at.desc&limit=${limit}&offset=${offset}`,
    );

    // Get details for each sync run (if requested)
    const includeDetails = req.query.details === "true";
    let detailsByRunId = {};

    if (includeDetails && syncRuns.length > 0) {
      const runIds = syncRuns.map((r) => r.id);

      // Fetch all details for these runs
      for (const runId of runIds) {
        const details = await rest(`sync_details?sync_run_id=eq.${runId}&order=created_at.asc&limit=500`);
        detailsByRunId[runId] = details;
      }
    }

    // Format response
    const runs = syncRuns.map((run) => ({
      ...run,
      details: includeDetails ? detailsByRunId[run.id] : undefined,
    }));

    return res.status(200).json({
      ok: true,
      totalReturned: runs.length,
      limit,
      offset,
      runs,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    console.error("[api/sync/history]", err.message);
    return res.status(status).json({ ok: false, error: err.message });
  }
}
