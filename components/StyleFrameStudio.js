import React, { useState, useEffect, useRef } from "react";

const PRESETS = [
  {
    id: "amazon_white",
    name: "Amazon Pure White",
    badge: "Amazon Compliant",
    bgType: "solid",
    bgColor: "#ffffff",
    pedestalColor: "#f3f4f6",
    pedestalEdge: "#e5e7eb",
    shadowColor: "rgba(30, 30, 35, 0.22)",
    textColor: "#111827",
    reflectionOpacity: 0.08,
    neon: false,
  },
  {
    id: "minimalist_dark",
    name: "Minimalist Charcoal",
    badge: "Luxury & Tech",
    bgType: "gradient",
    bgInner: "#2a3240",
    bgOuter: "#11141a",
    pedestalColor: "#1e242f",
    pedestalEdge: "#3b4556",
    shadowColor: "rgba(0, 0, 0, 0.7)",
    textColor: "#f3f4f6",
    reflectionOpacity: 0.22,
    neon: false,
  },
  {
    id: "cyber_neon",
    name: "TikTok Cyber Neon",
    badge: "TikTok Shop / Viral",
    bgType: "gradient",
    bgInner: "#1f1838",
    bgOuter: "#0b0c14",
    pedestalColor: "#151522",
    pedestalEdge: "#00f2fe",
    shadowColor: "rgba(0, 0, 0, 0.85)",
    textColor: "#00f2fe",
    reflectionOpacity: 0.35,
    neon: true,
    neonGlow: "#00f2fe",
    accentGlow: "#ff9900",
  },
  {
    id: "luxury_warm",
    name: "Warm Luxury Editorial",
    badge: "Fashion & Apparel",
    bgType: "gradient",
    bgInner: "#523a2a",
    bgOuter: "#1c1410",
    pedestalColor: "#2c2018",
    pedestalEdge: "#9a744e",
    shadowColor: "rgba(15, 10, 8, 0.65)",
    textColor: "#fef3c7",
    reflectionOpacity: 0.20,
    neon: false,
  },
  {
    id: "commercial_showcase",
    name: "Commercial Showcase",
    badge: "Commercial Maker v6",
    bgType: "image",
    bgImage: "/backgrounds/bg-showcase.jpg",
    pedestalColor: "#20242c",
    pedestalEdge: "#485264",
    shadowColor: "rgba(0, 0, 0, 0.75)",
    textColor: "#ffffff",
    reflectionOpacity: 0.25,
    neon: false,
  },
  {
    id: "commercial_features",
    name: "Commercial Features",
    badge: "Commercial Maker v6",
    bgType: "image",
    bgImage: "/backgrounds/bg-features.jpg",
    pedestalColor: "#1c1d24",
    pedestalEdge: "#424452",
    shadowColor: "rgba(0, 0, 0, 0.75)",
    textColor: "#ffffff",
    reflectionOpacity: 0.25,
    neon: false,
  },
];

