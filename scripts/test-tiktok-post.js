const test = require("node:test");
const assert = require("node:assert");
const { planVideoPost, postVideoByUrl, tiktokChunkPlan, tiktokPostInfo, PUBLISH_CONFIRM } = require("../lib/socialMediaPosters");

const VIDEO = "https://example.supabase.co/storage/v1/object/public/commercials/item.mp4";
const TOKEN = "act.tiktok-secret-token";
const GOOD = { privacyLevel: "SELF_ONLY" };
const LIVE = { live: true, confirm: PUBLISH_CONFIRM, tiktokAccessToken: TOKEN, pollMs: 0, maxPolls: 3 };
const CREATOR = {
  creator_username: "bosslister", creator_nickname: "Boss Lister",
  privacy_level_options: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"],
  comment_disabled: false, duet_disabled: true, stitch_disabled: false, max_video_post_duration_sec: 600,
};
const ok = (data) => ({ status: 200, body: { data, error: { code: "ok", message: "" } } });

/** Fake fetch answering from a queue; records method, url, headers and JSON bodies. */
function fakeFetch(answers) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    const isJson = typeof opts.body === "string";
    calls.push({ url: String(url), method: opts.method || "GET", headers: opts.headers || {}, body: isJson ? JSON.parse(opts.body) : null, bytes: isJson ? null : opts.body });
    const next = answers.shift();
    if (!next) throw new Error(`unexpected call to ${url}`);
    return {
      ok: next.status < 300,
      status: next.status,
      headers: { get: (h) => (next.headers || {})[h.toLowerCase()] || null },
      json: async () => next.body,
      text: async () => (next.raw !== undefined ? next.raw : JSON.stringify(next.body)),
      arrayBuffer: async () => next.bytes,
    };
  };
  fn.calls = calls;
  return fn;
}

test("chunks: up to 64 MB goes as one piece; bigger files use 10 MB pieces with the rest on the last", () => {
  assert.deepStrictEqual(tiktokChunkPlan(1000), { chunkSize: 1000, count: 1, ranges: [{ start: 0, end: 999 }] });
  const MB = 1024 * 1024;
  const p = tiktokChunkPlan(65 * MB + 7);
  assert.strictEqual(p.chunkSize, 10 * MB);
  assert.strictEqual(p.count, 6);
  assert.deepStrictEqual(p.ranges[5], { start: 50 * MB, end: 65 * MB + 6 });
  assert.deepStrictEqual(tiktokChunkPlan(7 * MB), { chunkSize: 7 * MB, count: 1, ranges: [{ start: 0, end: 7 * MB - 1 }] });
  assert.strictEqual(tiktokChunkPlan(64 * MB).count, 1);
  const big = tiktokChunkPlan(95 * MB);
  assert.strictEqual(big.count, 9);
  assert.strictEqual(big.ranges[8].end - big.ranges[8].start + 1, 15 * MB);
  assert.throws(() => tiktokChunkPlan(0));
});

test("settings: no audience picked in advance, interactions off unless switched on", () => {
  assert.match(tiktokPostInfo({}, "x").errors[0], /Choose who can see/);
  const { postInfo } = tiktokPostInfo({ privacyLevel: "PUBLIC_TO_EVERYONE" }, "Hi");
  assert.deepStrictEqual(postInfo, {
    title: "Hi", privacy_level: "PUBLIC_TO_EVERYONE", disable_comment: true, disable_duet: true, disable_stitch: true,
    brand_organic_toggle: false, brand_content_toggle: false, is_aigc: false,
  });
});

