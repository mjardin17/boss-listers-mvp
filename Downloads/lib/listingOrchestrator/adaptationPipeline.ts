import type { CrossListDraft, CrossListPlatform } from "../crossListEngine/types";
import { adaptAmazonListing } from "../platformAdapters/amazonAdapter";
import { adaptEbayListing } from "../platformAdapters/ebayAdapter";
import { adaptFacebookListing } from "../platformAdapters/facebookAdapter";
import { adaptMercariListing } from "../platformAdapters/mercariAdapter";
import { adaptPinterestListing } from "../platformAdapters/pinterestAdapter";
import { adaptPoshmarkListing } from "../platformAdapters/poshmarkAdapter";
import { adaptTiktokListing } from "../platformAdapters/tiktokAdapter";
import { adaptWalmartListing } from "../platformAdapters/walmartAdapter";

const adapters: Record<CrossListPlatform, (draft: CrossListDraft) => CrossListDraft> = {
  ebay: adaptEbayListing,
  amazon: adaptAmazonListing,
  walmart: adaptWalmartListing,
  mercari: adaptMercariListing,
  poshmark: adaptPoshmarkListing,
  facebook: adaptFacebookListing,
  tiktok: adaptTiktokListing,
  pinterest: adaptPinterestListing,
  shopify: (draft) => draft
};

export function adaptListingDrafts(drafts: CrossListDraft[]) {
  return drafts.map((draft) => adapters[draft.platform](draft));
}
