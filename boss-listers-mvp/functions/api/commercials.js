// functions/api/commercials.js
// Trigger and track commercial generation

import { rest } from '../../lib/supabaseRest.js';

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const jobId = url.searchParams.get('jobId');

    if (!jobId) {
      return new Response(
        JSON.stringify({ ok: false, error: 'jobId required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const job = await rest(env, 'GET', `commercial_jobs?id=eq.${jobId}`, null);
    if (!job.data || job.data.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ ok: true, job: job.data[0] }), {
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

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const { listingId, images, productName, description, price, sessionId } = body;

    if (!listingId || !images || images.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const jobId = `commercial_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Store job in Supabase
    await rest(env, 'POST', 'commercial_jobs', {
      id: jobId,
      listing_id: listingId,
      product_name: productName,
      images: images,
      description: description,
      price: price,
      status: 'pending',
      created_at: new Date().toISOString(),
      session_id: sessionId
    });

    // Queue video generation via webhook to video-bot-pipeline
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
