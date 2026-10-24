// The send queue can be cleaned, and a message she opens on the spot does not also wait there.
// (2026-10-23 pass: old reminders could not be removed; a "תזכורת" tap opened WhatsApp AND left a pending row.)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { waStatusLabel } from './lib/waStatusLabel.js';
const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

const route = read('./app/api/messages/route.js');
assert.match(route, /action !== "sent" && action !== "dismiss"/, 'only two actions');
assert.match(route, /status: action === "dismiss" \? "dismissed" : "sent"/);
const patch = route.slice(route.indexOf('export async function PATCH'));
assert.match(patch, /\.eq\("tenant_id", tenantId\)/);
assert.match(patch, /\.eq\("status", "pending_manual"\)/, 'only a waiting message changes');
assert.equal(waStatusLabel({ status: 'dismissed' }).text, 'הוסרה מהרשימה בלי שליחה', 'the log says what happened');

const wa = read('./lib/whatsapp.js');
assert.match(wa, /select\("id"\)\.maybeSingle\(\);\s*return data\?\.id \|\| null;/, 'logMessage returns the row id');
assert.match(wa, /queued\.messageId = await logMessage\(/, 'a manual-mode queue result carries it');
assert.match(wa, /fellBackFromAuto: true, messageId \}/, 'so does a fallback');
for (const f of ['./app/api/send-receipt/route.js', './app/api/send-reminder-manual/route.js']) {
  assert.match(read(f), /messageId: result\.messageId \|\| null/, `${f} hands the id back`);
}

const dash = read('./app/beautyos.jsx');
assert.ok(dash.includes('body:JSON.stringify({id:m.id,action:"dismiss"})'), 'the queue sheet has a remove button');
const helper = dash.slice(dash.indexOf('const openQueuedWa = (link, messageId) => {'), dash.indexOf('const sendReceiptToClient'));
assert.ok(helper.includes('const w = window.open(link, "_blank");') && !helper.includes('"noopener")'), 'can tell an opened tab from a blocked one');
assert.ok(helper.includes('if (w) {') && helper.includes('JSON.stringify({ id: messageId })'), 'marks it sent only when WhatsApp opened');
assert.ok(helper.includes('ההודעה מחכה ב\\"הודעות מוכנות לשליחה\\"'), 'a blocked popup is said, and the message stays queued');
assert.equal((dash.match(/openQueuedWa\(data\.waLink, data\.messageId\)/g) || []).length, 2, 'reminder and receipt both use it');

console.log('test-queue-dismiss: ok');
