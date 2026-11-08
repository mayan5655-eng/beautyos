'use client';

// app/PaymentsSettings.jsx
//
// Settings > תשלומים: the ONE place for deposits. Before this, a deposit was set in three screens that did not mention each other:
//   1. the deposit she takes herself (Bit, cash), in "יומן ושירותים" > booking rules (branding.booking_rules.deposit_amount / deposit_note);
//   2. the deposit charged by card through Grow, inside the Grow card in "חיבורים" (CancelPolicyCard, /api/grow/policy);
//   3. which treatments ask for the Grow deposit, on each service (services.requires_deposit).
// Now 1 and 2 are edited here, and the other screens link here. Same stored fields as before: no schema change. The per-service
// switch stays on each service (it is a property of the treatment) and this screen points to it.
import CancelPolicyCard from './CancelPolicyCard';
import { useGrowPolicy } from './useGrowPolicy';

export default function PaymentsSettings({ rules, setRule, pc, pcTint, toast, isDemo, onOpenServices }) {
  const { loaded, connected, mode } = useGrowPolicy();
  const r = rules && typeof rules === 'object' ? rules : {};
  const amount = Number(r.deposit_amount) > 0 ? Number(r.deposit_amount) : 0;
  const box = { padding: '12px 14px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)', background: 'var(--surface-2)', marginTop: 10 };
  const sel = { border: '1px solid var(--line-2)', borderRadius: 'var(--r-xs)', padding: '7px 8px', fontSize: 'var(--t-md)', fontFamily: 'inherit', background: 'var(--surface)', minHeight: 40, boxSizing: 'border-box' };
  const small = { fontSize: 'var(--t-xs)', color: 'var(--ink-3)', lineHeight: 1.5, margin: 0 };
  const link = { background: 'none', border: 'none', padding: '8px 0', minHeight: 40, color: 'var(--pc-deep, var(--ink))', fontWeight: 700, fontSize: 'var(--t-sm)', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' };

  return (
    <div data-testid="payments-settings">
      <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>מקדמות</p>
      <p style={{ ...small, marginTop: 2 }}>כל מה שקשור למקדמה בקביעת תור נמצא כאן, במקום אחד.</p>

      <div data-testid="deposit-direct" style={box}>
        <p style={{ fontSize: 'var(--t-md)', fontWeight: 600, color: 'var(--ink)', margin: '0 0 2px' }}>מקדמה שמשולמת אלייך ישירות</p>
        <p style={{ ...small, marginBottom: 10 }}>למשל בביט או במזומן. הלקוחה רואה את הסכום בדף ההזמנה ומאשרת לפני שהתור נקבע. המערכת לא גובה אותה.</p>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 'var(--t-sm)', color: 'var(--ink-2)' }}>
          <span>מקדמה בקביעת תור (₪)</span>
          <input type="number" min="0" max="5000" inputMode="numeric" aria-label="מקדמה" value={amount > 0 ? amount : ''} placeholder="ללא"
            onChange={(e) => setRule({ deposit_amount: e.target.value === '' ? 0 : Math.max(0, Math.min(5000, Math.round(Number(e.target.value) || 0))) })} style={{ ...sel, width: 96 }} />
        </label>
        {amount > 0 && (
          <input aria-label="איך משלמים מקדמה" maxLength={200} value={typeof r.deposit_note === 'string' ? r.deposit_note : ''} onChange={(e) => setRule({ deposit_note: e.target.value })}
            placeholder="איך משלמים: למשל, ביט ל-050-0000000" style={{ ...sel, width: '100%', marginTop: 8 }} />
        )}
      </div>

      {loaded && connected && (
        <div data-testid="deposit-grow" style={{ marginTop: 4 }}>
          <p style={{ fontSize: 'var(--t-md)', fontWeight: 600, color: 'var(--ink)', margin: '12px 0 0' }}>מקדמה באשראי דרך Grow</p>
          <p style={small}>בוחרים &quot;מקדמה בקביעת התור&quot; במדיניות הביטולים, והלקוחה משלמת בכרטיס כשהיא קובעת. בקופה המקדמה יורדת מהתשלום.</p>
          <CancelPolicyCard pc={pc} pcTint={pcTint} toast={toast} isDemo={isDemo} />
          {mode === 'deposit' && (
            <div style={{ ...box, background: 'var(--surface)' }}>
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', margin: 0, lineHeight: 1.6 }}>אילו טיפולים דורשים מקדמה? מסמנים &quot;דורש מקדמה&quot; ליד כל טיפול ברשימת השירותים.</p>
              {onOpenServices && <button type="button" data-testid="deposit-open-services" style={link} onClick={onOpenServices}>לרשימת השירותים ←</button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
