// lib/greenApi/credentials.ts
//
// SERVER ONLY. Reads and writes a tenant's GreenAPI credentials.
//
// Never import this from a client component. It reaches
// SUPABASE_SERVICE_ROLE_KEY and TOKEN_ENCRYPTION_KEY, neither of which carries
// a NEXT_PUBLIC_ prefix, so a client import gets `undefined` and fails loudly
// rather than leaking anything. Do not "fix" such a failure by renaming a
// variable.
//
// ── What is encrypted, and what deliberately is not ────────────────────────
//   green_api_token_encrypted   The only actual credential. AES-256-GCM.
//   green_api_instance   PLAINTEXT, on purpose. app/api/whatsapp-webhook finds
//                        the tenant with .eq("green_api_instance", idInstance),
//                        and AES-GCM's random IV means the same plaintext
//                        encrypts differently every time - that equality could
//                        never match, and every inbound message would stop.
//                        An idInstance is an account number, not a secret.
//   green_api_url        PLAINTEXT. A hostname.
//
// ── The cutover is done ────────────────────────────────────────────────────
// public.settings.green_api_token was dropped, so there is exactly one form to
// read and one to write. The dual-read that carried the migration is gone: it
// could only ever have found a column that no longer exists, and leaving it in
// would imply one still might.

import { createClient } from '@supabase/supabase-js';
// Relative + explicit .ts so node can load this module directly (node strips
// types natively). That is what lets the decrypt path be exercised by a real
// script instead of a second copy of the crypto - the drift that has already
// bitten twice in this codebase. Next resolves it the same way.
import { encryptToken, decryptToken } from '../facebook/encryption.ts';

export interface GreenApiCredentials {
  idInstance: string;
  apiToken: string;
  apiUrl: string | null;
  /** Always 'encrypted' when a token is present. Kept so callers and logs can
   *  assert it, rather than assuming. */
  tokenSource: 'encrypted' | 'none';
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/**
 * A tenant's credentials, or null when she has not connected.
 *
 * FAILS CLOSED. An unreadable row, an undecryptable token, a missing key - all
 * return null. Never a partial credential, and never a fallback to another
 * instance: lib/whatsapp.js treats null as "not connected" and refuses to
 * send, which is the correct outcome. Sending her client a message from
 * another business's number is worse than not sending.
 */
export async function readCredentials(tenantId: string): Promise<GreenApiCredentials | null> {
  if (!tenantId) return null;

  const { data, error } = await admin()
    .from('settings')
    .select('green_api_instance, green_api_url, green_api_token_encrypted')
    .eq('tenant_id', tenantId)
    .limit(1);
  if (error) {
    console.error('[greenApi] settings read failed:', error.message);
    return null;
  }
  const row = data && data.length > 0 ? (data[0] as Record<string, string | null>) : null;
  if (!row) return null;

  const idInstance = String(row.green_api_instance ?? '').trim();
  if (!idInstance) return null;

  const enc = String(row.green_api_token_encrypted ?? '').trim();
  if (!enc) return null;

  let apiToken: string;
  try {
    apiToken = decryptToken(enc);
  } catch (e) {
    // A token that will not decrypt is NOT a token. Returning null means "not
    // connected", so the caller refuses to send rather than reaching for
    // another business's instance.
    console.error(
      `[greenApi] decrypt FAILED for tenant ${tenantId}:`,
      e instanceof Error ? e.message : String(e)
    );
    return null;
  }
  if (!apiToken) return null;

  return {
    idInstance,
    apiToken,
    apiUrl: String(row.green_api_url ?? '').trim() || null,
    tokenSource: 'encrypted',
  };
}

/** Store a token, encrypted. The plaintext never touches the database. */
export async function writeToken(tenantId: string, plaintext: string): Promise<{ ok: boolean; error?: string }> {
  if (!tenantId) return { ok: false, error: 'no tenant' };
  const value = String(plaintext ?? '').trim();
  if (!value) return { ok: false, error: 'empty token' };

  let encrypted: string;
  try {
    encrypted = encryptToken(value);
  } catch (e) {
    // Almost always a missing or malformed TOKEN_ENCRYPTION_KEY. Refuse rather
    // than storing the plaintext as a "temporary" fallback.
    console.error('[greenApi] encrypt failed:', e instanceof Error ? e.message : String(e));
    return { ok: false, error: 'encryption unavailable' };
  }

  const { data, error } = await admin()
    .from('settings')
    .update({ green_api_token_encrypted: encrypted })
    .eq('tenant_id', tenantId)
    .select('tenant_id');

  if (error) {
    console.error('[greenApi] token write failed:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: (data?.length ?? 0) > 0 };
}

/** Disconnect. */
export async function clearToken(tenantId: string): Promise<{ ok: boolean; error?: string }> {
  if (!tenantId) return { ok: false, error: 'no tenant' };

  const { error } = await admin()
    .from('settings')
    .update({ green_api_token_encrypted: null })
    .eq('tenant_id', tenantId)
    .select('tenant_id');

  if (error) {
    console.error('[greenApi] token clear failed:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
