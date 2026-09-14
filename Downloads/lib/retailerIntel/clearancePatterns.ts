export function detectClearancePattern(input: any = {}) {
  const text = `${input.title || ""} ${input.notes || ""} ${input.tags || ""}`.toLowerCase();
  return {
    clearanceDetected: /clearance|rollback|yellow tag|red tag|markdown|closeout/.test(text),
    seasonal: /christmas|halloween|easter|valentine|seasonal/.test(text),
    damagedPackageRisk: /damaged|crushed|open box|torn|box wear/.test(text)
  };
}
