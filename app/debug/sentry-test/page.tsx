'use client';

// app/debug/sentry-test/page.tsx
//
// TEMPORARY - delete `app/debug/` when verification is done. See ./layout.tsx.
//
// The CLIENT half of the Sentry check, plus the launcher for the server half.
//
// Why the throw happens during render rather than inside the onClick handler:
// React error boundaries do not catch errors thrown in event handlers - they
// only catch errors thrown while rendering. A `throw` inside onClick would go
// to window.onerror, which Sentry does still report, but it would NOT render
// app/error.tsx and so would never produce the six-character code that
// app/ErrorScreen.tsx shows the user. That code is the third thing being
// verified here, so the button sets state and the throw happens on the
// re-render, which is the path a real crash takes.

import { useState } from 'react';

export default function SentryTestPage() {
  const [boom, setBoom] = useState(false);

  if (boom) {
    // Deliberate. This is the whole point of the file.
    // The message is distinctive so it is unmistakable in the Sentry issue list
    // and cannot be confused with a real production error.
    throw new Error('BloomOS Sentry verification - deliberate CLIENT error');
  }

  return (
    <main style={S.page}>
      <div style={S.card}>
        <p style={S.badge}>TEMPORARY DEBUG ROUTE</p>
        <h1 style={S.h1}>Sentry verification</h1>
        <p style={S.lede}>
          Nothing has been sent to Sentry yet. Loading this page does not report
          anything &mdash; you have to press a button below.
        </p>

        <ol style={S.steps}>
          <li>Press one of the buttons.</li>
          <li>
            You should land on the normal Hebrew error screen showing a
            six-character <strong>קוד התקלה</strong>. Write it down.
          </li>
          <li>
            Open <code style={S.code}>bloomos.sentry.io/issues/</code> and check the
            newest issue: its title should match the button you pressed, its event
            ID should start with those six characters, and the stack trace should
            name this file with real line numbers &mdash; not one-letter variables
            in a minified chunk.
          </li>
        </ol>

        <button type="button" onClick={() => setBoom(true)} style={S.btnPrimary}>
          Trigger CLIENT error
        </button>
        <p style={S.hint}>
          Throws in the browser during render. Reported by{' '}
          <code style={S.code}>instrumentation-client.ts</code> via{' '}
          <code style={S.code}>Sentry.captureException</code>. The code you see comes
          straight back from that call.
        </p>

        <a href="/debug/sentry-test/server?go=1" style={S.btnSecondary}>
          Trigger SERVER error
        </a>
        <p style={S.hint}>
          Throws in a Server Component on Vercel. Reported by{' '}
          <code style={S.code}>onRequestError</code> in{' '}
          <code style={S.code}>instrumentation.ts</code>. The browser is never told
          the real message, so the code shown comes from Next&rsquo;s{' '}
          <code style={S.code}>digest</code> instead &mdash; which is the same key
          Sentry filed it under.
        </p>

        <p style={S.footer}>
          Two separate paths on purpose: a passing client test says nothing about
          whether server-side reporting or server source maps work, and vice versa.
        </p>
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
    maxWidth: 560,
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
    fontSize: 25,
    fontWeight: 600,
    margin: '0 0 10px',
  },
  lede: { fontSize: 15, lineHeight: 1.6, color: '#6B6275', margin: '0 0 18px' },
  steps: {
    fontSize: 14.5,
    lineHeight: 1.7,
    color: '#4A4155',
    margin: '0 0 24px',
    paddingInlineStart: 20,
  },
  code: {
    fontFamily: "'SF Mono', ui-monospace, Menlo, Consolas, monospace",
    fontSize: '0.9em',
    background: '#F6F1F8',
    borderRadius: 5,
    padding: '1px 5px',
  },
  btnPrimary: {
    display: 'block',
    width: '100%',
    padding: '14px 20px',
    borderRadius: 999,
    border: 'none',
    background: 'linear-gradient(135deg, #7D6489 0%, #4C3457 100%)',
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnSecondary: {
    display: 'block',
    width: '100%',
    padding: '13px 20px',
    borderRadius: 999,
    border: '1px solid #E2D6EA',
    background: '#FFFFFF',
    color: '#5B3E67',
    fontSize: 15,
    fontWeight: 600,
    textDecoration: 'none',
    textAlign: 'center',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  hint: { fontSize: 13, lineHeight: 1.6, color: '#8B8296', margin: '9px 0 20px' },
  footer: {
    fontSize: 12.5,
    lineHeight: 1.6,
    color: '#9A93A3',
    margin: '6px 0 0',
    paddingTop: 16,
    borderTop: '1px solid #F0EAF3',
  },
};
