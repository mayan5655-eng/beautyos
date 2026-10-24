// Leftovers from the 2026-10-21 audits (dead controls, journey pass, trial-ends-closed, overnight report), fixed 2026-10-23.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

// ── help no longer promises a WhatsApp bot a new business cannot connect ──
const help = read('./lib/helpSections.ts');
assert.ok(!/בוט הוואטסאפ, ומפתח API/.test(help), 'automations line does not list the bot');
assert.ok(!/התשובות שהבוט נותן ללקוחות/.test(help), 'FAQ line does not promise bot answers');
assert.ok(/בחשבון חדש אין בוט שעונה ללקוחות/.test(help), 'help says plainly a new account has no bot');

// ── results: the real reason for a failed write ──
const { resultWriteErrorHe } = await import('./lib/results.js');
const { SAVE_FAILED_HE } = await import('./lib/errorCopy.js');
assert.match(resultWriteErrorHe({ code: '23514', message: 'new row for relation "treatment_results" violates check constraint "treatment_results_consent_before_publish"' }), /הסכמת הלקוחה/);
assert.match(resultWriteErrorHe({ message: 'TypeError: Failed to fetch' }), /אין חיבור/);
assert.match(resultWriteErrorHe({ code: '42501', message: 'new row violates row-level security policy' }), /אין הרשאה/);
assert.equal(resultWriteErrorHe({ code: '22001', message: 'value too long' }), SAVE_FAILED_HE);
const rm = read('./app/ResultsManager.jsx');
assert.ok(!/setMsg\(!r\.published && !consentComplete/.test(rm), 'publish failure is not blamed on consent by guess');
assert.ok((rm.match(/resultWriteErrorHe\(error\)/g) || []).length >= 3, 'save, publish and delete all show the real reason');

console.log('test-audit-leftovers: ok');

// ── a brand-new account goes to onboarding without painting the empty dashboard first (journey pass F5) ──
const app = read('./app/beautyos.jsx');
assert.ok(/leavingForOnboardingRef\.current = true; router\.replace\("\/onboarding"\)/.test(app), 'the redirect marks itself');
assert.ok(/if \(!leavingForOnboardingRef\.current\) setLoading\(false\)/.test(app), 'loading stays up while leaving for onboarding');

// ── business_tax_status: no silent 'exempt' default (journey pass F19) ──
const taxSql = read('./supabase/migrations/fix_business_tax_status_default_2026-10-23.sql');
assert.ok(/drop default/.test(taxSql) && /drop not null/.test(taxSql) && /VERIFY/.test(taxSql), 'the migration drops the default and verifies');

// ── closed account: the dashboard reopens by itself after payment; no "read-only" wording left in design screens ──
const blocked = read('./app/PlanBlockedScreen.jsx');
assert.ok(/visibilitychange/.test(blocked) && /setInterval\(run, 20000\)/.test(blocked) && /data-testid="plan-blocked-recheck"/.test(blocked), 'the blocked screen rechecks on return, on a timer and on demand');
assert.ok(/recheck=\{async\(\)=>\{[\s\S]{0,300}planState\(data\)\.isBlocked\) return false;[\s\S]{0,120}loadAll\(\)/.test(app), 'beautyos reopens through loadAll once the plan is active');
for (const f of ['AiFill', 'DesignEditor', 'DesignStudio', 'Generate', 'ReelEditor']) {
  const src = read(`./app/design/${f}.jsx`);
  assert.ok(!/קריאה בלבד/.test(src) && /WRITE_BLOCKED_TOAST_HE/.test(src), `${f}: closed-system wording`);
}

// ── weekly report: seven Israeli days, counted from Israeli midnight ──
const weekly = read('./app/api/send-weekly-report/route.js');
assert.ok(/6 \* 864e5/.test(weekly), 'the week is today and the six days before it');
assert.ok(/gte\("created_at", dayBefore\(weekStart\)\)/.test(weekly) && /filter\(inWeek\)/.test(weekly), 'leads and clients are cut by the Israeli day, not UTC midnight');

// ── a "הסר" sent to her own WhatsApp: recorded from the client card (overnight item ה) ──
const app8 = read('./app/beautyos.jsx');
assert.ok(/>הסירה את עצמה מדיוור<\/button>/.test(app8) && /saveClientMarketing\(c,optOutFields\(\),"נרשם: הסירה את עצמה מדיוור"\)/.test(app8), 'the card action reuses the opt-out record');
assert.ok(/data-testid="marketing-optout-hint"/.test(app8) && /בוואטסאפ האישי/.test(app8), 'a short hint explains why she marks it herself');
assert.ok(/הסירה את עצמה מדיוור/.test(read('./lib/helpSections.ts')), 'help uses the same label');

// ── first-day polish leftovers (overnight item י) ──
const tour = read('./app/OnboardingTour.jsx');
assert.ok((tour.match(/minHeight: 44/g) || []).length >= 2, 'the tour buttons are phone-sized');
assert.ok(/שישי עד 14:00 ושבת סגור/.test(read('./app/onboarding/page.tsx')), 'onboarding says which week the hours start with');

// ── a malformed VAPID key never takes down the routes that import ownerNotify ──
assert.ok(/try \{\s+webpush\.setVapidDetails\("mailto:support@kalmea\.app"/.test(read('./lib/ownerNotify.js')), 'setVapidDetails is guarded');

// ── phone tap targets measured on the preview (2026-10-24): client card tabs, drawer close, empty-state and referral buttons ──
assert.ok(/onClick=\{\(\)=>setClientTab\(t\.k\)\} style=\{\{background:"none",border:"none",padding:"9px 9px",minHeight:44,/.test(read('./app/beautyos.jsx')), 'client card tabs 44px');
assert.ok(!/className="drawer-close"[^>]*width:34,height:34/.test(read('./app/beautyos.jsx')), 'drawer close 44px');
assert.equal((read('./app/EmptyState.jsx').match(/minHeight: 44/g) || []).length, 3, 'empty-state buttons 44px');
assert.ok(/minHeight: 44/.test(read('./app/ClientReferral.jsx')) && /minHeight: 44/.test(read('./app/MarketingToday.jsx')), 'referral and marketing buttons 44px');
