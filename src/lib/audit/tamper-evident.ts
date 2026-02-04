/**
 * Seizn - Tamper-Evident Audit Log System
 *
 * Implements cryptographic integrity for audit logs:
 * - Hash chain: Each entry contains hash of previous entry
 * - Merkle digest: Periodic batch verification with Merkle trees
 * - Verification API: Detect any tampering in audit trail
 *
 * @module audit/tamper-evident
 */

import { createHash, randomBytes } from 'crypto';
import { createServerClient } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export interface TamperEvidentEntry {
  id: string;
  organization_id?: string;
  sequence_number: number;
  prev_hash: string | null;
  entry_hash: string;
  merkle_root?: string;
  merkle_batch_id?: string;
  created_at: string;

  // Original audit fields
  user_id?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  details?: Record<string, unknown>;
  status: 'success' | 'failed' | 'denied';
  ip_address?: string;
  user_agent?: string;
}

export interface MerkleBatch {
  id: string;
  organization_id: string;
  merkle_root: string;
  entry_count: number;
  first_sequence: number;
  last_sequence: number;
  first_entry_id: string;
  last_entry_id: string;
  created_at: string;
  verified_at?: string;
}

export interface VerificationResult {
  valid: boolean;
  checked_entries: number;
  first_invalid_entry?: string;
  first_invalid_sequence?: number;
  error?: string;
  verification_time_ms: number;
}

export interface MerkleProof {
  leaf_hash: string;
  proof_path: Array<{
    hash: string;
    position: 'left' | 'right';
  }>;
  root: string;
  entry_id: string;
  batch_id: string;
}

// ============================================
// Hash Functions
// ============================================

/**
 * Compute SHA-256 hash of data
 */
export function sha256(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Compute hash of an audit entry for chain integrity
 * Includes all fields that should be immutable
 */
export function computeEntryHash(entry: {
  id: string;
  sequence_number: number;
  prev_hash: string | null;
  organization_id?: string;
  user_id?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  details?: Record<string, unknown>;
  status: string;
  ip_address?: string;
  created_at: string;
}): string {
  const payload = JSON.stringify({
    id: entry.id,
    seq: entry.sequence_number,
    prev: entry.prev_hash,
    org: entry.organization_id,
    user: entry.user_id,
    action: entry.action,
    resource_type: entry.resource_type,
    resource_id: entry.resource_id,
    details: entry.details,
    status: entry.status,
    ip: entry.ip_address,
    ts: entry.created_at,
  });

  return sha256(payload);
}

/**
 * Compute Merkle root from a list of leaf hashes
 */
export function computeMerkleRoot(leafHashes: string[]): string {
  if (leafHashes.length === 0) {
    return sha256('empty');
  }

  if (leafHashes.length === 1) {
    return leafHashes[0];
  }

  // Pad to power of 2 if needed
  let leaves = [...leafHashes];
  while ((leaves.length & (leaves.length - 1)) !== 0) {
    leaves.push(leaves[leaves.length - 1]);
  }

  // Build tree bottom-up
  while (leaves.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < leaves.length; i += 2) {
      const combined = leaves[i] + leaves[i + 1];
      nextLevel.push(sha256(combined));
    }
    leaves = nextLevel;
  }

  return leaves[0];
}

/**
 * Generate Merkle proof for a specific entry
 */
export function generateMerkleProof(
  leafHashes: string[],
  targetIndex: number
): Array<{ hash: string; position: 'left' | 'right' }> {
  if (leafHashes.length === 0 || targetIndex >= leafHashes.length) {
    return [];
  }

  // Pad to power of 2
  let leaves = [...leafHashes];
  while ((leaves.length & (leaves.length - 1)) !== 0) {
    leaves.push(leaves[leaves.length - 1]);
  }

  const proof: Array<{ hash: string; position: 'left' | 'right' }> = [];
  let index = targetIndex;

  while (leaves.length > 1) {
    const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
    const position = index % 2 === 0 ? 'right' : 'left';

    proof.push({
      hash: leaves[siblingIndex],
      position,
    });

    // Move to parent level
    const nextLevel: string[] = [];
    for (let i = 0; i < leaves.length; i += 2) {
      const combined = leaves[i] + leaves[i + 1];
      nextLevel.push(sha256(combined));
    }
    leaves = nextLevel;
    index = Math.floor(index / 2);
  }

  return proof;
}

