// lib/linkSecret.ts
//
// SERVER ONLY. Never import this into a client component - it reads secrets.
//
// One place that answers "what key signs the links in our WhatsApp messages",
// for lib/confirmToken, lib/reviewToken and lib/scanToken.
//
// ── The fallback, and why it is now loud ───────────────────────────────────
// Each signer used to do `process.env.X_SECRET || SUPABASE_SERVICE_ROLE_KEY`
// quietly. The reasoning was sound - the app cannot run without the service
// key, so links could never silently stop working over one missing variable
// - but the consequence was not written down anywhere an operator would see
// it: with the dedicated variables unset, every confirm, cancel, review and
// scanner link in every message is an HMAC under the database master key,
// and rotating that key invalidates every link ever sent.
//
// The fallback stays, because failing closed here means a reminder run that
// throws on its first appointment. What changes: it is announced once per
// process with the exact variable to set, and `linkSecretsConfigured()` lets
// a health check say so too.
//
// ── Rotation without breaking sent links ───────────────────────────────────
// `legacySecrets()` returns every key an OLD-format token may have been
// signed with - the dedicated one and the service-role one - so the day the
// dedicated variable is finally set, links that went out under the fallback
// still verify until the legacy window closes (see the token modules).

const warned = new Set<string>();

function warnOnce(envName: string, log: { error: (...args: unknown[]) => void } = console) {
  if (warned.has(envName)) return;
  warned.add(envName);
  log.error(
    `[linkSecret] ${envName} is not set: links are being signed with SUPABASE_SERVICE_ROLE_KEY. ` +
      `Set ${envName} in Vercel (a distinct random value) so link signatures can be rotated on their own.`
  );
}

export type SecretEnv = Record<string, string | undefined>;

/**
 * The key to SIGN with now: the dedicated variable, else the service-role key.
 * Throws only when neither exists, which is a process that cannot run anyway.
 */
export function signingSecret(envName: string, env: SecretEnv = process.env, log?: { error: (...args: unknown[]) => void }): string {
  const dedicated = String(env[envName] || '').trim();
  if (dedicated) return dedicated;
  const fallback = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!fallback) throw new Error(`${envName}: no signing secret available`);
  warnOnce(envName, log);
  return fallback;
}

/**
 * Every key a legacy (un-dated) token might carry: the dedicated variable
 * first, then the service-role key. Distinct, non-empty, in that order.
 */
export function legacySecrets(envName: string, env: SecretEnv = process.env): string[] {
  const out: string[] = [];
  for (const v of [env[envName], env.SUPABASE_SERVICE_ROLE_KEY]) {
    const s = String(v || '').trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

/** True when every link secret has its own variable. For health checks. */
export function linkSecretsConfigured(env: SecretEnv = process.env): { ok: boolean; missing: string[] } {
  const names = ['CONFIRM_LINK_SECRET', 'REVIEW_LINK_SECRET'];
  const missing = names.filter((n) => !String(env[n] || '').trim());
  return { ok: missing.length === 0, missing };
}

/** For tests: forget which warnings were printed. */
export function _resetLinkSecretWarnings() {
  warned.clear();
}
