// test-reschedule.ts
//
// "להזיז את התור": the client moves her own appointment from her link (lib/reschedule.ts, app/api/confirm/reschedule,
// app/confirm/page.jsx + RescheduleFlow.jsx). Pure rules with node alone, and the route's guards read from its source.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  rescheduleDays, moveSlotProblem, maxMovesFrom, cleanMoveCount, movesUsedHe, ownerMoveMessage, addDays,
  MAX_MOVES_DEFAULT, MOVE_HELD_HE, RESCHEDULE_COPY,
} from './lib/reschedule.ts';
import { clientLinkRefusal, resolveBookingRules } from './lib/bookingPolicy.ts';
import { signConfirm, verifyConfirm, confirmLinks } from './lib/confirmToken.ts';
import { checkRescheduleLinkLimit, RESCHEDULE_PER_LINK } from './lib/rateLimit.ts';
import { consentReadFrom, moveWindowHours, snapshotWindowHours, moveConsentUnreadableHe } from './lib/reschedule.ts';

let passed = 0, failed = 0;
const ok = (name: string, fn: () => void) => {
  try { fn(); passed++; } catch (e) { failed++; console.error('FAIL', name, '\n ', e instanceof Error ? e.message : e); }
};
const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

// Tuesday 2026-11-10, 10:00 in Israel (08:00Z).
const NOW = new Date('2026-11-10T08:00:00Z');
const HOURS = { business_hours: { 0: { open: 9, close: 18 }, 1: { open: 9, close: 18 }, 2: { open: 9, close: 18 }, 3: { open: 9, close: 18 }, 4: { open: 9, close: 18 }, 5: { open: 9, close: 13 }, 6: null } };
const RULES = { minLeadMinutes: 120, maxDaysAhead: 21 };
const base = { hours: HOURS, rules: RULES, duration: 60, buffer: 0, lunch: null, busyByDate: {}, now: NOW };

ok('slots: today starts after her notice, Saturday is closed, Friday ends early, 14 open days', () => {
  const days = rescheduleDays(base);
  assert.equal(days.length, 14);
  assert.equal(days[0].date, '2026-11-10');
  assert.equal(days[0].slots[0], 12 * 60, 'two hours of notice from 10:00');
  assert.equal(days[0].slots.at(-1), 17 * 60, 'a 60 minute treatment ends by 18:00');
  assert.ok(!days.some((d) => d.date === '2026-11-14'), 'Saturday is closed');
  const fri = days.find((d) => d.date === '2026-11-13')!;
  assert.equal(fri.slots.at(-1), 12 * 60, 'Friday closes at 13:00');
});

ok('slots: busy time (buffers already in), her break and the treatment buffer are respected', () => {
  const days = rescheduleDays({ ...base, buffer: 15, lunch: { startMinute: 13 * 60, minutes: 30 }, busyByDate: { '2026-11-11': [[10 * 60, 11 * 60 + 10]] } });
  const wed = days.find((d) => d.date === '2026-11-11')!.slots;
  assert.ok(!wed.includes(9 * 60 + 30), '09:30+60+15 runs into 10:00');
  assert.ok(!wed.includes(10 * 60 + 30) && !wed.includes(11 * 60), 'inside the busy range');
  assert.ok(wed.includes(11 * 60 + 30), 'after it');
  assert.ok(!wed.includes(12 * 60), '12:00+60+15 runs into her break');
  assert.ok(!wed.includes(13 * 60), 'the break itself');
  assert.ok(wed.includes(13 * 60 + 30));
});

ok('slots: the appointment does not block itself, and its own time is not offered', () => {
  const days = rescheduleDays({ ...base, skip: { date: '2026-11-11', start: 10 * 60 } });
  const wed = days.find((d) => d.date === '2026-11-11')!.slots;
  assert.ok(!wed.includes(10 * 60), 'moving to where it is changes nothing');
  assert.ok(wed.includes(10 * 60 + 30), 'half an hour later inside its own old time is free');
});