test("settings: disclosure needs a choice, and branded content can't be private", () => {
  assert.match(tiktokPostInfo({ privacyLevel: "PUBLIC_TO_EVERYONE", discloseContent: true }, "").errors[0], /Your brand, Branded content/);
  assert.match(tiktokPostInfo({ privacyLevel: "SELF_ONLY", discloseContent: true, brandedContent: true }, "").errors[0], /can't be private/);
  const { postInfo } = tiktokPostInfo({ privacyLevel: "PUBLIC_TO_EVERYONE", discloseContent: true, yourBrand: true, brandedContent: true }, "");
  assert.strictEqual(postInfo.brand_organic_toggle, true);
  assert.strictEqual(postInfo.brand_content_toggle, true);
  // toggles without the disclosure switch are ignored
  assert.strictEqual(tiktokPostInfo({ privacyLevel: "SELF_ONLY", yourBrand: true }, "").postInfo.brand_organic_toggle, false);
});

test("plan: needs a connected account, lists the steps, never shows the token", () => {
  assert.match(planVideoPost("tiktok", { videoUrl: VIDEO, tiktok: GOOD }, {}, {}).errors.join(" "), /Connect TikTok first/);
  const plan = planVideoPost("tiktok", { videoUrl: VIDEO, caption: "Hi", tiktok: GOOD }, {}, { tiktokAccessToken: TOKEN });
  assert.strictEqual(plan.ok, true);
  assert.strictEqual(plan.steps.length, 4);
  assert.doesNotMatch(JSON.stringify(plan), /secret-token/);
});

test("preview sends nothing", async () => {
  const f = fakeFetch([]);
  const r = await postVideoByUrl("tiktok", { videoUrl: VIDEO, tiktok: GOOD }, { tiktokAccessToken: TOKEN, fetchImpl: f });
  assert.strictEqual(r.dryRun, true);
  assert.strictEqual(f.calls.length, 0);
});

test("live: checks the account, uploads the file in one piece, waits for publish, links the post", async () => {
  const bytes = Buffer.from("fake mp4 bytes");
  const f = fakeFetch([
    ok(CREATOR),
    { status: 200, headers: { "content-length": String(bytes.length) }, bytes },
    ok({ publish_id: "v_pub_file~1", upload_url: "https://open-upload.tiktokapis.com/video/?upload_id=1" }),
    { status: 201, body: {} },
    ok({ status: "PROCESSING_UPLOAD" }),
    { status: 200, raw: '{"data":{"status":"PUBLISH_COMPLETE","publicaly_available_post_id":[7300000000000000001]},"error":{"code":"ok"}}' },
  ]);
  const r = await postVideoByUrl("tiktok", { videoUrl: VIDEO, caption: "Sold!", tiktok: { privacyLevel: "SELF_ONLY", allowComment: true, allowDuet: true } }, { ...LIVE, fetchImpl: f });
  assert.strictEqual(r.success, true, r.error);
  assert.strictEqual(r.url, "https://www.tiktok.com/@bosslister/video/7300000000000000001");

  const [creator, download, init, put, s1] = f.calls;
  assert.strictEqual(creator.url, "https://open.tiktokapis.com/v2/post/publish/creator_info/query/");
  assert.strictEqual(creator.headers.Authorization, `Bearer ${TOKEN}`);
  assert.strictEqual(download.url, VIDEO);
  assert.strictEqual(download.headers.Authorization, undefined, "the TikTok token must not go to the video host");
  assert.strictEqual(init.url, "https://open.tiktokapis.com/v2/post/publish/video/init/");
  assert.deepStrictEqual(init.body.source_info, { source: "FILE_UPLOAD", video_size: bytes.length, chunk_size: bytes.length, total_chunk_count: 1 });
  assert.strictEqual(init.body.post_info.title, "Sold!");
  assert.strictEqual(init.body.post_info.disable_comment, false);
  assert.strictEqual(init.body.post_info.disable_duet, true, "the creator has duets off, so it stays off");
  assert.strictEqual(put.method, "PUT");
  assert.strictEqual(put.headers["Content-Range"], `bytes 0-${bytes.length - 1}/${bytes.length}`);
  assert.strictEqual(put.headers.Authorization, undefined);
  assert.deepStrictEqual(s1.body, { publish_id: "v_pub_file~1" });
  assert.doesNotMatch(JSON.stringify(r), /secret-token/);
});

test("live: refuses an audience TikTok doesn't offer this account, before uploading anything", async () => {
  const f = fakeFetch([ok({ ...CREATOR, privacy_level_options: ["SELF_ONLY"] })]);
  const r = await postVideoByUrl("tiktok", { videoUrl: VIDEO, tiktok: { privacyLevel: "PUBLIC_TO_EVERYONE" } }, { ...LIVE, fetchImpl: f });
  assert.strictEqual(r.success, false);
  assert.match(r.error, /doesn't offer that audience/);
  assert.strictEqual(f.calls.length, 1);
});

test("live: a TikTok failure comes back as not posted, with TikTok's reason", async () => {
  const bytes = Buffer.from("x");
  const f = fakeFetch([
    ok(CREATOR),
    { status: 200, headers: {}, bytes },
    ok({ publish_id: "p", upload_url: "https://open-upload.tiktokapis.com/video/?upload_id=2" }),
    { status: 201, body: {} },
    ok({ status: "FAILED", fail_reason: "file_format_check_failed" }),
  ]);
  const r = await postVideoByUrl("tiktok", { videoUrl: VIDEO, tiktok: GOOD }, { ...LIVE, fetchImpl: f });
  assert.strictEqual(r.success, false);
  assert.match(r.error, /file_format_check_failed/);
});

test("live: an API error is reported, never thrown", async () => {
  const f = fakeFetch([{ status: 401, body: { error: { code: "access_token_invalid", message: "The access token is invalid" } } }]);
  const r = await postVideoByUrl("tiktok", { videoUrl: VIDEO, tiktok: GOOD }, { ...LIVE, fetchImpl: f });
  assert.strictEqual(r.success, false);
  assert.match(r.error, /access token is invalid/);
});

test("draft mode: uploads to the creator's TikTok inbox, no audience needed", async () => {
  const bytes = Buffer.from("mp4");
  const f = fakeFetch([
    { status: 200, headers: {}, bytes },
    ok({ publish_id: "inbox~1", upload_url: "https://open-upload.tiktokapis.com/video/?upload_id=9" }),
    { status: 201, body: {} },
    ok({ status: "SEND_TO_USER_INBOX" }),
  ]);
  const r = await postVideoByUrl("tiktok", { videoUrl: VIDEO, tiktok: { mode: "draft" } }, { ...LIVE, fetchImpl: f });
  assert.strictEqual(r.success, true, r.error);
  assert.strictEqual(f.calls[1].url, "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/");
  assert.strictEqual(f.calls[1].body.post_info, undefined);
});
