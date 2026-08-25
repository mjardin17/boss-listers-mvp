import React from "react";

import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig
} from "remotion";

import type {
  VideoProject,
  VideoScene
} from "../lib/video-studio/types";

function transitionStyle(
  scene: VideoScene,
  progress: number
) {
  const edge =
    0.12;

  const fadeIn =
    interpolate(
      progress,
      [
        0,
        edge
      ],
      [
        0,
        1
      ],
      {
        extrapolateLeft:
          "clamp",

        extrapolateRight:
          "clamp"
      }
    );

  const fadeOut =
    interpolate(
      progress,
      [
        1 - edge,
        1
      ],
      [
        1,
        0
      ],
      {
        extrapolateLeft:
          "clamp",

        extrapolateRight:
          "clamp"
      }
    );

  const opacity =
    scene.transition ===
    "cut"
      ? 1
      : Math.min(
          fadeIn,
          fadeOut
        );

  const slideX =
    scene.transition ===
    "slide-left"
      ? interpolate(
          progress,
          [
            0,
            edge
          ],
          [
            120,
            0
          ],
          {
            extrapolateRight:
              "clamp"
          }
        )
      : 0;

  const slideY =
    scene.transition ===
    "slide-up"
      ? interpolate(
          progress,
          [
            0,
            edge
          ],
          [
            120,
            0
          ],
          {
            extrapolateRight:
              "clamp"
          }
        )
      : 0;

  return {
    opacity,
    slideX,
    slideY
  };
}

function Scene({
  scene
}: {
  scene:
    VideoScene;
}) {
  const frame =
    useCurrentFrame();

  const {
    fps
  } =
    useVideoConfig();

  const duration =
    Math.max(
      1,
      Math.round(
        scene.durationSeconds *
          fps
      )
    );

  const progress =
    Math.min(
      1,
      Math.max(
        0,
        frame /
          Math.max(
            1,
            duration - 1
          )
      )
    );

  const scale =
    scene.motion ===
    "zoom-in"
      ? interpolate(
          progress,
          [
            0,
            1
          ],
          [
            1,
            1.08
          ]
        )
      : scene.motion ===
          "zoom-out"
        ? interpolate(
            progress,
            [
              0,
              1
            ],
            [
              1.08,
              1
            ]
          )
        : 1;

  const translateX =
    scene.motion ===
    "pan-left"
      ? interpolate(
          progress,
          [
            0,
            1
          ],
          [
            24,
            -24
          ]
        )
      : scene.motion ===
          "pan-right"
        ? interpolate(
            progress,
            [
              0,
              1
            ],
            [
              -24,
              24
            ]
          )
        : 0;

  const alignItems =
    scene.textPosition ===
    "top"
      ? "flex-start"
      : scene.textPosition ===
          "center"
        ? "center"
        : "flex-end";

  const transition =
    transitionStyle(
      scene,
      progress
    );

  const mediaStyle:
    React.CSSProperties =
    {
      width:
        "100%",

      height:
        "100%",

      objectFit:
        scene.cropMode,

      transform:
        `translate(${translateX + transition.slideX}px, ${transition.slideY}px) scale(${scale})`
    };

  return (
    <AbsoluteFill
      style={{
        backgroundColor:
          "#09090b",

        overflow:
          "hidden",

        opacity:
          transition.opacity
      }}
    >

      {scene.assetType ===
        "image" &&
      scene.assetUrl ? (

        <Img
          src={
            scene.assetUrl
          }
          style={
            mediaStyle
          }
        />

      ) : null}

      {scene.assetType ===
        "video" &&
      scene.assetUrl ? (

        <OffthreadVideo
          src={
            scene.assetUrl
          }
          muted
          style={
            mediaStyle
          }
        />

      ) : null}

      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,.08) 30%, rgba(0,0,0,.78) 100%)"
        }}
      />

      <AbsoluteFill
        style={{
          display:
            "flex",

          justifyContent:
            "center",

          alignItems,

          padding:
            "9% 7%"
        }}
      >

        <div
          style={{
            width:
              "100%",

            textAlign:
              "center",

            color:
              "white",

            textShadow:
              "0 3px 18px rgba(0,0,0,.8)"
          }}
        >

          <div
            style={{
              fontSize:
                64,

              lineHeight:
                1.02,

              fontWeight:
                900
            }}
          >
            {
              scene.headline
            }
          </div>

          {scene.supportingText ? (

            <div
              style={{
                marginTop:
                  24,

                fontSize:
                  34,

                lineHeight:
                  1.15,

                fontWeight:
                  600
              }}
            >
              {
                scene.supportingText
              }
            </div>

          ) : null}

        </div>

      </AbsoluteFill>

    </AbsoluteFill>
  );
}

