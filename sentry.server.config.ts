// sentry.server.config.ts
// Node.js-runtime Sentry init. Loaded once per server instance from
// instrumentation.ts register(), which is the only place Next.js guarantees
// runs before the first request is served.
//
// Everything here is a no-op when NEXT_PUBLIC_SENTRY_DSN is unset, so a local
// checkout and any deploy made before the DSN is added still builds, boots and
// serves normally - error reporting is simply off. That is deliberate: an
// observability tool that can take the site down when it is misconfigured is
// worse than no observability tool.

import * as Sentry from '@sentry/nextjs';
import { scrubEvent, sentryEnabled, sentryEnvironment, tracesSampleRate } from './lib/sentryScrub';

if (sentryEnabled) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: sentryEnvironment(),

    // No IP address, no cookies, no request headers, no user identifiers
    // gathered by default. See lib/sentryScrub for why this product cannot
    // afford the defaults.
    sendDefaultPii: false,

    tracesSampleRate: tracesSampleRate(),

    // `release` is intentionally NOT set here. The Sentry build plugin in
    // next.config.ts injects the release it actually uploaded source maps
    // under; setting a second value by hand is the classic way to end up with
    // un-symbolicated stack traces that look correct in the dashboard.

    beforeSend: scrubEvent,
  });
}
