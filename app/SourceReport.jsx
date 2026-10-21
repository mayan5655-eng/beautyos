'use client';

// app/SourceReport.jsx
//
// "Revenue by source", the report behind the lead sources: per source, leads, conversions, revenue, average
// revenue per lead and - when spend is known - cost per lead, cost per client, ROAS and ROI, with a bar chart and
// an Excel export. The arithmetic lives in lib/sourceReport.ts (tested); this file only draws it.
//
// Spend comes from /api/ad-spend (the Facebook daily pull plus what she types). While the table or the Facebook
// permission is missing the cost columns are simply absent and the report says why - it never shows a 0 that
// reads as "free".

import { useEffect, useMemo, useState } from 'react';
import { buildSourceReport, reportToSheetRows } from '@/lib/sourceReport';
import { sourceLabelHe } from '@/lib/leadSources';

const RANGES = [
  { key: 'month', label: 'החודש' },
  { key: '30', label: '30 ימים' },
  { key: '90', label: '90 ימים' },
  { key: 'all', label: 'הכל' },
];

const dayKey = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};
function rangeOf(key, now = new Date()) {
  if (key === 'all') return { from: null, to: null };
  const to = dayKey(now);
  if (key === 'month') return { from: dayKey(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  const days = Number(key);
  return { from: dayKey(new Date(now.getTime() - (days - 1) * 864e5)), to };
}

const money = (n) => `₪${Math.round(n).toLocaleString('he-IL')}`;
const fixed = (n, d = 1) => (n === null || n === undefined ? '—' : Number(n).toFixed(d));

export default function SourceReport({ leads, receipts, sourceList, pc, pcGrad, pcTint, toast, isDemo }) {
  const [range, setRange] = useState('month');
  const [spend, setSpend] = useState({ available: null, rows: [] });
  const [form, setForm] = useState({ day: dayKey(new Date()), source: 'פייסבוק', amount: '' });
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const r = useMemo(() => rangeOf(range), [range]);

  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams();
    if (r.from) q.set('from', r.from);
    if (r.to) q.set('to', r.to);
    fetch(`/api/ad-spend?${q}`)
      .then((x) => x.json())
      // "Not enabled" only when the server says so; a failed read is an error with a retry, not a missing feature.
      .then((j) => { if (alive) setSpend(j && j.success ? { available: j.available !== false, rows: j.rows || [] } : { available: 'error', rows: [] }); })
      .catch(() => { if (alive) setSpend({ available: 'error', rows: [] }); });
    return () => { alive = false; };
  }, [r.from, r.to, reloadKey]);

  const liveReceipts = useMemo(() => (receipts || []).map((x) => ({ client_id: x.client_id, amount: x.amount })), [receipts]);
  const report = useMemo(
    () => buildSourceReport(leads || [], liveReceipts, spend.rows.map((s) => ({ day: s.day, source: s.source, amount: s.amount })), r),
    [leads, liveReceipts, spend.rows, r],
  );
  const hasSpend = report.totals.spend > 0;
  const maxRevenue = Math.max(1, ...report.rows.map((x) => x.revenue));

  const exportXlsx = async () => {
    try {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.aoa_to_sheet(reportToSheetRows(report, hasSpend));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'הכנסות לפי מקור');
      const stamp = dayKey(new Date());
      XLSX.writeFile(wb, `הכנסות-לפי-מקור-${stamp}.xlsx`);
    } catch {
      toast?.('הייצוא נכשל, נסי שוב', 'error');
    }
  };

  const addSpend = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/ad-spend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ day: form.day, source: form.source, amount: Number(form.amount) }) });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.success) { toast?.(j?.error || 'השמירה נכשלה', 'error'); return; }
      toast?.('ההוצאה נשמרה');
      setForm((f) => ({ ...f, amount: '' }));
      setReloadKey((k) => k + 1);
    } catch {
      toast?.('אין חיבור. ההוצאה לא נשמרה, נסי שוב', 'error');
    } finally { setBusy(false); }
  };
  const removeSpend = async (id) => {
    try {
      const res = await fetch(`/api/ad-spend?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) setReloadKey((k) => k + 1); else toast?.('המחיקה נכשלה', 'error');
    } catch { toast?.('אין חיבור. המחיקה לא בוצעה, נסי שוב', 'error'); }
  };

  const chip = (active) => ({ padding: '6px 12px', borderRadius: 'var(--r-full)', border: `1px solid ${active ? pc : 'var(--line-2)'}`, background: active ? pcGrad : 'var(--surface)', color: active ? 'var(--pc-contrast)' : 'var(--ink-2)', fontSize: 'var(--t-sm)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' });
  const inp = { border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '8px 10px', fontSize: 'var(--t-sm)', fontFamily: 'inherit', background: 'var(--surface-2)', outline: 'none' };
  const manual = spend.rows.filter((s) => s.origin === 'manual').slice(0, 8);

  return (
    <div className="glass-card" data-testid="source-report" style={{ padding: 18, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <h3 className="serif" style={{ fontSize: 'var(--t-xl)', fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.01em' }}>הכנסות לפי מקור</h3>
        <button type="button" onClick={exportXlsx} disabled={report.rows.length === 0} style={{ ...chip(false), opacity: report.rows.length === 0 ? 0.5 : 1 }}>ייצוא לאקסל</button>
      </div>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)', lineHeight: 1.6, marginBottom: 12 }}>
        פניות שנרשמו בתקופה, וכמה הלקוחות שהן הפכו אליהן שילמו עד היום. הוצאת הפרסום היא של אותה תקופה.
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {RANGES.map((x) => <button key={x.key} type="button" onClick={() => setRange(x.key)} aria-pressed={range === x.key} style={chip(range === x.key)}>{x.label}</button>)}
      </div>

      {report.rows.length === 0 ? (
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.7 }}>אין עדיין פניות בתקופה הזו. כשתירשם פנייה, היא תופיע כאן עם מה שהיא הכניסה בפועל.</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, marginBottom: 14 }}>
            {[
              ['לידים', report.totals.leads],
              ['הפכו ללקוחות', `${report.totals.conversions} (${report.totals.conversionRate}%)`],
              ['הכנסות', money(report.totals.revenue)],
              ['ממוצע לליד', report.totals.avgRevenuePerLead === null ? '—' : money(report.totals.avgRevenuePerLead)],
              ...(hasSpend ? [
                ['הוצאת פרסום', money(report.totals.spend)],
                ['עלות ללקוחה', report.totals.costPerAcquisition === null ? '—' : money(report.totals.costPerAcquisition)],
                ['ROAS', report.totals.roas === null ? '—' : `${fixed(report.totals.roas)}x`],
                ['ROI', report.totals.roiPercent === null ? '—' : `${report.totals.roiPercent}%`],
              ] : []),
            ].map(([k, v]) => (
              <div key={k} style={{ background: pcTint, borderRadius: 'var(--r-md)', padding: '10px 12px' }}>
                <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', fontWeight: 600 }}>{k}</p>
                <p className="serif" style={{ fontSize: 'var(--t-lg)', fontWeight: 600, color: pc }}>{v}</p>
              </div>
            ))}
          </div>

          <div role="img" aria-label="הכנסות לפי מקור" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {report.rows.map((row) => (
              <div key={row.key} style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: row.key === '__unknown__' ? 'var(--ink-3)' : 'var(--ink)' }}>{row.label || sourceLabelHe(row.key)}</p>
                  <p className="serif" style={{ fontSize: 'var(--t-md)', fontWeight: 600, color: pc }}>{money(row.revenue)}</p>
                </div>
                <div style={{ background: 'var(--line)', borderRadius: 'var(--r-xs)', height: 7, margin: '6px 0', overflow: 'hidden' }}>
                  <div style={{ background: pcGrad, height: 7, width: `${Math.max(2, Math.round((row.revenue / maxRevenue) * 100))}%` }} />
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 'var(--t-xs)', color: 'var(--ink-3)' }}>
                  <span>{row.leads} לידים</span>
                  <span style={{ color: 'var(--success)' }}>{row.conversions} הפכו ללקוחות ({row.conversionRate}%)</span>
                  <span>ממוצע לליד {row.avgRevenuePerLead === null ? '—' : money(row.avgRevenuePerLead)}</span>
                  {row.spend > 0 && <span>הוצאה {money(row.spend)}</span>}
                  {row.costPerAcquisition !== null && <span>עלות ללקוחה {money(row.costPerAcquisition)}</span>}
                  {row.roas !== null && <span style={{ fontWeight: 700, color: row.roas >= 1 ? 'var(--success)' : 'var(--danger)' }}>ROAS {fixed(row.roas)}x · ROI {row.roiPercent}%</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
        <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>הוצאות פרסום</p>
        {spend.available === 'error' ? (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)', lineHeight: 1.6 }}>
            לא הצלחנו לטעון את הוצאות הפרסום.{' '}
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} style={{ border: 'none', background: 'none', color: pc, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0, textDecoration: 'underline' }}>לנסות שוב</button>
          </p>
        ) : spend.available === false ? (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)', lineHeight: 1.6 }}>
            עוד לא הופעל מעקב הוצאות בחשבון, ולכן עלות לליד ו-ROI לא מוצגים. ההכנסות לפי מקור כבר מדויקות.
          </p>
        ) : (
          <>
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)', lineHeight: 1.6, marginBottom: 8 }}>
              הוצאות פייסבוק נמשכות לבד כשהחיבור מאושר. את יכולה להוסיף כאן גם הוצאות אחרות (גוגל, פלייר, השתתפות בתערוכה).
            </p>
            {!isDemo && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <input type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} aria-label="תאריך" style={inp} />
                <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} aria-label="מקור" style={inp}>
                  {[...new Set([...(sourceList || []), 'פייסבוק'])].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="סכום ב-₪" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} aria-label="סכום" style={{ ...inp, width: 110 }} />
                <button type="button" onClick={addSpend} disabled={busy || !form.amount} style={chip(false)}>הוספת הוצאה</button>
              </div>
            )}
            {manual.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {manual.map((s) => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--t-sm)', color: 'var(--ink-2)' }}>
                    <span>{s.day} · {s.source} · {money(Number(s.amount))}</span>
                    <button type="button" onClick={() => removeSpend(s.id)} aria-label="הסרת הוצאה" style={{ border: 'none', background: 'none', color: 'var(--ink-3)', cursor: 'pointer' }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
