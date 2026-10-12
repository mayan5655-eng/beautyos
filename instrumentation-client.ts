// instrumentation-client.ts
// Browser-side error reporting. Next.js runs this after the HTML has loaded and
// BEFORE React hydrates, which is the only point early enough to catch a
// hydration or hook-order crash - the exact failure that took production down
// and was reported by a user rather than by us.
//
// The Sentry SDK itself is no longer part of the first-load bundle (lib/sentryLazy.ts): this file stays tiny, listens
// from the first script on, and
//   - the moment anything is thrown, asks for the SDK and replays what it heard;
//   - otherwise loads the SDK once the page has finished loading and the browser is idle, so navigation breadcrumbs
//     and slow-route traces keep working.
// No-op without NEXT_PUBLIC_SENTRY_DSN.
//
// Session Replay is deliberately NOT enabled. It would record the screen of a
// clinic CRM: client names, phone numbers, treatment history and prices, for
// people who never agreed to being filmed. The debugging value does not come
// close to justifying that on this product.

import { sentryEnabled } from './lib/sentryScrub';
import { loadSentry, loadedSentry } from './lib/sentryLazy';

if (sentryEnabled && typeof window !== 'undefined') {
  const heard: unknown[] = [];
  let armed = true;

  const onError = (e: ErrorEvent) => {
    if (!armed) return;
    if (heard.length < 20) heard.push(e.error || new Error(e.message || 'window error'));
    void flush();
  };
  const onRejection = (e: PromiseRejectionEvent) => {
    if (!armed) return;
    if (heard.length < 20) heard.push(e.reason instanceof Error ? e.reason : new Error(String(e.reason)));
    void flush();
  };

  async function flush() {
    const S = await loadSentry();
    if (!S) return;
    // From here the SDK's own global handlers are installed: stop buffering, replay what we heard.
    armed = false;
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    for (const err of heard.splice(0)) {
      try { S.captureException(err); } catch { /* ignore */ }
    }
  }

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  const idle = () => {
    const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, o?: { timeout: number }) => void);
    // Well after the page is interactive: reporting setup must never compete with first paint or the first tap. A
    // real error does not wait for this (see onError).
    const later = () => { if (ric) ric(() => void flush(), { timeout: 5000 }); else void flush(); };
    setTimeout(later, 12000);
  };
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
}

// Navigation breadcrumbs, so a report says which tab she was moving to when it
// broke. A no-op until the SDK has loaded (it loads on idle, or on the first error).
export const onRouterTransitionStart = (url: string, navigationType: 'push' | 'replace' | 'traverse') => {
  try { loadedSentry()?.captureRouterTransitionStart(url, navigationType); } catch { /* telemetry never breaks navigation */ }
};
