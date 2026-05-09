import * as Sentry from '@sentry/nextjs';

/**
 * Server-side Sentry/GlitchTip config (plan W5.5). Runs in Node serverless
 * functions and standalone server. DSN identical to client; envelope ingestion
 * differs only in header set.
 *
 * See sentry.client.config.ts for the DSN validation rationale.
 */
const VALID_DSN_RE = /^https?:\/\/\w+(?::\w+)?@[^/]+\/\d+$/;
const rawDsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const dsn = rawDsn && VALID_DSN_RE.test(rawDsn) ? rawDsn : undefined;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
  release: process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: 0.1,
  beforeSend(event) {
    if (event.request) {
      delete event.request.cookies;
      if (event.request.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['Authorization'];
        delete event.request.headers['cookie'];
      }
    }
    return event;
  },
});