ok('slots: her "how far ahead" caps the list', () => {
  const days = rescheduleDays({ ...base, rules: { minLeadMinutes: 120, maxDaysAhead: 3 } });
  assert.ok(days.every((d) => d.date <= addDays('2026-11-10', 3)));
});

ok('moveSlotProblem: the same refusals the booking route makes', () => {
  const p = (date: string, start: number, extra = {}) => moveSlotProblem({ ...base, ...extra, date, start });
  assert.equal(p('2026-11-11', 10 * 60), null);
  assert.equal(p('2026-11-10', 11 * 60), 'too_soon');
  assert.equal(p('2026-11-10', 8 * 60), 'too_soon', 'already past');
  assert.equal(p('2026-12-20', 10 * 60), 'too_far');
  assert.equal(p('2026-11-14', 10 * 60), 'closed');
  assert.equal(p('2026-11-11', 17 * 60 + 30), 'hours');
  assert.equal(p('2026-11-11', 8 * 60), 'hours');
  assert.equal(p('2026-11-11', 10 * 60, { busyByDate: { '2026-11-11': [[10 * 60 + 30, 11 * 60]] } }), 'taken');
  assert.equal(p('2026-02-30', 10 * 60), 'bad');
  assert.equal(p('2026-11-11', 10 * 60 + 3), 'bad');
  assert.equal(p('2026-11-11', Number.NaN), 'bad');
});

ok('move limit: default 2, her own number 0..5, counts are clean', () => {
  assert.equal(MAX_MOVES_DEFAULT, 2);
  assert.equal(maxMovesFrom(null), 2);
  assert.equal(maxMovesFrom({ booking_rules: { max_reschedules: 0 } }), 0);
  assert.equal(maxMovesFrom({ booking_rules: { max_reschedules: 9 } }), 5);
  assert.equal(maxMovesFrom({ booking_rules: { max_reschedules: 'x' } }), 2);
  assert.equal(cleanMoveCount(null), 0);
  assert.equal(cleanMoveCount(-3), 0);
  assert.equal(cleanMoveCount(2), 2);
  assert.match(movesUsedHe(2, 'סטודיו רונה'), /כבר הזזת פעמיים/);
  assert.match(movesUsedHe(2, 'סטודיו רונה'), /ליצור קשר ישירות עם סטודיו רונה/);
});

ok('policy window: moving inside it is refused with the cancel wording plus "contact the business"', () => {
  const rules = resolveBookingRules({ booking_rules: { cancel_window_hours: 24 } });
  const input = { action: 'reschedule', status: 'confirmed', date: '2026-11-10', startMinute: 20 * 60, cancelWindowHours: rules.cancelWindowHours, businessName: 'רונה' };
  const r = clientLinkRefusal(input, NOW);
  assert.equal(r?.code, 'window');
  assert.equal(r?.tooLate, true);
  assert.match(r!.error, /עד 24 שעות לפני התור, כמו בביטול/);
  assert.match(r!.error, /ליצור קשר ישירות עם רונה/);
  assert.equal(clientLinkRefusal({ ...input, underPolicy: true }, NOW)?.code, 'window', 'a fee policy does not lift it for a move');
  assert.equal(clientLinkRefusal({ ...input, date: '2026-11-13' }, NOW), null, 'outside the window it moves');
  assert.equal(clientLinkRefusal({ ...input, cancelWindowHours: 0 }, NOW), null, 'no window');
  assert.equal(clientLinkRefusal({ ...input, status: 'completed' }, NOW)?.code, 'changed');
  // The cancel rule is unchanged.
  assert.match(clientLinkRefusal({ ...input, action: 'cancel' }, NOW)!.error, /^אפשר לבטל דרך הקישור/);
});

