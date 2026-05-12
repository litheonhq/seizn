import * as Sentry from '@sentry/nextjs';

/**
 * Edge runtime Sentry/GlitchTip config (plan W5.5). For the edge middleware
 * that came with W2.6 NextAuth split. Edge runtime has no node `process` env
 * but Next.js shims `process.env.SENTRY_DSN` at build time.
 *
 * See sentry.client.config.ts for the DSN validation rationale.
 */
const VALID_DSN_RE = /^https?:\/\/\w+(?::\w+)?@[^/]+\/\d+$/;
const rawDsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const dsn = rawDsn && VALID_DSN_RE.test(rawDsn) ? rawDsn : undefined;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV ?? 'edge',
  release: process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: 0.05,
});
