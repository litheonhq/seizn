/**
 * Supabase Realtime Module
 *
 * Provides comprehensive real-time subscriptions for Seizn including:
 * - Generic table subscriptions
 * - Memory-specific subscriptions
 * - Broadcast channels for custom events
 * - Presence for collaborative sessions
 * - Optimistic UI utilities
 *
 * @module lib/realtime
 */

// Core realtime utilities
export * from './core';

// Generic table subscription
export * from './use-realtime-table';

// Memory-specific subscriptions
export * from './memory-subscriptions';

// Candidate subscriptions (spring_memory_candidates)
export * from './candidate-subscriptions';

// Usage events subscriptions
export * from './usage-subscriptions';

// Broadcast channels
export * from './broadcast';

// Presence for collaborative sessions
export * from './presence';

// Optimistic UI utilities
export * from './optimistic';

// Types
export * from './types';
