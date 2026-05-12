import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';
import { withSentryConfig } from '@sentry/nextjs';
import { checkProductionEnv } from './src/lib/env-guard';

// Disable standalone on Windows due to Turbopack file naming issue with node: prefix
// See: https://github.com/vercel/next.js/issues - colons in filenames not supported on Windows
const isWindows = process.platform === 'win32';

if (process.env.VERCEL_ENV === 'production' || process.env.SEIZN_STRICT_ENV_CHECK === '1') {
  const result = checkProductionEnv();
  if (!result.ok) {
    console.warn('[env-guard] Missing production env vars:', result.missing.join(', '));
  }
}

const nextConfig: NextConfig = {
  // Enable standalone output for Docker (disabled on Windows due to Turbopack compatibility)
  output: isWindows ? undefined : 'standalone',
  allowedDevOrigins: [
    'localhost',
    'localhost:3000',
    'localhost:3100',
    '127.0.0.1',
    '127.0.0.1:3100',
  ],
  turbopack: {
    root: process.cwd(),
  },

  // Disable devtools indicator in development
  devIndicators: false,
  poweredByHeader: false,

  async headers() {
    const cacheHeader = {
      key: 'Cache-Control',
      value: 'public, max-age=31536000, immutable',
    };
    const isProduction = process.env.NODE_ENV === 'production';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const shouldUpgradeInsecureRequests =
      process.env.VERCEL_ENV === 'production' ||
      (appUrl.startsWith('https://') && !appUrl.includes('localhost') && !appUrl.includes('127.0.0.1'));
    const contentSecurityPolicy = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      [
        "script-src 'self' 'unsafe-inline'",
        isProduction ? '' : "'unsafe-eval'",
        'https://challenges.cloudflare.com',
        'https://js.stripe.com',
        'https://analytics.seizn.com',
        // Google Analytics gtag.js loader
        'https://www.googletagmanager.com',
        // Cloudflare Web Analytics / Browser Insights can be injected at the edge.
        'https://static.cloudflareinsights.com',
      ].filter(Boolean).join(' '),
      [
        "connect-src 'self'",
        // Dev HMR + websocket dev tools
        isProduction ? '' : 'ws: wss:',
        // Seizn-owned subdomains: api.seizn.com (memory API), errors.seizn.com
        // (GlitchTip), analytics.seizn.com (Plausible)
        'https://*.seizn.com',
        // Supabase auth + storage + realtime
        'https://*.supabase.co wss://*.supabase.co',
        // Stripe.js + Checkout
        'https://api.stripe.com',
        // Cloudflare Turnstile challenge endpoint
        'https://challenges.cloudflare.com',
        // Google Analytics collect endpoints (gtag.js POSTs to these)
        'https://www.google-analytics.com https://*.google-analytics.com',
        'https://www.googletagmanager.com',
        // PostHog analytics (us.i.posthog.com or self-hosted)
        'https://*.posthog.com',
        // Cloudflare Web Analytics / Browser Insights beacon endpoint.
        'https://cloudflareinsights.com',
      ].filter(Boolean).join(' '),
      "frame-src 'self' https://challenges.cloudflare.com https://js.stripe.com https://checkout.stripe.com",
      "worker-src 'self' blob:",
      shouldUpgradeInsecureRequests ? 'upgrade-insecure-requests' : '',
    ].filter(Boolean).join('; ');

    // Security headers for all routes
    const securityHeaders = [
      { key: 'Content-Security-Policy', value: contentSecurityPolicy },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-DNS-Prefetch-Control', value: 'off' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Origin-Agent-Cluster', value: '?1' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
      { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
      { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains; preload',
      },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=()',
      },
    ];

    // Dashboard-specific security headers (stricter Referrer-Policy to protect review_token)
    const dashboardSecurityHeaders = [
      { key: 'Content-Security-Policy', value: contentSecurityPolicy },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-DNS-Prefetch-Control', value: 'off' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Origin-Agent-Cluster', value: '?1' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
      { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
      { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
    ];

    return [
      // Dashboard security headers (P0-4: review_token leak prevention)
      {
        source: '/dashboard/:path*',
        headers: dashboardSecurityHeaders,
      },
      // Global security headers
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      // Next.js owns /_next/static cache headers. Keep custom immutable
      // caching to public assets only to avoid framework cache warnings.
      // Split static asset caching into individual patterns (Next.js doesn't support regex groups)
      { source: '/:path*.png', headers: [cacheHeader] },
      { source: '/:path*.jpg', headers: [cacheHeader] },
      { source: '/:path*.jpeg', headers: [cacheHeader] },
      { source: '/:path*.gif', headers: [cacheHeader] },
      { source: '/:path*.webp', headers: [cacheHeader] },
      { source: '/:path*.svg', headers: [cacheHeader] },
      { source: '/:path*.ico', headers: [cacheHeader] },
      { source: '/:path*.woff', headers: [cacheHeader] },
      { source: '/:path*.woff2', headers: [cacheHeader] },
      { source: '/:path*.ttf', headers: [cacheHeader] },
    ];
  },

  // Redirect non-locale docs paths to default locale
  // Also redirect locale-prefixed legal pages to root (they exist without locale prefix)
  async redirects() {
    return [
      {
        source: '/docs',
        destination: '/en/docs',
        permanent: false,
      },
      {
        source: '/docs/:path*',
        destination: '/en/docs/:path*',
        permanent: false,
      },
      // Legal pages exist at root level, redirect locale-prefixed versions
      {
        source: '/:locale(en|ko|ja|zh-hans|zh-hant|es|ru|uk|he|ar|fr|de|it|sv|nl|pl|hi|th|id|vi|pt-BR|pt-PT)/terms',
        destination: '/terms',
        permanent: false,
      },
      {
        source: '/:locale(en|ko|ja|zh-hans|zh-hant|es|ru|uk|he|ar|fr|de|it|sv|nl|pl|hi|th|id|vi|pt-BR|pt-PT)/privacy',
        destination: '/privacy',
        permanent: false,
      },
      {
        source: '/:locale(en|ko|ja|zh-hans|zh-hant|es|ru|uk|he|ar|fr|de|it|sv|nl|pl|hi|th|id|vi|pt-BR|pt-PT)/refund',
        destination: '/refund',
        permanent: false,
      },
    ];
  },

  // Exclude mcp-server from build process
  webpack: (config) => {
    // Ignore mcp-server directory during watch
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/mcp-server/**', '**/node_modules/**'],
    };
    return config;
  },
  // Note: ESLint config moved to eslint.config.mjs (Next.js 16+ no longer supports eslint in next.config)
};

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const isSentryBuildPluginEnabled = Boolean(sentryOrg && sentryProject && sentryAuthToken);
const sentryReleaseManagementDisabled = {
  create: false,
  finalize: false,
  setCommits: false,
  deploy: false,
} as const;

const baseConfig = withBundleAnalyzer(nextConfig);

const finalConfig = isSentryBuildPluginEnabled
  ? withSentryConfig(baseConfig, {
      // For all available options, see:
      // https://github.com/getsentry/sentry-webpack-plugin#options
      org: sentryOrg as string,
      project: sentryProject as string,
      authToken: sentryAuthToken as string,
      telemetry: false,
      useRunAfterProductionCompileHook: false,

      // Only print logs for uploading source maps in CI
      silent: !process.env.CI,

      // Upload a larger set of source maps for prettier stack traces (increases build time)
      widenClientFileUpload: true,

      // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
      tunnelRoute: '/monitoring',

      // Keep disabled unless explicit source map upload is needed.
      sourcemaps: {
        disable: true,
      },

      // Disable release creation to prevent sentry-cli release errors in environments
      // where project linkage is intentionally absent or restricted.
      release: sentryReleaseManagementDisabled as unknown as {
        create?: boolean;
        finalize?: boolean;
      },

      // Webpack-specific options (new format for v10+)
      webpack: {
        // Automatically tree-shake Sentry logger statements to reduce bundle size
        treeshake: {
          removeDebugLogging: true,
        },
        // Automatically annotate React components to show their full name in breadcrumbs and session replay
        reactComponentAnnotation: {
          enabled: true,
        },
        // Enables automatic instrumentation of Vercel Cron Monitors
        automaticVercelMonitors: true,
      },
    })
  : baseConfig;

export default finalConfig;
