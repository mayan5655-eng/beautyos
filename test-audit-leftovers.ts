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