export default function StyleFrameStudio({
  imageUrl = "/cutouts/wc-shorts-cutout.png",
  productTitle = "Product Item",
  sku = "ITEM-001",
  onApplyStyleframe,
  onClose,
}) {
  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  // Studio Controls State
  const [selectedPreset, setSelectedPreset] = useState("cyber_neon");
  const [aspectRatio, setAspectRatio] = useState("1:1"); // "1:1", "9:16", "16:9"
  const [angle, setAngle] = useState(30);
  const [autoRotate, setAutoRotate] = useState(true);
  const [speed, setSpeed] = useState(1.0); // 0.5, 1.0, 2.0
  const [motionMode, setMotionMode] = useState("orbit"); // "orbit", "hover", "zoom", "pendulum"
  const [tilt, setTilt] = useState(6); // -15 to +25 degrees
  const [elevation, setElevation] = useState(10); // hover height in px
  const [showPedestal, setShowPedestal] = useState(true);
  const [showReflection, setShowReflection] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState(null);
  const [capturedFrames, setCapturedFrames] = useState([]);
  const [serverGenerating, setServerGenerating] = useState(false);

  // Drag interaction state
  const isDraggingRef = useRef(false);
  const lastMouseXRef = useRef(0);
  const animationFrameRef = useRef(null);
  const angleRef = useRef(angle);
  const timeRef = useRef(0);
  const imageObjRef = useRef(null);
  const bgImageObjRef = useRef(null);

  // Sync ref with angle state
  useEffect(() => {
    angleRef.current = angle;
  }, [angle]);

  // Load product cutout image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    img.onload = () => {
      imageObjRef.current = img;
    };
  }, [imageUrl]);

  // Load background image if selected preset has one
  const currentPresetCfg = PRESETS.find((p) => p.id === selectedPreset) || PRESETS[0];
  useEffect(() => {
    if (currentPresetCfg.bgType === "image" && currentPresetCfg.bgImage) {
      const bgImg = new Image();
      bgImg.crossOrigin = "anonymous";
      bgImg.src = currentPresetCfg.bgImage;
      bgImg.onload = () => {
        bgImageObjRef.current = bgImg;
      };
    } else {
      bgImageObjRef.current = null;
    }
  }, [currentPresetCfg]);

  // Dimensions based on aspect ratio
  const getCanvasDimensions = () => {
    if (aspectRatio === "9:16") return { width: 450, height: 800 };
    if (aspectRatio === "16:9") return { width: 800, height: 450 };
    return { width: 600, height: 600 }; // 1:1 default
  };

  // Main Render Loop
  useEffect(() => {
    let lastTime = performance.now();

    const render = (now) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      timeRef.current += dt;

      const canvas = canvasRef.current;
      if (!canvas) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }
      const ctx = canvas.getContext("2d");
      const { width, height } = canvas;

      // 1. Update Angle according to Motion Mode
      if (autoRotate && !isDraggingRef.current) {
        if (motionMode === "orbit") {
          angleRef.current = (angleRef.current + dt * 45 * speed) % 360;
          setAngle(Math.round(angleRef.current));
        } else if (motionMode === "pendulum") {
          angleRef.current = Math.sin(timeRef.current * 1.5 * speed) * 45;
          setAngle(Math.round(angleRef.current));
        } else if (motionMode === "hover") {
          angleRef.current = (angleRef.current + dt * 15 * speed) % 360;
          setAngle(Math.round(angleRef.current));
        }
      }

      // 2. Clear & Draw Studio Background
      ctx.clearRect(0, 0, width, height);

      if (currentPresetCfg.bgType === "solid") {
        ctx.fillStyle = currentPresetCfg.bgColor;
        ctx.fillRect(0, 0, width, height);
      } else if (currentPresetCfg.bgType === "gradient") {
        const grad = ctx.createRadialGradient(
          width / 2,
          height * 0.42,
          width * 0.05,
          width / 2,
          height * 0.45,
          width * 0.75
        );
        grad.addColorStop(0, currentPresetCfg.bgInner);
        grad.addColorStop(1, currentPresetCfg.bgOuter);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      } else if (currentPresetCfg.bgType === "image" && bgImageObjRef.current) {
        ctx.drawImage(bgImageObjRef.current, 0, 0, width, height);
        // Subtle overlay to blend
        ctx.fillStyle = "rgba(10, 12, 16, 0.3)";
        ctx.fillRect(0, 0, width, height);
      } else {
        ctx.fillStyle = "#11141a";
        ctx.fillRect(0, 0, width, height);
      }

      // 3. Stage & Pedestal Coordinates
      const stageY = height * 0.74;
      const pedestalRx = width * 0.38;
      const pedestalRy = pedestalRx * (0.24 + tilt * 0.005);
      const pedestalHeight = height * 0.045;

      // 4. Draw Pedestal
      if (showPedestal) {
        ctx.save();
        // Cylinder Body
        ctx.fillStyle = currentPresetCfg.pedestalColor;
        ctx.beginPath();
        ctx.ellipse(width / 2, stageY + pedestalHeight, pedestalRx, pedestalRy, 0, 0, Math.PI);
        ctx.lineTo(width / 2 - pedestalRx, stageY);
        ctx.ellipse(width / 2, stageY, pedestalRx, pedestalRy, 0, Math.PI, 0);
        ctx.lineTo(width / 2 + pedestalRx, stageY + pedestalHeight);
        ctx.closePath();
        ctx.fill();

        // Top Disc Surface
        const discGrad = ctx.createLinearGradient(
          width / 2 - pedestalRx,
          stageY - pedestalRy,
          width / 2 + pedestalRx,
          stageY + pedestalRy
        );
        discGrad.addColorStop(0, currentPresetCfg.pedestalEdge);
        discGrad.addColorStop(1, currentPresetCfg.pedestalColor);
        ctx.fillStyle = discGrad;
        ctx.beginPath();
        ctx.ellipse(width / 2, stageY, pedestalRx, pedestalRy, 0, 0, Math.PI * 2);
        ctx.fill();

        // Edge stroke
        ctx.strokeStyle = currentPresetCfg.pedestalEdge;
        ctx.lineWidth = currentPresetCfg.neon ? 3 : 1.5;
        ctx.stroke();

        // Neon Glow Ring
        if (currentPresetCfg.neon) {
          ctx.shadowColor = currentPresetCfg.neonGlow;
          ctx.shadowBlur = 18;
          ctx.strokeStyle = currentPresetCfg.neonGlow;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(width / 2, stageY, pedestalRx, pedestalRy, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur = 0; // reset
        }
        ctx.restore();
      }

      // 5. Draw Product Cutout with 3D Perspective & Motion
      const prodImg = imageObjRef.current;
      if (prodImg && prodImg.complete && prodImg.naturalWidth > 0) {
        ctx.save();

        // Calculate dynamic vertical bobbing if hover mode
        const hoverOffset =
          motionMode === "hover" ? Math.sin(timeRef.current * 3) * 12 : 0;
        const currentElev = elevation + hoverOffset;

        // Foreshortening width factor based on angle
        const curAngle = angleRef.current;
        const rad = (curAngle * Math.PI) / 180;
        const cosAngle = Math.cos(rad);
        const absCos = Math.abs(cosAngle);
        const scaleX = Math.max(0.20, absCos);
        const isBack = ((curAngle % 360) + 360) % 360 > 90 && ((curAngle % 360) + 360) % 360 < 270;

        // Zoom pulse if zoom mode
        const zoomScale =
          motionMode === "zoom" ? 1.0 + Math.sin(timeRef.current * 2) * 0.08 : 1.0;

        const targetH = height * 0.48 * zoomScale;
        const aspect = prodImg.naturalWidth / prodImg.naturalHeight;
        const targetW = targetH * aspect * scaleX;

        const prodX = width / 2;
        const prodBottomY = stageY - currentElev;

        // 6. Contact & Cast Shadows
        ctx.save();
        const shadowScale = Math.max(0.6, 1.0 - currentElev * 0.008);
        const shadowRx = (targetW * 0.42 + 20) * shadowScale;
        const shadowRy = shadowRx * 0.22;

        // Floor Contact Occlusion
        ctx.fillStyle = currentPresetCfg.shadowColor;
        ctx.beginPath();
        ctx.ellipse(
          width / 2 + 10,
          stageY + 4,
          shadowRx,
          shadowRy,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();

        // Soft Cast Shadow
        ctx.fillStyle = currentPresetCfg.shadowColor;
        ctx.beginPath();
        ctx.ellipse(
          width / 2 + 18,
          stageY + 12,
          shadowRx * 1.2,
          shadowRy * 1.3,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.restore();

        // 7. Floor Reflection
        if (showReflection && currentPresetCfg.reflectionOpacity > 0.02) {
          ctx.save();
          ctx.globalAlpha = currentPresetCfg.reflectionOpacity * (1.0 - currentElev * 0.02);
          ctx.translate(prodX, stageY);
          ctx.scale(isBack ? -scaleX : scaleX, -0.65); // flip vertically
          ctx.drawImage(
            prodImg,
            -((targetH * aspect) / 2),
            0,
            targetH * aspect,
            targetH
          );
          ctx.restore();
        }

        // 8. Render Product
        ctx.save();
        ctx.translate(prodX, prodBottomY);

        // Flip horizontally if facing back
        if (isBack) {
          ctx.scale(-scaleX, 1);
          // Darken back slightly
          ctx.filter = "brightness(0.92)";
        } else {
          ctx.scale(scaleX, 1);
        }

        ctx.drawImage(
          prodImg,
          -((targetH * aspect) / 2),
          -targetH,
          targetH * aspect,
          targetH
        );
        ctx.restore();

        // 9. Cyber Neon Rim Lighting Accents
        if (currentPresetCfg.neon && !isBack) {
          ctx.save();
          ctx.globalCompositeOperation = "screen";
          const rimGrad = ctx.createLinearGradient(
            prodX - targetW / 2,
            prodBottomY - targetH,
            prodX + targetW / 2,
            prodBottomY
          );
          rimGrad.addColorStop(0, "rgba(0, 242, 254, 0.25)");
          rimGrad.addColorStop(1, "rgba(255, 153, 0, 0.25)");
          ctx.fillStyle = rimGrad;
          ctx.fillRect(
            prodX - targetW / 2,
            prodBottomY - targetH,
            targetW,
            targetH
          );
          ctx.restore();
        }

        ctx.restore();
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [
    autoRotate,
    speed,
    motionMode,
    tilt,
    elevation,
    showPedestal,
    showReflection,
    currentPresetCfg,
    aspectRatio,
  ]);

  // Mouse drag interaction
  const handleMouseDown = (e) => {
    isDraggingRef.current = true;
    lastMouseXRef.current = e.clientX;
  };

  const handleMouseMove = (e) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastMouseXRef.current;
    lastMouseXRef.current = e.clientX;
    angleRef.current = (angleRef.current + dx * 0.75) % 360;
    setAngle(Math.round(angleRef.current));
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  // Video Recording Engine (HTML5 MediaRecorder 60fps)
  const startRecording = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    recordedChunksRef.current = [];
    setIsRecording(true);
    setRecordProgress(0);
    setRecordedVideoUrl(null);

    // Save previous autoRotate state
    const prevAuto = autoRotate;
    setAutoRotate(true);
    setMotionMode("orbit");

    // Capture 60fps stream from canvas
    const stream = canvas.captureStream(60);
    const mimeTypes = [
      "video/webm;codecs=vp9",
      "video/webm",
      "video/mp4",
    ];
    let selectedMime = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) || "";

    const options = selectedMime ? { mimeType: selectedMime } : {};
    const mediaRecorder = new MediaRecorder(stream, options);
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recordedChunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, {
        type: selectedMime || "video/webm",
      });
      const url = URL.createObjectURL(blob);
      setRecordedVideoUrl(url);
      setIsRecording(false);
      setRecordProgress(100);
      setAutoRotate(prevAuto);
    };

    mediaRecorder.start();

    // Record for 1 full turntable loop (approx 5.5 seconds at speed 1.0)
    const totalDuration = 5500;
    const interval = 100;
    let elapsed = 0;
    const progressTimer = setInterval(() => {
      elapsed += interval;
      const pct = Math.min(100, Math.round((elapsed / totalDuration) * 100));
      setRecordProgress(pct);
      if (elapsed >= totalDuration) {
        clearInterval(progressTimer);
        if (mediaRecorder.state === "recording") {
          mediaRecorder.stop();
        }
      }
    }, interval);
  };

  // Capture Multi-Angle Keyframe Suite
  const captureKeyframeSuite = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const anglesToCapture = [
      { angle: 0, label: "0° Front Hero" },
      { angle: 45, label: "45° 3/4 Dynamic" },
      { angle: 90, label: "90° Profile" },
      { angle: 315, label: "315° Reverse 3/4" },
    ];

    const prevAngle = angleRef.current;
    const prevAuto = autoRotate;
    setAutoRotate(false);

    const frames = [];
    anglesToCapture.forEach((item) => {
      angleRef.current = item.angle;
      // Force snapshot
      const dataUrl = canvas.toDataURL("image/png");
      frames.push({
        label: item.label,
        angle: item.angle,
        dataUrl,
      });
    });

    setCapturedFrames(frames);
    angleRef.current = prevAngle;
    setAutoRotate(prevAuto);
  };

  // Generate High-Res Server Keyframes via Python API
  const handleServerGenerate = async () => {
    setServerGenerating(true);
    try {
      const res = await fetch("/api/omni-lister/styleframe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cutout_url: imageUrl,
          preset: selectedPreset,
          sku,
          action: "render_keyframes",
        }),
      });
      const data = await res.json();
      if (data.ok && data.keyframes) {
        setCapturedFrames(
          data.keyframes.map((kf) => ({
            label: kf.label,
            angle: kf.angle,
            dataUrl: kf.url,
          }))
        );
      } else {
        alert(`Server rendering failed: ${data.error}`);
      }
    } catch (err) {
      alert(`Server error: ${err.message}`);
    } finally {
      setServerGenerating(false);
    }
  };

  const { width: canvasW, height: canvasH } = getCanvasDimensions();

  return (
    <div style={styles.studioContainer}>
      {/* Studio Header */}
      <div style={styles.studioHeader}>
        <div>
          <div style={styles.headerTitleRow}>
            <span style={styles.badge}>StyleFrame Studio 3D</span>
            <span style={styles.brandTitle}>Turntable Motion & Studio Framing</span>
          </div>
          <p style={styles.headerSubtitle}>
            Mimicking styleframe.ai: 360° product turntable, automated lighting, drop shadows, and 60fps video export.
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} style={styles.closeBtn}>
            ✕ Close Studio
          </button>
        )}
      </div>

      {/* Main Studio Workspace */}
      <div style={styles.workspaceGrid}>
        {/* Left: Viewport Stage */}
        <div style={styles.stagePanel}>
          <div style={styles.viewportHeader}>
            <div style={styles.aspectButtonGroup}>
              {["1:1", "9:16", "16:9"].map((ar) => (
                <button
                  key={ar}
                  onClick={() => setAspectRatio(ar)}
                  style={{
                    ...styles.aspectBtn,
                    ...(aspectRatio === ar ? styles.aspectBtnActive : {}),
                  }}
                >
                  {ar === "1:1" && "1:1 Square (Amazon/eBay)"}
                  {ar === "9:16" && "9:16 Vertical (TikTok/Reels)"}
                  {ar === "16:9" && "16:9 Cinema"}
                </button>
              ))}
            </div>

            <span style={styles.activeAngleBadge}>Angle: {angle}°</span>
          </div>

          {/* Interactive Canvas Viewport */}
          <div
            style={styles.canvasContainer}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <canvas
              ref={canvasRef}
              width={canvasW}
              height={canvasH}
              style={{
                ...styles.canvas,
                width: aspectRatio === "9:16" ? "320px" : aspectRatio === "16:9" ? "560px" : "420px",
                height: aspectRatio === "9:16" ? "568px" : aspectRatio === "16:9" ? "315px" : "420px",
              }}
            />

            {isRecording && (
              <div style={styles.recordingOverlay}>
                <div style={styles.recordDot} />
                <span style={styles.recordText}>
                  Recording 60fps Turntable... {recordProgress}%
                </span>
              </div>
            )}
          </div>

          {/* Canvas Scrubber Bar */}
          <div style={styles.scrubberRow}>
            <button
              onClick={() => setAutoRotate(!autoRotate)}
              style={{
                ...styles.playBtn,
                ...(autoRotate ? styles.playBtnActive : {}),
              }}
            >
              {autoRotate ? "⏸ Pause Spin" : "▶ Play Spin"}
            </button>
            <input
              type="range"
              min="0"
              max="360"
              value={angle}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setAngle(val);
                angleRef.current = val;
              }}
              style={styles.angleSlider}
            />
            <span style={styles.scrubberLabel}>{angle}°</span>
          </div>
        </div>

        {/* Right: Studio Controls & Presets */}
        <div style={styles.controlsPanel}>
          {/* Section 1: Studio Environments */}
          <div style={styles.sectionBox}>
            <h4 style={styles.sectionTitle}>1. Studio Environment & Lighting</h4>
            <div style={styles.presetGrid}>
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPreset(p.id)}
                  style={{
                    ...styles.presetCard,
                    ...(selectedPreset === p.id ? styles.presetCardActive : {}),
                  }}
                >
                  <div style={styles.presetName}>{p.name}</div>
                  <div style={styles.presetBadge}>{p.badge}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Section 2: Motion Modes */}
          <div style={styles.sectionBox}>
            <h4 style={styles.sectionTitle}>2. Motion & Keyframe Mode</h4>
            <div style={styles.motionButtonGroup}>
              {[
                { id: "orbit", label: "360° Turntable Orbit" },
                { id: "hover", label: "Floating Levitation" },
                { id: "zoom", label: "Hero Dolly Zoom" },
                { id: "pendulum", label: "Pendulum 90° Sweep" },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMotionMode(m.id)}
                  style={{
                    ...styles.motionBtn,
                    ...(motionMode === m.id ? styles.motionBtnActive : {}),
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Speed selection */}
            <div style={styles.sliderControlRow}>
              <label style={styles.sliderLabel}>Rotation Speed:</label>
              <div style={styles.speedOptions}>
                {[0.5, 1.0, 2.0].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    style={{
                      ...styles.speedBtn,
                      ...(speed === s ? styles.speedBtnActive : {}),
                    }}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>

            {/* Camera Tilt */}
            <div style={styles.sliderControlRow}>
              <label style={styles.sliderLabel}>Camera Tilt Pitch ({tilt}°):</label>
              <input
                type="range"
                min="-15"
                max="25"
                value={tilt}
                onChange={(e) => setTilt(parseInt(e.target.value))}
                style={styles.slider}
              />
            </div>

            {/* Elevation */}
            <div style={styles.sliderControlRow}>
              <label style={styles.sliderLabel}>Hover Elevation ({elevation}px):</label>
              <input
                type="range"
                min="0"
                max="60"
                value={elevation}
                onChange={(e) => setElevation(parseInt(e.target.value))}
                style={styles.slider}
              />
            </div>

            {/* Toggles */}
            <div style={styles.toggleRow}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={showPedestal}
                  onChange={(e) => setShowPedestal(e.target.checked)}
                />
                3D Turntable Podium
              </label>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={showReflection}
                  onChange={(e) => setShowReflection(e.target.checked)}
                />
                Glossy Floor Reflection
              </label>
            </div>
          </div>

          {/* Section 3: Export & Video Engine */}
          <div style={styles.sectionBox}>
            <h4 style={styles.sectionTitle}>3. Video & Keyframe Stills Export</h4>
            <div style={styles.exportActionRow}>
              <button
                onClick={startRecording}
                disabled={isRecording}
                style={styles.videoExportBtn}
              >
                {isRecording ? `Recording (${recordProgress}%)...` : "🎬 Record 360° Video (WebM/MP4)"}
              </button>

              <button
                onClick={captureKeyframeSuite}
                style={styles.stillsExportBtn}
              >
                📸 Capture 4 Listing Angles
              </button>
            </div>

            <div style={{ marginTop: "10px" }}>
              <button
                onClick={handleServerGenerate}
                disabled={serverGenerating}
                style={styles.serverRenderBtn}
              >
                {serverGenerating
                  ? "Rendering on Server..."
                  : "⚙️ Render Server High-Res Pack (Pillow Python Engine)"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Video Preview Modal / Banner if recorded */}
      {recordedVideoUrl && (
        <div style={styles.exportPreviewSection}>
          <div style={styles.previewHeader}>
            <strong style={{ color: "#00f2fe", fontSize: "15px" }}>
              ✓ 360° Turntable Video Ready for Export
            </strong>
            <span style={{ fontSize: "12px", color: "#8a96a3" }}>
              Aspect: {aspectRatio} • Format: WebM 60fps
            </span>
          </div>
          <div style={styles.videoPlayerRow}>
            <video
              src={recordedVideoUrl}
              controls
              autoPlay
              loop
              style={{
                maxHeight: "220px",
                borderRadius: "6px",
                border: "1px solid #2e3846",
              }}
            />
            <div style={styles.videoDownloadActions}>
              <a
                href={recordedVideoUrl}
                download={`${sku}-turntable-${selectedPreset}-${aspectRatio.replace(":", "-")}.webm`}
                style={styles.downloadLinkBtn}
              >
                ⬇ Download Turntable Video
              </a>
              {onApplyStyleframe && (
                <button
                  onClick={() => onApplyStyleframe({ videoUrl: recordedVideoUrl })}
                  style={styles.attachBtn}
                >
                  💾 Attach Video to Listing
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Captured Keyframe Gallery */}
      {capturedFrames.length > 0 && (
        <div style={styles.exportPreviewSection}>
          <div style={styles.previewHeader}>
            <strong style={{ color: "#ff9900", fontSize: "15px" }}>
              ✓ Multi-Angle Listing Keyframes ({capturedFrames.length} Stills)
            </strong>
            <span style={{ fontSize: "12px", color: "#8a96a3" }}>
              Standard Amazon / eBay 7-slot angles
            </span>
          </div>

          <div style={styles.keyframeGrid}>
            {capturedFrames.map((kf, i) => (
              <div key={i} style={styles.keyframeCard}>
                <img
                  src={kf.dataUrl}
                  alt={kf.label}
                  style={styles.keyframeImg}
                />
                <div style={styles.keyframeMeta}>
                  <span>{kf.label}</span>
                  <a
                    href={kf.dataUrl}
                    download={`${sku}-keyframe-${kf.angle}deg.png`}
                    style={styles.keyframeDl}
                  >
                    ⬇ Save
                  </a>
                </div>
              </div>
            ))}
          </div>

          {onApplyStyleframe && (
            <div style={{ marginTop: "12px", textAlign: "right" }}>
              <button
                onClick={() => onApplyStyleframe({ keyframes: capturedFrames })}
                style={styles.attachBtn}
              >
                💾 Sync All 4 Keyframes into Product Gallery
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  studioContainer: {
    backgroundColor: "#161a22",
    borderRadius: "12px",
    border: "1px solid #2e3846",
    padding: "20px",
    marginTop: "20px",
    color: "#e6edf3",
    boxShadow: "0 8px 30px rgba(0, 0, 0, 0.5)",
  },
  studioHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "1px solid #262c36",
    paddingBottom: "14px",
    marginBottom: "16px",
  },
  headerTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  badge: {
    background: "linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)",
    color: "#000000",
    fontWeight: "700",
    fontSize: "11px",
    padding: "3px 8px",
    borderRadius: "4px",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  brandTitle: {
    fontSize: "20px",
    fontWeight: "700",
    color: "#ffffff",
  },
  headerSubtitle: {
    margin: "4px 0 0 0",
    fontSize: "13px",
    color: "#8a96a3",
  },
  closeBtn: {
    background: "transparent",
    border: "1px solid #3b4556",
    color: "#cbd5e1",
    padding: "6px 12px",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "13px",
  },
  workspaceGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "20px",
    alignItems: "start",
  },
  stagePanel: {
    backgroundColor: "#0d1117",
    borderRadius: "10px",
    border: "1px solid #21262d",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  viewportHeader: {
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
  },
  aspectButtonGroup: {
    display: "flex",
    gap: "6px",
  },
  aspectBtn: {
    backgroundColor: "#1e242f",
    color: "#8a96a3",
    border: "1px solid #2e3846",
    borderRadius: "4px",
    padding: "5px 10px",
    fontSize: "11px",
    cursor: "pointer",
    fontWeight: "600",
  },
  aspectBtnActive: {
    backgroundColor: "#00f2fe",
    color: "#000000",
    borderColor: "#00f2fe",
  },
  activeAngleBadge: {
    backgroundColor: "#21262d",
    color: "#ff9900",
    fontSize: "12px",
    fontWeight: "700",
    padding: "4px 8px",
    borderRadius: "4px",
    border: "1px solid #3b4556",
  },
  canvasContainer: {
    position: "relative",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    cursor: "grab",
    userSelect: "none",
    backgroundColor: "#090d13",
    borderRadius: "8px",
    overflow: "hidden",
    border: "1px solid #30363d",
  },
  canvas: {
    display: "block",
    borderRadius: "6px",
  },
  recordingOverlay: {
    position: "absolute",
    top: "14px",
    left: "14px",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    padding: "6px 12px",
    borderRadius: "20px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    border: "1px solid #ff4444",
  },
  recordDot: {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    backgroundColor: "#ff4444",
    boxShadow: "0 0 8px #ff4444",
  },
  recordText: {
    color: "#ffffff",
    fontSize: "12px",
    fontWeight: "600",
  },
  scrubberRow: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginTop: "14px",
    padding: "0 6px",
  },
  playBtn: {
    backgroundColor: "#21262d",
    color: "#e6edf3",
    border: "1px solid #3b4556",
    borderRadius: "6px",
    padding: "7px 12px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  playBtnActive: {
    backgroundColor: "rgba(0, 242, 254, 0.15)",
    color: "#00f2fe",
    borderColor: "#00f2fe",
  },
  angleSlider: {
    flex: 1,
    accentColor: "#00f2fe",
    cursor: "pointer",
  },
  scrubberLabel: {
    fontSize: "12px",
    color: "#cbd5e1",
    fontWeight: "600",
    minWidth: "36px",
    textAlign: "right",
  },
  controlsPanel: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  sectionBox: {
    backgroundColor: "#1a1f28",
    borderRadius: "8px",
    border: "1px solid #2b3340",
    padding: "12px 14px",
  },
  sectionTitle: {
    margin: "0 0 10px 0",
    fontSize: "13px",
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: "0.3px",
    textTransform: "uppercase",
  },
  presetGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px",
  },
  presetCard: {
    backgroundColor: "#12151b",
    border: "1px solid #2d3542",
    borderRadius: "6px",
    padding: "10px",
    textAlign: "left",
    cursor: "pointer",
  },
  presetCardActive: {
    borderColor: "#00f2fe",
    backgroundColor: "rgba(0, 242, 254, 0.08)",
    boxShadow: "0 0 10px rgba(0, 242, 254, 0.2)",
  },
  presetName: {
    fontSize: "13px",
    fontWeight: "700",
    color: "#ffffff",
  },
  presetBadge: {
    fontSize: "11px",
    color: "#8a96a3",
    marginTop: "2px",
  },
  motionButtonGroup: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px",
    marginBottom: "12px",
  },
  motionBtn: {
    backgroundColor: "#12151b",
    color: "#cbd5e1",
    border: "1px solid #2d3542",
    borderRadius: "6px",
    padding: "8px 10px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    textAlign: "center",
  },
  motionBtnActive: {
    backgroundColor: "rgba(255, 153, 0, 0.15)",
    color: "#ff9900",
    borderColor: "#ff9900",
  },
  sliderControlRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    margin: "8px 0",
    gap: "10px",
  },
  sliderLabel: {
    fontSize: "12px",
    color: "#8a96a3",
    flex: 1,
  },
  speedOptions: {
    display: "flex",
    gap: "4px",
  },
  speedBtn: {
    backgroundColor: "#12151b",
    color: "#8a96a3",
    border: "1px solid #2d3542",
    borderRadius: "4px",
    padding: "3px 8px",
    fontSize: "11px",
    cursor: "pointer",
  },
  speedBtnActive: {
    backgroundColor: "#00f2fe",
    color: "#000000",
    fontWeight: "700",
  },
  slider: {
    flex: 1,
    accentColor: "#ff9900",
    cursor: "pointer",
  },
  toggleRow: {
    display: "flex",
    gap: "20px",
    marginTop: "10px",
    borderTop: "1px solid #262d38",
    paddingTop: "10px",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
    color: "#cbd5e1",
    cursor: "pointer",
  },
  exportActionRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
  },
  videoExportBtn: {
    backgroundColor: "#ff9900",
    color: "#000000",
    fontWeight: "700",
    border: "none",
    borderRadius: "6px",
    padding: "10px",
    fontSize: "13px",
    cursor: "pointer",
  },
  stillsExportBtn: {
    backgroundColor: "#00f2fe",
    color: "#000000",
    fontWeight: "700",
    border: "none",
    borderRadius: "6px",
    padding: "10px",
    fontSize: "13px",
    cursor: "pointer",
  },
  serverRenderBtn: {
    width: "100%",
    backgroundColor: "#262d38",
    color: "#cbd5e1",
    border: "1px solid #3b4556",
    borderRadius: "6px",
    padding: "8px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
  },
  exportPreviewSection: {
    marginTop: "18px",
    backgroundColor: "#10141a",
    borderRadius: "8px",
    border: "1px solid #2e3846",
    padding: "14px",
  },
  previewHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
  },
  videoPlayerRow: {
    display: "flex",
    gap: "20px",
    alignItems: "center",
  },
  videoDownloadActions: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  downloadLinkBtn: {
    backgroundColor: "#00f2fe",
    color: "#000000",
    fontWeight: "700",
    textDecoration: "none",
    padding: "9px 16px",
    borderRadius: "6px",
    fontSize: "13px",
    display: "inline-block",
    textAlign: "center",
  },
  attachBtn: {
    backgroundColor: "#22c55e",
    color: "#ffffff",
    fontWeight: "700",
    border: "none",
    borderRadius: "6px",
    padding: "9px 16px",
    fontSize: "13px",
    cursor: "pointer",
  },
  keyframeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "10px",
  },
  keyframeCard: {
    backgroundColor: "#161a22",
    borderRadius: "6px",
    border: "1px solid #262c36",
    overflow: "hidden",
  },
  keyframeImg: {
    width: "100%",
    aspectRatio: "1/1",
    objectFit: "contain",
    display: "block",
    backgroundColor: "#090d13",
  },
  keyframeMeta: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 8px",
    fontSize: "11px",
    color: "#cbd5e1",
    borderTop: "1px solid #21262d",
  },
  keyframeDl: {
    color: "#ff9900",
    textDecoration: "none",
    fontWeight: "600",
  },
};
