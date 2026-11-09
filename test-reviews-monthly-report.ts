// test-reviews-monthly-report.ts
//
// 1. Review requests in two steps (lib/reviewRequests.ts + lib/reminders/smartReminders.js): who is asked and when (same day,
//    days after, once per N months, never opted out, never a cancelled or no-show visit), the message, the page's honesty
//    (the Google link on BOTH paths, so never review gating), and the owner's counts.
// 2. The full monthly report (lib/monthlyFull.ts): Israel-time months, income against last month (whole, or the same days
//    for a month in progress), visits, new vs returning, top three, average per visit, lapsed clients, vouchers and products,
//    the note on the 1st and when it may go out.
// NO DATABASE, NO NETWORK, NO WHATSAPP: the engine runs against an in-memory fake and a recording sender.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  reviewTimingOf, reviewDatesFor, reviewDue, monthsBetween, askedTooRecently, optedOut, reviewRequestLines, cleanFeedback, isMood,
  googleReviewUrlOf, looksLikeGoogleLink, isMissingFeedbackTable, feedbackSummaryLine, feedbackNotice, reviewTwoStepOn,
  israelDateBack, GOOGLE_LINK_HELP, FEEDBACK_NEEDS_MIGRATION_HE,
} from './lib/reviewRequests.ts';
import { runSmartReminders as runEngine } from './lib/reminders/smartReminders.js';
// The engine's JSDoc names only a few options; the test passes the rest (now, reviewLinkFor) the route passes.
type EngineStats = { skipped: Record<string, number> };
const runSmartReminders = runEngine as unknown as (o: Record<string, unknown>) => Promise<{ stats: EngineStats }>;
import {
  buildMonthFull, monthlyNotice, monthlyCronDue, availableMonths, monthAllowed, parseMonthKey, defaultReportMonth, monthKey,
  monthlyNoticeOn, monthlyPageOn, compareMonths, LAPSED_SHOWN,
} from './lib/monthlyFull.ts';

const rd = (p: string) => readFileSync(new URL(`./${p}`, import.meta.url), 'utf8');
let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const DASH = /[–—‒―]|\s-\s/;

// ── 1. review requests: the rules ───────────────────────────────────────────────────────────────────────────────────────

await ok('timing: default 2 days and every 4 months; 0 means the same day; bad values are the defaults', () => {
  assert.deepEqual(reviewTimingOf(null), { delayDays: 2, everyMonths: 4 });
  assert.deepEqual(reviewTimingOf({ timing: { review_delay_days: 0 } }), { delayDays: 0, everyMonths: 4 });
  assert.deepEqual(reviewTimingOf({ timing: { review_delay_days: 7, review_every_months: 6 } }), { delayDays: 7, everyMonths: 6 });
  assert.deepEqual(reviewTimingOf({ timing: { review_delay_days: 99, review_every_months: 0 } }), { delayDays: 2, everyMonths: 4 });
  assert.deepEqual(reviewTimingOf({ timing: { review_delay_days: '', review_every_months: 'x' } }), { delayDays: 2, everyMonths: 4 });
  assert.deepEqual(reviewTimingOf({ timing: { review_delay_days: 1.5 } }).delayDays, 2);
});

// Monday 9 Nov 2026, 17:30 in Israel (winter, UTC+2).
const EVE = new Date('2026-11-09T15:30:00Z');
await ok('the same day: today (ended two hours ago) and yesterday; otherwise exactly N days ago', () => {
  assert.equal(israelDateBack(EVE, 0), '2026-11-09');
  assert.deepEqual(reviewDatesFor(0, EVE), ['2026-11-09', '2026-11-08']);
  assert.deepEqual(reviewDatesFor(2, EVE), ['2026-11-07']);
  const a = (date: string, start: number, dur = 60, extra = {}) => ({ date, start_minute: start, duration: dur, confirmation_status: 'confirmed', ...extra });
  assert.equal(reviewDue(a('2026-11-09', 14 * 60, 30), 0, EVE), true, 'ended 14:30, three hours ago');
  assert.equal(reviewDue(a('2026-11-09', 15 * 60, 60), 0, EVE), false, 'ended 16:00, only 1.5 hours ago');
  assert.equal(reviewDue(a('2026-11-08', 20 * 60), 0, EVE), true, 'yesterday evening, caught up today');
  assert.equal(reviewDue({ date: '2026-11-09', confirmation_status: 'confirmed' }, 0, EVE), false, 'no readable time: tomorrow');
  assert.equal(reviewDue(a('2026-11-07', 600), 2, EVE), true);
  assert.equal(reviewDue(a('2026-11-08', 600), 2, EVE), false);
  for (const s of ['cancelled', 'no_show']) assert.equal(reviewDue(a('2026-11-07', 600, 60, { confirmation_status: s }), 2, EVE), false, s);
  assert.equal(reviewDue(a('2026-11-07', 600, 60, { kind: 'personal' }), 2, EVE), false, 'a personal block is not a visit');
});

