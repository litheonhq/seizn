import { createServerClient } from '@/lib/supabase';
import { maskPII, detectPII, type PiiDetection } from './pii';

export type PiiAction = 'allow' | 'mask' | 'deny' | 'encrypt';

export interface MemoryPolicyConfig {
  /** Store raw query/memory text? If false, store only hashes. */
  storeText?: boolean;

  /** PII handling for user-provided content */
  piiAction?: PiiAction;

  /** TTL in days for trace/memory retention (enforced by scheduled job) */
  ttlDays?: number;

  /** Recency bias half-life for memory retrieval scoring */
  recencyHalfLifeDays?: number;
}

export interface PolicyRecord {
  id: string;
  user_id: string;
  policy_type: string;
  scope: string;
  name: string;
  config: MemoryPolicyConfig;
  is_active: boolean;
}

const DEFAULT_POLICY: MemoryPolicyConfig = {
  storeText: true,
  piiAction: 'mask',
  ttlDays: 30,
  recencyHalfLifeDays: 14,
};

export async function getActivePolicy(
  userId: string,
  policyType: string,
  scope: string = 'user'
): Promise<PolicyRecord | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('winter_policies')
    .select('*')
    .eq('user_id', userId)
    .eq('policy_type', policyType)
    .eq('scope', scope)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as PolicyRecord | null;
}

export function resolvePolicyConfig(record: PolicyRecord | null): MemoryPolicyConfig {
  return {
    ...DEFAULT_POLICY,
    ...(record?.config ?? {}),
  };
}

export interface ApplyPiiPolicyResult {
  action: PiiAction;
  allowed: boolean;
  storedText: string | null;
  detections: PiiDetection[];
}

/**
 * Apply PII policy to a text.
 *
 * - allow: store original text
 * - mask: store masked text + log detections
 * - deny: store nothing (null)
 * - encrypt: store raw text encrypted elsewhere (not implemented here)
 */
export function applyPiiPolicy(text: string, config: MemoryPolicyConfig): ApplyPiiPolicyResult {
  const action = config.piiAction ?? 'mask';
  const detections = detectPII(text);

  if (detections.length === 0) {
    return { action: 'allow', allowed: true, storedText: text, detections };
  }

  if (action === 'deny') {
    return { action, allowed: false, storedText: null, detections };
  }

  if (action === 'mask') {
    const { maskedText } = maskPII(text);
    return { action, allowed: true, storedText: maskedText, detections };
  }

  // NOTE: encrypt requires a dedicated encrypted store; we expose the action for future
  if (action === 'encrypt') {
    return { action, allowed: true, storedText: null, detections };
  }

  return { action: 'allow', allowed: true, storedText: text, detections };
}
