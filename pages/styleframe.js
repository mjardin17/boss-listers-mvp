import React, { useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import StyleFrameStudio from "../components/StyleFrameStudio";

export default function StyleFramePage() {
  const router = useRouter();
  const initialImage = router.query.image || "/cutouts/wc-shorts-cutout.png";
  const [activeImage, setActiveImage] = useState(initialImage);
  const [customFile, setCustomFile] = useState(null);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setActiveImage(event.target.result);
        setCustomFile(file.name);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div style={styles.container}>
      <Head>
        <title>StyleFrame Studio 3D — BossListers</title>
        <meta
          name="description"
          content="StyleFrame AI motion turntable and studio lighting studio for BossListers"
        />
      </Head>

      <div style={styles.pageCard}>
        {/* Navigation Bar */}
        <div style={styles.navRow}>
          <div style={styles.logoGroup}>
            <span style={styles.logoBadge}>BossListers</span>
            <span style={styles.pageTitle}>StyleFrame 3D Studio</span>
          </div>

          <div style={styles.navLinks}>
            <Link href="/omni-lister" style={styles.navLink}>
              ← Back to Omni-Lister
            </Link>
            <Link href="/inventory" style={styles.navLink}>
              📦 Inventory
            </Link>
          </div>
        </div>

        {/* Quick Image Picker Bar */}
        <div style={styles.imageSelectorBar}>
          <div style={styles.selectorLeft}>
            <span style={styles.selectorLabel}>Active Cutout:</span>
            <span style={styles.activeAssetBadge}>
              {customFile || activeImage.split("/").pop()}
            </span>
          </div>

          <div style={styles.selectorActions}>
            <button
              onClick={() => setActiveImage("/cutouts/wc-shorts-cutout.png")}
              style={{
                ...styles.sampleBtn,
                ...(activeImage === "/cutouts/wc-shorts-cutout.png"
                  ? styles.sampleBtnActive
                  : {}),
              }}
            >
              White Castle Shorts Cutout
            </button>

            <label style={styles.uploadBtn}>
              📁 Load Another Cutout PNG
              <input
                type="file"
                accept="image/png,image/webp"
                onChange={handleFileUpload}
                style={{ display: "none" }}
              />
            </label>
          </div>
        </div>

        {/* Interactive Studio Component */}
        <StyleFrameStudio
          imageUrl={activeImage}
          productTitle="White Castle Shorts"
          sku="WC-SHORTS-001"
          onApplyStyleframe={(data) => {
            alert(
              `StyleFrame data saved! ${
                data.videoUrl ? "Turntable video attached. " : ""
              }${data.keyframes ? `${data.keyframes.length} keyframes saved.` : ""}`
            );
          }}
        />
      </div>
    </div>
  );
}

const styles = {
  container: {
    backgroundColor: "#0d1117",
    minHeight: "100vh",
    padding: "24px 16px",
    display: "flex",
    justifyContent: "center",
  },
  pageCard: {
    width: "100%",
    maxWidth: "1100px",
  },
  navRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
    borderBottom: "1px solid #21262d",
    paddingBottom: "12px",
  },
  logoGroup: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  logoBadge: {
    background: "linear-gradient(135deg, #ff9900 0%, #ff5500 100%)",
    color: "#000000",
    fontWeight: "800",
    fontSize: "12px",
    padding: "4px 8px",
    borderRadius: "4px",
    letterSpacing: "0.5px",
  },
  pageTitle: {
    color: "#ffffff",
    fontSize: "18px",
    fontWeight: "700",
  },
  navLinks: {
    display: "flex",
    gap: "12px",
  },
  navLink: {
    color: "#8a96a3",
    textDecoration: "none",
    fontSize: "13px",
    fontWeight: "600",
    padding: "6px 10px",
    borderRadius: "6px",
    backgroundColor: "#161b22",
    border: "1px solid #30363d",
  },
  imageSelectorBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#161b22",
    padding: "10px 14px",
    borderRadius: "8px",
    border: "1px solid #30363d",
    marginBottom: "14px",
  },
  selectorLeft: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  selectorLabel: {
    color: "#8a96a3",
    fontSize: "13px",
  },
  activeAssetBadge: {
    color: "#00f2fe",
    fontWeight: "600",
    fontSize: "13px",
    backgroundColor: "rgba(0, 242, 254, 0.1)",
    padding: "2px 8px",
    borderRadius: "4px",
    border: "1px solid rgba(0, 242, 254, 0.2)",
  },
  selectorActions: {
    display: "flex",
    gap: "10px",
  },
  sampleBtn: {
    backgroundColor: "#21262d",
    color: "#c9d1d9",
    border: "1px solid #30363d",
    borderRadius: "6px",
    padding: "6px 12px",
    fontSize: "12px",
    cursor: "pointer",
  },
  sampleBtnActive: {
    backgroundColor: "rgba(255, 153, 0, 0.15)",
    color: "#ff9900",
    borderColor: "#ff9900",
  },
  uploadBtn: {
    backgroundColor: "#21262d",
    color: "#00f2fe",
    border: "1px solid #30363d",
    borderRadius: "6px",
    padding: "6px 12px",
    fontSize: "12px",
    cursor: "pointer",
    display: "inline-block",
  },
};
