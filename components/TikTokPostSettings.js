import { useEffect, useState } from "react";
import { authedFetch } from "../lib/clientAuth";

// The TikTok part of "Post a commercial". TikTok's Direct Post rules (checked in app
// review) say the posting page must: show which TikTok account it posts to; let the
// person pick the audience from TikTok's own list with nothing picked in advance; leave
// comments, duets and stitches off until switched on, and greyed out when the account
// has them off; offer the commercial-content disclosure; and show the consent line.
// The server checks the same rules again (lib/socialMediaPosters.js tiktokPostInfo).

const PRIVACY_LABEL = {
  PUBLIC_TO_EVERYONE: "Everyone",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only me",
};

const MUSIC_TERMS = "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en";
const BRANDED_TERMS = "https://www.tiktok.com/legal/page/global/bc-policy/en";

export const EMPTY_TIKTOK_SETTINGS = {
  privacyLevel: "",
  allowComment: false,
  allowDuet: false,
  allowStitch: false,
  discloseContent: false,
  yourBrand: false,
  brandedContent: false,
  aiGenerated: false,
};

/** Why the TikTok part can't be sent yet, or "" when it can. Pure, shared with the page. */
export function tiktokBlocker(settings, creator, videoSeconds) {
  if (!creator) return "Connect TikTok first.";
  if (creator.cannotPost) return creator.cannotPost;
  if (!settings.privacyLevel) return "Choose who can see the TikTok post.";
  if (settings.discloseContent && !settings.yourBrand && !settings.brandedContent) return "Pick Your brand, Branded content, or both.";
  if (settings.brandedContent && settings.privacyLevel === "SELF_ONLY") return "Branded content can't be private.";
  const max = creator.maxVideoPostDurationSec;
  if (max && videoSeconds && videoSeconds > max) return `This account can post videos up to ${max} seconds. This one is ${Math.ceil(videoSeconds)}.`;
  return "";
}

async function startTikTokConnect(setError) {
  try {
    const r = await authedFetch("/api/oauth/authorize?platform=tiktok");
    const j = await r.json();
    if (!j.ok || !j.authUrl) throw new Error(j.error || "Could not start Connect TikTok");
    window.location.href = j.authUrl;
  } catch (err) {
    setError(err.message);
  }
}

/**
 * @param {{ value: object, onChange: (next: object) => void, onCreator: (creator: object|null) => void, videoSeconds?: number }} props
 */
