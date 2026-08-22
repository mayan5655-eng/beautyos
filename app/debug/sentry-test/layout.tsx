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
// export.
//
// CORRECTION to what this file said when it was first committed: it claimed
// middleware was disabled and /debug therefore publicly reachable. That was
// wrong. `middleware.ts.disabled` is a leftover; the ACTIVE gate is `proxy.ts`
// (Next 16 renamed the convention), and /debug is not in the PUBLIC_PREFIXES
// list in lib/supabase/middleware.ts - so an anonymous visitor gets a 307 to
// /login and never reaches either page. Verified: GET /debug/sentry-test
// returns 307, not 200.
//
// noindex/nofollow stays anyway: it costs nothing, and it is the right default
// for a route whose only purpose is to fail.
//
// The matching safety rule, enforced in both pages: NEITHER page throws merely
// because it was loaded. The client page throws on a button press, the server
// page only with an explicit ?go=1. Belt and braces on top of the auth gate,
// so nothing files a Sentry event just for being visited.

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sentry verification (temporary)',
  robots: { index: false, follow: false, nocache: true },
};

export default function DebugLayout({ children }: { children: React.ReactNode }) {
  return children;
}
