// app/debug/sentry-test/layout.tsx
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │  TEMPORARY. DELETE THE WHOLE `app/debug/` FOLDER WHEN VERIFICATION IS    │
// │  DONE.  →  git rm -r app/debug && git commit && git push                 │
// └──────────────────────────────────────────────────────────────────────────┘
//
// This subtree exists for one purpose: to prove that Sentry actually receives
// errors from production, with a readable (source-mapped) stack trace. It was
// added because there was no other way to find out - the app has no route that
// fails on purpose, and "the DSN is in the bundle" only proves the SDK has a
// transport, not that anything arrives at the other end.
//
// The layout is here to hold `metadata`, which a Client Component page cannot
// export. noindex/nofollow because `middleware.ts` is disabled on this project,
// so everything under /debug is publicly reachable and would otherwise be
// crawlable - and a crawler that found a route which throws on sight would sit
// there burning the Sentry quota.
//
// The matching safety rule, enforced in both pages: NEITHER page throws merely
// because it was loaded. The client page throws on a button press, the server
// page only with an explicit ?go=1. A bot following the bare URL gets a inert
// page and files nothing.

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sentry verification (temporary)',
  robots: { index: false, follow: false, nocache: true },
};

export default function DebugLayout({ children }: { children: React.ReactNode }) {
  return children;
}
