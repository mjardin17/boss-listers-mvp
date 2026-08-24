import type {
  KdpCategory,
  KdpMetadataPackage,
  KdpPackage,
  KdpPackageInput,
  KdpSeriesPage
} from "./types";

const PROHIBITED_MARKETING_TERMS = [
  "bestseller",
  "best-selling",
  "free",
  "discount",
  "sale",
  "#1",
  "number one"
];

const CATEGORY_MAP: Array<{ match: RegExp; categories: string[] }> = [
  {
    match: /romance|love|relationship|wedding|duke|cowboy|single dad/i,
    categories: ["Fiction > Romance", "Fiction > Romance > Contemporary", "Fiction > Women"]
  },
  {
    match: /fantasy|dragon|magic|kingdom|witch|fae|sword/i,
    categories: ["Fiction > Fantasy", "Fiction > Fantasy > Epic", "Fiction > Action & Adventure"]
  },
  {
    match: /mystery|detective|murder|crime|thriller|serial killer|investigation/i,
    categories: ["Fiction > Mystery & Detective", "Fiction > Thrillers", "Fiction > Crime"]
  },
  {
    match: /science fiction|sci-fi|space|alien|starship|cyberpunk|dystopian/i,
    categories: ["Fiction > Science Fiction", "Fiction > Science Fiction > Space Opera", "Fiction > Dystopian"]
  },
  {
    match: /young adult|teen|academy|coming of age/i,
    categories: ["Young Adult Fiction", "Young Adult Fiction > Coming of Age", "Young Adult Fiction > Fantasy"]
  },
  {
    match: /memoir|business|leadership|self-help|productivity|health/i,
    categories: ["Nonfiction > Self-Help", "Nonfiction > Business & Economics", "Nonfiction > Personal Growth"]
  }
];

function cleanText(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

function stripHtml(value = "") {
  return value.replace(/<[^>]+>/g, "").trim();
}

function truncate(value: string, limit: number) {
  if (value.length <= limit) return value;
  const sliced = value.slice(0, Math.max(0, limit - 1));
  const lastSpace = sliced.lastIndexOf(" ");
  return `${sliced.slice(0, lastSpace > 100 ? lastSpace : sliced.length).trim()}.`;
}

function titleCase(value: string) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function sentences(manuscript: string) {
  return cleanText(manuscript)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 24);
}

function manuscriptSignals(input: KdpPackageInput) {
  const haystack = `${input.book.title} ${input.book.subtitle || ""} ${input.book.genre || ""} ${input.book.audience || ""} ${input.series?.genre || ""} ${input.book.manuscript}`;
  const words = cleanText(haystack)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word));
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word]) => word)
    .slice(0, 18);
}

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "because",
  "before",
  "between",
  "book",
  "chapter",
  "could",
  "every",
  "from",
  "have",
  "into",
  "more",
  "only",
  "over",
  "that",
  "their",
  "there",
  "these",
  "they",
  "this",
  "through",
  "when",
  "where",
  "with",
  "would",
  "your"
]);

function generateDescription(input: KdpPackageInput) {
  const title = input.book.title;
  const genre = input.book.genre || input.series?.genre || "commercial fiction";
  const audience = input.book.audience || input.series?.targetReader || "readers who love immersive stories";
  const sample = sentences(input.book.manuscript);
  const hook = sample[0] || `${title} launches a high-stakes journey shaped by desire, danger, and irreversible choice.`;
  const second = sample.find((sentence) => sentence !== hook) || `For ${audience}, this ${genre} story blends emotional pressure with page-turning momentum.`;
  const plain = truncate(
    [
      hook,
      "",
      second,
      "",
      `Perfect for ${audience}, ${title} delivers a complete, original reading experience with a clear premise, escalating stakes, and a satisfying narrative arc.`
    ].join("\n"),
    3800
  );
  const html = plain
    .split("\n")
    .map((line, index) => {
      if (!line.trim()) return "<br>";
      return index === 0 ? `<b>${escapeHtml(line)}</b>` : escapeHtml(line);
    })
    .join("<br>");
  return { plain, html: truncate(html, 4000) };
}

function generateAuthorBio(input: KdpPackageInput) {
  if (cleanText(input.author.bio)) return truncate(cleanText(input.author.bio || ""), 1200);
  const genre = input.book.genre || input.series?.genre || "fiction";
  const voice = input.author.brandVoice || "emotionally rich, high-momentum stories";
  return `${input.author.penName} writes ${genre} shaped by ${voice}. Their work focuses on memorable characters, clean narrative drive, and the kind of conflict that keeps readers turning pages.`;
}

