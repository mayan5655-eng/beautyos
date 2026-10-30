// /pay/<not-a-token> does not call the server; the maskable icon is its own padded file (2026-10-23 pass, J1 + J2).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const pay = fs.readFileSync(new URL('./app/pay/[token]/PayClient.jsx', import.meta.url), 'utf8');
const m = /if \(!\/(\^\[0-9a-f\]\{48\}\$)\/i\.test\(String\(token \|\| ''\)\)\) \{ setInfo\(\{ state: 'unknown' \}\); setPhase\('ready'\); return; \}/.exec(pay);
assert.ok(m, 'invalid tokens stop before the fetch');
const re = new RegExp(m![1], 'i');
assert.ok(re.test(crypto.randomBytes(24).toString('hex')), 'a real token (randomBytes(24) hex) still loads');
assert.ok(!re.test('abc') && !re.test(''), 'garbage does not');
assert.ok(pay.indexOf("state: 'unknown'") < pay.indexOf('fetch(`/api/grow/wallet?t='), 'checked before the request');
for (const f of fs.readdirSync(new URL('./app/api/grow/', import.meta.url), { recursive: true }) as string[]) {
  if (!/\.(ts|js)$/.test(f)) continue;
  const s = fs.readFileSync(new URL('./app/api/grow/' + f.split(String.fromCharCode(92)).join('/'), import.meta.url), 'utf8');
  for (const t of s.match(/newToken: \(\) => [^,}]+/g) || []) assert.equal(t.trim(), "newToken: () => randomBytes(24).toString('hex')", `${f}: token shape the pay page expects`);
}
const icon = (p: string) => crypto.createHash('md5').update(fs.readFileSync(new URL(p, import.meta.url))).digest('hex');
assert.notEqual(icon('./public/icons/maskable-512.png'), icon('./public/icons/icon-512.png'), 'maskable is not a copy of the plain icon');
console.log('test-pay-token-maskable: ok');
