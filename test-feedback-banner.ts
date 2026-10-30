// The in-app feedback banner: who sees it and when, what is stored, and that it stays honest until its table exists.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  FEEDBACK_FIRST_DAY, FEEDBACK_MAX_SNOOZES, FEEDBACK_MAX_TEXT, FEEDBACK_QUESTIONS, FEEDBACK_SNOOZE_DAYS, NOT_YET,
  cleanFeedback, feedbackDue, feedbackEligible, feedbackStorageKey, feedbackSummary, isMissingTable, readFeedbackState, snoozeFeedback,
} from './lib/feedbackBanner.ts';

const rd = (p: string) => fs.readFileSync(p, 'utf8').split('\r\n').join('\n');
const start = '2026-10-01T08:00:00Z';
const onDay = (n: number) => new Date(`2026-10-${String(n).padStart(2, '0')}T09:00:00Z`);
const base = { status: 'trial', trialStartedAt: start, appointments: 1, clients: 0 };

// three full days after signup, and only if she really used it
assert.equal(FEEDBACK_FIRST_DAY, 4);
assert.equal(feedbackEligible({ ...base, now: onDay(3) }), false, 'day 3 is too early');
assert.equal(feedbackEligible({ ...base, now: onDay(4) }), true, 'day 4 is the first day');
assert.equal(feedbackEligible({ ...base, now: onDay(30) }), true, 'later is fine: she may first come back on day 12');
assert.equal(feedbackEligible({ ...base, appointments: 0, clients: 0, now: onDay(9) }), false, 'an empty account is not asked');
assert.equal(feedbackEligible({ ...base, appointments: 0, clients: 3, now: onDay(9) }), true, 'clients count as use');

// a paying business is asked too; a blocked, undated or demo one is not
assert.equal(feedbackEligible({ ...base, status: 'active', now: onDay(9) }), true);
for (const s of ['expired', 'paused', null, undefined, '']) assert.equal(feedbackEligible({ ...base, status: s as string, now: onDay(9) }), false, String(s));
assert.equal(feedbackEligible({ ...base, trialStartedAt: null, now: onDay(9) }), false);
assert.equal(feedbackEligible({ ...base, isDemo: true, now: onDay(9) }), false);

// snooze: three days, three times, then never again. A sent answer is never asked again.
const t0 = 1_000_000;
const DAY = 86_400_000;
let st = readFeedbackState(null);
assert.deepEqual(st, { until: 0, snoozes: 0, done: false });
assert.equal(feedbackDue(st, t0), true);
st = snoozeFeedback(st, t0);
assert.equal(feedbackDue(st, t0 + FEEDBACK_SNOOZE_DAYS * DAY - 1), false);
assert.equal(feedbackDue(st, t0 + FEEDBACK_SNOOZE_DAYS * DAY), true);
for (let i = 1; i < FEEDBACK_MAX_SNOOZES; i++) st = snoozeFeedback(st, t0);
assert.equal(feedbackDue(st, t0 + 900 * DAY), false, 'after the last snooze it stays away');
assert.equal(feedbackDue({ until: 0, snoozes: 0, done: true }, t0), false);
assert.deepEqual(readFeedbackState('not json'), { until: 0, snoozes: 0, done: false });
assert.deepEqual(readFeedbackState(JSON.stringify(st)), st);
assert.notEqual(feedbackStorageKey('a'), feedbackStorageKey('b'));

// five questions, warm and feminine, no em dash
assert.equal(FEEDBACK_QUESTIONS.length, 5);
assert.equal(new Set(FEEDBACK_QUESTIONS.map((q) => q.id)).size, 5);
assert.equal(FEEDBACK_QUESTIONS.filter((q) => q.videos).length, 1, 'one question is about the tutorial videos');
const banner = rd('app/FeedbackBanner.jsx');
for (const text of [...FEEDBACK_QUESTIONS.map((q) => q.label), banner]) assert.doesNotMatch(text, /[—–]/);
assert.match(FEEDBACK_QUESTIONS.map((q) => q.label).join(' '), /שתמליצי/);

// what may be stored
assert.equal(cleanFeedback({}).ok, false, 'the stars are the one required answer');
for (const rating of [0, 6, 2.5, '4', null]) assert.equal(cleanFeedback({ rating }).ok, false, String(rating));
const good = cleanFeedback({ rating: 4, answers: { ease: 5, calendar: 9, time: 'x', videos: NOT_YET, recommend: 2, tenant_id: 'other', ease2: 1 }, freeText: '  תודה  ' });
assert.deepEqual(good, { ok: true, rating: 4, answers: { ease: 5, videos: NOT_YET, recommend: 2 }, freeText: 'תודה' });
assert.deepEqual(cleanFeedback({ rating: 4, answers: { ease: NOT_YET } }), { ok: true, rating: 4, answers: {}, freeText: null }, 'not_yet belongs to the videos question only');
assert.equal((cleanFeedback({ rating: 1, freeText: '   ' }) as { freeText: unknown }).freeText, null);
assert.equal((cleanFeedback({ rating: 1, freeText: 'א'.repeat(5000) }) as { freeText: string }).freeText.length, FEEDBACK_MAX_TEXT);

