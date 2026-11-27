// Round-2 audit (2026-11-16), the medium findings: pinned so they cannot quietly come back.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { trFor } from './lib/i18n/publicTr.ts';

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };
const raw = (f: string) => (fs.readFileSync(f, { encoding: 'utf8', raw: true } as never) as unknown as string).replace(/\r\n/g, '\n');

ok('/book: today\'s hours are an LTR island (it read "19:00–09:00")', () => {
  assert.ok(raw('app/BookingPage.jsx').includes('<bdi dir="ltr" data-testid="today-hours">'));
});

ok('/login: a heading, named inputs, an announced error, readable error red', () => {
  const l = raw('app/login/page.tsx');
  // 2026-11-27: the heading is a real one (display face, ink, no letter-spacing) and the inputs carry visible labels,
  // which name them better than the aria-label over a placeholder that this used to pin.
  assert.ok(/<h1 style=\{\{ margin: 0, color: 'var\(--brand-deep/.test(l) && !/letterSpacing: '2\.5px'/.test(l));
  assert.ok(l.includes('<label htmlFor="login-email"') && l.includes('id="login-email"'));
  assert.ok(l.includes('<label htmlFor="login-password"') && l.includes('id="login-password"'));
  assert.ok(l.includes("type={showPassword ? 'text' : 'password'}") && l.includes('aria-pressed={showPassword}'));
  assert.ok(l.includes("{error && <div role=\"alert\" style={noticeStyle('error')}>{error}</div>}"));
  assert.ok(l.includes("'#9D4A42'") && !l.includes("'#B25B52'"));
});

ok('claim page: her language, a calendar date, no dead end, a retry', () => {
  const p = raw('app/claim/[token]/page.tsx');
  assert.ok(p.includes('const tr = trFor(lang);') && p.includes('dateLabel(details.slotDate, lang)'));
  assert.ok(!p.includes('toLocaleDateString'), 'never the browser time zone');
  assert.ok(p.includes('data-testid="claim-retry"'));
  assert.ok(!p.includes('פני אלינו בוואטסאפ'), 'no WhatsApp promise without a number');
  assert.ok(raw('app/api/claim/route.ts').includes('language: langOfSettings(settings)'));
  // Every string the page asks for has an English and an Arabic line.
  const keys = [...p.matchAll(/tr\("([^"]+)"/g)].map((m) => m[1]);
  for (const lang of ['en', 'ar'] as const) {
    const t = trFor(lang);
    for (const k of keys) assert.notEqual(t(k, ['x']), k.replace('{0}', 'x'), `${lang}: ${k}`);
  }
});

ok('gift page (offline): the picked voucher goes into the WhatsApp message', () => {
  const g = raw('app/[slug]/gift/GiftPurchase.tsx');
  assert.ok(g.includes('data-testid="gift-offline-wa"') && g.includes('היי, אשמח לקנות שובר מתנה: ${chosen.kind'));
});

ok('before/after photos: an unguessable name, and files removed when replaced, cancelled or deleted', () => {
  const r = raw('app/ResultsManager.jsx');
  assert.ok(r.includes('const path = `${tenantId}/results/${side}_${crypto.randomUUID()}.jpg`;'));
  assert.ok(!r.includes('${side}_${Date.now()}'));
  assert.ok(r.includes('return tenantId && p.startsWith(`${tenantId}/results/`) ? p : "";'), 'only her own results files are ever removed');
  assert.ok(r.includes('if (!error) dropFiles([r.before_url, r.after_url]);'), 'deleting a result removes its photos');
  assert.ok((r.match(/dropFiles\(\[\.\.\.unsaved\.current\]\)/g) || []).length >= 3, 'cancel and opening another draft drop unsaved uploads');
});

console.log(`round 2 medium: ${n} ok`);
