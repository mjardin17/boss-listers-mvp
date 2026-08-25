import React from "react";

import {
  Composition,
  type CalculateMetadataFunction
} from "remotion";

import {
  VideoComposition
} from "./VideoComposition";

import {
  PLATFORM_PRESETS
} from "../lib/video-studio/presets";

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

export const RemotionRoot:
  React.FC =
  () => {
    return (
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
    );
  };
