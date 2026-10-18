'use client';

// app/GrowCashierCredit.jsx
//
// In the cashier, for a client under a Grow cancellation policy:
//   * a deposit she already paid for THIS appointment is deducted from the total automatically ("מקדמה ששולמה"), once;
//   * client credit (a deposit kept after a timely cancel, or left over from an earlier visit) can be deducted with one tap.
// It renders nothing when there is neither (and nothing at all while the Grow screens are off). The parent subtracts what is reported through
// onChange and tells /api/grow/deposit and /api/grow/credit after the receipt is saved.

import { useEffect, useState } from 'react';

const money = (n) => `₪${Math.round(Number(n) * 100) / 100}`;

export default function GrowCashierCredit({ appointmentId, clientId, onChange, pcTint }) {
  const [deposit, setDeposit] = useState(0);
  const [credit, setCredit] = useState(0);
  const [creditOn, setCreditOn] = useState(false);

  useEffect(() => {
    let alive = true;
    setDeposit(0); setCredit(0); setCreditOn(false);
    if (appointmentId) fetch(`/api/grow/deposit?appointmentId=${encodeURIComponent(appointmentId)}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive && j?.deposit?.amount > 0) setDeposit(j.deposit.amount); }).catch(() => {});
    if (clientId) fetch(`/api/grow/credit?clientId=${encodeURIComponent(clientId)}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive && j?.balance > 0) setCredit(j.balance); }).catch(() => {});
    return () => { alive = false; };
  }, [appointmentId, clientId]);

  useEffect(() => { onChange?.({ deposit, creditAvail: credit, creditOn }); }, [deposit, credit, creditOn]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!(deposit > 0) && !(credit > 0)) return null;
  return (
    <div data-testid="grow-cashier-credit" style={{ background: pcTint, borderRadius: 'var(--r-sm)', padding: '10px 12px', marginBottom: 10 }}>
      {deposit > 0 && <p data-testid="deposit-deducted" style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', marginBottom: credit > 0 ? 6 : 0 }}>מקדמה ששולמה מראש: {money(deposit)}. היא מנוכית מהסכום.</p>}
      {credit > 0 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer', fontSize: 'var(--t-sm)', color: 'var(--ink)' }}>
          <input type="checkbox" data-testid="credit-toggle" checked={creditOn} onChange={(e) => setCreditOn(e.target.checked)} style={{ width: 20, height: 20 }} />
          <span>קרדיט ללקוחה: {money(credit)}. לנכות מהסכום</span>
        </label>
      )}
    </div>
  );
}
