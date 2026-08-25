import type { RawSalesHistoryRow, UserVerifiedSale } from "./salesHistoryTypes";
import { normalizeSalesHistoryRow } from "./salesNormalizer";

const HEADER_ALIASES: Record<string, keyof RawSalesHistoryRow> = {
  "item title": "itemTitle",
  title: "itemTitle",
  name: "itemTitle",
  "sold price": "soldPrice",
  price: "soldPrice",
  total: "soldPrice",
  "sold date": "soldDate",
  date: "soldDate",
  platform: "platform",
  marketplace: "platform",
  "shipping charged": "shippingCharged",
  shipping: "shippingCharged",
  cost: "cost",
  "cost if known": "cost",
  sku: "sku",
  upc: "upc",
  ean: "upc",
  category: "category",
  condition: "condition"
};

function parseDelimitedRows(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)|\t/).map((cell) => cell.replace(/^"|"$/g, "").trim()));
}

export function importSalesHistoryText(text: string): UserVerifiedSale[] {
  const rows = parseDelimitedRows(text);
  if (!rows.length) return [];
  const headers = rows[0].map((header) => HEADER_ALIASES[header.toLowerCase()] || null);
  const hasHeader = headers.some(Boolean);
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const fallbackHeaders: (keyof RawSalesHistoryRow)[] = [
    "itemTitle",
    "soldPrice",
    "soldDate",
    "platform",
    "shippingCharged",
    "cost",
    "sku",
    "upc",
    "category",
    "condition"
  ];

  return dataRows
    .map((cells, index) => {
      const raw: RawSalesHistoryRow = {};
      cells.forEach((cell, cellIndex) => {
        const key = (hasHeader ? headers[cellIndex] : fallbackHeaders[cellIndex]) || null;
        if (key) raw[key] = cell;
      });
      return normalizeSalesHistoryRow(raw, index);
    })
    .filter((sale): sale is UserVerifiedSale => Boolean(sale));
}
