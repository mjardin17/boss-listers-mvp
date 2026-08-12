// functions/api/analyze.js
// Production photo -> AI listing endpoint. Runs on Cloudflare Workers, so
// this cannot use pages/api/analyze.js's approach (formidable + fs-extra
// write to local disk — no filesystem exists here). Uses the Web-standard
// request.formData() API instead, uploads photos straight to Supabase
// Storage, and calls OpenAI Vision from raw bytes.
//
// Tenant-scoped: data.tenantId comes from functions/_middleware.js, never
// from the request itself.

import { inferFromFilename } from '../../lib/imageHeuristics.js';
import { generateForAll } from '../../lib/generator.js';
import { getPricingRecommendation } from '../../lib/pricingIntelligence.js';
import { analyzeProductImageFromBytes } from '../../lib/openaiVision.js';
import { saveListing } from '../../lib/supabaseListings.js';
import { rest } from '../../lib/supabaseRest.js';

const MAX_PHOTOS = 8;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function consumeRateLimit(env, tenantId) {
  const max = Number(env.RATE_LIMIT_MAX || 10);
  const windowSeconds = Math.round(Number(env.RATE_LIMIT_WINDOW_MS || 60000) / 1000);
  const [result] = await rest(env, 'POST', '/rpc/consume_rate_limit', {
    p_key: `analyze:${tenantId}`,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  return result; // { allowed, remaining, retry_after }
}

async function uploadPhotoToStorage(env, tenantId, file) {
  const ext = (file.type || 'image/jpeg').split('/')[1] || 'jpg';
  const path = `${tenantId}/${crypto.randomUUID()}.${ext}`;
  const arrayBuffer = await file.arrayBuffer();

  const res = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/${env.SUPABASE_BUCKET}/${path}`,
    {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': file.type || 'image/jpeg',
      },
      body: arrayBuffer,
    },
  );
  if (!res.ok) throw new Error(`Photo upload failed: ${res.status} ${await res.text()}`);

  return { path, arrayBuffer, mimetype: file.type || 'image/jpeg' };
}

function buildAnalysis({ merged, input, pricing, uploadedCount }) {
  const confidence = Number(merged.confidence) || (merged.productName || merged.brand ? 0.55 : 0);
  const quantity =
    merged.quantity || (uploadedCount > 1 ? `${uploadedCount} photos provided` : 'Single item not confirmed');
  return {
    productName: merged.productName || input.model || '',
    brand: merged.brand || input.brand || '',
    category: merged.category || input.categoryHint || '',
    conditionGuess: merged.conditionGuess || input.condition || '',
    quantity,
    priceRange: {
      low: pricing.floorPrice,
      suggested: pricing.recommendedPrice,
      high: Math.ceil(pricing.recommendedPrice * 1.18),
    },
    confidence,
    summary:
      merged.summary ||
      (merged.productName || merged.brand
        ? 'Analysis combined uploaded image cues with listing inputs.'
        : 'No confident product match yet.'),
  };
}

export async function onRequestPost({ request, env, data }) {
  const tenantId = data.tenantId;

  try {
    const limit = await consumeRateLimit(env, tenantId);
    if (!limit.allowed) {
      return jsonResponse(
        { ok: false, error: `Rate limit exceeded. Try again in ${limit.retry_after}s.` },
        429,
      );
    }

    const form = await request.formData();
    const files = form
      .getAll('photos')
      .concat(form.getAll('photo'), form.getAll('file'))
      .filter((f) => f instanceof File)
      .slice(0, MAX_PHOTOS);

    // The dev-mode route this replaces (pages/api/analyze.js) enforced a
    // per-file size cap via formidable; that enforcement did not carry
    // over when this was ported to the Workers runtime, leaving uploads
    // unbounded before they hit the paid OpenAI Vision call. Enforced
    // here, before any Storage upload or Vision spend.
    const maxUploadBytes = Number(env.MAX_UPLOAD_BYTES || 1_200_000);
    const oversized = files.find((f) => f.size > maxUploadBytes);
    if (oversized) {
      return jsonResponse(
        { ok: false, error: `Photo too large: ${oversized.name || 'file'} exceeds ${Math.round(maxUploadBytes / 1024)}KB` },
        413,
      );
    }

    const field = (key, fallback = '') => {
      const v = form.get(key);
      return v === null || v === undefined ? fallback : String(v);
    };

    const imageUrls = [];
    const MAX_VISION_CALLS = Number(env.MAX_VISION_CALLS_PER_REQUEST || 3);
    let visionCalls = 0;
    const merged = {
      titleHint: null,
      categoryHint: null,
      tags: [],
      productName: '',
      brand: '',
      category: '',
      conditionGuess: '',
      quantity: '',
      confidence: 0,
      summary: '',
    };

    for (const file of files) {
      const { path, arrayBuffer, mimetype } = await uploadPhotoToStorage(env, tenantId, file);
      imageUrls.push(path);

      const hint = inferFromFilename(file.name || '');
      if (hint.titleHint && !merged.titleHint) merged.titleHint = hint.titleHint;
      if (hint.categoryHint && !merged.categoryHint) merged.categoryHint = hint.categoryHint;
      merged.tags = Array.from(new Set([...merged.tags, ...(hint.tags || [])]));

      if ((!merged.productName || !merged.brand) && env.OPENAI_API_KEY && visionCalls < MAX_VISION_CALLS) {
        visionCalls += 1;
        try {
          const ai = await analyzeProductImageFromBytes({
            arrayBuffer,
            mimetype,
            apiKey: env.OPENAI_API_KEY,
            model: env.OPENAI_VISION_MODEL,
          });
          if (ai?.productName && !merged.productName) merged.productName = ai.productName;
          if (ai?.brand && !merged.brand) merged.brand = ai.brand;
          if (ai?.category && !merged.category) merged.category = ai.category;
          if (ai?.conditionGuess && !merged.conditionGuess) merged.conditionGuess = ai.conditionGuess;
          if (ai?.quantity && !merged.quantity) merged.quantity = ai.quantity;
          if (ai?.confidence && !merged.confidence) merged.confidence = ai.confidence;
          if (ai?.summary && !merged.summary) merged.summary = ai.summary;
        } catch (err) {
          console.error('[analyze] vision error', err.message);
        }
      }
    }

    const titleHint = field('titleHint') || merged.titleHint || '';
    const parts = titleHint.split(/\s+/).filter(Boolean);
    const inferredBrand = merged.brand || parts[0] || '';
    const inferredModel = merged.productName || parts.slice(1).join(' ') || '';

    let latestAnalysis = null;
    try {
      const raw = field('analysisResult');
      latestAnalysis = raw ? JSON.parse(raw) : null;
    } catch {
      latestAnalysis = null;
    }

    const input = {
      brand: field('brand') || latestAnalysis?.brand || inferredBrand,
      model: field('model') || latestAnalysis?.productName || inferredModel,
      condition: field('condition') || latestAnalysis?.conditionGuess || merged.conditionGuess || 'Used',
      size: field('size'),
      categoryHint:
        field('categoryHint') || latestAnalysis?.category || merged.category || merged.categoryHint || '',
      suggestedPrice: parseFloat(field('suggestedPrice')) || undefined,
      costOfGoods: parseFloat(field('costOfGoods')) || 0,
      weightLb: parseFloat(field('weightLb')) || 1,
      description: field('description'),
      tags: merged.tags,
      imageUrls,
    };

    const shouldGenerate = field('generate') === 'true' || field('generate') === '1';

    let outputs = [];
    const pricing = getPricingRecommendation(input);
    const analysis =
      latestAnalysis || buildAnalysis({ merged, input, pricing, uploadedCount: files.length });
    if (shouldGenerate && (input.brand || input.model || titleHint)) {
      outputs = generateForAll(input);
    }

    const sessionId = field('sessionId', 'anon');
    let saved = null;
    if (shouldGenerate && outputs.length) {
      saved = await saveListing(env, tenantId, { sessionId, input, outputs, imageUrls });
    }

    return jsonResponse({
      ok: true,
      hints: merged,
      analysis,
      input,
      pricing,
      outputs,
      savedId: saved?.id || null,
      imageUrls,
    });
  } catch (err) {
    console.error('[api/analyze]', err.message);
    return jsonResponse({ ok: false, error: err.message || 'Analyze failed' }, 500);
  }
}
