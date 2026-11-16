import React from "react";

import {
  Composition,
  type CalculateMetadataFunction
} from "remotion";

import {
  VideoComposition
} from "./VideoComposition";

import {
  CardShowcaseComposition
} from "./CardShowcaseComposition";

import {
  PLATFORM_PRESETS
} from "../lib/video-studio/presets";

import {
  CARD_SHOWCASE_DURATION_SECONDS,
  CARD_SHOWCASE_FPS,
  CARD_SHOWCASE_TOTAL_FRAMES,
  DEFAULT_BRAND_NAME,
  DEFAULT_CTA_LINE,
  DEFAULT_HANDLE,
  DEFAULT_SUB_BRAND
} from "../lib/video-studio/cardShowcase";

import type {
  VideoProject
} from "../lib/video-studio/types";

const defaultProject: VideoProject =
  {
    id:
      "preview",

    title:
      "Preview",

    projectType:
      "PRODUCT_COMMERCIAL",

    aspectRatio:
      "9:16",

    fps:
      30,

    scenes: [
      {
        id:
          "scene-1",

        assetUrl:
          "https://dummyimage.com/1080x1920/18181b/ffffff.png&text=BossLister+Video+Studio",

        assetType:
          "image",

        durationSeconds:
          3,

        headline:
          "Preview",

        supportingText:
          "BossLister Video Studio",

        textPosition:
          "bottom",

        transition:
          "fade",

        motion:
          "zoom-in",

        cropMode:
          "cover"
      }
    ],

    audio: {
      musicVolume:
        0.35,

      narrationVolume:
        1,

      fadeInSeconds:
        0.5,

      fadeOutSeconds:
        1
    },

    cta: {
      text:
        "Shop now",

      destinationUrl:
        "",

      showQrCode:
        false
    },

    renderStatus:
      "DRAFT",

    renderProgress:
      0,

    createdAt:
      new Date(0)
        .toISOString(),

    updatedAt:
      new Date(0)
        .toISOString()
  };

const calculateMetadata:
  CalculateMetadataFunction<{
    project:
      VideoProject;
  }> =
  ({
    props
  }) => {
    const project =
      props.project ||
      defaultProject;

    const canvas =
      PLATFORM_PRESETS[
        project.aspectRatio
      ] ||
      PLATFORM_PRESETS[
        "9:16"
      ];

    const fps =
      project.fps ||
      30;

    const durationInFrames =
      Math.max(
        1,

        project.scenes.reduce(
          (
            sum,
            scene
          ) =>
            sum +
            Math.max(
              1,
              Math.round(
                scene.durationSeconds *
                  fps
              )
            ),
          0
        )
      );

    return {
      width:
        canvas.width,

      height:
        canvas.height,

      fps,

      durationInFrames
    };
  };

const defaultCardShowcaseProject: VideoProject = {
  id: "card-showcase-preview",
  title: "Card Showcase Preview",
  projectType: "CARD_SHOWCASE",
  aspectRatio: "9:16",
  fps: CARD_SHOWCASE_FPS,
  scenes: [
    {
      id: "card-showcase-scene-1",
      assetUrl:
        "https://dummyimage.com/900x1200/0b1224/e6c364.png&text=Vault+Card",
      assetType: "image",
      durationSeconds: CARD_SHOWCASE_DURATION_SECONDS,
      headline: "Vault Card",
      supportingText: "Set · Year",
      textPosition: "bottom",
      transition: "fade",
      motion: "zoom-in",
      cropMode: "cover"
    }
  ],
  cardShowcase: {
    cardId: "preview-card",
    cardName: "Vault Card",
    setName: "Collector Set",
    year: "2026",
    cardNumber: "001",
    detailTag: "",
    photoUrl:
      "https://dummyimage.com/900x1200/0b1224/e6c364.png&text=Vault+Card",
    suggestedPrice: null,
    brandName: DEFAULT_BRAND_NAME,
    subBrand: DEFAULT_SUB_BRAND,
    ctaLine: DEFAULT_CTA_LINE,
    handle: DEFAULT_HANDLE,
    cutIns: []
  },
  audio: {
    musicVolume: 0.25,
    narrationVolume: 0,
    fadeInSeconds: 0.6,
    fadeOutSeconds: 1.0
  },
  cta: {
    text: DEFAULT_CTA_LINE,
    destinationUrl: "",
    showQrCode: false
  },
  renderStatus: "DRAFT",
  renderProgress: 0,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString()
};

export const RemotionRoot:
  React.FC =
  () => {
    return (
      <>
        <Composition
          id="BossListerVideo"

          component={
            VideoComposition
          }

          durationInFrames={
            90
          }

          fps={
            30
          }

          width={
            1080
          }

          height={
            1920
          }

          defaultProps={{
            project:
              defaultProject
          }}

          calculateMetadata={
            calculateMetadata
          }
        />

        <Composition
          id="CardShowcase"

          component={
            CardShowcaseComposition
          }

          durationInFrames={
            CARD_SHOWCASE_TOTAL_FRAMES
          }

          fps={
            CARD_SHOWCASE_FPS
          }

          width={
            1080
          }

          height={
            1920
          }

          defaultProps={{
            project:
              defaultCardShowcaseProject
          }}

          calculateMetadata={
            calculateMetadata
          }
        />
      </>
    );
  };
