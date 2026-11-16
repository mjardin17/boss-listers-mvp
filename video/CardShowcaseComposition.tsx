import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  interpolate,
  useCurrentFrame,
  useVideoConfig
} from "remotion";

import {
  CARD_SHOWCASE_DURATION_SECONDS,
  CARD_SHOWCASE_FPS,
  CARD_STAGE_BACKDROP_PRESETS,
  DEFAULT_BRAND_NAME,
  DEFAULT_CTA_LINE,
  DEFAULT_HANDLE,
  DEFAULT_SUB_BRAND,
  VIDEO_BG_PRESETS,
  formatCardNumber,
  formatSetAndYear,
  formatStoredPrice,
  resolveShowcaseBackground,
  resolveShowcaseStage
} from "../lib/video-studio/cardShowcase";
import type {
  CardShowcaseCutIn,
  CardShowcaseData,
  VideoProject
} from "../lib/video-studio/types";

const SERIF_FONT = "'Georgia', 'DejaVu Serif', 'Noto Serif', serif";
const SANS_FONT =
  "'Inter', 'Segoe UI', 'DejaVu Sans', system-ui, -apple-system, sans-serif";

function resolveShowcaseData(project: VideoProject): CardShowcaseData {
  if (project.cardShowcase) {
    return project.cardShowcase;
  }
  const firstScene = project.scenes[0];
  return {
    cardId: project.sourceInventoryId || project.id,
    cardName: firstScene?.headline || project.title,
    setName: firstScene?.supportingText || "",
    year: "",
    cardNumber: "",
    detailTag: "",
    photoUrl: firstScene?.assetUrl || "",
    suggestedPrice: null,
    brandName: DEFAULT_BRAND_NAME,
    subBrand: DEFAULT_SUB_BRAND,
    ctaLine: project.cta?.text || DEFAULT_CTA_LINE,
    handle: DEFAULT_HANDLE,
    cutIns: []
  };
}

function cardNameFontSize(name: string): number {
  const len = name.trim().length;
  if (len <= 14) return 72;
  if (len <= 22) return 58;
  if (len <= 32) return 48;
  return 40;
}

function BrandCrestLogo({
  size,
  logoUrl
}: {
  size: number;
  logoUrl?: string;
}) {
  if (logoUrl) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: "3px solid #e0be62",
          overflow: "hidden",
          backgroundColor: "#070d1b",
          boxShadow:
            "0 0 0 1px rgba(232,198,107,0.28), 0 14px 40px rgba(0,0,0,0.68)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <Img
          src={logoUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover"
          }}
        />
      </div>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        display: "block",
        filter: "drop-shadow(0 14px 36px rgba(0, 0, 0, 0.72))"
      }}
    >
      <defs>
        <linearGradient
          id="joGoldRing"
          x1="20"
          y1="16"
          x2="184"
          y2="184"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#f5de92" />
          <stop offset="48%" stopColor="#d7ac48" />
          <stop offset="100%" stopColor="#a87c24" />
        </linearGradient>
        <radialGradient id="joCore" cx="50%" cy="38%" r="65%">
          <stop offset="0%" stopColor="#13213d" />
          <stop offset="100%" stopColor="#060b16" />
        </radialGradient>
      </defs>

      <circle cx="100" cy="100" r="92" fill="url(#joCore)" />
      <circle
        cx="100"
        cy="100"
        r="91"
        stroke="url(#joGoldRing)"
        strokeWidth="4.5"
      />
      <circle
        cx="100"
        cy="100"
        r="80"
        stroke="url(#joGoldRing)"
        strokeWidth="1.4"
        strokeOpacity="0.65"
      />

      <polygon points="100,11 104,17 100,23 96,17" fill="#ecd07a" />
      <polygon points="100,177 104,183 100,189 96,183" fill="#ecd07a" />
      <polygon points="11,100 17,96 23,100 17,104" fill="#ecd07a" />
      <polygon points="177,100 183,96 189,100 183,104" fill="#ecd07a" />

      <text
        x="100"
        y="112"
        textAnchor="middle"
        fill="url(#joGoldRing)"
        fontFamily={SERIF_FONT}
        fontWeight="700"
        fontSize="68"
        letterSpacing="3"
      >
        JO
      </text>

      <rect
        x="66"
        y="132"
        width="68"
        height="4.5"
        rx="2.25"
        fill="url(#joGoldRing)"
      />
    </svg>
  );
}

