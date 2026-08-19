// instrumentation.ts
// Next.js startup hook. `register()` runs once when a server instance boots, in
// BOTH the Node.js and Edge runtimes, and must finish before the first request
// is served.
//
// THIS FILE IS NOW TRACKED IN GIT AND DOES DEPLOY. It used to be listed in
// .gitignore, which meant the file existed on one laptop and nowhere else - so
// production had no startup hook at all and, once Sentry moved in here, would
// have had no error reporting either. Untracking it was the single reason
// production could not be observed failing.
//
// Two things happen here, and they must not be confused with each other:
//
//   1. Sentry init (both runtimes, every environment). The reason the file is
//      deployed.
//   2. The local TLS/antivirus noise guard (Node runtime, NEVER in production).
//      A development-machine convenience that suppresses one specific
//      unhandledRejection. It is gated because it works by swallowing an event
//      before any listener sees it - in production that would hide exactly the
//      class of crash Sentry was added to catch. See instrumentation.node.ts.

import * as Sentry from '@sentry/nextjs';

export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Guard first: development only. Gated here AND inside the module itself,
    // because a hook this destructive should take two mistakes to deploy, not
    // one.
    if (process.env.NODE_ENV !== 'production') {
      require('./instrumentation.node');
    }
    require('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    require('./sentry.edge.config');
  }
}

// Server-side errors that Next.js catches on our behalf - thrown Server
// Components, route handlers, Server Actions and the proxy - are reported
// through this hook rather than by wrapping every handler. The `digest` Next
// attaches to the error is what ties a report here to the code the user is
// shown on the error screen (app/ErrorScreen.tsx).
export const onRequestError = Sentry.captureRequestError;
