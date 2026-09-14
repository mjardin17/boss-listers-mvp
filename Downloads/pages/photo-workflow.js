"use client";

import { useState, useRef } from "react";
import styles from "../styles/photo-workflow.module.css";

export default function PhotoWorkflow() {
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [generatingCommercial, setGeneratingCommercial] = useState(false);
  const [commercial, setCommercial] = useState(null);
  const [posting, setPosting] = useState(false);
  const [postResults, setPostResults] = useState(null);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef(null);

  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhoto(file);
      const reader = new FileReader();
      reader.onload = (evt) => {
        setPhotoPreview(evt.target?.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = async () => {
    if (!photo) return;

    setAnalyzing(true);
    setMessage("");

    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const base64 = evt.target?.result?.split(",")[1];
        const response = await fetch("/api/photo/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: base64,
            mimeType: photo.type,
          }),
        });

        const data = await response.json();
        if (data.success) {
          setAnalysis(data.analysis);
          setMessage(`✓ Photo analyzed: ${data.analysis.title}`);
        } else {
          setMessage(`✗ Analysis failed: ${data.error}`);
        }
      };
      reader.readAsDataURL(photo);
    } catch (error) {
      setMessage(`✗ Error: ${error.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleGenerateCommercial = async () => {
    if (!analysis) return;

    setGeneratingCommercial(true);
    setMessage("");

    try {
      const response = await fetch("/api/commercial/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: analysis.title,
          description: analysis.description,
          features: analysis.features,
          priceRange: analysis.priceRange,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setCommercial(data.commercial);
        setMessage("✓ Commercial script generated");
      } else {
        setMessage(`✗ Generation failed: ${data.error}`);
      }
    } catch (error) {
      setMessage(`✗ Error: ${error.message}`);
    } finally {
      setGeneratingCommercial(false);
    }
  };

  const handleCrosspost = async () => {
    if (!analysis || !commercial) return;

    setPosting(true);
    setMessage("");

    try {
      const response = await fetch("/api/social/crosspost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption: commercial.voiceover,
          imageUrl: photoPreview,
          hashtags: commercial.hashtags || [],
          platforms: ["instagram", "facebook", "tiktok"],
        }),
      });

      const data = await response.json();
      if (data.success) {
        setPostResults(data);
        setMessage(
          `✓ Posted to ${data.succeeded}/${data.total} platforms`
        );
      } else {
        setMessage(`✗ Posting failed: ${data.error}`);
      }
    } catch (error) {
      setMessage(`✗ Error: ${error.message}`);
    } finally {
      setPosting(false);
    }
  };

  const step = !photo ? 1 : !analysis ? 2 : !commercial ? 3 : !postResults ? 4 : 5;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>📸 Photo to Social Workflow</h1>
        <p>Turn one photo into listings and social posts across all platforms</p>
      </header>

      {message && (
        <div className={`${styles.message} ${message.startsWith("✓") ? styles.success : styles.error}`}>
          {message}
        </div>
      )}

      {/* Step 1: Upload Photo */}
      <div className={styles.step}>
        <h2>Step 1: Upload Photo</h2>
        <div className={styles.photoUpload}>
          {photoPreview ? (
            <img src={photoPreview} alt="Selected" className={styles.preview} />
          ) : (
            <div
              className={styles.uploadArea}
              onClick={() => fileInputRef.current?.click()}
            >
              <span>📷 Click to upload or drag & drop</span>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoSelect}
            style={{ display: "none" }}
          />
        </div>
        {photo && <p className={styles.filename}>{photo.name}</p>}
      </div>

      {/* Step 2: Analyze */}
      {photo && (
        <div className={styles.step}>
          <h2>Step 2: Analyze with AI</h2>
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className={styles.btn}
          >
            {analyzing ? "Analyzing..." : "🤖 Analyze Photo"}
          </button>
          {analysis && (
            <div className={styles.analysisResult}>
              <h3>{analysis.title}</h3>
              <p><strong>Category:</strong> {analysis.category}</p>
              <p><strong>Condition:</strong> {analysis.condition}</p>
              <p><strong>Price:</strong> ${analysis.priceRange.min} - ${analysis.priceRange.max}</p>
              <p><strong>Features:</strong> {analysis.features.join(", ")}</p>
              <p><strong>Platforms:</strong> {analysis.platforms.join(", ")}</p>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Generate Commercial */}
      {analysis && (
        <div className={styles.step}>
          <h2>Step 3: Generate Commercial Script</h2>
          <button
            onClick={handleGenerateCommercial}
            disabled={generatingCommercial}
            className={styles.btn}
          >
            {generatingCommercial ? "Generating..." : "🎬 Generate Script"}
          </button>
          {commercial && (
            <div className={styles.commercialResult}>
              <h3>Voiceover</h3>
              <p>{commercial.voiceover}</p>
              <h3>Scenes</h3>
              <ul>
                {commercial.scenes?.map((scene, i) => (
                  <li key={i}>
                    <strong>{scene.time}:</strong> {scene.visual}
                  </li>
                ))}
              </ul>
              <h3>Hashtags</h3>
              <p>{commercial.hashtags?.join(" ")}</p>
              <h3>Call to Action</h3>
              <p>{commercial.callToAction}</p>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Crosspost */}
      {commercial && (
        <div className={styles.step}>
          <h2>Step 4: Crosspost to Social Media</h2>
          <button
            onClick={handleCrosspost}
            disabled={posting}
            className={styles.btn}
          >
            {posting ? "Posting..." : "📤 Post to All Platforms"}
          </button>
          {postResults && (
            <div className={styles.postResults}>
              <h3>Posting Results</h3>
              <p>✓ Successfully posted to {postResults.succeeded}/{postResults.total} platforms</p>
              {postResults.results?.map((result, i) => (
                <div key={i} className={styles.platformResult}>
                  <span>{result.platform}</span>
                  <span>{result.success ? "✓" : "✗"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 5: Done */}
      {postResults && (
        <div className={`${styles.step} ${styles.success}`}>
          <h2>✓ All Done!</h2>
          <p>Your photo has been:</p>
          <ul>
            <li>✓ Analyzed for product details</li>
            <li>✓ Listed on marketplaces (eBay, Etsy)</li>
            <li>✓ Commercial script generated</li>
            <li>✓ Posted to {postResults.succeeded} social platforms</li>
          </ul>
          <button
            onClick={() => {
              setPhoto(null);
              setPhotoPreview(null);
              setAnalysis(null);
              setCommercial(null);
              setPostResults(null);
              setMessage("");
            }}
            className={styles.btn}
          >
            📸 Upload Another Photo
          </button>
        </div>
      )}
    </div>
  );
}
