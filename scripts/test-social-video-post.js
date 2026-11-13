const test = require("node:test");
const assert = require("node:assert");
const { planVideoPost, postVideoByUrl, VIDEO_URL_PLATFORMS } = require("../lib/socialMediaPosters");

const ENV = { IG_ACCESS_TOKEN: "ig-secret-token", FB_ACCESS_TOKEN: "fb-secret-token", FB_PAGE_ID: "1315311881667461" };
const VIDEO = "https://example.supabase.co/storage/v1/object/public/commercials/item.mp4";

/** A fake fetch that answers from a queue and records every call. */
function fakeFetch(answers) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null, auth: opts.headers && opts.headers.Authorization });
    const next = answers.shift();
    if (!next) throw new Error(`unexpected call to ${url}`);
    return { ok: next.status < 300, status: next.status, json: async () => next.body };
  };
  fn.calls = calls;
  return fn;
}

test("only Instagram and Facebook are wired for posting by video address", () => {
  assert.deepStrictEqual(VIDEO_URL_PLATFORMS, ["instagram", "facebook"]);
});

test("plan: a good request lists the steps and never contains a token", () => {
  const ig = planVideoPost("instagram", { videoUrl: VIDEO, caption: "Hello" }, ENV);
  assert.strictEqual(ig.ok, true);
  assert.deepStrictEqual(ig.steps.map((s) => s.what), ["create Reel container", "wait for Instagram to process the video", "publish the Reel"]);
  const fb = planVideoPost("facebook", { videoUrl: VIDEO, caption: "Hello" }, ENV);
  assert.strictEqual(fb.ok, true);
  assert.match(fb.steps[0].url, /\/1315311881667461\/videos$/);
  assert.doesNotMatch(JSON.stringify([ig, fb]), /secret-token/);
});

test("plan: refuses a video address that is not public https", () => {
  for (const bad of ["http://x.com/a.mp4", "/uploads/a.mp4", "https://localhost/a.mp4", "https://127.0.0.1/a.mp4", "https://user:pw@x.com/a.mp4", "", null]) {
    const plan = planVideoPost("instagram", { videoUrl: bad, caption: "x" }, ENV);
    assert.strictEqual(plan.ok, false, String(bad));
    assert.match(plan.errors.join(" "), /public https/);
  }
});

test("plan: refuses an unknown platform and a missing token, and says which", () => {
  assert.match(planVideoPost("tiktok", { videoUrl: VIDEO }, ENV).errors[0], /not wired/);
  assert.match(planVideoPost("instagram", { videoUrl: VIDEO }, {}).errors[0], /IG_ACCESS_TOKEN/);
  assert.match(planVideoPost("facebook", { videoUrl: VIDEO }, { FB_ACCESS_TOKEN: "t" }).errors[0], /FB_PAGE_ID/);
});

test("plan: an over-long caption is cut to the platform limit", () => {
  const plan = planVideoPost("instagram", { videoUrl: VIDEO, caption: "a".repeat(5000) }, ENV);
  assert.strictEqual(plan.caption.length, 2200);
});

test("preview is the default: no network call is made", async () => {
  const fetchImpl = fakeFetch([]);
  for (const opts of [{}, { live: true }, { live: true, confirm: "yes" }, { confirm: "PUBLISH_LIVE" }]) {
    const out = await postVideoByUrl("instagram", { videoUrl: VIDEO, caption: "x" }, { ...opts, env: ENV, fetchImpl });
    assert.strictEqual(out.dryRun, true);
    assert.strictEqual(out.success, false);
  }
  assert.strictEqual(fetchImpl.calls.length, 0);
});

test("a bad request is refused before any network call, even in live mode", async () => {
  const fetchImpl = fakeFetch([]);
  const out = await postVideoByUrl("instagram", { videoUrl: "http://x/a.mp4" }, { live: true, confirm: "PUBLISH_LIVE", env: ENV, fetchImpl });
  assert.strictEqual(out.success, false);
  assert.strictEqual(out.dryRun, undefined);
  assert.strictEqual(fetchImpl.calls.length, 0);
});