function CtaOverlay({
  project,
  fromFrame
}: {
  project:
    VideoProject;

  fromFrame:
    number;
}) {
  const {
    fps
  } =
    useVideoConfig();

  const ctaFrames =
    Math.max(
      1,
      Math.round(
        2.5 *
          fps
      )
    );

  return (
    <Sequence
      from={
        fromFrame
      }
      durationInFrames={
        ctaFrames
      }
    >

      <AbsoluteFill
        style={{
          display:
            "flex",

          justifyContent:
            "flex-end",

          alignItems:
            "center",

          padding:
            "7%",

          pointerEvents:
            "none"
        }}
      >

        <div
          style={{
            width:
              "100%",

            borderRadius:
              34,

            background:
              "rgba(0,0,0,.76)",

            padding:
              "30px 36px",

            textAlign:
              "center",

            color:
              "white"
          }}
        >

          <div
            style={{
              fontSize:
                48,

              fontWeight:
                900
            }}
          >
            {
              project.cta
                .text
            }
          </div>

          {project.cta
            .phone ? (

            <div
              style={{
                marginTop:
                  12,

                fontSize:
                  30,

                fontWeight:
                  700
              }}
            >
              {
                project.cta
                  .phone
              }
            </div>

          ) : null}

          {project.cta
            .website ||
          project.cta
            .destinationUrl ? (

            <div
              style={{
                marginTop:
                  10,

                fontSize:
                  27,

                fontWeight:
                  600
              }}
            >
              {
                project.cta
                  .website ||
                project.cta
                  .destinationUrl
              }
            </div>

          ) : null}

        </div>

      </AbsoluteFill>

    </Sequence>
  );
}

export const VideoComposition:
  React.FC<{
    project:
      VideoProject;
  }> =
  ({
    project
  }) => {
    const fps =
      project.fps ||
      30;

    const totalFrames =
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

    const ctaFrames =
      Math.min(
        totalFrames,

        Math.max(
          1,
          Math.round(
            2.5 *
              fps
          )
        )
      );

    const ctaFrom =
      Math.max(
        0,
        totalFrames -
          ctaFrames
      );

    let start =
      0;

    const audioVolume =
      (
        base: number,

        fadeInSeconds:
          number,

        fadeOutSeconds:
          number
      ) =>
      (
        frame:
          number
      ) => {
        const fadeInFrames =
          Math.max(
            1,
            Math.round(
              fadeInSeconds *
                fps
            )
          );

        const fadeOutFrames =
          Math.max(
            1,
            Math.round(
              fadeOutSeconds *
                fps
            )
          );

        const inGain =
          interpolate(
            frame,
            [
              0,
              fadeInFrames
            ],
            [
              0,
              1
            ],
            {
              extrapolateRight:
                "clamp"
            }
          );

        const outGain =
          interpolate(
            frame,
            [
              Math.max(
                0,
                totalFrames -
                  fadeOutFrames
              ),
              totalFrames
            ],
            [
              1,
              0
            ],
            {
              extrapolateLeft:
                "clamp"
            }
          );

        return Math.max(
          0,
          Math.min(
            base,
            base *
              Math.min(
                inGain,
                outGain
              )
          )
        );
      };

    return (
      <AbsoluteFill
        style={{
          backgroundColor:
            "#09090b"
        }}
      >

        {project.scenes.map(
          (
            scene
          ) => {
            const frames =
              Math.max(
                1,
                Math.round(
                  scene.durationSeconds *
                    fps
                )
              );

            const node = (
              <Sequence
                key={
                  scene.id
                }
                from={
                  start
                }
                durationInFrames={
                  frames
                }
              >
                <Scene
                  scene={
                    scene
                  }
                />
              </Sequence>
            );

            start +=
              frames;

            return node;
          }
        )}

        {project.audio
          .musicUrl ? (

          <Audio
            src={
              project.audio
                .musicUrl
            }
            volume={audioVolume(
              project.audio
                .musicVolume,

              project.audio
                .fadeInSeconds,

              project.audio
                .fadeOutSeconds
            )}
          />

        ) : null}

        {project.audio
          .narrationUrl ? (

          <Audio
            src={
              project.audio
                .narrationUrl
            }
            volume={
              project.audio
                .narrationVolume
            }
          />

        ) : null}

        <CtaOverlay
          project={
            project
          }
          fromFrame={
            ctaFrom
          }
        />

      </AbsoluteFill>
    );
  };
