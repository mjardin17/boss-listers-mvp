// POST /api/analyze
// Extract product info from photo using Claude Vision + analyzeService
// body: FormData with 'photo' file

import formidable from "formidable";
import fs from "fs/promises";
import { analyzeFormData } from "../../lib/analyzeService";

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const form = formidable({ maxFileSize: 10 * 1024 * 1024 });

  try {
    const [fields, files] = await form.parse(req);
    const photoFile = files.photo?.[0];

    if (!photoFile) {
      return res.status(400).json({ ok: false, error: "No photo file provided" });
    }

    const photoBuffer = await fs.readFile(photoFile.filepath);
    const mimeType = photoFile.mimetype || "image/jpeg";

    const analyzed = await analyzeFormData({ buffer: photoBuffer, mimeType });

    await fs.unlink(photoFile.filepath).catch(() => {});

    return res.status(200).json({ ok: true, productInfo: analyzed });
  } catch (err) {
    console.error("[api/analyze]", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
