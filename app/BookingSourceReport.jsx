'use client';
// app/BookingSourceReport.jsx
//
// "מאיפה הגיעו התורים": bookings and the money they brought, per channel, from the ?src= / ?ref= the booking carried
// (lib/bookingSource.ts). Next to the leads report (app/SourceReport.jsx), which only sees leads. Plus the clients who brought
// friends through their personal link, so she knows whom to thank. Nothing here is estimated: a booking with no tag says so.
import { useMemo, useState } from 'react';
import { bookingsBySource, referralCounts } from '@/lib/bookingSource';

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const RANGES = [['month', 'החודש'], ['90', '90 יום'], ['year', 'השנה']];
function rangeOf(k, now = new Date()) {
  const to = dayKey(now);
  if (k === 'month') return { from: dayKey(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  if (k === 'year') return { from: `${now.getFullYear()}-01-01`, to };
  return { from: dayKey(new Date(now.getTime() - 89 * 864e5)), to };
}
const money = (n) => `₪${Math.round(Number(n) || 0).toLocaleString('he-IL')}`;

export default function BookingSourceReport({ appointments, receipts, clients, pc, pcTint }) {
  const [range, setRange] = useState('month');
  const r = useMemo(() => rangeOf(range), [range]);
  const rows = useMemo(() => bookingsBySource(appointments || [], receipts || [], r.from, r.to), [appointments, receipts, r]);
  const top = useMemo(() => {
    const m = referralCounts(clients || []);
    return [...m.entries()].map(([id, n]) => ({ id, n, name: (clients || []).find((c) => String(c.id) === id)?.name || '' }))
      .filter((x) => x.name).sort((a, b) => b.n - a.n).slice(0, 5);
  }, [clients]);
  const tagged = rows.filter((x) => x.key !== '__none__').reduce((a, x) => a + x.bookings, 0);
  const chip = (on) => ({ padding: '6px 12px', minHeight: 36, borderRadius: 'var(--r-full)', border: `1px solid ${on ? pc : 'var(--line-2)'}`, background: on ? pcTint : 'transparent', color: 'var(--ink)', fontWeight: on ? 700 : 500, fontSize: 'var(--t-xs)', cursor: 'pointer', fontFamily: 'inherit' });

  return (
    <div data-testid="booking-source-report" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '14px 16px', marginTop: 14 }}>
      <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>מאיפה הגיעו התורים</p>
      <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', lineHeight: 1.6, marginBottom: 10 }}>לפי הקישור שממנו נקבע התור. כדי שזה יעבוד, העתיקי את הקישור לפי המקום (הגדרות ← הדף שלי ← הקישורים שלך). פוסטים, הודעות וואטסאפ וקישורי חברה מביאה חברה מסומנים לבד.</p>
      <div role="radiogroup" aria-label="תקופה" style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {RANGES.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={range === k} style={chip(range === k)} onClick={() => setRange(k)}>{l}</button>)}
      </div>
      {rows.length === 0 ? (
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)' }}>אין תורים בתקופה הזו.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((x) => (
            <div key={x.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 'var(--t-sm)', color: x.key === '__none__' ? 'var(--ink-3)' : 'var(--ink)', background: x.key === '__none__' ? 'transparent' : pcTint, borderRadius: 'var(--r-sm)', padding: '8px 10px' }}>
              <span style={{ fontWeight: 600 }}>{x.label}</span>
              <span>{x.bookings === 1 ? 'תור אחד' : `${x.bookings} תורים`}{x.revenue > 0 ? ` · ${money(x.revenue)}` : ''}</span>
            </div>
          ))}
        </div>
      )}
      {rows.length > 0 && tagged === 0 && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginTop: 8 }}>עוד אין תורים מסומנים. מהיום, תורים מקישורים מסומנים יופיעו כאן לפי מקור.</p>}
      {top.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>הביאו חברות 💛</p>
          {top.map((t) => <p key={t.id} style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)' }}>{t.name}: {t.n === 1 ? 'חברה אחת' : `${t.n} חברות`}</p>)}
        </div>
      )}
    </div>
  );
}