function CutInBadge({ label }: { label: string }) {
  if (!label) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 18,
        bottom: 18,
        padding: "7px 18px",
        borderRadius: 999,
        backgroundColor: "rgba(5, 9, 18, 0.84)",
        border: "1.5px solid rgba(232, 198, 107, 0.72)",
        color: "#f5de92",
        fontSize: 18,
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        boxShadow: "0 6px 20px rgba(0, 0, 0, 0.65)",
        zIndex: 8
      }}
    >
      {label}
    </div>
  );
}

function computeCutInMotion(cutIn: CardShowcaseCutIn, t: number) {
  const start = cutIn.startSec;
  const end = cutIn.startSec + cutIn.durationSec;
  if (t < start - 0.01 || t > end + 0.01) {
    return { active: false, opacity: 0, translateX: 0, translateY: 0, scale: 1, progress: 0 };
  }

  const dur = Math.max(0.4, cutIn.durationSec);
  const transDur =
    cutIn.transition === "cut"
      ? Math.min(0.06, dur * 0.12)
      : Math.min(0.32, dur * 0.24);

  const inP = interpolate(t, [start, start + transDur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic)
  });

  const outP = interpolate(t, [end - transDur, end], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic)
  });

  const opacity = Math.min(inP, outP);
  const progress = interpolate(t, [start, end], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  let translateX = 0;
  let translateY = 0;
  let scale = 1;

  if (cutIn.transition === "slide-left") {
    const enterX = interpolate(inP, [0, 1], [110, 0]);
    const exitX = interpolate(outP, [1, 0], [0, -90]);
    translateX = enterX + exitX;
  } else if (cutIn.transition === "slide-up") {
    const enterY = interpolate(inP, [0, 1], [90, 0]);
    const exitY = interpolate(outP, [1, 0], [0, -50]);
    translateY = enterY + exitY;
  } else if (cutIn.transition === "zoom") {
    scale = interpolate(inP, [0, 1], [0.84, 1]);
  }

  return { active: opacity > 0.004, opacity, translateX, translateY, scale, progress };
}

function pipAnchorStyle(position: CardShowcaseCutIn["position"]): React.CSSProperties {
  const pad = 22;
  switch (position) {
    case "top-left":
      return { top: pad, left: pad };
    case "top-right":
      return { top: pad, right: pad };
    case "bottom-left":
      return { bottom: pad, left: pad };
    case "bottom-right":
    default:
      return { bottom: pad, right: pad };
  }
}

