// The owner's subscribers screen (2026-10-20): stages, sorting with new uncontacted signups first, search, the contact links,
// the note route's gate, and the line that nothing is ever sent to a business from here.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  segmentOf, sortSubscribers, filterSubscribers, matchesSearch, segmentCounts, needsFirstContact, latestOf, agoHe, israelDate,
  isContactStatus, CONTACT_STATUSES, NEW_SIGNUP_DAYS,
} from './lib/subscribers.ts';
import type { SubscriberRow } from './lib/subscribers.ts';
import { buildSubscriberLinks, subscriberMessageHe } from './lib/ownerContact.ts';
import { signupAlertMessage, SUBSCRIBERS_PATH } from './lib/ownerSignupAlert.ts';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

const NOW = new Date('2026-10-20T09:00:00Z');
const day = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const row = (id: string, o: Partial<SubscriberRow> = {}): SubscriberRow => ({
  id, businessName: `עסק ${id}`, ownerName: null, phone: null, email: null, createdAt: day(20), segment: 'trial', trialDaysLeft: 10,
  planPrice: null, source: null, lastActivityAt: null, lastSignInAt: null, setupScore: null, setupTotal: null, appointmentCount: null,
  whatsappSet: null, bookingLinkSet: null, bookingUrl: null, links: { whatsapp: null, call: null, email: null },
  contact: { status: 'not_contacted', note: '', followUpOn: null, contactedAt: null, updatedAt: null }, ...o,
});

ok('stages: payment problem > left > paying > new (first 7 days) > trial', () => {
  const base = { created_at: day(2), plan_status: 'trial', trial_ends_at: day(-20) };
  assert.equal(segmentOf(base, NOW), 'new');
  assert.equal(segmentOf({ ...base, created_at: day(NEW_SIGNUP_DAYS + 1) }, NOW), 'trial');
  assert.equal(segmentOf({ ...base, plan_status: 'active' }, NOW), 'paying');
  assert.equal(segmentOf({ ...base, plan_status: 'active', billing_status: 'past_due' }, NOW), 'past_due');
  assert.equal(segmentOf({ ...base, plan_status: 'active', billing_status: 'canceled' }, NOW), 'churned');
  assert.equal(segmentOf({ ...base, plan_status: 'paused' }, NOW), 'churned');
  // an elapsed trial is expired: she left (or has to be asked), even if stored as 'trial'
  assert.equal(segmentOf({ ...base, created_at: day(40), trial_ends_at: day(5) }, NOW), 'churned');
});

ok('new signups she has not spoken to come first, newest first; then follow-ups due today; then the rest newest first', () => {
  const rows = [
    row('old', { createdAt: day(30) }),
    row('new-talked', { createdAt: day(1), contact: { status: 'contacted', note: '', followUpOn: null, contactedAt: day(0), updatedAt: day(0) } }),
    row('new-1', { createdAt: day(3) }),
    row('new-2', { createdAt: day(1) }),
    row('due', { createdAt: day(60), contact: { status: 'follow_up', note: '', followUpOn: israelDate(NOW), contactedAt: day(9), updatedAt: day(9) } }),
    row('later', { createdAt: day(50), contact: { status: 'follow_up', note: '', followUpOn: '2026-12-01', contactedAt: day(9), updatedAt: day(9) } }),
  ];
  assert.deepEqual(sortSubscribers(rows, NOW).map((r) => r.id), ['new-2', 'new-1', 'due', 'new-talked', 'old', 'later']);
  assert.equal(needsFirstContact(rows[2], NOW), true);
  assert.equal(needsFirstContact(rows[0], NOW), false, 'an old uncontacted one is not "new"');
});

ok('search: business name, her name, email, phone digits in any shape', () => {
  const r = row('a', { businessName: 'סטודיו נועה', ownerName: 'נועה כהן', email: 'Noa@Example.com', phone: '054-123-4567' });
  for (const q of ['נועה', 'כהן', 'noa@example', '0541234567', '054 123', '+972 54 123 4567', '']) assert.equal(matchesSearch(r, q), true, q);
  for (const q of ['דנה', '999', '05']) assert.equal(matchesSearch(r, q), false, q);
});

ok('filters and counts', () => {
  const rows = [row('a', { segment: 'new' }), row('b', { segment: 'paying', contact: { status: 'contacted', note: '', followUpOn: null, contactedAt: null, updatedAt: null } }), row('c', { segment: 'churned' })];
  assert.deepEqual(filterSubscribers(rows, 'all', '').map((r) => r.id), ['a', 'b', 'c']);
  assert.deepEqual(filterSubscribers(rows, 'not_contacted', '').map((r) => r.id), ['a', 'c']);
  assert.deepEqual(filterSubscribers(rows, 'paying', '').map((r) => r.id), ['b']);
  assert.deepEqual(filterSubscribers(rows, 'all', 'עסק c').map((r) => r.id), ['c']);
  const c = segmentCounts(rows);
  assert.equal(c.all, 3); assert.equal(c.not_contacted, 2); assert.equal(c.new, 1); assert.equal(c.past_due, 0);
});

ok('activity: the latest of sign-in and in-app activity; Hebrew "ago"', () => {
  assert.equal(latestOf(day(5), null, 'junk', day(2)), day(2));
  assert.equal(latestOf(null, undefined), null);
  assert.equal(agoHe(day(0), NOW), 'היום');
  assert.equal(agoHe(day(1), NOW), 'אתמול');
  assert.equal(agoHe(day(2), NOW), 'לפני יומיים');
  assert.equal(agoHe(day(9), NOW), 'לפני 9 ימים');
  assert.equal(agoHe(null, NOW), null);
});

