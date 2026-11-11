'use client';

// app/LoyaltyClientCard.jsx
//
// The stamp strip on a client card: how far she is, the rewards she was given, and a manual +1 / -1 with a reason (written to
// loyalty_adjustments, append only). The state comes in already computed (lib/loyalty.loyaltyState). Nothing is sent from here: when
// she is one visit away or the reward is ready, the owner gets a wa.me link that opens HER WhatsApp with the message typed.

import { useState } from 'react';
import { messageMoment, loyaltyMessage } from '@/lib/loyalty';
import { waLink } from '@/lib/phone';
import { tr, uiDir } from "@/lib/i18n/tr";

const dateHe = (ms) => { try { return new Date(ms).toLocaleDateString('he-IL'); } catch { return ''; } };

export default function LoyaltyClientCard({ state, client, businessName, pc, pcTint, dbReady, onAdjust, busy }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!state || !state.enabled) return null;
  const moment = messageMoment(state);
  const wa = moment && client?.phone ? waLink(client.phone, loyaltyMessage(state, { clientName: client.name, businessName })) : null;
  const line = state.ready ? `🎁 מגיעה לה מתנה: ${state.reward}` : state.remaining === 1 ? 'עוד ביקור אחד למתנה' : `עוד ${state.remaining} ביקורים למתנה`;
  const adjust = async (delta) => {
    if (!reason.trim()) return;
    const ok = await onAdjust(delta, reason.trim());
    if (ok) setReason('');
  };
  const small = { fontSize: 'var(--t-xs)', color: 'var(--ink-3)', lineHeight: 1.6, margin: 0 };

  return (
    <div data-testid="loyalty-strip" style={{ padding: '12px 12px 10px', background: pcTint, borderRadius: 'var(--r-md)', border: `1px solid ${state.ready ? pc : 'var(--line)'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>{tr("כרטיסיית נאמנות")}</p>
        <span style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', fontWeight: 600 }}>{state.filled}/{state.every}</span>
      </div>
      <div role="img" aria-label={tr("{0} מתוך {1} ביקורים", [state.filled, state.every])} style={{ display: 'flex', gap: 4, direction: uiDir() }}>
        {Array.from({ length: state.every }, (_, i) => {
          const on = i < state.filled;
          const last = i === state.every - 1;
          return (
            <span key={i} style={{ flex: 1, aspectRatio: '1', maxWidth: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, border: `1.5px ${on || last ? 'solid' : 'dashed'} ${pc}`, background: on ? pc : 'var(--surface)', color: on ? 'var(--pc-contrast, #fff)' : 'var(--ink-3)' }}>
              {last ? '🎁' : on ? '✦' : ''}
            </span>
          );
        })}
      </div>
      <p data-testid="loyalty-strip-line" style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', margin: '8px 0 0' }}>{line}</p>
      {state.nextExpiry && <p style={small}>{tr("הביקור הוותיק בכרטיסייה פג ב-")}{dateHe(state.nextExpiry)}</p>}
      {wa && (
        <a href={wa} target="_blank" rel="noreferrer" data-testid="loyalty-wa" className="wa-btn" style={{ display: 'inline-flex', marginTop: 8, padding: '7px 12px', fontSize: 'var(--t-sm)' }}>
          {moment === 'ready' ? tr("לספר לה שהמתנה מחכה") : tr("לספר לה שנשאר ביקור אחד")}
        </a>
      )}
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} style={{ display: 'block', background: 'none', border: 'none', padding: '8px 0 0', minHeight: 36, color: 'var(--k-green)', fontWeight: 700, fontSize: 'var(--t-xs)', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}>
        {open ? tr("סגירה") : tr("היסטוריה ותיקון ידני")}
      </button>
      {open && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {state.history.length === 0 ? <p style={small}>{tr("עוד לא ניתנה מתנה ולא היה תיקון ידני.")}</p> : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {state.history.map((h, i) => (
                <li key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: 'var(--t-xs)' }}>
                  <span style={{ color: 'var(--ink)' }}>{h.kind === 'redeem' ? tr("🎁 קיבלה: {0}", [h.reward]) : `${h.delta > 0 ? 'נוסף ביקור' : 'הורד ביקור'}: ${h.reason}`}</span>
                  <span style={{ color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{dateHe(h.at)}</span>
                </li>
              ))}
            </ul>
          )}
          {dbReady === false ? (
            <p data-testid="loyalty-needs-migration" style={{ ...small, color: 'var(--ink-2)' }}>{tr("התיקון הידני יעבוד אחרי עדכון קטן במערכת שעוד לא הותקן אצלך. אפשר לכתוב לנו ב\"תקועה?\" למטה ונפעיל. הספירה מהתשלומים עובדת כבר עכשיו.")}</p>
          ) : (<>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120} placeholder={tr("סיבה, למשל: כרטיסייה מנייר")} aria-label={tr("סיבת התיקון")} style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '8px 10px', fontSize: 'var(--t-sm)', fontFamily: 'inherit', outline: 'none', direction: uiDir(), background: 'var(--surface)' }} />
            <div style={{ display: 'flex', gap: 6 }}>
              {[[1, '+1 ביקור'], [-1, '-1 ביקור']].map(([d, l]) => (
                <button key={d} type="button" disabled={busy || !reason.trim() || (d < 0 && state.stamps === 0)} onClick={() => adjust(d)} style={{ flex: 1, minHeight: 40, border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', color: 'var(--ink)', fontWeight: 700, fontSize: 'var(--t-sm)', cursor: 'pointer', fontFamily: 'inherit', opacity: busy || !reason.trim() ? 0.55 : 1 }}>
                  <bdi>{l}</bdi>
                </button>
              ))}
            </div>
            <p style={small}>{tr("כל תיקון נשמר עם הסיבה, ולא נמחק. טעית? מתקנים בתיקון הפוך.")}</p>
          </>)}
        </div>
      )}
    </div>
  );
}
