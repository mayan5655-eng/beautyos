import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { securityHeaders } from "./lib/securityHeaders";

// Tenant photos live in Supabase storage and are served by the optimizer, so the
// storage host has to be on the allowlist. Derived from the same env var the
// app talks to Supabase with, and limited to the PUBLIC bucket path - the
// private client-images bucket is signed-URL only and never goes through here.
const supabaseHost = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').hostname; } catch { return ''; }
})();

const nextConfig: NextConfig = {
  serverExternalPackages: ['@supabase/ssr', '@supabase/supabase-js'],

  // The stylesheet is small (a few KB gzipped) and every page needs all of it
  // before first paint, so as a separate file it is nothing but a round trip
  // standing between the HTML and the first pixel - Lighthouse put that at
  // 150-540 ms of render-blocking on every page, on a 150 ms-RTT mobile link.
  // Inlined, it arrives with the document. The cost is a few KB of HTML per
  // navigation that a cached stylesheet would have saved a returning visitor.
  experimental: { inlineCss: true },

  turbopack: {
    resolveAlias: {
      // Next prepends a ~1 KB block to the main chunk that back-fills
      // String.prototype.trimStart, Array.prototype.at/flat/flatMap,
      // Object.fromEntries and Object.hasOwn. Every one of them exists in
      // the browsers Next itself supports (Chrome/Edge/Firefox 111+, Safari
      // 16.4+ - the floor in its docs), so it is dead weight that Lighthouse
      // reports as "Legacy JavaScript" on every page.
      '../build/polyfills/polyfill-module': './lib/emptyPolyfill.js',
    },
  },

  // Brand marks are served by app/BrandImage.tsx through /_next/image as WebP
  // at the width they are drawn at. 85 is the one non-default quality it uses
  // (fine icon strokes); Next 16 rejects any quality not listed here. The
  // files are unhashed and rarely change, so cache the optimized output for 31
  // days instead of the 4-hour default - re-requesting a mark on every visit
  // is exactly what made first load slow.
  images: {
    qualities: [75, 85],
    minimumCacheTTL: 2678400,
    remotePatterns: supabaseHost
      ? [{ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/**' }]
      : [],
  },

  // Every response, pages and API routes alike. Built in lib/securityHeaders.ts
  // so the policy is one readable, testable list rather than a string here.
  // The development flag loosens exactly two things (eval for React Refresh,
  // the hot-reload socket) and drops HSTS, which has no business on localhost.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({ dev: process.env.NODE_ENV !== "production" }),
      },
    ];
  },
};

// Sentry build plugin. Its job at build time is source maps: without them a
// production stack trace is a list of one-letter names in a minified chunk and
// tells you nothing. With them, a report points at the line in beautyos.jsx.
//
// Every option below is env-driven and the whole step degrades to "skip the
// upload, build normally" when SENTRY_AUTH_TOKEN is absent - which is the state
// on a laptop and on any deploy made before the Sentry project exists. The
// build must never fail because an observability credential is missing.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload maps for the framework chunks too, not just our own files. The
  // hook-order crash that took production down lived in a React internals
  // frame; without this it stays unreadable.
  widenClientFileUpload: true,

  // Delete the .map files after they have been uploaded so they are never
  // served from the public build. Source maps are the whole codebase - this is
  // the difference between Sentry being able to read the app and the internet
  // being able to.
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  // NOTE: `disableLogger` (strip Sentry's own debug logging from the client
  // bundle) is deliberately NOT set. It is deprecated in favour of
  // webpack.treeshake.removeDebugLogging, and neither has any effect here -
  // Next 16 builds with Turbopack, which that option does not support. Setting
  // it only produced a deprecation warning on every build.

  // Do not send build telemetry to Sentry.
  telemetry: false,

  // Quiet during local builds, verbose in CI where the log is the only way to
  // find out an upload silently did not happen.
  silent: !process.env.CI,
});
