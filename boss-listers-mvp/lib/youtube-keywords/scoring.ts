import type { KeywordMetric } from "./types";

const MIN_VOLUME = 1000;
const MAX_VOLUME = 500000;

const modifiers = [
  "for beginners",
  "ideas",
  "tutorial",
  "strategy",
  "tools",
  "tips",
  "review",
  "setup",
  "mistakes",
  "explained",
  "checklist",
  "2026",
  "step by step",
  "best practices",
  "case study"
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hashSeed(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeVolume(searchVolume: number) {
  const logMin = Math.log10(MIN_VOLUME);
  const logMax = Math.log10(MAX_VOLUME);
  const logVolume = Math.log10(clamp(searchVolume, MIN_VOLUME, MAX_VOLUME));
  return clamp((logVolume - logMin) / (logMax - logMin), 0, 1);
}

export function calculateMagicScore(searchVolume: number, competitionIndex: number) {
  const volumeScore = normalizeVolume(searchVolume);
  const competition = clamp(competitionIndex, 0.01, 1);
  const competitionPenalty = Math.pow(1 - competition, 2.25);
  const balancedDemand = 0.72 * volumeScore + 0.28 * Math.sqrt(volumeScore);
  return clamp(Math.round(1 + 99 * balancedDemand * competitionPenalty), 1, 100);
}

export function generateKeywordMetrics(seedKeyword: string): KeywordMetric[] {
  const cleanedSeed = seedKeyword.trim().toLowerCase().replace(/\s+/g, " ");
  if (!cleanedSeed) return [];

  const random = seededRandom(hashSeed(cleanedSeed));
  const resultCount = 10 + Math.floor(random() * 6);
  const chosenModifiers = [...modifiers].sort(() => random() - 0.5).slice(0, resultCount);

  return chosenModifiers.map((modifier) => {
    const searchVolume =
      MIN_VOLUME + Math.floor(random() * (MAX_VOLUME - MIN_VOLUME + 1));
    const competitionIndex = Number((0.01 + random() * 0.99).toFixed(2));

    return {
      seedKeyword: cleanedSeed,
      relatedKeyword: `${cleanedSeed} ${modifier}`,
      searchVolume,
      competitionIndex,
      magicScore: calculateMagicScore(searchVolume, competitionIndex)
    };
  });
}
