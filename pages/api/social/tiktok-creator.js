// pages/api/social/tiktok-creator.js
// GET → what the signed-in owner's connected TikTok account may post right now
// (nickname, allowed audiences, switched-off interactions, longest video). TikTok's
// Direct Post rules require the posting page to show these before anything is sent.
// { ok: true, connected: false } when TikTok is not connected. Never returns a token.

const { requireOwnerSession } = require("../../../lib/requireSession");
const { getTikTokAccessToken } = require("../../../lib/tiktokAccount");
const { getTikTokCreatorInfo } = require("../../../lib/socialMediaPosters");

// TikTok error codes that mean "this account can't post right now", worded for the page.
const CANNOT_POST = {
  spam_risk_too_many_posts: "This TikTok account has reached its daily post limit. Try again tomorrow.",
  spam_risk_user_banned_from_posting: "TikTok isn't letting this account post right now.",
  reached_active_user_cap: "TikTok's daily limit for this app is used up. Try again tomorrow.",
};

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const session = await requireOwnerSession(req, res);
  if (!session) return;
  res.setHeader("Cache-Control", "no-store");

  try {
    const token = await getTikTokAccessToken(session.userId);
    if (!token) return res.status(200).json({ ok: true, connected: false });
    const creator = await getTikTokCreatorInfo(token);
    return res.status(200).json({ ok: true, connected: true, creator });
  } catch (err) {
    if (err.tiktokCode === "access_token_invalid" || err.tiktokCode === "scope_not_authorized") {
      return res.status(200).json({ ok: true, connected: false, reconnect: true });
    }
    if (CANNOT_POST[err.tiktokCode]) {
      return res.status(200).json({ ok: true, connected: true, cannotPost: CANNOT_POST[err.tiktokCode] });
    }
    console.error("[api/social/tiktok-creator]", err.message);
    return res.status(502).json({ ok: false, error: "Could not reach TikTok" });
  }
}
