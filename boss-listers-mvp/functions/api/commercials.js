// functions/api/commercials.js
// Trigger and track commercial generation — tenant-scoped.
//
// Previously unscoped: this route used the service-role REST client
// (bypasses RLS) with no tenant_id filter at all, so once auth.js turned
// on real authentication, any signed-up tenant could read or create
// commercial_jobs belonging to any other tenant just by guessing/reusing
// a jobId. Fixed by requiring data.tenantId (from _middleware.js) on
// every query, same pattern as lib/supabaseListings.js.

import { rest } from '../../lib/supabaseRest.js';

export async function onRequestGet({ request, env, data }) {
  try {
    const url = new URL(request.url);
    const jobId = url.searchParams.get('jobId');

    if (!jobId) {
      return new Response(
        JSON.stringify({ ok: false, error: 'jobId required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const rows = await rest(
      env,
      'GET',
      `commercial_jobs?id=eq.${encodeURIComponent(jobId)}&tenant_id=eq.${encodeURIComponent(data.tenantId)}`,
    );
    if (!rows.length) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ ok: true, job: rows[0] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('[commercials GET]', err.message);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function onRequestPost({ request, env, data }) {
  try {
    const body = await request.json();
    const { listingId, images, productName, description, price, sessionId } = body;

    if (!listingId || !images || images.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verify the listing being turned into a commercial actually belongs
    // to the caller's tenant before creating anything or spending on the
    // video pipeline webhook with someone else's data.
    const owned = await rest(
      env,
      'GET',
      `listings?id=eq.${encodeURIComponent(listingId)}&tenant_id=eq.${encodeURIComponent(data.tenantId)}&select=id`,
    );
    if (!owned.length) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Listing not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const jobId = `commercial_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    await rest(env, 'POST', 'commercial_jobs', {
      id: jobId,
      tenant_id: data.tenantId,
      listing_id: listingId,
      product_name: productName,
      images: images,
      description: description,
      price: price,
      status: 'pending',
      created_at: new Date().toISOString(),
      session_id: sessionId
    });

    if (env.VIDEO_PIPELINE_WEBHOOK_URL) {
      queueVideoGeneration(env, jobId, {
        listingId,
        images,
        productName,
        description,
        price
      }).catch(err => {
        console.error('[commercials] Webhook queue failed:', err.message);
      });
    }

    return new Response(
      JSON.stringify({ ok: true, jobId, status: 'queued' }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[commercials POST]', err.message);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function queueVideoGeneration(env, jobId, data) {
  const payload = {
    type: 'generate_commercial',
    job_id: jobId,
    ...data
  };

  await fetch(env.VIDEO_PIPELINE_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': env.VIDEO_PIPELINE_WEBHOOK_SECRET || ''
    },
    body: JSON.stringify(payload)
  });
}
