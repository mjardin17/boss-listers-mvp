import { randomUUID } from "crypto";

import {
  MODE_DEFAULTS
} from "./presets";

import {
  getTemplate
} from "./templates";

import type {
  ListingVideoSource,
  VideoProject,
  VideoScene
} from "./types";

function compact(
  value?: string
) {
  return (value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function priceText(
  price?: number | null
) {
  return (
    typeof price === "number" &&
    Number.isFinite(price) &&
    price > 0
  )
    ? `$${price.toFixed(2)}`
    : "";
}

export function buildListingVideoDraft(
  source: ListingVideoSource,
  templateId = "fast-product-sale"
): VideoProject {
  const template =
    getTemplate(templateId);

  const mode =
    MODE_DEFAULTS[
      template.projectType
    ];

  const now =
    new Date().toISOString();

  const photos =
    source.photos
      .filter(Boolean)
      .slice(0, 10);

  const assets =
    photos.length
      ? photos
      : [
          "/video-studio/placeholder-product.png"
        ];

  const description =
    compact(source.description);

  const price =
    priceText(source.price);

  const scenes: VideoScene[] =
    assets.map(
      (assetUrl, index) => ({
        id: randomUUID(),

        assetUrl,

        assetType: "image",

        durationSeconds:
          template.defaultSceneSeconds,

        headline:
          index === 0
            ? compact(source.title)
            : index ===
                assets.length - 1
              ? price ||
                template.defaultCta
              : compact(
                  source.brand ||
                    source.category ||
                    "Take a closer look"
                ),

        supportingText:
          index === 0
            ? description.slice(
                0,
                120
              )
            : index ===
                assets.length - 1
              ? compact(
                  source.marketplace
                    ? `Available on ${source.marketplace}`
                    : ""
                )
              : "",

        textPosition:
          index === 0
            ? "bottom"
            : "center",

        transition:
          index === 0
            ? "fade"
            : "crossfade",

        motion:
          index % 2 === 0
            ? "zoom-in"
            : "pan-right",

        cropMode: "cover"
      })
    );

  return {
    id: randomUUID(),

    sourceListingId:
      source.id,

    sourceInventoryId:
      source.inventoryId,

    title:
      `${source.title} — Video`,

    projectType:
      template.projectType,

    aspectRatio:
      mode.aspectRatio,

    fps: 30,

    scenes,

    audio: {
      musicVolume: 0.35,
      narrationVolume: 1,
      fadeInSeconds: 0.5,
      fadeOutSeconds: 1
    },

    cta: {
      text:
        template.defaultCta,

      destinationUrl:
        source.listingUrl || "",

      website:
        source.listingUrl || "",

      showQrCode:
        Boolean(
          source.listingUrl
        )
    },

    renderStatus:
      "DRAFT",

    renderProgress:
      0,

    createdAt:
      now,

    updatedAt:
      now
  };
}
