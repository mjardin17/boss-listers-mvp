export function scoreTitleQuality(draft: any = {}) {
  const title = String(draft.title || "");
  const limit = Number(draft.metadata?.titleLimit || 80);
  const lengthFit = title.length > 0 && title.length <= limit;
  const tokenCount = title.split(/\s+/).filter(Boolean).length;
  return {
    titleScore: Math.max(0, Math.min(100, (lengthFit ? 45 : 10) + Math.min(35, tokenCount * 4) + (/upc|barcode/i.test(title) ? -15 : 10))),
    suggestions: [
      !lengthFit ? `Keep title under ${limit} characters.` : "",
      tokenCount < 4 ? "Add brand/model/category tokens if verified." : ""
    ].filter(Boolean)
  };
}
