// functions/api/identify-card.js
// Front(+back) card photo -> identification -> valuation (only if the
// identification is confident enough to price). Tenant-scoped like
// analyze.js. Never auto-prices a NEEDS_REVIEW/UNKNOWN identification —
// the caller must resolve a candidate first (see pages/card-scan.js).

import { identifyCard } from '../../lib/cardIdentification.js';
import { getCardValuation } from '../../lib/cardPricing.js';
import { IDENTIFICATION_STATUS } from '../../lib/cardFields.js';
import { rest } from '../../lib/supabaseRest.js';

const MAX_UPLOAD_BYTES_DEFAULT = 8_000_000; // cards need higher-res photos than the general scanner

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function consumeRateLimit(env, tenantId) {
  const max = Number(env.RATE_LIMIT_MAX || 10);
  const windowSeconds = Math.round(Number(env.RATE_LIMIT_WINDOW_MS || 60000) / 1000);
  const [result] = await rest(env, 'POST', '/rpc/consume_rate_limit', {
    p_key: `identify-card:${tenantId}`,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  return result;
}

export async function onRequestPost({ request, env, data }) {
  const tenantId = data.tenantId;

  try {
    const limit = await consumeRateLimit(env, tenantId);
    if (!limit.allowed) {
      return jsonResponse({ ok: false, error: `Rate limit exceeded. Try again in ${limit.retry_after}s.` }, 429);
    }

    const form = await request.formData();
    const front = form.get('front');
    const back = form.get('back'); // optional but strongly recommended

    if (!(front instanceof File)) {
      return jsonResponse({ ok: false, error: 'Front image is required.' }, 400);
    }

    const maxBytes = Number(env.MAX_UPLOAD_BYTES || MAX_UPLOAD_BYTES_DEFAULT);
    if (front.size > maxBytes || (back instanceof File && back.size > maxBytes)) {
      return jsonResponse({ ok: false, error: `Photo too large — max ${Math.round(maxBytes / 1024)}KB per side.` }, 413);
    }

    const frontBytes = await front.arrayBuffer();
    const backBytes = back instanceof File ? await back.arrayBuffer() : null;

    const identification = await identifyCard({
      frontBytes,
      frontMime: front.type || 'image/jpeg',
      backBytes,
      backMime: back instanceof File ? back.type || 'image/jpeg' : null,
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_CARD_MODEL,
    });

    const canPrice =
      identification.status === IDENTIFICATION_STATUS.CONFIRMED ||
      identification.status === IDENTIFICATION_STATUS.LIKELY;

    const valuation = canPrice
      ? await getCardValuation({ fields: identification.fields, apiToken: env.PRICECHARTING_API_TOKEN })
      : {
          status: 'insufficient',
          low: null,
          market: null,
          high: null,
          confidenceScore: 0,
          provider: 'pricecharting',
          matchedProduct: null,
          fetchedAt: new Date().toISOString(),
          explanation: 'Card identity not yet confirmed — resolve the candidate match before pricing.',
        };

    return jsonResponse({
      ok: true,
      identification,
      valuation,
      requiresConfirmation: identification.status === IDENTIFICATION_STATUS.NEEDS_REVIEW,
      backPhotoProvided: Boolean(back instanceof File),
    });
  } catch (err) {
    console.error('[identify-card]', err.message);
    return jsonResponse({ ok: false, error: err.message || 'Card identification failed' }, 500);
  }
}
