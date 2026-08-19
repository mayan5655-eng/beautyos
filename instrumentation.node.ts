// instrumentation.node.ts
// Node.js-runtime-only startup guard (required from instrumentation.ts).
//
// ⚠️ DEVELOPMENT ONLY. This file is now tracked in git and ships with the
// build, but the patch below must never install itself in production, because
// it silences an unhandledRejection WITHOUT letting any listener see it - and
// in production one of those listeners is Sentry. A guard that hides the crash
// class we added error monitoring to catch would be worse than no monitoring.
// instrumentation.ts only requires this module outside production; the
// NODE_ENV check at the bottom is the second, independent lock.
//
// Purpose: suppress a LOCAL-ONLY noisy crash. Some dev machines run an
// antivirus/proxy that intercepts HTTPS (TLS MITM) — e.g. Avast web-shield,
// see NODE_EXTRA_CA_CERTS. When that happens, an outbound request made while
// serving a request (the Supabase auth session-refresh reached via
// proxy.ts -> updateSession -> getUser()) can come back with an empty /
// whitespace / non-JSON body (often starting with a non-ASCII space such as
// U+00A0). Something then calls the native `Response.json()` / `JSON.parse` on
// that body in a background promise that our code never awaits, so it escapes
// proxy.ts's try/catch and surfaces as a fatal-looking
// `⨯ unhandledRejection: SyntaxError ... is not valid JSON`.
//
// This is environment noise, not an application bug: production has clean TLS,
// and the request still returns 200.
//
// Why patch process.emit instead of adding a listener: Next.js registers (and
// keeps re-registering) its own 'unhandledRejection' listeners after this hook
// runs, and each of them prints the red error. Adding another listener — or a
// one-time removeAllListeners — can't stop listeners that are added later. By
// gating at the emit boundary we ensure this ONE specific rejection never
// reaches any listener, while every other event and rejection is forwarded
// untouched so real bugs are never hidden.

function isLocalJsonParseNoise(reason: unknown): reason is SyntaxError {
  return (
    reason instanceof SyntaxError &&
    /is not valid JSON|Unexpected (token|end)/.test(reason.message ?? '')
  );
}

type ProcessEmit = typeof process.emit;

// Guard against double-patching if this module is ever required twice.
const alreadyPatched = (process as unknown as { __jsonNoiseGuard?: boolean })
  .__jsonNoiseGuard;

// The second lock. instrumentation.ts already refuses to require this module
// in production; this makes the file safe even if something else imports it.
const isProduction = process.env.NODE_ENV === 'production';

if (!alreadyPatched && !isProduction) {
  (process as unknown as { __jsonNoiseGuard?: boolean }).__jsonNoiseGuard = true;

  const originalEmit: ProcessEmit = process.emit.bind(process) as ProcessEmit;

  process.emit = function (event: string | symbol, ...args: unknown[]) {
    if (event === 'unhandledRejection' && isLocalJsonParseNoise(args[0])) {
      console.warn(
        '[instrumentation] Ignored non-JSON response (likely local TLS/AV interception of an outbound HTTPS call):',
        (args[0] as SyntaxError).message
      );
      // Return true (= "had listeners / handled") WITHOUT dispatching to any
      // listener. This both silences Next's red logger AND stops Node from
      // escalating the rejection to an uncaughtException (its default
      // --unhandled-rejections=throw behaviour when it believes nothing handled it).
      return true;
    }
    return (originalEmit as (...a: unknown[]) => boolean)(event, ...args);
  } as ProcessEmit;
}
