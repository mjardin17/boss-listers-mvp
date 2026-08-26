# Boss Listers — Manual Listing Autofill (browser extension)

Fills the title/price/description on marketplace listing-creation pages from Boss Listers manual listing packages. Can post to all supported platforms with one click, auto-filling and auto-submitting each marketplace. For single-platform fills, reviews before submitting (no auto-submit).

## What's automated vs. manual

| Platform | Title/Price/Description | Category/Condition/Brand | Photos | API Auto-Post |
|---|---|---|---|---|
| Facebook Marketplace | Auto-filled & auto-submitted | Manual | Manual | — |
| Poshmark | Auto-filled & auto-submitted | Manual | Manual | — |
| Craigslist | Auto-filled & auto-submitted | Manual | Manual | — |
| Mercari | Auto-filled & auto-submitted (best-effort) | Manual | Manual | — |
| Pinterest | Auto-filled & auto-submitted | Manual (optional board) | Manual | — |
| eBay | — | — | — | ✅ Full API integration |
| Etsy | — | — | — | ✅ Full API integration |
| OfferUp | **Not supported.** OfferUp killed web posting. Use the manual package's copy from the OfferUp mobile app instead. | — | — | — |

Photos are never auto-attached anywhere — browsers don't let extension
scripts hand a remote image URL to a file `<input>` without the user
picking it themselves. Use the `photoChecklist` shown in the manual
package.

## Load it

1. `chrome://extensions` → enable **Developer mode** (top right) → **Load unpacked** → select this `extension/` folder.
2. Click the extension icon → enter:
   - **API base URL**: wherever your Boss Listers app is running, e.g. `http://localhost:3001` for local dev (`npm run dev` runs on port 3001).
   - **Basic auth username/password**: same values as `APP_BASIC_AUTH_USER` / `APP_BASIC_AUTH_PASS` in `.env.local` — the whole app sits behind HTTP Basic Auth (see `middleware.js`), so every API call needs this.
3. Click **Save connection** — Chrome will ask you to approve access to that host. Approve it.

## Use it

### Post to ONE platform (single-platform flow)
1. Open a listing-creation page: Facebook Marketplace, Poshmark, Craigslist, Mercari, or Pinterest.
2. Open the extension popup. It auto-detects the platform from the active tab.
3. Type the item's SKU (or click **Load recent inventory** to browse/pick one).
4. Click **Fetch package & fill this page**.
5. Form auto-fills. Review everything — you'll need to manually set category, condition, brand, and upload photos.

### Post to ALL platforms (multi-platform flow)
1. Open the extension popup (any tab).
2. Type the item's SKU.
3. Click **Post to ALL platforms**.
4. The extension will:
   - Post to eBay and Etsy directly via their APIs
   - Open new tabs for Facebook, Poshmark, Craigslist, Mercari, Pinterest
   - Auto-fill and auto-submit each marketplace form
   - Return focus to the popup showing status

All posts are created as drafts/live and ready for review on each platform.

## Why fields are filled the way they are

Facebook and Poshmark are React apps with no stable `name`/`id`/`aria-label`
on their title/price fields, so the content script sets values via the
native input-value setter + a real `input`/`change` event (the standard way
to update a React-controlled input from outside React) rather than by
selector name. Craigslist is plain HTML with real field names
(`#PostingTitle`, `input[name="price"]`, `#PostingBody`), so that one's
more resilient to page updates than the FB/Poshmark positional matching is.
If Facebook or Poshmark redesign their create-listing page, the selectors
in `content_script.js` will need re-checking.
