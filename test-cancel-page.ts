// The client's cancel page says which appointment before she cancels, and its copy is right.
// (2026-10-23 pass, I2.) Also: the reminder's cancel link is introduced as a cancel link.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const route = read('./app/api/confirm/route.ts');
const peek = route.slice(route.indexOf('if (body.peek === true)'), route.indexOf('// Idempotent'));
assert.ok(route.indexOf('if (!verifyConfirm(') < route.indexOf('if (body.peek === true)'), 'peek only after the signature check');
assert.ok(peek.includes("appointment: { service: appt.service || '', date: appt.date ? hebrewDate(appt.date) : '', time: fmtApptTime(appt) }"), 'treatment, day and time only');
for (const leak of ['client_id', 'tenant_id', 'appt.name', 'price', 'phone']) assert.ok(!peek.includes(leak), `peek does not return ${leak}`);
assert.ok(!/\.update\(/.test(peek), 'peek changes nothing');
const page = read('./app/confirm/page.jsx');
assert.ok(page.includes("JSON.stringify({ id, action, token, peek: true })"), 'the page peeks on a cancel link');
assert.ok(page.includes('data-testid="cancel-which"'), 'and shows which appointment');
assert.ok(!page.includes('הלינק השני'), 'no "the other link" (a booking confirmation has one)');
assert.ok(page.includes('label="מעדכנת את התור שלך"'), 'feminine spinner');
for (const f of ['./app/api/send-reminder-manual/route.js', './app/beautyos.jsx', './lib/reminders/dailyReminders.js']) {
  const s = read(f);
  assert.ok(!s.includes('אפשר לשנות כאן'), `${f}: the cancel link is not called "change"`);
  assert.ok(s.includes('אם צריך לבטל, אפשר כאן: ${'), `${f}: says it cancels`);
}
console.log('test-cancel-page: ok');
