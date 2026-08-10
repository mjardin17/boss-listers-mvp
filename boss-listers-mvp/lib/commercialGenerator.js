// lib/commercialGenerator.js
// Auto-generate commercials from product listings

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export async function generateCommercial(env, listing) {
  try {
    const { images, productName, description, price } = listing;
    if (!images || images.length === 0) {
      console.error('[commercial] No images provided');
      return null;
    }

    // Queue commercial generation as background job
    // In production: send to Cloudflare Durable Object or external queue
    // For MVP: trigger Python subprocess on the server

    const jobId = `commercial_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Store job metadata in Supabase
    await env.SUPABASE_REST('POST', 'commercial_jobs', {
      id: jobId,
      listing_id: listing.id,
      product_name: productName,
      images: images,
      description: description,
      price: price,
      status: 'pending',
      created_at: new Date().toISOString()
    });

    // Trigger background generation (webhook to video-bot-pipeline)
    if (env.WEBHOOK_SECRET && env.VIDEO_PIPELINE_URL) {
      try {
        const payload = {
          type: 'generate_commercial',
          job_id: jobId,
          listing_id: listing.id,
          product_name: productName,
          images: images,
          description: description,
          price: price
        };

        const body = JSON.stringify(payload);
        const signature = await signWebhook(body, env.WEBHOOK_SECRET);

        await fetch(env.VIDEO_PIPELINE_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature
          },
          body: body
        }).catch(err => {
          console.error('[commercial] Webhook failed:', err.message);
          // Don't fail the listing if webhook fails
        });
      } catch (e) {
        console.error('[commercial] Failed to queue generation:', e.message);
      }
    }

    return { jobId, status: 'queued' };
  } catch (err) {
    console.error('[commercial] Error:', err.message);
    return null;
  }
}

async function signWebhook(body, secret) {
  const encoder = new TextEncoder();
  const data = encoder.encode(body);
  const keyData = encoder.encode(secret);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, data);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function getCommercialStatus(env, jobId) {
  try {
    const response = await env.SUPABASE_REST(
      'GET',
      `commercial_jobs?id=eq.${jobId}`
    );

    if (!response.data || response.data.length === 0) {
      return null;
    }

    return response.data[0];
  } catch (err) {
    console.error('[commercial] Error getting status:', err.message);
    return null;
  }
}
