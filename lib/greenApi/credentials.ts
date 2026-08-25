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
//   green_api_token      ENCRYPTED. The only actual credential.
//   green_api_instance   PLAINTEXT, on purpose. app/api/whatsapp-webhook finds
//                        the tenant with .eq("green_api_instance", idInstance),
//                        and AES-GCM's random IV means the same plaintext
//                        encrypts differently every time - that equality could
//                        never match, and every inbound message would stop.
//                        An idInstance is an account number, not a secret.
//   green_api_url        PLAINTEXT. A hostname.
//
// ── Reads BOTH during the cutover ──────────────────────────────────────────
// The migration runs in stages: add column -> deploy -> backfill -> drop. For
// the window between the deploy and the drop, a row may hold either form. This
// prefers the encrypted value and falls back to the plaintext one, so a request
// in flight during the cutover keeps working. Once the plaintext column is
// dropped the fallback becomes dead code and can go.

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
  /** Where the token came from. Useful while both columns exist. */
  tokenSource: 'encrypted' | 'plaintext-legacy' | 'none';
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/** Column list that tolerates the plaintext column being absent post-drop. */
async function selectSettings(tenantId: string) {
  const db = admin();
  const withLegacy = await db
    .from('settings')
    .select('green_api_instance, green_api_url, green_api_token, green_api_token_encrypted')
    .eq('tenant_id', tenantId)
    .limit(1);

  if (!withLegacy.error) return withLegacy;

  // After drop-green-api-token-plaintext.sql the legacy column is gone and the
  // select above fails on an unknown column. Retry without it.
  return db
    .from('settings')
    .select('green_api_instance, green_api_url, green_api_token_encrypted')
    .eq('tenant_id', tenantId)
    .limit(1);
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

  const { data, error } = await selectSettings(tenantId);
  if (error) {
    console.error('[greenApi] settings read failed:', error.message);
    return null;
  }
  const row = data && data.length > 0 ? (data[0] as Record<string, string | null>) : null;
  if (!row) return null;

  const idInstance = String(row.green_api_instance ?? '').trim();
  if (!idInstance) return null;

  let apiToken = '';
  let tokenSource: GreenApiCredentials['tokenSource'] = 'none';

  const enc = String(row.green_api_token_encrypted ?? '').trim();
  if (enc) {
    try {
      apiToken = decryptToken(enc);
      tokenSource = 'encrypted';
    } catch (e) {
      // A token that will not decrypt is NOT a token. Do not fall through to
      // the plaintext column: if both exist and the ciphertext is broken,
      // something is wrong that silently using the old value would hide.
      console.error(
        `[greenApi] decrypt FAILED for tenant ${tenantId}:`,
        e instanceof Error ? e.message : String(e)
      );
      return null;
    }
  } else {
    const legacy = String(row.green_api_token ?? '').trim();
    if (legacy) {
      apiToken = legacy;
      tokenSource = 'plaintext-legacy';
    }
  }

  if (!apiToken) return null;

  return {
    idInstance,
    apiToken,
    apiUrl: String(row.green_api_url ?? '').trim() || null,
    tokenSource,
  };
}

/**
 * Store a token, encrypted. The plaintext never touches the database.
 *
 * The legacy column is cleared in the same update when it is still present, so
 * saving a new token cannot leave a stale plaintext copy behind - which would
 * otherwise be the one thing this whole migration was meant to remove.
 */
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

  const db = admin();
  const withLegacy = await db
    .from('settings')
    .update({ green_api_token_encrypted: encrypted, green_api_token: null })
    .eq('tenant_id', tenantId)
    .select('tenant_id');

  if (!withLegacy.error) return { ok: (withLegacy.data?.length ?? 0) > 0 };

  const post = await db
    .from('settings')
    .update({ green_api_token_encrypted: encrypted })
    .eq('tenant_id', tenantId)
    .select('tenant_id');

  if (post.error) {
    console.error('[greenApi] token write failed:', post.error.message);
    return { ok: false, error: post.error.message };
  }
  return { ok: (post.data?.length ?? 0) > 0 };
}

/** Disconnect: clear both forms. */
export async function clearToken(tenantId: string): Promise<{ ok: boolean; error?: string }> {
  if (!tenantId) return { ok: false, error: 'no tenant' };
  const db = admin();

  const withLegacy = await db
    .from('settings')
    .update({ green_api_token_encrypted: null, green_api_token: null })
    .eq('tenant_id', tenantId)
    .select('tenant_id');
  if (!withLegacy.error) return { ok: true };

  const post = await db
    .from('settings')
    .update({ green_api_token_encrypted: null })
    .eq('tenant_id', tenantId)
    .select('tenant_id');
  if (post.error) return { ok: false, error: post.error.message };
  return { ok: true };
}
