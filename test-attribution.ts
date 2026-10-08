// "Which ad worked?" has an answer.
//
// 2026-10-06: the landing CTA was a plain /signup, no cookie or storage kept the campaign, and
// tenants.signup_source (which the admin panel has a column for) was empty for all 38 tenants. These run
// the real functions: what a landing carries, what is kept, what the server will store.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readAttribution, serializeAttribution, parseAttribution, signupSourceLabel, ATTR_COOKIE } from './lib/attribution.js';

const own = 'kalmea.app';

// ── what a landing carries ─────────────────────────────────────────────────────────────────
assert.deepEqual(readAttribution({ search: '?utm_source=facebook&utm_medium=cpc&utm_campaign=audit-2026-10', ownHost: own }), { utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: 'audit-2026-10' });
assert.deepEqual(readAttribution({ search: '?fbclid=IwAR123', ownHost: own }), { click: 'facebook' }, 'a Facebook click id with no UTM still says facebook');
assert.deepEqual(readAttribution({ search: '?gclid=abc', ownHost: own }), { click: 'google' });
assert.deepEqual(readAttribution({ search: '?utm_source=instagram&fbclid=x', ownHost: own }), { utm_source: 'instagram', click: 'facebook' }, 'UTM and click id are both kept');
assert.deepEqual(readAttribution({ search: '', referrer: 'https://www.instagram.com/', ownHost: own }), { ref: 'instagram.com' }, 'no campaign: the outside referrer');
assert.equal(readAttribution({ search: '', referrer: '', ownHost: own }), null, 'a plain visit carries nothing: nothing is stored');
assert.equal(readAttribution({ search: '?page=2&foo=bar', referrer: '', ownHost: own }), null, 'unrelated parameters are not a campaign');
assert.equal(readAttribution({ search: '', referrer: 'https://kalmea.app/login', ownHost: own }), null, 'our own pages are not a source');
assert.equal(readAttribution({ search: '', referrer: 'https://beautyos-theta.vercel.app/', ownHost: own }), null, 'nor are our preview hosts');
assert.equal(readAttribution({ search: '', referrer: 'not a url', ownHost: own }), null, 'junk referrer: nothing');
{ // values are bounded and stripped of anything that is not text
  const a: any = readAttribution({ search: '?utm_source=' + encodeURIComponent('<script>alert(1)</script>') + '&utm_campaign=' + 'x'.repeat(500), ownHost: own });
  assert.ok(!/[<>()]/.test(a.utm_source), 'markup is stripped'); assert.equal(a.utm_campaign.length, 60, 'and a value is bounded');
}
assert.deepEqual(readAttribution({ search: '?utm_source=%D7%A4%D7%99%D7%99%D7%A1%D7%91%D7%95%D7%A7', ownHost: own }), { utm_source: 'פייסבוק' }, 'Hebrew survives');

// ── the cookie round trip, and what the server accepts back ───────────────────────────────
{
  const attr = { utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: 'audit-2026-10' };
  assert.deepEqual(parseAttribution(serializeAttribution(attr)), attr, 'what is written is what is read (the timestamp is dropped)');
  assert.equal(parseAttribution(undefined as any), null); assert.equal(parseAttribution(''), null); assert.equal(parseAttribution('%7Bnot json'), null);
  assert.equal(parseAttribution(encodeURIComponent('[1,2]')), null, 'an array is not an attribution');
  assert.equal(parseAttribution(encodeURIComponent('"just a string"')), null);
  // a hostile cookie: unknown keys are dropped, known ones are cleaned and bounded
  const hostile = parseAttribution(encodeURIComponent(JSON.stringify({ utm_source: 'x'.repeat(999) + '<b>', is_admin: true, plan: 'premium', click: 'evil', utm_medium: 123 })));
  assert.deepEqual(Object.keys(hostile!).sort(), ['utm_source'], 'only the keys we ever write survive; a wrong type or an unknown click platform is dropped');
  assert.equal((hostile as any).utm_source.length <= 60, true);
}

