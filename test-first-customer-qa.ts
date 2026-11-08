// First-customer QA pass (2026-11-08): a non-technical cosmetician signing up on her phone, and her first client.
// Each fix below was found by walking the app at 390px against a mock Supabase. Source checks plus pure functions, so a later
// edit cannot quietly undo one.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { receiptMethodLabel, paidByVoucher, voucherRedeemNote } from './lib/giftVouchers.ts';
import { SERVICE_TEMPLATE_GROUPS_BY_FIELD as SERVICE_TEMPLATES } from './lib/tenantTemplate.ts';

const app = readFileSync('app/beautyos.jsx', 'utf8');
const onboarding = readFileSync('app/onboarding/page.tsx', 'utf8');
const vouchersRoute = readFileSync('app/api/vouchers/route.ts', 'utf8');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

ok('onboarding: picking a field clears the "pick at least one field" warning', () => {
  const i = onboarding.indexOf('<FieldPicker');
  assert.ok(i > 0);
  assert.match(onboarding.slice(i, i + 900), /if \(fields\.length > 0\) setError\(""\);/);
});

ok('onboarding: no em dash in the copy she reads', () => {
  // JSX text and string literals only; comments may keep theirs.
  const visible = onboarding.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l));
  for (const l of visible) {
    if (!l.includes('—')) continue;
    // alt text of the Kalmea banner is Kalmea's own tagline, not her copy
    if (/alt="קלמיה/.test(l)) continue;
    assert.fail(`em dash in onboarding copy: ${l.trim().slice(0, 120)}`);
  }
});

ok('suggested service descriptions (seeded onto her booking page) carry no em dash', () => {
  const all: Array<{ name: string; description?: string }> = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.name === 'string' && typeof o.description === 'string') all.push(o as { name: string; description: string });
      Object.values(o).forEach(walk);
    }
  };
  walk(SERVICE_TEMPLATES);
  assert.ok(all.length > 20, 'found the templates');
  for (const s of all) assert.ok(!String(s.description).includes('—'), `em dash in "${s.name}"`);
});

ok('payment confirmation: her logo or none, never the Kalmea banner', () => {
  const i = app.indexOf('{/* RECEIPT MODAL */}');
  assert.ok(i > 0);
  const head = app.slice(i, i + 1600);
  assert.doesNotMatch(head, /BANNER_WIDE/);
  assert.match(head, /settings\?\.branding\?\.logo_url&&<img data-testid="receipt-logo"/);
});

ok('payment confirmation: a sale the voucher paid in full shows "שובר מתנה", not the till default', () => {
  const note = voucherRedeemNote('K7M4X9Q2', 120);
  assert.ok(paidByVoucher({ note }));
  assert.equal(receiptMethodLabel({ amount: 0, payment_method: 'אשראי', note }), 'שובר מתנה');
  // part voucher, part card: the card is the method
  assert.equal(receiptMethodLabel({ amount: 60, payment_method: 'אשראי', note }), 'אשראי');
  // no voucher: unchanged; a package stays a package
  assert.equal(receiptMethodLabel({ amount: 0, payment_method: 'חבילה', note }), 'חבילה');
  assert.equal(receiptMethodLabel({ amount: 100, payment_method: 'ביט', note: '' }), 'ביט');
  assert.equal(receiptMethodLabel({ amount: 100, payment_method: '', note: '' }, 'מזומן'), 'מזומן');
  assert.match(app, /<span style=\{\{color:"var\(--ink-3\)"\}\}>אמצעי תשלום:<\/span><span>\{receiptMethodLabel\(showReceipt\)\}<\/span>/);
  assert.match(app, /אמצעי תשלום: \$\{receiptMethodLabel\(receipt, "מזומן"\)\}/);
});

ok('voiding a sale the voucher paid gives the amount back to the voucher', () => {
  assert.match(vouchersRoute, /if \(action === 'reverse_receipt'\) \{/);
  const i = vouchersRoute.indexOf("if (action === 'reverse_receipt')");
  const block = vouchersRoute.slice(i, i + 1800);
  assert.match(block, /\.eq\('tenant_id', tenantId\)\.eq\('receipt_id', receiptId\)\.eq\('kind', 'redeem'\)/);
  assert.match(block, /db\.rpc\('gift_voucher_reverse'/);
  // after the void row is written, not before (the database refuses while the sale stands)
  const v = app.indexOf('const handleVoidReceipt = async (receipt) => {');
  const body = app.slice(v, v + 6000);
  const voidAt = body.indexOf('from("receipt_voids").insert');
  const backAt = body.indexOf('action: "reverse_receipt"');
  assert.ok(voidAt > 0 && backAt > voidAt);
  assert.match(body, /if \(data && data\[0\] && paidByVoucher\(receipt\)\)/);
});

ok('receipt: a client who already has a next visit is told so, not offered a one-tap second booking', () => {
  const i = app.indexOf('data-testid="rebook-receipt-already"');
  assert.ok(i > 0);
  const before = app.slice(i - 900, i);
  assert.match(before, /String\(a\.date\|\|""\)>today/);
  assert.ok(app.indexOf('data-testid="rebook-receipt-already"') < app.indexOf('if (!rebookPlan) return openRebookSheet ? ('));
});

console.log(`\n${n} checks passed`);
