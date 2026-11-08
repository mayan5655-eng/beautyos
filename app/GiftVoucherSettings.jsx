'use client';
// app/GiftVoucherSettings.jsx
//
// Settings > העסק שלי: gift vouchers. What she offers (fixed amounts, and optionally some of her treatments at their price), how
// long a voucher is valid, a short personal line for the voucher page, and whether visitors can buy one on her public page.
// Stored in automations.gift_vouchers (lib/giftVouchers.ts voucherStored), so nothing to migrate; saved with the rest of Settings.
// Shown only when the platform flag is on (beautyos.jsx checks giftVouchersVisible).
import { useState } from 'react';
import { voucherConfig, voucherStored, MIN_AMOUNT, MAX_AMOUNT, MAX_NOTE } from '@/lib/giftVouchers';

const VALIDITY = [3, 6, 12, 24, 36];

export default function GiftVoucherSettings({ automations, services, pc, pcTint, onChange }) {
  const autos = automations && typeof automations === 'object' ? automations : {};
  const cfg = voucherConfig({ automations: autos });
  const [add, setAdd] = useState('');
  // What she is typing, as typed: the stored copy is cleaned (spaces collapsed and trimmed), which would eat the space she just typed.
  const [note, setNote] = useState(cfg.note);
  const set = (patch) => onChange({ ...autos, gift_vouchers: voucherStored({ ...cfg, ...patch }) });
  const priced = (services || []).filter((s) => s && s.active !== false && Number(s.price) >= MIN_AMOUNT && Number(s.price) <= MAX_AMOUNT);

  const chip = (on) => ({ padding: '8px 12px', minHeight: 40, borderRadius: 'var(--r-full)', border: `1px solid ${on ? pc : 'var(--line-2)'}`, background: on ? pcTint : 'transparent', color: 'var(--ink)', fontWeight: on ? 700 : 500, fontSize: 'var(--t-sm)', cursor: 'pointer', fontFamily: 'inherit' });
  const inp = { boxSizing: 'border-box', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '10px 12px', fontSize: 16, fontFamily: 'inherit', outline: 'none', background: 'var(--surface-2)', color: 'var(--ink)', minHeight: 44 };
  const addAmount = () => {
    const n = Math.round(Number(add));
    if (!(n >= MIN_AMOUNT && n <= MAX_AMOUNT)) return;
    set({ amounts: [...cfg.amounts, n] });
    setAdd('');
  };

  return (
    <div className="glass-card" data-testid="gift-voucher-settings" style={{ padding: '14px 16px', marginBottom: 14 }}>
      <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', margin: '0 0 4px' }}>🎁 שוברי מתנה</p>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.65, margin: '0 0 12px' }}>
        לקוחות קונות שובר לחברה, והחברה מממשת אותו אצלך בקופה. את מוכרת שובר בקופה מתי שתרצי, ואם Grow מחובר אפשר לקנות גם אונליין מהדף שלך.
      </p>

      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 44, cursor: 'pointer' }}>
        <span style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)' }}>מכירה אונליין בדף העסק שלך</span>
        <input type="checkbox" role="switch" data-testid="gv-enabled" checked={cfg.enabled} onChange={() => set({ enabled: !cfg.enabled })} style={{ width: 22, height: 22, accentColor: pc }} />
      </label>
      <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', lineHeight: 1.6, margin: '0 0 12px' }}>
        כשזה פועל ו-Grow מחובר, בדף העסק מופיע כפתור "שובר מתנה". הקונה משלמת דרך Grow, והשובר נוצר רק אחרי ש-Grow מאשר את התשלום. בלי Grow, הדף מציע לקנות שובר אצלך בעסק.
      </p>

      <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', margin: '0 0 6px' }}>סכומים</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {cfg.amounts.map((a) => (
          <button key={a} type="button" aria-label={`הסרת ₪${a}`} style={chip(true)} onClick={() => set({ amounts: cfg.amounts.filter((x) => x !== a) })}>₪{a.toLocaleString('he-IL')} ✕</button>
        ))}
        {cfg.amounts.length < 6 && (
          <span style={{ display: 'inline-flex', gap: 6 }}>
            <input value={add} onChange={(e) => setAdd(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAmount(); } }} inputMode="numeric" placeholder="₪" aria-label="סכום חדש" style={{ ...inp, width: 84, direction: 'ltr', textAlign: 'right' }} />
            <button type="button" style={chip(false)} onClick={addAmount}>הוספה</button>
          </span>
        )}
      </div>
      {cfg.amounts.length === 0 && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', margin: '4px 0 0' }}>אין סכומים קבועים. אפשר להשאיר רק טיפולים, או להוסיף סכום.</p>}

      {priced.length > 0 && (
        <>
          <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', margin: '12px 0 6px' }}>שובר לטיפול (לא חובה)</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {priced.slice(0, 30).map((s) => {
              const id = String(s.id);
              const on = cfg.services.includes(id);
              return <button key={id} type="button" role="checkbox" aria-checked={on} style={chip(on)} onClick={() => set({ services: on ? cfg.services.filter((x) => x !== id) : [...cfg.services, id] })}>{s.name} · ₪{Math.round(Number(s.price))}</button>;
            })}
          </div>
          <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', lineHeight: 1.6, margin: '4px 0 0' }}>המחיר נלקח מהמחירון שלך ברגע הקנייה, ושווי השובר הוא הסכום ששולם.</p>
        </>
      )}

      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12 }}>
        <span style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)' }}>תוקף השובר</span>
        <select value={cfg.validityMonths} onChange={(e) => set({ validityMonths: Number(e.target.value) })} aria-label="תוקף השובר" style={{ ...inp, padding: '0 10px' }}>
          {[...new Set([...VALIDITY, cfg.validityMonths])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{m} חודשים</option>)}
        </select>
      </label>

      <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', margin: '12px 0 6px' }}>מילה אישית בדף השובר</p>
      <textarea value={note} onChange={(e) => { const t = e.target.value.slice(0, MAX_NOTE); setNote(t); set({ note: t }); }} maxLength={MAX_NOTE} rows={2} placeholder="למשל: מחכה לפנק אותך, תאמי איתי תור בוואטסאפ" aria-label="מילה אישית בדף השובר" style={{ ...inp, width: '100%', resize: 'vertical' }} />
      <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', lineHeight: 1.6, margin: '6px 0 0' }}>
        שובר שנמכר נספר בהכנסות ביום המכירה. כשמממשים אותו בקופה הוא יורד מהתשלום ולא נספר שוב, ומכירת שובר לא נחשבת ביקור בכרטיסיית הנאמנות.
      </p>
    </div>
  );
}