// ── the label the admin panel shows ───────────────────────────────────────────────────────
assert.equal(signupSourceLabel({ utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: 'audit-2026-10' }), 'facebook / cpc / audit-2026-10');
assert.equal(signupSourceLabel({ utm_source: 'facebook' }), 'facebook');
assert.equal(signupSourceLabel({ click: 'facebook' }), 'facebook / click');
assert.equal(signupSourceLabel({ ref: 'instagram.com' }), 'instagram.com');
assert.equal(signupSourceLabel({ utm_campaign: 'orphan' }), '', 'a campaign with no source says nothing rather than something misleading');
assert.equal(signupSourceLabel(null), ''); assert.equal(signupSourceLabel({}), '');
assert.ok(signupSourceLabel({ utm_source: 's'.repeat(60), utm_medium: 'm'.repeat(60), utm_campaign: 'c'.repeat(60) }).length <= 120, 'bounded for a table cell');

// ── the wiring (behaviour above; this is only that the pieces are connected) ───────────────
const code = (f: string) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
assert.ok(fs.readFileSync('app/layout.tsx', 'utf8').includes('<AttributionCapture />'), 'every page can capture a landing');
assert.ok(code('app/onboarding/page.tsx').includes('/api/attribution') && code('app/onboarding/page.tsx').includes(`${ATTR_COOKIE}=`), 'onboarding hands the cookie to the server');
const route = code('app/api/attribution/route.ts');
assert.ok(route.includes(".is('signup_source', null)"), 'the server only fills an EMPTY signup_source: a replay cannot rewrite which ad brought her');
assert.ok(route.includes('get_user_tenant_id') && !/body\.(tenant|tenantId)/.test(route), 'and the tenant is hers, from her session');

// ── the last hops (2026-10-07): the ad survives confirming her email in ANOTHER browser, and a failed call does not throw it away ──
const signupCode = code('app/signup/page.tsx'), onboardingCode = code('app/onboarding/page.tsx');
assert.ok(signupCode.includes("'kl_attr='") && /\.\.\.\(attr \? \{ kl_attr: attr \} : \{\}\)/.test(signupCode), 'sign-up stores the cookie in her account (user_metadata.kl_attr)');
assert.ok(/slice\(0, 600\)/.test(signupCode), '...bounded');
assert.ok(onboardingCode.includes('user.user_metadata?.kl_attr'), 'onboarding falls back to what the sign-up stored when this browser has no cookie');
assert.ok(/\.then\(\(r\) => \{ if \(r\.ok\) document\.cookie = "kl_attr=; Max-Age=0/.test(onboardingCode), 'the cookie is cleared only when the server answered ok');
assert.ok(!/\.then\(\(\) => \{ document\.cookie = "kl_attr=; Max-Age=0/.test(onboardingCode), 'not on any response at all (a 401 or 500 used to clear it, and the ad was lost)');

// ── email confirmation (2026-10-08): the link returns her to onboarding, and the sign-up screen waits for it ──
assert.ok(signupCode.includes('emailRedirectTo') && signupCode.includes('/auth/callback?next=/onboarding'), 'the confirmation link comes back through the callback to onboarding');
assert.ok(/if \(data\.session\)[\s\S]*router\.push\('\/onboarding'\)/.test(signupCode), 'a session means straight in (confirmation off keeps working)');
assert.ok(!/if \(data\.user\) \{\s*router\.push/.test(signupCode), 'a user WITHOUT a session is not sent to onboarding (it bounced her to /login with no message)');
assert.ok(signupCode.includes('identities.length === 0'), 'an already-registered address is not shown a check-your-email screen');
assert.ok(signupCode.includes('בדקי את המייל') && signupCode.includes('auth.resend'), 'no session: a check-your-email screen with a resend');
assert.ok(fs.readFileSync('app/auth/callback/route.ts', 'utf8').includes("!rawNext.startsWith('//')"), 'the callback continues only to same-site paths');

console.log('attribution: ok');
