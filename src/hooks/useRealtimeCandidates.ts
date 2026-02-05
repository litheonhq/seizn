'use client';

/**
 * useRealtimeCandidates Hook
 *
 * Provides real-time updates for memory candidates with optimistic UI support.
 *
 * @module hooks/useRealtimeCandidates
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  subscribeToCandidates,
  type RealtimeCandidate,
  type CandidateStatus,
} from '@/lib/realtime';

// =============================================================================
// Types
// =============================================================================

export interface CandidateChange {
  id: string;
  candidate: RealtimeCandidate;
  previousStatus?: CandidateStatus;
  newStatus: CandidateStatus;
  timestamp: Date;
}

export interface UseRealtimeCandidatesOptions {
  userId: string;
  enabled?: boolean;
  /** Only track candidates with these statuses */
  statusFilter?: CandidateStatus[];
  /** Callback when a candidate is created */
  onInsert?: (candidate: RealtimeCandidate) => void;
  /** Callback when a candidate status changes */
  onStatusChange?: (
    candidate: RealtimeCandidate,
    oldStatus: CandidateStatus,
    newStatus: CandidateStatus
  ) => void;
  /** Callback when a candidate is successfully processed */
  onProcessed?: (candidate: RealtimeCandidate, memoryId: string) => void;
  /** Callback when a candidate fails */
  onFailed?: (candidate: RealtimeCandidate) => void;
}

export interface UseRealtimeCandidatesReturn {
  /** Active candidates being processed */
  activeCandidates: RealtimeCandidate[];
  /** Recent status changes */
  recentChanges: CandidateChange[];
  /** Number of pending candidates */
  pendingCount: number;
  /** Number of processing candidates */
  processingCount: number;
  /** Whether connected to realtime */
  isConnected: boolean;
  /** Clear recent changes */
  clearChanges: () => void;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook for subscribing to real-time candidate updates
 *
 * @example
 * ```tsx
 * function IngestionStatus() {
 *   const {
 *     activeCandidates,
 *     pendingCount,
 *     processingCount,
 *     recentChanges,
 *   } = useRealtimeCandidates({
 *     userId: session.user.id,
 *     onProcessed: (candidate, memoryId) => {
 *       toast.success('New memory created!');
 *       refreshMemories();
 *     },
 *     onFailed: (candidate) => {
 *       toast.error('Failed to process memory');
 *     },
 *   });
 *
 *   return (
 *     <div>
 *       <span>{pendingCount} pending</span>
 *       <span>{processingCount} processing</span>
 *       {activeCandidates.map(c => (
 *         <CandidateCard key={c.id} candidate={c} />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useRealtimeCandidates({
  userId,
  enabled = true,
  statusFilter,
  onInsert,
  onStatusChange,
  onProcessed,
  onFailed,
}: UseRealtimeCandidatesOptions): UseRealtimeCandidatesReturn {
  const [activeCandidates, setActiveCandidates] = useState<RealtimeCandidate[]>([]);
  const [recentChanges, setRecentChanges] = useState<CandidateChange[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  // Refs for callbacks to avoid stale closures
  const onInsertRef = useRef(onInsert);
  const onStatusChangeRef = useRef(onStatusChange);
  const onProcessedRef = useRef(onProcessed);
  const onFailedRef = useRef(onFailed);

  useEffect(() => {
    onInsertRef.current = onInsert;
    onStatusChangeRef.current = onStatusChange;
    onProcessedRef.current = onProcessed;
    onFailedRef.current = onFailed;
  }, [onInsert, onStatusChange, onProcessed, onFailed]);

  // Calculate counts
  const pendingCount = activeCandidates.filter((c) => c.status === 'pending').length;
  const processingCount = activeCandidates.filter((c) => c.status === 'processing').length;

  // Add change to recent changes
  const addChange = useCallback(
    (candidate: RealtimeCandidate, previousStatus?: CandidateStatus) => {
      const change: CandidateChange = {
        id: `${candidate.id}-${Date.now()}`,
        candidate,
        previousStatus,
        newStatus: candidate.status,
        timestamp: new Date(),
      };

      setRecentChanges((prev) => [change, ...prev.slice(0, 49)]);
    },
    []
  );

  // Clear changes
  const clearChanges = useCallback(() => {
    setRecentChanges([]);
  }, []);

  // Subscribe to candidates
  useEffect(() => {
    if (!enabled || !userId) {
      setIsConnected(false);
      return;
    }

    const unsubscribe = subscribeToCandidates(userId, {
      onInsert: (candidate) => {
        // Check status filter
        if (statusFilter && !statusFilter.includes(candidate.status)) {
          return;
        }

        setActiveCandidates((prev) => {
          // Avoid duplicates
          if (prev.some((c) => c.id === candidate.id)) return prev;
          return [candidate, ...prev];
        });

        addChange(candidate);
        onInsertRef.current?.(candidate);
      },

      onUpdate: (newCandidate, oldCandidate) => {
        setActiveCandidates((prev) =>
          prev.map((c) => (c.id === newCandidate.id ? newCandidate : c))
        );
      },

      onStatusChange: (candidate, oldStatus, newStatus) => {
        addChange(candidate, oldStatus);
        onStatusChangeRef.current?.(candidate, oldStatus, newStatus);

        // Handle terminal states
        if (newStatus === 'processed' || newStatus === 'rejected') {
          // Remove from active after a short delay for UI feedback
          setTimeout(() => {
            setActiveCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
          }, 2000);
        }

        if (newStatus === 'failed') {
          onFailedRef.current?.(candidate);
        }
      },

      onProcessed: (candidate, memoryId) => {
        onProcessedRef.current?.(candidate, memoryId);
      },

      onDelete: (oldCandidate) => {
        setActiveCandidates((prev) => prev.filter((c) => c.id !== oldCandidate.id));
      },
    });

    setIsConnected(true);

    return () => {
      unsubscribe();
      setIsConnected(false);
    };
  }, [userId, enabled, statusFilter, addChange]);

  return {
    activeCandidates,
    recentChanges,
    pendingCount,
    processingCount,
    isConnected,
    clearChanges,
  };
}
