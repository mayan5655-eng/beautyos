// The 2026-10-20 code audit fixes: the pure parts are run, the route wiring is checked in the source (as the other route tests do).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDepositRequest, isPaymentRequest, REQUEST_DEPOSIT_PREFIX, REQUEST_FULL_PREFIX } from './lib/grow/paymentRequest.ts';
import { growText, findInvoiceNumber } from './lib/grow/payload.ts';
import { openToken } from './lib/billing/growBilling.ts';

const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

// M1: a deposit request is still recognised after Grow's text cleaning removed the "·".
{
  const stored = growText(`${REQUEST_DEPOSIT_PREFIX} טיפול פנים`);
  assert.ok(!stored.includes('·'), 'growText strips the dot');
  assert.equal(isDepositRequest(stored), true);
  assert.equal(isPaymentRequest(stored), true);
  assert.equal(isDepositRequest(growText(`${REQUEST_FULL_PREFIX} טיפול`)), false);
  assert.equal(isPaymentRequest(growText(`${REQUEST_FULL_PREFIX} טיפול`)), true);
  assert.equal(isDepositRequest('טיפול פנים'), false);
}

// M13: a sealed billing token is opened for the call, an older plain one passes through.
{
  const sealed = `${'a'.repeat(32)}:${'b'.repeat(32)}:${'c'.repeat(10)}`;
  assert.equal(openToken(sealed, () => 'OPENED'), 'OPENED');
  assert.equal(openToken('plain-token-123', () => 'OPENED'), 'plain-token-123');
}

// D13: a bare "number" field is not the legal document number.
assert.equal(findInvoiceNumber({ data: { number: '42' } }), '');
assert.equal(findInvoiceNumber({ data: { documentNumber: 'A-9' } }), 'A-9');

// X6: replies to the central number find their business from our own outbound log; a multi-business "הסר" is honoured for each.
{
  const s = src('./app/api/whatsapp-webhook/route.js');
  assert.match(s, /GREENAPI_ID_INSTANCE/);
  assert.match(s, /from\("whatsapp_messages"\)\.select\("tenant_id"\)\.in\("recipient_phone", variants\)/);
  assert.match(s, /for \(const t of centralTenants\) await recordOptOut\(t/);
  assert.ok(s.indexOf('centralTenants.length === 1') < s.indexOf('ignored: "unknown tenant"'));
}

// X1: the end-of-package offer is marketing.
{
  const s = src('./lib/reminders/smartReminders.js');
  const i = s.indexOf("add(client, 'package_done'");
  const block = s.slice(s.lastIndexOf('PACKAGE DONE', i), i + 400);
  assert.match(block, /canMarket\(client\)/);
  assert.match(block, /MARKETING_FOOTER/);
  // X7, X11: archived cards and demo businesses never become candidates.
  assert.match(s, /client\.status === 'archived'\) \{ stats\.skipped\.archived/);
  assert.match(s, /isDemoTenantId\(client\.tenant_id\)\) \{ stats\.skipped\.demo/);
  // X13: Feb 29 birthdays.
  assert.match(s, /bMonth === 2 && bDay === 29 && !leap/);
}

// X2: a failed opt-out read stops the bulk send.
assert.match(src('./app/api/leads/send-bulk/route.js'), /opt-out read failed[\s\S]{0,200}status: 503/);

// X5: the marketing audiences read the whole history, and refuse a partial one.
for (const p of ['./app/api/clients/comeback/route.js', './app/api/clients/lapsed/route.js', './app/api/clients/lapsed/mark/route.js', './app/api/automations/skin-followup/route.ts', './app/api/slots/offer/route.js']) {
  const s = src(p);
  assert.match(s, /readAllRows\(/, p);
  assert.match(s, /complete/, p);
}
// X8: the skin follow-up queue only proposes to clients who agreed to marketing.
assert.match(src('./app/api/automations/skin-followup/route.ts'), /canMarket\(c\)/);

// X9: the manual reminder knows which day it is for, and its duration.
{
  const s = src('./app/api/send-reminder-manual/route.js');
  assert.match(s, /start_minute, duration,/);
  assert.ok(!s.includes('${businessName} מחר.'));
}

// X10 + D3: the weekly report reads the week, and a failed voids read is not "nothing voided".
{
  const s = src('./app/api/send-weekly-report/route.js');
  assert.match(s, /gte\("date", apptFrom\)/);
  assert.match(s, /if \(v\.error\) throw/);
}

// F1, F2, F8, F9: one-tap actions are guarded synchronously; a blocked popup is not a sent reminder.
{
  const s = src('./app/beautyos.jsx');
  assert.match(s, /const runOnce = async \(key, fn\)/);
  assert.match(s, /handleUsePackageSession = \(pkg, opts\) => runOnce\(/);
  assert.match(s, /handleUndoPackageSession = \(pkg\) => runOnce\(/);
  assert.match(s, /handleSendForm = \(client,formType\) => runOnce\(/);
  assert.match(s, /handleSendConfirmation = \(appt\) => runOnce\(/);
  assert.match(s, /if \(!opened\) \{/);
  assert.match(s, /const ok = await handleSendConfirmation\(appt\);\s*if \(!ok\) break;/);
  // D4: a refused replacement puts the old personal event back.
  assert.match(s, /insert\(existing\)\.select\(\)/);
}

// F3: the iPhone banner survives blocked storage.
assert.match(src('./app/ios-install-banner.tsx'), /try \{ dismissed = window\.localStorage\.getItem/);
// F4: the selected date and time on the public page are readable on any accent.
assert.equal((src('./app/BookingPage.jsx').match(/isSel \? "var\(--pc-contrast, #FFFFFF\)"/g) || []).length, 2);

// S5, S8, S9.
{
  const s = src('./app/api/push/subscribe/route.js');
  assert.match(s, /u\.protocol === "https:"/);
  assert.match(s, /delete\(\)\.eq\("endpoint", endpoint\)\.eq\("tenant_id", tenantId\)/);
  assert.match(src('./app/api/facebook/webhook/route.ts'), /crypto\.timingSafeEqual\(Buffer\.from\(token\)/);
  assert.ok(!/console\.error\("skin-scan\/send error:", err\)/.test(src('./app/api/skin-scan/send/route.js')));
}

console.log('audit 2026-10-20: all checks passed');