/**
 * Verify a Merkle proof
 */
export function verifyMerkleProof(
  leafHash: string,
  proof: Array<{ hash: string; position: 'left' | 'right' }>,
  expectedRoot: string
): boolean {
  let currentHash = leafHash;

  for (const step of proof) {
    const combined = step.position === 'left'
      ? step.hash + currentHash
      : currentHash + step.hash;
    currentHash = sha256(combined);
  }

  return currentHash === expectedRoot;
}

// ============================================
// Tamper-Evident Logging
// ============================================

/**
 * Create a tamper-evident audit entry
 * This should be used instead of regular audit logging for sensitive operations
 */
export async function logTamperEvidentEvent(params: {
  organization_id?: string;
  user_id?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  details?: Record<string, unknown>;
  status: 'success' | 'failed' | 'denied';
  ip_address?: string;
  user_agent?: string;
  request_id?: string;
}): Promise<TamperEvidentEntry | null> {
  const supabase = createServerClient();

  try {
    // Get the latest entry for this organization to build chain
    const { data: lastEntry } = await supabase
      .from('audit_logs_tamper_evident')
      .select('id, sequence_number, entry_hash')
      .eq('organization_id', params.organization_id || '')
      .order('sequence_number', { ascending: false })
      .limit(1)
      .single();

    const prevHash = lastEntry?.entry_hash || null;
    const sequenceNumber = (lastEntry?.sequence_number || 0) + 1;
    const entryId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    // Compute entry hash
    const entryHash = computeEntryHash({
      id: entryId,
      sequence_number: sequenceNumber,
      prev_hash: prevHash,
      organization_id: params.organization_id,
      user_id: params.user_id,
      action: params.action,
      resource_type: params.resource_type,
      resource_id: params.resource_id,
      details: params.details,
      status: params.status,
      ip_address: params.ip_address,
      created_at: createdAt,
    });

    // Insert with hash chain
    const { data, error } = await supabase
      .from('audit_logs_tamper_evident')
      .insert({
        id: entryId,
        organization_id: params.organization_id,
        user_id: params.user_id,
        action: params.action,
        resource_type: params.resource_type,
        resource_id: params.resource_id,
        details: params.details || {},
        status: params.status,
        ip_address: params.ip_address,
        user_agent: params.user_agent,
        request_id: params.request_id,
        sequence_number: sequenceNumber,
        prev_hash: prevHash,
        entry_hash: entryHash,
        created_at: createdAt,
      })
      .select()
      .single();

    if (error) {
      console.error('[TamperEvidentAudit] Failed to log:', error);
      return null;
    }

    return data as TamperEvidentEntry;
  } catch (err) {
    console.error('[TamperEvidentAudit] Error:', err);
    return null;
  }
}

// ============================================
// Chain Verification
// ============================================

/**
 * Verify hash chain integrity for an organization
 */
