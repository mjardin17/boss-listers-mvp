# eBay Listing Creation Form - Quick Start Guide

## Access the Form

Navigate to: **`/channels/create-listing`**

Or from the Channels page (`/channels`), click the **"+ Create eBay Listing"** button in the top-right of the "Manual listing package" section.

## Basic Workflow (3 Steps)

### Step 1: Lookup Product (Optional but Recommended)
```
1. Enter your SKU (e.g., "SKU-123-456")
2. Click "Lookup"
3. Form auto-fills: title, description, price, quantity, condition
```

### Step 2: Fill Remaining Fields
```
1. Edit title if needed
2. Edit description if needed
3. Select "Condition" (new/used/refurbished)
4. Click "Suggest" next to Category → select from list
5. Add image URLs (one per line)
```

### Step 3: Submit
```
1. Click "Create eBay Listing"
2. Wait for processing (~5-15 seconds)
3. On success: Click "View listing" to go to eBay
4. Form auto-resets for next listing
```

## Form Fields Explained

| Field | Required | Type | Example | Notes |
|-------|----------|------|---------|-------|
| **SKU** | No | Text | `SKU-123-456` | Used for lookup; not sent to eBay |
| **Title** | Yes | Text | `Vintage leather wallet` | eBay title (80 char limit) |
| **Description** | Yes | Text (large) | `High-quality aged leather...` | Full product details |
| **Price** | Yes | Currency | `29.99` | Must be > $0.01 |
| **Quantity** | Yes | Number | `5` | Must be ≥ 1 |
| **Condition** | Yes | Dropdown | `new` / `used` / `refurbished` | eBay standard |
| **Category** | Yes | ID | `12345` | From eBay Taxonomy (use Suggest) |
| **Images** | No | URL list | `https://...jpg` | One per line; max 12 images |

## Common Tasks

### How to: Auto-populate from inventory
```
1. Type your SKU
2. Click "Lookup"
3. Form fills automatically
4. Edit any field if needed
```

### How to: Find the right category
```
1. Make sure you have a title entered
2. Click "Suggest" button next to Category
3. Dropdown shows top 5 matches
4. Click any to select it
5. Category ID auto-fills
```

### How to: Add multiple images
```
1. Get image URLs (must be publicly accessible)
2. Paste in "Image URLs" field, one per line:
   https://example.com/img1.jpg
   https://example.com/img2.jpg
   https://example.com/img3.jpg
3. Submit form (URLs sent as-is to eBay)
```

### How to: Save as draft (coming soon)
```
Not yet available — form currently publishes live immediately.
Future: Will support "Save draft" for review before publish.
```

## Error Messages & Fixes

### "SKU not found"
- **Fix**: Verify SKU exists in your inventory
- **Check**: Go to Stager page, search for SKU

### "Title is required"
- **Fix**: Fill in the Title field (at least 1 character)

### "Category is required"
- **Fix**: Click "Suggest" button, then select from dropdown

### "This account hasn't connected eBay yet"
- **Fix**: Go to `/channels` → eBay card → "Connect eBay" button
- **Follow**: Complete eBay OAuth flow

### "eBay listing service unreachable"
- **System Issue**: Python bridge not running
- **Contact**: Team lead to start the service

### "Fulfillment policy must be configured"
- **Current Limitation**: Policies are placeholders in MVP
- **Workaround**: Configure in your eBay account settings

## Validation Rules

The form checks these before submitting:

```
✓ Title: must be non-empty
✓ Description: must be non-empty
✓ Price: must be a number > 0.00
✓ Quantity: must be an integer ≥ 1
✓ Condition: must be selected (dropdown)
✓ Category: must be set (from Suggest)
✓ Policies: fulfillment, payment, return, location must exist
```

If any field fails, you'll see a red error message below it. Fix and re-submit.

## Success!

When your listing is created, you'll see:
```
✓ Green banner: "Listing created successfully! SKU: SKU-123"
↗ "View listing" link (opens eBay in new tab)
↻ Form auto-resets for next listing
```

Click the link to verify your listing is live on eBay.

## Support

**For errors or issues**: See `docs/LISTING_CREATION.md` for detailed troubleshooting.

**For feature requests**: Open an issue with details of what you'd like added.

---

**Tip**: You can create multiple listings in sequence without leaving the form — it resets after each successful submission!
