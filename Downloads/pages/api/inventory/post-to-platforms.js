// POST /api/inventory/post-to-platforms
// Post a product to multiple platforms simultaneously
// Body: { productSKU, platforms: ['ebay', 'etsy', 'amazon', 'tiktok-shop'] }

import { createClient } from '@supabase/supabase-js';
import { postProductToAllPlatforms } from '../../lib/multiPlatformPoster.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { productSKU, platforms, dryRun = true, confirm } = req.body;

    // Validate input
    if (!productSKU || typeof productSKU !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'productSKU is required and must be a string',
      });
    }

    if (!Array.isArray(platforms) || platforms.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'platforms must be a non-empty array',
      });
    }

    // Validate selected platforms
    const validPlatforms = ['ebay', 'etsy', 'amazon', 'tiktok-shop'];
    const invalidPlatforms = platforms.filter((p) => !validPlatforms.includes(p));
    if (invalidPlatforms.length > 0) {
      return res.status(400).json({
        ok: false,
        error: `Invalid platforms: ${invalidPlatforms.join(', ')}. Must be one of: ${validPlatforms.join(', ')}`,
      });
    }

    // Fetch product from database
    const { data: product, error: fetchError } = await supabase
      .from('listings')
      .select('*')
      .eq('sku', productSKU)
      .single();

    if (fetchError || !product) {
      return res.status(404).json({
        ok: false,
        error: `Product not found: ${productSKU}`,
      });
    }

    // Check quantity before posting
    if (product.quantity <= 0) {
      return res.status(400).json({
        ok: false,
        error: 'Cannot post product with zero quantity',
      });
    }

    // Post to platforms
    const postingResults = await postProductToAllPlatforms(
      {
        sku: product.sku,
        title: product.title,
        description: product.description || '',
        price: product.price,
        quantity: product.quantity,
        category: product.category || '',
        condition: product.condition || 'New',
        image_urls: product.image_urls || [],
        tags: product.tags || [],
      },
      platforms,
      {
        dryRun,
        confirm,
        tenantId: null, // TODO: Get from session/auth
      }
    );

    // Track successful listings in database
    const externalIds = product.external_ids || {};
    const syncedTo = product.synced_to || [];

    // Update external IDs with new listings
    for (const [platform, result] of Object.entries(postingResults)) {
      if (result.success) {
        externalIds[`${platform}_listing_id`] = result.listingId;
        externalIds[`${platform}_url`] = result.url;
        externalIds[`${platform}_posted_at`] = result.publishedAt;

        // Add platform to synced_to list if not already there
        if (!syncedTo.includes(platform)) {
          syncedTo.push(platform);
        }
      }
    }

    // Update product record in database
    const { error: updateError } = await supabase
      .from('listings')
      .update({
        external_ids: externalIds,
        synced_to: syncedTo,
        last_posted_at: new Date().toISOString(),
        sync_status: 'posted',
      })
      .eq('sku', productSKU);

    if (updateError) {
      console.error('[api/inventory/post-to-platforms] Update error:', updateError.message);
      // Don't fail the response if update fails — posting may have succeeded
      // but we couldn't persist the metadata
    }

    // Return comprehensive results
    return res.status(200).json({
      ok: true,
      productSKU,
      dryRun,
      results: postingResults,
      summary: {
        total: platforms.length,
        successful: Object.values(postingResults).filter((r) => r.success).length,
        failed: Object.values(postingResults).filter((r) => !r.success).length,
      },
    });
  } catch (err) {
    console.error('[api/inventory/post-to-platforms] Error:', err.message);
    return res.status(500).json({
      ok: false,
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }
}
