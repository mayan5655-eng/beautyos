import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@supabase/ssr', '@supabase/supabase-js'],
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
