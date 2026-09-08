// lib/cardIdentification.js
// Trading-card identification from front+back photos via Gemini.
//
// SAFETY CONTRACT (do not weaken this):
//   - If GEMINI_API_KEY is missing, the API call fails, or the response is
//     malformed, this returns { status: UNKNOWN, error: <reason> } — never
//     a fabricated card identity.
//   - Identification confidence is computed HERE from the evidence Gemini
//     extracted (which identity-critical fields are populated, whether
//     front/back text agree), not taken from any self-reported certainty
//     Gemini puts in its own response. Models are not calibrated judges of
//     their own confidence; treating "the model said 95%" as objective
//     confidence is exactly the kind of fabrication this module exists to
//     prevent.
//   - If evidence is ambiguous (multiple plausible parallels/variants,
//     conflicting front/back text), this returns up to 3 ranked candidates
//     and status NEEDS_REVIEW instead of silently picking one.

const { emptyCardFields, IDENTIFICATION_STATUS } = require('./cardFields');

const DEFAULT_MODEL = 'gemini-2.0-flash';

// Fields whose presence most directly proves card identity. Weighted more
// heavily than purely-cosmetic fields, per the requirement that card
// number / set / manufacturer / year / back text matter more than visual
// similarity — Gemini can't be forced to weight visually, but we CAN weight
// our confidence score by whether it actually extracted these specific
// text-based facts rather than just "it looks like a baseball card."
const IDENTITY_CRITICAL_FIELDS = ['cardNumber', 'set', 'manufacturer', 'year', 'player'];
const SECONDARY_FIELDS = ['cardGame', 'sport', 'team', 'parallel', 'edition'];

const EXTRACTION_PROMPT = `You are examining photos of a trading card (sports, TCG, or collectible) to identify it EXACTLY. You will see a FRONT image and a BACK image of the same physical card.

CRITICAL RULES:
1. Only report a field value if you can actually read or clearly see it in the images. If a field is not visible, not legible, or you are not confident, set it to null. NEVER guess a plausible-sounding value.
2. The card number, set name, manufacturer, and year printed on the card (usually visible on the back, sometimes the front) are far more reliable identity signals than the general visual style of the card. Weight these over how the card "looks" compared to cards you've seen before.
3. If the card could plausibly be more than one specific parallel/variant/print (e.g. you can see it's a refractor but can't tell which specific refractor tier), do NOT pick one arbitrarily. List your top candidates instead in the "candidates" array, ranked by how well the visible evidence supports each, each with its own field set.
4. Transcribe the visible front text and back text as literally as you can into frontOcrText/backOcrText — this is used for evidence scoring, not for display, so completeness matters more than tidiness.
5. Report visible condition concerns (creases, corner wear, surface scratches, centering issues) in conditionNotes as plain description, not a grade — you are not a professional grader.

Return ONLY valid JSON matching this exact shape (use null for anything not determined, not empty strings):
{
  "candidates": [
    {
      "cardGame": string|null, "sport": string|null, "league": string|null,
      "player": string|null, "team": string|null,
      "set": string|null, "subset": string|null, "series": string|null,
      "cardNumber": string|null, "year": string|null, "manufacturer": string|null, "brand": string|null,
      "parallel": string|null, "variant": string|null,
      "foil": boolean|null, "holo": boolean|null, "refractor": boolean|null, "reverseHolo": boolean|null,
      "serialNumber": string|null, "printRun": string|null,
      "rookieCard": boolean|null, "autograph": boolean|null, "memorabilia": boolean|null, "patch": boolean|null,
      "edition": string|null, "language": string|null,
      "graded": boolean|null, "gradingCompany": string|null, "grade": string|null, "certificationNumber": string|null,
      "conditionNotes": string|null
    }
  ],
  "frontOcrText": string|null,
  "backOcrText": string|null,
  "frontBackTextConflict": boolean,
  "conflictNote": string|null
}

Return 1 candidate if you are confident there's only one plausible identity. Return 2-3 ranked candidates if genuinely uncertain between specific variants. Set frontBackTextConflict to true only if the front and back text actually contradict each other (e.g. different player names) — not merely if one side has less information than the other.`;

function bytesToBase64(bytes) {
  const CHUNK_SIZE = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

async function callGeminiVision({ frontBytes, frontMime, backBytes, backMime, apiKey, model, fetchImpl = fetch }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const parts = [{ text: EXTRACTION_PROMPT }];
  parts.push({ text: 'FRONT of card:' });
  parts.push({ inlineData: { mimeType: frontMime, data: bytesToBase64(new Uint8Array(frontBytes)) } });
  if (backBytes) {
    parts.push({ text: 'BACK of card:' });
    parts.push({ inlineData: { mimeType: backMime, data: bytesToBase64(new Uint8Array(backBytes)) } });
  }

  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini request failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) throw new Error('Gemini returned no content');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`Gemini response was not valid JSON: ${e.message}`);
  }
  return parsed;
}

