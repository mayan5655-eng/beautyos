// The 2026-10-20 new-tenant walk (a cosmetician and a nail technician, phone width): one assertion per fix.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isPlaceholderSlug, slugCandidates, claimNameSlug } from './lib/autoSlug.ts';
import { waStatusLabel, WA_TYPE_LABELS } from './lib/waStatusLabel.js';
import { countHe } from './lib/hebrewCount.js';
import { nudgeCopy } from './lib/trialNudges.ts';
import { LEAD_STATUS_LABELS, LEGACY_LEAD_STATUS_LABELS } from './lib/leads/statuses.ts';
import { serviceSubline, dedupeSuggestions, suggestPosts } from './lib/design/suggestions.ts';
import { contrastOn, contrastRatio } from './lib/theme.ts';

const src = (p: string) => fs.readFileSync(new URL(`./${p}`, import.meta.url), 'utf8');

// ── Her first link comes from her business name, not her email ──────────────
const uid = '687a661d-7e01-43ba-9f2b-5f73d69a5d5d';
const tid = '23828c05-e551-46cc-b392-fbf4d7a8d6f6';
assert.equal(isPlaceholderSlug('danacohen1987-687a661d', [uid, tid]), true, 'the trigger uses the USER id');
assert.equal(isPlaceholderSlug('danacohen1987-687a661d', [tid]), false);
assert.equal(isPlaceholderSlug(null, [uid]), true);
assert.equal(isPlaceholderSlug('סטודיו-נוה', [uid, tid]), false, 'an address she chose is never replaced');
// Latin, so a copied link is not percent-encoded (lib/latinSlug.ts, 2026-10-24).
assert.deepEqual(slugCandidates('סטודיו נוה קוסמטיקה').slice(0, 2), ['studio-noa-cosmetics', 'studio-noa-cosmetics-2']);
assert.equal(slugCandidates('Lily Nails')[0], 'lily-nails');
assert.deepEqual(slugCandidates('!!!'), [], 'nothing usable, nothing tried');
assert.deepEqual(slugCandidates('login'), [], 'a reserved word is never tried');
for (const c of slugCandidates('א'.repeat(60))) assert.ok(c.length <= 40);
{
  const tried: string[] = [];
  const rpc = async (_fn: string, a: Record<string, unknown>) => {
    tried.push(String(a.p_slug));
    return { data: null, error: tried.length < 3 ? { code: '23505' } : null };
  };
  assert.equal(await claimNameSlug(rpc, 'Lily Nails'), 'lily-nails-3', 'taken -> next candidate');
  const stop: string[] = [];
  const rpc2 = async (_fn: string, a: Record<string, unknown>) => { stop.push(String(a.p_slug)); return { data: null, error: { code: '42501' } }; };
  assert.equal(await claimNameSlug(rpc2, 'Lily Nails'), null);
  assert.equal(stop.length, 1, 'any other refusal stops at once');
}
assert.ok(src('app/onboarding/page.tsx').includes('claimNameSlug('), 'onboarding claims it');

// ── A message waiting for her is not a failure ──────────────────────────────
assert.equal(waStatusLabel({ status: 'pending_manual' }).text, '⏳ ממתינה לשליחה ממך');
assert.equal(waStatusLabel({ status: 'failed' }).text, '✕ לא נשלחה');
assert.equal(waStatusLabel({ status: 'sent', green_api_id: 'x', delivery_status: 'read' }).text, '✓✓ נקראה');
assert.equal(waStatusLabel({ status: 'sent', green_api_id: null }).text, '✓ נפתחה לשליחה בוואטסאפ שלך');
assert.ok(WA_TYPE_LABELS.auto_rebook && WA_TYPE_LABELS.auto_review && WA_TYPE_LABELS.auto_package_expiring);
assert.ok(!src('app/beautyos.jsx').includes('if(m.status!=="sent") return {text:"✕ נכשל"'));

