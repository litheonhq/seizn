import * as Sentry from '@sentry/nextjs';

/**
 * Edge runtime Sentry/GlitchTip config (plan W5.5). For the edge middleware
 * that came with W2.6 NextAuth split. Edge runtime has no node `process` env
 * but Next.js shims `process.env.SENTRY_DSN` at build time.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.VERCEL_ENV ?? 'edge',
  release: process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: 0.05,
});
