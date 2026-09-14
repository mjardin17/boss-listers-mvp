export type EbayInventoryImportRow = {
  title: string;
  sku: string;
  upc: string;
  condition: string;
  quantity: number;
  price: number;
  status: string;
  raw: Record<string, string>;
};

function clean(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function money(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : 0;
}

function quantity(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.round(parsed)) : 1;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function headerKey(value: string) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function pick(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const direct = row[key];
    if (direct) return direct;
  }
  return "";
}

export function parseEbayInventoryCsv(csv: string): EbayInventoryImportRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map(headerKey);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const raw = headers.reduce<Record<string, string>>((record, header, index) => {
      record[header] = clean(cells[index]);
      return record;
    }, {});
    const title = pick(raw, ["title", "itemtitle", "name", "productname"]);
    const sku = pick(raw, ["customlabel", "sku", "customsku"]);
    const upc = pick(raw, ["upc", "ean", "productid", "epid"]).replace(/\D/g, "");
    const condition = pick(raw, ["condition", "itemcondition"]) || "New";
    const price = money(pick(raw, ["price", "startprice", "binprice", "buyitnowprice", "currentprice"]));

    return {
      title,
      sku,
      upc,
      condition,
      quantity: quantity(pick(raw, ["quantity", "availablequantity", "qty"])),
      price,
      status: pick(raw, ["status", "listingstatus", "state"]) || "Active",
      raw
    };
  }).filter((row) => row.title || row.sku || row.upc);
}
