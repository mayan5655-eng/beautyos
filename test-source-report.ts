// Revenue by source: the arithmetic of the report and the editable source list.
import assert from 'node:assert/strict';
import { buildSourceReport, reportToSheetRows } from './lib/sourceReport.ts';
import { resolveLeadSources, normalizeLeadSourcesForSave, DEFAULT_LEAD_SOURCES, sourceLabelHe, MAX_LEAD_SOURCES } from './lib/leadSources.ts';

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

ok('no custom list: the defaults; garbage never gives an empty picker', () => {
  for (const v of [null, undefined, {}, { lead_sources: null }, { lead_sources: [] }, { lead_sources: 'x' }, { lead_sources: [1, null, '  '] }, 'str', []]) {
    assert.deepEqual(resolveLeadSources(v), [...DEFAULT_LEAD_SOURCES]);
  }
});

ok('her list: trimmed, de-duplicated, capped; order kept', () => {
  assert.deepEqual(resolveLeadSources({ lead_sources: ['  אירוע ', 'אירוע', 'AB', 'ab', 'אתר'] }), ['אירוע', 'AB', 'אתר']);
  const many = Array.from({ length: 50 }, (_, i) => 'מקור' + i);
  assert.equal(normalizeLeadSourcesForSave(many).length, MAX_LEAD_SOURCES);
  assert.equal(normalizeLeadSourcesForSave(['x'.repeat(80)])[0].length, 30);
});

ok('machine sources get a Hebrew label, unknown pass through, empty is unknown', () => {
  assert.equal(sourceLabelHe('csv_import'), 'ייבוא מקובץ');
  assert.equal(sourceLabelHe('facebook_lead_ad'), 'מודעת לידים בפייסבוק');
  assert.equal(sourceLabelHe('אירוע'), 'אירוע');
  assert.equal(sourceLabelHe('  '), 'לא ידוע');
});

const leads = [
  { id: 1, source: 'פייסבוק', status: 'closed', client_id: 'c1', created_at: '2026-10-02T10:00:00Z' },
  { id: 2, source: 'פייסבוק', status: 'new', client_id: null, created_at: '2026-10-03T10:00:00Z' },
  { id: 3, source: 'פייסבוק', status: 'new', client_id: null, created_at: '2026-10-04T10:00:00Z' },
  { id: 4, source: 'פייסבוק', status: 'closed', client_id: null, created_at: '2026-10-05T10:00:00Z' },
  { id: 5, source: 'המלצה', status: 'closed', client_id: 'c2', created_at: '2026-10-06T10:00:00Z' },
  { id: 6, source: 'המלצה', status: 'closed', client_id: 'c2', created_at: '2026-10-09T10:00:00Z' }, // second lead, same client
  { id: 7, source: '', status: 'new', client_id: null, created_at: '2026-10-07T10:00:00Z' },
  { id: 8, source: 'פייסבוק', status: 'closed', client_id: 'c9', created_at: '2026-08-01T10:00:00Z' }, // outside the range
];
const receipts = [
  { client_id: 'c1', amount: 300 }, { client_id: 'c1', amount: 200 },
  { client_id: 'c2', amount: 500 },
  { client_id: 'c1', amount: 999, voided: true },
  { client_id: 'c9', amount: 1000 },
];
const spend = [
  { day: '2026-10-01', source: 'פייסבוק', amount: 100 },
  { day: '2026-10-15', source: 'פייסבוק', amount: 150 },
  { day: '2026-09-15', source: 'פייסבוק', amount: 700 }, // outside
];
const range = { from: '2026-10-01', to: '2026-10-31' };

ok('counts: leads, conversions (client or closed), conversion rate', () => {
  const r = buildSourceReport(leads, receipts, spend, range);
  const fb = r.rows.find((x) => x.key === 'פייסבוק')!;
  assert.equal(fb.leads, 4);
  assert.equal(fb.conversions, 2, 'lead 1 (client) and lead 4 (closed, no client)');
  assert.equal(fb.conversionRate, 50);
});

ok('revenue: live receipts of the cohort only, once per client', () => {
  const r = buildSourceReport(leads, receipts, spend, range);
  assert.equal(r.rows.find((x) => x.key === 'פייסבוק')!.revenue, 500, 'voided 999 and out-of-range c9 are not counted');
  const ref = r.rows.find((x) => x.key === 'המלצה')!;
  assert.equal(ref.leads, 2);
  assert.equal(ref.revenue, 500, 'two leads for one client: her 500 is counted once');
});

ok('spend and ratios; no spend means null, not zero', () => {
  const r = buildSourceReport(leads, receipts, spend, range);
  const fb = r.rows.find((x) => x.key === 'פייסבוק')!;
  assert.equal(fb.spend, 250, 'September spend is outside the range');
  assert.equal(fb.costPerLead, 62.5);
  assert.equal(fb.costPerAcquisition, 125);
  assert.equal(fb.roas, 2);
  assert.equal(fb.roiPercent, 100);
  assert.equal(fb.avgRevenuePerLead, 125);
  const ref = r.rows.find((x) => x.key === 'המלצה')!;
  assert.equal(ref.spend, 0);
  assert.equal(ref.roas, null);
  assert.equal(ref.roiPercent, null);
  assert.equal(ref.costPerAcquisition, null);
});

ok('empty source becomes "לא ידוע"; totals add up; ordered by revenue', () => {
  const r = buildSourceReport(leads, receipts, spend, range);
  assert.ok(r.rows.find((x) => x.label === 'לא ידוע' && x.leads === 1));
  assert.equal(r.totals.leads, r.rows.reduce((s, x) => s + x.leads, 0));
  assert.equal(r.totals.revenue, 1000);
  for (let i = 1; i < r.rows.length; i++) assert.ok(r.rows[i - 1].revenue >= r.rows[i].revenue);
});

ok('no range: everything, including the old lead', () => {
  const r = buildSourceReport(leads, receipts, spend);
  assert.equal(r.rows.find((x) => x.key === 'פייסבוק')!.leads, 5);
  assert.equal(r.rows.find((x) => x.key === 'פייסבוק')!.revenue, 1500);
});

ok('empty input is an empty report, not a crash', () => {
  const r = buildSourceReport([], [], []);
  assert.equal(r.rows.length, 0);
  assert.equal(r.totals.leads, 0);
  assert.equal(r.totals.roas, null);
});

ok('sheet rows: header, one line per source, totals last; spend columns only when there is spend', () => {
  const r = buildSourceReport(leads, receipts, spend, range);
  const withSpend = reportToSheetRows(r, true);
  assert.equal(withSpend[0].length, 11);
  assert.equal(withSpend.length, r.rows.length + 2);
  assert.equal(withSpend[withSpend.length - 1][0], 'סך הכל');
  assert.equal(reportToSheetRows(r, false)[0].length, 6);
});

console.log(`${n} passed`);
