// The owner's hot-lead note from the skin scanner says "she got the report" only when it was really sent (2026-11-04):
// a queued report waits for HER in "הודעות מוכנות לשליחה", and telling her it arrived meant the client never got it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('app/api/skin-scan/send/route.js', 'utf8').split('\r\n').join('\n');
assert.ok(src.includes('function buildOwnerMessage(report, clientName, clientPhone, queued = false)'));
assert.ok(src.includes('buildOwnerMessage(report, clientName, clientPhone, !!clientResult?.queued)'), 'the note is built from the real send outcome');
assert.ok(src.indexOf('const clientResult = await sendWhatsApp(') < src.indexOf('buildOwnerMessage(report, clientName, clientPhone, !!clientResult'), 'after the send');
const body = src.slice(src.indexOf('function buildOwnerMessage'), src.indexOf('return lines.join', src.indexOf('function buildOwnerMessage')));
const fn = new Function('report', 'clientName', 'clientPhone', 'queued', body.slice(body.indexOf('{') + 1) + 'return lines.join("\\n");');
const r = { score: 74, skin_type: 'מעורב' };
assert.match(fn(r, 'דנה', '0500000000', false), /היא קיבלה את הדוח המלא/);
assert.match(fn(r, 'דנה', '0500000000', true), /מחכה לשליחה ממך/);
assert.doesNotMatch(fn(r, 'דנה', '0500000000', true), /קיבלה את הדוח/);
assert.ok(!/[–—]/.test(body), 'no dashes');
console.log('skin lead note: ok');
