import { findUser, logBillingEvent } from './utils';
import type { StripeEventObject, SupabaseClient } from './types';

export async function handleCustomerCreated(
  eventData: StripeEventObject,
  supabase: SupabaseClient,
): Promise<void> {
  console.log(`Customer created: ${eventData.id}`, {
    email: eventData.email,
    name: eventData.name,
  });

  // Try to associate customer with existing user by email.
  if (!eventData.email) return;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', eventData.email)
    .single();

  if (!profile) return;

  await supabase
    .from('profiles')
    .update({ stripe_customer_id: eventData.id })
    .eq('id', profile.id);

  await logBillingEvent(supabase, profile.id, 'customer_created', {
    customer_id: eventData.id,
    email: eventData.email,
  });
}

export async function handleCustomerUpdated(
  eventData: StripeEventObject,
  supabase: SupabaseClient,
): Promise<void> {
  console.log(`Customer updated: ${eventData.id}`, {
    email: eventData.email,
    name: eventData.name,
  });
  const user = await findUser(supabase, eventData.id, null);
  if (!user) return;
  await logBillingEvent(supabase, user.id, 'customer_updated', {
    customer_id: eventData.id,
    email: eventData.email,
    name: eventData.name,
  });
}
