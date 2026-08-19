// sentry.edge.config.ts
// Edge-runtime Sentry init (proxy.ts / any route exporting runtime = 'edge').
// Same posture as sentry.server.config.ts - see that file for the reasoning.
//
// Kept as a separate file rather than a branch inside one: the Edge bundler
// resolves @sentry/nextjs to a different build, and mixing the two in one
// module is how Node-only APIs end up in an Edge bundle.

import * as Sentry from '@sentry/nextjs';
import { scrubEvent, sentryEnabled, sentryEnvironment, tracesSampleRate } from './lib/sentryScrub';

if (sentryEnabled) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: sentryEnvironment(),
    sendDefaultPii: false,
    tracesSampleRate: tracesSampleRate(),
    beforeSend: scrubEvent,
  });
}
