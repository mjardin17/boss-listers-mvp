"use strict";

const STYLES = ["mini-drama", "talking-head", "unboxing", "plot-twist", "street-interview", "before-after", "problem-solution", "asmr-close-up", "countdown", "testimonial-style"];
const RATIOS = { "9:16": [1080, 1920], "3:4": [1080, 1440] };
const PRESETS = ["tiktok", "reels", "shorts"];
const BANNED = [/\bguaranteed\b/ig, /\bcures?\b/ig, /\bbest[- ]selling\b/ig, /\b5 stars?\b/ig, /\bcustomers love\b/ig, /\bnumber one\b/ig];

function cleanProduct(input = {}) {
  return {
    id: String(input.id || "").trim(), title: String(input.title || "").trim(),
    price: input.price == null || input.price === "" ? "" : String(input.price),
    image: String(input.image || input.imageUrl || ""), url: String(input.url || ""),
    description: String(input.description || ""), source: input.source || "seller-input",
  };
}
function scriptPrompt(product, style, topic = "") {
  if (!STYLES.includes(style)) throw new Error(`Unknown script style: ${style}`);
  const p = cleanProduct(product);
  return `Write a truthful short vertical-video script as strict JSON with scenes [{duration,voice,text,visual}]. Style: ${style}. Product/topic: ${p.title || topic}. Facts: ${p.description || "none supplied"}. Price: ${p.price || "not provided"}. Never invent reviews, ratings, sales, scarcity, or product claims. Multiple named voices are allowed.`;
}
function fallbackScript(product, style, topic = "") {
  const p = cleanProduct(product), name = p.title || topic || "this topic";
  const scene = (voice, text, visual, duration = 4) => ({ duration, voice, text, visual });
  const scripts = {
    "mini-drama": [scene("Narrator", `A small moment changes how ${name} fits the day.`, "Show product in a real setting."), scene("Narrator", `Take a closer look at the details.`, "Slow close-up."), scene("Narrator", `Explore the details and decide if it suits you.`, "Hold final product frame.")],
    "talking-head": [scene("Presenter", `Here is ${name}.`, "Presenter beside product."), scene("Presenter", `Here is what we can verify: ${p.description || "the product itself"}.`, "Show product details."), scene("Presenter", `Check the listing for more information.`, "Product and neutral CTA.")],
    "unboxing": [scene("Presenter", `Let's take a look at ${name}.`, "Package opening, if supplied."), scene("Presenter", `Here are the visible details.`, "Close product shots."), scene("Presenter", `See the listing for its full details.`, "Product hero.")],
    "plot-twist": [scene("Narrator", `You might expect one thing from ${name}.`, "Establishing shot."), scene("Narrator", `The detail worth noticing is right here.`, "Reveal a documented feature."), scene("Narrator", `Take a closer look before deciding.`, "Product hero.")],
    "street-interview": [scene("Host", `What stands out about ${name}?`, "Neutral street-style framing."), scene("Guest", `The visible detail is the design.`, "Show product; fictional dialogue is illustrative."), scene("Host", `See the listing for verified information.`, "Product hero.")],
    "before-after": [scene("Narrator", `Before: a closer look at the setup.`, "Neutral before shot."), scene("Narrator", `After: the product shown in use.`, "After shot only when supplied."), scene("Narrator", `Compare the visible details.`, "Side-by-side without implying results.")],
    "problem-solution": [scene("Narrator", `Looking for an option in this category?`, "Category context."), scene("Narrator", `${name} is one option to explore.`, "Show the real product."), scene("Narrator", `Review the listing details to see if it fits.`, "Neutral CTA.")],
    "asmr-close-up": [scene("Narrator", `A quiet close-up of ${name}.`, "Macro detail; no unsupported sound claims."), scene("Narrator", `Notice the visible texture and finish.`, "Slow pan across product."), scene("Narrator", `Explore the listing for the full description.`, "Steady hero frame.")],
    "countdown": [scene("Narrator", `Three details to notice about ${name}.`, "Number 3 card."), scene("Narrator", `Two: the visible design. One: the details shown here.`, "Numbers 2 then 1."), scene("Narrator", `See the listing for verified specifications.`, "Product hero.")],
    "testimonial-style": [scene("Narrator", `A product spotlight: ${name}.`, "Clearly label as a product spotlight."), scene("Narrator", `Here are the details visible in the listing.`, "Show actual product."), scene("Narrator", `No customer review is being represented. Explore the item details.`, "Neutral CTA.")],
  };
  return { style, scenes: scripts[style], generatedBy: "local-template", factualBasis: p.description ? "seller-provided" : "visual-only" };
}
function scoreScript(script) {
  const scenes = Array.isArray(script?.scenes) ? script.scenes : [];
  const text = scenes.map((s) => String(s.text || "")).join(" ");
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const pacing = scenes.length >= 3 && scenes.length <= 8 && scenes.every((s) => Number(s.duration) >= 1 && Number(s.duration) <= 8) ? 25 : 8;
  const voice = scenes.length && scenes.every((s) => String(s.voice || "").trim()) ? 25 : 8;
  const freshness = new Set(text.toLowerCase().match(/\b[a-z]{4,}\b/g) || []).size;
  const freshnessScore = Math.min(25, Math.round(freshness / Math.max(1, words) * 100));
  const structure = scenes.length >= 3 && /\b(see|explore|check|look|discover)\b/i.test(text) ? 25 : 10;
  return { pacing, voice, freshness: freshnessScore, structure, total: pacing + voice + freshnessScore + structure };
}
function judgeScript(script) {
  const score = scoreScript(script);
  const scenes = (script?.scenes || []).map((s) => ({ ...s }));
  const rewrites = [];
  if (score.total < 70) scenes.forEach((s) => {
    if (!String(s.text || "").trim()) { s.text = "Take a closer look at the verified product details."; rewrites.push(s); }
    if (!String(s.voice || "").trim()) { s.voice = "Narrator"; rewrites.push(s); }
  });
  if (scenes.length && !scenes.some((s) => /\b(see|explore|check|look)\b/i.test(s.text || ""))) {
    scenes[scenes.length - 1].text = "Explore the listing for verified product details.";
  }
  return { script: { ...script, scenes }, score, rewrites: rewrites.length };
}
async function writeWithOllama(product, style, opts = {}) {
  const base = opts.baseUrl || process.env.OLLAMA_OPENAI_BASE_URL || "http://127.0.0.1:11434/v1";
  const model = opts.model || process.env.OLLAMA_MODEL || "llama3.2";
  const res = await (opts.fetch || fetch)(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature: 0.7, messages: [{ role: "user", content: scriptPrompt(product, style, opts.topic) }] }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Local script endpoint returned ${res.status}`);
  const data = await res.json();
  const result = JSON.parse(data.choices?.[0]?.message?.content || "{}");
  if (!Array.isArray(result.scenes)) throw new Error("Script endpoint returned no scenes");
  return judgeScript({ ...result, style, generatedBy: "local-model" });
}
function costEstimate(seconds, rate) {
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(rate) || rate < 0) throw new Error("seconds and non-negative rate are required");
  return { seconds, perSecond: rate, total: Number((seconds * rate).toFixed(6)), paidCallEnabled: false, confirmationRequired: true };
}
function confirmFilmSpend(estimate, confirmed) {
  if (!estimate || estimate.paidCallEnabled !== false) throw new Error("Invalid spend estimate");
  if (confirmed !== true) throw new Error("Explicit confirmation required; no spend occurred");
  return { ...estimate, approved: true, paidCallMade: false, message: "AI film is a stub in v1; no paid call was made." };
}
function captionPack(product, script, preset = "reels") {
  if (!PRESETS.includes(preset)) throw new Error("Unknown platform preset");
  const p = cleanProduct(product), first = script?.scenes?.[0]?.text || p.title;
  const tags = ["#BossListers", "#ProductSpotlight", ...(p.title ? [`#${p.title.replace(/[^a-z0-9]/gi, "").slice(0, 24)}`] : [])];
  return { preset, caption: [first, p.price ? `Price set by seller: ${p.price}` : "", p.url].filter(Boolean).join("\n"), hashtags: tags, coverText: (p.title || "Product details").slice(0, 50) };
}
function complianceCheck(text, options = {}) {
  const hits = BANNED.flatMap((re) => [...String(text || "").matchAll(re)].map((m) => ({ term: m[0], hint: "Replace with a specific, verifiable product fact." })));
  return { ok: hits.length === 0, hits, aiGeneratedLabel: options.aiGeneratedLabel === true, selfCheckRequired: true, reviewed: options.reviewed === true };
}
function makeBatch(products, options = {}) {
  if (!Array.isArray(products) || products.length > 10) throw new Error("Batch supports at most 10 products");
  return products.map((product) => ({ product: cleanProduct(product), template: options.templates?.[product.id] || options.template || "product-showcase", cuts: ["A", "B"], postingPlan: "suggestion-only" }));
}
function presenterRecord(input = {}) {
  return { id: String(input.id || `persona-${Date.now()}`), name: String(input.name || "New presenter"), references: { front: input.references?.front || "", side: input.references?.side || "", back: input.references?.back || "", closeup: input.references?.closeup || "" }, generation: "stub-only", createdAt: input.createdAt || new Date().toISOString() };
}
function mcpToolDefinition() {
  return { name: "make_commercial", description: "Create a local quick-cut commercial from a product ID or product URL; never posts.", inputSchema: { type: "object", properties: { product: { type: "string" }, format: { type: "string", enum: ["9:16", "3:4"] } }, required: ["product"] }, outputSchema: { type: "object", properties: { videoPath: { type: "string" }, captionPack: { type: "object" } } } };
}
module.exports = { STYLES, RATIOS, PRESETS, cleanProduct, scriptPrompt, fallbackScript, scoreScript, judgeScript, writeWithOllama, costEstimate, confirmFilmSpend, captionPack, complianceCheck, makeBatch, presenterRecord, mcpToolDefinition };