ok('tokens: a reschedule link is its own action; a confirm token cannot move, a reschedule token cannot cancel', () => {
  const id = '11111111-2222-3333-4444-555555555555';
  const links = confirmLinks('https://x', id, { date: '2026-11-11', nowMs: NOW.getTime() });
  const t = new URL(links.rescheduleUrl).searchParams.get('t') || '';
  assert.equal(new URL(links.rescheduleUrl).searchParams.get('action'), 'reschedule');
  assert.equal(verifyConfirm(id, 'reschedule', t, NOW.getTime()), true);
  assert.equal(verifyConfirm(id, 'cancel', t, NOW.getTime()), false);
  assert.equal(verifyConfirm(id, 'confirm', t, NOW.getTime()), false);
  assert.equal(verifyConfirm(id, 'reschedule', signConfirm(id, 'confirm', NOW.getTime() + 86_400_000), NOW.getTime()), false);
});

ok('routes: /api/confirm never treats a reschedule token as a cancel; the move route accepts only reschedule or cancel tokens', () => {
  const confirm = read('./app/api/confirm/route.ts');
  assert.ok(confirm.indexOf("if (action !== 'confirm' && action !== 'cancel') return reject();") > -1);
  assert.ok(confirm.indexOf("if (action !== 'confirm' && action !== 'cancel') return reject();") < confirm.indexOf('verifyConfirm(appointmentId'));
  const r = read('./app/api/confirm/reschedule/route.ts');
  assert.ok(r.includes("if (via !== 'reschedule' && via !== 'cancel') return reject();"));
  assert.ok(r.indexOf('verifyConfirm(id, via, token)') < r.indexOf(".from('appointments')"), 'signature before the database');
  assert.ok(r.includes("checkIpLimit(request, 'reschedule')") && r.includes("checkTenantLimit(tenantId, 'reschedule')"), 'rate-limited');
  assert.ok(!/export async function GET\(\)[^}]*update/.test(r), 'no GET side effect');
});

ok('route: atomic single-row move, guarded like the booking route, deposit carried by keeping the row', () => {
  const r = read('./app/api/confirm/reschedule/route.ts');
  const move = r.slice(r.indexOf('// ── The move'));
  assert.ok(move.includes(".update(p).eq('id', id).eq('tenant_id', tenantId).eq('date', oldDate).in('confirmation_status', LIVE)"), 'one update, tenant-scoped, on the old date');
  assert.ok(move.includes("u.eq('start_minute', appt.start_minute)"), 'and the old start');
  assert.ok(move.includes("code === '23505' || code === '23P01'"), 'the database refuses a taken time');
  assert.ok(!move.includes('.insert('), 'no second row: the id (and its deposit, card and consent) stays');
  assert.ok(!move.includes('.delete('), 'nothing is deleted');
  assert.ok(move.includes("kind: 'reschedule'") && move.includes('notifyOwner('), 'the owner is told');
  assert.ok(move.includes('runWaitlistOffer({ tenantId, appt: freed, db })'), 'the freed slot goes to the waiting list (when on)');
  assert.ok(move.includes('askGapFillAfterClientCancel(db, { tenantId, appt: freed })'));
  assert.ok(r.includes('if (used >= maxMoves) return refuse(movesUsedHe('), 'the move limit');
  assert.ok(r.includes("if (consent.state === 'row' && consent.row.status === 'awaiting_deposit') return refuse(MOVE_HELD_HE);"), 'an unpaid hold is not moved');
  const peek = r.slice(r.indexOf('if (body.peek === true)'), r.indexOf('// ── The move'));
  for (const leak of ['client_id', 'tenant_id', 'appt.name', 'price', 'client_phone']) assert.ok(!peek.includes(leak), `peek does not return ${leak}`);
});

ok('page: the move button shows only when the server said the move works', () => {
  const page = read('./app/confirm/page.jsx');
  assert.ok(page.includes("{status === 'ready' && movePeek && ("), 'offer-move only with a successful peek');
  assert.ok(page.includes("Array.isArray(d.days) && d.days.length > 0"), 'and only with free times');
  const flow = read('./app/confirm/RescheduleFlow.jsx');
  assert.ok(flow.includes('data-testid="reschedule-calendar"'), 'add to calendar after the move');
  assert.ok(flow.includes("fetch('/api/confirm/reschedule'"));
});

