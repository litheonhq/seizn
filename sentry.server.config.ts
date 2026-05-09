import * as Sentry from '@sentry/nextjs';
import { sanitizeForLogs } from '@/lib/server/logger';

function sanitizeExceptionValues<T extends Sentry.Event>(event: T): T {
  const values = event.exception?.values;
  if (!values) return event;
  for (const exception of values) {
    if (typeof exception.value === 'string') {
      const sanitized = sanitizeForLogs(exception.value);
      exception.value = typeof sanitized === 'string' ? sanitized : String(sanitized);
    }
  }
  return event;
}

/**
 * Server-side Sentry/GlitchTip config (plan W5.5). Runs in Node serverless
 * functions and standalone server. DSN identical to client; envelope ingestion
 * differs only in header set.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN),
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
    return sanitizeExceptionValues(event);
  },
});