export async function verifyHashChain(
  organizationId: string,
  options?: {
    startSequence?: number;
    endSequence?: number;
    batchSize?: number;
  }
): Promise<VerificationResult> {
  const supabase = createServerClient();
  const startTime = Date.now();
  const batchSize = options?.batchSize || 1000;

  try {
    let query = supabase
      .from('audit_logs_tamper_evident')
      .select('id, sequence_number, prev_hash, entry_hash, organization_id, user_id, action, resource_type, resource_id, details, status, ip_address, created_at')
      .eq('organization_id', organizationId)
      .order('sequence_number', { ascending: true });

    if (options?.startSequence !== undefined) {
      query = query.gte('sequence_number', options.startSequence);
    }
    if (options?.endSequence !== undefined) {
      query = query.lte('sequence_number', options.endSequence);
    }

    let offset = 0;
    let checkedEntries = 0;
    let prevEntry: TamperEvidentEntry | null = null;

    while (true) {
      const { data: entries, error } = await query
        .range(offset, offset + batchSize - 1);

      if (error) throw error;
      if (!entries || entries.length === 0) break;

      for (const entry of entries) {
        checkedEntries++;

        // Verify prev_hash links to previous entry
        if (prevEntry) {
          if (entry.prev_hash !== prevEntry.entry_hash) {
            return {
              valid: false,
              checked_entries: checkedEntries,
              first_invalid_entry: entry.id,
              first_invalid_sequence: entry.sequence_number,
              error: `Chain broken: entry ${entry.sequence_number} prev_hash doesn't match previous entry hash`,
              verification_time_ms: Date.now() - startTime,
            };
          }
        } else if (entry.sequence_number > 1 && entry.prev_hash === null) {
          return {
            valid: false,
            checked_entries: checkedEntries,
            first_invalid_entry: entry.id,
            first_invalid_sequence: entry.sequence_number,
            error: `Chain broken: entry ${entry.sequence_number} has null prev_hash but is not first entry`,
            verification_time_ms: Date.now() - startTime,
          };
        }

        // Verify entry hash is correct
        const computedHash = computeEntryHash({
          id: entry.id,
          sequence_number: entry.sequence_number,
          prev_hash: entry.prev_hash,
          organization_id: entry.organization_id,
          user_id: entry.user_id,
          action: entry.action,
          resource_type: entry.resource_type,
          resource_id: entry.resource_id,
          details: entry.details as Record<string, unknown>,
          status: entry.status,
          ip_address: entry.ip_address,
          created_at: entry.created_at,
        });

        if (computedHash !== entry.entry_hash) {
          return {
            valid: false,
            checked_entries: checkedEntries,
            first_invalid_entry: entry.id,
            first_invalid_sequence: entry.sequence_number,
            error: `Tampered entry: entry ${entry.sequence_number} hash doesn't match computed hash`,
            verification_time_ms: Date.now() - startTime,
          };
        }

        prevEntry = entry as TamperEvidentEntry;
      }

      offset += batchSize;
      if (entries.length < batchSize) break;
    }

    return {
      valid: true,
      checked_entries: checkedEntries,
      verification_time_ms: Date.now() - startTime,
    };
  } catch (err) {
    return {
      valid: false,
      checked_entries: 0,
      error: `Verification error: ${err instanceof Error ? err.message : String(err)}`,
      verification_time_ms: Date.now() - startTime,
    };
  }
}

// ============================================
// Merkle Batch Operations
// ============================================

/**
 * Create a Merkle batch for a range of entries
 * Should be run periodically (e.g., hourly or daily)
 */
export async function createMerkleBatch(
  organizationId: string,
  options?: {
    maxEntries?: number;
  }
): Promise<MerkleBatch | null> {
  const supabase = createServerClient();
  const maxEntries = options?.maxEntries || 10000;

  try {
    // Get entries not yet in a batch
    const { data: entries, error: fetchError } = await supabase
      .from('audit_logs_tamper_evident')
      .select('id, sequence_number, entry_hash')
      .eq('organization_id', organizationId)
      .is('merkle_batch_id', null)
      .order('sequence_number', { ascending: true })
      .limit(maxEntries);

    if (fetchError) throw fetchError;
    if (!entries || entries.length === 0) return null;

    // Compute Merkle root
    const leafHashes = entries.map(e => e.entry_hash);
    const merkleRoot = computeMerkleRoot(leafHashes);

    // Create batch record
    const batchId = crypto.randomUUID();
    const { data: batch, error: batchError } = await supabase
      .from('audit_merkle_batches')
      .insert({
        id: batchId,
        organization_id: organizationId,
        merkle_root: merkleRoot,
        entry_count: entries.length,
        first_sequence: entries[0].sequence_number,
        last_sequence: entries[entries.length - 1].sequence_number,
        first_entry_id: entries[0].id,
        last_entry_id: entries[entries.length - 1].id,
      })
      .select()
      .single();

    if (batchError) throw batchError;

    // Update entries with batch reference
    const entryIds = entries.map(e => e.id);
    const { error: updateError } = await supabase
      .from('audit_logs_tamper_evident')
      .update({
        merkle_batch_id: batchId,
        merkle_root: merkleRoot,
      })
      .in('id', entryIds);

    if (updateError) {
      console.error('[MerkleBatch] Failed to update entries:', updateError);
    }

    return batch as MerkleBatch;
  } catch (err) {
    console.error('[MerkleBatch] Error creating batch:', err);
    return null;
  }
}

/**
 * Verify a Merkle batch
 */