ok('copy: Hebrew, feminine, no em dashes, no "automatic" promise', () => {
  const texts = [
    ...Object.values(RESCHEDULE_COPY), MOVE_HELD_HE, movesUsedHe(2), movesUsedHe(0),
    ownerMoveMessage({ name: 'רונית', service: 'מניקור', fromWhen: 'ביום שלישי', toWhen: 'ביום רביעי' }),
    read('./app/confirm/RescheduleFlow.jsx'), read('./app/api/confirm/reschedule/route.ts'),
  ];
  for (const t of texts) {
    assert.ok(!t.includes('—'), `no em dash: ${t.slice(0, 60)}`);
    assert.ok(!/אוטומטית/.test(t), 'nothing promises an automatic send');
  }
  assert.match(ownerMoveMessage({ name: 'רונית', service: 'מניקור', fromWhen: 'ביום שלישי', toWhen: 'ביום רביעי' }), /רונית הזיזה את התור למניקור מביום שלישי לביום רביעי\. השעה הקודמת התפנתה ביומן\./);
});

ok('owner notice: the settings row carries automations, so her opt-in WhatsApp copy goes out exactly as on a cancel', () => {
  const r = read('./app/api/confirm/reschedule/route.ts');
  const cols = /const SETTINGS_COLS = '([^']+)'/.exec(r)![1].split(',').map((c) => c.trim());
  // What notifyOwner reads from settingsRow (lib/ownerNotify.js): automations.owner_alert_whatsapp / owner_phone, then business_phone.
  const notify = read('./lib/ownerNotify.js');
  assert.ok(notify.includes('settingsRow?.automations') && notify.includes('settingsRow?.business_phone'));
  for (const c of ['automations', 'business_phone']) assert.ok(cols.includes(c), `settings select has ${c}`);
  // The cancel path reads the same two (lib/cancelNotify.js): parity.
  assert.match(read('./lib/cancelNotify.js'), /select\("business_phone, automations"\)/);
  assert.ok(r.includes(".from('settings').select(SETTINGS_COLS)"));
  assert.ok(/notifyOwner\(\{[^}]*kind: 'reschedule'[^}]*settingsRow: st,/.test(r), 'the row it read is the one notifyOwner gets');
  // And automations never reaches the client: the responses spread brand and contact only, never the settings row.
  assert.ok(!/\.\.\.(st|settings)\b/.test(r), 'no settings spread into a response');
});

ok('request shape: an object body, a UUID id, a bounded token, strict date and integer minute', () => {
  const r = read('./app/api/confirm/reschedule/route.ts');
  assert.ok(r.includes("if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return reject();"));
  assert.ok(r.includes('if (!UUID_RE.test(id) || !token || token.length > MAX_TOKEN_CHARS) return reject();'));
  assert.ok(r.indexOf('UUID_RE.test(id)') < r.indexOf('verifyConfirm(id, via, token)'), 'shape before signature');
  assert.ok(r.includes("typeof body.startMinute === 'number' && Number.isInteger(body.startMinute)"), 'no Number() coercion of the minute');
  assert.ok(r.includes("typeof body.date === 'string' ? body.date : ''"));
  // moveSlotProblem refuses what coercion would have let through.
  const p = (date: string, start: number) => moveSlotProblem({ ...base, date, start });
  assert.equal(p('2026-11-11T10:00', 600), 'bad');
  assert.equal(p('2026-13-01', 600), 'bad');
  assert.equal(p('2026-11-11', 1440), 'bad');
  assert.equal(p('2026-11-11', -30), 'bad');
  assert.equal(p('2026-11-09', 600), 'too_soon', 'a past day');
});

