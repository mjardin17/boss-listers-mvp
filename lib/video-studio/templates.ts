import type {
  VideoProjectType
} from "./types";

export type VideoTemplate = {
  id: string;
  name: string;
  projectType: VideoProjectType;
  description: string;
  defaultSceneSeconds: number;
  defaultCta: string;
};

export const VIDEO_TEMPLATES: VideoTemplate[] = [
  {
    id: "fast-product-sale",
    name: "Fast Product Sale",
    projectType: "PRODUCT_COMMERCIAL",
    description:
      "Fast hook, product benefits, price and CTA.",
    defaultSceneSeconds: 3.2,
    defaultCta: "Shop now"
  },

  {
    id: "product-showcase",
    name: "Product Showcase",
    projectType: "PRODUCT_COMMERCIAL",
    description:
      "Slower visual showcase with feature callouts.",
    defaultSceneSeconds: 4.2,
    defaultCta: "See the listing"
  },

  {
    id: "clean-marketplace-ad",
    name: "Clean Marketplace Ad",
    projectType: "SHORT_REEL",
    description:
      "Minimal social ad with clean captions.",
    defaultSceneSeconds: 3.5,
    defaultCta: "Message to buy"
  },

  {
    id: "before-after",
    name: "Before & After",
    projectType: "BEFORE_AFTER",
    description:
      "Two-state reveal with punchy transition.",
    defaultSceneSeconds: 4,
    defaultCta: "See the result"
  },

  {
    id: "local-service",
    name: "Local Service Commercial",
    projectType: "SERVICE_COMMERCIAL",
    description:
      "Service photos, benefits, phone/site CTA.",
    defaultSceneSeconds: 4,
    defaultCta: "Get an estimate"
  },

  {
    id: "mini-film",
    name: "Story / Mini Film",
    projectType: "MINI_FILM",
    description:
      "Multi-scene short-form storytelling.",
    defaultSceneSeconds: 5,
    defaultCta: "Follow for more"
  }
];

export function getTemplate(
  id: string
) {
  return (
    VIDEO_TEMPLATES.find(
      (template) => template.id === id
    ) ?? VIDEO_TEMPLATES[0]
  );
}
