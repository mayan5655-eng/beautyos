'use client';

// app/FeeQuestions.jsx
//
// The one-tap question for a cancellation fee, in Hebrew: "לגבות ₪100 מדנה על ביטול מאוחר?" with "כן, לגבות" and "לוותר". It appears on the home
// screen (all open questions), in an appointment and on a client card (only theirs). NOTHING is charged without her tap: "כן" charges the client's
// saved card on HER Grow account (Grow issues the receipt); "לוותר" closes it without charging. Renders nothing while the Grow screens are off.

import { useState } from 'react';
import { useFees, feesChanged } from './useFees';

export default function FeeQuestions({ appointmentId, clientId, pc, pcTint, toast, onCharged, variant = 'inline' }) {
  const { items, hidden } = useFees();
  const [busy, setBusy] = useState('');
  if (hidden) return null;

  const mine = items.filter((f) => (!appointmentId || String(f.appointment_id) === String(appointmentId)) && (!clientId || String(f.client_id) === String(clientId)));
  if (mine.length === 0) return null;

  const decide = async (f, decision) => {
    if (busy) return;
    setBusy(f.id + decision);
    try {
      const r = await fetch('/api/grow/fees/decide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feeId: f.id, decision }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) { toast?.(j?.error || 'משהו נתקע, נסי שוב', 'error'); feesChanged(); return; }
      if (decision === 'charge') { toast?.('החיוב עבר והקבלה נרשמה'); onCharged?.(j.receiptId); }
      else if (decision === 'waive') toast?.('בסדר, לא גובים');
      else toast?.('ההחזר עבר');
      feesChanged();
    } finally { setBusy(''); }
  };

  // nowrap and no shrinking: the full label stays on one line and never gets squeezed below its text width at 360px and 390px (checked by scripts/smoke/fee-button.mjs)
  const btn = { minHeight: 44, borderRadius: 'var(--r-sm)', fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer', padding: '0 20px', fontSize: 'var(--t-sm)', whiteSpace: 'nowrap', flexShrink: 0 };
  return (
    <div data-testid="fee-questions" data-variant={variant} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: variant === 'home' ? 14 : 8 }}>
      {mine.map((f) => (
        <div key={f.id} role="group" aria-label={f.question || 'החזר מקדמה'} data-testid="fee-question" style={{ background: 'var(--surface)', border: `1px solid ${pc}`, borderRadius: 'var(--r-md)', padding: '12px 14px' }}>
          {f.kind === 'deposit_return' ? (
            <>
              <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>ההחזר של המקדמה (₪{f.amount}) ל{f.client_name || 'לקוחה'} לא עבר</p>
              <button type="button" disabled={!!busy} onClick={() => decide(f, 'retry-refund')} style={{ ...btn, background: pcTint, border: `1px dashed ${pc}`, color: 'var(--pc-text, var(--ink))' }}>ניסיון חוזר</button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>{f.question}</p>
              {f.service && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)', marginBottom: 8 }}>{f.service}</p>}
              {f.error && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', marginBottom: 8 }}>הניסיון הקודם לא עבר, אפשר לנסות שוב.</p>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" data-testid="fee-charge" disabled={!!busy} onClick={() => decide(f, 'charge')} style={{ ...btn, background: 'var(--ink)', border: 'none', color: 'var(--surface)' }}>{busy === f.id + 'charge' ? 'מחייבת…' : 'כן, לגבות'}</button>
                <button type="button" data-testid="fee-waive" disabled={!!busy} onClick={() => decide(f, 'waive')} style={{ ...btn, background: 'var(--surface)', border: '1px solid var(--line-2)', color: 'var(--ink)' }}>לוותר</button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
