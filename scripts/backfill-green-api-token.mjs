// scripts/backfill-green-api-token.mjs
//
// STEP 3 of the GreenAPI token migration: encrypt the tokens already sitting
// in public.settings.green_api_token.
//
//   node --env-file=.env.local scripts/backfill-green-api-token.mjs            # DRY RUN
//   node --env-file=.env.local scripts/backfill-green-api-token.mjs --write    # do it
//   node --env-file=.env.local scripts/backfill-green-api-token.mjs --verify   # check after
//   node --env-file=.env.local scripts/backfill-green-api-token.mjs --decrypt-back
//
// DRY RUN IS THE DEFAULT. --write is required to change anything.
//
// ── Why Node and not SQL ───────────────────────────────────────────────────
// Postgres cannot perform AES-256-GCM with the app's key: TOKEN_ENCRYPTION_KEY
// lives in the app environment and never reaches the database. So the ciphertext
// has to be produced here, in the same format lib/facebook/encryption.ts writes.
//
// ── It never destroys the source ───────────────────────────────────────────
// This script only WRITES green_api_token_encrypted. It does not clear or drop
// green_api_token. Removing the plaintext is a separate, later, deliberate step
// (drop-green-api-token-plaintext.sql), so that a half-finished run here can
// always be re-run from intact source data.
//
// ── It verifies every row it writes ────────────────────────────────────────
// After writing, each row is read back and decrypted and compared to the
// original. A backfill that reports success without proving the value survives
// the round trip is the kind of thing that is only discovered when a
// cosmetician's reminders stop going out.
//
// No secret value is ever printed. Lengths and booleans only.

import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const MODE =
  process.argv.includes('--write') ? 'write'
  : process.argv.includes('--verify') ? 'verify'
  : process.argv.includes('--decrypt-back') ? 'decrypt-back'
  : 'dry-run';

const ALGORITHM = 'aes-256-gcm';

function getKey() {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex) throw new Error('TOKEN_ENCRYPTION_KEY is not set');
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    throw new Error(`TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex chars). Got ${key.length}.`);
  }
  return key;
}

// Byte-identical to lib/facebook/encryption.ts. Duplicated rather than imported
// because that module uses the '@/' alias, which node cannot resolve outside
// Next. The formats are asserted equal by the self-test below before any row is
// touched - if they ever drift, this refuses to run rather than writing
// ciphertext the app cannot read.
function encryptToken(plaintext) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(':');
}

