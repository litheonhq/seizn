import * as Sentry from '@sentry/nextjs';

/**
 * Browser-side Sentry/GlitchTip config (plan W5.5).
 *
 * DSN points to self-hosted GlitchTip on Hetzner (`errors.seizn.com`). Sentry
 * SDK works against GlitchTip with no code change because GlitchTip implements
 * the Sentry envelope ingest API.
 *
 * Env strategy:
 *   - prod : `NEXT_PUBLIC_SENTRY_DSN` (GlitchTip DSN; project=seizn-web)
 *   - preview/dev: DSN unset → Sentry no-ops (no events sent)
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA,

  // GlitchTip CE doesn't ingest replays/profiles — keep them off to save bandwidth.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  // Browser perf trace at 10% to stay within GlitchTip free CAX31 capacity.
  tracesSampleRate: 0.1,

  // Strip PII before send: prompts can contain user content. Sentry SDK
  // beforeSend runs on the client.
  beforeSend(event) {
    if (event.request) {
      delete event.request.cookies;
      // Authorization headers may carry tokens.
      if (event.request.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['Authorization'];
        delete event.request.headers['cookie'];
      }
      // Query strings can carry tokens like ?token=xxx for waitlist confirm.
      if (event.request.query_string && /token=/i.test(String(event.request.query_string))) {
        event.request.query_string = '<redacted>';
      }
    }
    return event;
  },

  ignoreErrors: [
    // Common browser noise — Safari ResizeObserver loops, extension errors
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    /^Non-Error promise rejection captured$/,
  ],
});
