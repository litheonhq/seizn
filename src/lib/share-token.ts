/**
 * Share Token System
 * Unified token generation, validation, and expiration management for trace sharing
 */

import { createServerClient } from './supabase';
import { redactTrace, generateShareToken, calculateExpiry } from './sharing';
import type {
  RedactionProfile,
  ShareTraceRequest,
  ShareTraceResponse,
  SharedTraceRecord,
  TraceSnapshot,
  ExpiresIn,
} from './sharing/types';

// Re-export types for convenience
export type { RedactionProfile, ShareTraceRequest, ShareTraceResponse, ExpiresIn };

/**
 * Default redaction profile - masks PII and secrets by default
 */
export const DEFAULT_REDACTION: RedactionProfile = {
  pii: true,
  secrets: true,
  raw_content: false,
};

/**
 * Generate a short, URL-friendly share ID (8 characters)
 */
export function generateShortShareId(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const randomValues = new Uint8Array(8);

  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(randomValues);
  } else {
    // Node.js fallback
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { randomBytes } = require('crypto');
    const bytes = randomBytes(8);
    randomValues.set(bytes);
  }

  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars[randomValues[i] % chars.length];
  }

  return result;
}

/**
 * Expiry durations mapping
 */
const EXPIRY_DURATIONS: Record<ExpiresIn, number | null> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  'never': null,
};

/**
 * Create a shareable link for a trace
 */
export async function createShareLink(params: {
  traceId: string;
  userId: string;
  traceSnapshot: TraceSnapshot;
  expiresIn?: ExpiresIn;
  redactionProfile?: Partial<RedactionProfile>;
}): Promise<ShareTraceResponse> {
  const {
    traceId,
    userId,
    traceSnapshot,
    expiresIn = '7d',
    redactionProfile = {},
  } = params;

  // Merge with default redaction profile
  const finalRedaction: RedactionProfile = {
    ...DEFAULT_REDACTION,
    ...redactionProfile,
  };

  // Apply redaction to the trace snapshot
  const redactedSnapshot = redactTrace(traceSnapshot, finalRedaction);

  // Generate tokens
  const shareToken = generateShareToken(); // 64-char hex token
  const shareId = generateShortShareId(); // 8-char short ID

  // Calculate expiration
  const expiresAt = calculateExpiry(expiresIn);

  // Store in database
  const supabase = createServerClient();

  const { error } = await supabase.from('shared_traces').insert({
    share_token: shareToken,
    share_id: shareId,
    trace_id: traceId,
    user_id: userId,
    trace_snapshot: redactedSnapshot,
    redaction_profile: finalRedaction,
    expires_at: expiresAt?.toISOString() || null,
    view_count: 0,
  });

  if (error) {
    console.error('Failed to create share link:', error);
    throw new Error('Failed to create share link');
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://seizn.com';

  return {
    shareUrl: `${baseUrl}/t/${shareId}`,
    token: shareId, // Use short ID for URLs
    expiresAt: expiresAt?.toISOString() || null,
  };
}

/**
 * Get a shared trace by token or short ID
 */
export async function getSharedTrace(tokenOrId: string): Promise<SharedTraceRecord | null> {
  const supabase = createServerClient();

  // Determine if it's a full token (64 hex chars) or short ID
  const isFullToken = /^[0-9a-f]{64}$/i.test(tokenOrId);
  const column = isFullToken ? 'share_token' : 'share_id';

  const { data, error } = await supabase
    .from('shared_traces')
    .select('*')
    .eq(column, tokenOrId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as SharedTraceRecord;
}

/**
 * Check if a shared trace is expired
 */
export function isShareExpired(sharedTrace: SharedTraceRecord): boolean {
  if (!sharedTrace.expires_at) {
    return false; // Never expires
  }
  return new Date(sharedTrace.expires_at) < new Date();
}

/**
 * Increment view count for a shared trace
 */
export async function incrementViewCount(shareId: string): Promise<void> {
  const supabase = createServerClient();

  await supabase.rpc('increment_share_view_count', { p_share_id: shareId });
}

/**
 * Revoke a share link (delete it)
 */
export async function revokeShareLink(params: {
  shareId: string;
  userId: string;
}): Promise<boolean> {
  const { shareId, userId } = params;
  const supabase = createServerClient();

  // Only allow owner to revoke
  const { data, error } = await supabase
    .from('shared_traces')
    .delete()
    .eq('share_id', shareId)
    .eq('user_id', userId)
    .select('id')
    .single();

  if (error || !data) {
    return false;
  }

  return true;
}

/**
 * List all share links for a user
 */
export async function listUserShareLinks(params: {
  userId: string;
  limit?: number;
  offset?: number;
}): Promise<{ shares: SharedTraceRecord[]; total: number }> {
  const { userId, limit = 20, offset = 0 } = params;
  const supabase = createServerClient();

  const { data, error, count } = await supabase
    .from('shared_traces')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Failed to list share links:', error);
    return { shares: [], total: 0 };
  }

  return {
    shares: (data || []) as SharedTraceRecord[],
    total: count || 0,
  };
}

/**
 * Get share links for a specific trace
 */
export async function getTraceShareLinks(params: {
  traceId: string;
  userId: string;
}): Promise<SharedTraceRecord[]> {
  const { traceId, userId } = params;
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('shared_traces')
    .select('*')
    .eq('trace_id', traceId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to get trace share links:', error);
    return [];
  }

  return (data || []) as SharedTraceRecord[];
}

/**
 * Cleanup expired shares (for cron job)
 */
export async function cleanupExpiredShares(): Promise<number> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('shared_traces')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .not('expires_at', 'is', null)
    .select('id');

  if (error) {
    console.error('Failed to cleanup expired shares:', error);
    return 0;
  }

  return data?.length || 0;
}
