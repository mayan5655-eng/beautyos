// instrumentation-client.ts
// Browser-side Sentry init. Next.js runs this after the HTML has loaded and
// BEFORE React hydrates, which is the only point early enough to catch a
// hydration or hook-order crash - the exact failure that took production down
// and was reported by a user rather than by us.
//
// No-op without NEXT_PUBLIC_SENTRY_DSN, same as the server config.
//
// Session Replay is deliberately NOT enabled. It would record the screen of a
// clinic CRM: client names, phone numbers, treatment history and prices, for
// people who never agreed to being filmed. The debugging value does not come
// close to justifying that on this product.

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

// Navigation breadcrumbs, so a report says which tab she was moving to when it
// broke. Exported unconditionally: it is a no-op when Sentry never initialised.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
