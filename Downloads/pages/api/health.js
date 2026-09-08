// pages/api/health.js
// Health check endpoint — no auth required
// Used by Render to determine service health (liveness check only)
// Does NOT probe dependencies — those have their own retry/failover logic

import fs from 'fs-extra';

export default async function handler(req, res) {
  try {
    // Check write access to persistent disk
    const dataDir = process.env.DATA_DIR || 'data';
    try {
      await fs.access(dataDir, fs.constants.W_OK);
    } catch (err) {
      // Directory doesn't exist or isn't writable — try to create/ensure it
      try {
        await fs.ensureDir(dataDir);
      } catch (createErr) {
        return res.status(503).json({ ok: false, error: 'Data directory not writable' });
      }
    }

    return res.status(200).json({ ok: true, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Health check failed:', err.message);
    return res.status(503).json({ ok: false, error: 'Health check failed' });
  }
}
