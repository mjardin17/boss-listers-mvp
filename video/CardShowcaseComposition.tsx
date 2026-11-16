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
  DEFAULT_BRAND_NAME,
  DEFAULT_CTA_LINE,
  DEFAULT_HANDLE,
  DEFAULT_SUB_BRAND,
  formatCardNumber,
  formatSetAndYear,
  formatStoredPrice
} from "../lib/video-studio/cardShowcase";
import type {
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
    handle: DEFAULT_HANDLE
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
        <linearGradient id="joGoldRing" x1="20" y1="16" x2="184" y2="184" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f5de92" />
          <stop offset="48%" stopColor="#d7ac48" />
          <stop offset="100%" stopColor="#a87c24" />
        </linearGradient>
        <radialGradient id="joCore" cx="50%" cy="38%" r="65%">
          <stop offset="0%" stopColor="#13213d" />
          <stop offset="100%" stopColor="#060b16" />
        </radialGradient>
      </defs>

      {/* Deep navy circular medallion */}
      <circle cx="100" cy="100" r="92" fill="url(#joCore)" />

      {/* Outer gold ring */}
      <circle cx="100" cy="100" r="91" stroke="url(#joGoldRing)" strokeWidth="4.5" />

      {/* Fine inner gold hairline */}
      <circle cx="100" cy="100" r="80" stroke="url(#joGoldRing)" strokeWidth="1.4" strokeOpacity="0.65" />

      {/* Four subtle compass diamonds */}
      <polygon points="100,11 104,17 100,23 96,17" fill="#ecd07a" />
      <polygon points="100,177 104,183 100,189 96,183" fill="#ecd07a" />
      <polygon points="11,100 17,96 23,100 17,104" fill="#ecd07a" />
      <polygon points="177,100 183,96 189,100 183,104" fill="#ecd07a" />

      {/* Jardin's Outpost monogram */}
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

      {/* Gold accent bar echoing BossListers icon */}
      <rect x="66" y="132" width="68" height="4.5" rx="2.25" fill="url(#joGoldRing)" />
    </svg>
  );
}

