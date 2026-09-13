# Multi-Platform Posting - Quick Start Guide

## What It Does

One-click product posting to eBay, Etsy, Amazon, and TikTok Shop simultaneously. Post to any combination of platforms you choose.

## Prerequisites

1. Navigate to **Channels** page
2. Verify platforms are **configured** (see green checkmark or "Connected" status)
   - eBay: Click "Test Connection"
   - Etsy: Connect your shop via "Connect Etsy"
   - Amazon: Set up Seller Central credentials
   - TikTok Shop: Link your TikTok business account

## Step-by-Step Usage

### From Inventory Page

1. **Open Inventory** → Click "Inventory" in navigation
2. **Find Your Product** → Search by SKU or title (e.g., "iPhone")
3. **Click "Post" Button** → Right side of the product row
4. **Platform Selection Dialog Opens**

### In the Dialog

1. **Select Platforms** (check any combination):
   - ☐ eBay (🏪)
   - ☐ Etsy (🧵)
   - ☐ Amazon (🔶)
   - ☐ TikTok Shop (🎵)

2. **Choose Your Mode**:
   - ☐ **Preview Mode** (default)
     - Test the posting flow
     - No listings created
     - Safe to try first
   - ☐ **Live Mode** (check "Post Live to Marketplaces")
     - Creates actual listings
     - Visible on marketplaces immediately
     - Use after testing in preview

3. **Review the Warning** (if live mode selected):
   - "Listings will be created and published immediately"
   - Make sure product details are correct first

4. **Click "Post to Selected"** → System posts to all selected platforms

### See Results

After clicking "Post to Selected", you'll see results for each platform:

**Success (✓ Green)**
- Listing ID displayed
- Link to view on marketplace
- Post date/time shown

**Failed (✗ Red)**
- Error message explaining why
- Error code (for support)
- You can retry later

**Examples:**
```
✓ eBay Success
  Listing ID: 12345678
  View listing →

✗ Etsy Failed
  Error: etsy_not_connected
  Code: etsy_not_connected
  (Solution: Visit Channels page to connect Etsy)
```

### After Posting

1. **Review Each Listing** → Click "View listing" link (if successful)
2. **Check Details** → Verify price, description, images on each platform
3. **Close Dialog** → Click "Done" button
4. **Product Updated** → Inventory page now shows which platforms have this product

## Common Scenarios

### First Time Posting (Recommended Workflow)

1. Open post dialog
2. Select **one platform** (e.g., eBay only)
3. Keep **Preview Mode ON**
4. Click "Post to Selected"
5. Review results (should show "Success" if configured)
6. If successful, try next platform
7. Once all platforms tested, switch to **Live Mode**

### Post to Multiple Platforms

1. Open post dialog
2. Check eBay, Etsy, Amazon (any combination)
3. Toggle "Post Live to Marketplaces" ON (if ready)
4. Click "Post to Selected"
5. Monitor results — some may succeed, some may fail
6. Note which failed
7. Click "Start Over" and retry failed ones

### Retry Failed Platform

1. If posting failed for a platform (e.g., "etsy_not_connected")
2. Fix the issue (e.g., connect Etsy account on Channels page)
3. Click "Start Over"
4. Select only the failed platform
5. Ensure live mode is ON
6. Click "Post to Selected"

### Post Different Platforms Per Product

1. Post Product A to eBay + Amazon
2. Post Product B to Etsy + TikTok
3. Post Product C to all four platforms

Each product is independent — post to different platforms as needed.

## Troubleshooting

### Platform Not Appearing in Dialog

**Problem:** eBay, Etsy, or another platform not showing as an option

**Solution:** 
1. Go to **Channels** page
2. Find the platform
3. Click **"Test Connection"** or **"Connect"**
4. Follow setup instructions
5. Return to Inventory and try posting again

### Posting Fails with "credentials_missing"

**Problem:** Error says "credentials are not configured"

