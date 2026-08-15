function clean(value = "") {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 8);
}

export function generateInternalSku({
  brand,
  title,
  upc
}: {
  brand?: string;
  title?: string;
  upc?: string;
}) {
  const brandPart = clean(brand || "BLO");
  const titlePart = clean(title || "ITEM");
  const upcPart = clean(upc || "").slice(-6) || "NOSCAN";
  return `${brandPart || "BLO"}-${titlePart || "ITEM"}-${upcPart}`;
}
