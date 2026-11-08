'use client';
// app/VoucherRedeemTill.jsx
//
// In the till: "שובר מתנה". She types (or scans into the field) the code, sees the balance, and uses part or all of it on this
// sale. Using it is like swiping a gift card: the amount comes off the voucher AT ONCE, inside the database (app/api/vouchers
// action 'redeem', gift_voucher_redeem: one conditional update with this attempt's own key, so a double tap or a second till cannot
// spend it twice). The till then takes that amount off what the client pays, exactly like client credit, so it is never counted as
// income again: the money was counted the day the voucher was sold.
// If the sale does not go ahead, "ביטול הניצול" gives the amount back (action 'reverse'). One left behind by a till that was simply
// closed shows in the vouchers list as "בלי תשלום רשום", with the same button.
import { useState } from 'react';
import { useVouchersReady } from './useVouchersReady';
import { formatCode, voucherTitle, dateHe, usableAmount, voucherOverUsed, VOUCHER_OVER_USED_HE, REFUSAL_HE } from '@/lib/giftVouchers';

const money = (n) => `₪${(Math.round(Number(n) * 100) / 100).toLocaleString('he-IL')}`;
const newKey = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');

export default function VoucherRedeemTill({ due, applied, onApplied, onCleared, toast, pc, pcTint, isDemo }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [found, setFound] = useState(null); // { voucher, status, refusal }
  const [use, setUse] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [key, setKey] = useState(newKey);
  const { ready } = useVouchersReady(true);

  const inp = { flex: 1, minWidth: 0, boxSizing: 'border-box', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '10px 12px', fontSize: 16, fontFamily: 'inherit', outline: 'none', background: 'var(--surface)', color: 'var(--ink)', minHeight: 44 };
  const btn = { padding: '10px 14px', minHeight: 44, borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontWeight: 700, fontSize: 'var(--t-sm)', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 };
  const post = async (body) => {
    const r = await fetch('/api/vouchers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    return { ok: r.ok && !!j?.success, j: j || {} };
  };

  // Not installed yet (the migration has not run): no button at all (owner decision, 2026-11-08).
  if (ready !== true && !applied) return null;
  if (applied) {
    const over = voucherOverUsed(applied, due);
    return (
      <div data-testid="voucher-till-applied" style={{ background: pcTint, borderRadius: 'var(--r-sm)', padding: '10px 12px', marginBottom: 10 }}>
        <p style={{ margin: 0, fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)' }}>🎁 שובר <span dir="ltr">{formatCode(applied.code)}</span>: {money(applied.amount)} ירדו מהתשלום</p>
        <p style={{ margin: '2px 0 0', fontSize: 'var(--t-xs)', color: 'var(--ink-2)' }}>נשארו בשובר {money(applied.balanceAfter)}.</p>
        {over && <p role="alert" data-testid="voucher-till-over" style={{ margin: '4px 0 0', fontSize: 'var(--t-xs)', color: 'var(--danger)' }}>{VOUCHER_OVER_USED_HE}</p>}
        <button type="button" disabled={busy || isDemo} data-testid="voucher-till-undo" style={{ ...btn, minHeight: 36, padding: '6px 12px', marginTop: 6 }} onClick={async () => {
          setBusy(true);
          try {
            const { ok, j } = await post({ action: 'reverse', ledgerId: applied.ledgerId });
            if (!ok) { toast?.(j.error || 'לא הצלחנו להחזיר את הסכום לשובר', 'error'); return; }
            toast?.('הסכום חזר לשובר');
            onCleared?.();
            setFound(null); setCode(''); setUse(''); setKey(newKey());
          } finally { setBusy(false); }
        }}>ביטול הניצול</button>
      </div>
    );
  }

  if (!open) {
    return <button type="button" data-testid="voucher-till-open" onClick={() => setOpen(true)} style={{ ...btn, width: '100%', marginBottom: 10, borderStyle: 'dashed', color: 'var(--ink-2)' }}>🎁 תשלום בשובר מתנה</button>;
  }

  const lookup = async () => {
    setErr(''); setFound(null);
    if (!code.trim()) return;
    setBusy(true);
    try {
      const { ok, j } = await post({ action: 'lookup', code });
      if (j.needsMigration) { setErr(j.error); return; }
      if (!ok) { setErr(j.error || REFUSAL_HE.not_found); return; }
      setFound(j);
      setUse(String(usableAmount(j.voucher?.balance, due)));
    } finally { setBusy(false); }
  };
  const v = found?.voucher;
  const max = v ? usableAmount(v.balance, due) : 0;
  const amount = Math.round(Number(use) * 100) / 100;
  const canUse = v && !found.refusal && amount > 0 && amount <= max + 0.005 && !busy && !isDemo;

  const redeem = async () => {
    if (!canUse) return;
    setBusy(true);
    try {
      const { ok, j } = await post({ action: 'redeem', voucherId: v.id, amount, key });
      if (!ok) { setErr(j.error || 'לא הצלחנו לממש את השובר'); if (j.refusal) setKey(newKey()); return; }
      onApplied?.({ ledgerId: j.ledgerId, voucherId: v.id, code: v.code, amount, balanceAfter: j.balance });
      setOpen(false);
    } finally { setBusy(false); }
  };

  return (
    <div data-testid="voucher-till" style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', padding: '10px 12px', marginBottom: 10, border: '1px solid var(--line)' }}>
      <p style={{ margin: '0 0 6px', fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)' }}>🎁 תשלום בשובר מתנה</p>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={code} onChange={(e) => { setCode(e.target.value); setFound(null); setErr(''); }} onKeyDown={(e) => { if (e.key === 'Enter') lookup(); }}
          placeholder="קוד השובר, למשל K7M4-X9Q2" aria-label="קוד השובר" autoCapitalize="characters" autoComplete="off" spellCheck={false} style={{ ...inp, direction: 'ltr', textAlign: 'right', letterSpacing: '0.06em' }} />
        <button type="button" data-testid="voucher-till-lookup" disabled={busy || !code.trim()} onClick={lookup} style={btn}>{busy && !found ? 'בודקת…' : 'בדיקה'}</button>
      </div>
      {err && <p role="alert" style={{ margin: '6px 0 0', fontSize: 'var(--t-sm)', color: 'var(--danger)', lineHeight: 1.5 }}>{err}</p>}
      {v && (
        <div data-testid="voucher-till-found" style={{ marginTop: 8 }}>
          <p style={{ margin: 0, fontSize: 'var(--t-sm)', color: 'var(--ink)' }}><b>{voucherTitle(v)}</b>{v.recipient_name ? ` · ל${v.recipient_name}` : ''}</p>
          <p style={{ margin: '2px 0 0', fontSize: 'var(--t-xs)', color: 'var(--ink-2)' }}>יתרה {money(v.balance)} · בתוקף עד {dateHe(v.expires_at)}</p>
          {found.refusal ? (
            <p role="alert" style={{ margin: '6px 0 0', fontSize: 'var(--t-sm)', color: 'var(--danger)', fontWeight: 700 }}>{found.refusal}</p>
          ) : max <= 0 ? (
            <p style={{ margin: '6px 0 0', fontSize: 'var(--t-sm)', color: 'var(--ink-2)' }}>אין כרגע מה לשלם. הוסיפי קודם את הטיפול לקופה.</p>
          ) : (
            <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
              <input value={use} onChange={(e) => setUse(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" aria-label="כמה לממש מהשובר" style={{ ...inp, direction: 'ltr', textAlign: 'right' }} />
              <button type="button" data-testid="voucher-till-apply" disabled={!canUse} onClick={redeem} style={{ ...btn, background: pc, color: 'var(--pc-contrast, #1F3A30)', border: 'none', opacity: canUse ? 1 : 0.55 }}>{busy ? 'מממשת…' : `ניצול ${money(amount || 0)}`}</button>
            </div>
          )}
          {!found.refusal && max > 0 && amount > max + 0.005 && <p style={{ margin: '4px 0 0', fontSize: 'var(--t-xs)', color: 'var(--danger)' }}>אפשר לממש עד {money(max)}.</p>}
          {!found.refusal && max > 0 && <p style={{ margin: '4px 0 0', fontSize: 'var(--t-xs)', color: 'var(--ink-3)', lineHeight: 1.5 }}>הסכום יורד מהשובר מיד. אם התשלום לא יתבצע, אפשר להחזיר אותו בלחיצה.</p>}
        </div>
      )}
      <button type="button" onClick={() => { setOpen(false); setFound(null); setErr(''); setCode(''); }} style={{ ...btn, minHeight: 32, padding: '4px 10px', marginTop: 8, fontWeight: 500 }}>סגירה</button>
    </div>
  );
}
