const DEFAULT_STOCK_ALERT_THRESHOLD = 2;
const MAX_STOCK_ALERT_THRESHOLD = 10000;

function validateThreshold(value) {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") {
    return { ok: false, error: `Threshold must be a whole number from 0 to ${MAX_STOCK_ALERT_THRESHOLD}.` };
  }
  const threshold = Number(value);
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > MAX_STOCK_ALERT_THRESHOLD) {
    return { ok: false, error: `Threshold must be a whole number from 0 to ${MAX_STOCK_ALERT_THRESHOLD}.` };
  }
  return { ok: true, threshold };
}

function formatStockAlertEmail(alert) {
  const quantity = Math.max(0, Number(alert.quantity) || 0);
  const threshold = Math.max(0, Number(alert.threshold) || 0);
  const soldOut = quantity === 0;
  const title = String(alert.product_title || "Inventory item").slice(0, 200);
  const sku = String(alert.sku || "").slice(0, 80);
  return {
    subject: soldOut ? `Out of stock: ${title}` : `Low stock: ${title} — ${quantity} left`,
    text: [
      soldOut ? `${title} is now out of stock.` : `${title} is down to ${quantity} unit(s), at or below your alert level of ${threshold}.`,
      "",
      `Product: ${title}`,
      sku ? `SKU: ${sku}` : null,
      `Remaining quantity: ${quantity}`,
      `Alert threshold: ${threshold}`,
      "",
      "Open BossListers to review the item and update its inventory.",
    ].filter(Boolean).join("\n"),
  };
}

module.exports = {
  DEFAULT_STOCK_ALERT_THRESHOLD,
  MAX_STOCK_ALERT_THRESHOLD,
  validateThreshold,
  formatStockAlertEmail,
};
