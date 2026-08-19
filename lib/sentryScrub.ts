// lib/sentryScrub.ts
//
// One place that decides what an error report is allowed to carry out of this
// application. Shared by the browser, Node and Edge Sentry inits so the three
// can never drift apart.
//
// Why this file exists at all: BloomOS is a clinic CRM. A request body on this
// product is a client's full name, her Israeli mobile number, sometimes a skin
// report - and on the settings route, a tenant's Green API token. Sentry's
// default posture is already conservative once `sendDefaultPii: false` is set
// (no IP, no cookies, no headers), but it does NOT strip request bodies, and a
// body is exactly where this product's sensitive data lives. So bodies are
// dropped here, unconditionally, rather than relying on server-side scrubbing
// rules that live in someone else's dashboard and can be edited by accident.
//
// Deliberately allow-nothing rather than deny-a-list: a new route that starts
// posting something sensitive is protected the day it is written, with nobody
// having to remember to come back here.

import type { ErrorEvent, EventHint } from '@sentry/nextjs';

/**
 * Last gate before an event leaves the process.
 *
 * Returning the event sends it; returning null drops it entirely. We never
 * drop - losing the error defeats the point - we only thin it out.
 */
export function scrubEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent {
  if (event.request) {
    // The body. Names, phone numbers, skin reports, API tokens.
    delete event.request.data;
    // Belt and braces: these are already absent under sendDefaultPii:false,
    // but an integration added later could put them back.
    delete event.request.cookies;
    delete event.request.headers;

    // The query string is KEPT on purpose. On this app it carries `?t=<tenant>`
    // and `?tab=`, which are the two things most worth knowing when reading a
    // report, and no route puts a phone number in the URL.
  }

  // Breadcrumbs auto-recorded from fetch/xhr keep only the URL, never the body,
  // so they need no treatment. `console` breadcrumbs can capture arbitrary
  // logged objects though - and this codebase console.logs whole settings
  // payloads in handleSaveSettings - so they are dropped.
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.filter((b) => b.category !== 'console');
  }

  return event;
}

/**
 * Is error reporting switched on for this process?
 *
 * A single expression, exported so every init file asks the question the same
 * way and so the app is a no-op - not a crash and not a silent half-setup -
 * when the DSN has not been added to the environment yet.
 */
export const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

/**
 * Trace sampling. Errors are always sent in full; this only governs the much
 * higher-volume performance data.
 *
 * 10% by default: beta traffic is a handful of businesses, so 10% is plenty to
 * see a slow route, and it keeps the free-tier quota available for the errors,
 * which are the reason we are here. Override per environment without a deploy.
 */
export function tracesSampleRate(): number {
  const raw = Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE);
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0.1;
}

/** Preview and production must not land in the same Sentry environment. */
export function sentryEnvironment(): string {
  return (
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
    process.env.NEXT_PUBLIC_VERCEL_ENV ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    'development'
  );
}