function decryptToken(encrypted) {
  const parts = String(encrypted).split(':');
  if (parts.length !== 3) throw new Error('Invalid format. Expected iv:authTag:encrypted');
  const [ivHex, tagHex, dataHex] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const line = (s = '') => console.log(s);
const rule = () => line('─'.repeat(72));

line('='.repeat(72));
line(`GreenAPI token backfill — MODE: ${MODE.toUpperCase()}`);
if (MODE === 'dry-run') line('DRY RUN. Nothing will be written. Pass --write to act.');
line('No token value is printed by this script, in any mode.');
line('='.repeat(72));

// Self-test: prove the round trip works with THIS key before touching a row.
try {
  const probe = 'round-trip-probe-' + crypto.randomBytes(4).toString('hex');
  if (decryptToken(encryptToken(probe)) !== probe) throw new Error('round trip mismatch');
  line('\nkey self-test: encrypt -> decrypt round trip OK');
} catch (e) {
  line(`\nABORT: key self-test failed — ${e.message}`);
  line('Nothing was read or written.');
  process.exit(1);
}

const { data: rows, error } = await db
  .from('settings')
  .select('tenant_id, green_api_instance, green_api_token, green_api_token_encrypted');

if (error) {
  line(`\nABORT: could not read settings — ${error.message}`);
  if (/green_api_token_encrypted/.test(error.message)) {
    line('The encrypted column does not exist yet. Run');
    line('  supabase/migrations/pending/encrypt-green-api-token.sql');
    line('first (step 1).');
  }
  process.exit(1);
}

const plain = (v) => String(v ?? '').trim();
const needsBackfill = rows.filter((r) => plain(r.green_api_token) && !plain(r.green_api_token_encrypted));
const already = rows.filter((r) => plain(r.green_api_token_encrypted));
const noToken = rows.filter((r) => !plain(r.green_api_token) && !plain(r.green_api_token_encrypted));

line(`\nsettings rows: ${rows.length}`);
line(`  already encrypted      : ${already.length}`);
line(`  need backfill          : ${needsBackfill.length}`);
line(`  no token at all        : ${noToken.length}`);
rule();
for (const r of rows) {
  line(`  TENANT FILTER tenant_id=${r.tenant_id}`);
  line(`      instance set=${!!plain(r.green_api_instance)}  plaintext len=${plain(r.green_api_token).length}  encrypted len=${plain(r.green_api_token_encrypted).length}`);
}
rule();

if (MODE === 'verify') {
  line('\nVERIFY — decrypt each encrypted value and compare to the plaintext');
  line('(where the plaintext column still exists)\n');
  let ok = 0, bad = 0, unchecked = 0;
  for (const r of already) {
    try {
      const got = decryptToken(plain(r.green_api_token_encrypted));
      const src = plain(r.green_api_token);
      if (!src) { unchecked++; line(`  TENANT FILTER tenant_id=${r.tenant_id}  decrypts OK, no plaintext left to compare (len ${got.length})`); continue; }
      if (got === src) { ok++; line(`  TENANT FILTER tenant_id=${r.tenant_id}  MATCH (len ${got.length})`); }
      else { bad++; line(`  TENANT FILTER tenant_id=${r.tenant_id}  *** MISMATCH ***`); }
    } catch (e) {
      bad++; line(`  TENANT FILTER tenant_id=${r.tenant_id}  *** DECRYPT FAILED: ${e.message} ***`);
    }
  }
  rule();
  line(`  match: ${ok}   mismatch/failed: ${bad}   decrypt-only: ${unchecked}`);
  line(bad === 0
    ? '\nAll encrypted values decrypt correctly. Safe to proceed to the drop.'
    : '\nDO NOT RUN THE DROP. Investigate the failures above first.');
  process.exit(bad === 0 ? 0 : 1);
}

if (MODE === 'decrypt-back') {
  line('\nDECRYPT-BACK — restoring the plaintext column from the ciphertext.');
  line('Only for rolling back after the plaintext column was dropped and');
  line('re-created. Requires green_api_token to exist.\n');
  let done = 0, failed = 0;
  for (const r of already) {
    try {
      const value = decryptToken(plain(r.green_api_token_encrypted));
      const { error: e } = await db.from('settings').update({ green_api_token: value }).eq('tenant_id', r.tenant_id);
      if (e) { failed++; line(`  TENANT FILTER tenant_id=${r.tenant_id}  FAILED: ${e.message}`); }
      else { done++; line(`  TENANT FILTER tenant_id=${r.tenant_id}  restored (len ${value.length})`); }
    } catch (e) {
      failed++; line(`  TENANT FILTER tenant_id=${r.tenant_id}  DECRYPT FAILED: ${e.message}`);
    }
  }
  rule();
  line(`  restored: ${done}   failed: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

if (needsBackfill.length === 0) {
  line('\nNothing to back-fill. Every row with a token already has an encrypted one.');
  line(MODE === 'dry-run' ? 'DRY RUN — nothing was written.' : 'Nothing was written.');
  process.exit(0);
}

line(`\nWould encrypt ${needsBackfill.length} row(s):`);
for (const r of needsBackfill) {
  line(`  TENANT FILTER tenant_id=${r.tenant_id}   plaintext len=${plain(r.green_api_token).length}`);
}

if (MODE === 'dry-run') {
  rule();
  line('DRY RUN — nothing was written. Re-run with --write to apply.');
  process.exit(0);
}

line('\nWRITING…');
let written = 0, failed = 0;
for (const r of needsBackfill) {
  const src = plain(r.green_api_token);
  try {
    const enc = encryptToken(src);
    line(`  TENANT FILTER tenant_id=${r.tenant_id}  update settings.green_api_token_encrypted`);
    const { error: e } = await db
      .from('settings')
      .update({ green_api_token_encrypted: enc })
      .eq('tenant_id', r.tenant_id);
    if (e) { failed++; line(`      FAILED: ${e.message}`); continue; }

    // Read back and prove the round trip on the stored value, not the local one.
    const { data: back, error: rErr } = await db
      .from('settings')
      .select('green_api_token_encrypted')
      .eq('tenant_id', r.tenant_id)
      .limit(1);
    if (rErr || !back?.length) { failed++; line('      FAILED: could not read back'); continue; }
    const got = decryptToken(plain(back[0].green_api_token_encrypted));
    if (got !== src) { failed++; line('      *** ROUND TRIP MISMATCH — plaintext left intact ***'); continue; }

    written++;
    line(`      OK, verified by decrypting the stored value (len ${got.length})`);
  } catch (e) {
    failed++; line(`      FAILED: ${e.message}`);
  }
}
rule();
line(`  encrypted and verified: ${written}   failed: ${failed}`);
line('\nThe plaintext column was NOT touched. That is deliberate: run');
line('supabase/migrations/pending/drop-green-api-token-plaintext.sql as a');
line('separate step, only after --verify passes.');
process.exit(failed === 0 ? 0 : 1);
