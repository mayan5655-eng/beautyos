'use client';

// app/ErrorScreen.tsx
// The screen a real user sees when something crashes, and the thing that makes
// a beta bug report actionable.
//
// The point of the error code: a cosmetician mid-treatment will not send a
// stack trace, and she should not have to describe what happened. She sends
// six characters. Those six characters are the head of the Sentry event ID for
// this exact crash, so the report she is describing can be opened directly
// instead of guessed at from a timestamp.
//
// Where the code comes from, in order:
//   1. The Sentry event ID returned by captureException - a client-side crash
//      that we have just reported ourselves.
//   2. error.digest - Next.js's own hash for a SERVER error. The server never
//      sends the real message to the browser (it could leak data), so digest is
//      all the client is given; instrumentation.ts's onRequestError has already
//      sent the full error to Sentry under that same digest.
//   3. Nothing. Then no code is shown - an invented code that matches no report
//      is worse than none, because it makes her think she has given us
//      something useful.
//
// Shared by app/error.tsx and app/global-error.tsx so the two can never drift.

import { useEffect, useState } from 'react';
import * as Sentry from '@sentry/nextjs';

export type ErrorScreenProps = {
  error: Error & { digest?: string };
  /** Next 16.2+: re-fetches and re-renders the failed segment. */
  retry?: () => void;
};

export default function ErrorScreen({ error, retry }: ErrorScreenProps) {
  const [fullId, setFullId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Report first, then show her the ID we got back. Guarded so that with no
    // DSN configured we fall through to digest rather than displaying an ID
    // that was never sent anywhere.
    let id: string | null = null;
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      try {
        id = Sentry.captureException(error) || null;
      } catch {
        id = null;
      }
    }
    setFullId(id || error.digest || null);
  }, [error]);

  // Six characters, uppercase, no ambiguity about hyphens. Long enough to be
  // unique across a beta's worth of errors, short enough to read out loud over
  // the phone with wet hands.
  const shortCode = fullId ? fullId.replace(/-/g, '').slice(0, 6).toUpperCase() : null;

  const copy = async () => {
    if (!fullId) return;
    // The full ID plus where and when, because that is what actually makes a
    // WhatsApp message searchable later. She sees the short code; support gets
    // everything.
    const payload = [
      `BloomOS error ${shortCode}`,
      `id: ${fullId}`,
      `url: ${typeof window !== 'undefined' ? window.location.pathname : ''}`,
      `time: ${new Date().toISOString()}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard blocked (insecure context, older iOS Safari). The code is on
      // screen in large type anyway, which is the primary path.
    }
  };

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: '#FCF8FB',
        fontFamily: "var(--sans, 'Assistant', system-ui, -apple-system, sans-serif)",
        color: '#2A2233',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          background: '#FFFFFF',
          border: '1px solid #ECE4F0',
          borderRadius: 20,
          boxShadow: '0 18px 44px rgba(74, 46, 90, 0.10)',
          padding: '32px 26px',
          textAlign: 'center',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 62,
            height: 62,
            margin: '0 auto 18px',
            borderRadius: '50%',
            background: '#F1E2F2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden>
            <path
              d="M12 8.4v4.4M12 16.2v.01M10.3 3.9 2.9 17.1a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"
              fill="none"
              stroke="#5B3E67"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h1
          style={{
            fontFamily: "var(--display, 'Frank Ruhl Libre', Georgia, serif)",
            fontSize: 24,
            fontWeight: 600,
            margin: '0 0 10px',
            letterSpacing: '-0.01em',
          }}
        >
          משהו השתבש
        </h1>

        <p style={{ fontSize: 15, lineHeight: 1.6, color: '#6B6275', margin: '0 0 22px' }}>
          נתקלנו בתקלה זמנית. הנתונים שלך בטוחים.
          <br />
          אפשר לנסות שוב — ואם זה חוזר, שלחי לנו את הקוד למטה.
        </p>

        {shortCode && (
          <div
            style={{
              background: '#FAF6FC',
              border: '1px solid #E2D6EA',
              borderRadius: 14,
              padding: '14px 16px',
              marginBottom: 20,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: '#6B6275', marginBottom: 6 }}>
              קוד התקלה
            </div>
            <div
              style={{
                fontFamily: "'SF Mono', ui-monospace, Menlo, Consolas, monospace",
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: '0.14em',
                color: '#4C3457',
                direction: 'ltr',
              }}
            >
              {shortCode}
            </div>
            <button
              type="button"
              onClick={copy}
              style={{
                marginTop: 10,
                background: 'none',
                border: 'none',
                color: '#5B3E67',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                textDecoration: 'underline',
                padding: 6,
              }}
            >
              {copied ? 'הקוד הועתק ✓' : 'העתקת הקוד'}
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
          {retry && (
            <button
              type="button"
              onClick={() => retry()}
              style={{
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
              }}
            >
              נסי שוב
            </button>
          )}
          <a
            href="/"
            style={{
              width: '100%',
              padding: '13px 20px',
              borderRadius: 999,
              border: '1px solid #E2D6EA',
              background: '#FFFFFF',
              color: '#5B3E67',
              fontSize: 15,
              fontWeight: 600,
              textDecoration: 'none',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          >
            חזרה למסך הבית
          </a>
        </div>
      </div>
    </div>
  );
}
