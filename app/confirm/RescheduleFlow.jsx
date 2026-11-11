'use client';

// app/confirm/RescheduleFlow.jsx
//
// "להזיז את התור" on the client's confirm page (app/confirm/page.jsx). Pick a day, pick a time, move. The rules and the
// guard against double-booking live on the server (app/api/confirm/reschedule, lib/reschedule.ts); this only shows what the
// server said is free, and the server decides again on the tap.
//
// `peek` is the server's read-only answer, already fetched by the page (the page shows the "move" button only when it says
// the move really works). `via` is which signed link she came from: "reschedule", or "cancel" (the cancel page offers moving).
import { useState } from 'react';
import { googleCalendarUrl } from '@/lib/calendarInvite';
import { useTr } from "@/lib/i18n/useTr";

const COPY = {
  pickDay: 'באיזה יום נוח לך?',
  pickTime: 'ובאיזו שעה?',
  confirmBtn: 'להזיז לשעה הזו',
  moving: 'מזיזה את התור שלך…',
  doneTitle: 'התור הוזז!',
  noSlots: 'כרגע אין שעות פנויות לטיפול הזה בימים הקרובים. אפשר לכתוב לעסק ישירות, ונמצא יחד זמן שמתאים לך.',
};

const chip = (on) => ({
  minHeight: 44, padding: '9px 14px', borderRadius: 'var(--r-full)', fontFamily: 'inherit', fontSize: 'var(--t-sm)', fontWeight: 700, cursor: 'pointer',
  background: on ? 'var(--pc, #E9A9A1)' : 'var(--brand-surface, #fff)', color: on ? 'var(--pc-contrast, #1F3A30)' : 'var(--ink)',
  border: on ? '1px solid var(--pc, #E9A9A1)' : '1px solid var(--line-2, #DAD2BF)',
});

