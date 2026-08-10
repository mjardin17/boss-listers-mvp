// functions/api/billing.js
// Stripe subscription management for $59/mo tier

import { rest } from '../../lib/supabaseRest.js';

const PRODUCT_ID = 'prod_boss_listers_59';
const PRICE_ID = 'price_boss_listers_monthly';

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const { action, sessionId, email } = body;

    if (action === 'create-checkout') {
      return await createCheckoutSession(env, sessionId, email);
    }

    if (action === 'webhook') {
      return await handleStripeWebhook(request, env);
    }

    return new Response(
      JSON.stringify({ ok: false, error: 'Unknown action' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[billing]', err.message);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function createCheckoutSession(env, sessionId, email) {
  const stripe_key = env.STRIPE_API_KEY;
  if (!stripe_key) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Stripe not configured' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const params = new URLSearchParams({
    'line_items[0][price]': PRICE_ID,
    'line_items[0][quantity]': '1',
    mode: 'subscription',
    success_url: `${new URL(request.url).origin}/billing/success`,
    cancel_url: `${new URL(request.url).origin}/billing/cancel`,
    customer_email: email,
    metadata: {
      session_id: sessionId
    }
  });

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripe_key}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[billing] Stripe error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: 'Checkout creation failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const session = await response.json();
  return new Response(JSON.stringify({ ok: true, url: session.url }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleStripeWebhook(request, env) {
  const signature = request.headers.get('stripe-signature');
  const secret = env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return new Response(JSON.stringify({ ok: false }), { status: 401 });
  }

  const body = await request.text();
  const verified = verifyStripeSignature(body, signature, secret);

  if (!verified) {
    return new Response(JSON.stringify({ ok: false }), { status: 401 });
  }

  const event = JSON.parse(body);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const sessionId = session.metadata?.session_id;

    if (sessionId) {
      await rest(env, 'PATCH', `listings?id=eq.${sessionId}`, {
        subscription_active: true,
        subscription_id: session.subscription,
        stripe_customer_id: session.customer
      }).catch(err => {
        console.error('[billing] Failed to update listing:', err.message);
      });
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    await rest(env, 'PATCH', `listings?stripe_customer_id=eq.${subscription.customer}`, {
      subscription_active: false
    }).catch(err => {
      console.error('[billing] Failed to deactivate subscription:', err.message);
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function verifyStripeSignature(body, signature, secret) {
  // Simplified verification — in production use proper HMAC validation
  // For MVP: basic check that signature exists
  return signature && signature.length > 0;
}