**Solution:**
1. Environment variables not set for that platform
2. Ask admin to configure:
   - eBay: `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, etc.
   - Etsy: `ETSY_KEYSTRING`, `ETSY_SHARED_SECRET`
   - Amazon: `AMAZON_CLIENT_ID`, `AMAZON_CLIENT_SECRET`, etc.

### Posting Fails with "bridge_unreachable"

**Problem:** Error says "listing service unreachable"

**Solution:**
1. Python bridge service (`scripts/ebay_listing_service.py`) not running
2. Admin needs to start it:
   ```bash
   python scripts/ebay_listing_service.py --allow-live
   ```
3. Try posting again

### Posting Shows "Success" but Listing Doesn't Appear

**Problem:** Dialog says "Success" but can't find listing on marketplace

**Explanation:**
- If you used **Preview Mode**: The listing wasn't actually created (preview only)
- If you used **Live Mode**: Listing is created but may take a few minutes to appear
- Check the "View listing" link provided in the results

**Next Step:** Wait a few minutes and refresh the marketplace page

## Tips & Best Practices

### Before Posting

- ✓ Verify product title is clear and accurate
- ✓ Check price is correct
- ✓ Ensure quantity is > 0
- ✓ Review description for typos
- ✓ Confirm images look good

### When Posting

- ✓ Start with **Preview Mode** on first posting
- ✓ Test with **one platform** first
- ✓ Once confident, try **multiple platforms**
- ✓ Finally, switch to **Live Mode**

### After Posting

- ✓ Click "View listing" link to verify details
- ✓ Check that title, price, images match on platform
- ✓ Monitor for questions/offers on marketplace
- ✓ Update inventory quantity as items sell

## Advanced Usage

### Bulk Posting (Future Feature)

Post multiple products at once:
1. Check multiple products in table
2. (Feature coming soon)
3. Select platforms
4. Post all at once

### Scheduling Posts (Future Feature)

Post at specific times:
1. Click "Post" button
2. Choose "Schedule for later"
3. Pick date and time
4. System posts automatically

### Sync Updates (Future Feature)

Keep marketplace listings in sync:
1. Update price/quantity in Inventory
2. System syncs to all active marketplaces
3. Listings update automatically

## Support

### Getting Help

- **Platform Setup Issues:** Visit Channels page
- **Connection Errors:** Check credentials in environment variables
- **Listing Errors:** See error message in results dialog
- **Technical Issues:** Check browser console (F12) for details

### Error Codes Reference

| Code | Meaning | Fix |
|------|---------|-----|
| `{platform}_not_connected` | Platform account not connected | Visit Channels page, connect account |
| `credentials_missing` | API credentials not configured | Set environment variables |
| `bridge_unreachable` | Python service not running | Start `scripts/ebay_listing_service.py` |
| `token_refresh_failed` | OAuth token expired | Reconnect platform account |
| `listing_failed` | Platform rejected listing | Check product details (title, price, qty) |

## FAQ

**Q: Can I post to different platforms for different products?**
A: Yes! Each product can be posted to any combination of platforms independently.

**Q: What happens in Preview Mode?**
A: Nothing is created. System tests the posting flow and shows you what would happen.

**Q: Can I post the same product multiple times?**
A: Yes, but it will create duplicate listings. Use Preview Mode first to avoid duplicates.

**Q: Does posting update my inventory?**
A: No, posting doesn't change quantity. Manage inventory separately.

**Q: Can I edit or delete posted listings from here?**
A: Not yet — those features are coming. Edit on each marketplace directly for now.

**Q: How long does posting take?**
A: Typically 1-5 seconds per platform, depending on platform speed.

**Q: What if one platform fails?**
A: Other platforms still post successfully. You can retry the failed one separately.

**Q: Can I post without images?**
A: Yes, but products sell better with images. Add images to product first.

**Q: Is there a limit to how many products I can post?**
A: No technical limit, but posting is slower on slower internet connections.

---

**Ready to post?** Go to `/inventory`, find your product, and click "Post"! 🚀
