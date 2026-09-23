-- Migration 0020: Add inventory sync fields
-- Extends the products table with manual sync tracking for BossLister

-- Add sync-related fields to products table if they don't exist
ALTER TABLE products ADD COLUMN IF NOT EXISTS synced_to jsonb DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'failed'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS sync_error text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_synced_at timestamp;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ebay_item_id text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS external_ids jsonb DEFAULT '{}';

-- Create index for sync_status lookups
CREATE INDEX IF NOT EXISTS idx_products_sync_status ON products(sync_status);

-- Create index for source + sync_status for filtering
CREATE INDEX IF NOT EXISTS idx_products_source_sync_status ON products(source, sync_status);

-- Add comment
COMMENT ON COLUMN products.synced_to IS 'JSON array of platform names where item is synced: ["etsy", "facebook", "tiktok"]';
COMMENT ON COLUMN products.sync_status IS 'Sync state: pending (not synced), synced (at least one platform), failed (error occurred)';
COMMENT ON COLUMN products.sync_error IS 'Latest error message if sync_status is failed';
COMMENT ON COLUMN products.last_synced_at IS 'Timestamp of last successful sync attempt';
COMMENT ON COLUMN products.ebay_item_id IS 'eBay listing ID for imported items';
COMMENT ON COLUMN products.external_ids IS 'JSON object mapping platform names to external listing IDs: {"ebay_id": "...", "etsy_id": "...", "facebook_id": "..."}';
