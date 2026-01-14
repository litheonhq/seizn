import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  // Enable standalone output for Docker
  output: 'standalone',

  // Disable devtools indicator in development
  devIndicators: false,

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

export default withSentryConfig(nextConfig, sentryWebpackPluginOptions);
