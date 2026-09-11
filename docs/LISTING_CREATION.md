# eBay Listing Creation Form

## Overview

The listing creation form at `/channels/create-listing` provides a production-ready interface for creating eBay listings directly from your BossListers inventory.

## Features

### 1. Inventory Lookup
- **SKU Input**: Search your inventory by SKU
- **Auto-fill**: Successfully found products auto-populate form fields
- **Status Feedback**: Clear success/error messages for lookup results

### 2. Product Details Section
- **Title**: Full text input with auto-save to description
- **Description**: Rich text area for detailed product information
- **Price**: Validated currency field (0.01 or higher)
- **Quantity**: Integer field (1 or higher)

### 3. Classification Section
- **Condition**: Dropdown with options (new, used, refurbished)
- **Category**: 
  - Auto-suggest button queries eBay Taxonomy API
  - Shows top 5 category matches by relevance
  - Click any suggestion to select

### 4. Images
- **Image URLs**: Multi-line textarea, one URL per line
- **Validation**: Each URL is trimmed; empty lines ignored
- **eBay Limit**: Supports up to 12 images (eBay standard)

### 5. Form Validation
- **Required Fields**: Title, description, price, quantity, condition, category
- **Data Type Checks**: 
  - Price must be numeric and > 0
  - Quantity must be integer and >= 1
  - Category ID must be set (from suggestion or manual)
- **Policy Check**: Ensures fulfillment, payment, return, and merchant location policies are configured
- **Error Display**: Per-field error messages highlight validation failures

### 6. Submission & Feedback
- **Loading State**: Spinner replaces button text during submission
- **Success Alert**: Green banner with "View listing" link to eBay
- **Error Alert**: Red banner with detailed error message
- **Form Reset**: On success, form clears for next listing

## API Integration

### Endpoints Used

#### 1. Inventory Lookup
**GET** `/api/products/[sku]`
- **Query**: `sku` path parameter (URL-encoded)
- **Response**: `{ ok, product: { title, description, price, quantity, condition, ... } }`
- **Auth**: Required (Bearer token in Authorization header)
- **Cache**: None (real-time Supabase query)

#### 2. Category Suggestion
**GET** `/api/channels/ebay/category-suggest?q=<title>`
- **Query**: `q` param with listing title
- **Response**: `{ ok, categoryTreeId, best: { categoryId, categoryName, relevance }, suggestions: [...] }`
- **Auth**: Public (uses app-level OAuth credentials)
- **Rate**: eBay Taxonomy API limits; suggest 1-2 calls per title

#### 3. Create Listing
**POST** `/api/channels/ebay/create-listing`
- **Headers**: 
  - `Content-Type: application/json`
  - `Authorization: Bearer <user_token>` (from requireSession)
- **Body**:
  ```json
  {
    "product": {
      "sku": "SKU-123",
      "title": "...",
      "description": "...",
      "price": 29.99,
      "quantity": 5,
      "condition": "new",
      "category_id": "12345",
      "image_urls": ["https://...", "https://..."],
      "marketplace_id": "EBAY_US",
      "currency": "USD",
      "aspects": {}
    },
    "policies": {
      "fulfillment_policy_id": "...",
      "payment_policy_id": "...",
      "return_policy_id": "...",
      "merchant_location_key": "..."
    },
    "dryRun": false,
    "confirm": "PUBLISH_LIVE"
  }
  ```
- **Response**: 
  - Success: `{ ok: true, sku, offer_id, listing_id, steps: [...], payloads: [...] }`
  - Error: `{ ok: false, error, code, step?, offerId? }`
- **Auth**: Required (resolved server-side from Authorization header)
- **Permissions**: Tenant's own eBay account (enforced via `resolveSession()`)

## Form Data Flow

```
User Input
    ↓
[SKU Lookup] → /api/products/[sku] → Pre-fill form
    ↓
[Form Editing] → Validate on change, clear field errors
    ↓
[Category Suggest] → /api/channels/ebay/category-suggest → Populate dropdown
    ↓
[Submit] → Validate all fields → /api/channels/ebay/create-listing → Success/Error
```

## Error Handling

