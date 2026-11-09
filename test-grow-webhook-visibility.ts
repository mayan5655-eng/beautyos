// Grow webhook visibility (2026-11-09): an onboarding update Grow said it sent left no trace. Every path that ignores or
// stores a webhook now writes an ops_events line, with field names only, never values.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('app/api/grow/webhook/route.ts', 'utf8');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

ok('unreadable body is recorded before the 400', () => {
  assert.match(src, /moneyAlert\('grow:webhook-unreadable'[\s\S]{0,300}status: 400/);
});
ok('unreadable onboarding update is recorded', () => {
  assert.match(src, /moneyAlert\('grow:onboarding-ignored'/);
});
ok('every stored onboarding update is recorded with its match status', () => {
  assert.match(src, /applyOnboarding\([\s\S]{0,400}moneyAlert\('grow:onboarding-received'/);
});
ok('unknown kinds are recorded', () => {
  assert.match(src, /moneyAlert\('grow:webhook-unknown'/);
});
ok('these lines are warnings (no push) and log field names, not values', () => {
  for (const s of ['webhook-unreadable', 'onboarding-ignored', 'onboarding-received', 'webhook-unknown']) {
    const i = src.indexOf(`'grow:${s}'`);
    assert.match(src.slice(i, i + 400), /severity: 'warning'/, s);
  }
  assert.match(src, /function fieldNames\(raw: Record<string, unknown>\): string \{\n  const keys = Object\.keys\(raw\);/);
});

ok('no fixed throttle key: every ignored or stored update gets its own line', () => {
  for (const k of ['bad-body', 'onboarding-unreadable', 'unknown-kind', 'onboarding-${String(r.status)}']) {
    assert.ok(src.includes('key: `' + k + '-${Date.now()}`'), k);
  }
});

console.log(`\n${n} checks passed`);
