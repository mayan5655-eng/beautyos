// test-rebook-checkout.ts
//
// Rebook at checkout: after a till payment, the payment-done screen offers the SAME "קבעי לה שוב" sheet the calendar
// card and the client card open (app/RebookNextSheet.jsx), prefilled with what she just paid for, anchored on this
// visit, and with her own rhythm (lib/rebookNext.rebookInterval). No second copy of the rebook logic.
// beautyos.jsx is a client component, so this reads the source; the interval itself is tested with plain data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rebookInterval } from './lib/rebookNext.js';

let passed = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); passed++; };

const app = readFileSync('app/beautyos.jsx', 'utf8');
const sheet = readFileSync('app/RebookNextSheet.jsx', 'utf8');

// The receipt sheet, from its opening to the receipt buttons: the post-payment block.
const recStart = app.indexOf('{showReceipt&&(');
const recEnd = app.indexOf('onClick={()=>printReceipt(showReceipt)}', recStart);
ok(recStart > 0 && recEnd > recStart, 'found the payment-done screen');
const receipt = app.slice(recStart, recEnd);

ok(receipt.includes('data-testid="rebook-receipt"'), 'the payment-done screen has the "book her again" entry');
ok(receipt.includes('↻ קבעי לה שוב לפי הקצב שלה'), 'worded like the other two entries, plus "her rhythm"');
ok(/setRebookNext\(\{client:rbClient,appt:rbAnchor,receiptId:showReceipt\.id,service:rbService\}\)/.test(receipt), 'opens the existing sheet with the client, this visit, the receipt and the service');
ok(/showReceipt\.appointment_id \? appointments\.find/.test(receipt), 'anchored on the appointment this payment was for');
ok(/split\(","\)\.map\(x=>x\.trim\(\)\)\.find\(n=>activeServices\.some\(sv=>sv\.name===n\)\)/.test(receipt), 'prefilled with the first paid line that is still on her menu');
ok(/if \(!rebookPlan\) return openRebookSheet \?/.test(receipt), 'offered even when the inline strip has no proposal (a walk-in sale, an unknown service)');
ok((receipt.match(/\{sheetButton\}/g) || []).length === 2, 'and under the inline strip when it has one');
ok(!/consentAskFor/.test(receipt.slice(receipt.indexOf('const rbClient'))), 'the change stays inside the next-appointment block');

// One sheet, one render: the checkout entry only adds props.
ok((app.match(/<RebookNextSheet\b/g) || []).length === 1, 'still exactly one RebookNextSheet render');
ok(app.includes('initialService={rebookNext.service||""}'), 'the paid service is passed through');
ok(/createAppointment=\{rebookNext\.receiptId \? async \(args\)=>\{ const row = await insertRebookAppointment\(args\); if \(row\) setRebookDone\(\{ receiptId: rebookNext\.receiptId, appt: row \}\); return row; \} : insertRebookAppointment\}/.test(app),
  'booking from the sheet goes through the same insert and marks this receipt "התור הבא נקבע"');
ok(/onManual=\{rebookNext\.receiptId \? \(args\)=>\{ setShowReceipt\(null\); openRebookForm\(args\); \} : openRebookForm\}/.test(app),
  '"שינוי" from the checkout closes the receipt first, so the form is not hidden behind it (same as the strip)');

// The sheet: the prefill is optional and only for a service on her menu.
ok(/initialService = '',/.test(sheet), 'initialService is optional (the other two entries pass nothing)');
ok(/useState\(\(\) => \(initialService && \(services \|\| \[\]\)\.some\(\(s\) => s\.name === initialService\) \? initialService : ''\)\)/.test(sheet), 'an unknown service is ignored, falling back to the anchor');
ok(/zIndex=\{1250\}/.test(sheet) && /zIndex=\{1100\}/.test(receipt), 'the sheet opens above the receipt');
ok(/rebookInterval\(\{ visits: past\.map/.test(sheet), 'the interval is her rhythm, from the existing lib');

// "The usual interval if one exists": the lib the sheet uses.
const visits = [{ date: '2026-08-01', service: 'ריסים' }, { date: '2026-08-22', service: 'ריסים' }, { date: '2026-09-12', service: 'ריסים' }];
const r = rebookInterval({ visits, service: 'ריסים', businessFields: ['cosmetics'] });
ok(r.days === 21 && r.basis === 'service', 'three visits three weeks apart: 21 days, from this service');
const d = rebookInterval({ visits: [{ date: '2026-09-12', service: 'ריסים' }], service: 'ריסים', businessFields: ['cosmetics'] });
ok(d.basis === 'default' && d.days === 28, 'no history yet: the default, said as a default');

console.log(`rebook at checkout: passed ${passed} failed 0`);