await ok('once per client every N months, counted between the visits', () => {
  assert.equal(monthsBetween('2026-07-09', '2026-11-09'), 4);
  assert.equal(monthsBetween('2026-07-10', '2026-11-09'), 3);
  assert.equal(monthsBetween('2026-01-31', '2026-02-28'), 0);
  assert.equal(askedTooRecently(null, '2026-11-09', 4), false);
  assert.equal(askedTooRecently('2026-08-01', '2026-11-09', 4), true);
  assert.equal(askedTooRecently('2026-07-01', '2026-11-09', 4), false);
  assert.equal(askedTooRecently('2026-10-01', '2026-11-09', 1), false);
  assert.equal(optedOut({ marketing_opted_out_at: '2026-10-01' }), true);
  assert.equal(optedOut({ marketing_consent: false } as never), false, 'no consent is not an opt out: a review request is not an offer');
});

await ok('the message: one link, a question answered in one tap; flag off is the old wording', () => {
  const on = reviewRequestLines({ businessName: 'סטודיו רונית', link: 'https://x/review?id=1&t=2', twoStep: true }).join('\n');
  assert.ok(on.includes('איך היה? אפשר לענות בלחיצה אחת:') && on.includes('https://x/review?id=1&t=2') && on.includes('סטודיו רונית'), on);
  assert.ok(!DASH.test(on), on);
  const off = reviewRequestLines({ businessName: 'ס', link: 'L', twoStep: false }).join('\n');
  assert.ok(off.includes('דירוג קצר עוזר מאוד'), off);
  const noLink = reviewRequestLines({ businessName: 'ס', link: '', twoStep: true });
  assert.ok(noLink.join('').includes('דירוג קצר') && noLink.includes(null), 'no link: the plain ask, as before');
  assert.equal(reviewTwoStepOn(null), true);
  assert.equal(reviewTwoStepOn({ automations: { feature_flags: { review_two_step: false } } }), false);
  assert.equal(reviewTwoStepOn({ automations: { feature_flags: { review_two_step: 'no' } } }), true, 'only an explicit false');
});

await ok('the private note, the Google link and the honest counts', () => {
  assert.equal(cleanFeedback('  היה   קר\r\n\r\nוהמתנתי\u0007'), 'היה קר\nוהמתנתי');
  assert.equal(cleanFeedback('x'.repeat(3000)).length, 1000);
  assert.equal(isMood('happy'), true); assert.equal(isMood('meh'), false);
  assert.equal(googleReviewUrlOf(' https://g.page/r/abc/review '), 'https://g.page/r/abc/review');
  assert.equal(googleReviewUrlOf('http://g.page/r/abc'), '');
  assert.equal(googleReviewUrlOf('javascript:alert(1)'), '');
  assert.equal(looksLikeGoogleLink('https://g.page/r/abc/review'), true);
  assert.equal(looksLikeGoogleLink('https://maps.app.goo.gl/xyz'), true);
  assert.equal(looksLikeGoogleLink('https://instagram.com/me'), false);
  assert.equal(isMissingFeedbackTable({ code: '42P01' }), true);
  assert.equal(isMissingFeedbackTable({ code: 'PGRST205', message: "Could not find the table 'public.visit_feedback'" }), true);
  assert.equal(isMissingFeedbackTable({ code: '23505' }), false);
  assert.equal(feedbackSummaryLine({ requested: 0, happy: 0, unhappy: 0, googleClicks: 0, inAppReviews: 0 }), null);
  const line = feedbackSummaryLine({ requested: 5, happy: 3, unhappy: 1, googleClicks: 3, inAppReviews: 1 })!;
  assert.equal(line, '5 בקשות ביקורת, 3 עברו לגוגל, ביקורת אחת אצלך בעמוד, הערה פרטית אחת');
  assert.ok(!/השאירו ביקורת בגוגל/.test(line), 'a tap is never claimed as a written Google review');
  const nt = feedbackNotice({ clientName: 'דנה כהן', body: 'y'.repeat(300) });
  assert.ok(nt.title.startsWith('דנה כהן') && nt.body.length <= 140, String(nt.body.length));
  assert.ok(feedbackNotice({ clientName: '', body: '' }).body.includes('בלי לכתוב'));
  for (const s of [...GOOGLE_LINK_HELP, FEEDBACK_NEEDS_MIGRATION_HE, line, nt.title]) assert.ok(!DASH.test(s), s);
});

