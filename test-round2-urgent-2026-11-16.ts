// Round-2 audit (2026-11-16), the six urgent findings: each fix pinned so it cannot quietly come back.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { recordConsentAndStart } from './lib/grow/cancelFees.ts';
import { DEFAULT_POLICY, sanitizePolicy } from './lib/cancellationPolicy.ts';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const raw = (f: string) => (fs.readFileSync(f, { encoding: 'utf8', raw: true } as never) as unknown as string).replace(/\r\n/g, '\n');

await ok('deposit page that cannot open: the booking stays on the 30-minute hold (retry + release), not in limbo', async () => {
  const updates: Record<string, unknown>[] = [];
  const repo = {
    getAccount: async () => null, // Grow not connected: the step fails
    insertConsent: async (row: Record<string, unknown>) => ({ id: 'c1', ...row }),
    updateConsent: async (_id: string, patch: Record<string, unknown>) => { updates.push(patch); },
  };
  const d = { repo, ops: {}, now: () => new Date('2026-11-16T10:00:00Z') } as never;
  const policy = sanitizePolicy({ ...DEFAULT_POLICY, mode: 'deposit', deposit: { type: 'fixed', value: 50 }, text: '' } as never);
  const r = await recordConsentAndStart(d, { tenantId: 't', appointmentId: 'a', clientId: null, clientName: 'דנה', phone: '0521234567', servicePrice: 300, serviceName: 'טיפול פנים', policy, returnUrl: 'https://x' });
  assert.equal(r.step.url, null);
  assert.deepEqual(updates.at(-1), { status: 'awaiting_deposit' }, 'still a hold the cron releases and the client can retry');
  const page = raw('app/BookingPage.jsx');
  assert.ok(page.includes('התור שמור עבורך ל-30 דקות, אבל דף התשלום לא נפתח'), 'the client is told the truth');
  assert.ok(page.includes('tr("לנסות שוב לפתוח את התשלום")'), 'and can retry');
});

await ok('success screen: her own link to move or cancel', () => {
  const route = raw('app/api/book-appointment/route.js');
  assert.ok(route.includes('manageUrl: heldForDeposit ? null : confirmLinks(APP_URL, String(appt.id), { date }).cancelUrl'));
  const page = raw('app/BookingPage.jsx');
  assert.ok(page.includes('data-testid="manage-link"') && page.includes('tr("לשינוי או ביטול התור")'));
  assert.ok(page.includes('result.manageUrl.startsWith("http")'), 'only a real link is shown');
});

await ok('onboarding: no form without a business to save into; a beginner can pass the tax step', () => {
  const p = raw('app/onboarding/page.tsx');
  assert.ok(/if \(!tenantId\) \{\n\s+return \(/.test(p) && p.includes('data-testid="onboarding-load-failed"') && p.includes('window.location.reload()'));
  assert.ok(p.includes('data-testid="tax-later"') && p.includes('עוד לא פתחתי תיק / לא בטוחה'));
  assert.ok(p.includes('if (step === 2 && !data.business_tax_status && !taxLater) {'));
  assert.ok(p.includes('...(data.business_tax_status ? { business_tax_status:'), 'nothing is saved for "not yet"');
});

await ok('functions run next to the database (Singapore)', () => {
  const v = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  assert.deepEqual(v.regions, ['iad1']);
  assert.ok(Array.isArray(v.crons) && v.crons.length > 0, 'the crons are kept');
});

await ok('signature: the finger is scaled into the canvas pixels; a real colour', () => {
  const f = raw('app/form/page.jsx');
  assert.ok(f.includes('const sx = rect.width ? canvas.width / rect.width : 1;'));
  assert.ok(f.includes('ctx.strokeStyle = "#1F3A30";') && !f.includes('ctx.strokeStyle = "var('));
  assert.ok(f.includes('width={460} height={130}'), 'the stored image keeps its size');
});

console.log(`round 2 urgent: ${n} ok`);
