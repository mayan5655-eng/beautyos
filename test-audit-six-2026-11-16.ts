// The six code fixes left from the 2026-11-16 competitor audit, pinned so they cannot quietly come back.
// (The Shabbat end time has its own checks in test-shabbat.ts.)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rowsToCsv } from './lib/clientData.ts';
import { creditTaxStatus } from './lib/legalReceipts/service.js';
import { wipeDemoFiles } from './lib/demoSeed.ts';
import { DEMO_TENANT_IDS } from './lib/demoTenants.ts';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const raw = (f: string) => (fs.readFileSync(f, { encoding: 'utf8', raw: true } as never) as unknown as string).replace(/\r\n/g, '\n');

await ok('/data-deletion answers (it was a 404): it sends people to the deletion instructions', () => {
  const p = raw('app/data-deletion/page.tsx');
  assert.ok(p.includes("redirect('/privacy#data-deletion')"));
  assert.ok(raw('app/privacy/page.tsx').includes('id="data-deletion"'), 'the anchor it points at exists');
});

await ok('demo: reset every hour, and what a visitor added (results, files) goes with it', async () => {
  const crons = JSON.parse(fs.readFileSync('vercel.json', 'utf8')).crons as Array<{ path: string; schedule: string }>;
  assert.equal(crons.find((c) => c.path === '/api/demo/reset')?.schedule, '37 * * * *');
  const seed = raw('lib/demoSeed.ts');
  assert.ok(seed.includes("await db.from('treatment_results').delete().eq('tenant_id', tenantId);"));
  assert.ok(seed.includes('await wipeDemoFiles(db, tenantId);'));

  // Files: every level of the demo folder, in both buckets; never another business's folder.
  const removed: string[] = [];
  const tree: Record<string, Array<{ id: string | null; name: string }>> = {
    [DEMO_TENANT_IDS.cosmetics]: [{ id: null, name: 'results' }, { id: 'f', name: 'logo.jpg' }],
    [`${DEMO_TENANT_IDS.cosmetics}/results`]: [{ id: 'f', name: 'after_x.jpg' }],
  };
  const db = {
    from: () => ({}),
    storage: { from: () => ({ list: async (p: string) => ({ data: tree[p] || [] }), remove: async (ps: string[]) => { removed.push(...ps); return { error: null }; } }) },
  };
  await wipeDemoFiles(db, DEMO_TENANT_IDS.cosmetics);
  assert.deepEqual(removed.sort(), [`${DEMO_TENANT_IDS.cosmetics}/logo.jpg`, `${DEMO_TENANT_IDS.cosmetics}/results/after_x.jpg`, `${DEMO_TENANT_IDS.cosmetics}/logo.jpg`, `${DEMO_TENANT_IDS.cosmetics}/results/after_x.jpg`].sort());
  removed.length = 0;
  assert.equal(await wipeDemoFiles(db, '448e9e45-2251-4572-b665-886c5bc7a4c8'), 0);
  assert.equal(removed.length, 0, 'a real business is never touched');
});

await ok('before/after photos: private until the consent record is complete', () => {
  const r = raw('app/ResultsManager.jsx');
  assert.ok(r.includes('await supabase.storage.from(PRIVATE_BUCKET).upload(path, blob'), 'a new photo goes to the private bucket');
  assert.ok(!/storage\.from\(PUBLIC_BUCKET\)\.upload\(path/.test(r), 'never straight to the public one');
  assert.ok(r.includes('if (consentComplete(draft) && (isPrivateRef(beforeUrl) || isPrivateRef(afterUrl)))'), 'moved to public only with consent');
  assert.ok(r.includes('photoApi("sign", [src])'), 'shown to her through a signed link');
  assert.ok(r.includes('const d = await photoApi("publish", [v]);') && r.includes('await photoApi("remove", paths, { bucket });'), 'moved and removed on the server (the browser may not read or delete them)');
  assert.ok(r.includes('if ((beforeUrl && !b) || !a) {'), 'a failed move does not save a consented result with private photos');
});

await ok('the photo route: her session, her results folder only', async () => {
  const route = raw('app/api/results/photo/route.ts');
  assert.ok(route.includes("supabase.rpc('get_user_tenant_id')") && route.includes("checkTenantLimit(tenantId, 'results-photo')"));
  const { ownResultPath } = await import('./lib/resultPhotos.ts');
  const t = '00000000-0000-0000-0000-000000000001';
  assert.equal(ownResultPath(t, `${t}/results/after_abc-1.jpg`), `${t}/results/after_abc-1.jpg`);
  assert.equal(ownResultPath(t, `${t}/results/../clients/x.jpg`), null, 'no climbing out');
  assert.equal(ownResultPath(t, `${t}/clients/x.jpg`), null, 'not her client photos');
  assert.equal(ownResultPath(t, `448e9e45-2251-4572-b665-886c5bc7a4c8/results/a.jpg`), null, 'never another business');
});

await ok('a credit/cancel document follows the document it cancels, not today\'s registration', () => {
  assert.equal(creditTaxStatus('receipt', 'licensed'), 'exempt', 'issued as exempt, now licensed: a receipt cancels it');
  assert.equal(creditTaxStatus('tax_invoice_receipt', 'exempt'), 'licensed', 'a tax invoice-receipt is credited by a credit invoice');
  assert.equal(creditTaxStatus('tax_invoice_receipt', 'company'), 'company');
  assert.equal(creditTaxStatus(null, 'licensed'), 'licensed', 'unknown original: today\'s, as before');
  assert.ok(raw('lib/legalReceipts/service.js').includes('const taxStatus = creditTaxStatus(receipt.legal_doc_type, nowStatus);'));
});

await ok('after the trial: she can still download her clients, appointments and payments', () => {
  const csv = rowsToCsv([{ name: 'דנה', phone: '0527778899' }, { name: '=HYPERLINK("x")', notes: 'a,"b"' }]);
  assert.ok(csv.startsWith('﻿"name","phone","notes"\r\n'), 'Excel-ready, a column for every key');
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`), 'a formula never runs in Excel');
  const route = raw('app/api/business/export/route.ts');
  assert.ok(route.includes("export const EXPORT_TABLES = ['clients', 'appointments', 'receipts'] as const"));
  assert.ok(route.includes(".eq('tenant_id', String(tenantId))") && route.includes("supabase.rpc('get_user_tenant_id')"), 'her own business, from the session');
  assert.ok(route.includes('isDemoTenantId(String(tenantId))'), 'not the shared demo');
  assert.ok(!route.includes('assertActivePlan') && !route.includes('planGuard'), 'open while the plan is blocked');
  const screen = raw('app/PlanBlockedScreen.jsx');
  assert.ok(screen.includes('data-testid="plan-blocked-export"') && screen.includes('{!isDemo && ('));
});

console.log(`audit six: ${n} ok`);