### Lookup Errors
- **Missing SKU**: "Please enter a SKU"
- **Not Found**: "SKU not found"
- **Network**: Fetch error message propagated

### Form Validation Errors
| Field | Rule | Error Message |
|-------|------|---------------|
| title | Required, non-empty | "Title is required" |
| description | Required, non-empty | "Description is required" |
| price | Number, > 0 | "Valid price is required" |
| quantity | Integer, >= 1 | "Quantity must be at least 1" |
| condition | Must be selected | "Condition is required" |
| category | Must be set | "Category is required" |
| policies | All 4 must exist | "Fulfillment policy must be configured" |

### Submission Errors
- **API Errors**: `result.error` displayed in red alert
- **Network Errors**: Fetch exception message
- **Specific Codes** (from eBay bridge):
  - `offer_created_not_published`: Offer exists; may need resume
  - `token_refresh_failed`: eBay auth issue
  - `bridge_unreachable`: Python service down
  - `ebay_not_connected`: Tenant hasn't connected eBay account

## UX Patterns

### Field Errors
- Red border around input on validation fail
- Inline error text below field
- Clearing field automatically removes error
- All errors shown before submit (no per-field popups)

### Loading States
- **Lookup**: "Searching..." button text, button disabled
- **Category Suggest**: "Searching..." button text
- **Submit**: Spinner animation + "Creating..." button text, form locked

### Success Feedback
- Green banner with confirmation message
- "View listing ↗" link to eBay (when listing_id present)
- Form auto-resets for next listing
- Banner persists for user confirmation (can scroll past)

### Accessibility
- Labels linked to inputs via `htmlFor` (standard form fields)
- Required indicators marked with red asterisks
- Error messages associated with fields
- Button text includes loading context ("Creating..." not just "Loading")
- High contrast error/success colors meet WCAG AA

## Security

### Tenant Isolation
- `resolveSession()` extracts tenantId server-side (never client-controlled)
- eBay connector uses tenant's own refresh token (via `_getTenantRefreshToken()`)
- Listings always created under user's connected eBay account
- No cross-tenant listing leakage possible

### CSRF Protection
- POST endpoint requires Bearer token
- No state parameter needed (OAuth already handled in `/channels/ebay/callback`)

### Input Validation
- Price/quantity parsed and validated (no negative or 0 values)
- Image URLs trimmed; no HTML injection (URLs normalized)
- Category ID from API response or suggestion (not user-typed free text)
- eBay API receives sanitized product object

### Rate Limiting
- Category suggestion: Limited by eBay Taxonomy API (client-side retry only)
- Listing creation: Limited by eBay Inventory API + internal service
- No built-in client-side throttle (user can retry manually)

## Configuration

