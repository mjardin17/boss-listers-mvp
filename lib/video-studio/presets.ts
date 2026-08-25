import type {
  AspectRatio,
  VideoProjectType
} from "./types";

export const PLATFORM_PRESETS = {
  "9:16": {
    width: 1080,
    height: 1920,
    fps: 30
  },

  "1:1": {
    width: 1080,
    height: 1080,
    fps: 30
  },

  "16:9": {
    width: 1920,
    height: 1080,
    fps: 30
  }
} satisfies Record<
  AspectRatio,
  {
    width: number;
    height: number;
    fps: number;
  }
>;

export const MODE_DEFAULTS: Record<
  VideoProjectType,
  {
    aspectRatio: AspectRatio;
    targetSeconds: number;
  }
> = {
  PRODUCT_COMMERCIAL: {
    aspectRatio: "9:16",
    targetSeconds: 20
  },

  SHORT_REEL: {
    aspectRatio: "9:16",
    targetSeconds: 30
  },

  MINI_FILM: {
    aspectRatio: "9:16",
    targetSeconds: 60
  },

  SERVICE_COMMERCIAL: {
    aspectRatio: "9:16",
    targetSeconds: 30
  },

  BEFORE_AFTER: {
    aspectRatio: "9:16",
    targetSeconds: 20
  }
};

export function getCanvas(
  aspectRatio: AspectRatio
) {
  return PLATFORM_PRESETS[aspectRatio];
}
