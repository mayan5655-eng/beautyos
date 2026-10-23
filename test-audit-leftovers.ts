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
