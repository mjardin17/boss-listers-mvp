import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { requireSession, authedFetch } from "../../lib/clientAuth";
import { LIVE_CONFIRM } from "../../lib/liveConfirm";

const PLATFORMS = [
  { id: "ebay", label: "eBay" },
  { id: "instagram", label: "Instagram photo post" },
  { id: "facebook", label: "Facebook Shop (Page catalog)" },
  { id: "etsy", label: "Etsy" },
];

const CONDITIONS = ["New", "Like New", "Used - Excellent", "Used - Good", "Used - Acceptable", "For Parts"];
const CATEGORIES = ["Trading Cards", "Collectibles", "Books", "Electronics", "Clothing", "Home", "Other"];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      if (!base64) reject(new Error("Failed to read image"));
      else resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

function makeSku() {
  return `SKU-${Date.now().toString(36).toUpperCase()}`;
}

export default function AddProduct() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    brand: "",
    sku: "",
    upc: "",
    price: "",
    description: "",
    materials: "",
    care_instructions: "",
    origin: "",
    quantity: 1,
    condition: "",
    category: "",
  });

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [imageAnalyzed, setImageAnalyzed] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  const [postResults, setPostResults] = useState(null);
  const [publishLive, setPublishLive] = useState(false);
  const [lastRunLive, setLastRunLive] = useState(false);
  const [savedProduct, setSavedProduct] = useState(null);

  useEffect(() => {
    if (requireSession()) setReady(true);
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setAnalyzing(true);
    setError(null);
    setImageAnalyzed(false);

    try {
      const base64 = await fileToBase64(file);
      const response = await authedFetch("/api/inventory/analyze-product-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64,
          imageMediaType: file.type || "image/jpeg",
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.ok) {
        setError(result.error || "Couldn't analyze the photo. You can still fill in the details and save.");
        return;
      }

      setFormData((prev) => ({
        ...prev,
        ...result.product,
      }));
      setImageAnalyzed(true);
    } catch (err) {
      setError((err.message || "Couldn't analyze the photo") + ". You can still fill in the details and save.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const togglePlatform = (id) => {
    setSelectedPlatforms((current) =>
      current.includes(id) ? current.filter((platform) => platform !== id) : [...current, id]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const live = publishLive && selectedPlatforms.length > 0;
    if (live && !window.confirm(`Save and publish this item LIVE to ${selectedPlatforms.join(", ")}? Buyers will see it and it can sell.`)) {
      return;
    }
    setLastRunLive(live);
    setSaving(true);
    setError(null);
    setPostResults(null);

    try {
      const price = Number(formData.price);
      const sku = (formData.sku || "").trim() || makeSku();
      if (!formData.title || !Number.isFinite(price) || price < 0) {
        throw new Error("Title and a price of 0 or more are required");
      }

      const payload = {
        sku,
        title: formData.title,
        description: formData.description,
        price,
        quantity: Number.parseInt(formData.quantity, 10) || 0,
        condition: formData.condition || null,
        category: formData.category || null,
      };

      if (imageFile) {
        payload.imageBase64 = await fileToBase64(imageFile);
        payload.imageMediaType = imageFile.type || "image/jpeg";
        payload.imageFilename = imageFile.name || "product.jpg";
      }

      const response = await authedFetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) {
        if (response.status === 503) {
          throw new Error("Inventory isn't connected yet. Supabase isn't configured in this environment.");
        }
        throw new Error(body.error || "Failed to save product");
      }

      const product = body.product || { sku };
      setSavedProduct(product);
      setFormData((prev) => ({ ...prev, sku }));

      if (selectedPlatforms.length) {
        const postRes = await authedFetch("/api/inventory/post-to-platforms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productSKU: sku,
            platforms: selectedPlatforms,
            ...(live ? { confirmLive: LIVE_CONFIRM } : {}),
          }),
        });
        const postBody = await postRes.json().catch(() => ({}));
        if (!postRes.ok || !postBody.ok) {
          setError(postBody.error || "Saved to inventory, but posting failed.");
          setPostResults(postBody.results || null);
        } else {
          // Stay on the page so the seller sees what happened (preview or live).
          setPostResults(postBody.results || null);
        }
      } else {
        router.push("/inventory");
        return;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!ready) return null;

  const fieldStyle = { width: "100%", padding: "8px", marginTop: 4, background: "var(--surface-2, #1f2430)", color: "inherit", border: "1px solid var(--border, #2a3142)", borderRadius: 6 };

  return (
    <div className="app-shell" style={{ maxWidth: 800 }}>
      <header className="topbar">
        <div>
          <p className="eyebrow">Boss Listers</p>
          <h1>Add product</h1>
        </div>
        <nav>
          <Link className="nav-link" href="/inventory">Inventory</Link>
          <Link className="nav-link" href="/post">Post an item</Link>
          <Link className="nav-link" href="/card-scan">Scan a card</Link>
        </nav>
      </header>

      <div className="panel" style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>Step 1: Photo (optional)</h3>
        <p className="panel-sub">Take a picture of the product or label. AI will try to fill the form, but you can skip this and enter details yourself.</p>
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          disabled={analyzing || saving}
          style={{ padding: 10, border: "2px solid var(--border, #2a3142)", borderRadius: 5, width: "100%" }}
        />
        {imagePreview && (
          <img src={imagePreview} alt="Selected product" style={{ marginTop: 12, maxHeight: 220, borderRadius: 8, objectFit: "contain" }} />
        )}
        {analyzing && <p>Analyzing image with AI…</p>}
        {imageAnalyzed && <p style={{ color: "var(--accent-strong, #34d399)" }}>Product info extracted. Review and edit below.</p>}
      </div>

      {error && <p style={{ color: "var(--danger, #f87171)" }}>{error}</p>}

      {savedProduct && (
        <p style={{ color: "var(--accent-strong, #34d399)" }}>
          Saved {savedProduct.title || savedProduct.sku} to inventory.{" "}
          <Link href="/inventory">View inventory</Link>
          {savedProduct.sku && (
            <>
              {" · "}
              <Link href={`/post?sku=${encodeURIComponent(savedProduct.sku)}`}>Post this item</Link>
            </>
          )}
        </p>
      )}

      <form onSubmit={handleSubmit} className="panel">
        <h3 style={{ marginTop: 0 }}>Step 2: Review & edit details</h3>

        <div style={{ marginBottom: 15 }}>
          <label>Product Title *</label>
          <input type="text" name="title" value={formData.title} onChange={handleChange} required style={fieldStyle} />
        </div>

        <div style={{ marginBottom: 15 }}>
          <label>SKU / Product Code</label>
          <input type="text" name="sku" value={formData.sku} onChange={handleChange} placeholder="Generated if left blank" style={fieldStyle} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15, marginBottom: 15 }}>
          <div>
            <label>Price *</label>
            <input type="number" name="price" value={formData.price} onChange={handleChange} step="0.01" min="0" required style={fieldStyle} />
          </div>
          <div>
            <label>Quantity in stock</label>
            <input type="number" name="quantity" value={formData.quantity} onChange={handleChange} min="0" style={fieldStyle} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15, marginBottom: 15 }}>
          <div>
            <label>Condition</label>
            <select name="condition" value={formData.condition} onChange={handleChange} style={fieldStyle}>
              <option value="">Select condition</option>
              {CONDITIONS.map((condition) => (
                <option key={condition} value={condition}>{condition}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Category</label>
            <input type="text" name="category" value={formData.category} onChange={handleChange} list="product-categories" style={fieldStyle} />
            <datalist id="product-categories">
              {CATEGORIES.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </div>
        </div>

        <div style={{ marginBottom: 15 }}>
          <label>Description</label>
          <textarea name="description" value={formData.description} onChange={handleChange} rows={3} style={fieldStyle} />
        </div>

        <div style={{ marginBottom: 15 }}>
          <label>Materials</label>
          <input type="text" name="materials" value={formData.materials} onChange={handleChange} style={fieldStyle} />
        </div>

        <div style={{ marginBottom: 15 }}>
          <label>Care Instructions</label>
          <textarea name="care_instructions" value={formData.care_instructions} onChange={handleChange} rows={2} style={fieldStyle} />
        </div>

        <div style={{ marginBottom: 30 }}>
          <h4>Step 3: Post after saving (optional)</h4>
          <p className="panel-sub">Leave these unchecked to only save to inventory. You can post later from the inventory list.</p>
          {PLATFORMS.map((platform) => (
            <label key={platform.id} style={{ display: "block", marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={selectedPlatforms.includes(platform.id)}
                onChange={() => togglePlatform(platform.id)}
              />{" "}
              {platform.label}
            </label>
          ))}
          {selectedPlatforms.length > 0 && (
            <label style={{ display: "block", marginTop: 14, padding: 10, border: "1px solid #DC2626", borderRadius: 6 }}>
              <input type="checkbox" checked={publishLive} onChange={(e) => setPublishLive(e.target.checked)} />{" "}
              <strong>Publish live</strong> (unchecked = preview only, nothing is posted). You&apos;ll be asked to confirm.
            </label>
          )}
        </div>

        <button
          type="submit"
          disabled={saving || analyzing}
          style={{
            padding: "12px 30px",
            fontSize: 16,
            backgroundColor: "#0070f3",
            color: "white",
            border: "none",
            borderRadius: 5,
            cursor: saving || analyzing ? "not-allowed" : "pointer",
          }}
        >
          {saving
            ? selectedPlatforms.length
              ? "Saving & posting…"
              : "Saving…"
            : selectedPlatforms.length
              ? publishLive
                ? `Save & publish live to ${selectedPlatforms.length} platform${selectedPlatforms.length === 1 ? "" : "s"}`
                : `Save & preview on ${selectedPlatforms.length} platform${selectedPlatforms.length === 1 ? "" : "s"}`
              : "Save to inventory"}
        </button>
      </form>

      {postResults && (
        <section className="panel" style={{ marginTop: 24 }}>
          <h3 style={{ marginTop: 0 }}>{lastRunLive ? "Live posting results" : "Preview results (nothing was posted)"}</h3>
          {Object.entries(postResults).map(([platform, result]) => (
            <div key={platform} style={{ marginBottom: 8 }}>
              <strong>{platform}:</strong>{" "}
              {result.success ? `Posted${result.listingId ? ` — ${result.listingId}` : ""}` : (result.error || result.note || "Not posted")}
            </div>
          ))}
          <p style={{ marginBottom: 0 }}>
            Saved to inventory. <Link href="/inventory">Back to inventory</Link>
            {savedProduct?.sku ? <> · <Link href={`/post?sku=${encodeURIComponent(savedProduct.sku)}`}>Post this item</Link></> : null}
          </p>
        </section>
      )}
    </div>
  );
}