export const CardShowcaseComposition: React.FC<{
  project: VideoProject;
}> = ({ project }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const data = resolveShowcaseData(project);
  const bg = resolveShowcaseBackground(data.background);
  const stage = resolveShowcaseStage(data.cardStage);
  const cutIns = Array.isArray(data.cutIns) ? data.cutIns : [];

  const effectiveFps = fps || CARD_SHOWCASE_FPS;
  const totalFrames = Math.max(
    1,
    durationInFrames || CARD_SHOWCASE_DURATION_SECONDS * effectiveFps
  );

  const t = frame / effectiveFps;
  const totalSeconds = totalFrames / effectiveFps;
  const closeStart = Math.max(8.5, totalSeconds - 2.2);

  // Phase (a): Open on dark screen with centered circular gold logo + brand name
  const openLogoOpacity = interpolate(t, [0, 0.55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic)
  });

  const openLogoScaleBoost = interpolate(t, [0, 0.6], [0.91, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic)
  });

  const openBrandIn = interpolate(t, [0.22, 0.72], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic)
  });

  const openBrandOut = interpolate(t, [1.72, 2.22], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic)
  });

  const openBrandOpacity = Math.min(openBrandIn, openBrandOut);
  const openBrandYOffset = interpolate(t, [0.22, 0.72], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic)
  });

  // Phase (b) & (e): Logo glides center -> top -> center for clean looping
  const moveToTop = interpolate(t, [1.65, 2.55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic)
  });

  const returnToCenter = interpolate(
    t,
    [closeStart + 0.3, closeStart + 1.35],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.cubic)
    }
  );

  const topFactor = moveToTop * (1 - returnToCenter);

  const logoSize = 160;
  const centerLogoY = 850;
  const topLogoY = 108;
  const currentLogoCenterY = centerLogoY + (topLogoY - centerLogoY) * topFactor;
  const currentLogoScale = (1 - 0.35 * topFactor) * openLogoScaleBoost;

  const topBrandIn = interpolate(t, [2.52, 2.95], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic)
  });
  const posterFadeOut = interpolate(t, [closeStart, closeStart + 0.85], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic)
  });
  const topBrandOpacity = Math.min(topBrandIn, posterFadeOut);

  // Gold CTA pill fades in below top logo
  const pillIn = interpolate(t, [2.45, 3.05], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic)
  });
  const pillOpacity = Math.min(pillIn, posterFadeOut);
  const pillTranslateY = interpolate(t, [2.45, 3.05], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic)
  });

  // Phase (c): Card stage fades in at center with continuous slow zoom-in
  const cardIn = interpolate(t, [2.72, 3.65], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic)
  });
  const cardOpacity = Math.min(cardIn, posterFadeOut);
  const cardTranslateY = interpolate(t, [2.72, 3.65], [22, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic)
  });

  const cardPhotoScale = interpolate(
    t,
    [2.72, closeStart + 0.85],
    [1.0, stage.backgroundRemoved ? 1.045 : 1.075],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    }
  );

  // Subtle metallic sheen sweep on reveal
  const sheenProgress = interpolate(t, [3.2, 4.55], [-1.2, 2.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const sheenOpacity =
    t >= 3.2 && t <= 4.55
      ? interpolate(t, [3.2, 3.85, 4.55], [0, 0.12, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        })
      : 0;

  // Phase (d): Card details & bottom handle fade in cleanly, then hold
  const detailsIn = interpolate(t, [3.3, 4.15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic)
  });
  const detailsOpacity = Math.min(detailsIn, posterFadeOut);
  const detailsTranslateY = interpolate(t, [3.3, 4.15], [18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic)
  });

  const handleIn = interpolate(t, [3.55, 4.35], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic)
  });
  const handleOpacity = Math.min(handleIn, posterFadeOut);

  // Resolve full video background (preset gradient, preset image, or custom image/color)
  const bgPresetMeta = VIDEO_BG_PRESETS[bg.preset] || VIDEO_BG_PRESETS["navy-gold"];
  const resolvedBgImage = bg.imageUrl || bgPresetMeta.publicPath || undefined;
  const effectiveBgDim =
    typeof bg.dim === "number"
      ? bg.dim
      : resolvedBgImage
        ? bgPresetMeta.defaultDim || 0.34
        : 0;

  // Darken background slightly during logo-only open & close so logo pops cleanly and loops smoothly
  const openCloseScrimBoost = (1 - topFactor) * (resolvedBgImage ? 0.28 : 0);
  const bgMotionScale =
    bg.motion === "subtle"
      ? interpolate(t, [0, totalSeconds], [1.0, 1.06], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        })
      : 1.0;

  const customBgStyle: React.CSSProperties = {};
  if (bg.color) {
    const secondary = bg.secondaryColor || "#03060d";
    customBgStyle.backgroundColor = bg.color;
    customBgStyle.backgroundImage = `radial-gradient(ellipse 88% 62% at 50% 42%, ${bg.color} 0%, ${secondary} 100%)`;
  } else {
    customBgStyle.backgroundColor = bgPresetMeta.backgroundColor;
    if (bgPresetMeta.gradient) {
      customBgStyle.backgroundImage = bgPresetMeta.gradient;
    }
  }

  // Resolve behind-card stage backdrop (inside the showcase frame behind the cutout card)
  const stageBackdropMeta =
    CARD_STAGE_BACKDROP_PRESETS[stage.backdropPreset] ||
    CARD_STAGE_BACKDROP_PRESETS.transparent;
  const isFloatingFrame = stage.frameStyle === "floating";
  const isMinimalFrame = stage.frameStyle === "minimal";
  const isCutoutCard = stage.backgroundRemoved;

  const innerStageBgStyle: React.CSSProperties = {};
  if (stage.backdropPreset === "custom" && stage.backdropColor) {
    innerStageBgStyle.backgroundColor = stage.backdropColor;
  } else if (stage.backdropPreset === "transparent") {
    innerStageBgStyle.backgroundColor = isFloatingFrame
      ? "transparent"
      : "rgba(5, 9, 18, 0.30)";
  } else {
    innerStageBgStyle.backgroundColor = stageBackdropMeta.backgroundColor;
    if (stageBackdropMeta.gradient) {
      innerStageBgStyle.backgroundImage = stageBackdropMeta.gradient;
    }
  }

  // Compute active cut-in overlays / split transitions
  const cutInStates = cutIns.map((cutIn) => ({
    cutIn,
    motion: computeCutInMotion(cutIn, t)
  }));

  const activeFullCutIns = cutInStates.filter(
    (entry) =>
      entry.motion.active &&
      (entry.cutIn.layout === "full" || entry.cutIn.layout === "closeup")
  );
  const activeSplitCutIn = cutInStates.find(
    (entry) => entry.motion.active && entry.cutIn.layout === "split"
  );
  const activePipCutIns = cutInStates.filter(
    (entry) => entry.motion.active && entry.cutIn.layout === "pip"
  );

  // If a full-stage cut-in is active, smoothly dim/yield the hero card beneath it
  const maxFullCutInOpacity = activeFullCutIns.reduce(
    (acc, entry) => Math.max(acc, entry.motion.opacity),
    0
  );
  const splitBlend = activeSplitCutIn ? activeSplitCutIn.motion.opacity : 0;

  const setYearLine = formatSetAndYear(data.setName, data.year);
  const numberLine = formatCardNumber(data.cardNumber);
  const metaGoldLine = [numberLine, data.detailTag].filter(Boolean).join("  ·  ");
  // Strictly empty unless a positive price was already stored in the vault
  const formattedPrice = formatStoredPrice(data.suggestedPrice);

  const musicVolumeCurve = (currentFrame: number) => {
    const base = project.audio?.musicVolume ?? 0.25;
    const fadeInFrames = Math.max(
      1,
      Math.round((project.audio?.fadeInSeconds ?? 0.6) * effectiveFps)
    );
    const fadeOutFrames = Math.max(
      1,
      Math.round((project.audio?.fadeOutSeconds ?? 1.0) * effectiveFps)
    );
    const inGain = interpolate(currentFrame, [0, fadeInFrames], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    });
    const outGain = interpolate(
      currentFrame,
      [Math.max(0, totalFrames - fadeOutFrames), totalFrames],
      [1, 0],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp"
      }
    );
    return Math.max(0, Math.min(base, base * Math.min(inGain, outGain)));
  };

  return (
    <AbsoluteFill
      style={{
        ...customBgStyle,
        fontFamily: SANS_FONT,
        overflow: "hidden"
      }}
    >
      {/* Replaced Full-Canvas Studio Background Image (when preset or custom image is active) */}
      {resolvedBgImage ? (
        <AbsoluteFill style={{ overflow: "hidden" }}>
          <Img
            src={resolvedBgImage}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: `scale(${bgMotionScale})`,
              transformOrigin: "center center"
            }}
          />
          {/* Controlled dark scrim so logo, gold accents, and card typography always read cleanly */}
          <AbsoluteFill
            style={{
              backgroundColor: `rgba(4, 7, 15, ${Math.min(0.88, effectiveBgDim + openCloseScrimBoost)})`
            }}
          />
          {/* Top & bottom readability gradient bands */}
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(to bottom, rgba(3,6,13,0.52) 0%, rgba(3,6,13,0.06) 24%, rgba(3,6,13,0.08) 68%, rgba(3,6,13,0.72) 100%)"
            }}
          />
        </AbsoluteFill>
      ) : null}

      {/* Architectural dark vignette */}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          boxShadow: "inset 0 0 180px rgba(0, 0, 0, 0.70)"
        }}
      />

      {/* Quiet gold ambient halo behind centered logo on open & close */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: currentLogoCenterY,
          width: 420,
          height: 420,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(217, 178, 82, 0.16) 0%, rgba(217, 178, 82, 0) 68%)",
          opacity: (1 - topFactor * 0.65) * openLogoOpacity,
          pointerEvents: "none"
        }}
      />

      {/* Circular gold logo (glides center -> top -> center) */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: currentLogoCenterY,
          transform: `translate(-50%, -50%) scale(${currentLogoScale})`,
          opacity: openLogoOpacity,
          zIndex: 20
        }}
      >
        <BrandCrestLogo size={logoSize} logoUrl={data.logoUrl} />
      </div>

      {/* Opening centered brand name beneath logo */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: centerLogoY + 114,
          textAlign: "center",
          opacity: openBrandOpacity,
          transform: `translateY(${openBrandYOffset}px)`,
          pointerEvents: "none",
          zIndex: 15
        }}
      >
        <div
          style={{
            fontFamily: SERIF_FONT,
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#f7f2e4",
            textShadow: "0 4px 24px rgba(0,0,0,0.85)"
          }}
        >
          {data.brandName}
        </div>
        {data.subBrand ? (
          <div
            style={{
              marginTop: 14,
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: "0.38em",
              textTransform: "uppercase",
              color: "#d4b054",
              textShadow: "0 2px 14px rgba(0,0,0,0.8)"
            }}
          >
            {data.subBrand}
          </div>
        ) : null}
      </div>

      {/* Compact brand name beneath top logo during showcase */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 178,
          textAlign: "center",
          opacity: topBrandOpacity,
          pointerEvents: "none",
          zIndex: 15
        }}
      >
        <span
          style={{
            fontFamily: SERIF_FONT,
            fontSize: 21,
            fontWeight: 700,
            letterSpacing: "0.26em",
            textTransform: "uppercase",
            color: "#ecd186",
            textShadow: "0 2px 12px rgba(0,0,0,0.85)"
          }}
        >
          {data.brandName}
        </span>
      </div>

      {/* Gold pill CTA beneath top logo */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 230,
          display: "flex",
          justifyContent: "center",
          opacity: pillOpacity,
          transform: `translateY(${pillTranslateY}px)`,
          zIndex: 18
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "14px 40px",
            borderRadius: 999,
            background:
              "linear-gradient(135deg, #f3d884 0%, #d8ac46 52%, #b78527 100%)",
            boxShadow:
              "0 10px 30px rgba(212, 166, 68, 0.30), inset 0 1px 1px rgba(255, 250, 224, 0.65)",
            color: "#060b16",
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            lineHeight: 1
          }}
        >
          {data.ctaLine}
        </div>
      </div>

      {/* Showcase Card Stage (Cutout Card + Replaced Stage Backdrop + Cut-In Pictures) */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 332,
          width: 736,
          height: 980,
          transform: `translateX(-50%) translateY(${cardTranslateY}px)`,
          opacity: cardOpacity,
          zIndex: 12
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: isFloatingFrame ? 24 : 16,
            padding: isFloatingFrame ? 0 : isMinimalFrame ? 4 : 10,
            boxSizing: "border-box",
            border: isFloatingFrame
              ? "none"
              : isMinimalFrame
                ? "1.5px solid rgba(220, 182, 86, 0.8)"
                : "3px solid #dcb656",
            backgroundColor: isFloatingFrame
              ? "transparent"
              : stage.backdropPreset === "transparent"
                ? "rgba(7, 13, 27, 0.42)"
                : "#070d1b",
            boxShadow: isFloatingFrame
              ? "none"
              : "0 0 0 1px rgba(236, 204, 118, 0.25), 0 30px 76px rgba(0, 0, 0, 0.84)"
          }}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              borderRadius: isFloatingFrame ? 20 : 8,
              overflow: "hidden",
              border: isFloatingFrame
                ? "none"
                : "1px solid rgba(232, 198, 107, 0.28)",
              ...innerStageBgStyle
            }}
          >
            {/* Optional Custom Behind-Card Replacement Backdrop Image */}
            {stage.backdropImageUrl ? (
              <Img
                src={stage.backdropImageUrl}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  pointerEvents: "none"
                }}
              />
            ) : null}

            {/* Hero Card Layer (shrinks cleanly to left half during split cut-in) */}
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                width: `${100 - 50 * splitBlend}%`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: isCutoutCard ? (isFloatingFrame ? 14 : 30) : 0,
                boxSizing: "border-box",
                opacity: Math.max(0, 1 - maxFullCutInOpacity)
              }}
            >
              {data.photoUrl ? (
                <Img
                  src={data.photoUrl}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: isCutoutCard ? "contain" : "cover",
                    imageOrientation: "from-image",
                    transform: `translate(${stage.offsetX}%, ${stage.offsetY}%) scale(${cardPhotoScale * stage.zoom})`,
                    transformOrigin: "center center",
                    filter: isCutoutCard
                      ? "drop-shadow(0 28px 46px rgba(0, 0, 0, 0.86)) drop-shadow(0 6px 16px rgba(0, 0, 0, 0.52))"
                      : undefined
                  }}
                />
              ) : null}
            </div>

            {/* Split-View Cut-In Layer (right half beside hero card) */}
            {activeSplitCutIn ? (
              <>
                <div
                  style={{
                    position: "absolute",
                    top: 24,
                    bottom: 24,
                    left: "50%",
                    width: 2,
                    transform: "translateX(-50%)",
                    background:
                      "linear-gradient(180deg, rgba(220,182,86,0) 0%, rgba(220,182,86,0.9) 50%, rgba(220,182,86,0) 100%)",
                    opacity: activeSplitCutIn.motion.opacity,
                    zIndex: 5
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    right: 0,
                    width: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: activeSplitCutIn.cutIn.backgroundRemoved ? 18 : 10,
                    boxSizing: "border-box",
                    opacity: activeSplitCutIn.motion.opacity,
                    transform: `translate(${activeSplitCutIn.motion.translateX}px, ${activeSplitCutIn.motion.translateY}px) scale(${activeSplitCutIn.motion.scale})`,
                    zIndex: 4
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      height: "100%",
                      borderRadius: 10,
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <Img
                      src={activeSplitCutIn.cutIn.imageUrl}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: activeSplitCutIn.cutIn.backgroundRemoved
                          ? "contain"
                          : activeSplitCutIn.cutIn.fit,
                        objectPosition: `${activeSplitCutIn.cutIn.focusX}% ${activeSplitCutIn.cutIn.focusY}%`,
                        imageOrientation: "from-image",
                        transform: `scale(${activeSplitCutIn.cutIn.zoom * (1 + 0.05 * activeSplitCutIn.motion.progress)})`,
                        transformOrigin: `${activeSplitCutIn.cutIn.focusX}% ${activeSplitCutIn.cutIn.focusY}%`,
                        filter: activeSplitCutIn.cutIn.backgroundRemoved
                          ? "drop-shadow(0 18px 32px rgba(0, 0, 0, 0.82))"
                          : undefined
                      }}
                    />
                    <CutInBadge label={activeSplitCutIn.cutIn.label} />
                  </div>
                </div>
              </>
            ) : null}

            {/* Full-Stage & Macro Close-Up Cut-In Layers */}
            {activeFullCutIns.map(({ cutIn, motion }) => {
              const isCloseup = cutIn.layout === "closeup";
              const baseZoom = isCloseup ? Math.max(1.12, cutIn.zoom) : cutIn.zoom;
              const liveZoom = baseZoom * (1 + (isCloseup ? 0.08 : 0.05) * motion.progress);
              const isCutoutOverlay = cutIn.backgroundRemoved;

              return (
                <div
                  key={cutIn.id}
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: isCutoutOverlay ? 24 : 0,
                    boxSizing: "border-box",
                    opacity: motion.opacity,
                    transform: `translate(${motion.translateX}px, ${motion.translateY}px) scale(${motion.scale})`,
                    backgroundColor: isCutoutOverlay
                      ? "transparent"
                      : "rgba(5, 9, 18, 0.96)",
                    zIndex: 6
                  }}
                >
                  <Img
                    src={cutIn.imageUrl}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: isCutoutOverlay
                        ? "contain"
                        : isCloseup
                          ? "cover"
                          : cutIn.fit,
                      objectPosition: `${cutIn.focusX}% ${cutIn.focusY}%`,
                      imageOrientation: "from-image",
                      transform: `scale(${liveZoom})`,
                      transformOrigin: `${cutIn.focusX}% ${cutIn.focusY}%`,
                      filter: isCutoutOverlay
                        ? "drop-shadow(0 28px 46px rgba(0, 0, 0, 0.86))"
                        : undefined
                    }}
                  />

                  {/* Subtle gold viewfinder corners for macro closeup cut-ins */}
                  {isCloseup ? (
                    <div
                      style={{
                        position: "absolute",
                        inset: 18,
                        borderRadius: 10,
                        border: "1.5px solid rgba(232, 198, 107, 0.45)",
                        boxShadow: "inset 0 0 40px rgba(0, 0, 0, 0.42)",
                        pointerEvents: "none"
                      }}
                    />
                  ) : null}

                  <CutInBadge label={cutIn.label} />
                </div>
              );
            })}

            {/* Picture-in-Picture (PiP) Inset Cut-In Overlays */}
            {activePipCutIns.map(({ cutIn, motion }) => {
              const anchor = pipAnchorStyle(cutIn.position);
              const isCutoutPip = cutIn.backgroundRemoved;
              return (
                <div
                  key={cutIn.id}
                  style={{
                    position: "absolute",
                    ...anchor,
                    width: 320,
                    height: 244,
                    borderRadius: 16,
                    overflow: "hidden",
                    border: "2.5px solid #e4c162",
                    backgroundColor: "rgba(6, 11, 22, 0.94)",
                    boxShadow:
                      "0 0 0 1px rgba(255,244,205,0.28), 0 18px 42px rgba(0, 0, 0, 0.88)",
                    opacity: motion.opacity,
                    transform: `translate(${motion.translateX}px, ${motion.translateY}px) scale(${motion.scale})`,
                    zIndex: 9
                  }}
                >
                  <Img
                    src={cutIn.imageUrl}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: isCutoutPip ? "contain" : cutIn.fit,
                      objectPosition: `${cutIn.focusX}% ${cutIn.focusY}%`,
                      imageOrientation: "from-image",
                      padding: isCutoutPip ? 10 : 0,
                      boxSizing: "border-box",
                      transform: `scale(${cutIn.zoom * (1 + 0.06 * motion.progress)})`,
                      transformOrigin: `${cutIn.focusX}% ${cutIn.focusY}%`
                    }}
                  />
                  {cutIn.label ? (
                    <div
                      style={{
                        position: "absolute",
                        left: 12,
                        bottom: 10,
                        maxWidth: "calc(100% - 24px)",
                        padding: "5px 14px",
                        borderRadius: 999,
                        backgroundColor: "rgba(5, 9, 18, 0.86)",
                        border: "1px solid rgba(232, 198, 107, 0.70)",
                        color: "#f5de92",
                        fontSize: 13,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {cutIn.label}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {/* Subtle bottom vignette inside non-floating frames */}
            {!isFloatingFrame ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(to bottom, rgba(0,0,0,0) 78%, rgba(4,8,18,0.22) 100%)",
                  pointerEvents: "none",
                  zIndex: 10
                }}
              />
            ) : null}

            {/* Brief luxury metallic sheen on entrance */}
            {sheenOpacity > 0 ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: `linear-gradient(115deg, transparent ${(sheenProgress - 0.35) * 100}%, rgba(255, 240, 194, ${sheenOpacity}) ${sheenProgress * 100}%, transparent ${(sheenProgress + 0.35) * 100}%)`,
                  pointerEvents: "none",
                  zIndex: 11
                }}
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* Stored card facts below the showcase frame */}
      <div
        style={{
          position: "absolute",
          left: 64,
          right: 64,
          top: 1356,
          textAlign: "center",
          opacity: detailsOpacity,
          transform: `translateY(${detailsTranslateY}px)`,
          zIndex: 14
        }}
      >
        <div
          style={{
            color: "#ffffff",
            fontSize: cardNameFontSize(data.cardName),
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: "-0.01em",
            textShadow: "0 4px 24px rgba(0, 0, 0, 0.85)"
          }}
        >
          {data.cardName}
        </div>

        {setYearLine ? (
          <div
            style={{
              marginTop: 14,
              color: "#e2e9f5",
              fontSize: 34,
              fontWeight: 500,
              lineHeight: 1.2,
              letterSpacing: "0.02em",
              textShadow: "0 2px 16px rgba(0, 0, 0, 0.8)"
            }}
          >
            {setYearLine}
          </div>
        ) : null}

        {metaGoldLine ? (
          <div
            style={{
              marginTop: 10,
              color: "#ebc96b",
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: "0.07em",
              textShadow: "0 2px 16px rgba(0, 0, 0, 0.82)"
            }}
          >
            {metaGoldLine}
          </div>
        ) : null}

        {/* Suggested price ONLY if already stored in the card vault */}
        {formattedPrice ? (
          <div style={{ marginTop: 18 }}>
            <span
              style={{
                display: "inline-block",
                padding: "9px 28px",
                borderRadius: 999,
                border: "1.5px solid rgba(230, 195, 100, 0.62)",
                backgroundColor: "rgba(10, 14, 24, 0.72)",
                color: "#f6df98",
                fontSize: 27,
                fontWeight: 700,
                letterSpacing: "0.04em"
              }}
            >
              Suggested {formattedPrice}
            </span>
          </div>
        ) : null}
      </div>

      {/* Bottom handle line */}
      <div
        style={{
          position: "absolute",
          left: 64,
          right: 64,
          bottom: 92,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity: handleOpacity,
          zIndex: 14
        }}
      >
        <div
          style={{
            width: 240,
            height: 1.5,
            marginBottom: 18,
            background:
              "linear-gradient(90deg, rgba(220,182,86,0) 0%, rgba(220,182,86,0.78) 50%, rgba(220,182,86,0) 100%)"
          }}
        />
        <div
          style={{
            fontSize: 27,
            fontWeight: 600,
            letterSpacing: "0.04em",
            color: "#d4deee",
            textShadow: "0 2px 14px rgba(0, 0, 0, 0.85)"
          }}
        >
          <span style={{ color: "#ebc96b", fontWeight: 700 }}>
            {data.handle}
          </span>
          {data.subBrand ? (
            <span style={{ color: "#b1c0d8" }}>
              {"  ·  "}
              {data.subBrand}
            </span>
          ) : null}
        </div>
      </div>

      {/* Optional free/unlicensed music bed ONLY when explicitly provided — never voiceover */}
      {project.audio?.musicUrl ? (
        <Audio src={project.audio.musicUrl} volume={musicVolumeCurve} />
      ) : null}
    </AbsoluteFill>
  );
};
