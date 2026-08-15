export function runComplianceChecks(draft: any = {}) {
  const warnings = [
    !draft.title ? "Missing title." : "",
    draft.metadata?.requiresBrand && !/brand:/i.test((draft.bulletPoints || []).join(" ")) ? "Missing required brand signal." : "",
    (draft.title || "").length > Number(draft.metadata?.titleLimit || 80) ? "Title exceeds platform limit." : "",
    /(wow|rare|l@@k|!!!)/i.test(`${draft.title || ""} ${draft.description || ""}`) ? "Potential keyword stuffing or hype formatting." : ""
  ].filter(Boolean);
  return { valid: warnings.length === 0, warnings };
}
