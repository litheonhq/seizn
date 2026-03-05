import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';
import { withSentryConfig } from '@sentry/nextjs';

// Disable standalone on Windows due to Turbopack file naming issue with node: prefix
// See: https://github.com/vercel/next.js/issues - colons in filenames not supported on Windows
const isWindows = process.platform === 'win32';

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

  async headers() {
    const cacheHeader = {
      key: 'Cache-Control',
      value: 'public, max-age=31536000, immutable',
    };

    // Security headers for all routes
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
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
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
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
      // Cache headers for static assets
      {
        source: '/_next/static/:path*',
        headers: [cacheHeader],
      },
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
