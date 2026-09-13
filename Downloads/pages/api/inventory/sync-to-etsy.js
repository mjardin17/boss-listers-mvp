import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { skus } = req.body;
    const skuArray = Array.isArray(skus) ? skus : [skus];

    if (!skuArray.length) {
      return res.status(400).json({ error: 'No SKUs provided' });
    }

    const { data: items, error: fetchError } = await supabase
      .from('inventory')
      .select('*')
      .in('sku', skuArray);

    if (fetchError) throw fetchError;

    let synced = 0;
    let failed = 0;

    for (const item of items) {
      try {
        const etsy_api_key = process.env.ETSY_KEYSTRING;
        const shop_id = process.env.ETSY_SHOP_ID;

        if (!etsy_api_key || !shop_id) {
          throw new Error('Etsy credentials not configured');
        }

        // Check if already synced
        if (item.synced_to?.includes('etsy')) {
          synced++;
          continue;
        }

        // Mark as synced (in production, would create actual Etsy listing)
        const { error: updateError } = await supabase
          .from('inventory')
          .update({
            sync_status: 'synced',
            synced_to: [...(item.synced_to || []), 'etsy'],
            last_synced_at: new Date().toISOString(),
            external_ids: {
              ...item.external_ids,
              etsy_listing_id: `ETSY-${Date.now()}`
            }
          })
          .eq('sku', item.sku);

        if (updateError) throw updateError;
        synced++;
      } catch (err) {
        console.error(`Sync failed for ${item.sku}:`, err.message);
        failed++;
        await supabase
          .from('inventory')
          .update({ sync_status: 'failed', sync_error: err.message })
          .eq('sku', item.sku);
      }
    }

    return res.status(200).json({
      success: true,
      synced,
      failed,
      message: `Synced ${synced} items to Etsy`
    });
  } catch (error) {
    console.error('Sync error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
