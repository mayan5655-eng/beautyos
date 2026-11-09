'use client';

// app/BookingButtonsCard.jsx
//
// Settings > הדף שלי: "כפתור קביעת תור באינסטגרם ובגוגל". Four short guides (lib/bookingButtons.ts), each with her booking link
// tagged for that platform, a copy button, and a "סימנתי שעשיתי" tick saved in settings.automations.booking_buttons.
// Links she pastes herself: no account of hers is connected or changed, and the card says so.
//
// Props:
//   bookingUrl   her booking link, untagged (her short address when she has one)
//   automations  settings.automations as saved
//   onCopy(src)  copies the tagged link (beautyos copyPublicLink: clipboard, share sheet fallback, toasts)
//   onSaveDone(next) -> Promise<boolean>  saves automations.booking_buttons; false = not saved (the tick goes back)
//   pcDeep       her accent, for the video link

import { useState } from 'react';
import { BOOKING_PLATFORMS, platformLink, doneMap, withDone } from '@/lib/bookingButtons';
import { TUTORIAL_TITLES, tutorialHref } from '@/lib/helpSections';

export default function BookingButtonsCard({ bookingUrl, automations, onCopy, onSaveDone, pcDeep }) {
  const [open, setOpen] = useState(null);
  const [saving, setSaving] = useState('');
  const [local, setLocal] = useState(null); // optimistic ticks while a save is in flight
  const done = local || doneMap(automations);
  const count = BOOKING_PLATFORMS.filter((p) => done[p.key]).length;

  const toggle = async (key, on) => {
    if (saving) return;
    const next = withDone({ booking_buttons: done }, key, on);
    setLocal(next);
    setSaving(key);
    // Saved: the parent's settings now carry it. Not saved: back to what is stored (the parent says why in a toast).
    await onSaveDone(next);
    setSaving('');
    setLocal(null);
  };

  return (
    <section data-testid="booking-buttons-card" style={{ border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)', padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <p style={{ flex: 1, fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)' }}>כפתור קביעת תור באינסטגרם ובגוגל</p>
        <span data-testid="booking-buttons-count" style={{ fontSize: 'var(--t-xs)', fontWeight: 700, color: count === BOOKING_PLATFORMS.length ? 'var(--success)' : 'var(--ink-2)', whiteSpace: 'nowrap' }}>
          {count === BOOKING_PLATFORMS.length ? 'הכל מוכן ✓' : `${count} מתוך ${BOOKING_PLATFORMS.length}`}
        </span>
      </div>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.6 }}>
        כך הקישור שלך לקביעת תור יופיע בכל מקום שלקוחות מחפשות אותך. זה קישור שאת מדביקה בעצמך, לא חיבור אוטומטי: קלמיה לא משנה כלום בחשבונות שלך.
        כל קישור מסומן לפי המקום, כדי שבדוח המקורות תראי מאיפה הגיעו התורים.
      </p>
      <a href={tutorialHref('booking-button')} target="_blank" rel="noopener noreferrer" data-testid="booking-buttons-video" style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: pcDeep, textDecoration: 'none', alignSelf: 'flex-start' }}>
        ▶ סרטון: {TUTORIAL_TITLES['booking-button']}
      </a>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {BOOKING_PLATFORMS.map((p) => {
          const isOpen = open === p.key;
          const isDone = !!done[p.key];
          const link = platformLink(bookingUrl, p);
          return (
            <li key={p.key} data-testid={`booking-platform-${p.key}`} style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', background: isOpen ? 'var(--surface-2)' : 'var(--surface)' }}>
              <button type="button" onClick={() => setOpen(isOpen ? null : p.key)} aria-expanded={isOpen}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', minHeight: 48, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'right' }}>
                <span aria-hidden style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--t-xs)', fontWeight: 700, background: isDone ? 'var(--success)' : 'var(--line)', color: isDone ? '#FFFFFF' : 'var(--ink-2)' }}>{isDone ? '✓' : ''}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)' }}>{p.name}</span>
                  <span style={{ display: 'block', fontSize: 'var(--t-xs)', color: 'var(--ink-2)', marginTop: 1 }}>{p.where}</span>
                </span>
                <span aria-hidden style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)' }}>{isOpen ? '▲' : '▼'}</span>
              </button>
              {isOpen && (
                <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <ol style={{ margin: 0, paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {p.steps.map((s, i) => <li key={i} style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)', lineHeight: 1.6 }}>{s}</li>)}
                  </ol>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '8px 10px' }}>
                    <span data-testid={`booking-link-${p.key}`} dir="ltr" style={{ flex: '1 1 180px', minWidth: 0, fontSize: 'var(--t-xs)', color: 'var(--ink-2)', wordBreak: 'break-all', textAlign: 'left' }}>{link}</span>
                    <button type="button" onClick={() => onCopy(p.src, `הקישור הועתק. עכשיו הדביקי אותו ${p.inName} לפי השלבים`)} style={{ background: 'var(--brand-deep)', color: 'var(--brand-contrast)', border: 'none', borderRadius: 'var(--r-sm)', padding: '9px 14px', minHeight: 40, fontSize: 'var(--t-xs)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>העתקת הקישור</button>
                  </div>
                  {p.note && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', lineHeight: 1.6 }}>{p.note}</p>}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: saving ? 'wait' : 'pointer', fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--ink)', minHeight: 40 }}>
                    <input type="checkbox" checked={isDone} disabled={!!saving} onChange={(e) => toggle(p.key, e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--success)' }} data-testid={`booking-done-${p.key}`} />
                    סימנתי שעשיתי
                    {saving === p.key && <span style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', fontWeight: 500 }}>שומרת…</span>}
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
