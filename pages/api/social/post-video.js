// pages/api/social/post-video.js
// Owner session only: it uses the shared Instagram and Facebook tokens.
//   GET  → the finished commercials on this computer and the platforms that are wired.
//   POST → send one video to Instagram (as a Reel), the Facebook Page and/or TikTok.
//          body: { platforms: ["instagram","facebook","tiktok"], commercial | videoUrl, caption, confirm,
//                  tiktok: { privacyLevel, allowComment, allowDuet, allowStitch, discloseContent, yourBrand, brandedContent, aiGenerated } }
//          TikTok posts with the owner's own connected TikTok account (Connect TikTok on /social).
// Preview is the default and sends nothing. A live post needs confirm: "PUBLISH_LIVE";
// only then is a commercial file copied to public storage and posted.
// The reply always says, per platform, whether it was really posted.

const { loadEnvConfig } = require("@next/env");
const { requireOwnerSession } = require("../../../lib/requireSession");
const { postVideoByUrl, VIDEO_URL_PLATFORMS, PUBLISH_CONFIRM } = require("../../../lib/socialMediaPosters");
const { listCommercials, resolveVideoAddress } = require("../../../lib/commercialFiles");
const { uploadPublicImage } = require("../../../lib/supabaseStorage");
const { getTikTokAccessToken } = require("../../../lib/tiktokAccount");

const TIKTOK_SETTING_KEYS = ["privacyLevel", "allowComment", "allowDuet", "allowStitch", "discloseContent", "yourBrand", "brandedContent", "aiGenerated"];

/** Keeps only the known TikTok settings, with the right types. */
function readTikTokSettings(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const key of TIKTOK_SETTING_KEYS) {
    if (key === "privacyLevel") { if (typeof raw.privacyLevel === "string") out.privacyLevel = raw.privacyLevel; }
    else if (raw[key] === true) out[key] = true;
  }
  return out;
}

const MAX_CAPTION_INPUT = 70000;

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const session = await requireOwnerSession(req, res);
  if (!session) return;
  loadEnvConfig(process.cwd());

  if (req.method === "GET") {
    return res.status(200).json({ ok: true, platforms: VIDEO_URL_PLATFORMS, confirmPhrase: PUBLISH_CONFIRM, commercials: listCommercials() });
  }

  const { platforms, videoUrl, commercial, caption = "", confirm, tiktok } = req.body || {};
  if (!Array.isArray(platforms) || platforms.length === 0 || platforms.length > VIDEO_URL_PLATFORMS.length) {
    return badRequest(res, `Choose one or more of: ${VIDEO_URL_PLATFORMS.join(", ")}`);
  }
  const chosen = [...new Set(platforms.map(String))];
  const unknown = chosen.filter((p) => !VIDEO_URL_PLATFORMS.includes(p));
  if (unknown.length) return badRequest(res, `Not wired for video yet: ${unknown.join(", ")}`);
  if (videoUrl !== undefined && (typeof videoUrl !== "string" || videoUrl.length > 2000)) return badRequest(res, "The video address is not valid");
  if (commercial !== undefined && typeof commercial !== "string") return badRequest(res, "The commercial name is not valid");
  if (typeof caption !== "string" || caption.length > MAX_CAPTION_INPUT) return badRequest(res, "The caption is too long");

  const live = confirm === PUBLISH_CONFIRM;
  try {
    const video = await resolveVideoAddress({ videoUrl, commercial }, { live, upload: uploadPublicImage });
    if (!video.ok) return badRequest(res, video.error);

    const tiktokAccessToken = chosen.includes("tiktok") ? await getTikTokAccessToken(session.userId) : null;
    const tiktokSettings = readTikTokSettings(tiktok);
    const results = {};
    for (const platform of chosen) {
      results[platform] = platform === "tiktok"
        ? await postVideoByUrl("tiktok", { videoUrl: video.videoUrl, caption, tiktok: tiktokSettings }, { live, confirm, tiktokAccessToken })
        : await postVideoByUrl(platform, { videoUrl: video.videoUrl, caption }, { live, confirm });
    }
    const posted = Object.values(results).filter((r) => r.success).length;
    return res.status(200).json({
      ok: true,
      live,
      posted,
      video: { uploaded: video.uploaded, wouldUpload: Boolean(video.wouldUpload), bytes: video.bytes || null, url: video.uploaded ? video.videoUrl : null },
      results,
    });
  } catch (err) {
    console.error("[api/social/post-video]", err.message);
    return res.status(500).json({ ok: false, error: "The video could not be sent" });
  }
}
