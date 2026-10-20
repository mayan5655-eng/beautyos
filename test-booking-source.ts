// Where bookings come from (lib/bookingSource.ts): tagged links, the visit memory, the referral link, the report, and the booking route
// writing it best-effort AFTER the booking. Pure functions and source checks only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  cleanSource, cleanRef, sourceLabel, readSourceParams, withSource, rememberSource, recalledSource, referralMessageHe,
  bookingsBySource, referralCounts,
} from './lib/bookingSource.ts';

const src = (p: string) => readFileSync(new URL(`./${p}`, import.meta.url), 'utf8');
const U = '3f2a1b4c-0000-4000-8000-00000000abcd';

// ── values ───────────────────────────────────────────────────────────────────
assert.equal(cleanSource(' Instagram '), 'instagram');
assert.equal(cleanSource('<script>'), 'script', 'only safe characters survive');
assert.equal(cleanSource('x'.repeat(50)).length, 30);
assert.equal(cleanRef(U.toUpperCase()), U);
assert.equal(cleanRef('1 or 1=1'), '');
assert.equal(sourceLabel('bio'), 'קישור בביו');
assert.equal(sourceLabel('newsletter'), 'newsletter', 'an unknown channel passes through');
assert.equal(sourceLabel(''), 'לא ידוע');

// ── reading a link ───────────────────────────────────────────────────────────
assert.deepEqual(readSourceParams('?src=whatsapp'), { src: 'whatsapp', ref: '' });
assert.deepEqual(readSourceParams('utm_source=facebook&utm_medium=cpc'), { src: 'facebook', ref: '' }, 'a campaign link counts too');
assert.deepEqual(readSourceParams(`?ref=${U}`), { src: 'referral', ref: U }, 'a referral link alone means referral');
assert.deepEqual(readSourceParams('?src=post&ref=bad'), { src: 'post', ref: '' });

// ── tagging her links ────────────────────────────────────────────────────────
assert.equal(withSource('https://kalmea.app/lily-nails', 'bio'), 'https://kalmea.app/lily-nails?src=bio');
assert.equal(withSource('https://kalmea.app/book?t=abc', 'whatsapp'), 'https://kalmea.app/book?t=abc&src=whatsapp');
assert.equal(withSource('https://kalmea.app/x?src=old', 'post'), 'https://kalmea.app/x?src=post', 'one source, never two');
assert.equal(withSource('https://kalmea.app/x', 'referral', U), `https://kalmea.app/x?src=referral&ref=${U}`);
assert.equal(withSource('https://kalmea.app/x', ''), 'https://kalmea.app/x');

// ── the visit remembers its first source ─────────────────────────────────────
{
  const mem = new Map<string, string>();
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
  rememberSource('t1', '?src=instagram', store);
  rememberSource('t1', '?src=whatsapp', store);
  assert.deepEqual(recalledSource('t1', '', store), { src: 'instagram', ref: '' }, 'first touch wins for the visit');
  assert.deepEqual(recalledSource('t1', '?src=qr', store), { src: 'qr', ref: '' }, 'the booking page\'s own link wins over memory');
  assert.deepEqual(recalledSource('t2', '', store), { src: '', ref: '' }, 'per business');
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  rememberSource('t1', '?src=x', broken);
  assert.deepEqual(recalledSource('t1', '', broken), { src: '', ref: '' }, 'blocked storage never breaks a booking');
}

// ── the referral message ─────────────────────────────────────────────────────
{
  const m = referralMessageHe({ clientName: 'דנה כהן', businessName: 'Lily Nails', link: 'https://k/x?ref=1' });
  assert.ok(m.startsWith('היי דנה 🌸'));
  assert.ok(m.includes('https://k/x?ref=1'));
  assert.ok(m.includes('ב' + 'Lily Nails'));
}

// ── the report ───────────────────────────────────────────────────────────────
{
  const appts = [
    { id: 'a1', date: '2026-10-05', source: 'instagram' },
    { id: 'a2', date: '2026-10-06', source: 'instagram' },
    { id: 'a3', date: '2026-10-07', source: 'referral' },
    { id: 'a4', date: '2026-10-08', source: null },
    { id: 'a5', date: '2026-10-09', source: 'instagram', confirmation_status: 'cancelled' },
    { id: 'a6', date: '2026-09-30', source: 'whatsapp' },
  ];
  const receipts = [{ appointment_id: 'a1', amount: 200 }, { appointment_id: 'a2', amount: 150 }, { appointment_id: 'a2', amount: 50, voided: true }, { appointment_id: 'a3', amount: 300 }];
  const rows = bookingsBySource(appts, receipts, '2026-10-01', '2026-10-31');
  assert.deepEqual(rows.map((r) => [r.label, r.bookings, r.revenue]), [['אינסטגרם', 2, 350], ['חברה מביאה חברה', 1, 300], ['לא סומן מקור', 1, 0]]);
  const counts = referralCounts([{ id: 'c2', referred_by: U }, { id: 'c3', referred_by: U }, { id: U, referred_by: U }, { id: 'c4', referred_by: 'junk' }]);
  assert.equal(counts.get(U), 2, 'a client never refers herself; junk is ignored');
}

// ── the booking route: tagged after the booking, never in its way ────────────
{
  const r = src('app/api/book-appointment/route.js');
  const tagAt = r.indexOf('const bookingSrc = cleanSource(rawSrc);');
  const insertAt = r.indexOf('.from("appointments")\n      .insert({') >= 0 ? r.indexOf('.from("appointments")\n      .insert({') : r.indexOf('.from("appointments")\r\n      .insert({');
  assert.ok(insertAt > 0 && tagAt > insertAt, 'the tag is written only after the appointment exists');
  assert.ok(r.includes('after(async () => {') && r.includes('source tagging threw'), 'best-effort, after the response');
  assert.ok(r.includes('.eq("tenant_id", activeTenantId).eq("id", bookingRef)'), 'the referrer must be a client of the same business');
  assert.ok(r.includes('String(rc.phone || "") !== phoneCheck.e164'), 'a client cannot refer herself');
  assert.ok(r.includes('if (createdClient && clientId)'), 'only a NEW client card is attributed');
}

// ── her links are tagged where they go out ───────────────────────────────────
assert.ok(src('lib/reminders/smartReminders.js').includes("withSource(`${APP_URL}/book?t=${client.tenant_id}`, 'whatsapp')"));
assert.ok(src('app/api/clients/comeback/route.js').includes("withSource(`${APP_URL}/book?t=${tenantId}`, 'whatsapp')"));
assert.ok(src('lib/ai/loadBusinessProfile.ts').includes("'post')"));
const app = src('app/beautyos.jsx');
assert.ok(app.includes('copyPublicLink = async (kind, channel = "link")'));
assert.ok(app.includes('data-testid="tagged-links"'));
assert.ok(app.includes('<ClientReferral ') && app.includes('<BookingSourceReport '));
assert.ok(src('app/BookingPage.jsx').includes('recalledSource(tenantId'));
assert.ok(src('app/PublicLandingPage.tsx').includes('rememberSource(tenantId'));

// ── migration ────────────────────────────────────────────────────────────────
{
  const sql = src('supabase/migrations/add_booking_source.sql');
  for (const t of ['appointments', 'clients']) for (const c of ['source', 'referred_by']) assert.ok(sql.includes(`alter table public.${t} add column if not exists ${c} text`), `${t}.${c}`);
  assert.ok(sql.includes("source ~ '^[a-z0-9_-]{1,30}$'"));
  assert.ok(!/grant |create policy/i.test(sql), 'no new grant, no new policy');
}
console.log('booking source: ok');
