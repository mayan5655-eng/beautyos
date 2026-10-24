// Audit round 2 (2026-10-20), merged 2026-10-24: reminder claims, stale legal-receipt rows, the chunked sent-log read.
import assert from 'node:assert/strict';

process.env.TOKEN_ENCRYPTION_KEY ??= '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

const { claimReminder } = await import('./lib/reminders/dailyReminders.js');
const { loadSentSet } = await import('./lib/reminders/smartReminders.js');
const { releaseStalePending } = await import('./lib/legalReceipts/service.js');

// ── claimReminder: claimed / taken / none ───────────────────────────────────
{
  const rows = new Set<string>();
  const db = {
    from: (t: string) => ({
      insert: async (r: { appointment_id: string; kind: string }) => {
        assert.equal(t, 'reminder_claims');
        const k = `${r.appointment_id}|${r.kind}`;
        if (rows.has(k)) return { error: { code: '23505', message: 'duplicate key' } };
        rows.add(k);
        return { error: null };
      },
    }),
  };
  assert.equal(await claimReminder(db, 'a1', 'day_before:2026-10-25'), 'claimed');
  assert.equal(await claimReminder(db, 'a1', 'day_before:2026-10-25'), 'taken', 'a second sender stops');
  assert.equal(await claimReminder(db, 'a1', 'day_before:2026-10-26'), 'claimed', 'another day is another claim');

  const missing = { from: () => ({ insert: async () => ({ error: { code: 'PGRST205', message: 'no table' } }) }) };
  assert.equal(await claimReminder(missing, 'a1', 'k'), 'none', 'before the SQL runs: send as before');
  const throws = { from: () => ({ insert: async () => { throw new Error('network'); } }) };
  assert.equal(await claimReminder(throws, 'a1', 'k'), 'none');
}

// ── loadSentSet: only the candidates' rows, in chunks ───────────────────────
{
  const log = Array.from({ length: 400 }, (_, i) => ({ tenant_id: 't', client_id: `c${i}`, reminder_type: 'winback', reference_id: 'r' }));
  const inCalls: string[][] = [];
  const db = {
    from: () => {
      let ids: string[] | null = null;
      const q = {
        select: () => q,
        in: (_col: string, v: string[]) => { ids = v; inCalls.push(v); return q; },
        order: () => q,
        range: async (from: number, to: number) => {
          const all = ids ? log.filter((r) => ids!.includes(r.client_id)) : log;
          return { data: all.slice(from, to + 1), count: all.length, error: null };
        },
      };
      return q;
    },
  };
  const stats = { queries: 0 };
  const wanted = Array.from({ length: 320 }, (_, i) => `c${i}`);
  const sent = await loadSentSet(db, stats, [...wanted, 'c0']);
  assert.equal(sent.size, 320, 'every candidate row, duplicates in the id list ignored');
  assert.ok(inCalls.length >= 3 && inCalls.every((c) => c.length <= 150), 'read in chunks of at most 150 ids');
  const whole = await loadSentSet(db, { queries: 0 });
  assert.equal(whole.size, 400, 'without ids: the whole log, as before');
}

// ── releaseStalePending: pending rows past 30 minutes become unknown ────────
{
  const now = new Date('2026-10-24T10:00:00Z');
  const tables: Record<string, any[]> = {
    receipts: [
      { id: 'old', legal_status: 'pending', legal_attempted_at: '2026-10-24T09:00:00Z' },
      { id: 'fresh', legal_status: 'pending', legal_attempted_at: '2026-10-24T09:50:00Z' },
      { id: 'done', legal_status: 'issued', legal_attempted_at: '2026-10-24T08:00:00Z' },
    ],
    receipt_voids: [{ id: 'v-old', credit_status: 'pending', credit_attempted_at: '2026-10-23T09:00:00Z' }],
  };
  const db = {
    from: (t: string) => ({
      update: (patch: Record<string, unknown>) => {
        const conds: Array<(r: any) => boolean> = [];
        const q = {
          eq: (c: string, v: unknown) => { conds.push((r) => r[c] === v); return q; },
          lt: (c: string, v: string) => { conds.push((r) => r[c] < v); return q; },
          select: async () => {
            const hit = tables[t].filter((r) => conds.every((f) => f(r)));
            hit.forEach((r) => Object.assign(r, patch));
            return { data: hit.map((r) => ({ id: r.id })), error: null };
          },
        };
        return q;
      },
    }),
  };
  assert.equal(await releaseStalePending(db, now), 2);
  assert.equal(tables.receipts[0].legal_status, 'unknown');
  assert.ok(/לבדוק אצל הספק/.test(tables.receipts[0].legal_error));
  assert.equal(tables.receipts[1].legal_status, 'pending', 'a fresh attempt may still be running');
  assert.equal(tables.receipts[2].legal_status, 'issued');
  assert.equal(tables.receipt_voids[0].credit_status, 'unknown');
}

console.log('audit round 2: ok');
