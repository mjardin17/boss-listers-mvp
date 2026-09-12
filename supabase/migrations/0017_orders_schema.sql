-- Orders table: unified view of orders from all marketplaces
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Order identifiers
  marketplace_order_id TEXT NOT NULL, -- eBay order ID, Amazon order ID, etc
  marketplace TEXT NOT NULL, -- 'ebay', 'etsy', 'amazon', 'tiktok_shop'

  -- Buyer info
  buyer_name TEXT,
  buyer_email TEXT,
  buyer_id TEXT,

  -- Order details
  order_status TEXT DEFAULT 'pending', -- pending, paid, shipped, delivered, cancelled, refunded
  total_price DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',

  -- Shipping info
  ship_address_line1 TEXT,
  ship_address_line2 TEXT,
  ship_address_city TEXT,
  ship_address_state TEXT,
  ship_address_postal_code TEXT,
  ship_address_country TEXT,

  -- Fulfillment tracking
  tracking_number TEXT,
  carrier TEXT, -- USPS, UPS, FedEx, etc
  shipped_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  raw_data JSONB, -- Store full order data from marketplace
  notes TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Composite unique: tenant + marketplace + marketplace_order_id
  UNIQUE(tenant_id, marketplace, marketplace_order_id)
);

-- Order items: individual products in each order
CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Product info
  sku TEXT,
  title TEXT NOT NULL,
  description TEXT,

  -- Pricing
  unit_price DECIMAL(10,2),
  quantity INTEGER DEFAULT 1,
  subtotal DECIMAL(10,2),

  -- Marketplace specific
  marketplace_item_id TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Orders: tenants see their own" ON orders
  FOR SELECT USING (tenant_id IN (SELECT public.my_tenant_ids()));

CREATE POLICY "Orders: tenants update their own" ON orders
  FOR UPDATE USING (tenant_id IN (SELECT public.my_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.my_tenant_ids()));

CREATE POLICY "Order items: tenants see their own" ON order_items
  FOR SELECT USING (tenant_id IN (SELECT public.my_tenant_ids()));

-- The API routes (pages/api/orders/*) read and write through the service
-- role key, same pattern as listings/marketplace_events (see 0008) — this
-- project's newer tables don't inherit default service_role grants, so it
-- must be explicit or every request 500s with "permission denied".
GRANT ALL ON orders, order_items TO service_role;

-- Indexes for performance
CREATE INDEX orders_tenant_id_idx ON orders(tenant_id);
CREATE INDEX orders_marketplace_idx ON orders(marketplace);
CREATE INDEX orders_status_idx ON orders(order_status);
CREATE INDEX orders_created_at_idx ON orders(created_at DESC);
CREATE INDEX order_items_order_id_idx ON order_items(order_id);
CREATE INDEX order_items_sku_idx ON order_items(sku);
