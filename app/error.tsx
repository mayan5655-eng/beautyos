'use client';

// app/error.tsx
// Route-level error boundary. Catches anything thrown below the root layout -
// which on this app is effectively everything: the whole dashboard renders
// inside it.
//
// The reporting and the user-facing code both live in ErrorScreen, shared with
// global-error.tsx.

import ErrorScreen from './ErrorScreen';

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <ErrorScreen error={error} retry={unstable_retry} />;
}
