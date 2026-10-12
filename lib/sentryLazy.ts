// lib/sentryLazy.ts
//
// The browser Sentry SDK, loaded on first use instead of in the first-load bundle.
//
// Why: on a phone the SDK was roughly a third of the framework chunk that every page downloads before it can show
// anything, for something that only matters in the (rare) moment something breaks. Nothing is dropped:
//   - errors raised before the SDK is there are buffered by instrumentation-client.ts (it listens from the very first
//     script) and replayed here the moment the SDK arrives;
//   - the first error asks for the SDK straight away, it does not wait for an idle moment;
//   - error boundaries (ErrorScreen) and the app's own captureException calls go through this module, so they load it
//     on demand and still get an event id back.
//
// Call sites keep their old shape: `import * as Sentry from '@/lib/sentryLazy'` and `Sentry.captureException(e)`.

import { scrubEvent, sentryEnabled, sentryEnvironment, tracesSampleRate } from './sentryScrub';

type SentryModule = typeof import('@sentry/nextjs');

let loading: Promise<SentryModule | null> | null = null;
let loaded: SentryModule | null = null;
let lastId: string | null = null;
const pendingTags: Record<string, string> = {};

/** Loads and initialises the SDK once. Resolves to null when Sentry is not configured or the chunk cannot load. */
export function loadSentry(): Promise<SentryModule | null> {
  if (!sentryEnabled) return Promise.resolve(null);
  if (!loading) {
    loading = import('@sentry/nextjs')
      .then((S) => {
        S.init({
          dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
          environment: sentryEnvironment(),
          sendDefaultPii: false,
          tracesSampleRate: tracesSampleRate(),
          beforeSend: scrubEvent,
        });
        loaded = S;
        for (const [k, v] of Object.entries(pendingTags)) { try { S.setTag(k, v); } catch { /* ignore */ } }
        return S;
      })
      .catch(() => null);
  }
  return loading;
}

/** The SDK if it has already loaded, otherwise null. Never triggers a load. */
export function loadedSentry(): SentryModule | null {
  return loaded;
}

/** Reports an error and resolves to its event id (null when Sentry is off). Never throws. */
export async function captureExceptionAsync(error: unknown): Promise<string | null> {
  try {
    const S = await loadSentry();
    if (!S) return null;
    const id = S.captureException(error) || null;
    if (id) lastId = id;
    return id;
  } catch {
    return null;
  }
}

/** Fire-and-forget form used by the app's many call sites. */
export function captureException(error: unknown): void {
  void captureExceptionAsync(error);
}

export function setTag(key: string, value: string): void {
  // Remembered and applied when the SDK arrives; a tag alone never triggers the download.
  pendingTags[key] = value;
  try { loaded?.setTag(key, value); } catch { /* telemetry never breaks the app */ }
}

/** Id of the last event this page reported, if any. */
export function lastEventId(): string | null {
  try {
    return (loaded && loaded.lastEventId && loaded.lastEventId()) || lastId;
  } catch {
    return lastId;
  }
}
