import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { requireSession, authedFetch } from "../../lib/clientAuth";

const CONDITIONS = ["new", "used", "refurbished"];

function ErrorAlert({ message }) {
  if (!message) return null;
  return (
    <div style={{
      background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8,
      padding: 12, marginBottom: 16, color: "#991b1b", fontSize: 14,
    }}>
      <strong>Error:</strong> {message}
    </div>
  );
}

function SuccessAlert({ message, listingUrl }) {
  if (!message) return null;
  return (
    <div style={{
      background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8,
      padding: 12, marginBottom: 16, color: "#166534", fontSize: 14,
    }}>
      <strong>Success!</strong> {message}
      {listingUrl && (
        <>
          {" "}
          <a href={listingUrl} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>
            View listing ↗
          </a>
        </>
      )}
    </div>
  );
}

function LoadingSpinner({ text = "Loading..." }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#4b5563", fontSize: 14 }}>
      <div style={{
        width: 16, height: 16, border: "2px solid #e5e7eb", borderTopColor: "#3b82f6",
        borderRadius: "50%", animation: "spin 0.6s linear infinite",
      }} />
      {text}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function FormField({ label, name, value, onChange, type = "text", required = false, placeholder = "", disabled = false, error = "" }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", marginBottom: 6, fontWeight: 500, fontSize: 14 }}>
        {label}
        {required && <span style={{ color: "#dc2626" }}>*</span>}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        style={{
          width: "100%", padding: "8px 12px", border: `1px solid ${error ? "#dc2626" : "#e5e7eb"}`,
          borderRadius: 6, fontSize: 14, fontFamily: "inherit",
          background: disabled ? "#f9fafb" : "#fff",
          color: disabled ? "#6b7280" : "#000",
        }}
      />
      {error && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

function SelectField({ label, name, value, onChange, options, required = false, error = "" }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", marginBottom: 6, fontWeight: 500, fontSize: 14 }}>
        {label}
        {required && <span style={{ color: "#dc2626" }}>*</span>}
      </label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        style={{
          width: "100%", padding: "8px 12px", border: `1px solid ${error ? "#dc2626" : "#e5e7eb"}`,
          borderRadius: 6, fontSize: 14, fontFamily: "inherit", background: "#fff",
        }}
      >
        <option value="">— Select {label.toLowerCase()} —</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt.charAt(0).toUpperCase() + opt.slice(1)}
          </option>
        ))}
      </select>
      {error && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

function TextAreaField({ label, name, value, onChange, required = false, placeholder = "", error = "" }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", marginBottom: 6, fontWeight: 500, fontSize: 14 }}>
        {label}
        {required && <span style={{ color: "#dc2626" }}>*</span>}
      </label>
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        rows={6}
        style={{
          width: "100%", padding: "8px 12px", border: `1px solid ${error ? "#dc2626" : "#e5e7eb"}`,
          borderRadius: 6, fontSize: 14, fontFamily: "inherit", resize: "vertical",
        }}
      />
      {error && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

export default function CreateListingPage() {
  const [isReady, setIsReady] = useState(false);

  // Inventory lookup
  const [sku, setSku] = useState("");
  const [skuError, setSkuError] = useState("");
  const [skuLookupLoading, setSkuLookupLoading] = useState(false);
  const [lookupData, setLookupData] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    price: "",
    quantity: "",
    condition: "",
    category: "",
    imageUrls: "",
  });
  const [formErrors, setFormErrors] = useState({});

  // Category suggestions
  const [categorySuggestions, setCategorySuggestions] = useState([]);
  const [categorySearching, setCategorySearching] = useState(false);

  // Submission
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [listingUrl, setListingUrl] = useState("");

  // Required policies (would come from backend in production)
  const [policies, setPolicies] = useState({
    fulfillment_policy_id: "",
    payment_policy_id: "",
    return_policy_id: "",
    merchant_location_key: "",
  });

  useEffect(() => {
    if (!requireSession()) return;
    setIsReady(true);
  }, []);

  const lookupSku = useCallback(async () => {
    if (!sku.trim()) {
      setSkuError("Please enter a SKU");
      return;
    }
    setSkuError("");
    setSkuLookupLoading(true);
    try {
      const res = await authedFetch(`/api/products/${encodeURIComponent(sku.trim())}`);
      const data = await res.json();
      if (!data.ok) {
        setSkuError(data.error || "SKU not found");
        setLookupData(null);
        return;
      }
      setLookupData(data.product);
      // Pre-fill form with looked-up data
      setFormData((prev) => ({
        ...prev,
        title: data.product.title || "",
        description: data.product.description || "",
        price: data.product.price || "",
        quantity: data.product.quantity || 1,
        condition: data.product.condition || "",
      }));
      setSkuError("");
    } catch (err) {
      setSkuError(err.message);
      setLookupData(null);
    } finally {
      setSkuLookupLoading(false);
    }
  }, [sku]);

  const handleFormChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const suggestCategory = useCallback(async () => {
    if (!formData.title.trim()) {
      setFormErrors((prev) => ({ ...prev, title: "Title is required to suggest category" }));
      return;
    }
    setCategorySearching(true);
    try {
      const res = await fetch(
        `/api/channels/ebay/category-suggest?q=${encodeURIComponent(formData.title.trim())}`
      );
      const data = await res.json();
      if (data.ok) {
        setCategorySuggestions(data.suggestions || []);
        if (data.best) {
          handleFormChange("category", data.best.categoryId);
        }
      }
    } catch (err) {
      console.error("Category suggestion failed:", err);
    } finally {
      setCategorySearching(false);
    }
  }, [formData.title]);

  const validateForm = () => {
    const errors = {};
    if (!formData.title.trim()) errors.title = "Title is required";
    if (!formData.description.trim()) errors.description = "Description is required";
    if (!formData.price || parseFloat(formData.price) <= 0) errors.price = "Valid price is required";
    if (!formData.quantity || parseInt(formData.quantity) < 1) errors.quantity = "Quantity must be at least 1";
    if (!formData.condition) errors.condition = "Condition is required";
    if (!formData.category) errors.category = "Category is required";
    if (!policies.fulfillment_policy_id) errors.policies = "Fulfillment policy must be configured";
    if (!policies.payment_policy_id) errors.policies = "Payment policy must be configured";
    if (!policies.return_policy_id) errors.policies = "Return policy must be configured";
    if (!policies.merchant_location_key) errors.policies = "Merchant location must be configured";
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");
    setSubmitSuccess("");
    setListingUrl("");

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const imageUrls = formData.imageUrls
        .split("\n")
        .map((url) => url.trim())
        .filter(Boolean);

      const product = {
        sku: sku.trim(),
        title: formData.title.trim(),
        description: formData.description.trim(),
        price: parseFloat(formData.price),
        quantity: parseInt(formData.quantity),
        condition: formData.condition,
        category_id: formData.category,
        image_urls: imageUrls,
        marketplace_id: "EBAY_US",
        currency: "USD",
        aspects: {},
      };

      const res = await authedFetch("/api/channels/ebay/create-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product,
          policies,
          dryRun: false,
          confirm: "PUBLISH_LIVE",
        }),
      });

      const result = await res.json();
      if (!result.ok) {
        setSubmitError(result.error || "Failed to create listing");
        return;
      }

      setSubmitSuccess(`Listing created successfully! SKU: ${result.sku}`);
      if (result.listing_id) {
        setListingUrl(`https://www.ebay.com/itm/${result.listing_id}`);
      }

      // Reset form
      setSku("");
      setFormData({
        title: "",
        description: "",
        price: "",
        quantity: "",
        condition: "",
        category: "",
        imageUrls: "",
      });
      setLookupData(null);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isReady) return null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Boss Listers</p>
          <h1>Create eBay Listing</h1>
        </div>
        <nav>
          <Link className="nav-link" href="/channels">Channels</Link>
          <Link className="nav-link" href="/">Stager</Link>
          <Link className="nav-link" href="/history">History</Link>
        </nav>
      </header>

      <section style={{ maxWidth: 800 }}>
        <p style={{ fontSize: 14, color: "#4b5563", marginBottom: 24 }}>
          Create a new eBay listing from your inventory. Start with a SKU to auto-fill product details,
          or enter them manually. All required fields must be filled before publishing.
        </p>

        <ErrorAlert message={submitError} />
        <SuccessAlert message={submitSuccess} listingUrl={listingUrl} />

        {formErrors.policies && <ErrorAlert message={formErrors.policies} />}

        <form onSubmit={handleSubmit} style={{ background: "#fff", padding: 24, borderRadius: 8, border: "1px solid #e5e7eb" }}>
          {/* SKU Lookup Section */}
          <div style={{ marginBottom: 32, paddingBottom: 32, borderBottom: "1px solid #e5e7eb" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 600 }}>1. Lookup Product</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "flex-end" }}>
              <FormField
                label="SKU (optional)"
                name="sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="E.g., SKU-123-456"
                error={skuError}
              />
              <button
                type="button"
                onClick={lookupSku}
                disabled={skuLookupLoading || !sku.trim()}
                style={{
                  padding: "8px 16px", background: "#3b82f6", color: "#fff", border: "none",
                  borderRadius: 6, cursor: "pointer", fontSize: 14, fontWeight: 500,
                  opacity: skuLookupLoading || !sku.trim() ? 0.5 : 1,
                }}
              >
                {skuLookupLoading ? "Searching..." : "Lookup"}
              </button>
            </div>
            {lookupData && (
              <div style={{
                marginTop: 16, padding: 12, background: "#f0fdf4", border: "1px solid #86efac",
                borderRadius: 6, fontSize: 14, color: "#166534",
              }}>
                ✓ Found: {lookupData.title} (Qty: {lookupData.quantity})
              </div>
            )}
          </div>

          {/* Product Details Section */}
          <div style={{ marginBottom: 32, paddingBottom: 32, borderBottom: "1px solid #e5e7eb" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 600 }}>2. Product Details</h3>
            <FormField
              label="Title"
              name="title"
              value={formData.title}
              onChange={(e) => handleFormChange("title", e.target.value)}
              required
              placeholder="E.g., Vintage leather wallet"
              error={formErrors.title}
            />
            <TextAreaField
              label="Description"
              name="description"
              value={formData.description}
              onChange={(e) => handleFormChange("description", e.target.value)}
              required
              placeholder="Detailed product description, condition, features, etc."
              error={formErrors.description}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <FormField
                label="Price"
                name="price"
                value={formData.price}
                onChange={(e) => handleFormChange("price", e.target.value)}
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                error={formErrors.price}
              />
              <FormField
                label="Quantity"
                name="quantity"
                value={formData.quantity}
                onChange={(e) => handleFormChange("quantity", e.target.value)}
                type="number"
                min="1"
                required
                placeholder="1"
                error={formErrors.quantity}
              />
            </div>
          </div>

          {/* Classification Section */}
          <div style={{ marginBottom: 32, paddingBottom: 32, borderBottom: "1px solid #e5e7eb" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 600 }}>3. Classification</h3>
            <SelectField
              label="Condition"
              name="condition"
              value={formData.condition}
              onChange={(e) => handleFormChange("condition", e.target.value)}
              options={CONDITIONS}
              required
              error={formErrors.condition}
            />
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={{ fontWeight: 500, fontSize: 14 }}>
                  Category
                  <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <button
                  type="button"
                  onClick={suggestCategory}
                  disabled={categorySearching || !formData.title.trim()}
                  style={{
                    fontSize: 12, color: "#3b82f6", background: "none", border: "none",
                    cursor: "pointer", textDecoration: "underline",
                    opacity: categorySearching || !formData.title.trim() ? 0.5 : 1,
                  }}
                >
                  {categorySearching ? "Searching..." : "Suggest"}
                </button>
              </div>
              <input
                type="text"
                value={formData.category}
                readOnly
                placeholder="Select a category ID or use Suggest button"
                style={{
                  width: "100%", padding: "8px 12px", border: `1px solid ${formErrors.category ? "#dc2626" : "#e5e7eb"}`,
                  borderRadius: 6, fontSize: 14, background: "#f9fafb", color: "#6b7280",
                }}
              />
              {categorySuggestions.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 13 }}>
                  <div style={{ fontWeight: 500, marginBottom: 4, color: "#4b5563" }}>Suggestions:</div>
                  {categorySuggestions.slice(0, 5).map((cat) => (
                    <button
                      key={cat.categoryId}
                      type="button"
                      onClick={() => handleFormChange("category", cat.categoryId)}
                      style={{
                        display: "block", width: "100%", textAlign: "left", padding: "6px 8px",
                        background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 4,
                        fontSize: 13, cursor: "pointer", marginBottom: 4, fontFamily: "inherit",
                      }}
                    >
                      {cat.categoryName} <span style={{ fontSize: 11, color: "#6b7280" }}>({cat.categoryId})</span>
                    </button>
                  ))}
                </div>
              )}
              {formErrors.category && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 4 }}>{formErrors.category}</div>}
            </div>
          </div>

          {/* Images Section */}
          <div style={{ marginBottom: 32, paddingBottom: 32, borderBottom: "1px solid #e5e7eb" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 600 }}>4. Images</h3>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 500, fontSize: 14 }}>Image URLs</label>
            <textarea
              value={formData.imageUrls}
              onChange={(e) => handleFormChange("imageUrls", e.target.value)}
              placeholder="One URL per line. E.g.&#10;https://example.com/image1.jpg&#10;https://example.com/image2.jpg"
              rows={4}
              style={{
                width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb",
                borderRadius: 6, fontSize: 14, fontFamily: "inherit", resize: "vertical",
              }}
            />
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
              Enter image URLs one per line. eBay supports up to 12 images.
            </p>
          </div>

          {/* Policies Notice */}
          <div style={{
            marginBottom: 24, padding: 12, background: "#fef3c7", border: "1px solid #fde68a",
            borderRadius: 6, fontSize: 13, color: "#92400e",
          }}>
            <strong>Policies:</strong> This listing uses your configured eBay policies (fulfillment, payment, return, merchant location).
            Configure these in your eBay account settings if you haven't already.
          </div>

          {/* Submit Section */}
          <div style={{ display: "flex", gap: 12, justifyContent: "space-between" }}>
            <Link href="/channels" style={{
              padding: "10px 16px", background: "#e5e7eb", color: "#1f2937", border: "none",
              borderRadius: 6, cursor: "pointer", fontSize: 14, fontWeight: 500, textDecoration: "none",
              display: "inline-block",
            }}>
              ← Back to Channels
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: "10px 24px", background: isSubmitting ? "#9ca3af" : "#059669", color: "#fff",
                border: "none", borderRadius: 6, cursor: isSubmitting ? "not-allowed" : "pointer",
                fontSize: 14, fontWeight: 600, minWidth: 200,
              }}
            >
              {isSubmitting ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <div style={{
                    width: 14, height: 14, border: "2px solid #fff", borderTopColor: "transparent",
                    borderRadius: "50%", animation: "spin 0.6s linear infinite",
                  }} />
                  Creating...
                </div>
              ) : (
                "Create eBay Listing"
              )}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
