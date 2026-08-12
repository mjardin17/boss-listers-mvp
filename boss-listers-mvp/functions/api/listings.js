// functions/api/listings.js
// GET/POST/DELETE listing history (via Supabase)

import { listListings, getListing, saveListing, deleteListing } from '../../lib/supabaseListings.js';

export async function onRequestGet({ request, env, data }) {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId') || null;
    const id = url.searchParams.get('id');

    if (id) {
      const listing = await getListing(env, data.tenantId, id);
      if (!listing) {
        return new Response(JSON.stringify({ ok: false, error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true, listing }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const listings = await listListings(env, data.tenantId, sessionId);
    return new Response(JSON.stringify({ ok: true, listings }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/listings GET]', err.message);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestPost({ request, env, data }) {
  try {
    const payload = await request.json();
    const listing = await saveListing(env, data.tenantId, payload);

    // Trigger commercial generation if images provided
    if (listing && listing.payload?.images && listing.payload.images.length > 0) {
      triggerCommercialGeneration(env, {
        listingId: listing.id,
        sessionId: listing.session_id,
        images: listing.payload.images,
        productName: listing.payload.productName || 'Product',
        description: listing.payload.description || '',
        price: listing.payload.price
      }).catch(err => {
        console.error('[listings] Commercial generation failed:', err.message);
        // Don't fail the listing if commercial generation fails
      });
    }

    return new Response(JSON.stringify({ ok: true, listing }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/listings POST]', err.message);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function triggerCommercialGeneration(env, data) {
  const jobId = `commercial_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // Store job in commercial_jobs table
  const response = await fetch(new URL('/api/commercials', env.SUPABASE_URL).toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({ ...data, jobId })
  });

  if (!response.ok) {
    console.error('[listings] Commercial API error:', response.statusText);
  }
}

export async function onRequestDelete({ request, env, data }) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return new Response(JSON.stringify({ ok: false, error: 'id required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const deleted = await deleteListing(env, data.tenantId, id);
    return new Response(JSON.stringify({ ok: true, deleted }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/listings DELETE]', err.message);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