export default function TikTokPostSettings({ value, onChange, onCreator, videoSeconds }) {
  const [state, setState] = useState({ loading: true });
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    authedFetch("/api/social/tiktok-creator")
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (!j.ok) { setState({ loading: false }); setError(j.error || "Could not reach TikTok"); onCreator(null); return; }
        const creator = j.connected ? { ...(j.creator || {}), cannotPost: j.cannotPost || "" } : null;
        setState({ loading: false, connected: j.connected, reconnect: j.reconnect, creator });
        onCreator(creator);
      })
      .catch(() => { if (live) { setState({ loading: false }); setError("Could not reach TikTok"); onCreator(null); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (patch) => onChange({ ...value, ...patch });

  if (state.loading) return <p className="sf-sub">Checking your TikTok account…</p>;
  if (!state.connected) {
    return (
      <div className="sf-field">
        <p className="sf-sub">{state.reconnect ? "TikTok needs you to connect again." : "TikTok isn't connected yet."}</p>
        <button type="button" className="sf-btn primary" onClick={() => startTikTokConnect(setError)}>Connect TikTok</button>
        {error ? <p className="sf-err">{error}</p> : null}
      </div>
    );
  }

  const c = state.creator;
  if (c.cannotPost) return <p className="sf-err">{c.cannotPost}</p>;
  const options = c.privacyLevelOptions || [];
  const branded = value.discloseContent && value.brandedContent;
  const blocker = tiktokBlocker(value, c, videoSeconds);

  return (
    <fieldset className="sf-field">
      <legend>TikTok</legend>
      <p className="sf-sub">
        Posting to <strong>{c.nickname || c.username}</strong>{c.username ? ` (@${c.username})` : ""}.
        {c.maxVideoPostDurationSec ? ` Videos up to ${c.maxVideoPostDurationSec} seconds.` : ""}
      </p>

      <label htmlFor="sf-tt-mode">How to send it</label>
      <select id="sf-tt-mode" value={value.mode || "post"} onChange={(e) => set({ mode: e.target.value })}>
        <option value="post">Post it now</option>
        <option value="draft">Send to my TikTok drafts</option>
      </select>
      {value.mode === "draft" ? <p className="sf-sub">The video goes to your TikTok inbox. Open TikTok to add sounds, edit and post it.</p> : null}

      <label htmlFor="sf-tt-privacy">Who can see this post</label>
      <select id="sf-tt-privacy" value={value.privacyLevel} onChange={(e) => set({ privacyLevel: e.target.value })}>
        <option value="" disabled>Choose…</option>
        {options.map((p) => (
          <option key={p} value={p} disabled={branded && p === "SELF_ONLY"}>
            {PRIVACY_LABEL[p] || p}{branded && p === "SELF_ONLY" ? " (not allowed for branded content)" : ""}
          </option>
        ))}
      </select>

      <span className="sf-sub">Let people:</span>
      <label className="sf-check"><input type="checkbox" checked={value.allowComment && !c.commentDisabled} disabled={c.commentDisabled} onChange={(e) => set({ allowComment: e.target.checked })} /> Comment{c.commentDisabled ? " (off in your TikTok settings)" : ""}</label>
      <label className="sf-check"><input type="checkbox" checked={value.allowDuet && !c.duetDisabled} disabled={c.duetDisabled} onChange={(e) => set({ allowDuet: e.target.checked })} /> Duet{c.duetDisabled ? " (off in your TikTok settings)" : ""}</label>
      <label className="sf-check"><input type="checkbox" checked={value.allowStitch && !c.stitchDisabled} disabled={c.stitchDisabled} onChange={(e) => set({ allowStitch: e.target.checked })} /> Stitch{c.stitchDisabled ? " (off in your TikTok settings)" : ""}</label>

      <label className="sf-check">
        <input type="checkbox" checked={value.discloseContent} onChange={(e) => set({ discloseContent: e.target.checked, ...(e.target.checked ? {} : { yourBrand: false, brandedContent: false }) })} />
        {" "}Disclose video content (this video promotes a brand, product or service)
      </label>
      {value.discloseContent ? (
        <div style={{ paddingLeft: 22 }}>
          <label className="sf-check"><input type="checkbox" checked={value.yourBrand} onChange={(e) => set({ yourBrand: e.target.checked })} /> Your brand: you&apos;re promoting yourself or your own business</label>
          <label className="sf-check">
            <input type="checkbox" checked={value.brandedContent} onChange={(e) => set({ brandedContent: e.target.checked, ...(e.target.checked && value.privacyLevel === "SELF_ONLY" ? { privacyLevel: "" } : {}) })} />
            {" "}Branded content: you&apos;re promoting another brand or a third party
          </label>
          {value.brandedContent ? <p className="sf-sub">Your video will be labeled &quot;Paid partnership&quot;.</p>
            : value.yourBrand ? <p className="sf-sub">Your video will be labeled &quot;Promotional content&quot;.</p> : null}
        </div>
      ) : null}

      <label className="sf-check"><input type="checkbox" checked={value.aiGenerated} onChange={(e) => set({ aiGenerated: e.target.checked })} /> Label as AI-generated</label>

      <p className="sf-sub">
        By posting, you agree to TikTok&apos;s{" "}
        {branded ? <><a className="sf-link" href={BRANDED_TERMS} target="_blank" rel="noreferrer">Branded Content Policy</a> and </> : null}
        <a className="sf-link" href={MUSIC_TERMS} target="_blank" rel="noreferrer">Music Usage Confirmation</a>.
      </p>
      <p className="sf-sub">After you post, it can take a few minutes for the video to process and show on your profile.</p>
      {blocker ? <p className="sf-err">{blocker}</p> : null}
    </fieldset>
  );
}