ok('contact links: WhatsApp only for a valid Israeli mobile, a call for any number, mail for a valid email; message fits her stage', () => {
  const l = buildSubscriberLinks({ segment: 'new', businessName: 'סטודיו נועה', phone: '054-123-4567', email: 'noa@example.com' });
  assert.match(l.whatsapp!, /^https:\/\/wa\.me\/972541234567\?text=/);
  assert.ok(decodeURIComponent(l.whatsapp!.split('text=')[1]).includes('סטודיו נועה'));
  assert.equal(l.call, 'tel:+972541234567');
  assert.match(l.email!, /^mailto:noa@example\.com\?subject=/);
  const landline = buildSubscriberLinks({ segment: 'trial', businessName: 'x', phone: '03-1234567', email: 'bad' });
  assert.equal(landline.whatsapp, null);
  assert.equal(landline.call, 'tel:+97231234567');
  assert.equal(landline.email, null);
  assert.deepEqual(buildSubscriberLinks({ segment: 'trial', businessName: 'x' }), { whatsapp: null, call: null, email: null });
  const msgs = (['new', 'trial', 'paying', 'past_due', 'churned'] as const).map((s) => subscriberMessageHe(s, 'סטודיו'));
  assert.equal(new Set(msgs).size, 5);
  for (const m of msgs) { assert.match(m, /קלמיה/); assert.doesNotMatch(m, /—/); }
});

ok('contact statuses match the SQL check constraint', () => {
  const sql = rd('supabase/migrations/add_admin_tenant_contacts.sql');
  for (const s of CONTACT_STATUSES) assert.match(sql, new RegExp(`'${s}'`));
  assert.equal(isContactStatus('contacted'), true);
  assert.equal(isContactStatus('deleted'), false);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.admin_tenant_contacts from anon, authenticated/);
});

ok('the signup alert now says where to reach her, and still carries no email or phone', () => {
  const m = signupAlertMessage({ businessName: 'נועה maya@gmail.com 052-123-4567', source: 'x', at: NOW });
  assert.ok(m.includes(SUBSCRIBERS_PATH));
  assert.doesNotMatch(m, /@/);
  assert.doesNotMatch(m, /\d{3}[-\s]\d{3}/);
});

ok('the page and the note route are gated first; non-admins get a plain 404', () => {
  const loader = strip(rd('app/dashboard/admin/subscribers/loader.ts'));
  const body = loader.slice(loader.indexOf('export async function loadSubscribers'));
  assert.ok(body.indexOf('requirePlatformAdmin()') < body.indexOf('createAdminClient()'));
  assert.match(body, /if \(!admin\.ok\) notFound\(\)/);
  const page = strip(rd('app/dashboard/admin/subscribers/page.tsx'));
  assert.match(page, /await loadSubscribers\(\)/);
  assert.doesNotMatch(page, /createAdminClient|\.from\(|\.rpc\(/);
  assert.match(page, /export const dynamic = 'force-dynamic'/);
  assert.doesNotMatch(page, /export const (metadata|generateMetadata)/);
  const route = strip(rd('app/api/admin/tenant-contact/route.ts'));
  assert.ok(route.indexOf('requirePlatformAdmin()') < route.indexOf('createAdminClient()'));
  assert.match(route, /if \(!admin\.ok\) return notFound\(\)/);
});

ok('the loader never reads a cosmetician\'s clients; the route writes only the notes table and never deletes', () => {
  // Since 2026-10-20 the reads live in lib/subscribersData.ts (shared with the morning digest); the loader only gates and sorts.
  const loader = strip(rd('app/dashboard/admin/subscribers/loader.ts')) + '\n' + strip(rd('lib/subscribersData.ts'));
  const from = [...loader.matchAll(/\.from\('([^']+)'\)/g)].map((m) => m[1]).sort();
  assert.deepEqual([...new Set(from)], ['admin_tenant_contacts', 'billing_subscriptions', 'platform_admins', 'product_feedback', 'settings', 'tenants', 'wa_cloud_messages']);
  assert.doesNotMatch(loader, /select\('\*'\)|\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  for (const line of loader.split('\n').filter((l) => /console\./.test(l))) assert.doesNotMatch(line, /phone|email|\$\{/, line);
  const route = strip(rd('app/api/admin/tenant-contact/route.ts'));
  const writes = [...route.matchAll(/\.from\('([^']+)'\)\s*\.(upsert|insert|update|delete)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(writes)], ['admin_tenant_contacts']);
  assert.doesNotMatch(route, /\.delete\(/);
});

ok('nothing is sent from here: the client only links out and posts the note; no contact module reaches the browser', () => {
  const c = strip(rd('app/dashboard/admin/subscribers/SubscribersClient.tsx'));
  assert.match(c, /^'use client'/);
  assert.doesNotMatch(c, /ownerContact|ownerSignupAlert|signups\/contacts|loader|adminGuard|supabase|sendWhatsApp|window\.open/);
  const fetches = [...c.matchAll(/fetch\('([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(fetches, ['/api/admin/tenant-contact']);
  for (const f of walk('app').filter((x) => /\.(tsx|jsx)$/.test(x) && /['"]use client['"]/.test(rd(x)))) {
    assert.doesNotMatch(rd(f), /subscribers\/loader/, f);
  }
});

ok('the admin page and the owner hub link to the screen', () => {
  assert.match(rd('app/dashboard/admin/AdminClient.tsx'), /href="\/dashboard\/admin\/subscribers"/);
  assert.match(rd('app/dashboard/owner/page.tsx'), /'\/dashboard\/admin\/subscribers'/);
});

console.log(`${n} passed`);
