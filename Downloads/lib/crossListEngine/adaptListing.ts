import { PLATFORM_RULES } from "./platformRules";
import type { CrossListDraft, CrossListInput, CrossListPlatform } from "./types";

const PLATFORMS = Object.keys(PLATFORM_RULES) as CrossListPlatform[];
const FILLER = /\b(new|wow|rare|htf|l@@k|must see|free shipping|fast ship)\b/gi;

function cleanText(value = "") {
  return value.replace(FILLER, "").replace(/[^\w\s&:/.-]/g, " ").replace(/\s+/g, " ").trim();
}

function truncateAtWord(value: string, limit: number) {
  if (value.length <= limit) return value;
  const sliced = value.slice(0, limit + 1);
  return (sliced.slice(0, sliced.lastIndexOf(" ")) || value.slice(0, limit)).trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => cleanText(value)).filter(Boolean)));
}

function containsPhrase(haystack: string, phrase: string) {
  if (!phrase) return false;
  return ` ${haystack.toLowerCase()} `.includes(` ${phrase.toLowerCase()} `);
}

function titleForPlatform(input: CrossListInput, platform: CrossListPlatform) {
  const rule = PLATFORM_RULES[platform];
  const base = cleanText(input.title || "");
  const brand = cleanText(input.brand || "");
  const category = cleanText(input.category || "");
  const prefix = brand && !containsPhrase(base, brand) ? brand : "";
  const head = cleanText([prefix, base].filter(Boolean).join(" "));
  const suffix = category && !containsPhrase(head, category) ? category : "";
  const title = cleanText([head, suffix].filter(Boolean).join(" "));
  return truncateAtWord(title || "Resale item", rule.titleLimit);
}

function bulletsForPlatform(input: CrossListInput) {
  return unique([
    input.brand ? `Brand: ${input.brand}` : "",
    input.condition ? `Condition: ${input.condition}` : "",
    input.upc ? `UPC: ${input.upc}` : "",
    ...(input.keyDetails || []).slice(0, 4)
  ]).slice(0, 5);
}

function hashtags(input: CrossListInput, platform: CrossListPlatform) {
  if (platform !== "pinterest" && platform !== "tiktok") return [];
  return unique([input.brand || "", input.category || "", "resale", "shopping"])
    .map((value) => `#${value.replace(/[^\w]/g, "")}`)
    .filter((value) => value.length > 1)
    .slice(0, 6);
}

function descriptionForPlatform(input: CrossListInput, platform: CrossListPlatform, bullets: string[]) {
  const rule = PLATFORM_RULES[platform];
  const base = cleanText(input.description || input.title || "Resale listing");
  if (platform === "facebook") {
    return `${base}. Please review photos and condition before purchase.`;
  }
  if (platform === "mercari") {
    return `${base}. Ships carefully packed. Review photos for exact item condition.`;
  }
  if (platform === "tiktok") {
    return truncateAtWord(`${base}. Limited availability.`, 180);
  }
  if (platform === "pinterest") {
    return `${base}. ${hashtags(input, platform).join(" ")}`.trim();
  }
  if (platform === "amazon") {
    return [base, ...bullets].join("\n");
  }
  return `${base}. ${rule.conditionLanguage}`;
}

function warnings(input: CrossListInput, platform: CrossListPlatform) {
  const rule = PLATFORM_RULES[platform];
  return [
    rule.requiresBrand && !input.brand ? `${rule.displayName} requires a verified brand before publishing.` : "",
    !input.title ? "Missing product title; draft is not publish-ready." : "",
    String(input.recommendation || "").toUpperCase().includes("SKIP")
      ? "Reseller engine recommends against sourcing; review before listing."
      : ""
  ].filter(Boolean);
}

export function buildCrossListDrafts(input: CrossListInput): CrossListDraft[] {
  return PLATFORMS.map((platform) => {
    const rule = PLATFORM_RULES[platform];
    const bulletPoints = bulletsForPlatform(input);
    const draftWarnings = warnings(input, platform);
    return {
      platform,
      displayName: rule.displayName,
      title: titleForPlatform(input, platform),
      description: descriptionForPlatform(input, platform, bulletPoints),
      bulletPoints,
      hashtags: hashtags(input, platform),
      category: cleanText(input.category || "Uncategorized"),
      metadata: {
        titleLimit: rule.titleLimit,
        conditionLanguage: rule.conditionLanguage,
        tone: rule.tone,
        requiresBrand: rule.requiresBrand,
        publishReady: draftWarnings.length === 0,
        warnings: draftWarnings
      }
    };
  });
}
