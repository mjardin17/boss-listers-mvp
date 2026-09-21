import React, { useState, useEffect, useRef } from "react";

export default function CommercialStudio({
  product = {},
  initialMission = null,
  cutoutUrl = null,
  onClose,
}) {
  const [mission, setMission] = useState(initialMission);
  const [loading, setLoading] = useState(!initialMission);
  const [activeVariant, setActiveVariant] = useState(0);
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [narrationEnabled, setNarrationEnabled] = useState(true);
  const [aspectRatio, setAspectRatio] = useState("9:16"); // "9:16" or "1:1"
  const [isRecording, setIsRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState(null);

  const canvasRef = useRef(null);
  const playTimerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const sceneProgressRef = useRef(0);
  const productImgRef = useRef(null);
  const bgImgRefs = useRef({});

  // Fetch or generate copywriter mission if not provided
  useEffect(() => {
    if (!mission && product.title) {
      setLoading(true);
      fetch("/api/omni-lister/copywrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: product.title || product.name,
          description: product.description || product.materials || "",
          price: product.price || 0,
          sku: product.sku || "SKU-ITEM",
          image_url: product.image_url || null,
          cutout_url: cutoutUrl || product.cutout_url || null,
          reviews: product.reviews || {},
          variantIndex: activeVariant,
          aspect: aspectRatio,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.ok && data.mission) {
            setMission(data.mission);
          }
        })
        .catch((err) => console.error("Error generating ad copy:", err))
        .finally(() => setLoading(false));
    }
  }, [product, activeVariant, aspectRatio, mission, cutoutUrl]);

  // Load product cutout / main image
  useEffect(() => {
    const src = cutoutUrl || product.image_url || "/cutouts/wc-shorts-cutout.png";
    if (src) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = src;
      img.onload = () => {
        productImgRef.current = img;
      };
    }
  }, [cutoutUrl, product.image_url]);

  // Preload background images
  useEffect(() => {
    const bgFiles = [
      "/backgrounds/bg-hook.jpg",
      "/backgrounds/bg-showcase.jpg",
      "/backgrounds/bg-features.jpg",
      "/backgrounds/bg-cta.jpg",
      "/backgrounds/bg-proof.jpg",
    ];
    bgFiles.forEach((f) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = f;
      img.onload = () => {
        bgImgRefs.current[f] = img;
      };
    });
  }, []);

  // Web Speech API for voiceover narration
  const speakScene = (text) => {
    if (!narrationEnabled || !text || typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05; // conversational commercial pace
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch {}
  };

  const scenes = mission?.scenes || [];
  const currentScene = scenes[activeSceneIndex] || scenes[0];

  // Advance scenes during playback
  useEffect(() => {
    if (!isPlaying || scenes.length === 0) {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
      return;
    }

    const sceneDurationMs = (currentScene?.duration || 4.0) * 1000;
    speakScene(currentScene?.narration);

    playTimerRef.current = setTimeout(() => {
      setActiveSceneIndex((prev) => {
        const next = prev + 1;
        if (next >= scenes.length) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });
    }, sceneDurationMs);

    return () => {
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
    };
  }, [isPlaying, activeSceneIndex, currentScene, scenes.length]);

  // Main Canvas Rendering Loop
  useEffect(() => {
    let animFrame;
    let startTime = performance.now();

    const render = (now) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const { width, height } = canvas;

      const elapsedSec = (now - startTime) / 1000;
      sceneProgressRef.current = elapsedSec;

      // 1. Draw Background
      ctx.clearRect(0, 0, width, height);
      const bgImg = currentScene?.bgImage ? bgImgRefs.current[currentScene.bgImage] : null;
      if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
        ctx.drawImage(bgImg, 0, 0, width, height);
        // Dimming overlay
        ctx.fillStyle = "rgba(10, 14, 20, 0.4)";
        ctx.fillRect(0, 0, width, height);
      } else {
        // Fallback gradient
        const grad = ctx.createLinearGradient(0, 0, width, height);
        grad.addColorStop(0, "#111622");
        grad.addColorStop(1, "#07090d");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      }

      // 2. Draw Product (Scenes 2, 3, 4, 5)
      const prodImg = productImgRef.current;
      if (prodImg && prodImg.complete && prodImg.naturalWidth > 0 && activeSceneIndex >= 1) {
        ctx.save();
        const stageY = height * 0.58;
        const targetH = height * 0.42;
        const aspect = prodImg.naturalWidth / prodImg.naturalHeight;
        const targetW = targetH * aspect;

        // Subtle Ken Burns motion / bounce
        const scaleMotion = 1.0 + Math.sin(elapsedSec * 2) * 0.03;
        const xOffset = activeSceneIndex === 2 ? Math.sin(elapsedSec * 1.5) * 15 : 0;

        // Contact shadow
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.beginPath();
        ctx.ellipse(width / 2 + xOffset, stageY + targetH / 2 - 10, targetW * 0.45, 16, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.translate(width / 2 + xOffset, stageY);
        ctx.scale(scaleMotion, scaleMotion);
        ctx.drawImage(prodImg, -targetW / 2, -targetH / 2, targetW, targetH);
        ctx.restore();
      }

      // 3. Draw Scene Overlays & Typography
      ctx.save();
      if (activeSceneIndex === 0) {
        // Scene 1: Title Hook Slam
        ctx.fillStyle = "#ff9900";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("EXCLUSIVE DROPS", width / 2, height * 0.32);

        ctx.fillStyle = "#ffffff";
        ctx.font = "900 24px sans-serif";
        ctx.textAlign = "center";
        const titleText = currentScene?.headline || product.title || "Featured Product";
        wrapText(ctx, titleText, width / 2, height * 0.40, width * 0.85, 30);

        ctx.fillStyle = "#00f2fe";
        ctx.font = "bold 13px sans-serif";
        ctx.fillText("NOW LIVE ON BOSSLISTERS", width / 2, height * 0.68);
      } else if (activeSceneIndex === 1) {
        // Scene 2: 3D Showcase & Hook Caption
        ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
        ctx.roundRect ? ctx.roundRect(width * 0.08, height * 0.12, width * 0.84, 52, 8) : ctx.fillRect(width * 0.08, height * 0.12, width * 0.84, 52);
        ctx.fill();

        ctx.strokeStyle = "#00f2fe";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`"${currentScene?.caption || mission?.activeHook}"`, width / 2, height * 0.16);
      } else if (activeSceneIndex === 2) {
        // Scene 3: Benefits Pop
        ctx.fillStyle = "rgba(17, 24, 39, 0.85)";
        ctx.fillRect(width * 0.08, height * 0.10, width * 0.84, 55);

        ctx.fillStyle = "#ff9900";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("KEY HIGHLIGHT", width / 2, height * 0.13);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 14px sans-serif";
        ctx.fillText(currentScene?.overlay_text || "Premium Quality & Authentic", width / 2, height * 0.165);
      } else if (activeSceneIndex === 3) {
        // Scene 4: Price & Urgency Flash
        ctx.fillStyle = "rgba(255, 153, 0, 0.95)";
        ctx.fillRect(width * 0.18, height * 0.10, width * 0.64, 46);

        ctx.fillStyle = "#000000";
        ctx.font = "900 20px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`ONLY ${currentScene?.price_text || `$${product.price}`}`, width / 2, height * 0.14);

        ctx.fillStyle = "#ff4444";
        ctx.font = "bold 12px sans-serif";
        ctx.fillText("⚡ LIMITED STOCK REMAINING", width / 2, height * 0.18);
      } else if (activeSceneIndex === 4) {
        // Scene 5: Finale & Social Proof
        ctx.fillStyle = "#ffdd00";
        ctx.font = "bold 18px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(currentScene?.proof_text || "★★★★★ 5.0 RATED", width / 2, height * 0.14);

        ctx.fillStyle = "#ffffff";
        ctx.font = "900 16px sans-serif";
        ctx.fillText("Boss Listers Curated Marketplace", width / 2, height * 0.86);

        ctx.fillStyle = "#00f2fe";
        ctx.font = "12px sans-serif";
        ctx.fillText("Tap Link in Bio to Order", width / 2, height * 0.90);
      }
      ctx.restore();

      animFrame = requestAnimationFrame(render);
    };

    animFrame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animFrame);
  }, [activeSceneIndex, currentScene, mission, product]);

  // Helper function to wrap text on canvas
  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = String(text || "").split(" ");
    let line = "";
    let currentY = y;
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(line.trim(), x, currentY);
        line = words[n] + " ";
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), x, currentY);
  }

  // 1-Click Video Recording of 5-Scene Commercial
  const recordCommercial = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    recordedChunksRef.current = [];
    setIsRecording(true);
    setRecordProgress(0);
    setRecordedVideoUrl(null);
    setIsPlaying(false);

    const stream = canvas.captureStream(30);
    const mimeTypes = ["video/webm;codecs=vp9", "video/webm", "video/mp4"];
    const selectedMime = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) || "";

    const mediaRecorder = new MediaRecorder(stream, selectedMime ? { mimeType: selectedMime } : {});
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: selectedMime || "video/webm" });
      const url = URL.createObjectURL(blob);
      setRecordedVideoUrl(url);
      setIsRecording(false);
      setRecordProgress(100);
      setActiveSceneIndex(0);
    };

    mediaRecorder.start();

    // Play through each scene sequentially (3s each in record mode for rapid 15s export)
    const sceneRecordDurationMs = 3000;
    const totalScenes = scenes.length;
    let sceneIdx = 0;

    setActiveSceneIndex(0);
    speakScene(scenes[0]?.narration);

    const sceneInterval = setInterval(() => {
      sceneIdx += 1;
      const pct = Math.min(100, Math.round((sceneIdx / totalScenes) * 100));
      setRecordProgress(pct);

      if (sceneIdx < totalScenes) {
        setActiveSceneIndex(sceneIdx);
        speakScene(scenes[sceneIdx]?.narration);
      } else {
        clearInterval(sceneInterval);
        if (mediaRecorder.state === "recording") {
          mediaRecorder.stop();
        }
      }
    }, sceneRecordDurationMs);
  };

  const canvasW = aspectRatio === "9:16" ? 360 : 420;
  const canvasH = aspectRatio === "9:16" ? 640 : 420;

  return (
    <div style={styles.container}>
      {/* Studio Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.brandRow}>
            <span style={styles.badge}>ads4now Intelligence Stack</span>
            <span style={styles.title}>AI Commercial Studio</span>
          </div>
          <p style={styles.subtitle}>
            5-scene direct-response vertical commercial with AI hooks, AIDA narration, and social proof.
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} style={styles.closeBtn}>
            ✕ Close
          </button>
        )}
      </div>

      {loading && (
        <div style={styles.loadingBox}>
          <div style={styles.spinner} />
          <p>Writing ad copy and building commercial scenes...</p>
        </div>
      )}

      {!loading && mission && (
        <div style={styles.studioGrid}>
          {/* Left: Viewport Stage */}
          <div style={styles.stageCol}>
            <div style={styles.stageNav}>
              <div style={styles.aspectButtonGroup}>
                {["9:16", "1:1"].map((ar) => (
                  <button
                    key={ar}
                    onClick={() => setAspectRatio(ar)}
                    style={{
                      ...styles.aspectBtn,
                      ...(aspectRatio === ar ? styles.aspectBtnActive : {}),
                    }}
                  >
                    {ar === "9:16" ? "9:16 Vertical (TikTok/Reels)" : "1:1 Square (Amazon/Feed)"}
                  </button>
                ))}
              </div>
              <span style={styles.sceneIndicator}>
                Scene {activeSceneIndex + 1} of {scenes.length}
              </span>
            </div>

            {/* Video Canvas Stage */}
            <div style={styles.canvasContainer}>
              <canvas
                ref={canvasRef}
                width={canvasW}
                height={canvasH}
                style={{
                  width: `${canvasW}px`,
                  height: `${canvasH}px`,
                  borderRadius: "8px",
                  display: "block",
                }}
              />
              {isRecording && (
                <div style={styles.recordBadge}>
                  <div style={styles.recordDot} />
                  <span>Recording Commercial... {recordProgress}%</span>
                </div>
              )}
            </div>

            {/* Player Controls */}
            <div style={styles.playerBar}>
              <button
                onClick={() => {
                  if (isPlaying) {
                    setIsPlaying(false);
                    if (window.speechSynthesis) window.speechSynthesis.cancel();
                  } else {
                    setIsPlaying(true);
                  }
                }}
                style={styles.playBtn}
              >
                {isPlaying ? "⏸ Pause Commercial" : "▶ Play Commercial (30s)"}
              </button>

              <button
                onClick={() => setNarrationEnabled(!narrationEnabled)}
                style={{
                  ...styles.muteBtn,
                  ...(narrationEnabled ? styles.muteBtnActive : {}),
                }}
              >
                {narrationEnabled ? "🔊 Voiceover ON" : "🔇 Voiceover MUTED"}
              </button>
            </div>

            {/* Scene Timeline Scrub Bar */}
            <div style={styles.timelineBar}>
              {scenes.map((s, idx) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setActiveSceneIndex(idx);
                    speakScene(s.narration);
                  }}
                  style={{
                    ...styles.scenePill,
                    ...(activeSceneIndex === idx ? styles.scenePillActive : {}),
                  }}
                >
                  {s.label.replace("Scene ", "S")}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Creative Director Controls */}
          <div style={styles.controlsCol}>
            {/* 1. Creative Hook Variants */}
            <div style={styles.panelBox}>
              <h4 style={styles.panelTitle}>1. Creative Hook Variants (ads4now move)</h4>
              <div style={styles.variantList}>
                {mission.variants?.map((v, idx) => (
                  <button
                    key={v.id}
                    onClick={() => setActiveVariant(idx)}
                    style={{
                      ...styles.variantCard,
                      ...(activeVariant === idx ? styles.variantCardActive : {}),
                    }}
                  >
                    <div style={styles.variantTitle}>{v.title}</div>
                    <div style={styles.variantHook}>"{v.hook}"</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Active Scene Narration */}
            <div style={styles.panelBox}>
              <h4 style={styles.panelTitle}>
                2. Narration Script ({currentScene?.label})
              </h4>
              <div style={styles.scriptBox}>
                <div style={styles.narrationLine}>"{currentScene?.narration}"</div>
                <div style={styles.sceneEffect}>
                  Visual: {mission.brief?.visual_directions?.[activeSceneIndex] || currentScene?.effect}
                </div>
              </div>
            </div>

            {/* 3. Export Actions */}
            <div style={styles.panelBox}>
              <h4 style={styles.panelTitle}>3. Export Finished Commercial</h4>
              <button
                onClick={recordCommercial}
                disabled={isRecording}
                style={styles.exportBtn}
              >
                {isRecording ? `Assembling (${recordProgress}%)...` : "🎬 Record & Download Commercial (WebM/MP4)"}
              </button>

              {recordedVideoUrl && (
                <div style={{ marginTop: "12px" }}>
                  <a
                    href={recordedVideoUrl}
                    download={`commercial-${(product.sku || "item").toLowerCase()}-${aspectRatio.replace(":", "-")}.webm`}
                    style={styles.downloadLink}
                  >
                    ⬇ Download Finished Ad Video
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    backgroundColor: "#161a22",
    borderRadius: "12px",
    border: "1px solid #2e3846",
    padding: "20px",
    marginTop: "20px",
    color: "#e6edf3",
    boxShadow: "0 8px 30px rgba(0, 0, 0, 0.5)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "1px solid #262c36",
    paddingBottom: "14px",
    marginBottom: "16px",
  },
  brandRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  badge: {
    background: "linear-gradient(135deg, #ff9900 0%, #ff5500 100%)",
    color: "#000000",
    fontWeight: "700",
    fontSize: "11px",
    padding: "3px 8px",
    borderRadius: "4px",
    textTransform: "uppercase",
  },
  title: {
    fontSize: "20px",
    fontWeight: "700",
    color: "#ffffff",
  },
  subtitle: {
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
  loadingBox: {
    padding: "40px",
    textAlign: "center",
    color: "#8a96a3",
  },
  spinner: {
    width: "32px",
    height: "32px",
    border: "3px solid #21262d",
    borderTop: "3px solid #ff9900",
    borderRadius: "50%",
    margin: "0 auto 12px auto",
    animation: "spin 1s linear infinite",
  },
  studioGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "20px",
  },
  stageCol: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    backgroundColor: "#0d1117",
    padding: "14px",
    borderRadius: "10px",
    border: "1px solid #21262d",
  },
  stageNav: {
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
    padding: "4px 8px",
    fontSize: "11px",
    fontWeight: "600",
    cursor: "pointer",
  },
  aspectBtnActive: {
    backgroundColor: "#ff9900",
    color: "#000000",
    borderColor: "#ff9900",
  },
  sceneIndicator: {
    fontSize: "12px",
    color: "#00f2fe",
    fontWeight: "600",
  },
  canvasContainer: {
    position: "relative",
    backgroundColor: "#000000",
    borderRadius: "8px",
    overflow: "hidden",
    border: "1px solid #30363d",
  },
  recordBadge: {
    position: "absolute",
    top: "12px",
    left: "12px",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    padding: "6px 12px",
    borderRadius: "20px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    border: "1px solid #ff4444",
    fontSize: "12px",
    color: "#ffffff",
  },
  recordDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: "#ff4444",
  },
  playerBar: {
    width: "100%",
    display: "flex",
    gap: "10px",
    marginTop: "12px",
  },
  playBtn: {
    flex: 1,
    backgroundColor: "#21262d",
    color: "#ffffff",
    border: "1px solid #3b4556",
    borderRadius: "6px",
    padding: "8px",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
  },
  muteBtn: {
    backgroundColor: "#1e242f",
    color: "#8a96a3",
    border: "1px solid #2e3846",
    borderRadius: "6px",
    padding: "8px 12px",
    fontSize: "11px",
    cursor: "pointer",
  },
  muteBtnActive: {
    color: "#00f2fe",
    borderColor: "#00f2fe",
  },
  timelineBar: {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: "6px",
    marginTop: "10px",
  },
  scenePill: {
    backgroundColor: "#161b22",
    color: "#8a96a3",
    border: "1px solid #2d3542",
    borderRadius: "4px",
    padding: "6px 2px",
    fontSize: "10px",
    fontWeight: "600",
    textAlign: "center",
    cursor: "pointer",
  },
  scenePillActive: {
    backgroundColor: "rgba(0, 242, 254, 0.15)",
    color: "#00f2fe",
    borderColor: "#00f2fe",
  },
  controlsCol: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  panelBox: {
    backgroundColor: "#1a1f28",
    borderRadius: "8px",
    border: "1px solid #2b3340",
    padding: "14px",
  },
  panelTitle: {
    margin: "0 0 10px 0",
    fontSize: "13px",
    fontWeight: "700",
    color: "#ffffff",
    textTransform: "uppercase",
  },
  variantList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  variantCard: {
    backgroundColor: "#12151b",
    border: "1px solid #2d3542",
    borderRadius: "6px",
    padding: "10px",
    textAlign: "left",
    cursor: "pointer",
  },
  variantCardActive: {
    borderColor: "#ff9900",
    backgroundColor: "rgba(255, 153, 0, 0.08)",
  },
  variantTitle: {
    fontSize: "12px",
    fontWeight: "700",
    color: "#ff9900",
  },
  variantHook: {
    fontSize: "13px",
    color: "#ffffff",
    marginTop: "4px",
  },
  scriptBox: {
    backgroundColor: "#12151b",
    borderRadius: "6px",
    padding: "10px",
    border: "1px solid #262c36",
  },
  narrationLine: {
    fontSize: "13px",
    color: "#cbd5e1",
    lineHeight: "1.4",
  },
  sceneEffect: {
    fontSize: "11px",
    color: "#8a96a3",
    marginTop: "6px",
  },
  exportBtn: {
    width: "100%",
    backgroundColor: "#ff9900",
    color: "#000000",
    fontWeight: "700",
    border: "none",
    borderRadius: "6px",
    padding: "10px",
    fontSize: "13px",
    cursor: "pointer",
  },
  downloadLink: {
    display: "block",
    textAlign: "center",
    backgroundColor: "#00f2fe",
    color: "#000000",
    fontWeight: "700",
    textDecoration: "none",
    padding: "8px",
    borderRadius: "6px",
    fontSize: "12px",
  },
};