export const CardShowcaseComposition: React.FC<{
  project: VideoProject;
}> = ({ project }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const data = resolveShowcaseData(project);
  const effectiveFps = fps || CARD_SHOWCASE_FPS;
  const totalFrames = Math.max(
    1,
    durationInFrames || CARD_SHOWCASE_DURATION_SECONDS * effectiveFps
  );

  // Normalize timeline to a 12.0s reference clock (t in seconds)
  const t = frame / effectiveFps;
  const totalSeconds = totalFrames / effectiveFps;
  const closeStart = Math.max(8.5, totalSeconds - 2.2);

  // Phase (a): Open on dark navy/black screen with centered logo + brand name
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

  // Phase (b) & (e): Smooth logo glide from center -> top -> back to center for close/loop
  const moveToTop = interpolate(t, [1.65, 2.55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic)
  });

  const returnToCenter = interpolate(t, [closeStart + 0.3, closeStart + 1.35], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic)
  });

  const topFactor = moveToTop * (1 - returnToCenter);

  const logoSize = 160;
  const centerLogoY = 850;
  const topLogoY = 108;
  const currentLogoCenterY =
    centerLogoY + (topLogoY - centerLogoY) * topFactor;
  const currentLogoScale =
    (1 - 0.35 * topFactor) * openLogoScaleBoost;

  // Compact top brand label fades in cleanly AFTER the logo finishes gliding to top
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

  // Phase (c): Real card photo fades in at centre inside thin gold frame + continuous slow zoom-in
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
    [1.0, 1.08],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    }
  );

  // Subtle metallic highlight sweep across the frame on reveal
  const sheenProgress = interpolate(t, [3.2, 4.55], [-1.2, 2.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const sheenOpacity =
    t >= 3.2 && t <= 4.55
      ? interpolate(t, [3.2, 3.85, 4.55], [0, 0.11, 0], {
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
        backgroundColor: "#040812",
        backgroundImage:
          "radial-gradient(ellipse 90% 62% at 50% 42%, #0d172d 0%, #070d1b 52%, #03060d 100%)",
        fontFamily: SANS_FONT,
        overflow: "hidden"
      }}
    >
      {/* Subtle architectural dark-navy border vignette */}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          boxShadow: "inset 0 0 180px rgba(0, 0, 0, 0.72)"
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
            "radial-gradient(circle, rgba(217, 178, 82, 0.14) 0%, rgba(217, 178, 82, 0) 68%)",
          opacity: (1 - topFactor * 0.65) * openLogoOpacity,
          pointerEvents: "none"
        }}
      />

      {/* Circular gold logo (glides from center -> top -> center) */}
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
            textShadow: "0 4px 24px rgba(0,0,0,0.75)"
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
              color: "#d4b054"
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
            color: "#dec580"
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
              "0 10px 30px rgba(212, 166, 68, 0.28), inset 0 1px 1px rgba(255, 250, 224, 0.65)",
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

      {/* Real vault card photo centered inside thin gold frame with slow zoom-in */}
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
            borderRadius: 16,
            padding: 10,
            boxSizing: "border-box",
            border: "3px solid #dcb656",
            backgroundColor: "#070d1b",
            boxShadow:
              "0 0 0 1px rgba(236, 204, 118, 0.25), 0 30px 76px rgba(0, 0, 0, 0.84)"
          }}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              borderRadius: 8,
              overflow: "hidden",
              border: "1px solid rgba(232, 198, 107, 0.3)",
              backgroundColor: "#050912"
            }}
          >
            {data.photoUrl ? (
              <Img
                src={data.photoUrl}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  imageOrientation: "from-image",
                  transform: `scale(${cardPhotoScale})`,
                  transformOrigin: "center center"
                }}
              />
            ) : null}

            {/* Subtle soft bottom edge vignette for clean frame depth */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(to bottom, rgba(0,0,0,0) 76%, rgba(4,8,18,0.22) 100%)",
                pointerEvents: "none"
              }}
            />

            {/* Brief luxury metallic sheen on entrance */}
            {sheenOpacity > 0 ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: `linear-gradient(115deg, transparent ${(sheenProgress - 0.35) * 100}%, rgba(255, 240, 194, ${sheenOpacity}) ${sheenProgress * 100}%, transparent ${(sheenProgress + 0.35) * 100}%)`,
                  pointerEvents: "none"
                }}
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* Stored card facts below the gold frame */}
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
        {/* Large white card name */}
        <div
          style={{
            color: "#ffffff",
            fontSize: cardNameFontSize(data.cardName),
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: "-0.01em",
            textShadow: "0 4px 22px rgba(0, 0, 0, 0.72)"
          }}
        >
          {data.cardName}
        </div>

        {/* Set + year */}
        {setYearLine ? (
          <div
            style={{
              marginTop: 14,
              color: "#d9e1ee",
              fontSize: 34,
              fontWeight: 500,
              lineHeight: 1.2,
              letterSpacing: "0.02em"
            }}
          >
            {setYearLine}
          </div>
        ) : null}

        {/* Card number (+ optional stored variant/grade) */}
        {metaGoldLine ? (
          <div
            style={{
              marginTop: 10,
              color: "#e6c364",
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: "0.07em"
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
                border: "1.5px solid rgba(230, 195, 100, 0.56)",
                backgroundColor: "rgba(217, 178, 82, 0.14)",
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
              "linear-gradient(90deg, rgba(220,182,86,0) 0%, rgba(220,182,86,0.75) 50%, rgba(220,182,86,0) 100%)"
          }}
        />
        <div
          style={{
            fontSize: 27,
            fontWeight: 600,
            letterSpacing: "0.04em",
            color: "#c6d1e3"
          }}
        >
          <span style={{ color: "#e8c66b", fontWeight: 700 }}>
            {data.handle}
          </span>
          {data.subBrand ? (
            <span style={{ color: "#9eb0cc" }}>
              {"  ·  "}
              {data.subBrand}
            </span>
          ) : null}
        </div>
      </div>

      {/* Optional free/unlicensed music bed ONLY when explicitly provided — never voiceover */}
      {project.audio?.musicUrl ? (
        <Audio
          src={project.audio.musicUrl}
          volume={musicVolumeCurve}
        />
      ) : null}
    </AbsoluteFill>
  );
};
