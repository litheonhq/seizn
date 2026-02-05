'use client';

/**
 * useRealtimeTable Hook
 *
 * Re-exports the useRealtimeTable hook from the realtime module
 * for easy access from the hooks directory.
 *
 * @module hooks/useRealtimeTable
 */

export {
  useRealtimeTable,
  useRealtimeData,
  type UseRealtimeTableOptions,
  type UseRealtimeTableReturn,
  type RealtimeChange,
} from '@/lib/realtime';
