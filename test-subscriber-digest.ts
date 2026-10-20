// The owner's morning digest (2026-10-20): what it lists, what it never says, and that it only ever reaches her.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDigest, digestMessageHe, digestPushHe, digestIsEmpty, NAMES_PER_LIST, TRIAL_ENDING_DAYS } from './lib/subscriberDigest.ts';
import type { DigestRow } from './lib/subscriberDigest.ts';
import { israelDate } from './lib/subscribers.ts';
import { safeBusinessName } from './lib/ownerSignupAlert.ts';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

const NOW = new Date('2026-10-21T06:00:00Z'); // 09:00 in Israel
const day = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const TODAY = israelDate(NOW);
const contact = (o: Partial<DigestRow['contact']> = {}): DigestRow['contact'] => ({ status: 'not_contacted', note: '', followUpOn: null, contactedAt: null, updatedAt: null, ...o });
const row = (id: string, o: Partial<DigestRow> = {}): DigestRow => ({ id, businessName: `עסק ${id}`, createdAt: day(30), segment: 'trial', trialDaysLeft: 20, contact: contact(), ...o });
const LINK = 'https://kalmea.app/dashboard/admin/subscribers';

ok('the four lists: new and not contacted, follow-ups due or overdue, trials ending soon, past due', () => {
  const d = buildDigest([
    row('new', { createdAt: day(1), segment: 'new' }),
    row('new-talked', { createdAt: day(1), segment: 'new', contact: contact({ status: 'contacted' }) }),
    row('due', { contact: contact({ status: 'follow_up', followUpOn: TODAY }) }),
    row('late', { contact: contact({ status: 'follow_up', followUpOn: '2026-10-18' }) }),
    row('later', { contact: contact({ status: 'follow_up', followUpOn: '2026-11-01' }) }),
    row('ending', { trialDaysLeft: 2 }),
    row('ending-irrelevant', { trialDaysLeft: 1, contact: contact({ status: 'not_relevant' }) }),
    row('far', { trialDaysLeft: TRIAL_ENDING_DAYS + 1 }),
    row('pay', { segment: 'past_due', trialDaysLeft: null }),
    row('paying', { segment: 'paying', trialDaysLeft: null }),
  ], NOW);
  assert.deepEqual(d.newUncontacted.map((x) => x.id), ['new']);
  assert.deepEqual(d.followUps.map((x) => [x.id, x.overdueDays]), [['late', 3], ['due', 0]]);
  assert.deepEqual(d.trialsEnding.map((x) => x.id), ['ending']);
  assert.deepEqual(d.pastDue.map((x) => x.id), ['pay']);
  assert.equal(d.total, 5);
});

ok('a business in two lists counts once', () => {
  const d = buildDigest([row('x', { createdAt: day(1), segment: 'new', trialDaysLeft: 1 })], NOW);
  assert.equal(d.newUncontacted.length + d.trialsEnding.length, 2);
  assert.equal(d.total, 1);
});

ok('nothing to report: no message and no push', () => {
  const d = buildDigest([row('quiet'), row('paying', { segment: 'paying', trialDaysLeft: null })], NOW);
  assert.equal(digestIsEmpty(d), true);
  assert.equal(digestMessageHe(d, LINK, safeBusinessName), null);
  assert.equal(digestPushHe(d), null);
});

ok('the message: Hebrew, names only (no phone, no email), the link, overdue days, and long lists cut', () => {
  const many = Array.from({ length: NAMES_PER_LIST + 3 }, (_, i) => row(`n${i}`, { createdAt: day(1), segment: 'new' }));
  const hostile = row('h', { createdAt: day(1), segment: 'new', businessName: 'נועה maya@gmail.com 052-123-4567' });
  const late = row('l', { contact: contact({ status: 'follow_up', followUpOn: '2026-10-19' }) });
  const m = digestMessageHe(buildDigest([hostile, ...many, late], NOW), LINK, safeBusinessName)!;
  assert.match(m, /^בוקר טוב/);
  assert.ok(m.includes(LINK));
  assert.doesNotMatch(m, /@/);
  assert.doesNotMatch(m, /\d{3}[-\s]\d{3}/);
  assert.match(m, /ועוד 4/);
  assert.match(m, /באיחור של יומיים/);
  assert.doesNotMatch(m, /—/);
  const p = digestPushHe(buildDigest([late], NOW))!;
  assert.equal(p.title, 'מעקב מנויות להיום');
  assert.match(p.body, /1 לחזור אליהן/);
});

ok('the cron route: secret first, once a day, only to the operator, never to a business; push is read-only', () => {
  const r = strip(rd('app/api/owner-digest/route.ts'));
  for (const fn of ['GET', 'POST']) assert.match(r, new RegExp(`export async function ${fn}\\(request: Request\\) \\{\\n  if \\(!isAuthorizedCron\\(request\\)\\) return cronUnauthorized\\(\\)`));
  assert.match(r, /\.eq\('source', DIGEST_SOURCE\)\.gte\('created_at', since\)/);
  assert.match(r, /to: String\(process\.env\.NEXT_PUBLIC_SUPPORT_WHATSAPP \|\| ''\)\.trim\(\)/);
  assert.match(r, /platformOwnerTenantIds\(db\)/);
  assert.doesNotMatch(r, /business_phone|\.phone\b|links\.|wa\.me|notifyOwner|owner_notifications/);
  assert.equal((r.match(/sendWhatsApp/g) || []).length, 2, 'imported once, handed to raiseOpsAlert once');
  const push = strip(rd('lib/operatorPush.js'));
  assert.doesNotMatch(push, /\.delete\(|\.insert\(|\.update\(|\.upsert\(/);
  assert.match(push, /\.from\('push_subscriptions'\)\.select\(/);
  const cron = JSON.parse(rd('vercel.json')).crons as Array<{ path: string; schedule: string }>;
  assert.ok(cron.some((c) => c.path === '/api/owner-digest' && c.schedule === '0 6 * * *'));
});

ok('a push opens only a same-site path', () => {
  const sw = rd('public/sw.js');
  assert.match(sw, /data\.url\.startsWith\("\/"\) && !data\.url\.startsWith\("\/\/"\)/);
  assert.match(sw, /openWindow\(url\)/);
});

ok('the screen shows the same summary, without any data or contact module in the browser', () => {
  const c = strip(rd('app/dashboard/admin/subscribers/SubscribersClient.tsx'));
  assert.match(c, /buildDigest\(rows, now\)/);
  const lib = strip(rd('lib/subscriberDigest.ts'));
  assert.doesNotMatch(lib, /ownerContact|ownerSignupAlert|subscribersData|supabase|adminGuard/);
});

console.log(`${n} passed`);