// ── 1b. the engine, end to end, with a fake database ─────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
function makeDb(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows = tables[table] ? [...tables[table]] : [];
      const chain: Record<string, unknown> = {
        select() { return chain; },
        order() { return chain; },
        eq(col: string, val: unknown) { rows = rows.filter((r) => r[col] === val); return chain; },
        in(col: string, vals: unknown[]) { rows = rows.filter((r) => vals.includes(r[col])); return chain; },
        range(from: number, to: number) { return Promise.resolve({ data: rows.slice(from, to + 1), error: null, count: rows.length }); },
        insert(row: Row) { (tables[table] = tables[table] || []).push(row); return Promise.resolve({ error: null }); },
        then(res: (v: unknown) => unknown) { return Promise.resolve({ data: rows, error: null }).then(res); },
      };
      return chain;
    },
  };
}

await ok('engine: asks the right visits, at her timing, once per season, never opted out, never a no show', async () => {
  const now = new Date('2026-11-09T15:30:00Z'); // 17:30 Israel, a Monday
  const st = (tid: string, timing: Row | null, flags: Row | null = null) => ({ tenant_id: tid, business_name: `עסק ${tid}`, automations: { ...(timing ? { timing } : {}), ...(flags ? { feature_flags: flags } : {}) } });
  const cl = (id: string, tid: string, extra: Row = {}) => ({ id, name: `לקוחה ${id}`, phone: '972541234567', tenant_id: tid, birthday: null, marketing_consent: true, ...extra });
  const ap = (id: string, cid: string, tid: string, date: string, extra: Row = {}) => ({ id, client_id: cid, tenant_id: tid, date, confirmation_status: 'confirmed', service: 'טיפול פנים', start_minute: 600, duration: 60, ...extra });
  const w: Record<string, Row[]> = {
    settings: [st('t2', null), st('t0', { review_delay_days: 0 }), st('toff', null, { review_two_step: false })],
    clients: [
      cl('a', 't2'), cl('b', 't2', { marketing_opted_out_at: '2026-10-01' }), cl('c', 't2'), cl('d', 't2'), cl('e', 't2'),
      cl('s1', 't0'), cl('s2', 't0'), cl('o1', 'toff'),
    ],
    appointments: [
      ap('a1', 'a', 't2', '2026-11-07'),                                   // asked
      ap('b1', 'b', 't2', '2026-11-07'),                                   // opted out
      ap('c1', 'c', 't2', '2026-11-07', { confirmation_status: 'no_show' }), // no show
      ap('d1', 'd', 't2', '2026-11-07'), ap('d0', 'd', 't2', '2026-09-20'), // asked about d0 seven weeks ago: too soon
      ap('e1', 'e', 't2', '2026-11-07'), ap('e0', 'e', 't2', '2026-06-01'), // asked five months ago: fine
      ap('s1a', 's1', 't0', '2026-11-09', { start_minute: 13 * 60 }),         // same day, ended 14:00
      ap('s2a', 's2', 't0', '2026-11-09', { start_minute: 16 * 60 }),         // ends 17:00: not yet
      ap('o1a', 'o1', 'toff', '2026-11-07'),
    ],
    packages: [],
    auto_reminders_log: [
      { tenant_id: 't2', client_id: 'd', reminder_type: 'review', reference_id: 'd0' },
      { tenant_id: 't2', client_id: 'e', reminder_type: 'review', reference_id: 'e0' },
    ],
  };
  const sent: { phone: string; message: string; tenantId: string; type: string; name: string }[] = [];
  const send = async (phone: string, message: string, opts: { tenantId: string; type: string; name: string }) => { sent.push({ phone, message, ...opts }); return { queued: true }; };
  const { stats } = await runSmartReminders({ db: makeDb(w), send, now, reviewLinkFor: (id: string) => `https://kalmea.test/review?id=${id}&t=sig` });
  const reviews = sent.filter((s) => s.type === 'auto_review');
  assert.deepEqual(reviews.map((s) => s.name).sort(), ['לקוחה a', 'לקוחה e', 'לקוחה o1', 'לקוחה s1']);
  assert.equal(stats.skipped.optedOut, 1);
  assert.equal(stats.skipped.reviewAskedRecently, 1);
  const msgA = reviews.find((s) => s.name === 'לקוחה a')!.message;
  assert.ok(msgA.includes('אפשר לענות בלחיצה אחת') && msgA.includes('review?id=a1'), msgA);
  const msgOff = reviews.find((s) => s.name === 'לקוחה o1')!.message;
  assert.ok(msgOff.includes('דירוג קצר עוזר מאוד'), 'platform flag off: the old message');
  // logged, so a second run asks nobody again
  const before = sent.length;
  await runSmartReminders({ db: makeDb(w), send, now, reviewLinkFor: (id: string) => `https://kalmea.test/review?id=${id}&t=sig` });
  assert.equal(sent.filter((s) => s.type === 'auto_review').length, reviews.length, `second run: ${sent.length - before} new`);
});

