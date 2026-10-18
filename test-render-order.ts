// A const that is read while the dashboard RENDERS must be declared after everything it reads.
//
// 2026-10-18: `showSkinType` (audit fix) was declared about 15 lines above `const [settings, ...]` and read it. Every test passed and
// the production build passed, but every logged-in visit to "/" crashed with "Cannot access 'x' before initialization" (a temporal
// dead zone error, only raised when the component actually renders). So the order is pinned here, in the source.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('app/beautyos.jsx', 'utf8').split('\r\n').join('\n');
const at = (needle: string) => {
  const i = src.indexOf(needle);
  assert.ok(i >= 0, `not found: ${needle}`);
  return i;
};

// [name of the value read at render time, what it reads]
const renderTimeReads: Array<[string, string, string]> = [
  ['  const showSkinType = ', '  const [settings,', 'showSkinType reads settings'],
  ['  const liveRcpts = ', '  const [receiptVoids,', 'liveRcpts reads receipts and receiptVoids'],
  ['  const liveRcpts = ', '  const [receipts,', 'liveRcpts reads receipts'],
];
for (const [user, dependency, why] of renderTimeReads) {
  assert.ok(at(user) > at(dependency), `${why}: it must be declared AFTER ${dependency.trim()}`);
}

// The one-shot "svc=failed" notice uses toast in its dependency list, which is evaluated at render time.
assert.ok(at('}, [toast]);') > at('  const toast = useCallback('), 'the svc=failed effect must come after toast is declared');

console.log('render order: ok');
