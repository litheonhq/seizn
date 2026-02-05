/**
 * Server-side Feature Flags
 *
 * Feature flag utilities for Next.js server components and API routes.
 *
 * @module lib/feature-flags/server
 */

import type { FlagKey, FlagValue, KnownFlags, FeatureFlagContext } from './types';

// =============================================================================
// Server-side Feature Flags
// =============================================================================

interface PostHogServerResponse {
  featureFlags: Record<string, boolean | string>;
  featureFlagPayloads: Record<string, Record<string, unknown>>;
}

const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com';
const POSTHOG_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const POSTHOG_PROJECT_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

/**
 * Evaluate feature flags server-side
 */
export async function evaluateFeatureFlags(
  context: FeatureFlagContext
): Promise<Partial<KnownFlags>> {
  if (!POSTHOG_PROJECT_KEY) {
    console.warn('[FeatureFlags] No PostHog project key configured');
    return {};
  }

  try {
    const response = await fetch(`${POSTHOG_HOST}/decide?v=3`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: POSTHOG_PROJECT_KEY,
        distinct_id: context.userId || context.anonymousId || 'anonymous',
        person_properties: context.properties,
        groups: context.groups,
      }),
      next: { revalidate: 60 }, // Cache for 60 seconds
    });

    if (!response.ok) {
      throw new Error(`PostHog decide failed: ${response.status}`);
    }

    const data: PostHogServerResponse = await response.json();
    return data.featureFlags as Partial<KnownFlags>;
  } catch (error) {
    console.error('[FeatureFlags] Server evaluation failed:', error);
    return {};
  }
}

/**
 * Get a single feature flag value server-side
 */
export async function getServerFeatureFlag<K extends FlagKey>(
  key: K,
  context: FeatureFlagContext,
  defaultValue?: FlagValue<K>
): Promise<FlagValue<K> | undefined> {
  const flags = await evaluateFeatureFlags(context);
  return (flags[key] as FlagValue<K>) ?? defaultValue;
}

/**
 * Check if a feature is enabled server-side
 */
export async function isFeatureEnabled(
  key: FlagKey,
  context: FeatureFlagContext
): Promise<boolean> {
  const value = await getServerFeatureFlag(key, context);
  return value === true || (typeof value === 'string' && value !== 'control');
}

/**
 * Get bootstrap flags for client hydration
 *
 * Use this in server components to pass flags to client provider
 */
export async function getBootstrapFlags(
  context: FeatureFlagContext
): Promise<Record<string, boolean | string>> {
  const flags = await evaluateFeatureFlags(context);
  return flags as Record<string, boolean | string>;
}

// =============================================================================
// Conditional Rendering Helper
// =============================================================================

/**
 * Server-side conditional rendering helper
 *
 * @example
 * ```tsx
 * // In a server component
 * const NewFeature = await withFeatureFlag(
 *   'new-feature',
 *   { userId: session.user.id },
 *   <NewComponent />,
 *   <OldComponent />
 * );
 * return <div>{NewFeature}</div>;
 * ```
 */
export async function withFeatureFlag<T>(
  key: FlagKey,
  context: FeatureFlagContext,
  enabledContent: T,
  disabledContent: T
): Promise<T> {
  const enabled = await isFeatureEnabled(key, context);
  return enabled ? enabledContent : disabledContent;
}

// =============================================================================
// API Route Helper
// =============================================================================

/**
 * Middleware helper for API routes
 *
 * @example
 * ```ts
 * // In an API route
 * export async function GET(request: Request) {
 *   const { flags, isEnabled } = await getFeatureFlagsForRequest(request);
 *
 *   if (!isEnabled('beta-api-v2')) {
 *     return new Response('Feature not enabled', { status: 404 });
 *   }
 *
 *   // ... handle request
 * }
 * ```
 */
export async function getFeatureFlagsForRequest(
  request: Request,
  getUserId?: (request: Request) => Promise<string | undefined>
): Promise<{
  flags: Partial<KnownFlags>;
  isEnabled: (key: FlagKey) => boolean;
}> {
  const userId = getUserId ? await getUserId(request) : undefined;

  // Try to get anonymous ID from cookie
  const cookies = request.headers.get('cookie') || '';
  const posthogCookie = cookies.split(';').find((c) => c.trim().startsWith('ph_'));
  const anonymousId = posthogCookie
    ? JSON.parse(decodeURIComponent(posthogCookie.split('=')[1] || '{}'))?.distinct_id
    : undefined;

  const flags = await evaluateFeatureFlags({
    userId,
    anonymousId,
  });

  return {
    flags,
    isEnabled: (key: FlagKey) => {
      const value = flags[key];
      return value === true || (typeof value === 'string' && value !== 'control');
    },
  };
}
