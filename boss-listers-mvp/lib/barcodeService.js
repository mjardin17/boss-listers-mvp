const BARCODE_LENGTHS = new Set([6, 8, 12, 13, 14]);

export function normalizeBarcodeValue(value = "") {
  const digits = String(value || "").replace(/\D/g, "");
  return BARCODE_LENGTHS.has(digits.length) ? digits : "";
}
