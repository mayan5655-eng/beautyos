'use client';

// app/global-error.tsx
// The last boundary. Catches errors thrown by the ROOT LAYOUT itself, which
// app/error.tsx cannot see because it renders inside that layout.
//
// This file replaces the root layout when it is active, so it has to bring its
// own <html>/<body> and its own stylesheet - nothing from layout.tsx is
// available here, including the loaded fonts. ErrorScreen therefore carries
// literal colours and a font fallback chain rather than relying on the design
// tokens.

import ErrorScreen from './ErrorScreen';
import './globals.css';

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <title>שגיאה — BloomOS</title>
        <ErrorScreen error={error} retry={unstable_retry} />
      </body>
    </html>
  );
}
