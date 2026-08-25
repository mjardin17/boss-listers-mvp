import { NextResponse } from "next/server";
import { buildCrossListDrafts } from "../../../../lib/crossListEngine/adaptListing";
import type { CrossListDraft } from "../../../../lib/crossListEngine/types";
import {
  mapToEbayDraft,
  validateEbayDraftPayload
} from "../../../../lib/platformAdapters/ebayAdapter";
import {
  mapToMercariDraft,
  validateMercariDraftPayload
} from "../../../../lib/platformAdapters/mercariAdapter";
import {
  mapToPoshmarkDraft,
  validatePoshmarkDraftPayload
} from "../../../../lib/platformAdapters/poshmarkAdapter";

export const runtime = "nodejs";

type SyncRequestBody = {
  listing?: Record<string, any>;
  input?: Record<string, any>;
  price?: number;
  upc?: string;
  condition?: string;
  drafts?: CrossListDraft[];
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : null;
}

function firstText(...values: unknown[]) {
  return values.map(text).find(Boolean) || "";
}

function firstPrice(...values: unknown[]) {
  for (const value of values) {
    const parsed = numberOrNull(value);
    if (parsed != null) return parsed;
  }
  return null;
}

function missingFields({
  title,
  price,
  condition
}: {
  title: string;
  price: number | null;
  condition: string;
}) {
  return [
    title ? "" : "title",
    price == null ? "price" : "",
    condition ? "" : "condition"
  ].filter(Boolean);
}

function draftForPlatform(body: SyncRequestBody, platform: "ebay" | "mercari" | "poshmark") {
  const existing = body.drafts?.find((draft) => draft.platform === platform);
  if (existing) return existing;

  const listing = body.listing || {};
  const input = body.input || {};
  return buildCrossListDrafts({
    title: firstText(
      input.title,
      listing.confirmedProductIdentity?.title,
      listing.itemTitle,
      listing.title
    ),
    brand: firstText(input.brand, listing.brand),
    category: firstText(input.category, listing.confirmedProductIdentity?.category, listing.category),
    condition: firstText(body.condition, input.condition, listing.condition, "New"),
    upc: firstText(body.upc, input.upc, listing.upc),
    keyDetails: [
      firstText(input.brand, listing.brand) ? `Brand: ${firstText(input.brand, listing.brand)}` : "",
      firstText(body.upc, input.upc, listing.upc) ? `UPC: ${firstText(body.upc, input.upc, listing.upc)}` : ""
    ].filter(Boolean),
    description: firstText(input.description, listing.recommendationExplanation, listing.itemTitle),
    recommendation: firstText(input.recommendation, listing.recommendation)
  }).find((draft) => draft.platform === platform);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as SyncRequestBody;
  const listing = body.listing || {};
  const input = body.input || {};
  const title = firstText(input.title, listing.confirmedProductIdentity?.title, listing.itemTitle, listing.title);
  const price = firstPrice(
    body.price,
    input.price,
    listing.averageSalePrice,
    listing.estimatedResalePrice,
    listing.priceRange?.suggested
  );
  const upc = firstText(body.upc, input.upc, listing.upc);
  const condition = firstText(body.condition, input.condition, listing.condition, "New");
  const fieldsMissing = missingFields({ title, price, condition });
  const ebayDraft = draftForPlatform(body, "ebay");
  const mercariDraft = draftForPlatform(body, "mercari");
  const poshmarkDraft = draftForPlatform(body, "poshmark");

  const ebayDraftPayload =
    ebayDraft && price != null
      ? mapToEbayDraft({ draft: ebayDraft, price, upc, condition })
      : null;
  const mercariDraftPayload =
    mercariDraft && price != null
      ? mapToMercariDraft({ draft: mercariDraft, price, upc, condition })
      : null;
  const poshmarkDraftPayload =
    poshmarkDraft && price != null
      ? mapToPoshmarkDraft({ draft: poshmarkDraft, price, sku: text(input.sku || listing.sku), upc, condition })
      : null;

  const ebayValidation = ebayDraftPayload
    ? validateEbayDraftPayload(ebayDraftPayload)
    : { valid: false, errors: ["eBay draft payload was not generated."] };
  const mercariValidation = mercariDraftPayload
    ? validateMercariDraftPayload(mercariDraftPayload)
    : { valid: false, errors: ["Mercari draft payload was not generated."] };
  const poshmarkValidation = poshmarkDraftPayload
    ? validatePoshmarkDraftPayload(poshmarkDraftPayload)
    : { valid: false, errors: ["Poshmark draft payload was not generated."] };
  const validationWarnings = Array.from(
    new Set([...ebayValidation.errors, ...mercariValidation.errors, ...poshmarkValidation.errors])
  );
  const livePostingEnabled = process.env.LIVE_MARKETPLACE_POSTING_ENABLED === "true";

  return NextResponse.json({
    ok: true,
    message: "Not published. Draft payload generated only.",
    sync_mode: "SIMULATION_ONLY",
    external_posting_blocked: !livePostingEnabled,
    external_posting_supported: false,
    inventory_sync: "LOCAL_ONLY",
    ebay_status: "DRAFT_READY",
    mercari_status: "DRAFT_READY",
    poshmark_status: "DRAFT_READY",
    ebayDraftPayload,
    mercariDraftPayload,
    poshmarkDraftPayload,
    validationWarnings,
    missingFields: fieldsMissing
  });
}
