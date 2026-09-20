import { useState } from "react";
import { useRouter } from "next/router";

export default function AddProduct() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    title: "",
    brand: "",
    sku: "",
    upc: "",
    price: "",
    description: "",
    materials: "",
    care_instructions: "",
    sizes: {},
    origin: "",
    features: [],
    quantity_per_package: "",
    quantity: 1,
  });

  const [imageFile, setImageFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [imageAnalyzed, setImageAnalyzed] = useState(false);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageFile(file);
    setLoading(true);
    setError(null);

    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result?.split(",")[1];
        if (!base64) {
          setError("Failed to read image");
          setLoading(false);
          return;
        }

        // Send to API for analysis
        const response = await fetch("/api/inventory/analyze-product-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: base64,
            imageMediaType: file.type || "image/jpeg",
          }),
        });

        const result = await response.json();

        if (!result.ok) {
          setError(result.error || "Failed to analyze image");
          setLoading(false);
          return;
        }

        // Auto-fill form with extracted data
        setFormData((prev) => ({
          ...prev,
          ...result.product,
        }));
        setImageAnalyzed(true);
        setLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/inventory/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error("Failed to save product");
      }

      // Redirect to products list or confirm page
      router.push("/inventory");
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "20px" }}>
      <h1>📸 Add Product</h1>

      <div style={{ marginBottom: "30px" }}>
        <h3>Step 1: Take a Picture of the Product Label</h3>
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          disabled={loading}
          style={{
            padding: "10px",
            border: "2px solid #ccc",
            borderRadius: "5px",
            width: "100%",
          }}
        />
        {loading && <p>🤖 Analyzing image with AI...</p>}
        {imageAnalyzed && (
          <p style={{ color: "green" }}>✓ Product info extracted!</p>
        )}
        {error && <p style={{ color: "red" }}>Error: {error}</p>}
      </div>

      {imageAnalyzed && (
        <form onSubmit={handleSubmit}>
          <h3>Step 2: Review & Edit Details</h3>

          <div style={{ marginBottom: "15px" }}>
            <label>Product Title *</label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
              style={{ width: "100%", padding: "8px" }}
            />
          </div>

          <div style={{ marginBottom: "15px" }}>
            <label>SKU/Product Code</label>
            <input
              type="text"
              name="sku"
              value={formData.sku}
              onChange={handleChange}
              style={{ width: "100%", padding: "8px" }}
            />
          </div>

          <div style={{ marginBottom: "15px" }}>
            <label>Price</label>
            <input
              type="number"
              name="price"
              value={formData.price}
              onChange={handleChange}
              step="0.01"
              style={{ width: "100%", padding: "8px" }}
            />
          </div>

          <div style={{ marginBottom: "15px" }}>
            <label>Quantity in Stock</label>
            <input
              type="number"
              name="quantity"
              value={formData.quantity}
              onChange={handleChange}
              min="0"
              style={{ width: "100%", padding: "8px" }}
            />
          </div>

          <div style={{ marginBottom: "15px" }}>
            <label>Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={3}
              style={{ width: "100%", padding: "8px" }}
            />
          </div>

          <div style={{ marginBottom: "15px" }}>
            <label>Materials</label>
            <input
              type="text"
              name="materials"
              value={formData.materials}
              onChange={handleChange}
              style={{ width: "100%", padding: "8px" }}
            />
          </div>

          <div style={{ marginBottom: "15px" }}>
            <label>Care Instructions</label>
            <textarea
              name="care_instructions"
              value={formData.care_instructions}
              onChange={handleChange}
              rows={2}
              style={{ width: "100%", padding: "8px" }}
            />
          </div>

          <div style={{ marginBottom: "30px" }}>
            <h4>Step 3: Choose Platforms to Push To</h4>
            <label style={{ display: "block", marginBottom: "10px" }}>
              <input type="checkbox" defaultChecked /> Shopify (Your Store)
            </label>
            <label style={{ display: "block", marginBottom: "10px" }}>
              <input type="checkbox" defaultChecked /> Instagram Shop
            </label>
            <label style={{ display: "block", marginBottom: "10px" }}>
              <input type="checkbox" defaultChecked /> Facebook Marketplace
            </label>
            <label style={{ display: "block", marginBottom: "10px" }}>
              <input type="checkbox" /> eBay
            </label>
            <label style={{ display: "block", marginBottom: "10px" }}>
              <input type="checkbox" /> Etsy
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "12px 30px",
              fontSize: "16px",
              backgroundColor: "#0070f3",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Saving..." : "🚀 Save & Push to Platforms"}
          </button>
        </form>
      )}
    </div>
  );
}