function generateCategories(input: KdpPackageInput): KdpCategory[] {
  const text = `${input.book.title} ${input.book.subtitle || ""} ${input.book.genre || ""} ${input.series?.genre || ""} ${input.book.manuscript}`;
  const matched = CATEGORY_MAP.find((entry) => entry.match.test(text));
  const paths = matched?.categories || ["Fiction > Literary", "Fiction > Action & Adventure", "Fiction > Coming of Age"];
  return paths.slice(0, 3).map((path) => ({
    path,
    rationale: `Selected because the book signals ${input.book.genre || input.series?.genre || "story-driven fiction"} and should be shelved where comparable readers browse.`
  }));
}

function generateKeywords(input: KdpPackageInput) {
  const signals = manuscriptSignals(input);
  const genre = cleanText(input.book.genre || input.series?.genre || "fiction");
  const audience = cleanText(input.book.audience || input.series?.targetReader || "immersive fiction");
  const seed = [
    genre,
    audience,
    `${signals[0] || "character"} driven fiction`,
    `${signals[1] || "emotional"} stakes`,
    `${signals[2] || "original"} series`,
    `${signals[3] || "page turning"} novel`,
    `${signals[4] || "dramatic"} adventure`
  ];
  return [...new Set(seed.map((keyword) => cleanText(keyword.toLowerCase())).filter(Boolean))]
    .filter((keyword) => !PROHIBITED_MARKETING_TERMS.some((term) => keyword.includes(term)))
    .slice(0, 7);
}

function generateSeriesPage(input: KdpPackageInput): KdpSeriesPage | undefined {
  if (!input.series?.title) return undefined;
  const position = Number(input.series.seriesNumber || 1);
  return {
    title: input.series.title,
    subtitle: input.series.subtitle || `${input.book.genre || "Story"} Series`,
    description:
      input.series.description ||
      `${input.series.title} follows a connected arc of escalating choices, recurring emotional stakes, and standalone satisfaction in each volume.`,
    readingOrder: [{ title: input.book.title, position }]
  };
}

function complianceWarnings(input: KdpPackageInput, metadata: Omit<KdpMetadataPackage, "complianceWarnings">) {
  const warnings: string[] = [];
  if (metadata.descriptionHtml.length > 4000) warnings.push("Description exceeds KDP's 4000-character limit.");
  if (metadata.categories.length > 3) warnings.push("KDP category selection must be limited to 3 categories.");
  if (metadata.keywords.length > 7) warnings.push("KDP keyword boxes must be limited to 7 phrases.");
  if (!input.book.manuscript || input.book.manuscript.trim().length < 1000) {
    warnings.push("Manuscript is short; verify this is a complete book before publishing.");
  }
  const metadataText = [
    input.book.title,
    input.book.subtitle,
    metadata.descriptionPlain,
    ...metadata.keywords
  ]
    .join(" ")
    .toLowerCase();
  for (const term of PROHIBITED_MARKETING_TERMS) {
    if (metadataText.includes(term)) warnings.push(`Review metadata for prohibited or risky marketing term: ${term}.`);
  }
  if (stripHtml(metadata.descriptionHtml).length !== metadata.descriptionPlain.length) {
    warnings.push("Description includes HTML formatting; verify character count in KDP source mode.");
  }
  return [...new Set(warnings)];
}

export function buildKdpPackage(input: KdpPackageInput): KdpPackage {
  const description = generateDescription(input);
  const categories = generateCategories(input);
  const keywords = generateKeywords(input);
  const series = generateSeriesPage(input);
  const baseMetadata: Omit<KdpMetadataPackage, "complianceWarnings"> = {
    title: cleanText(input.book.title),
    subtitle: cleanText(input.book.subtitle || ""),
    authorName: cleanText(input.author.penName),
    language: input.book.language || "en",
    genre: input.book.genre || input.series?.genre || "Fiction",
    audience: input.book.audience || input.series?.targetReader || "General adult readers",
    descriptionPlain: description.plain,
    descriptionHtml: description.html,
    authorBio: generateAuthorBio(input),
    categories,
    keywords,
    series,
    trimSize: input.book.trimSize || "6x9",
    exportReadiness: {
      ebook: input.book.manuscript.trim().length > 0,
      paperback: input.book.manuscript.trim().length > 0,
      docx: input.book.manuscript.trim().length > 0
    },
    generatedAt: new Date().toISOString()
  };
  return {
    input,
    metadata: {
      ...baseMetadata,
      complianceWarnings: complianceWarnings(input, baseMetadata)
    }
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
