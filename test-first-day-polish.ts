// First-day polish (2026-10-21): the "send the link" setup step ticks when she sends it, and phone-sized tap targets.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

ok('the "שליחת הקישור" step ticks when she copies her booking link, not when she adds a client by hand', () => {
  const a = rd('app/beautyos.jsx');
  assert.match(a, /\{ key:"link",     done: linkShared\|\|!!settings\?\.automations\?\.link_shared_at\|\|appointments\.length>0,/);
  assert.doesNotMatch(a, /key:"link",\s+done: appointments\.length>0\|\|clients\.length>0/);
  assert.match(a, /if \(kind === "book"\) \{\s+setLinkShared\(true\); try \{ localStorage\.setItem\(`kl_link_shared_\$\{t\}`, "1"\);/);
  assert.match(a, /persistTourPatch\(\{ link_shared_at: new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(a, /localStorage\.getItem\(`kl_link_shared_\$\{t\}`\) === "1"/);
});

ok('setup checklist rows and their action button are at least 44px tall; onboarding swatches are 40px', () => {
  const a = rd('app/beautyos.jsx');
  assert.match(a, /padding:"8px 11px",minHeight:44,background:"none"/);
  assert.match(a, /padding:"6px 16px",minHeight:44,/);
  assert.match(rd('app/onboarding/page.tsx'), /width: 40, height: 40, borderRadius: "50%"/);
});

ok('the client card already offers "asked to be removed from marketing" with a confirmation', () => {
  assert.match(rd('app/beautyos.jsx'), /title:"הסרה מדיוור",message:`לרשום שהלקוחה ביקשה הסרה מדיוור\?/);
});

console.log(`${n} passed`);
