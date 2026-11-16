// The owner's hot-lead note from the skin scanner says "she got the report" only when it was really sent (2026-11-04):
// a queued report waits for HER in "הודעות מוכנות לשליחה", and telling her it arrived meant the client never got it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('app/api/skin-scan/send/route.js', 'utf8').split('\r\n').join('\n');
assert.ok(src.includes('function buildOwnerMessage(report, clientName, clientPhone, queued = false, sent = true)'));
assert.ok(src.includes('buildOwnerMessage(report, clientName, clientPhone, !!clientResult?.queued, !!clientResult?.ok)'), 'the note is built from the real send outcome');
assert.ok(src.indexOf('const clientResult = await sendWhatsApp(') < src.indexOf('buildOwnerMessage(report, clientName, clientPhone, !!clientResult'), 'after the send');
const body = src.slice(src.indexOf('function buildOwnerMessage'), src.indexOf('return lines.join', src.indexOf('function buildOwnerMessage')));
const fn = new Function('report', 'clientName', 'clientPhone', 'queued', 'sent', body.slice(body.indexOf('{') + 1) + 'return lines.join("\\n");');
const r = { score: 74, skin_type: 'מעורב' };
assert.match(fn(r, 'דנה', '0500000000', false, true), /היא קיבלה את הדוח המלא/);
// 2026-11-16: neither sent nor queued (the send failed) never claims delivery either.
assert.match(fn(r, 'דנה', '0500000000', false, false), /לא הצלחנו לשלוח/);
assert.doesNotMatch(fn(r, 'דנה', '0500000000', false, false), /קיבלה את הדוח/);
assert.match(fn(r, 'דנה', '0500000000', true, false), /מחכה לשליחה ממך/);
assert.doesNotMatch(fn(r, 'דנה', '0500000000', true, false), /קיבלה את הדוח/);
assert.ok(!/[–—]/.test(body), 'no dashes');
console.log('skin lead note: ok');
