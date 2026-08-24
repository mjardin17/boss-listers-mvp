// functions/api/billing.js
// Stripe subscription management for $59/mo tier.
//
// This route is exempt from the standard Supabase-auth middleware (see
// functions/_middleware.js PUBLIC_PATHS) because Stripe's own webhook
// calls this endpoint directly and cannot carry a Supabase bearer token.
// Instead:
//   - action=webhook is authenticated by verifying the real Stripe
//     signature (previously this was a stub that accepted ANY non-empty
//     signature header — a forged-webhook vulnerability found in review:
//     anyone could POST a fake checkout.session.completed and flip any
//     listing's subscription_active to true).
//   - action=create-checkout is authenticated manually via resolveSession,
//     since middleware doesn't run for this path.
//
// Also fixed: createCheckoutSession referenced `request.url` without
// `request` being in scope — every checkout attempt threw a
// ReferenceError before this fix. And Stripe metadata now carries
// tenant_id so the webhook can attribute subscriptions correctly instead
// of trusting a client-supplied sessionId alone.

import { rest } from '../lib/supabaseRest.js';
import { resolveSession } from '../lib/supabaseAuth.js';

const PRICE_ID = 'price_boss_listers_monthly';

export async function onRequestPost({ request, env }) {
  try {
    if (request.headers.get('content-type')?.includes('application/json')) {
      const body = await request.clone().json().catch(() => ({}));
      if (body.action === 'create-checkout') {
        const authHeader = request.headers.get('authorization') || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        const session = token ? await resolveSession(env, token) : null;
        if (!session) {
          return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
        }
        return await createCheckoutSession(env, request, session.tenantId, body.email);
      }
    }

    if (request.headers.get('stripe-signature')) {
      return await handleStripeWebhook(request, env);
    }

    return jsonResponse({ ok: false, error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('[billing]', err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function createCheckoutSession(env, request, tenantId, email) {
  const stripe_key = env.STRIPE_API_KEY;
  if (!stripe_key) {
    return jsonResponse({ ok: false, error: 'Stripe not configured' }, 503);
  }

  const origin = new URL(request.url).origin;
  const params = new URLSearchParams({
    'line_items[0][price]': PRICE_ID,
    'line_items[0][quantity]': '1',
    mode: 'subscription',
    success_url: `${origin}/billing/success`,
    cancel_url: `${origin}/billing/cancel`,
    customer_email: email || '',
    'metadata[tenant_id]': tenantId,
  });

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripe_key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    console.error('[billing] Stripe error:', await response.text());
    return jsonResponse({ ok: false, error: 'Checkout creation failed' }, 500);
  }

  const session = await response.json();
  return jsonResponse({ ok: true, url: session.url });
}

async function handleStripeWebhook(request, env) {
  const signature = request.headers.get('stripe-signature');
  const secret = env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return jsonResponse({ ok: false }, 401);
  }

  const body = await request.text();
  const verified = await verifyStripeSignature(body, signature, secret);
  if (!verified) {
    return jsonResponse({ ok: false, error: 'Invalid signature' }, 401);
  }

  const event = JSON.parse(body);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const tenantId = session.metadata?.tenant_id;

    if (tenantId) {
      await rest(
        env,
        'POST',
        'subscriptions?on_conflict=id',
        {
          id: session.subscription,
          tenant_id: tenantId,
          session_id: session.metadata?.session_id || null,
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
          status: 'active',
        },
        { Prefer: 'resolution=merge-duplicates' },
      ).catch((err) => {
        console.error('[billing] Failed to record subscription:', err.message);
      });
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    await rest(
      env,
      'PATCH',
      `subscriptions?stripe_customer_id=eq.${encodeURIComponent(subscription.customer)}`,
      { status: 'canceled' },
    ).catch((err) => {
      console.error('[billing] Failed to deactivate subscription:', err.message);
    });
  }

  return jsonResponse({ ok: true });
}

// Real Stripe signature verification (HMAC-SHA256 over "timestamp.payload",
// constant-time compare) using Web Crypto — Workers has no Node `crypto`
// module, but `crypto.subtle` is available natively.
async function verifyStripeSignature(payload, signatureHeader, secret) {
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => p.split('=').map((s) => s.trim())),
  );
  const timestamp = parts.t;
  const expectedSig = parts.v1;
  if (!timestamp || !expectedSig) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  const computedSig = Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (computedSig.length !== expectedSig.length) return false;
  let diff = 0;
  for (let i = 0; i < computedSig.length; i++) {
    diff |= computedSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  return diff === 0;
}
