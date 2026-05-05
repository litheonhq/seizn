/**
 * Track 2 (API + MCP) feature flag.
 *
 * Default: disabled. Set `TRACK_2_API_ENABLED=true` in the environment to
 * activate the public REST surface and the dashboard UI. Used both by the
 * Layer 1 middleware (`/api/v1/*`) and by the dashboard
 * (`/dashboard/account/api-keys`) so they fall back together when Track 2 is
 * still being rolled out.
 *
 * Phase 8 rollout plan: 10 % canary → 50 % → 100 %, controlled by setting
 * the env on Vercel projects matched to the rollout cohort.
 */
export function isTrack2ApiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.TRACK_2_API_ENABLED?.trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

export const TRACK_2_DISABLED_PROBLEM = {
  type: 'https://seizn.com/errors/feature-disabled',
  title: 'Track 2 API beta',
  status: 503,
  code: 'feature_disabled',
  detail: 'Track 2 API is in private beta. Contact sales@seizn.com for early access.',
} as const;
