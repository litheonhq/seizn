import type { createServerClient } from '@/lib/supabase';

export type StripeEventType =
  | 'checkout.session.completed'
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'invoice.paid'
  | 'invoice.payment_failed'
  | 'customer.created'
  | 'customer.updated';

export interface StripeWebhookPayload {
  id: string;
  object: 'event';
  api_version: string;
  created: number;
  data: {
    object: StripeEventObject;
    previous_attributes?: Record<string, unknown>;
  };
  livemode: boolean;
  pending_webhooks: number;
  request: {
    id: string | null;
    idempotency_key: string | null;
  };
  type: StripeEventType;
}

export interface StripeEventObject {
  id: string;
  object: string;
  // Checkout Session fields
  customer?: string;
  subscription?: string;
  mode?: 'payment' | 'setup' | 'subscription';
  payment_status?: string;
  status?: string;
  client_reference_id?: string | null;
  metadata?: Record<string, string>;
  customer_email?: string;
  // Subscription fields
  items?: { data: StripeSubscriptionItem[] };
  current_period_start?: number;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  canceled_at?: number | null;
  ended_at?: number | null;
  trial_start?: number | null;
  trial_end?: number | null;
  // Invoice fields
  billing_reason?: string;
  amount_paid?: number;
  amount_due?: number;
  currency?: string;
  hosted_invoice_url?: string;
  invoice_pdf?: string;
  // Customer fields
  email?: string;
  name?: string;
}

export interface StripeSubscriptionItem {
  id: string;
  object: 'subscription_item';
  price: {
    id: string;
    product: string;
    unit_amount: number | null;
    currency: string;
    recurring: {
      interval: 'day' | 'week' | 'month' | 'year';
      interval_count: number;
    } | null;
  };
  quantity: number;
}

export type SupabaseClient = ReturnType<typeof createServerClient>;

export interface ProfileUser {
  id: string;
  email?: string;
  full_name?: string;
}
