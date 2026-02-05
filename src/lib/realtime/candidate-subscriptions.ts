/**
 * Candidate-specific Realtime Subscriptions
 *
 * Provides specialized hooks for subscribing to spring_memory_candidates changes.
 * Useful for showing real-time ingestion progress and candidate review workflows.
 *
 * @module lib/realtime/candidate-subscriptions
 */

import { subscribeToTable } from './core';
import type {
  RealtimeCandidate,
  InsertCallback,
  UpdateCallback,
  DeleteCallback,
  RealtimeCallbacks,
} from './types';

// =============================================================================
// Types
// =============================================================================

export type { RealtimeCandidate };
export type CandidateStatus = RealtimeCandidate['status'];

export interface CandidateCallbacks {
  onInsert?: InsertCallback<RealtimeCandidate>;
  onUpdate?: UpdateCallback<RealtimeCandidate>;
  onDelete?: DeleteCallback<RealtimeCandidate>;
  /** Called when candidate status changes */
  onStatusChange?: (
    candidate: RealtimeCandidate,
    oldStatus: CandidateStatus,
    newStatus: CandidateStatus
  ) => void;
  /** Called when a candidate is processed (becomes a memory) */
  onProcessed?: (candidate: RealtimeCandidate, memoryId: string) => void;
}

// =============================================================================
// Subscription Functions
// =============================================================================

/**
 * Subscribe to candidate changes for a user
 *
 * @example
 * ```ts
 * const unsubscribe = subscribeToCandidates('user-123', {
 *   onInsert: (c) => toast.info('Processing new memory...'),
 *   onStatusChange: (c, old, new) => {
 *     if (new === 'processed') toast.success('Memory saved!');
 *     if (new === 'failed') toast.error('Failed to process');
 *   },
 * });
 * ```
 */
export function subscribeToCandidates(
  userId: string,
  callbacks: CandidateCallbacks
): () => void {
  return subscribeToTable<RealtimeCandidate>(
    {
      table: 'spring_memory_candidates',
      filter: `user_id=eq.${userId}`,
    },
    {
      onInsert: callbacks.onInsert,
      onUpdate: (newCandidate, oldCandidate) => {
        // Call generic update callback
        callbacks.onUpdate?.(newCandidate, oldCandidate);

        // Check for status change
        if (oldCandidate.status !== newCandidate.status) {
          callbacks.onStatusChange?.(
            newCandidate,
            oldCandidate.status,
            newCandidate.status
          );

          // Check if processed
          if (newCandidate.status === 'processed' && newCandidate.memory_id) {
            callbacks.onProcessed?.(newCandidate, newCandidate.memory_id);
          }
        }
      },
      onDelete: callbacks.onDelete,
    }
  );
}

/**
 * Subscribe to pending candidates only
 */
export function subscribeToPendingCandidates(
  userId: string,
  callbacks: Omit<CandidateCallbacks, 'onStatusChange' | 'onProcessed'>
): () => void {
  return subscribeToTable<RealtimeCandidate>(
    {
      table: 'spring_memory_candidates',
      filter: `user_id=eq.${userId},status=eq.pending`,
    },
    callbacks as RealtimeCallbacks<RealtimeCandidate>
  );
}

/**
 * Subscribe to a specific candidate by ID
 */
export function subscribeToCandidate(
  candidateId: string,
  callbacks: CandidateCallbacks
): () => void {
  return subscribeToTable<RealtimeCandidate>(
    {
      table: 'spring_memory_candidates',
      filter: `id=eq.${candidateId}`,
    },
    {
      onUpdate: (newCandidate, oldCandidate) => {
        callbacks.onUpdate?.(newCandidate, oldCandidate);

        if (oldCandidate.status !== newCandidate.status) {
          callbacks.onStatusChange?.(
            newCandidate,
            oldCandidate.status,
            newCandidate.status
          );

          if (newCandidate.status === 'processed' && newCandidate.memory_id) {
            callbacks.onProcessed?.(newCandidate, newCandidate.memory_id);
          }
        }
      },
      onDelete: callbacks.onDelete,
    }
  );
}

/**
 * Subscribe to candidates by source type
 */
export function subscribeToCandidatesBySource(
  userId: string,
  sourceType: string,
  callbacks: CandidateCallbacks
): () => void {
  return subscribeToTable<RealtimeCandidate>(
    {
      table: 'spring_memory_candidates',
      filter: `user_id=eq.${userId},source_type=eq.${sourceType}`,
    },
    {
      onInsert: callbacks.onInsert,
      onUpdate: (newCandidate, oldCandidate) => {
        callbacks.onUpdate?.(newCandidate, oldCandidate);

        if (oldCandidate.status !== newCandidate.status) {
          callbacks.onStatusChange?.(
            newCandidate,
            oldCandidate.status,
            newCandidate.status
          );
        }
      },
      onDelete: callbacks.onDelete,
    }
  );
}
