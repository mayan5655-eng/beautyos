// A login handle is not a name.
//
// 2026-10-06, brand-new tenant: onboarding pre-filled "השם שלך" from the email's local part and saved it
// when she skipped the field. Her clients then read "נעים מאוד, אני audit-1791237913556" on her booking
// page; she was greeted by it in her own app; the bot and the booking messages could say it too. These
// run the real functions with a handle and with a real name.
import assert from 'node:assert/strict';
import { looksLikeLoginHandle, displayName } from './lib/personName.js';
import { usableTherapistName } from './lib/ai/profileHygiene.ts';
import { resolveBranding } from './lib/branding.js';
import { buildSystemPrompt } from './lib/botPrompt.ts';

// ── the rule ───────────────────────────────────────────────────────────────────
for (const handle of ['maya.cohen', 'mayan5655', 'audit-1791237913556', 'maayan_b', 'info@maya.co.il', 'maya', 'dana123', '', '   ', undefined, null]) {
  assert.equal(displayName(handle as any), '', `${JSON.stringify(handle)} is not a name`);
}
for (const real of ['מאיה כהן', 'דנה', 'Maya Cohen', 'Maya', 'מאיה (קוסמטיקאית)', "ג'ני"]) {
  assert.equal(displayName(real), real, `${real} is a name`);
}
assert.equal(displayName('  מאיה  '), 'מאיה', 'trimmed');
assert.equal(looksLikeLoginHandle('mayan5655'), true);
assert.equal(usableTherapistName('maya.cohen'), undefined, 'the AI profile and everything else share ONE rule');
assert.equal(usableTherapistName('מאיה'), 'מאיה');

// ── her public page reads the name through resolveBranding ──────────────────────
assert.equal(resolveBranding({ therapist_name: 'audit-1791237913556', business_name: 'סטודיו' }).therapistName, '', 'a handle never reaches the booking page ("אני audit-…")');
assert.equal(resolveBranding({ therapist_name: 'מאיה כהן', business_name: 'סטודיו' }).therapistName, 'מאיה כהן', 'a real name does');
assert.equal(resolveBranding({ business_name: 'סטודיו' }).therapistName, '', 'no name: empty, not "undefined"');

// ── the bot never introduces her by her username ────────────────────────────────
const prompt = (therapist_name: string) => buildSystemPrompt({ settings: { business_name: 'סטודיו', therapist_name }, services: [], tenantId: 't', appUrl: 'https://x.example' });
assert.ok(!prompt('maya.cohen').includes('maya.cohen'), 'the bot prompt does not contain her handle');
assert.ok(prompt('מאיה כהן').includes('מאיה כהן'), 'and does contain a real name');

console.log('person name: ok');
