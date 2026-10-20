// The weekly content plan (2026-10-21, spec stage 1): slots in Israel time, the AI answer parsed strictly, the reminder
// text, and the lines it must not cross (her session only, behind a flag, nothing published, nothing sent to clients).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  cleanPreferences, upcomingSlots, israelHourToUtc, israelDay, israelDow, weekStartOf, parsePack, slotLabelHe, pickSuggestions,
  buildPackPrompt, DEFAULT_PREFERENCES, PACK_CALL_SITE,
} from './lib/content/pack.ts';
import { contentReminderHe } from './lib/content/remind.ts';
import { isMissingContentTable } from './lib/content/db.ts';
import { contentPlanVisible } from './lib/featureFlags.ts';
import { MONTHLY_CALL_CAPS } from './lib/ai/callCaps.ts';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

ok('Israel hours: summer (UTC+3) and winter (UTC+2)', () => {
  assert.equal(israelHourToUtc('2026-10-22', 19).toISOString(), '2026-10-22T16:00:00.000Z');
  assert.equal(israelHourToUtc('2026-12-10', 19).toISOString(), '2026-12-10T17:00:00.000Z');
  assert.equal(israelDay(new Date('2026-10-21T22:30:00Z')), '2026-10-22'); // already the 22nd in Israel
});

ok('slots: posting days from tomorrow, at her hour, at most items_per_week; never today', () => {
  const now = new Date('2026-10-21T08:00:00Z'); // Wednesday 11:00 in Israel
  const s = upcomingSlots(DEFAULT_PREFERENCES, now); // Sun, Tue, Thu at 19:00
  assert.deepEqual(s.map((d) => [israelDay(d), israelDow(d)]), [['2026-10-22', 4], ['2026-10-25', 0], ['2026-10-27', 2]]);
  assert.ok(s.every((d) => d.getTime() > now.getTime()));
  assert.equal(upcomingSlots({ ...DEFAULT_PREFERENCES, items_per_week: 1 }, now).length, 1);
  assert.equal(weekStartOf(s[0]), '2026-10-18');
});

ok('preferences: cleaned and bounded, defaults when empty', () => {
  assert.deepEqual(cleanPreferences(null), DEFAULT_PREFERENCES);
  const p = cleanPreferences({ posting_days: [9, 3, 3, 1], post_hour: 99, items_per_week: 0, platforms: ['tiktok', 'facebook'], reminders: false });
  assert.deepEqual(p, { posting_days: [1, 3], post_hour: 19, items_per_week: 3, platforms: ['facebook'], reminders: false });
});

ok('AI answer: every key must come back with both captions; hashtags well formed; unknown keys dropped', () => {
  const good = JSON.stringify({ items: [
    { key: 'tip', topic: 'טיפ לעור בסתיו', instagram: { caption: 'שורה ראשונה\n\nעוד', hashtags: ['#עור', 'skincare', 'bad tag', '#'] }, facebook: { caption: 'טקסט לפייסבוק' } },
    { key: 'other', topic: 'x', instagram: { caption: 'y' }, facebook: { caption: 'z' } },
  ] });
  const r = parsePack(good, ['tip']);
  assert.deepEqual(Object.keys(r), ['tip']);
  assert.deepEqual(r.tip.instagram.hashtags, ['#עור', '#skincare', '#badtag']);
  assert.equal(r.tip.instagram.caption, 'שורה ראשונה\n\nעוד');
  assert.throws(() => parsePack(good, ['tip', 'missing']));
  assert.throws(() => parsePack(JSON.stringify({ items: [{ key: 'tip', topic: 't', instagram: { caption: '' }, facebook: { caption: 'x' } }] }), ['tip']));
});

ok('the prompt names every post and the claims rule; one call site, capped', () => {
  const p = buildPackPrompt({ business_name: 'סטודיו', fields: ['cosmetics'] } as never, [{ key: 'tip', reason: 'הטיפ של השבוע', day: 'יום חמישי 22.10, 19:00' }]);
  assert.match(p, /key "tip"/);
  assert.match(p, /אינסטגרם/);
  assert.match(p, /פייסבוק/);
  assert.equal(PACK_CALL_SITE, 'content/pack');
  assert.ok(MONTHLY_CALL_CAPS['content/pack'] > 0);
  assert.equal(pickSuggestions([{ key: 'a' }, { key: 'b' }, { key: 'c' }] as never, 2).length, 2);
});

