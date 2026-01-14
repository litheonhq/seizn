/**
 * Consent Manager for Network Learning
 *
 * Manages user consent for data collection with granular control
 * over what types of signals can be collected.
 */

import { createServerClient } from '@/lib/supabase';
import type {
  ConsentStatus,
  SignalType,
  UserConsent,
  ConsentRecord,
  NetworkLearningConfig,
} from '../types';
import { DEFAULT_NETWORK_LEARNING_CONFIG } from '../types';

// ============================================
// Constants
// ============================================

const ALL_SIGNAL_TYPES: SignalType[] = [
  'query_pattern',
  'plan_path',
  'retrieval_metric',
  'feedback',
];

// ============================================
// Consent Operations
// ============================================

/**
 * Get current consent status for a user
 */
export async function getConsent(userId: string): Promise<UserConsent | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('network_learning_consent')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Failed to get consent:', error);
    throw error;
  }

  if (!data) {
    return null;
  }

  return recordToUserConsent(data as ConsentRecord);
}

/**
 * Opt in to network learning
 */
export async function optIn(
  userId: string,
  dataTypes: SignalType[] = ALL_SIGNAL_TYPES,
  config: NetworkLearningConfig = DEFAULT_NETWORK_LEARNING_CONFIG
): Promise<UserConsent> {
  const supabase = createServerClient();

  // Validate data types
  const validDataTypes = dataTypes.filter((dt) => ALL_SIGNAL_TYPES.includes(dt));

  if (validDataTypes.length === 0) {
    throw new Error('At least one valid data type must be selected');
  }

  const now = new Date().toISOString();

  // Check for existing consent record
  const existing = await getConsent(userId);

  if (existing) {
    // Update existing record
    const { data, error } = await supabase
      .from('network_learning_consent')
      .update({
        status: 'opted_in' as ConsentStatus,
        data_types: validDataTypes,
        consented_at: now,
        revoked_at: null,
        version: config.consentVersion,
        updated_at: now,
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Failed to update consent:', error);
      throw error;
    }

    return recordToUserConsent(data as ConsentRecord);
  }

  // Create new consent record
  const { data, error } = await supabase
    .from('network_learning_consent')
    .insert({
      user_id: userId,
      status: 'opted_in' as ConsentStatus,
      data_types: validDataTypes,
      consented_at: now,
      revoked_at: null,
      version: config.consentVersion,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create consent:', error);
    throw error;
  }

  return recordToUserConsent(data as ConsentRecord);
}

/**
 * Opt out of network learning
 */
export async function optOut(userId: string): Promise<UserConsent> {
  const supabase = createServerClient();
  const now = new Date().toISOString();

  const existing = await getConsent(userId);

  if (existing) {
    // Update existing record to opted out
    const { data, error } = await supabase
      .from('network_learning_consent')
      .update({
        status: 'opted_out' as ConsentStatus,
        revoked_at: now,
        updated_at: now,
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Failed to update consent:', error);
      throw error;
    }

    return recordToUserConsent(data as ConsentRecord);
  }

  // Create new opt-out record (user explicitly opted out without prior consent)
  const { data, error } = await supabase
    .from('network_learning_consent')
    .insert({
      user_id: userId,
      status: 'opted_out' as ConsentStatus,
      data_types: [],
      consented_at: null,
      revoked_at: now,
      version: DEFAULT_NETWORK_LEARNING_CONFIG.consentVersion,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create opt-out record:', error);
    throw error;
  }

  return recordToUserConsent(data as ConsentRecord);
}

/**
 * Update consented data types
 */
export async function updateDataTypes(
  userId: string,
  dataTypes: SignalType[]
): Promise<UserConsent> {
  const supabase = createServerClient();

  const existing = await getConsent(userId);

  if (!existing || existing.status !== 'opted_in') {
    throw new Error('User must be opted in to update data types');
  }

  const validDataTypes = dataTypes.filter((dt) => ALL_SIGNAL_TYPES.includes(dt));

  if (validDataTypes.length === 0) {
    // If no valid types, treat as opt-out
    return optOut(userId);
  }

  const { data, error } = await supabase
    .from('network_learning_consent')
    .update({
      data_types: validDataTypes,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('Failed to update data types:', error);
    throw error;
  }

  return recordToUserConsent(data as ConsentRecord);
}

// ============================================
// Consent Verification
// ============================================

/**
 * Check if a user has consented to a specific signal type
 */
export async function hasConsent(
  userId: string,
  signalType: SignalType
): Promise<boolean> {
  const consent = await getConsent(userId);

  if (!consent) {
    return false;
  }

  return (
    consent.status === 'opted_in' &&
    consent.dataTypes.includes(signalType)
  );
}

/**
 * Check if a user has consented to all specified signal types
 */
export async function hasAllConsents(
  userId: string,
  signalTypes: SignalType[]
): Promise<boolean> {
  const consent = await getConsent(userId);

  if (!consent || consent.status !== 'opted_in') {
    return false;
  }

  return signalTypes.every((st) => consent.dataTypes.includes(st));
}

/**
 * Get list of users who have consented to a specific signal type
 * Used for batch operations with proper consent verification
 */
export async function getConsentedUsers(
  signalType: SignalType,
  limit: number = 1000
): Promise<string[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('network_learning_consent')
    .select('user_id')
    .eq('status', 'opted_in')
    .contains('data_types', [signalType])
    .limit(limit);

  if (error) {
    console.error('Failed to get consented users:', error);
    throw error;
  }

  return (data ?? []).map((r) => r.user_id);
}

// ============================================
// Helper Functions
// ============================================

function recordToUserConsent(record: ConsentRecord): UserConsent {
  return {
    userId: record.user_id,
    status: record.status,
    dataTypes: record.data_types,
    consentedAt: record.consented_at ?? undefined,
    revokedAt: record.revoked_at ?? undefined,
    version: record.version,
  };
}

/**
 * Get all available signal types
 */
export function getAvailableSignalTypes(): SignalType[] {
  return [...ALL_SIGNAL_TYPES];
}
