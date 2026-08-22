// app/debug/sentry-test/server/page.tsx
//
// TEMPORARY - delete `app/debug/` when verification is done. See ../layout.tsx.
//
// The SERVER half of the Sentry check.
//
// A Server Component that throws is caught by Next and handed to the
// `onRequestError` hook, which instrumentation.ts wires to
// Sentry.captureRequestError. That is a completely different reporting path
// from the browser SDK, over different source maps, so a passing client test
// says nothing about whether this one works.
//
// `?go=1` is required before it throws. Without it the page renders normally.
// /debug is publicly reachable on this project (middleware.ts is disabled), and
// a page that threw on sight would let any crawler drain the Sentry quota.
//
// searchParams is a Promise in Next 16 and must be awaited - accessing it
// synchronously was deprecated after 14.

export default async function SentryTestServerPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const go = (await searchParams).go;

  if (go === '1') {
    // Deliberate. Thrown while rendering on the server, so Next catches it,
    // attaches a `digest`, and reports it through onRequestError. The browser
    // is never sent this message - it only receives the digest, which is what
    // app/ErrorScreen.tsx turns into the six-character code.
    throw new Error('BloomOS Sentry verification - deliberate SERVER error');
  }

  return (
    <main style={S.page}>
      <div style={S.card}>
        <p style={S.badge}>TEMPORARY DEBUG ROUTE</p>
        <h1 style={S.h1}>Server error test</h1>
        <p style={S.lede}>
          Nothing was thrown. This page only fails when it is asked to, so that a
          crawler finding the bare URL does not file a Sentry event.
        </p>
        <a href="/debug/sentry-test/server?go=1" style={S.btn}>
          Throw the server error now
        </a>
        <p style={S.hint}>
          Expect the Hebrew error screen with a six-character code. In Sentry the
          issue should be titled{' '}
          <em>BloomOS Sentry verification - deliberate SERVER error</em> and its
          stack trace should name this file.
        </p>
        <a href="/debug/sentry-test" style={S.back}>
          &larr; back to both tests
        </a>
      </div>
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: '#FCF8FB',
    fontFamily: "var(--sans, 'Assistant', system-ui, -apple-system, sans-serif)",
    color: '#2A2233',
  },
  card: {
    width: '100%',
    maxWidth: 520,
    background: '#FFFFFF',
    border: '1px solid #ECE4F0',
    borderRadius: 20,
    boxShadow: '0 18px 44px rgba(74, 46, 90, 0.10)',
    padding: '30px 28px',
  },
  badge: {
    display: 'inline-block',
    background: '#F1E2F2',
    color: '#5B3E67',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.12em',
    borderRadius: 999,
    padding: '5px 11px',
    margin: '0 0 14px',
  },
  h1: {
    fontFamily: "var(--display, 'Frank Ruhl Libre', Georgia, serif)",
    fontSize: 24,
    fontWeight: 600,
    margin: '0 0 10px',
  },
  lede: { fontSize: 15, lineHeight: 1.6, color: '#6B6275', margin: '0 0 20px' },
  btn: {
    display: 'block',
    width: '100%',
    padding: '14px 20px',
    borderRadius: 999,
    border: 'none',
    background: 'linear-gradient(135deg, #7D6489 0%, #4C3457 100%)',
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 600,
    textDecoration: 'none',
    textAlign: 'center',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  hint: { fontSize: 13, lineHeight: 1.6, color: '#8B8296', margin: '10px 0 18px' },
  back: {
    fontSize: 14,
    color: '#5B3E67',
    fontWeight: 600,
    textDecoration: 'none',
  },
};
