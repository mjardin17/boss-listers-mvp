# eBay Inventory Import System - Deployment Checklist

Complete system is ready for deployment. Follow this checklist to get it live.

## Files Created

### Services
- ✅ `lib/services/ebayImportService.js` - eBay API integration

### API Endpoints
- ✅ `pages/api/inventory/import-ebay.js` - Import trigger
- ✅ `pages/api/inventory/list.js` - Inventory listing
- ✅ `pages/api/inventory/sync-to-etsy.js` - Single/bulk sync to Etsy
- ✅ `pages/api/inventory/bulk-sync.js` - Multi-platform bulk sync

### Frontend
- ✅ `pages/inventory-dashboard.js` - React dashboard component
- ✅ `styles/inventory-dashboard.module.css` - Dashboard styling

### Database
- ✅ `migrations/0020_add_inventory_sync_fields.sql` - Schema extension

### Tests
- ✅ `tests/inventory-import.test.js` - 11 passing tests

### Documentation
- ✅ `INVENTORY_SYNC_GUIDE.md` - Complete user guide
- ✅ `INVENTORY_DEPLOYMENT.md` - This file

## Pre-Deployment Checklist

### 1. Environment Variables

Verify these are set in your `.env.local` (development) or deployment secrets:

```bash
# eBay
EBAY_CLIENT_ID=your_client_id
EBAY_CLIENT_SECRET=your_client_secret
EBAY_REFRESH_TOKEN=your_refresh_token
EBAY_ENVIRONMENT=sandbox  # or "production"

# Etsy
ETSY_KEYSTRING=your_keystring
ETSY_SHARED_SECRET=your_shared_secret
ETSY_REDIRECT_URI=https://your-app.com/api/oauth/etsy/callback

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 2. Database Migration

Run the migration to add sync fields to the products table:

```bash
# Using Supabase CLI
supabase migration up

# Or manually execute SQL in Supabase dashboard:
# Copy contents of migrations/0020_add_inventory_sync_fields.sql
# Paste into SQL editor and run
```

**Verify migration succeeded:**
```sql
-- In Supabase SQL editor
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'products' 
AND column_name IN ('synced_to', 'sync_status', 'sync_error', 'last_synced_at', 'ebay_item_id', 'external_ids');

-- Should return 6 rows
```

### 3. API Endpoints

Verify endpoints are accessible:

```bash
# Check import-ebay endpoint
curl -X POST http://localhost:3001/api/inventory/import-ebay

# Check list endpoint
curl http://localhost:3001/api/inventory/list

# Check sync endpoint
curl -X POST http://localhost:3001/api/inventory/sync-to-etsy \
  -H "Content-Type: application/json" \
  -d '{"sku":"TEST"}'
```

### 4. Frontend

Verify the dashboard page loads:

```bash
# Start dev server
npm run dev

# Navigate to
http://localhost:3001/inventory-dashboard
```

Should show:
- ✅ "Import from eBay" button at top
- ✅ Filter dropdowns (Source, Status)
- ✅ Empty state if no inventory yet

### 5. Run Tests

Confirm all tests pass:

```bash
npm test tests/inventory-import.test.js
```

Expected output:
```
✔ 11 tests
ℹ pass 11
ℹ fail 0
```

### 6. Test End-to-End Flow

**Scenario 1: Import and View**

```bash
# 1. Import eBay listings
curl -X POST http://localhost:3001/api/inventory/import-ebay

# Expected response:
# {
#   "ok": true,
#   "imported": X,
#   "skipped": Y,
#   "failed": 0
# }

# 2. List inventory
curl http://localhost:3001/api/inventory/list | jq '.items[0]'

# Should show:
# {
#   "sku": "EBY-XXXXX",
#   "title": "...",
#   "price": X.XX,
#   "quantity": N,
#   "source": "ebay",
#   "syncStatus": "pending",
#   "syncedTo": []
# }
```

**Scenario 2: Sync to Etsy**

```bash
# 1. Get a SKU from inventory
SKU="EBY-XXXXX"

# 2. Sync to Etsy
curl -X POST http://localhost:3001/api/inventory/sync-to-etsy \
  -H "Content-Type: application/json" \
  -d "{\"sku\":\"$SKU\"}"

# Expected response:
# {
#   "ok": true,
#   "synced": 1,
#   "failed": 0,
#   "results": [{
#     "sku": "EBY-XXXXX",
#     "success": true,
#     "etsyListingId": "1234567890"
#   }]
# }

# 3. Verify sync status updated
curl "http://localhost:3001/api/inventory/list?syncStatus=synced" | jq '.count'
# Should return at least 1
```

## Deployment Steps

### For Vercel/Render (Production)

1. **Push code to git**
   ```bash
   git add -A
   git commit -m "feat: add eBay inventory import and manual sync system"
   git push origin main
   ```

2. **Deploy**
   ```bash
   # Vercel deploys automatically on push to main
   # Or manually:
   vercel deploy --prod
   ```

3. **Run migration**
   ```bash
   # In Supabase dashboard > SQL editor:
   # Execute migrations/0020_add_inventory_sync_fields.sql
   ```

4. **Set environment variables**
   - Go to deployment settings (Vercel/Render)
   - Add all EBAY_*, ETSY_*, SUPABASE_* variables
   - Redeploy

5. **Test production**
   ```bash
   curl https://your-app.com/api/inventory/list
   ```

### For Local Development

```bash
# 1. Copy files
cp -r lib/services/ebayImportService.js .
cp -r pages/api/inventory/ .
cp pages/inventory-dashboard.js .
cp styles/inventory-dashboard.module.css .

