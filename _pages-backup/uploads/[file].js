// pages/api/uploads/[file].js
// Streams uploaded files from disk
// Path traversal protection: only serve basename, no ../ tricks

import fs from 'fs-extra';
import path from 'path';

const UPLOAD_ROOT = process.env.UPLOAD_ROOT || '/var/data/uploads';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { file: filename } = req.query;

    // Security: only allow basename (no path traversal via ../)
    const safeName = path.basename(filename);
    if (safeName !== filename) {
      return res.status(400).json({ ok: false, error: 'Invalid filename' });
    }

    const filePath = path.join(UPLOAD_ROOT, safeName);

    // Verify the resolved path is within UPLOAD_ROOT
    const resolved = path.resolve(filePath);
    const uploadRootResolved = path.resolve(UPLOAD_ROOT);
    if (!resolved.startsWith(uploadRootResolved)) {
      return res.status(400).json({ ok: false, error: 'Invalid path' });
    }

    // Check if file exists
    const exists = await fs.pathExists(filePath);
    if (!exists) {
      return res.status(404).json({ ok: false, error: 'File not found' });
    }

    // Get file stats and MIME type
    const stat = await fs.stat(filePath);
    let mimeType = 'application/octet-stream';
    if (safeName.match(/\.(jpg|jpeg)$/i)) mimeType = 'image/jpeg';
    else if (safeName.match(/\.png$/i)) mimeType = 'image/png';
    else if (safeName.match(/\.gif$/i)) mimeType = 'image/gif';
    else if (safeName.match(/\.webp$/i)) mimeType = 'image/webp';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const stream = fs.createReadStream(filePath);

    stream.on('error', (err) => {
      console.error('[api/uploads/file] stream error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: 'Failed to stream file' });
      } else {
        res.destroy();
      }
    });

    stream.pipe(res);
  } catch (err) {
    console.error('[api/uploads/file]', err.message);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: 'File download failed' });
    }
  }
}
