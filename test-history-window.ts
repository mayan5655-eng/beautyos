// The dashboard reads the recent window first and the older history in the background (lib/historyWindow.js, loadHistory in beautyos.jsx).
// Pins: the window covers the six-month chart, merging never loses or duplicates a row, and everything that needs the whole history waits for it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HISTORY_DAYS, historyCutoff, mergeById } from './lib/historyWindow.js';

// ── the window ──
assert.ok(HISTORY_DAYS >= 186, 'covers the revenue chart: five calendar months back plus the current one is at most ~186 days');
assert.deepEqual(historyCutoff(new Date(2026, 9, 18)).date, '2026-04-11', '190 days before 18 Oct 2026');
assert.deepEqual(historyCutoff(new Date(2026, 0, 5)).date, '2025-06-29', 'crosses a year boundary');
const c = historyCutoff(new Date(2026, 9, 18));
assert.ok(!Number.isNaN(Date.parse(c.iso)) && c.iso.startsWith('2026-04-1'), 'the timestamp form is a real instant on the same day');

// the chart's oldest month start is inside the window on every day of the year
for (let day = 0; day < 366; day++) {
  const now = new Date(2026, 0, 1 + day);
  const oldestMonthStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const cut = historyCutoff(now);
  const cutDate = new Date(cut.date + 'T00:00:00');
  assert.ok(oldestMonthStart >= cutDate, `chart window inside the recent window on ${now.toDateString()}`);
}

// ── merging ──
const recent = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }];
const older = [{ id: 'b', v: 'stale' }, { id: 'c', v: 3 }];
assert.deepEqual(mergeById(recent, older), [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 3 }], 'newer rows win, nothing duplicated, nothing reordered');
assert.equal(mergeById(recent, []), recent, 'nothing to add returns the same array (no needless re-render)');
assert.deepEqual(mergeById(undefined, [{ id: 'x' }]), [{ id: 'x' }]);
assert.deepEqual(mergeById([{ id: 1 }], [{ id: '1' }]), [{ id: 1 }], 'ids compare as text (uuid or number)');
assert.equal(mergeById([{ id: 'a' }], [{ v: 1 }, { v: 2 }]).length, 3, 'rows without an id are all kept');

// ── the dashboard wiring ──
const src = fs.readFileSync('app/beautyos.jsx', 'utf8').replace(/\r\n/g, '\n');
const start = src.indexOf('const loadAll = async () => {');
const loadAll = src.slice(start, src.indexOf('// === CALCULATIONS ===', start));
assert.ok(loadAll.includes('readAllRows(supabase, "appointments", { filter: (q) => q.gte("date", bootCut.date) })'), 'boot reads only the recent appointments');
assert.ok(loadAll.includes('readAllRows(supabase, "receipts", { filter: (q) => q.gte("created_at", bootCut.iso) })'), 'boot reads only the recent payments');
assert.ok(!/readAllRows\(supabase, "leads"/.test(loadAll), 'leads are not read on the boot path');
assert.ok(loadAll.indexOf('loadHistory();') > loadAll.indexOf('setLoadError(null);'), 'the history starts only after the core load succeeded');

const hStart = src.indexOf('const loadHistory = async () => {');
const hist = src.slice(hStart, src.indexOf('const verifySession', hStart));
assert.ok(hist.includes('q.lt("date", cut.date)') && hist.includes('q.lt("created_at", cut.iso)'), 'the background read is exactly the complement of the window');
assert.ok(hist.includes('mergeById(prev, oa.data)') && hist.includes('mergeById(prev, orc.data)'), 'older rows are merged by id, not assigned over what is on screen');
assert.ok(/r\.complete !== false/.test(hist), 'a partial read is never merged in as if it were the whole history');
assert.ok(hist.includes('history: okRead(oa) && okRead(orc) ? "ok" : "error"'), 'a failed or partial history is "error" (with a retry), never "ok"');
assert.ok(hist.includes('captureException'), 'and it is reported');

// everything that needs the whole history waits for it
assert.ok(/coldClients\s*=\s*useMemo\(\(\) => historyReady \?/.test(src) && /activeClients\s*=\s*useMemo\(\(\) => historyReady \?/.test(src), 'cold and active client lists stay empty until the history is in (a client last seen long ago would read as "new")');
assert.ok(src.includes('{activeTab==="insights"&&!historyReady&&') && src.includes('{activeTab==="insights"&&historyReady&&(<>'), 'the insights screen is gated on the history');
const taxStart = src.indexOf('{activeTab==="tax"&&(()=>{');
assert.ok(/if \(!historyReady\) return <div className="glass-card"/.test(src.slice(taxStart, taxStart + 1800)), 'the tax screen is gated on the history');
assert.ok(src.includes('{activeTab==="leads"&&deferred.leads!=="ok"&&') && src.includes('{activeTab==="leads"&&deferred.leads==="ok"&&(<>'), 'the leads screen is gated on the leads');
assert.ok(src.includes('{historyReady&&deferred.leads==="ok"&&clients.length===0&&appointments.length===0&&leads.length===0&&services.length===0&&('), 'a "brand new account" empty state is never shown before the older rows and the leads are known');
assert.ok(src.includes('{historyReady&&appointments.length===0&&('), 'the empty calendar message waits too');
assert.ok(src.includes('(clientTab==="history"||clientTab==="receipts")&&!historyReady'), "a client's visit and payment history waits for the history");
assert.ok(src.includes('data-testid="history-strip"') && src.includes('onClick={loadHistory}'), 'a status strip says the history is loading, and offers a retry if it fails');
assert.ok(/setDeferred\(prev => \(\{\s*\.\.\.prev,\s*forms:/.test(src), 'loadDeferred merges into the state, so it cannot erase the history and leads status');

console.log('history window: ok');
