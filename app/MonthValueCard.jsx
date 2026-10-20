'use client';
// app/MonthValueCard.jsx
//
// On "היום": what Kalmea did for her this month, counted only from what the app recorded (lib/monthValue.ts): bookings clients
// made themselves through the link and what was paid for them, WhatsApp confirmations, new clients. Shows nothing at all when
// there is nothing true to say yet, so a new business never sees a row of zeros.
import { useMemo } from 'react';
import { monthValue, monthOf, monthValueLines } from '@/lib/monthValue';

export default function MonthValueCard({ appointments, receipts, clients, ready, style }) {
  const lines = useMemo(() => {
    if (!ready) return [];
    return monthValueLines(monthValue({ appointments, receipts, clients, month: monthOf(new Date()) }));
  }, [appointments, receipts, clients, ready]);
  if (lines.length === 0) return null;
  return (
    <section className="glass-card card-boxed" aria-label="מה קלמיה עשתה בשבילך החודש" data-testid="month-value"
      style={{ padding: '14px 17px', marginBottom: 12, maxWidth: 1180, marginInline: 'auto', width: '100%', boxSizing: 'border-box', ...style }}>
      <p style={{ fontFamily: "var(--font-frank),'Frank Ruhl Libre',serif", fontWeight: 700, fontSize: 17, color: 'var(--ink)', margin: '0 0 8px' }}>
        מה קלמיה עשתה בשבילך החודש
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
        {lines.map((l) => (
          <div key={l.key} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px' }}>
            <div style={{ fontFamily: "var(--font-frank),'Frank Ruhl Libre',serif", fontSize: 24, fontWeight: 700, color: 'var(--pc-deep, var(--ink))', lineHeight: 1.1 }}>{l.big}</div>
            <div style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.45, marginTop: 2 }}>{l.text}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
