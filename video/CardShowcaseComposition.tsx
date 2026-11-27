import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  useCurrentFrame,
  useVideoConfig
} from "remotion";

export interface CardShowcaseProps {
  cardName: string;
  setName: string;
  year?: string | null;
  cardNumber?: string | null;
  photoUrl: string;
  suggestedPrice?: number | null;
  brandName?: string;
  subBrand?: string;
  callToAction?: string;
  handle?: string;
  searchLine?: string;
  musicUrl?: string | null;
}

export const defaultCardShowcaseProps: CardShowcaseProps = {
  cardName: "ODDISH",
  setName: "Sword & Shield - Lost Origin",
  year: "2022",
  cardNumber: "001/196",
  photoUrl: "/uploads/1788198862494-70707600-2813-47da-9b72-4251a81957cb.jpg",
  suggestedPrice: 1.19,
  brandName: "JARDIN'S OUTPOST",
  subBrand: "BOSSLISTERS",
  callToAction: "FROM THE VAULT",
  handle: "@jardinsoutpost",
  searchLine: "Find on eBay: Jardin's Outpost",
  musicUrl: null
};

// Elegant gold circular brand logo SVG
function GoldBrandLogo({ size = 180 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 180 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        filter: "drop-shadow(0 0 20px rgba(212, 175, 55, 0.45))"
      }}
    >
      <defs>
        <linearGradient id="goldGradOuter" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff2a3" />
          <stop offset="35%" stopColor="#d4af37" />
          <stop offset="70%" stopColor="#9b711e" />
          <stop offset="100%" stopColor="#f3e5ab" />
        </linearGradient>
        <linearGradient id="goldGradInner" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#9b711e" />
          <stop offset="50%" stopColor="#d4af37" />
          <stop offset="100%" stopColor="#fff2a3" />
        </linearGradient>
        <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1a2544" />
          <stop offset="100%" stopColor="#080c18" />
        </radialGradient>
      </defs>
      {/* Outer gold ring */}
      <circle
        cx="90"
        cy="90"
        r="84"
        stroke="url(#goldGradOuter)"
        strokeWidth="6"
        fill="url(#centerGlow)"
      />
      {/* Inner thin accent ring */}
      <circle
        cx="90"
        cy="90"
        r="74"
        stroke="url(#goldGradInner)"
        strokeWidth="2"
        strokeDasharray="4 3"
        fill="none"
      />
      {/* Center gold emblem: Outpost Diamond Star */}
      <path
        d="M90 28 L97 78 L147 90 L97 102 L90 152 L83 102 L33 90 L83 78 Z"
        fill="url(#goldGradOuter)"
      />
      {/* Center core jewel */}
      <circle cx="90" cy="90" r="10" fill="#fff9d6" />
    </svg>
  );
}