// "the table is not there yet" is told apart from every other failure
assert.equal(isMissingTable('relation "public.product_feedback" does not exist'), true);
assert.equal(isMissingTable("Could not find the table 'public.product_feedback' in the schema cache"), true);
assert.equal(isMissingTable('permission denied for table product_feedback'), false);
assert.equal(isMissingTable(null), false);

// the owner's averages
const row = (rating: number, answers: Record<string, unknown>) => ({ tenant_id: 't', rating, answers, free_text: null, created_at: start });
const sum = feedbackSummary([row(5, { ease: 5, videos: NOT_YET }), row(4, { ease: 4, videos: 2 }), row(4, {})]);
assert.equal(sum.count, 3);
assert.equal(sum.avgRating, 4.3);
const q = (id: string) => sum.questions.find((x) => x.id === id);
assert.deepEqual(q('ease'), { id: 'ease', label: 'קלות שימוש', avg: 4.5, answered: 2, notYet: 0 });
assert.deepEqual(q('videos'), { id: 'videos', label: 'סרטוני הדרכה', avg: 2, answered: 1, notYet: 1 });
assert.equal(q('time')?.avg, null);
assert.deepEqual(feedbackSummary([]).avgRating, null);

// the app: mounted once, never over the tour or anything else she has open, and only on the home screen
const app = rd('app/beautyos.jsx');
const mounts = app.match(/<FeedbackBanner [^\n]*\/>/g) || [];
assert.equal(mounts.length, 1);
for (const piece of ['tourStep!==null', 'activeTab!=="dashboard"', 'showSettings', 'showModal', 'showMoreSheet']) assert.ok(mounts[0].includes(piece), piece);
assert.match(mounts[0], /isDemo=\{isDemoTenantId/);

// the banner: asks the server first, keeps her words on a failed save, thanks her only after a real save, stays in Kalmea's colours
assert.match(banner, /json\?\.available\) setPhase\("ask"\)/);
assert.match(banner, /if \(!ok\) return;[\s\S]*setPhase\("thanks"\)/);
assert.doesNotMatch(banner, /--pc-|pcGrad|primary_color/);
assert.doesNotMatch(banner, /\bwhatsapp\b/i);

// the route: identity from the session, never the body; one answer per business; a failure is a failure
const route = rd('app/api/feedback/route.ts');
assert.match(route, /rpc\('get_user_tenant_id'\)/);
assert.doesNotMatch(route, /body\??\.tenant|tenantId:\s*body/);
assert.match(route, /onConflict: 'tenant_id', ignoreDuplicates: true/);
assert.match(route, /success: false, error: STORE_ERROR/);

// the migration: one row per business, deny-all
const sql = rd('supabase/migrations/add_product_feedback_2026-10-30.sql');
assert.match(sql, /tenant_id\s+uuid not null unique references public\.tenants\(id\) on delete cascade/);
assert.match(sql, /enable row level security/);
assert.doesNotMatch(sql.replace(/^--.*$/gm, ''), /create policy/i);
assert.match(sql, /check \(rating between 1 and 5\)/);
assert.match(sql, new RegExp(`char_length\\(free_text\\) <= ${FEEDBACK_MAX_TEXT}`));

// the owner can read it, behind the same gate as every owner screen
const loader = rd('app/dashboard/owner/loader.ts');
assert.match(loader, /export async function loadFeedback\(\)[\s\S]*?await requireOwner\(\)/);
assert.match(rd('app/dashboard/owner/page.tsx'), /\/dashboard\/owner\/feedback/);
assert.match(rd('app/dashboard/owner/feedback/page.tsx'), /add_product_feedback_2026-10-30/);

// her tracking page: every business's answer on its own card, behind the same admin gate, and it says so until the SQL runs
const subsLoader = rd('app/dashboard/admin/subscribers/loader.ts');
assert.ok(subsLoader.indexOf('requirePlatformAdmin()') < subsLoader.indexOf("from('product_feedback')"));
assert.match(subsLoader, /feedbackAvailable: !fb\.error/);
const subs = rd('app/dashboard/admin/subscribers/SubscribersClient.tsx');
assert.match(subs, /answer=\{feedback\[r\.id\]\}/);
assert.match(subs, /\{answer && <FeedbackBlock answer=\{answer\} \/>\}/);
assert.match(subs, /kalmea-sql-product-feedback/);
assert.match(subs, /answer\.free_text/);

assert.match(rd('app/dashboard/owner/feedback/page.tsx'), /\.filter\(Boolean\)\.join\(' · '\) \|\| 'אין תשובות'/, '"not yet" alone is still an answer');

console.log('feedback-banner: ok');