await ok('engine: two visits in the window ask once, about the newest', async () => {
  const now = new Date('2026-11-09T15:30:00Z');
  const w: Record<string, Row[]> = {
    settings: [{ tenant_id: 't0', business_name: 'ע', automations: { timing: { review_delay_days: 0 } } }],
    clients: [{ id: 'x', name: 'x', phone: '972541234567', tenant_id: 't0', marketing_consent: true }],
    appointments: [
      { id: 'x1', client_id: 'x', tenant_id: 't0', date: '2026-11-08', confirmation_status: 'confirmed', start_minute: 600, duration: 60 },
      { id: 'x2', client_id: 'x', tenant_id: 't0', date: '2026-11-09', confirmation_status: 'confirmed', start_minute: 600, duration: 60 },
    ],
    packages: [], auto_reminders_log: [],
  };
  const sent: string[] = [];
  await runSmartReminders({ db: makeDb(w), send: async (_p: string, m: string, o: { type: string }) => { if (o.type === 'auto_review') sent.push(m); return { ok: true }; }, now, reviewLinkFor: (id: string) => `L-${id}` });
  assert.equal(sent.length, 1); assert.ok(sent[0].includes('L-x2'));
});

// ── 1c. the page, the routes, the owner screen: static checks ───────────────────────────────────────────────────────────

await ok('the page offers Google on BOTH answers (never review gating) and degrades to the stars form', () => {
  const page = rd('app/review/page.jsx');
  for (const s of ['review-choose', 'review-happy', 'review-unhappy', 'review-noted', 'רוצה לכתוב גם ביקורת פומבית?', '/api/reviews/go']) assert.ok(page.includes(s), s);
  const noted = page.slice(page.indexOf('if (state === "noted")'), page.indexOf('return (\n    <PublicPage primary={info?.primaryColor || null}>\n      <div className="pub-card" style={{ textAlign: "center" }}>\n        {/* Her logo'));
  assert.ok(noted.includes('goGoogleHref'), 'the Google link is offered after a private note too');
  assert.ok(page.includes('if (r === "unavailable") { setState("form"); return; }'), 'no table yet: the stars form, never a dropped note');
  const get = rd('app/api/reviews/route.js');
  assert.ok(get.includes('twoStep') && get.includes('isMissingFeedbackTable') && get.includes('googleReviewUrlOf'));
  assert.ok(!/automations:\s*s\?\.automations/.test(get), 'automations is never returned to the browser');
});

