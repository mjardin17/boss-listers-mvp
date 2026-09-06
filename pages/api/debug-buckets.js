// Temporary diagnostic route used once to debug a Supabase Storage bucket
// visibility issue (2026-08-31) — no longer needed, left disabled rather
// than deleted so the file history stays clear about what happened.
export default function handler(req, res) {
  return res.status(410).json({ ok: false, error: "Diagnostic route retired." });
}