export default function RescheduleFlow({ id, token, via, peek, businessName, whatsapp, onBack, onMoved, lang = null }) {
  const tr = useTr(lang);
  const days = Array.isArray(peek?.days) ? peek.days : [];
  const [day, setDay] = useState(days[0]?.date || '');
  const [start, setStart] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  // Times taken while she was choosing, so the grid stops offering them.
  const [gone, setGone] = useState(() => new Set());

  const current = days.find((d) => d.date === day);
  const slots = (current?.slots || []).filter((s) => !gone.has(`${day}:${s.start}`));

  const move = () => {
    if (start == null || !day) return;
    setBusy(true); setError('');
    fetch('/api/confirm/reschedule', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, token, via, date: day, startMinute: start }),
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        setBusy(false);
        if (ok && d.success) { setDone(d); if (onMoved) onMoved(d); return; }
        if (d.code === 'slot_taken' || d.code === 'slot_unavailable') { setGone((g) => new Set(g).add(`${day}:${start}`)); setStart(null); }
        setError(d.error || tr("לא הצלחנו להזיז את התור, אפשר לנסות שוב?"));
      })
      .catch(() => { setBusy(false); setError(tr("לא הצלחנו להתחבר לשרת, אפשר לנסות שוב?")); });
  };

  if (done) {
    const inv = done.invite || null;
    const icsHref = inv ? `/api/calendar-invite?${new URLSearchParams({ date: inv.date, start: String(inv.startMinute), duration: String(inv.duration), title: inv.title, ...(whatsapp ? { details: tr("לשינוי או שאלה: https://wa.me/{0}", [whatsapp]) } : {}) }).toString()}` : '';
    return (
      <div data-testid="reschedule-done">
        <h1 className="pub-h1">{tr(COPY.doneTitle)}</h1>
        <p className="pub-p" style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
          {[done.appointment?.service, done.appointment?.date, done.appointment?.time].filter(Boolean).join(' · ')}
        </p>
        <p className="pub-p">{done.message}</p>
        {inv && (
          <div data-testid="reschedule-calendar" style={{ marginTop: 20 }}>
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)', marginBottom: 8 }}>{tr("שמרי את המועד החדש ביומן שלך, כדי שהטלפון יזכיר לך")}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a href={icsHref} className="pub-pill pub-pill-quiet" style={{ textDecoration: 'none', width: 'auto', padding: '10px 18px' }}>{tr("לאייפון / ליומן")}</a>
              <a href={googleCalendarUrl({ date: inv.date, startMinute: inv.startMinute, duration: inv.duration, title: inv.title })} target="_blank" rel="noreferrer" className="pub-pill pub-pill-quiet" style={{ textDecoration: 'none', width: 'auto', padding: '10px 18px' }}>{tr("ליומן Google")}</a>
            </div>
          </div>
        )}
        <p style={{ fontSize: 'var(--t-md)', color: 'var(--ink-3)', marginTop: 20 }}>{tr("תוכלי לסגור את החלון")}</p>
      </div>
    );
  }

  return (
    <div data-testid="reschedule-flow" style={{ textAlign: 'right' }}>
      <h1 className="pub-h1" style={{ textAlign: 'center' }}>{tr("להזיז את התור")}</h1>
      {peek?.appointment && (peek.appointment.service || peek.appointment.date) && (
        <p className="pub-p" style={{ textAlign: 'center', marginBottom: 16 }}>
          {tr("היום קבוע לך:")} {[peek.appointment.service, peek.appointment.date, peek.appointment.time].filter(Boolean).join(' · ')}
        </p>
      )}
      {days.length === 0 ? (
        <p className="pub-p" style={{ textAlign: 'center' }}>{tr(COPY.noSlots)}</p>
      ) : (
        <>
          <p style={{ fontWeight: 700, color: 'var(--ink)', margin: '4px 0 8px' }}>{tr(COPY.pickDay)}</p>
          <div role="radiogroup" aria-label={tr(COPY.pickDay)} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {days.map((d) => (
              <button key={d.date} type="button" role="radio" aria-checked={d.date === day} onClick={() => { setDay(d.date); setStart(null); setError(''); }} style={chip(d.date === day)}>{d.label}</button>
            ))}
          </div>
          <p style={{ fontWeight: 700, color: 'var(--ink)', margin: '16px 0 8px' }}>{tr(COPY.pickTime)}</p>
          {slots.length === 0 ? (
            <p className="pub-p">{tr("ביום הזה כבר אין שעות פנויות. אפשר לבחור יום אחר.")}</p>
          ) : (
            <div role="radiogroup" aria-label={tr(COPY.pickTime)} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))', gap: 8 }}>
              {slots.map((s) => (
                <button key={s.start} type="button" role="radio" aria-checked={start === s.start} onClick={() => { setStart(s.start); setError(''); }} style={{ ...chip(start === s.start), direction: 'ltr' }}>{s.label}</button>
              ))}
            </div>
          )}
          {error && <p role="alert" className="pub-p" style={{ color: 'var(--ink)', fontWeight: 600, marginTop: 14 }}>{error}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
            <button type="button" className="pub-pill" disabled={start == null || busy} onClick={move}>{busy ? tr(COPY.moving) : tr(COPY.confirmBtn)}</button>
            {onBack && <button type="button" className="pub-pill pub-pill-quiet" onClick={onBack} disabled={busy}>{tr("השארת התור כמו שהוא")}</button>}
          </div>
          {peek?.movesLeft === 1 && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)', marginTop: 12, textAlign: 'center' }}>{tr("אפשר להזיז את התור הזה דרך הקישור עוד פעם אחת.")}</p>}
        </>
      )}
      {days.length === 0 && whatsapp && (
        <div style={{ marginTop: 20 }}>
          <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className="pub-pill" style={{ textDecoration: 'none' }}>{tr("כתיבה ל")}{businessName || tr("עסק")} {tr("בוואטסאפ")}</a>
        </div>
      )}
    </div>
  );
}
