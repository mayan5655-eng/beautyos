'use client';

// app/DepositLinkSheet.jsx
//
// After she saved a booking with "request deposit" on: the Grow payment link, ready to send. A wa.me link opens WhatsApp with the message typed in (she
// presses send herself; nothing is sent from here), and a copy button. The booking is held as pending for the number of minutes shown.
import Sheet from './Sheet';

const waDigits = (phone) => { const d = String(phone || '').replace(/\D/g, ''); return d.startsWith('0') ? '972' + d.slice(1) : d; };

export default function DepositLinkSheet({ info, onClose, toast, pc, pcTint }) {
  if (!info) return null;
  const msg = `שלום${info.clientName ? ' ' + info.clientName : ''}, התור שלך שמור למשך ${info.minutes} דקות. כדי לאשר אותו משלמים מקדמה של ₪${info.amount} בדף תשלום מאובטח: ${info.url}`;
  const wa = `https://wa.me/${waDigits(info.phone)}?text=${encodeURIComponent(msg)}`;
  const copy = async () => { try { await navigator.clipboard.writeText(info.url); toast?.('הקישור הועתק'); } catch { toast?.('ההעתקה נחסמה, סמני והעתיקי ידנית', 'error'); } };
  const btn = { display: 'block', textAlign: 'center', textDecoration: 'none', minHeight: 48, lineHeight: '48px', borderRadius: 'var(--r-md)', fontWeight: 700, fontFamily: 'inherit', border: 'none', cursor: 'pointer', width: '100%', marginTop: 8, padding: 0, fontSize: 'var(--t-md)' };
  return (
    <Sheet open onClose={onClose} width={360} zIndex={1200} className="pop-in" title="בקשת מקדמה">
      <div data-testid="deposit-link-sheet" style={{ display: 'flex', flexDirection: 'column' }}>
        <p style={{ fontSize: 'var(--t-md)', color: 'var(--ink)', lineHeight: 1.7, marginBottom: 8 }}>
          התור נשמר ל{info.clientName || 'לקוחה'} למשך {info.minutes} דקות. שלחי לה את קישור התשלום של המקדמה (₪{info.amount}). ברגע שהיא משלמת, התור מתאשר. אם לא, הוא משתחרר מעצמו.
        </p>
        <a href={wa} target="_blank" rel="noreferrer" data-testid="deposit-wa" style={{ ...btn, background: 'var(--ink)', color: 'var(--surface)' }}>שליחה בוואטסאפ</a>
        <button type="button" onClick={copy} style={{ ...btn, background: pcTint, border: `1px dashed ${pc}`, color: 'var(--pc-text, var(--ink))' }}>העתקת קישור</button>
        <button type="button" onClick={onClose} style={{ ...btn, background: 'var(--surface)', border: '1px solid var(--line-2)', color: 'var(--ink)' }}>סגירה</button>
      </div>
    </Sheet>
  );
}
