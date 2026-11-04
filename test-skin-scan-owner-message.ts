// The owner's hot-lead note must not say the client received her report when it was only queued.
// Found 2026-11-04: buildOwnerMessage always ended "היא קיבלה את הדוח המלא לוואטסאפ" even when sendWhatsApp()
// fell back to the manual queue (auto-send off, central number down) and the client had received nothing.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { buildOwnerMessage, ownerClosingLine, OWNER_LINE_DELIVERED, OWNER_LINE_QUEUED, OWNER_LINE_FAILED } =
  await import('./lib/skinScanOwnerMessage.ts');

const report = { score: 82, skin_type: 'מעורב', clinical_treatment: 'פילינג עדין' };
let passed = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); passed++; };

// A real send keeps the delivered wording.
const sent = buildOwnerMessage(report, 'רונית', '0501234567', { ok: true, messageId: 'x' } as any);
ok(sent.endsWith(OWNER_LINE_DELIVERED), 'delivered: closes with "she got it"');
ok(sent.includes('👤 שם: רונית') && sent.includes('📞 טלפון: 0501234567') && sent.includes('82/100'), 'lead details kept');

// Queued (both the manual-only path and the auto-send fallback) never claims delivery.
for (const outcome of [
  { ok: false, queued: true, reason: 'auto_disabled' },
  { ok: false, queued: true, reason: 'send_failed', fellBackFromAuto: true },
]) {
  const msg = buildOwnerMessage(report, '', '0501234567', outcome as any);
  ok(msg.endsWith(OWNER_LINE_QUEUED), `queued (${outcome.reason}): closes with the waiting line`);
  ok(!msg.includes('קיבלה'), `queued (${outcome.reason}): no "received" claim anywhere`);
  ok(msg.includes('הודעות מוכנות לשליחה'), `queued (${outcome.reason}): tells her where the report waits`);
  ok(!msg.includes('👤'), 'no name line when the visitor gave none');
}

// A real failure (nothing sent, nothing queued) also never claims delivery.
ok(ownerClosingLine({ ok: false }) === OWNER_LINE_FAILED, 'failed: honest line');
ok(ownerClosingLine(undefined) === OWNER_LINE_FAILED, 'unknown outcome: never assume delivered');
ok(!OWNER_LINE_FAILED.includes('קיבלה'), 'failed line claims nothing');

// Copy rules: no em/en dashes in any closing line.
for (const line of [OWNER_LINE_DELIVERED, OWNER_LINE_QUEUED, OWNER_LINE_FAILED]) ok(!/[–—]/.test(line), `no em/en dash: ${line}`);

// The route passes the real send outcome in (and no longer carries its own always-"received" copy).
const route = readFileSync('app/api/skin-scan/send/route.js', 'utf8');
ok(/buildOwnerMessage\(report, clientName, clientPhone, clientResult\)/.test(route), 'route passes clientResult');
ok(!route.includes('היא קיבלה את הדוח'), 'route has no hard-coded delivered line');

console.log(`skin-scan owner message: passed ${passed} failed 0`);