await ok('routes: signed link, no WhatsApp to anyone, owner notified in the app only, tenant from the session', () => {
  const fb = rd('app/api/reviews/feedback/route.js');
  assert.ok(fb.includes('resolveReviewVisit') && fb.includes('checkIpLimit') && fb.includes('whatsapp: false') && !fb.includes('sendWhatsApp'));
  assert.ok(fb.includes('needsMigration: true') && fb.includes('"no_show"'));
  const go = rd('app/api/reviews/go/route.js');
  assert.ok(go.includes('googleReviewUrlOf') && go.includes('Response.redirect(url, 302)') && go.includes('resolveReviewVisit'));
  const sum = rd('app/api/reviews/summary/route.js');
  assert.ok(sum.includes('get_user_tenant_id') && sum.includes('requireActiveTenant'));
  assert.equal((sum.match(/\.eq\("tenant_id", tenantId\)/g) || []).length >= 6, true, 'every read is scoped to her tenant');
  assert.ok(!sum.includes('searchParams'), 'the tenant never comes from the request');
  const visit = rd('lib/reviewVisit.js');
  assert.ok(visit.includes('verifyReview') && visit.includes('UUID_RE'));
  const mig = rd('supabase/migrations/add_visit_feedback_2026-11-09.sql');
  assert.ok(mig.includes('enable row level security') && !/create policy/i.test(mig) && mig.includes('appointment_id     uuid not null unique'));
  for (const f of ['app/api/reviews/feedback/route.js', 'app/api/reviews/go/route.js', 'app/api/reviews/summary/route.js', 'app/VisitFeedbackPanel.jsx', 'app/dashboard/feedback/FeedbackScreen.tsx', 'lib/reviewRequests.ts']) {
    const src = rd(f);
    assert.ok(!src.includes('448e9e45'), `${f}: no real tenant id`);
    assert.ok(!/[–—]/.test(src), `${f}: no dashes`);
  }
  const panel = rd('app/VisitFeedbackPanel.jsx');
  assert.ok(panel.includes('גוגל לא מספרת מי כתבה בפועל'), 'the panel says a tap is a tap');
});

await ok('settings: the help for finding the link, the same-day timing and the season cap; notifications open the screens', () => {
  const app = rd('app/beautyos.jsx');
  assert.ok(app.includes('איך מוצאים את הקישור?') && app.includes('GOOGLE_LINK_HELP'));
  assert.ok(app.includes('[0,"באותו יום, כמה שעות אחרי"]') && app.includes('review_every_months'));
  assert.ok(app.includes('<VisitFeedbackPanel variant="compact"/>'));
  assert.ok(app.includes('if(n.kind==="visit_feedback"){router.push("/dashboard/feedback");return;}'));
  assert.ok(app.includes('if(n.kind==="monthly_report"){router.push("/dashboard/monthly");return;}'));
  assert.ok(!app.includes('יומיים אחרי הביקור. את שולחת'), 'the review switch no longer promises a fixed two days');
});

// ── 2. the monthly report ────────────────────────────────────────────────────────────────────────────────────────────────

const rc = (id: number, at: string, amount: number, service = 'טיפול פנים', items?: unknown) => ({ id, created_at: at, amount, service, items: items === undefined ? '[]' : JSON.stringify(items) });
const NOW = new Date('2026-11-09T10:00:00Z'); // Monday 9 Nov, 12:00 Israel
const OCT = { year: 2026, month: 9 };

await ok('months: the picker, the default, the allowed window', () => {
  assert.deepEqual(defaultReportMonth(NOW), OCT);
  assert.deepEqual(defaultReportMonth(new Date('2026-12-31T22:30:00Z')), { year: 2026, month: 11 }, 'Jan 1 00:30 in Israel: December just ended');
  const m = availableMonths(NOW);
  assert.equal(m.length, 13); assert.equal(m[0].key, '2026-11'); assert.ok(m[0].current && m[0].label.includes('עד היום'));
  assert.equal(m[1].label, 'אוקטובר 2026'); assert.equal(m[12].key, '2025-11');
  assert.deepEqual(parseMonthKey('2026-10'), OCT); assert.equal(parseMonthKey('2026-13'), null); assert.equal(parseMonthKey('../x'), null);
  assert.equal(monthAllowed({ year: 2026, month: 11 }, NOW), false, 'not the future');
  assert.equal(monthAllowed({ year: 2025, month: 10 }, NOW), true);
  assert.equal(monthAllowed({ year: 2025, month: 9 }, NOW), false, 'not older than 12 months');
  assert.equal(monthKey(OCT), '2026-10');
});