// ── Counting in Hebrew ──────────────────────────────────────────────────────
assert.equal(countHe(1, 'תור אחד', 'תורים'), 'תור אחד');
assert.equal(countHe(4, 'תור אחד', 'תורים'), '4 תורים');
assert.equal(countHe(0, 'לקוחה אחת', 'לקוחות', 'אין לקוחות'), 'אין לקוחות');
assert.equal(countHe(0, 'תור אחד', 'תורים'), '0 תורים');
assert.ok(!/\{withPhone\.length\} נמענים|\$\{tomorrowNotSent\.length\} תורים/.test(src('app/beautyos.jsx')));

// ── Day-one card after the first booking ────────────────────────────────────
assert.match(nudgeCopy('day1', { appointments: 0, clients: 0 }).body, /התור הראשון/);
assert.equal(nudgeCopy('day1', { appointments: 1, clients: 1 }).title, 'התור הראשון כבר ביומן 🌸');

// ── Lead statuses speak about her ───────────────────────────────────────────
assert.equal(LEAD_STATUS_LABELS.new, 'חדשה');
assert.equal(LEAD_STATUS_LABELS.no_show, 'לא הגיעה');
assert.equal(LEAD_STATUS_LABELS.closed, 'נסגרה');
assert.equal(LEGACY_LEAD_STATUS_LABELS.converted, 'הפכה ללקוחה ✓');

// ── Content suggestions ─────────────────────────────────────────────────────
assert.equal(serviceSubline({ description: 'חידוש העור בחומצות מקצועיות — מחליק טקסטורה ומבהיר כתמים' }), 'חידוש העור בחומצות מקצועיות');
assert.equal(serviceSubline({ description: '', duration: 45 }), 'טיפול של 45 דקות');
assert.equal(serviceSubline(null), '');
assert.ok(serviceSubline({ description: 'א '.repeat(40) }).length <= 40);
{
  const peel = suggestPosts({ today: new Date('2026-10-20T09:00:00Z'), services: [{ name: 'פילינג כימי', description: 'חידוש העור בחומצות — מבהיר', duration: 45 }], appointments: [], designs: [], holidayTemplates: {} }, 10)
    .find((x) => x.key.startsWith('service:'))!;
  assert.equal(peel.values.subline, 'חידוש העור בחומצות', 'never the facial template line');
  const twice = dedupeSuggestions([
    { key: 'a', reason: 'x', templateKey: 'autumn', values: {} },
    { key: 'b', reason: 'y', templateKey: 'autumn', values: {} },
    { key: 'c', reason: 'z', templateKey: 'autumn', values: { subline: 'other' } },
  ]);
  assert.deepEqual(twice.map((x) => x.key), ['a', 'c']);
}

// ── Readable primary button on the default accent ───────────────────────────
assert.ok(contrastRatio('#E9A9A1', contrastOn('#E9A9A1')) >= 4.5);
assert.ok(src('app/onboarding/page.tsx').includes('color: contrastOn(pc)'));
assert.ok(!src('app/onboarding/page.tsx').includes('צבע ראשי של המערכת'));

// ── Words ───────────────────────────────────────────────────────────────────
assert.ok(src('app/login/page.tsx').includes('label="מתחברת"'));
const booking = src('app/BookingPage.jsx');
assert.ok(!booking.includes('>התור נקבע. אישור אמור להגיע'), 'no "booked" before she booked');
assert.ok(booking.includes('label="קובעת את התור"'));
const app = src('app/beautyos.jsx');
assert.ok(!app.includes('פומבניים'));
assert.ok(!app.includes('הבקשה נשלחת יומיים אחרי כל טיפול'), 'review asks are prepared, not sent');
assert.ok(app.includes('paddingInline:17'), 'the greeting is not flush to the phone edge');
assert.ok(!src('app/PublicLandingPage.tsx').includes('ונשלח לך הודעה מוכנה'));
console.log('journey pass: ok');