test("Instagram live: container, wait until finished, publish, then report the link", async () => {
  const fetchImpl = fakeFetch([
    { status: 200, body: { id: "C1" } },
    { status: 200, body: { status_code: "IN_PROGRESS" } },
    { status: 200, body: { status_code: "FINISHED" } },
    { status: 200, body: { id: "M9" } },
    { status: 200, body: { permalink: "https://www.instagram.com/reel/abc/" } },
  ]);
  const out = await postVideoByUrl("instagram", { videoUrl: VIDEO, caption: "Hi" }, { live: true, confirm: "PUBLISH_LIVE", env: ENV, fetchImpl, pollMs: 0 });
  assert.deepStrictEqual(out, { platform: "instagram", success: true, mediaId: "M9", url: "https://www.instagram.com/reel/abc/" });
  const [create, , , publish] = fetchImpl.calls;
  assert.deepStrictEqual(create.body, { media_type: "REELS", video_url: VIDEO, caption: "Hi" });
  assert.match(create.url, /graph\.instagram\.com\/v[\d.]+\/me\/media$/);
  assert.strictEqual(create.auth, "Bearer ig-secret-token");
  assert.deepStrictEqual(publish.body, { creation_id: "C1" });
  assert.ok(fetchImpl.calls.every((c) => !c.url.includes("secret-token")), "token must never be in a URL");
});

test("Instagram live: a processing error stops before publishing", async () => {
  const fetchImpl = fakeFetch([{ status: 200, body: { id: "C1" } }, { status: 200, body: { status_code: "ERROR", status: "bad codec" } }]);
  const out = await postVideoByUrl("instagram", { videoUrl: VIDEO }, { live: true, confirm: "PUBLISH_LIVE", env: ENV, fetchImpl, pollMs: 0 });
  assert.strictEqual(out.success, false);
  assert.match(out.error, /could not process/);
  assert.strictEqual(fetchImpl.calls.length, 2);
});

test("Instagram live: gives up after the wait limit instead of publishing blind", async () => {
  const fetchImpl = fakeFetch([{ status: 200, body: { id: "C1" } }, { status: 200, body: { status_code: "IN_PROGRESS" } }, { status: 200, body: { status_code: "IN_PROGRESS" } }]);
  const out = await postVideoByUrl("instagram", { videoUrl: VIDEO }, { live: true, confirm: "PUBLISH_LIVE", env: ENV, fetchImpl, pollMs: 0, maxPolls: 2 });
  assert.strictEqual(out.success, false);
  assert.match(out.error, /still processing/);
  assert.strictEqual(out.containerId, "C1");
});

test("Facebook live: one call to the Page's videos with the public address", async () => {
  const fetchImpl = fakeFetch([{ status: 200, body: { id: "V7" } }]);
  const out = await postVideoByUrl("facebook", { videoUrl: VIDEO, caption: "Hi" }, { live: true, confirm: "PUBLISH_LIVE", env: ENV, fetchImpl });
  assert.deepStrictEqual(out, { platform: "facebook", success: true, mediaId: "V7", url: "https://www.facebook.com/1315311881667461/videos/V7" });
  assert.deepStrictEqual(fetchImpl.calls[0].body, { file_url: VIDEO, description: "Hi" });
  assert.strictEqual(fetchImpl.calls[0].auth, "Bearer fb-secret-token");
});

test("a platform refusal is reported with its message and never as success", async () => {
  const fetchImpl = fakeFetch([{ status: 400, body: { error: { message: "Unsupported video format" } } }]);
  const out = await postVideoByUrl("facebook", { videoUrl: VIDEO }, { live: true, confirm: "PUBLISH_LIVE", env: ENV, fetchImpl });
  assert.strictEqual(out.success, false);
  assert.match(out.error, /Unsupported video format/);
  assert.doesNotMatch(JSON.stringify(out), /secret-token/);
});

test("a response with no id is not counted as posted", async () => {
  const fetchImpl = fakeFetch([{ status: 200, body: {} }]);
  const out = await postVideoByUrl("facebook", { videoUrl: VIDEO }, { live: true, confirm: "PUBLISH_LIVE", env: ENV, fetchImpl });
  assert.strictEqual(out.success, false);
});
