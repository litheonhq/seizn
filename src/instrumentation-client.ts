// Client-side Sentry initialization for Next.js
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import { lazyLoadIntegration } from '@sentry/browser';
import * as Sentry from '@sentry/nextjs';

const enableReplay = process.env.NEXT_PUBLIC_SENTRY_REPLAY === 'true';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  replaysOnErrorSampleRate: enableReplay ? 1.0 : 0.0,

  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: enableReplay ? 0.1 : 0.0,

  // Filter out development errors
  enabled: process.env.NODE_ENV === 'production' && !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Ignore common non-error events
  ignoreErrors: [
    // Network errors
    'Network request failed',
    'Failed to fetch',
    'NetworkError',
    // User aborted requests
    'AbortError',
    // Chrome extensions
    'chrome-extension://',
    // Browser issues
    'ResizeObserver loop limit exceeded',
  ],
});

// Keep Replay fully out of the initial JS by lazy-loading it only when enabled.
// This uses Sentry's CDN loader instead of bundling replay into our app.
if (enableReplay) {
  void lazyLoadIntegration('replayIntegration')
    .then((replayIntegration) => {
      Sentry.addIntegration(
        replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
        }),
      );
    })
    .catch(() => {
      // No-op: error tracking should keep working even if Replay fails to load.
    });
}

// Export for Next.js App Router navigation instrumentation
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
