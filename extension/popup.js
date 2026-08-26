// Boss Listers — Manual Listing Autofill popup logic.
// Talks to the Boss Listers Next.js app (which sits behind HTTP Basic Auth,
// see middleware.js), fetches a manual listing package for a SKU, and asks
// the content script on the active tab to fill the matching form fields.

const HOST_TO_PLATFORM = {
  "www.facebook.com": "facebook",
  "poshmark.com": "poshmark",
  "post.craigslist.org": "craigslist",
  "www.mercari.com": "mercari",
  "www.pinterest.com": "pinterest",
  "pinterest.com": "pinterest",
  "sellercentral.amazon.com": "amazon",
};

function getPlatformFromUrl(url) {
  const host = new URL(url).hostname;
  if (HOST_TO_PLATFORM[host]) return HOST_TO_PLATFORM[host];
  if (host.includes("wp-admin") || url.includes("wp-admin")) return "woocommerce";
  if (host.includes("myshopify.com")) return "shopify";
  return null;
}

const els = {
  apiBaseUrl: document.getElementById("apiBaseUrl"),
  authUser: document.getElementById("authUser"),
  authPass: document.getElementById("authPass"),
  saveSettings: document.getElementById("saveSettings"),
  sku: document.getElementById("sku"),
  loadRecent: document.getElementById("loadRecent"),
  itemList: document.getElementById("itemList"),
  platformBadge: document.getElementById("platformBadge"),
  fillBtn: document.getElementById("fillBtn"),
  status: document.getElementById("status"),
};

function setStatus(text, kind) {
  els.status.textContent = text;
  els.status.className = kind || "";
}

async function getSettings() {
  return chrome.storage.local.get(["apiBaseUrl", "authUser", "authPass"]);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function authHeader(user, pass) {
  if (!user && !pass) return null;
  return `Basic ${btoa(`${user}:${pass}`)}`;
}

async function detectPlatform() {
  const tab = await getActiveTab();
  if (!tab || !tab.url) {
    els.platformBadge.textContent = "no active tab";
    return null;
  }
  const platform = getPlatformFromUrl(tab.url);
  const host = new URL(tab.url).hostname;
  els.platformBadge.textContent = platform ? `platform: ${platform}` : `unsupported page (${host})`;
  return platform;
}

async function loadSettingsIntoForm() {
  const { apiBaseUrl, authUser, authPass } = await getSettings();
  if (apiBaseUrl) els.apiBaseUrl.value = apiBaseUrl;
  if (authUser) els.authUser.value = authUser;
  if (authPass) els.authPass.value = authPass;
}

els.saveSettings.addEventListener("click", async () => {
  const apiBaseUrl = els.apiBaseUrl.value.trim().replace(/\/$/, "");
  const authUser = els.authUser.value;
  const authPass = els.authPass.value;
  if (!apiBaseUrl) {
    setStatus("Enter an API base URL first.", "error");
    return;
  }
  let origin;
  try {
    origin = new URL(apiBaseUrl).origin + "/*";
  } catch {
    setStatus("That doesn't look like a valid URL.", "error");
    return;
  }
  try {
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) {
      setStatus("Permission denied — the extension can't reach that host until you allow it.", "error");
      return;
    }
  } catch (err) {
    setStatus(`Permission request failed: ${err.message}`, "error");
    return;
  }
  await chrome.storage.local.set({ apiBaseUrl, authUser, authPass });
  setStatus("Connection saved.", "ok");
});

els.loadRecent.addEventListener("click", async () => {
  const { apiBaseUrl, authUser, authPass } = await getSettings();
  if (!apiBaseUrl) {
    setStatus("Save your API base URL first.", "error");
    return;
  }
  setStatus("Loading inventory…");
  try {
    const headers = {};
    const auth = authHeader(authUser, authPass);
    if (auth) headers.Authorization = auth;
    const res = await fetch(`${apiBaseUrl}/api/inventory`, { headers });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    els.itemList.innerHTML = "";
    data.products.slice(0, 25).forEach((p) => {
      const row = document.createElement("div");
      row.className = "item-row";
      row.textContent = `${p.sku} — ${p.title || "(untitled)"}`;
      row.addEventListener("click", () => { els.sku.value = p.sku; });
      els.itemList.appendChild(row);
    });
    setStatus(`Loaded ${data.products.length} items. Click one to select its SKU.`, "ok");
  } catch (err) {
    setStatus(`Failed to load inventory: ${err.message}`, "error");
  }
});

els.fillBtn.addEventListener("click", async () => {
  const sku = els.sku.value.trim();
  if (!sku) {
    setStatus("Enter a SKU first.", "error");
    return;
  }
  const platform = await detectPlatform();
  if (!platform) {
    setStatus("This tab isn't a supported listing-creation page.", "error");
    return;
  }
  const { apiBaseUrl, authUser, authPass } = await getSettings();
  if (!apiBaseUrl) {
    setStatus("Save your API base URL first.", "error");
    return;
  }
  setStatus(`Fetching ${platform} package for ${sku}…`);
  try {
    const headers = { "Content-Type": "application/json" };
    const auth = authHeader(authUser, authPass);
    if (auth) headers.Authorization = auth;
    const res = await fetch(`${apiBaseUrl}/api/channels/manual-package`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sku, platforms: [platform] }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const pkg = data.packages[0];

    const tab = await getActiveTab();
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: "FILL_LISTING",
      fields: pkg.fields,
      categorySuggestion: pkg.fields.categorySuggestion,
    });
    if (!response || !response.ok) {
      throw new Error((response && response.error) || "Content script did not respond");
    }
    setStatus(`Filled: ${response.filled.join(", ") || "nothing"}.${response.skipped.length ? ` Set manually: ${response.skipped.join(", ")}.` : ""}\n\nPhotos still need to be added by hand — browsers won't let extensions attach remote image URLs to a file picker.`, "ok");
  } catch (err) {
    setStatus(`Failed: ${err.message}`, "error");
  }
});

document.getElementById("postEverywhereBtn").addEventListener("click", async () => {
  const sku = els.sku.value.trim();
  if (!sku) {
    setStatus("Enter a SKU first.", "error");
    return;
  }
  const { apiBaseUrl, authUser, authPass } = await getSettings();
  if (!apiBaseUrl) {
    setStatus("Save your API base URL first.", "error");
    return;
  }
  setStatus(`Posting ${sku} to all platforms…`);
  try {
    const headers = { "Content-Type": "application/json" };
    const auth = authHeader(authUser, authPass);
    if (auth) headers.Authorization = auth;
    const res = await fetch(`${apiBaseUrl}/api/post-everywhere`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sku }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);

    setStatus(`Posted to: ${data.postedTo.map(p => p.platform).join(", ") || "none"}\n\nOpening browser platforms…`, "ok");

    // Open browser platforms in new tabs
    for (const pkg of data.manualPackages) {
      const tab = await chrome.tabs.create({ url: pkg.postUrl, active: false });
      // Wait a moment for page to load, then fill
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, {
          action: "FILL_LISTING",
          fields: pkg.fields,
          categorySuggestion: pkg.fields.categorySuggestion,
          autoSubmit: true,
        });
      }, 2000);
    }
  } catch (err) {
    setStatus(`Failed: ${err.message}`, "error");
  }
});

loadSettingsIntoForm();
detectPlatform();
