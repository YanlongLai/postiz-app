// @ts-check
import { withSentryConfig } from '@sentry/nextjs';
const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_AUTH_TOKEN);
const sentryUploadEnabled = Boolean(process.env.SENTRY_AUTH_TOKEN);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 16 defaults to Turbopack. The webpack hook below is compatibility-only;
  // keep the bundler choice explicit even when Sentry is not configured.
  turbopack: {},
  experimental: {
    proxyTimeout: 90_000,
    cpus: 2,
    webpackBuildWorker: true,
    webpackMemoryOptimizations: true,
  },
  // Document-Policy header for browser profiling
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Document-Policy',
            value: 'js-profiling',
          },
        ],
      },
    ];
  },
  reactStrictMode: false,
  transpilePackages: ['crypto-hash'],
  // The sanitizer's Node DOM implementation loads packaged CSS by __dirname.
  // Keep its server dependency tree intact rather than relocating it into pages.
  serverExternalPackages: ['isomorphic-dompurify', 'jsdom'],
  // Enable production sourcemaps for Sentry
  productionBrowserSourceMaps: sentryUploadEnabled,

  // Custom webpack config to ensure sourcemaps are generated properly
  webpack: (config, { buildId, dev, isServer, defaultLoaders }) => {
    // Enable sourcemaps for both client and server in production
    if (!dev && sentryUploadEnabled) {
      config.devtool = isServer ? 'source-map' : 'hidden-source-map';
    }

    return config;
  },
  async redirects() {
    return [
      {
        source: '/api/uploads/:path*',
        destination:
          process.env.STORAGE_PROVIDER === 'local' ? '/uploads/:path*' : '/404',
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/uploads/:path*',
        destination:
          process.env.STORAGE_PROVIDER === 'local'
            ? '/api/uploads/:path*'
            : '/404',
      },
    ];
  },
};

export default sentryEnabled ? withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Sourcemap configuration optimized for monorepo
  sourcemaps: {
    disable: !sentryUploadEnabled,
    // More comprehensive asset patterns for monorepo
    assets: [
      '.next/static/**/*.js',
      '.next/static/**/*.js.map',
      '.next/server/**/*.js',
      '.next/server/**/*.js.map',
    ],
    ignore: [
      '**/node_modules/**',
      '**/*hot-update*',
      '**/_buildManifest.js',
      '**/_ssgManifest.js',
      '**/*.test.js',
      '**/*.spec.js',
    ],
    deleteSourcemapsAfterUpload: sentryUploadEnabled,
  },

  // Release configuration
  release: {
    create: sentryUploadEnabled,
    finalize: sentryUploadEnabled,
    // Use git commit hash for releases in monorepo
    name:
      process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || undefined,
  },

  // NextJS specific optimizations for monorepo
  widenClientFileUpload: true,

  // Additional configuration
  telemetry: false,
  silent: process.env.NODE_ENV === 'production',
  debug: process.env.NODE_ENV === 'development',

  // Error handling for CI/CD
  errorHandler: (error) => {
    console.warn('Sentry build error occurred:', error.message);
    console.warn(
      'This might be due to missing Sentry environment variables or network issues'
    );
    // Don't fail the build if Sentry upload fails in monorepo context
    return;
  },
}) : nextConfig;