export async function verifyMerkleBatch(batchId: string): Promise<VerificationResult> {
  const supabase = createServerClient();
  const startTime = Date.now();

  try {
    // Get batch info
    const { data: batch, error: batchError } = await supabase
      .from('audit_merkle_batches')
      .select('*')
      .eq('id', batchId)
      .single();

    if (batchError || !batch) {
      return {
        valid: false,
        checked_entries: 0,
        error: 'Batch not found',
        verification_time_ms: Date.now() - startTime,
      };
    }

    // Get all entries in batch
    const { data: entries, error: entriesError } = await supabase
      .from('audit_logs_tamper_evident')
      .select('id, entry_hash, sequence_number')
      .eq('merkle_batch_id', batchId)
      .order('sequence_number', { ascending: true });

    if (entriesError) throw entriesError;
    if (!entries || entries.length === 0) {
      return {
        valid: false,
        checked_entries: 0,
        error: 'No entries found for batch',
        verification_time_ms: Date.now() - startTime,
      };
    }

    // Verify count matches
    if (entries.length !== batch.entry_count) {
      return {
        valid: false,
        checked_entries: entries.length,
        error: `Entry count mismatch: expected ${batch.entry_count}, found ${entries.length}`,
        verification_time_ms: Date.now() - startTime,
      };
    }

    // Recompute Merkle root
    const leafHashes = entries.map(e => e.entry_hash);
    const computedRoot = computeMerkleRoot(leafHashes);

    if (computedRoot !== batch.merkle_root) {
      return {
        valid: false,
        checked_entries: entries.length,
        error: 'Merkle root mismatch - batch may have been tampered',
        verification_time_ms: Date.now() - startTime,
      };
    }

    // Update verified timestamp
    await supabase
      .from('audit_merkle_batches')
      .update({ verified_at: new Date().toISOString() })
      .eq('id', batchId);

    return {
      valid: true,
      checked_entries: entries.length,
      verification_time_ms: Date.now() - startTime,
    };
  } catch (err) {
    return {
      valid: false,
      checked_entries: 0,
      error: `Verification error: ${err instanceof Error ? err.message : String(err)}`,
      verification_time_ms: Date.now() - startTime,
    };
  }
}

/**
 * Generate inclusion proof for a specific entry
 */
export async function generateInclusionProof(entryId: string): Promise<MerkleProof | null> {
  const supabase = createServerClient();

  try {
    // Get entry info
    const { data: entry, error: entryError } = await supabase
      .from('audit_logs_tamper_evident')
      .select('id, entry_hash, merkle_batch_id, sequence_number')
      .eq('id', entryId)
      .single();

    if (entryError || !entry || !entry.merkle_batch_id) {
      return null;
    }

    // Get batch info
    const { data: batch, error: batchError } = await supabase
      .from('audit_merkle_batches')
      .select('merkle_root')
      .eq('id', entry.merkle_batch_id)
      .single();

    if (batchError || !batch) {
      return null;
    }

    // Get all entries in batch
    const { data: entries, error: entriesError } = await supabase
      .from('audit_logs_tamper_evident')
      .select('id, entry_hash')
      .eq('merkle_batch_id', entry.merkle_batch_id)
      .order('sequence_number', { ascending: true });

    if (entriesError || !entries) {
      return null;
    }

    // Find index of target entry
    const targetIndex = entries.findIndex(e => e.id === entryId);
    if (targetIndex === -1) {
      return null;
    }

    // Generate proof
    const leafHashes = entries.map(e => e.entry_hash);
    const proofPath = generateMerkleProof(leafHashes, targetIndex);

    return {
      leaf_hash: entry.entry_hash,
      proof_path: proofPath,
      root: batch.merkle_root,
      entry_id: entryId,
      batch_id: entry.merkle_batch_id,
    };
  } catch (err) {
    console.error('[MerkleProof] Error generating proof:', err);
    return null;
  }
}

/**
 * Verify an inclusion proof
 */
export function verifyInclusionProof(proof: MerkleProof): boolean {
  return verifyMerkleProof(proof.leaf_hash, proof.proof_path, proof.root);
}

// ============================================
// Export
// ============================================

export const TamperEvidentAudit = {
  // Hashing
  sha256,
  computeEntryHash,
  computeMerkleRoot,

  // Logging
  log: logTamperEvidentEvent,

  // Verification
  verifyHashChain,
  verifyMerkleBatch,

  // Merkle operations
  createMerkleBatch,
  generateInclusionProof,
  verifyInclusionProof,
  generateMerkleProof,
  verifyMerkleProof,
};