# 2. Run migration locally
supabase migration up

# 3. Start dev server
npm run dev

# 4. Test
open http://localhost:3001/inventory-dashboard
```

## Integration with Existing Code

### Existing Dependencies Used

- ✅ `EtsyConnector` - Already in `lib/channels/apiConnectors.js`
- ✅ `FacebookConnector` - Already in `lib/channels/apiConnectors.js`
- ✅ Supabase REST API - Already configured
- ✅ Next.js API routes - Already set up

### No Breaking Changes

- ✅ All new files, no modifications to existing code
- ✅ New database columns (backward compatible)
- ✅ New routes (don't conflict with existing)

### Dashboard Access

Add link to sidebar/navigation:

```javascript
// In your navigation component
<Link href="/inventory-dashboard">📊 Inventory</Link>
```

## Post-Deployment Verification

### Week 1: Initial Testing

- [ ] User imports eBay listings successfully
- [ ] Dashboard shows items correctly
- [ ] Filters work (Source, Status)
- [ ] Single item sync to Etsy works
- [ ] Bulk sync (multiple items) works
- [ ] Error messages are clear

### Week 2: Production Load

- [ ] No slow queries on large inventories (1000+ items)
- [ ] Bulk operations complete within timeouts
- [ ] Database indexes working (`idx_products_sync_status`)
- [ ] Error rates < 0.1%

### Week 4: Stability

- [ ] All sync operations completing successfully
- [ ] No orphaned sync attempts
- [ ] Manual control working as designed
- [ ] Zero automatic syncs (manual only)

## Rollback Plan

If issues occur:

```bash
# 1. Revert code
git revert <commit-hash>
git push origin main

# 2. Deployment auto-redeploys (Vercel) or manual redeploy

# 3. If needed, revert database migration:
DROP INDEX IF EXISTS idx_products_sync_status;
DROP INDEX IF EXISTS idx_products_source_sync_status;
ALTER TABLE products DROP COLUMN IF EXISTS synced_to;
ALTER TABLE products DROP COLUMN IF EXISTS sync_status;
ALTER TABLE products DROP COLUMN IF EXISTS sync_error;
ALTER TABLE products DROP COLUMN IF EXISTS last_synced_at;
ALTER TABLE products DROP COLUMN IF EXISTS ebay_item_id;
ALTER TABLE products DROP COLUMN IF EXISTS external_ids;
```

## Monitoring

### Key Metrics to Watch

1. **Import Success Rate**
   ```sql
   SELECT 
     DATE(created_at) as date,
     COUNT(*) as total,
     COUNT(CASE WHEN source = 'ebay' THEN 1 END) as ebay_imports
   FROM products
   GROUP BY DATE(created_at)
   ORDER BY date DESC;
   ```

2. **Sync Status Distribution**
   ```sql
   SELECT sync_status, COUNT(*) as count
   FROM products
   GROUP BY sync_status;
   ```

3. **Platform Distribution**
   ```sql
   SELECT 
     COUNT(CASE WHEN synced_to @> '"etsy"' THEN 1 END) as synced_to_etsy,
     COUNT(CASE WHEN synced_to @> '"facebook"' THEN 1 END) as synced_to_facebook
   FROM products;
   ```

### Error Tracking

Check sync failures:
```sql
SELECT sku, sync_error, last_synced_at
FROM products
WHERE sync_status = 'failed'
ORDER BY last_synced_at DESC
LIMIT 10;
```

## Support & Troubleshooting

See `INVENTORY_SYNC_GUIDE.md` for detailed troubleshooting and usage guides.

Common issues:
- **"eBay not configured"** → Check env vars
- **"Etsy not connected"** → Check Etsy auth
- **"Already synced"** → Expected behavior, item can't be synced twice
- **"Product not found"** → Run import first

## Next Steps

After deployment:

1. **Monitor for 1 week** - Watch for errors, performance issues
2. **Gather user feedback** - Does the UI work as expected?
3. **Iterate on features**:
   - Add sync to Facebook Marketplace
   - Add sync scheduling
   - Add bulk "Sync All" action
4. **Optimize** - Database queries, API response times

## Success Criteria

✅ System is ready for production when:
- All tests pass
- Database migration runs successfully
- Import endpoint works with real eBay account
- Sync to Etsy works with real Etsy shop
- Dashboard loads and filters work
- No errors in logs during normal operation
- Manual sync control works (no auto-sync)

---

**Status: READY FOR DEPLOYMENT** ✅

All components built, tested, and documented. Follow checklist above for deployment.