const receipts = [
  rc(1, '2026-10-05T08:00:00', 300, 'טיפול פנים', [{ name: 'טיפול פנים', price: 300, qty: 1 }]),
  rc(2, '2026-10-12T08:00:00', 500, 'פילינג, מסכה', [{ name: 'פילינג', price: 400, qty: 1 }, { name: 'מסכה', price: 100, qty: 1 }]),
  rc(3, '2026-10-20T08:00:00', 400, 'טיפול פנים', [{ name: 'טיפול פנים', price: 300, qty: 1 }, { name: 'סרום', price: 100, qty: 1, kind: 'product', product_id: 'p1' }]),
  rc(4, '2026-10-21T08:00:00', 200, 'שובר מתנה', [{ name: 'שובר מתנה ₪200', price: 200, qty: 1, kind: 'voucher' }]),
  rc(5, '2026-10-31T21:30:00', 999, 'לק ג׳ל'), // 23:30 Oct 31 in Israel (winter, UTC+2): still October
  rc(6, '2026-10-31T22:30:00', 7777, 'לק ג׳ל'), // 00:30 Nov 1 in Israel: November
  rc(7, '2026-09-10T08:00:00', 1000, 'טיפול פנים'), // September, the month before
  rc(8, '2026-11-03T08:00:00', 250, 'פילינג'),
  rc(9, '2026-10-08T08:00:00', 100, 'טיפול פנים'),
];
const appts = [
  { id: 'v1', client_id: 'c1', date: '2026-10-05', confirmation_status: 'confirmed' },
  { id: 'v2', client_id: 'c2', date: '2026-10-12', confirmation_status: 'confirmed' },
  { id: 'v3', client_id: 'c1', date: '2026-10-20', confirmation_status: 'confirmed' },
  { id: 'v4', client_id: 'c3', date: '2026-10-25', confirmation_status: 'no_show' },
  { id: 'v5', client_id: 'c4', date: '2026-10-26', confirmation_status: 'cancelled' },
  { id: 'v6', client_id: 'c1', date: '2026-10-26', kind: 'personal' },
  { id: 'v0', client_id: 'c1', date: '2026-03-01', confirmation_status: 'confirmed' }, // c1 is returning
  { id: 'p1', client_id: 'c5', date: '2026-08-01', confirmation_status: 'confirmed' },  // lapsed 100 days
  { id: 'p2', client_id: 'c6', date: '2026-08-15', confirmation_status: 'confirmed' },  // lapsed, but booked ahead
  { id: 'f2', client_id: 'c6', date: '2026-11-20', confirmation_status: 'confirmed' },
  { id: 'p3', client_id: 'c7', date: '2024-01-01', confirmation_status: 'confirmed' },  // gone too long
  { id: 'p4', client_id: 'c8', date: '2026-09-01', confirmation_status: 'confirmed' },  // 69 days, archived
  { id: 'p5', client_id: 'c9', date: '2026-09-20', confirmation_status: 'confirmed' },  // 50 days: not yet
  { id: 's1', client_id: 'c5', date: '2026-09-02', confirmation_status: 'cancelled' },  // cancelled is not her last visit
];
const clients = [
  { id: 'c1', name: 'רונית' }, { id: 'c2', name: 'דנה' }, { id: 'c3', name: 'מיכל' }, { id: 'c4', name: 'שירה' },
  { id: 'c5', name: 'נועה', phone: '0541234567' }, { id: 'c6', name: 'טל' }, { id: 'c7', name: 'אור' },
  { id: 'c8', name: 'גלית', status: 'archived' }, { id: 'c9', name: 'יעל' },
];