export const CardShowcaseComposition: React.FC<{ card?: Partial<CardShowcaseProps> }> = ({
  card = {}
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const data: CardShowcaseProps = {
    ...defaultCardShowcaseProps,
    ...card
  };

  // 12-second vertical sequence (360 frames @ 30fps)
  // Stage (a): Open (frames 0-45)
  // - dark navy/black screen
  // - small gold circular logo centered, brand name beneath
  // Stage (b): Move to top & Gold pill (frames 45-75)
  // - logo moves to top
  // - a gold pill fades in with OUR line
  // Stage (c): Card photo fades in at centre inside thin gold frame (frames 75-105)
  // Stage (d): Full poster holds (frames 105-315)
  // - card with slow zoom-in
  // - large white card name
  // - set + year
  // - card number
  // - suggested price (ONLY if vault stored one)
  // - bottom line with handle + search line
  // Stage (e): Close (frames 315-360)
  // - fades back to logo-only dark screen and loops

  // 1. Logo position & scale
  const logoYCenter = 0; // centered in container
  const logoYTop = -620; // top header position

  const logoY = interpolate(
    frame,
    [0, 45, 75, 315, 345, 360],
    [logoYCenter, logoYCenter, logoYTop, logoYTop, logoYCenter, logoYCenter],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const logoScale = interpolate(
    frame,
    [0, 45, 75, 315, 345, 360],
    [1.0, 1.0, 0.58, 0.58, 1.0, 1.0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const logoFade = interpolate(
    frame,
    [0, 18],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // 2. Brand name beneath centered logo (visible during open and close)
  const brandNameOpacity = interpolate(
    frame,
    [0, 15, 45, 65, 325, 345],
    [0, 1, 1, 0, 0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // 3. Gold Pill ("FROM THE VAULT")
  const goldPillOpacity = interpolate(
    frame,
    [58, 75, 310, 330],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const goldPillTranslateY = interpolate(
    frame,
    [58, 75],
    [-20, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // 4. Card Photo in Thin Gold Frame
  const cardOpacity = interpolate(
    frame,
    [75, 100, 315, 335],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Slow zoom-in Ken Burns effect while holding
  const cardZoom = interpolate(
    frame,
    [75, 100, 315],
    [0.96, 1.0, 1.06],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // 5. Full poster typography (card name, set, number, price, bottom line)
  const posterTextOpacity = interpolate(
    frame,
    [95, 115, 315, 335],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const posterTextY = interpolate(
    frame,
    [95, 115],
    [25, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const formattedPrice =
    typeof data.suggestedPrice === "number" &&
    Number.isFinite(data.suggestedPrice) &&
    data.suggestedPrice > 0
      ? `$${data.suggestedPrice.toFixed(2)}`
      : null;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#070a13",
        backgroundImage:
          "radial-gradient(circle at 50% 40%, #11182d 0%, #070a13 75%)",
        color: "#ffffff",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        overflow: "hidden"
      }}
    >
      {/* Background audio if provided */}
      {data.musicUrl ? (
        <Audio src={data.musicUrl} volume={0.3} />
      ) : null}

      {/* Subtle background ambient ring */}
      <AbsoluteFill
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          pointerEvents: "none",
          opacity: 0.12
        }}
      >
        <div
          style={{
            width: 900,
            height: 900,
            borderRadius: "50%",
            border: "1px solid #d4af37"
          }}
        />
      </AbsoluteFill>

      {/* LOGO & TOP HEADER CONTAINER */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          transform: `translateY(${logoY}px)`,
          opacity: logoFade
        }}
      >
        <div
          style={{
            transform: `scale(${logoScale})`,
            transformOrigin: "center center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center"
          }}
        >
          <GoldBrandLogo size={180} />

          {/* Centered brand name beneath logo (Open & Close only) */}
          <div
            style={{
              marginTop: 28,
              opacity: brandNameOpacity,
              textAlign: "center"
            }}
          >
            <div
              style={{
                fontSize: 38,
                fontWeight: 900,
                letterSpacing: "6px",
                color: "#f5f5f7",
                textShadow: "0 4px 20px rgba(0,0,0,0.8)"
              }}
            >
              {data.brandName}
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 20,
                fontWeight: 600,
                letterSpacing: "8px",
                color: "#d4af37"
              }}
            >
              {data.subBrand}
            </div>
          </div>
        </div>
      </AbsoluteFill>

      {/* TOP GOLD PILL (OUR LINE / CALL-TO-ACTION) */}
      <AbsoluteFill
        style={{
          display: "flex",
          justifyContent: "flex-start",
          alignItems: "center",
          paddingTop: 240,
          opacity: goldPillOpacity,
          transform: `translateY(${goldPillTranslateY}px)`,
          pointerEvents: "none"
        }}
      >
        <div
          style={{
            background:
              "linear-gradient(90deg, #aa7c11 0%, #d4af37 50%, #aa7c11 100%)",
            color: "#080c18",
            fontWeight: 900,
            fontSize: 24,
            letterSpacing: "5px",
            padding: "12px 36px",
            borderRadius: 9999,
            boxShadow:
              "0 4px 20px rgba(0,0,0,0.5), 0 0 25px rgba(212,175,55,0.4)"
          }}
        >
          {data.callToAction}
        </div>
      </AbsoluteFill>

      {/* CENTER CARD PHOTO INSIDE THIN GOLD FRAME */}
      <AbsoluteFill
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          paddingTop: 10,
          opacity: cardOpacity,
          pointerEvents: "none"
        }}
      >
        <div
          style={{
            width: 580,
            height: 812,
            borderRadius: 20,
            padding: 8,
            background:
              "linear-gradient(135deg, #fff2a3 0%, #d4af37 40%, #996515 80%, #d4af37 100%)",
            boxShadow:
              "0 25px 65px rgba(0,0,0,0.95), 0 0 35px rgba(212, 175, 55, 0.28)",
            transform: `scale(${cardZoom})`,
            transformOrigin: "center center",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            overflow: "hidden"
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: 14,
              overflow: "hidden",
              backgroundColor: "#0d1322",
              display: "flex",
              justifyContent: "center",
              alignItems: "center"
            }}
          >
            {data.photoUrl ? (
              <Img
                src={data.photoUrl}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover"
                }}
              />
            ) : null}
          </div>
        </div>
      </AbsoluteFill>

      {/* FULL POSTER TEXT (BELOW CARD) */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          alignItems: "center",
          paddingBottom: 90,
          opacity: posterTextOpacity,
          transform: `translateY(${posterTextY}px)`
        }}
      >
        {/* Large White Card Name */}
        <div
          style={{
            fontSize: 58,
            fontWeight: 900,
            letterSpacing: "2px",
            color: "#ffffff",
            textAlign: "center",
            maxWidth: 960,
            lineHeight: 1.1,
            textShadow: "0 4px 24px rgba(0,0,0,0.9)"
          }}
        >
          {data.cardName.toUpperCase()}
        </div>

        {/* Set + Year */}
        <div
          style={{
            marginTop: 16,
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: "1px",
            color: "#d8e2ec",
            textAlign: "center",
            maxWidth: 960,
            textShadow: "0 2px 14px rgba(0,0,0,0.85)"
          }}
        >
          {data.year ? `${data.year} ` : ""}
          {data.setName}
        </div>

        {/* Card Number */}
        {data.cardNumber ? (
          <div
            style={{
              marginTop: 10,
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: "3px",
              color: "#d4af37",
              textShadow: "0 2px 10px rgba(0,0,0,0.8)"
            }}
          >
            {data.cardNumber}
          </div>
        ) : null}

        {/* Suggested Price: ONLY IF STORED IN THE VAULT */}
        {formattedPrice ? (
          <div
            style={{
              marginTop: 20,
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: "rgba(212, 175, 55, 0.12)",
              border: "1px solid rgba(212, 175, 55, 0.45)",
              padding: "8px 24px",
              borderRadius: 12
            }}
          >
            <span
              style={{
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: "2px",
                color: "#e2e8f0"
              }}
            >
              SUGGESTED
            </span>
            <span
              style={{
                fontSize: 36,
                fontWeight: 900,
                letterSpacing: "1px",
                color: "#ffd700"
              }}
            >
              {formattedPrice}
            </span>
          </div>
        ) : null}

        {/* Bottom Line: Our eBay search line + handle */}
        <div
          style={{
            marginTop: 40,
            borderTop: "1px solid rgba(212, 175, 55, 0.35)",
            paddingTop: 24,
            width: 760,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "#a0aec0",
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: "2px"
          }}
        >
          <span>{data.searchLine}</span>
          <span style={{ color: "#d4af37", fontWeight: 700 }}>
            {data.handle}
          </span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