ok('labels and the morning reminder in Hebrew', () => {
  assert.equal(slotLabelHe(new Date('2026-10-22T16:00:00Z')), 'יום חמישי 22.10, 19:00');
  const one = contentReminderHe([{ topic: 'טיפ לעור', plannedFor: new Date('2026-10-22T16:00:00Z') }]);
  assert.equal(one.title, 'היום מפרסמים פוסט');
  assert.match(one.body, /^19:00 · טיפ לעור/);
  const many = contentReminderHe([1, 2, 3, 4].map((i) => ({ topic: `פוסט ${i}`, plannedFor: new Date(Date.UTC(2026, 9, 22, 6 + i)) })));
  assert.equal(many.title, 'היום מפרסמים 4 פוסטים');
  assert.match(many.body, /ועוד 1/);
});

ok('flag: off unless explicitly true', () => {
  assert.equal(contentPlanVisible({}), false);
  assert.equal(contentPlanVisible({ automations: { feature_flags: { content_plan: true } } } as never), true);
  assert.equal(contentPlanVisible({ automations: { feature_flags: { content_plan: 'yes' } } } as never), false);
  assert.equal(isMissingContentTable({ code: 'PGRST205', message: 'x' }), true);
  assert.equal(isMissingContentTable({ code: '23505', message: 'dup' }), false);
});

ok('routes: her session (RLS) only, flag first, writes need an active plan, nothing is published or sent to clients', () => {
  const plan = strip(rd('app/api/content/plan/route.ts'));
  const items = strip(rd('app/api/content/items/route.ts'));
  for (const r of [plan, items]) {
    assert.doesNotMatch(r, /SUPABASE_SERVICE_ROLE_KEY|createServiceRoleClient/);
    assert.match(r, /auth\.getUser\(\)/);
    assert.match(r, /requireActiveTenant\(/);
    assert.doesNotMatch(r, /graph\.facebook\.com|sendWhatsApp|media_publish|\/feed/);
  }
  assert.ok(plan.indexOf('contentPlanVisible(s.settings)') < plan.indexOf("body.action !== 'generate'"));
  assert.match(plan, /isDemoTenantId\(s\.tenantId\)/);
  // approved or posted posts of a week are never replaced; older drafts are set aside, never deleted
  assert.match(plan, /\.in\('status', \['approved', 'posted'\]\)/);
  assert.doesNotMatch(plan + items, /\.delete\(/);
});

ok('the reminder cron: cron auth, skips demo and on-hold businesses, owner only, once per post', () => {
  const r = strip(rd('app/api/content/remind/route.ts'));
  assert.match(r, /isAuthorizedCron\(request\)/);
  assert.match(r, /isDemoTenantId\(r\.tenant_id\)/);
  assert.match(r, /tenantIsBlocked\(db, tenantId\)/);
  assert.match(r, /notifyOwner\(/);
  assert.match(r, /reminder_sent_at: now\.toISOString\(\)/);
  assert.doesNotMatch(r, /sendWhatsApp|client_phone|graph\.facebook/);
  const cron = JSON.parse(rd('vercel.json')).crons as Array<{ path: string; schedule: string }>;
  assert.ok(cron.some((c) => c.path === '/api/content/remind' && c.schedule === '30 5 * * *'));
});

ok('SQL: four tables, her rows only, gated, files only', () => {
  const sql = rd('supabase/migrations/add_content_plan.sql');
  for (const t of ['content_plans', 'content_items', 'content_item_platforms', 'content_preferences']) assert.match(sql, new RegExp(`create table if not exists public\\.${t}`));
  assert.match(sql, /tenant_id = public\.get_user_tenant_id\(\)/);
  assert.match(sql, /status in \('planned', 'approved', 'posted', 'skipped'\)/);
  const gate = rd('supabase/migrations/add_content_gate.sql');
  assert.match(gate, /as restrictive for insert to authenticated with check \(public\.is_tenant_active\(\)\)/);
});

ok('the screen renders nothing when the flag is off, and says plainly that auto-publishing waits for Meta', () => {
  const c = rd('app/design/ContentPlan.jsx');
  assert.match(c, /if \(!state \|\| state\.enabled === false\) return null;/);
  assert.match(c, /אחרי האישור של Meta/);
  assert.doesNotMatch(c, /פורסם אוטומטית|graph\.facebook/);
  assert.match(rd('app/design/DesignStudio.jsx'), /<ContentPlan settings=\{settings\}/);
});

console.log(`${n} passed`);
