// Signup source tracking (2026-11-10): marketing is starting (Instagram reels, a podcast, Facebook groups), and the
// answer to "where do signups come from" must survive from the first click to the admin panel. test-attribution.ts
// covers the original pipeline; this covers what was added: the referrer next to a UTM, the structured columns and
// their missing-column fallback, the count by source, the marketing links doc, and the Grow "other system" line.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readAttribution, parseAttribution, serializeAttribution, signupSourceLabel, attributionColumns, sourceChannel, countBySource, UNKNOWN_SOURCE_LABEL_HE, ATTR_MAX_AGE_S } from './lib/attribution.js';
import { isMissingColumnError } from './lib/pgError.ts';

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };
const own = 'kalmea.app';
const code = (f: string) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// ── sanitizing ──────────────────────────────────────────────────────────────
ok('a UTM and the outside referrer are both kept', () => {
  assert.deepEqual(
    readAttribution({ search: '?utm_source=instagram&utm_medium=bio', referrer: 'https://l.instagram.com/?u=x', ownHost: own }),
    { utm_source: 'instagram', utm_medium: 'bio', ref: 'l.instagram.com' },
  );
});
ok('the referrer is the host only: no path, no query', () => {
  const a: any = readAttribution({ search: '', referrer: 'https://www.facebook.com/groups/123/posts/9?ref=share&secret=abc', ownHost: own });
  assert.deepEqual(a, { ref: 'facebook.com' });
});
ok('our own host and previews are never a referrer, even next to a UTM', () => {
  assert.deepEqual(readAttribution({ search: '?utm_source=podcast', referrer: 'https://kalmea.app/', ownHost: own }), { utm_source: 'podcast' });
  assert.deepEqual(readAttribution({ search: '?utm_source=podcast', referrer: 'https://x-git-y.vercel.app/', ownHost: own }), { utm_source: 'podcast' });
});
ok('hostile values: markup and quotes stripped, length capped', () => {
  const a: any = readAttribution({ search: '?utm_source=' + encodeURIComponent(`"><img src=x onerror=alert(1)>'`) + '&utm_medium=' + 'm'.repeat(300), ownHost: own });
  assert.ok(!/[<>"'=()]/.test(a.utm_source));
  assert.equal(a.utm_medium.length, 60);
  const p: any = parseAttribution(encodeURIComponent(JSON.stringify({ utm_source: 'a;drop table tenants;--', ref: 'r'.repeat(500), tenant_id: 'x' })));
  assert.ok(!/;/.test(p.utm_source) && p.ref.length === 80 && !('tenant_id' in p));
});

// ── first touch ─────────────────────────────────────────────────────────────
ok('first touch wins, for 30 days, and never breaks the page', () => {
  assert.equal(ATTR_MAX_AGE_S, 30 * 24 * 60 * 60);
  const cap = code('app/AttributionCapture.jsx');
  assert.ok(/some\(\(c\) => c\.startsWith\(`\$\{ATTR_COOKIE\}=`\)\)\) return/.test(cap), 'an existing cookie is never overwritten');
  assert.ok(/try \{[\s\S]*document\.cookie =[\s\S]*\} catch/.test(cap), 'storage is inside try/catch');
  assert.ok(fs.readFileSync('app/layout.tsx', 'utf8').includes('<AttributionCapture />'), 'captured on every page: kalmea.app root, /landing and /signup');
  assert.ok(code('app/signup/page.tsx').includes('kl_attr: attr'), 'sent with the signup request');
});
ok('the round trip keeps the referrer', () => {
  const attr = { utm_source: 'facebook_groups', utm_medium: 'post', ref: 'm.facebook.com' };
  assert.deepEqual(parseAttribution(serializeAttribution(attr)), attr);
  assert.equal(signupSourceLabel(attr), 'facebook_groups / post', 'the label is still source / medium / campaign');
});

// ── structured columns and the missing-column fallback ─────────────────────
ok('columns: every value or null, never an empty string', () => {
  assert.deepEqual(attributionColumns({ utm_source: 'instagram', utm_medium: 'reel', utm_campaign: 'reel-01', ref: 'l.instagram.com' }),
    { signup_utm_source: 'instagram', signup_utm_medium: 'reel', signup_utm_campaign: 'reel-01', signup_referrer: 'l.instagram.com' });
  assert.deepEqual(attributionColumns(null), { signup_utm_source: null, signup_utm_medium: null, signup_utm_campaign: null, signup_referrer: null });
  assert.deepEqual(attributionColumns({ click: 'facebook' }), { signup_utm_source: null, signup_utm_medium: null, signup_utm_campaign: null, signup_referrer: null });
});
ok('the route writes the columns and falls back to the label alone while the migration has not run', () => {
  const route = code('app/api/attribution/route.ts');
  assert.ok(route.includes('...attributionColumns(attr)'));
  assert.ok(/if \(error && isMissingColumnError\(error\)\) \(\{ data, error \} = await write\(\{ signup_source: label \}\)\)/.test(route));
  assert.ok(route.includes(".is('signup_source', null)"), 'both writes only fill an empty source');
  assert.ok(route.includes('get_user_tenant_id') && !/body\.(tenant|tenantId)/.test(route));
  // the fallback fires on exactly the errors PostgREST gives for these columns
  assert.ok(isMissingColumnError({ code: 'PGRST204', message: "Could not find the 'signup_utm_source' column of 'tenants' in the schema cache" }));
  assert.ok(isMissingColumnError({ code: '42703', message: 'column "signup_referrer" of relation "tenants" does not exist' }));
  assert.ok(!isMissingColumnError({ code: '42501', message: 'permission denied' }), 'any other failure is still a failure');
});
ok('the migration only adds nullable columns, is re-runnable, and is not in the code path', () => {
  const sql = fs.readFileSync('supabase/migrations/signup_attribution_columns_2026-11-10.sql', 'utf8');
  for (const c of ['signup_utm_source', 'signup_utm_medium', 'signup_utm_campaign', 'signup_referrer']) {
    assert.ok(new RegExp(`add column if not exists ${c}\\s+text;`).test(sql), c);
  }
  assert.ok(!/not null|drop column|drop table|delete from|update public/i.test(sql));
  assert.ok(sql.includes('STATUS: NOT RUN'));
});

// ── count by source ─────────────────────────────────────────────────────────
ok('count by source groups by channel, unknown last', () => {
  assert.equal(sourceChannel('Instagram / bio'), 'instagram');
  assert.equal(sourceChannel(null), UNKNOWN_SOURCE_LABEL_HE);
  assert.equal(sourceChannel('  '), UNKNOWN_SOURCE_LABEL_HE);
  assert.deepEqual(countBySource(['instagram / bio', 'instagram / reel / reel-01', null, '', null, null, 'podcast / audio', 'facebook_groups / post', 'podcast']), [
    { source: 'instagram', count: 2 }, { source: 'podcast', count: 2 }, { source: 'facebook_groups', count: 1 }, { source: UNKNOWN_SOURCE_LABEL_HE, count: 4 },
  ]);
  assert.deepEqual(countBySource([]), []);
});
ok('the admin list shows the source column and the count', () => {
  const admin = code('app/dashboard/admin/AdminClient.tsx');
  assert.ok(admin.includes('<th style={th}>מקור</th>') && admin.includes('tenant.signup_source'));
  assert.ok(admin.includes('countBySource(rows.map((r) => r.tenant.signup_source))') && admin.includes('לפי מקור:'));
});

// ── the marketing links doc ─────────────────────────────────────────────────
ok('docs/MARKETING_LINKS.md: a ready link per channel, each one parses to its source', () => {
  const doc = fs.readFileSync('docs/MARKETING_LINKS.md', 'utf8');
  const links = [...doc.matchAll(/https:\/\/kalmea\.app\/[^\s|)]*/g)].map((m) => m[0]);
  for (const src of ['instagram', 'podcast', 'facebook_groups', 'whatsapp']) assert.ok(links.some((l) => l.includes(`utm_source=${src}&`)), src);
  for (const l of links) {
    const u = new URL(l);
    const a: any = readAttribution({ search: u.search, ownHost: own });
    assert.ok(a && a.utm_source === u.searchParams.get('utm_source'), `${l} survives cleaning unchanged`);
  }
  assert.ok(!doc.includes('—'), 'no em dashes');
});

// ── Grow: an account tied to another system ────────────────────────────────
ok('the Grow connect screen says to ask Grow to disconnect the other system first', () => {
  const src = fs.readFileSync('app/GrowCard.jsx', 'utf8');
  const line = src.match(/GROW_OTHER_SYSTEM_HE = '([^']+)'/)?.[1] || '';
  assert.ok(line.includes('מערכת אחרת') && line.includes('לנתק') && line.includes('לפני החיבור') && line.includes('שירות הלקוחות של Grow'));
  assert.ok(!line.includes('—'), 'no em dash');
  assert.ok(/data-testid="grow-other-system"[^>]*>\{GROW_OTHER_SYSTEM_HE\}/.test(src), 'rendered');
  // only inside the card, which renders nothing while the Grow screens are off or not ready
  assert.ok(/if \(!s \|\| s\.hidden \|\| s\.tableReady === false\) return null;[\s\S]*grow-other-system/.test(src), 'behind the existing Grow gate');
  const notConnected = src.slice(src.lastIndexOf('} else {'), src.indexOf('return (\n    <div data-testid="grow-card"'));
  assert.ok(notConnected.includes('grow-other-system'), 'shown on the not-connected screen, where she chooses how to connect');
});

console.log(`signup-source: ${n} ok`);