await ok('a whole month: income vs the whole month before, visits, new vs returning, top three, average, lapsed', () => {
  const r = buildMonthFull({ month: OCT, now: NOW, receipts, appointments: appts, clients, status: 'exempt', vatRate: 0.18, showProducts: true, showVouchers: true, voucherLedger: [
    { kind: 'redeem', amount: -150, created_at: '2026-10-22T08:00:00' }, { kind: 'redeem', amount: -50, created_at: '2026-10-23T08:00:00' },
    { kind: 'reverse', amount: 50, created_at: '2026-10-23T09:00:00' }, { kind: 'redeem', amount: -80, created_at: '2026-11-02T08:00:00' },
  ] });
  assert.equal(r.isCurrent, false); assert.equal(r.days, 31); assert.equal(r.label, 'אוקטובר 2026');
  assert.equal(r.income.cur, 300 + 500 + 400 + 200 + 999 + 100, 'Israel midnight decides; vouchers are money in');
  assert.equal(r.income.prev, 1000); assert.equal(r.income.dir, 'up'); assert.equal(r.income.pct, 150);
  assert.equal(r.visits.cur, 3, 'no show, cancelled and personal are not visits');
  assert.equal(r.noShows, 1);
  assert.equal(r.newClients, 1, 'c2'); assert.equal(r.returningClients, 1, 'c1 came in March');
  assert.deepEqual(r.top.map((t) => t.name), ['לק ג׳ל', 'טיפול פנים', 'פילינג']);
  assert.equal(r.top[1].income, 300 + 300 + 100, 'the product line is not a treatment');
  // paid treatments: 300, 500, 400, 999, 100 (the voucher sale is not a visit)
  assert.equal(r.avgPerVisit, Math.round((300 + 500 + 400 + 999 + 100) / 5));
  assert.deepEqual(r.lapsed.clients.map((c) => c.name), ['נועה'], 'booked ahead, archived, too long and too recent are left out');
  assert.equal(r.lapsed.clients[0].days, 100); assert.equal(r.lapsed.clients[0].phone, '0541234567');
  assert.deepEqual(r.products, { income: 100, units: 1 });
  assert.deepEqual(r.vouchers, { soldCount: 1, soldAmount: 200, redeemedCount: 1, redeemedAmount: 150 });
  assert.ok(r.headline.includes('באוקטובר הכנסת ₪2,499') && r.headline.includes('150% יותר מספטמבר'), r.headline);
  assert.equal(r.inPrev, 'בספטמבר');
});

await ok('VAT, a missing ledger, features off', () => {
  const r = buildMonthFull({ month: OCT, now: NOW, receipts, appointments: appts, clients, status: 'authorized', vatRate: 0.18, showProducts: false, showVouchers: true, voucherLedger: null });
  assert.equal(r.income.cur, Math.round(2499 / 1.18)); assert.equal(r.netOfVat, true);
  assert.ok(r.headline.includes('(לפני מע"מ)'));
  assert.equal(r.products, null);
  assert.equal(r.vouchers!.redeemedCount, null, 'an unreadable ledger is not "nothing redeemed"');
  const off = buildMonthFull({ month: OCT, now: NOW, receipts, appointments: appts, clients, status: 'exempt', vatRate: 0.18 });
  assert.equal(off.vouchers, null);
});

await ok('the month in progress compares with the same days of last month', () => {
  const r = buildMonthFull({ month: { year: 2026, month: 10 }, now: NOW, receipts, appointments: appts, clients, status: 'exempt', vatRate: 0.18 });
  assert.equal(r.isCurrent, true); assert.equal(r.days, 9);
  assert.equal(r.income.cur, 7777 + 250);
  assert.equal(r.income.prev, 300 + 100, 'October 1..9 only');
  assert.equal(r.inPrev, 'באותם ימים באוקטובר');
  assert.ok(r.headline.startsWith('מתחילת נובמבר הכנסת'), r.headline);
});

await ok('an empty month says so, and sends nothing', () => {
  const r = buildMonthFull({ month: OCT, now: NOW, receipts: [], appointments: [], clients: [], status: 'exempt', vatRate: 0.18 });
  assert.equal(r.hasData, false); assert.equal(r.headline, 'באוקטובר לא נרשמו ביקורים או תשלומים.');
  assert.equal(r.avgPerVisit, null); assert.deepEqual(r.top, []);
  assert.equal(monthlyNotice(r), null);
  assert.deepEqual(compareMonths(0, 0), { cur: 0, prev: 0, pct: null, dir: 'same' });
});