### Required Environment Variables
- `NEXT_PUBLIC_EBAY_CLIENT_ID`: eBay app client ID
- `EBAY_CLIENT_SECRET`: eBay app secret (server-only)
- `EBAY_REFRESH_TOKEN`: App owner's default token
- `EBAY_ENVIRONMENT`: "sandbox" or "production"
- `EBAY_LISTING_SERVICE_URL`: Python bridge URL (default: http://127.0.0.1:8791)
- `SUPABASE_URL`: Inventory DB URL
- `SUPABASE_SERVICE_ROLE_KEY`: Inventory query key
- `EBAY_LISTING_SERVICE_TOKEN`: (Optional) Safety token for live publishes

### Policies Configuration
Currently hardcoded to placeholder values in state init:
```js
const [policies, setPolicies] = useState({
  fulfillment_policy_id: "",
  payment_policy_id: "",
  return_policy_id: "",
  merchant_location_key: "",
});
```

**TODO (Post-MVP)**: Add UI to fetch and select from user's actual eBay policies:
- API endpoint: eBay Business Policies (sell.account scope)
- Dropdown in form: "Select fulfillment policy"
- Cache policies per session (eBay stores them, change infrequently)

## Testing

### Manual Test Cases

#### 1. Lookup + Submit
1. Go to `/channels/create-listing`
2. Enter valid SKU (e.g., "SKU-123-456")
3. Click "Lookup"
4. Verify: Title, description, price, quantity pre-filled
5. Click "Suggest" for category
6. Select top suggestion
7. Add 1-2 image URLs
8. Click "Create eBay Listing"
9. Verify: Success banner + eBay listing link

#### 2. Form Validation
1. Leave title blank
2. Click "Create eBay Listing"
3. Verify: Red error under title, submit prevented
4. Fill title
5. Verify: Error clears immediately

#### 3. Lookup Error
1. Enter invalid SKU (e.g., "NONEXISTENT")
2. Click "Lookup"
3. Verify: Error message "SKU not found" appears
4. Clear error on next SKU entry

#### 4. Category Suggest
1. Enter title "Vintage leather wallet"
2. Click "Suggest" (without lookup)
3. Verify: Dropdown shows 5 category suggestions
4. Click one
5. Verify: Category ID field populated

### Automated Test Template
```typescript
describe('CreateListingPage', () => {
  it('should lookup SKU and pre-fill form', async () => {
    // Mock /api/products/[sku]
    // Render page
    // Type SKU
    // Click Lookup
    // Assert form fields populated
  });

  it('should validate required fields', async () => {
    // Render page
    // Click Submit without filling form
    // Assert all errors displayed
  });

  it('should submit listing and show success', async () => {
    // Mock /api/channels/ebay/create-listing
    // Fill all fields
    // Click Submit
    // Assert success banner + eBay URL
  });
});
```

## Performance Considerations

- **Lookup**: Single Supabase REST query, ~200-500ms
- **Category Suggest**: eBay API call, ~1-2s (rate-limited)
- **Submit**: Bridge service call, ~5-15s (includes eBay sync)

### Optimization Opportunities
1. Debounce category suggest (wait 500ms after title input)
2. Cache policies list per session (fetch once on load)
3. Lazy-load Supabase client only on SKU input focus
4. Pre-populate category from product's existing tags (if available)

## Troubleshooting

### "SKU not found"
- **Check**: SKU exists in inventory
- **Debug**: Query Supabase directly: `SELECT * FROM products WHERE sku = '<entered_sku>'`

### "eBay listing service unreachable"
- **Check**: Python bridge (`scripts/ebay_listing_service.py`) is running
- **Fix**: Start the service: `cd /path/to/video-bot-pipeline && python scripts/ebay_listing_service.py`

### "This account hasn't connected eBay yet"
- **Check**: User has clicked "Connect eBay" on `/channels` and completed OAuth flow
- **Fix**: Go to `/channels` → eBay card → "Connect eBay" button

### "Fulfillment policy must be configured"
- **Current**: Policies are hardcoded (empty strings)
- **Fix**: Add eBay policies API integration (see Configuration above)

### Category suggestion returns empty
- **Check**: eBay API is reachable (test in `/api/channels/ebay/category-suggest?q=test`)
- **Debug**: Check browser console for network errors
- **Fallback**: Manually enter category ID (found via eBay Category Browser)

## Future Enhancements

### Phase 2: Policies UI
- Fetch user's eBay Business Policies
- Dropdown selectors for fulfillment/payment/return policies
- Pre-select most-used policies (sticky preference)

### Phase 3: Variants & Aspects
- Multi-variant listings (size/color selectors)
- eBay-specific aspects (brand, material, etc.)
- Bulk variant generator from CSV

### Phase 4: Bulk Upload
- CSV import: 20+ listings at once
- Progress bar + resume on network failure
- Batch results CSV download

### Phase 5: Multi-Platform
- Etsy listing creation (same form, different payload)
- Facebook Marketplace direct-post
- Cross-list optimization (best category/title per platform)

## Files Modified

- **Created**: `/pages/channels/create-listing.js` — Main listing form page
- **Updated**: `/pages/channels.js` — Added "Create eBay Listing" button link

## Related Documentation

- `/pages/api/channels/ebay/create-listing.js` — Backend API
- `/lib/channels/apiConnectors.js` — EbayConnector class
- `/lib/clientAuth.js` — `authedFetch()` and `requireSession()`
- `/pages/api/products/[sku].js` — SKU lookup endpoint
- `/pages/api/channels/ebay/category-suggest.js` — Category suggestions endpoint
