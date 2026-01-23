import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  // Enable standalone output for Docker
  output: 'standalone',

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
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains',
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
  // ESLint - only lint src directory
  eslint: {
    dirs: ['src'],
    ignoreDuringBuilds: true,
  },
};

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

// Sentry configuration options (updated for v10+)
const sentryWebpackPluginOptions = {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: process.env.SENTRY_ORG || 'kics-projects',
  project: process.env.SENTRY_PROJECT || 'seizn',

  // Auth token for source maps upload (required for releases)
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  tunnelRoute: '/monitoring',

  // Hides source maps from generated client bundles
  hideSourceMaps: true,

  // IMPORTANT: Disable source map upload entirely to avoid build failures
  // This prevents "Project not found" errors from blocking the build
  sourcemaps: {
    disable: true,
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
};

export default withSentryConfig(
  withBundleAnalyzer(nextConfig),
  sentryWebpackPluginOptions
);
