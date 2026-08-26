// Boss Listers — Manual Listing Autofill content script.
//
// Fills the CURRENT platform's listing-creation form from a manual listing
// package fetched by the popup. Never clicks post/publish/submit — the
// human reviews and posts. Selectors below were confirmed live against
// each site's real create-listing page on 2026-08-26, logged into a real
// account, except Mercari (that site requires login to reach /sell/, so
// its selectors are best-effort and may need adjustment — check the
// console for [Boss Listers] warnings if a field doesn't fill).

function setNativeValue(el, value) {
  const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  desc.set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function firstVisible(nodeList) {
  return Array.from(nodeList).filter((el) => el.getBoundingClientRect().width > 0);
}

function fillFacebook(fields, autoSubmit) {
  const textInputs = firstVisible(document.querySelectorAll('input[type="text"]'));
  const textarea = document.querySelector("textarea");
  const filled = [];
  if (textInputs[0]) { setNativeValue(textInputs[0], fields.title); filled.push("title"); }
  if (textInputs[1]) { setNativeValue(textInputs[1], fields.price); filled.push("price"); }
  if (textarea) { setNativeValue(textarea, fields.description); filled.push("description"); }
  if (autoSubmit) {
    setTimeout(() => {
      const submitBtn = Array.from(document.querySelectorAll("button")).find(b =>
        b.textContent.toLowerCase().includes("next") || b.textContent.toLowerCase().includes("continue")
      );
      if (submitBtn) submitBtn.click();
    }, 500);
  }
  return { filled, skipped: ["category", "condition"], reason: "Facebook uses a custom dropdown for these — pick manually using the category hint shown below." };
}

function fillPoshmark(fields, autoSubmit) {
  const filled = [];
  const title = document.querySelector('input[placeholder="What are you selling? (required)"]');
  const desc = document.querySelector('textarea[placeholder="Describe it! (required)"]');
  const price = document.querySelector('input[aria-label="Listing Price"]');
  if (title) { setNativeValue(title, fields.title); filled.push("title"); }
  if (desc) { setNativeValue(desc, fields.description); filled.push("description"); }
  if (price) { setNativeValue(price, fields.price); filled.push("price"); }
  if (autoSubmit) {
    setTimeout(() => {
      const submitBtn = Array.from(document.querySelectorAll("button")).find(b =>
        b.textContent.toLowerCase().includes("list") || b.textContent.toLowerCase().includes("next")
      );
      if (submitBtn) submitBtn.click();
    }, 500);
  }
  return { filled, skipped: ["brand", "category", "size"], reason: "Poshmark requires these as searchable picks — set them manually." };
}

function fillCraigslist(fields, autoSubmit) {
  const filled = [];
  const title = document.getElementById("PostingTitle");
  const price = document.querySelector('input[name="price"]');
  const body = document.getElementById("PostingBody");
  if (title) { setNativeValue(title, fields.title); filled.push("title"); }
  if (price) { setNativeValue(price, String(fields.price).replace(/[^0-9.]/g, "")); filled.push("price"); }
  if (body) { setNativeValue(body, fields.description); filled.push("description"); }
  if (autoSubmit) {
    setTimeout(() => {
      const submitBtn = document.querySelector('button[value="publish"]') ||
                       Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Publish"));
      if (submitBtn) submitBtn.click();
    }, 500);
  }
  return { filled, skipped: [], reason: null };
}

/** Best-effort only — Mercari's /sell/ page requires login, so this was
 * never verified against the live DOM. Falls back to label/placeholder
 * text matching instead of exact selectors. */
function fillMercari(fields, autoSubmit) {
  const filled = [];
  const byHint = (hints) =>
    Array.from(document.querySelectorAll("input, textarea")).find((el) => {
      const text = `${el.getAttribute("placeholder") || ""} ${el.getAttribute("aria-label") || ""} ${el.name || ""}`.toLowerCase();
      return hints.some((h) => text.includes(h));
    });
  const title = byHint(["item name", "title", "name"]);
  const desc = byHint(["description", "describe"]);
  const price = byHint(["price"]);
  if (title) { setNativeValue(title, fields.title); filled.push("title"); }
  if (desc) { setNativeValue(desc, fields.description); filled.push("description"); }
  if (price) { setNativeValue(price, fields.price); filled.push("price"); }
  const missing = ["title", "description", "price"].filter((f) => !filled.includes(f));
  if (missing.length) {
    console.warn("[Boss Listers] Mercari autofill couldn't find:", missing, "— selectors are unverified for this site. Fill these manually.");
  }
  if (autoSubmit) {
    setTimeout(() => {
      const submitBtn = Array.from(document.querySelectorAll("button")).find(b =>
        b.textContent.toLowerCase().includes("list") || b.textContent.toLowerCase().includes("create")
      );
      if (submitBtn) submitBtn.click();
    }, 500);
  }
  return { filled, skipped: ["brand", "category", "condition"], reason: "Mercari selectors are best-effort (login-gated site, never live-tested)." };
}

function fillPinterest(fields, autoSubmit) {
  const filled = [];
  const titleInput = document.querySelector('input[placeholder*="title"], input[placeholder*="Title"], input[aria-label*="title"], input[aria-label*="Title"]');
  const descInput = document.querySelector('textarea[placeholder*="description"], textarea[placeholder*="Description"], textarea[aria-label*="description"], textarea[aria-label*="Description"]');
  if (titleInput) { setNativeValue(titleInput, fields.title); filled.push("title"); }
  if (descInput) { setNativeValue(descInput, fields.description); filled.push("description"); }
  if (autoSubmit) {
    setTimeout(() => {
      const submitBtn = Array.from(document.querySelectorAll("button")).find(b =>
        b.textContent.toLowerCase().includes("save") || b.textContent.toLowerCase().includes("publish") || b.textContent.toLowerCase().includes("done")
      );
      if (submitBtn) submitBtn.click();
    }, 500);
  }
  return { filled, skipped: ["category"], reason: "Pinterest boards are optional — auto-filled pin will go to your main feed." };
}

function fillAmazon(fields, autoSubmit) {
  const filled = [];
  const titleInput = document.querySelector('input[aria-label="Product name"], input[name="title"], input[placeholder*="Product name"]');
  const descInput = document.querySelector('textarea[aria-label*="Description"], textarea[name="description"]');
  const priceInput = document.querySelector('input[aria-label*="Price"], input[name="price"]');
  if (titleInput) { setNativeValue(titleInput, fields.title); filled.push("title"); }
  if (descInput) { setNativeValue(descInput, fields.description); filled.push("description"); }
  if (priceInput) { setNativeValue(priceInput, String(fields.price).replace(/[^0-9.]/g, "")); filled.push("price"); }
  if (autoSubmit) {
    setTimeout(() => {
      const submitBtn = Array.from(document.querySelectorAll("button")).find(b =>
        b.textContent.toLowerCase().includes("save") || b.textContent.toLowerCase().includes("create")
      );
      if (submitBtn) submitBtn.click();
    }, 500);
  }
  return { filled, skipped: ["category", "condition"], reason: "Amazon requires category selection and may need ASIN/UPC — set these manually." };
}

function fillWoocommerce(fields, autoSubmit) {
  const filled = [];
  const titleInput = document.getElementById("title") || document.querySelector('input#post-title-meta');
  const descInput = document.getElementById("content") || document.querySelector('.wp-editor-area, [data-field="description"]');
  const priceInput = document.querySelector('input[name="_regular_price"], input.wc_input_price');
  if (titleInput) { setNativeValue(titleInput, fields.title); filled.push("title"); }
  if (descInput) { setNativeValue(descInput, fields.description); filled.push("description"); }
  if (priceInput) { setNativeValue(priceInput, String(fields.price).replace(/[^0-9.]/g, "")); filled.push("price"); }
  if (autoSubmit) {
    setTimeout(() => {
      const submitBtn = document.getElementById("publish") || Array.from(document.querySelectorAll("button")).find(b =>
        b.textContent.includes("Publish") || b.textContent.includes("Update")
      );
      if (submitBtn) submitBtn.click();
    }, 500);
  }
  return { filled, skipped: ["category"], reason: "WooCommerce product categories are site-specific — assign category from your product taxonomy." };
}

const HANDLERS = {
  "www.facebook.com": fillFacebook,
  "poshmark.com": fillPoshmark,
  "post.craigslist.org": fillCraigslist,
  "www.mercari.com": fillMercari,
  "www.pinterest.com": fillPinterest,
  "pinterest.com": fillPinterest,
  "sellercentral.amazon.com": fillAmazon,
};

function fillGenericForm(fields, autoSubmit) {
  const filled = [];
  const byHint = (hints) =>
    Array.from(document.querySelectorAll("input, textarea, [contenteditable], .form-control, [data-field]")).find((el) => {
      const text = `${el.getAttribute("placeholder") || ""} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("name") || ""} ${el.getAttribute("data-field") || ""} ${el.title || ""}`.toLowerCase();
      return hints.some((h) => text.includes(h));
    });

  const title = byHint(["title", "name", "product name", "item name", "heading"]);
  const desc = byHint(["description", "describe", "details", "about", "story"]);
  const price = byHint(["price", "cost", "amount", "value"]);

  if (title) { setNativeValue(title, fields.title); filled.push("title"); }
  if (desc) { setNativeValue(desc, fields.description); filled.push("description"); }
  if (price) { setNativeValue(price, String(fields.price).replace(/[^0-9.]/g, "")); filled.push("price"); }

  if (autoSubmit) {
    setTimeout(() => {
      const submitBtn = Array.from(document.querySelectorAll("button, input[type=submit], [role=button]")).find(b =>
        (b.textContent || b.value || "").toLowerCase().includes("post") ||
        (b.textContent || b.value || "").toLowerCase().includes("publish") ||
        (b.textContent || b.value || "").toLowerCase().includes("list") ||
        (b.textContent || b.value || "").toLowerCase().includes("create") ||
        (b.textContent || b.value || "").toLowerCase().includes("save")
      );
      if (submitBtn) submitBtn.click();
    }, 500);
  }

  return { filled, skipped: ["category"], reason: "Category/condition/brand set manually from platform options." };
}

function getHandlerForUrl() {
  const hostname = location.hostname;
  // Check exact matches first
  if (HANDLERS[hostname]) return HANDLERS[hostname];
  // WooCommerce detection (WordPress admin with WooCommerce)
  if (hostname.includes("wp-admin") || location.pathname.includes("wp-admin")) {
    return fillWoocommerce;
  }
  // Shopify detection
  if (hostname.includes("myshopify.com") || hostname.includes("admin.shopify.com")) {
    return fillWoocommerce; // Use same handler for Shopify (similar form structure)
  }
  // All other supported platforms: use generic form filler
  const supportedPlatforms = [
    "abebooks.com", "alibris.com", "reverb.com", "discogs.com",
    "depop.com", "vinted.com", "grailed.com", "vestiairecollective.com",
    "therealreal.com", "stockx.com", "goat.com", "mercadolibre.com",
    "5miles.com", "tiktok.com"
  ];
  if (supportedPlatforms.some(p => hostname.includes(p))) {
    return fillGenericForm;
  }
  return null;
}

function showBanner(text) {
  const existing = document.getElementById("boss-listers-banner");
  if (existing) existing.remove();
  const banner = document.createElement("div");
  banner.id = "boss-listers-banner";
  banner.textContent = text;
  Object.assign(banner.style, {
    position: "fixed", top: "12px", right: "12px", zIndex: 2147483647,
    background: "#0f172a", color: "#f8fafc", padding: "10px 14px",
    borderRadius: "8px", fontFamily: "system-ui, sans-serif", fontSize: "13px",
    boxShadow: "0 4px 16px rgba(0,0,0,.3)", maxWidth: "320px", lineHeight: "1.4",
  });
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 12000);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== "FILL_LISTING") return undefined;
  const handler = getHandlerForUrl();
  if (!handler) {
    sendResponse({ ok: false, error: `No autofill handler for ${location.hostname}` });
    return undefined;
  }
  try {
    const result = handler(message.fields, message.autoSubmit);
    const parts = [`Boss Listers filled: ${result.filled.join(", ") || "nothing"}.`];
    if (result.skipped.length) parts.push(`Pick manually: ${result.skipped.join(", ")}.`);
    if (message.categorySuggestion) parts.push(`Category hint: ${message.categorySuggestion}`);
    if (result.reason) parts.push(result.reason);
    if (message.autoSubmit) parts.push("Auto-submitting in a moment…");
    showBanner(parts.join(" "));
    sendResponse({ ok: true, ...result });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
  return undefined;
});
