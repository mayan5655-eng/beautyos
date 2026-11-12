'use client';

// app/MembershipTill.jsx
//
// In the till, for a client with a membership: "יש לה מנוי: נשארו 1 מתוך 2" and one tap to cover a treatment on this receipt with a
// credit instead of charging. OFF until she taps it (a credit leaving the balance without being asked for is the one thing this must
// never do). One credit per receipt, on the first treatment the plan covers. The parent subtracts the covered price and, after the
// receipt is saved, tells /api/memberships (action redeem), which uses the credit once for that receipt.
// Renders NOTHING unless the flag is on and the client has a membership with credits (or one that is waiting for a payment).

import { useEffect, useMemo, useState } from 'react';
import { clientMembershipsEnabled } from '@/lib/membershipFlag';

export default function MembershipTill({ clientId, items = [], blocked = false, onChange, pc = 'var(--pc)', pcGrad, pcDeep = 'var(--pc-deep)' }) {
  const on = clientMembershipsEnabled();
  const [m, setM] = useState(null);
  const [use, setUse] = useState(false);

  useEffect(() => {
    let alive = true;
    setM(null); setUse(false);
    if (!on || !clientId) return () => { alive = false; };
    fetch(`/api/memberships?view=till&clientId=${encodeURIComponent(clientId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.success && j.available && j.membership) setM(j.membership); })
      .catch(() => {});
    return () => { alive = false; };
  }, [on, clientId]);

  // The treatment a credit covers: the first non-product line the plan includes (no list on the plan = any treatment).
  const item = useMemo(() => {
    if (!m) return null;
    const svc = Array.isArray(m.services) ? m.services : [];
    return (items || []).find((i) => i && i.kind !== 'product' && (!svc.length || svc.includes(String(i.name || '').trim()))) || null;
  }, [m, items]);
  const canUse = !!m && m.available > 0 && !!item && !blocked;
  const active = use && canUse;

  useEffect(() => { if (use && !canUse) setUse(false); }, [use, canUse]);
  useEffect(() => {
    onChange?.(active ? { membershipId: m.id, service: String(item.name || ''), price: Number(item.price) || 0, planName: m.planName } : null);
  }, [active, m?.id, item?.name, item?.price]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!on || !m) return null;
  return (
    <div data-testid="membership-till" style={{ background: active ? 'var(--pc-tint)' : 'var(--surface-2)', border: `1px solid ${active ? pc : 'var(--line-2)'}`, borderRadius: 'var(--r-sm)', padding: '11px 12px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)' }}>יש לה מנוי: {m.label}</p>
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)' }}>{m.planName}{m.status === 'past_due' || m.status === 'attention' ? ' · החיוב החודשי ממתין' : m.status === 'paused' ? ' · מושהה' : ''}</p>
        </div>
        {m.available > 0 && <button type="button" data-testid="membership-till-toggle" disabled={!canUse} onClick={() => setUse((v) => !v)} style={{ background: active ? pcGrad || pc : 'var(--surface)', color: active ? 'var(--pc-contrast)' : pcDeep, border: active ? 'none' : '1px solid var(--line-2)', borderRadius: 'var(--r-lg)', padding: '7px 14px', minHeight: 40, fontSize: 'var(--t-sm)', fontWeight: 700, cursor: canUse ? 'pointer' : 'not-allowed', opacity: canUse ? 1 : 0.6, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>{active ? '✓ מהמנוי' : 'לנכות מהמנוי'}</button>}
      </div>
      {active && <p style={{ fontSize: 'var(--t-xs)', color: pcDeep, marginTop: 6, lineHeight: 1.5 }}>{item.name} ינוכה מהמנוי עם רישום התשלום.</p>}
      {m.available > 0 && !item && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', marginTop: 6 }}>הוסיפי לקופה טיפול שכלול במנוי{Array.isArray(m.services) && m.services.length ? ` (${m.services.join(', ')})` : ''}.</p>}
      {m.available > 0 && item && blocked && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', marginTop: 6 }}>הטיפול הזה כבר מנוכה מחבילה.</p>}
    </div>
  );
}