ok('the move patch names its columns: no service, duration, tenant or status from the request', () => {
  const r = read('./app/api/confirm/reschedule/route.ts');
  const line = r.split('\n').find((l) => l.includes('let patch: Record<string, unknown> = {'))!;
  assert.ok(line, 'the patch line');
  assert.ok(!/body|\.\.\.(?!startFields|\(hasCountColumn)/.test(line.replace('...startFields(newStart)', '').replace("...(hasCountColumn ? { reschedule_count: used + 1 } : {})", '')), 'nothing spread from the body');
  for (const k of ['service', 'duration', 'tenant_id', 'confirmation_status', 'client_id', 'price']) assert.ok(!new RegExp(`\\b${k}\\s*:`).test(line), `patch has no ${k}`);
  assert.ok(r.includes('const duration = Number(appt.duration) > 0 ? Number(appt.duration) : 60;'), 'the length is the appointment\'s own');
  assert.ok(!/body\.(service|duration|tenant|tenantId)/.test(r), 'never read from the request');
});

ok('an undated or past appointment is not moved, even with no start for clientLinkRefusal to see', () => {
  const r = read('./app/api/confirm/reschedule/route.ts');
  assert.ok(r.includes('if (oldStart == null || !/^\\d{4}-\\d{2}-\\d{2}$/.test(oldDate) || oldDate < wallClockNow().date) {'));
  assert.ok(r.indexOf('oldDate < wallClockNow().date') < r.indexOf('if (body.peek === true)'), 'before slots are shown');
});

ok('per-link limit: one appointment\'s link is capped on its own, after the signature and before the business budget', () => {
  const id = 'aaaaaaaa-bbbb-cccc-dddd-' + String(Date.now()).padStart(12, '0').slice(-12);
  for (let i = 0; i < RESCHEDULE_PER_LINK.limit; i++) assert.equal(checkRescheduleLinkLimit(id), null);
  const blocked = checkRescheduleLinkLimit(id);
  assert.ok(blocked && blocked.status === 429, 'the next call is refused');
  assert.equal(checkRescheduleLinkLimit(id.replace(/^a/, 'b')), null, 'another appointment is not affected');
  const r = read('./app/api/confirm/reschedule/route.ts');
  assert.ok(r.indexOf('verifyConfirm(id, via, token)') < r.indexOf('checkRescheduleLinkLimit(id)'));
  assert.ok(r.indexOf('checkRescheduleLinkLimit(id)') < r.indexOf("checkTenantLimit(tenantId, 'reschedule')"));
});

// ── Grow policy window (Vercel Security Review, PR #52): a move must not reset late-cancel eligibility ─────────────
// What the route does with what it read: moveWindowHours(branding, consentReadFrom(read)), then clientLinkRefusal with that window.
const moveVerdict = (brandingHours: number, read: { data: unknown; error: unknown }, date: string, startMinute: number) => {
  const w = moveWindowHours(brandingHours, consentReadFrom(read));
  if (w === null) return 'refused:unreadable';
  const r = clientLinkRefusal({ action: 'reschedule', status: 'confirmed', date, startMinute, cancelWindowHours: w, businessName: 'רונה' }, NOW);
  return r ? `refused:${r.code}` : 'allowed';
};
const GROW_24H = { data: { status: 'card_saved', snapshot: { mode: 'saved_card', window_hours: 24, late_fee_amount: 100 } }, error: null };

ok('Grow 24h policy, branding window unset, visit in 1 hour: the move is refused with the cancel wording', () => {
  // NOW is Tuesday 10:00 Israel; the visit is at 11:00 the same day.
  assert.equal(resolveBookingRules({ booking_rules: {} }).cancelWindowHours, 0, 'branding has no window');
  assert.equal(moveVerdict(0, GROW_24H, '2026-11-10', 11 * 60), 'refused:window');
  const w = moveWindowHours(0, consentReadFrom(GROW_24H))!;
  const r = clientLinkRefusal({ action: 'reschedule', status: 'confirmed', date: '2026-11-10', startMinute: 11 * 60, cancelWindowHours: w, businessName: 'רונה' }, NOW)!;
  assert.match(r.error, /עד 24 שעות לפני התור, כמו בביטול/);
  assert.match(r.error, /ליצור קשר ישירות עם רונה/);
  // A shorter branding window does not shrink the agreed one; a longer one still counts.
  assert.equal(moveWindowHours(12, consentReadFrom(GROW_24H)), 24);
  assert.equal(moveWindowHours(48, consentReadFrom(GROW_24H)), 48);
  // A deposit policy the same way.
  assert.equal(moveVerdict(0, { data: { status: 'deposit_paid', snapshot: { mode: 'deposit', window_hours: 24 } }, error: null }, '2026-11-10', 11 * 60), 'refused:window');
});

ok('Grow 24h policy, visit in 48 hours: the move is allowed', () => {
  assert.equal(moveVerdict(0, GROW_24H, '2026-11-12', 10 * 60), 'allowed');
  assert.equal(moveVerdict(0, { data: null, error: null }, '2026-11-10', 11 * 60), 'allowed', 'no policy, no window: as before');
  assert.equal(moveVerdict(0, { data: null, error: { code: '42P01', message: 'relation "appointment_policy_consents" does not exist' } }, '2026-11-10', 11 * 60), 'allowed', 'Grow migration not run: no consent can exist');
});

ok('the consent cannot be read: the move is refused (fail closed)', () => {
  assert.equal(moveVerdict(0, { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }, '2026-11-12', 10 * 60), 'refused:unreadable');
  assert.equal(moveVerdict(0, { data: null, error: { code: 'PGRST116', message: 'multiple rows returned' } }, '2026-11-12', 10 * 60), 'refused:unreadable');
  assert.equal(moveVerdict(0, { data: null, error: { message: 'column "snapshot" does not exist' } }, '2026-11-12', 10 * 60), 'refused:unreadable', 'a missing COLUMN is not a missing table');
  assert.equal(snapshotWindowHours({ snapshot: { window_hours: 'abc' } }), null);
  assert.equal(moveVerdict(0, { data: { snapshot: { window_hours: 'abc' } }, error: null }, '2026-11-12', 10 * 60), 'refused:unreadable', 'a garbage window is not 0');
  assert.match(moveConsentUnreadableHe('רונה'), /ליצור קשר ישירות עם רונה/);
  assert.ok(!moveConsentUnreadableHe('רונה').includes('—'));
});

ok('route: the consent is read for every move, judged by the larger window, and never written', () => {
  const r = read('./app/api/confirm/reschedule/route.ts');
  const read1 = ".from('appointment_policy_consents').select('status, snapshot').eq('appointment_id', id).eq('tenant_id', tenantId).maybeSingle()";
  assert.equal(r.split(".from('appointment_policy_consents')").length - 1, 1, 'one read');
  assert.ok(r.includes(read1), 'tenant-scoped');
  assert.ok(!/if \(appt\.confirmation_status === 'pending'\) \{\s*const \{ data: hold \}/.test(r), 'not only for pending holds');
  assert.ok(r.includes('const windowHours = moveWindowHours(rules.cancelWindowHours, consent);'));
  assert.ok(r.includes('if (windowHours === null) return refuse(moveConsentUnreadableHe(brand.businessName), { tooLate: true });'));
  assert.ok(r.includes('cancelWindowHours: windowHours,'));
  assert.ok(!r.includes('cancelWindowHours: rules.cancelWindowHours'), 'branding alone never decides');
  assert.ok(r.indexOf('moveWindowHours(') < r.indexOf('if (body.peek === true)'), 'before times are even shown');
  // A move writes the appointments row only: the consent, its snapshot, card and fee rows are untouched.
  const updates = r.match(/\.from\('([a-z_]+)'\)\.(update|insert|upsert|delete)\(/g) || [];
  assert.deepEqual(updates, [".from('appointments').update("]);
  assert.ok(!/policy_consents'\)\.(update|upsert|delete|insert)/.test(r));
  assert.ok(!/cancellation_fees|grow_payments|card_consents/.test(r), 'no fee or payment table');
});

console.log(`test-reschedule: passed ${passed} failed ${failed}`);
if (failed) process.exit(1);