await ok('the note on the 1st, and when it may go out', () => {
  const r = buildMonthFull({ month: OCT, now: NOW, receipts, appointments: appts, clients, status: 'exempt', vatRate: 0.18 });
  const nt = monthlyNotice(r)!;
  assert.equal(nt.title, 'הדוח החודשי שלך: אוקטובר');
  assert.ok(nt.body.includes('באוקטובר הכנסת ₪2,499, 3 ביקורים.') && nt.body.includes('לק ג׳ל') && nt.body.includes('לקוחה אחת לא חזרה'), nt.body);
  for (const s of [nt.title, nt.body, r.headline]) assert.ok(!DASH.test(s), s);
  // Sunday 1 Nov 2026 09:00 Israel: yes. Saturday 1 Aug 2026: held; Sunday 2 Aug: yes. The 4th: no.
  assert.deepEqual(monthlyCronDue(new Date('2026-11-01T07:00:00Z')), { run: true, reason: 'ok' });
  assert.equal(monthlyCronDue(new Date('2026-08-01T07:00:00Z')).reason, 'rest-day');
  assert.equal(monthlyCronDue(new Date('2026-08-02T07:00:00Z')).run, true);
  assert.equal(monthlyCronDue(new Date('2026-11-04T07:00:00Z')).reason, 'not-start-of-month');
  assert.equal(monthlyCronDue(new Date('2026-11-02T07:00:00Z'), (d) => d === '2026-11-02').reason, 'rest-day');
  // On by default; her switch, the platform flag and the master pause turn it off.
  assert.equal(monthlyNoticeOn({ automations: null }), true);
  assert.equal(monthlyNoticeOn({ automations: { monthly_report: false } }), false);
  assert.equal(monthlyNoticeOn({ automations: { paused: true } }), false);
  assert.equal(monthlyNoticeOn({ automations: { feature_flags: { monthly_report_page: false } } }), false);
  assert.equal(monthlyPageOn({ automations: { monthly_report: false } }), true, 'her switch silences the note, never the page');
  assert.equal(LAPSED_SHOWN, 6);
});

await ok('the cron and the screen: owner only, in the app, scheduled and watched', () => {
  const cron = rd('app/api/send-monthly-report/route.js');
  assert.ok(cron.includes('isAuthorizedCron') && cron.includes("markCronRun('send-monthly-report')") && cron.includes('whatsapp: false'));
  assert.ok(cron.includes('alreadySent') && cron.includes('monthlyCronDue(now, isYomTov)') && !cron.includes('sendWhatsApp'));
  const vercel = JSON.parse(rd('vercel.json'));
  assert.ok(vercel.crons.some((c: { path: string; schedule: string }) => c.path === '/api/send-monthly-report' && c.schedule === '0 7 1-3 * *'));
  assert.ok(rd('lib/cronHeartbeat.js').includes("'send-monthly-report': { path: '/api/send-monthly-report'"));
  const api = rd('app/api/monthly-report/route.ts');
  assert.ok(api.includes('get_user_tenant_id') && api.includes('requireActiveTenant') && api.includes('monthAllowed'));
  const screen = rd('app/dashboard/monthly/MonthlyScreen.tsx');
  assert.ok(screen.includes('/dashboard?go=winback') && screen.includes('monthly-picker') && screen.includes("repeat(2, minmax(0, 1fr))"));
  assert.ok(existsSync(new URL('./app/dashboard/monthly/page.tsx', import.meta.url)));
  assert.ok(rd('app/MonthlyReportCard.jsx').includes('לדוח החודשי המלא'));
  assert.ok(rd('app/GoalsEditor.jsx').includes('monthly_report: e.target.checked'));
  for (const f of ['lib/monthlyFull.ts', 'lib/monthlyFullLoad.ts', 'app/dashboard/monthly/MonthlyScreen.tsx', 'app/api/send-monthly-report/route.js', 'app/api/monthly-report/route.ts']) {
    const src = rd(f);
    assert.ok(!/[–—]/.test(src), `${f}: no dashes`);
    assert.ok(!src.includes('448e9e45'), `${f}: no real tenant id`);
  }
});

console.log(`\n${n} groups passed`);