// Evidence-based confidence: how many identity-critical fields are actually
// populated with specific values, weighted more than secondary fields.
// This is deliberately conservative — a card with only a player name and a
// visual guess at the set should NOT score as confident.
function scoreCandidate(candidate) {
  const critical = IDENTITY_CRITICAL_FIELDS.filter((f) => candidate[f] != null && String(candidate[f]).trim() !== '');
  const secondary = SECONDARY_FIELDS.filter((f) => candidate[f] != null && String(candidate[f]).trim() !== '');

  const criticalScore = critical.length / IDENTITY_CRITICAL_FIELDS.length; // 0..1
  const secondaryScore = secondary.length / SECONDARY_FIELDS.length; // 0..1

  // Critical fields weighted 80%, secondary 20% — matches the requirement
  // that card number/set/manufacturer/year/player matter more than
  // cosmetic/secondary attributes.
  const raw = criticalScore * 0.8 + secondaryScore * 0.2;
  return Math.round(raw * 100);
}

function statusForScore(score, hasConflict, candidateCount) {
  if (score === 0) return IDENTIFICATION_STATUS.UNKNOWN;
  if (hasConflict || candidateCount > 1) return IDENTIFICATION_STATUS.NEEDS_REVIEW;
  if (score >= 95) return IDENTIFICATION_STATUS.CONFIRMED;
  if (score >= 80) return IDENTIFICATION_STATUS.LIKELY;
  return IDENTIFICATION_STATUS.NEEDS_REVIEW;
}

function normalizeCandidate(raw) {
  const base = emptyCardFields();
  const merged = { ...base };
  for (const key of Object.keys(base)) {
    if (key === 'frontOcrText' || key === 'backOcrText') continue; // set at top level
    if (raw && raw[key] !== undefined && raw[key] !== '') merged[key] = raw[key];
  }
  return merged;
}

/**
 * Identifies a card from front (+ optional back) photo bytes.
 * Returns:
 *   { status, confidenceScore, fields, candidates, evidence, error? }
 * `fields` is the top-ranked candidate's fields, or emptyCardFields() if
 * status is UNKNOWN. `candidates` has 2-3 entries only when genuinely
 * ambiguous (status NEEDS_REVIEW) — callers must require user confirmation
 * before treating any candidate as final in that case.
 */
async function identifyCard({ frontBytes, frontMime, backBytes, backMime, apiKey, model = DEFAULT_MODEL, fetchImpl }) {
  if (!apiKey) {
    return {
      status: IDENTIFICATION_STATUS.UNKNOWN,
      confidenceScore: 0,
      fields: emptyCardFields(),
      candidates: [],
      evidence: null,
      error: 'GEMINI_API_KEY not configured — cannot identify card without it.',
    };
  }
  if (!frontBytes) {
    return {
      status: IDENTIFICATION_STATUS.UNKNOWN,
      confidenceScore: 0,
      fields: emptyCardFields(),
      candidates: [],
      evidence: null,
      error: 'No front image provided.',
    };
  }

  let raw;
  try {
    raw = await callGeminiVision({ frontBytes, frontMime, backBytes, backMime, apiKey, model, fetchImpl });
  } catch (err) {
    return {
      status: IDENTIFICATION_STATUS.UNKNOWN,
      confidenceScore: 0,
      fields: emptyCardFields(),
      candidates: [],
      evidence: null,
      error: `Identification failed: ${err.message}`,
    };
  }

  const rawCandidates = Array.isArray(raw.candidates) ? raw.candidates.slice(0, 3) : [];
  if (!rawCandidates.length) {
    return {
      status: IDENTIFICATION_STATUS.UNKNOWN,
      confidenceScore: 0,
      fields: emptyCardFields(),
      candidates: [],
      evidence: { frontOcrText: raw.frontOcrText || null, backOcrText: raw.backOcrText || null },
      error: 'No identification evidence found in the images.',
    };
  }

  const scored = rawCandidates
    .map((c) => normalizeCandidate(c))
    .map((fields) => ({ fields, score: scoreCandidate(fields) }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  const hasConflict = Boolean(raw.frontBackTextConflict);
  const status = statusForScore(top.score, hasConflict, scored.length);

  return {
    status,
    confidenceScore: top.score,
    fields: { ...top.fields, frontOcrText: raw.frontOcrText || null, backOcrText: raw.backOcrText || null },
    candidates:
      status === IDENTIFICATION_STATUS.NEEDS_REVIEW
        ? scored.map((s) => ({ ...s.fields, confidenceScore: s.score }))
        : [],
    evidence: {
      frontOcrText: raw.frontOcrText || null,
      backOcrText: raw.backOcrText || null,
      frontBackTextConflict: hasConflict,
      conflictNote: raw.conflictNote || null,
      criticalFieldsFound: IDENTITY_CRITICAL_FIELDS.filter(
        (f) => top.fields[f] != null && String(top.fields[f]).trim() !== ''
      ),
    },
  };
}

module.exports = { identifyCard, scoreCandidate, statusForScore, IDENTITY_CRITICAL_FIELDS, SECONDARY_FIELDS };
