import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  dispatchStripeEvent,
  verifyStripeSignature,
  type StripeWebhookPayload,
} from './handlers';

/**
 * Stripe webhook entry point. Verifies the signature, parses the payload,
 * and hands the event off to a per-event-type handler in `./handlers`.
 *
 * Per-event logic lives in `./handlers/<event-name>.ts` so this file only
 * does transport: signature, parse, dispatch. Returns 200 even for unknown
 * event types to prevent Stripe retry storms.
 */
export async function POST(request: NextRequest) {
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    const rawBody = await request.text();
    const signature = request.headers.get('Stripe-Signature');
    if (!signature) {
      console.error('Missing Stripe-Signature header');
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }

    if (!verifyStripeSignature(rawBody, signature, webhookSecret)) {
      console.error('Invalid Stripe webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload: StripeWebhookPayload = JSON.parse(rawBody);
    const eventType = payload.type;
    const eventData = payload.data.object;

    console.log(`Received Stripe webhook: ${eventType}`, {
      event_id: payload.id,
      customer: eventData.customer,
      livemode: payload.livemode,
    });

    const supabase = createServerClient();
    await dispatchStripeEvent(eventType, eventData, supabase);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

// Stripe only sends POST requests for webhooks
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
