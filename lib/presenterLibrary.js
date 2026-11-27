"use strict";
const STORAGE_KEY = "boss-listers-commercial-presenters-v1";
const REF_KEYS = ["front", "side", "back", "closeup"];
function createPresenter(input = {}) {
  const references = Object.fromEntries(REF_KEYS.map((key) => [key, String(input.references?.[key] || "").slice(0, 500)]));
  return { id: String(input.id || `persona-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`), name: String(input.name || "New presenter").trim().slice(0, 80), references, generation: "stub-only", createdAt: input.createdAt || new Date().toISOString() };
}
function readPresenters(storage) {
  try {
    const rows = JSON.parse(storage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(rows) ? rows.filter((row) => row && typeof row.name === "string").map(createPresenter) : [];
  } catch { return []; }
}
function writePresenters(storage, people) {
  if (!Array.isArray(people)) throw new Error("presenters must be an array");
  storage.setItem(STORAGE_KEY, JSON.stringify(people.slice(0, 100).map(createPresenter)));
}
module.exports = { STORAGE_KEY, createPresenter, readPresenters, writePresenters };
