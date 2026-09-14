import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { source, status } = req.query;
    let query = supabase.from('inventory').select('*');

    if (source && source !== 'all') {
      query = query.eq('source', source);
    }

    if (status && status !== 'all') {
      query = query.eq('sync_status', status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    return res.status(200).json({
      success: true,
      items: data || [],
      count: (data || []).length
    });
  } catch (error) {
    console.error('List error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
