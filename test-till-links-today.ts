// A payment from "תשלום חדש" links the client's single unpaid visit today (2026-10-23 pass, F2).
import assert from 'node:assert/strict';
import fs from 'node:fs';
const dash = fs.readFileSync(new URL('./app/beautyos.jsx', import.meta.url), 'utf8');
const save = dash.slice(dash.indexOf('const handleSaveReceipt = async () => {'), dash.indexOf('const handleSaveReceipt = async () => {') + 6000);
assert.ok(save.includes('const linkedApptId = cashierAppt?.id || (() => {'), 'opened from an appointment: that one');
assert.ok(save.includes('a.date === today') && save.includes('a.confirmation_status !== "cancelled"') && save.includes('!receipts.some(r => String(r.appointment_id) === String(a.id))'), 'today, live, unpaid');
assert.ok(save.includes('return c.length === 1 ? c[0].id : null;'), 'ambiguous stays unlinked');
assert.ok(save.includes('appointment_id:linkedApptId||null,'));
console.log('test-till-links-today: ok');
