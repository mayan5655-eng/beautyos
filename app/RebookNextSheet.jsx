'use client';

// app/RebookNextSheet.jsx
//
// "קבעי לה שוב": from a client card or a finished appointment, propose the next visit and book it with one tap.
//
// The proposal is pure logic (lib/rebookNext.js: her own rhythm, the nearest free slot at her usual time, her hours,
// closed days, her lunch break, no overlaps). Creating the appointment goes through `createAppointment`, the same
// insert the checkout rebooking strip uses (beautyos.jsx insertRebookAppointment). The client's message is only OFFERED
// afterwards: opened in her own WhatsApp from a tap, or kept in "הודעות מוכנות לשליחה". Nothing is sent from here.
//
// Phone rules (2026-10-24 review): the WhatsApp link is fetched BEFORE the tap and rendered as a real <a>, because
// Safari and the Instagram browser block a window opened after an await.
import { useMemo, useState, useEffect } from 'react';
import Sheet from './Sheet';
import Spinner from './Spinner';
import { dayHoursFrom } from '@/lib/businessHours';
import { startMinute, endMinute, fmtTime } from '@/lib/apptTime';
import { resolveLunch } from '@/lib/lunchBreak';
import { isPersonal } from '@/lib/calendarKind';
import { NO_SHOW } from '@/lib/reliability';
import { businessFieldsOf } from '@/lib/businessFields';
import { rebookInterval, proposeNextVisit, freeStartsOn } from '@/lib/rebookNext.js';

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const CHIPS = [2, 3, 4, 6];

const dayLabel = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  return `יום ${DAYS_HE[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}`;
};
const periodHe = (days) => {
  if (days % 7 === 0) { const w = days / 7; return w === 1 ? 'שבוע' : w === 2 ? 'שבועיים' : `${w} שבועות`; }
  return `${days} ימים`;
};

export default function RebookNextSheet({
  client, anchorAppt, appointments, services, settings, today, historyReady,
  createAppointment, onManual, onQueued, onOpened, onClose, toast, pc, pcGrad, pcTint, pcDeep,
}) {
  const [chip, setChip] = useState(null);            // weeks she picked, null = her rhythm
  const [pick, setPick] = useState(null);            // minute she picked from the day's free starts
  const [pickOpen, setPickOpen] = useState(false);
  const [svcName, setSvcName] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [booked, setBooked] = useState(null);        // the created appointment
  const [msg, setMsg] = useState({ state: 'idle', text: '', waLink: '', error: '' });
  const [queued, setQueued] = useState(false);
  const [showText, setShowText] = useState(false);

  const mine = useMemo(
    () => (appointments || []).filter((a) => String(a.client_id) === String(client.id) && a.confirmation_status !== 'cancelled' && !isPersonal(a)),
    [appointments, client.id]
  );
  const past = useMemo(
    () => mine.filter((a) => a.date && a.date <= today && a.confirmation_status !== NO_SHOW).sort((a, b) => String(a.date).localeCompare(String(b.date))),
    [mine, today]
  );
  const future = useMemo(() => mine.filter((a) => a.date > today).sort((a, b) => String(a.date).localeCompare(String(b.date))), [mine, today]);

  // The visit to repeat: the one she just finished, else her latest.
  const anchor = anchorAppt || past[past.length - 1] || null;
  const resolvedSvc = useMemo(() => {
    if (svcName) return services.find((s) => s.name === svcName) || null;
    return (anchor && services.find((s) => s.name === anchor.service)) || null;
  }, [svcName, anchor, services]);

  const lunch = useMemo(() => resolveLunch(settings?.branding), [settings]);
  const hoursFor = useMemo(() => (wd) => dayHoursFrom(settings, wd), [settings]);
  const busy = useMemo(() => (appointments || []).flatMap((a) => {
    if (!a || a.confirmation_status === 'cancelled') return [];
    const s = startMinute(a), e = endMinute(a);
    return s === null || e === null ? [] : [{ date: String(a.date).slice(0, 10), start: s, end: e }];
  }), [appointments]);

  const interval = useMemo(
    () => rebookInterval({ visits: past.map((a) => ({ date: a.date, service: a.service })), service: resolvedSvc?.name, businessFields: businessFieldsOf(settings) }),
    [past, resolvedSvc, settings]
  );
  const days = chip ? chip * 7 : interval.days;
  const duration = Number(resolvedSvc?.duration) || 60;

  const proposal = useMemo(() => {
    if (!resolvedSvc || !historyReady) return null;
    return proposeNextVisit({
      afterDate: anchor?.date || today,
      anchorMinute: anchor ? startMinute(anchor) : null,
      duration, intervalDays: days, today, hoursFor, busy, lunch,
    });
  }, [resolvedSvc, historyReady, anchor, duration, days, today, hoursFor, busy, lunch]);

  const dayStarts = useMemo(
    () => (proposal ? freeStartsOn({ date: proposal.date, duration, hoursFor, busy, lunch }) : []),
    [proposal, duration, hoursFor, busy, lunch]
  );
  const minute = proposal ? (pick !== null && dayStarts.includes(pick) ? pick : proposal.minute) : null;

  // After the booking, fetch the message now, so the WhatsApp button is a plain link she can tap.
  useEffect(() => {
    if (!booked || !client.phone) return;
    let live = true;
    setMsg({ state: 'loading', text: '', waLink: '', error: '' });
    fetch('/api/rebook-message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appointmentId: booked.id, mode: 'preview' }) })
      .then((r) => r.json().catch(() => ({})))
      .then((j) => { if (live) setMsg(j?.success ? { state: 'ready', text: j.text, waLink: j.waLink, error: '' } : { state: 'error', text: '', waLink: '', error: j?.error || 'לא הצלחנו להכין את ההודעה' }); })
      .catch(() => { if (live) setMsg({ state: 'error', text: '', waLink: '', error: 'לא הצלחנו להכין את ההודעה' }); });
    return () => { live = false; };
  }, [booked, client.phone]);

  const confirm = async () => {
    if (!proposal || !resolvedSvc || busyKey) return;
    setBusyKey('book');
    try {
      const row = await createAppointment({ client, svc: resolvedSvc, date: proposal.date, minute });
      if (row) setBooked(row);
    } finally { setBusyKey(''); }
  };

  const keepInQueue = async () => {
    if (!booked || busyKey) return;
    setBusyKey('queue');
    try {
      const r = await fetch('/api/rebook-message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appointmentId: booked.id, mode: 'queue' }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) { toast(j.error || 'לא הצלחנו לשמור את ההודעה, אפשר לנסות שוב', 'error'); return; }
      setQueued(true);
      onQueued?.();
      toast('ההודעה מחכה ב"הודעות מוכנות לשליחה"', 'info');
    } finally { setBusyKey(''); }
  };

  const btn = { display: 'block', textAlign: 'center', textDecoration: 'none', minHeight: 48, lineHeight: '48px', borderRadius: 'var(--r-md)', fontWeight: 700, fontFamily: 'inherit', border: 'none', cursor: 'pointer', width: '100%', padding: 0, fontSize: 'var(--t-md)' };
  const ghost = { ...btn, background: 'var(--surface)', border: '1px solid var(--line-2)', color: 'var(--ink-2)', fontWeight: 600 };

  const why = (() => {
    if (chip) return `בחרת ${periodHe(chip * 7)}`;
    if (interval.basis === 'service') return `לפי הקצב שלה: ${periodHe(interval.days)} בין התורים של ${resolvedSvc?.name}`;
    if (interval.basis === 'client') return `לפי הקצב שלה: בערך כל ${periodHe(interval.days)}`;
    return `אין עדיין מספיק היסטוריה כדי לדעת את הקצב שלה, אז ${periodHe(interval.days)} (ברירת מחדל)`;
  })();

  const title = booked ? 'התור הבא נקבע' : `קבעי לה שוב${client.name ? ` · ${client.name}` : ''}`;

  return (
    <Sheet open onClose={onClose} width={400} zIndex={1250} className="pop-in" title={title} busy={!!busyKey}>
      <div data-testid="rebook-sheet" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!booked && (
          <>
            {future.length > 0 && (
              <p data-testid="rebook-already" style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', padding: '8px 10px', margin: 0 }}>
                כבר יש לה תור ב{dayLabel(future[0].date)} בשעה {fmtTime(startMinute(future[0]))}. אפשר לקבוע עוד אחד, אם זה מה שרצית.
              </p>
            )}
            {!resolvedSvc && (
              <div>
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)', fontWeight: 600, margin: '0 0 4px' }}>איזה טיפול?</p>
                <select value={svcName} onChange={(e) => setSvcName(e.target.value)} data-testid="rebook-service" style={{ width: '100%', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '10px', fontSize: 16, fontFamily: 'inherit', background: 'var(--surface-2)' }}>
                  <option value="">בחירת טיפול</option>
                  {services.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                </select>
                {services.length === 0 && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)', marginTop: 6 }}>עוד אין טיפולים בתפריט. אפשר להוסיף בהגדרות.</p>}
              </div>
            )}
            {resolvedSvc && !historyReady && (
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)', margin: 0 }}>ההיסטוריה של היומן עוד בדרך. כדי שלא ייווצרו תורים כפולים, אפשר לנסות שוב בעוד רגע.</p>
            )}
            {resolvedSvc && historyReady && !proposal && (
              <div data-testid="rebook-none" style={{ padding: '12px 14px', borderRadius: 'var(--r-md)', background: 'var(--surface-2)', border: '1px solid var(--line-2)' }}>
                <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', margin: '0 0 4px' }}>לא מצאתי מקום פנוי בשישה השבועות הקרובים</p>
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)', margin: 0 }}>היומן מלא, או שהימים סגורים. אפשר לבחור תאריך בעצמך.</p>
              </div>
            )}
            {resolvedSvc && proposal && (
              <div data-testid="rebook-proposal" style={{ padding: '13px 14px', borderRadius: 'var(--r-md)', background: pcTint, border: `1px solid ${pc}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>התור הבא</p>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {CHIPS.map((w) => (
                      <button key={w} type="button" onClick={() => { setChip(chip === w ? null : w); setPick(null); setPickOpen(false); }} aria-label={`מרווח של ${w} שבועות`} aria-pressed={chip === w}
                        style={{ minWidth: 36, minHeight: 36, borderRadius: 'var(--r-xs)', fontSize: 'var(--t-sm)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: chip === w ? `1.5px solid ${pc}` : '1px solid var(--line-2)', background: chip === w ? 'var(--surface)' : 'transparent', color: chip === w ? pcDeep : 'var(--ink-3)' }}>{w}</button>
                    ))}
                    <span style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)' }}>שב׳</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                  <p data-testid="rebook-when" style={{ fontSize: 'var(--t-md)', fontWeight: 600, color: 'var(--ink)', margin: 0 }}>{dayLabel(proposal.date)} בשעה</p>
                  <button type="button" onClick={() => setPickOpen((v) => !v)} disabled={dayStarts.length === 0} aria-expanded={pickOpen} aria-label="שינוי שעה"
                    style={{ background: 'var(--surface)', border: `1px solid ${pc}`, borderRadius: 'var(--r-xs)', minHeight: 36, padding: '3px 10px', fontSize: 'var(--t-md)', fontWeight: 700, color: pcDeep, cursor: 'pointer', fontFamily: 'inherit', direction: 'ltr' }}>{fmtTime(minute)}</button>
                </div>
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)', margin: '4px 0 0' }}>{resolvedSvc.name} · {duration} דקות</p>
                <p data-testid="rebook-why" style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', margin: '4px 0 0' }}>{why}</p>
                {proposal.date !== proposal.targetDate && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)', margin: '2px 0 0' }}>ביום שיצא לפי הקצב היומן סגור או מלא, זה הפנוי הקרוב.</p>}
                {!proposal.sameTime && minute === proposal.minute && anchor && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)', margin: '2px 0 0' }}>השעה הרגילה שלה תפוסה, זה הזמן הפנוי הקרוב אליה.</p>}
                {pickOpen && (
                  <div style={{ marginTop: 8, padding: '8px 8px 4px', borderRadius: 'var(--r-sm)', background: 'var(--surface)', border: '1px solid var(--line)' }}>
                    <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', fontWeight: 600, margin: '0 0 6px' }}>שעות פנויות ביום הזה</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 132, overflowY: 'auto' }}>
                      {dayStarts.map((m) => (
                        <button key={m} type="button" onClick={() => { setPick(m); setPickOpen(false); }}
                          style={{ minHeight: 40, padding: '7px 10px', borderRadius: 'var(--r-xs)', fontSize: 'var(--t-sm)', fontWeight: m === minute ? 700 : 600, cursor: 'pointer', fontFamily: 'inherit', direction: 'ltr', border: m === minute ? '1px solid transparent' : '1px solid var(--line-2)', background: m === minute ? pcGrad : 'var(--surface-2)', color: m === minute ? 'var(--pc-contrast)' : 'var(--ink-2)' }}>{fmtTime(m)}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" data-testid="rebook-confirm" onClick={confirm} disabled={!proposal || !!busyKey} style={{ ...btn, flex: 2, background: pcGrad, color: 'var(--pc-contrast)', opacity: proposal ? 1 : 0.5, cursor: proposal ? 'pointer' : 'not-allowed' }}>
                {busyKey === 'book' ? <Spinner inline label="קובעת" /> : 'קביעת התור ✓'}
              </button>
              <button type="button" data-testid="rebook-manual" onClick={() => onManual({ client, svc: resolvedSvc, date: proposal?.date, minute })} style={{ ...ghost, flex: 1 }}>שינוי</button>
            </div>
            <button type="button" onClick={onClose} style={ghost}>לא עכשיו</button>
          </>
        )}

        {booked && (
          <>
            <div data-testid="rebook-booked" style={{ padding: '12px 14px', borderRadius: 'var(--r-md)', background: 'rgba(70,179,123,0.10)', border: '1px solid var(--success)' }}>
              <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--success)', margin: '0 0 2px' }}>נקבע ל{client.name || 'לקוחה'}</p>
              <p style={{ fontSize: 'var(--t-md)', color: 'var(--ink)', margin: 0 }}>{dayLabel(booked.date)} בשעה {fmtTime(startMinute(booked))}</p>
            </div>
            {!client.phone && (
              <p data-testid="rebook-nophone" style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)', margin: 0 }}>אין ללקוחה מספר טלפון, אז אין למי להכין הודעה. אפשר להוסיף מספר בכרטיס שלה.</p>
            )}
            {client.phone && (
              <div data-testid="rebook-message">
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', margin: '0 0 6px' }}>רוצה לעדכן אותה? ההודעה מוכנה, ושום דבר לא נשלח עד שאת לוחצת על שליחה בוואטסאפ.</p>
                {msg.state === 'loading' && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)' }}><Spinner inline label="מכינה את ההודעה" /></p>}
                {msg.state === 'error' && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)' }}>{msg.error}</p>}
                {msg.state === 'ready' && (
                  <>
                    <button type="button" onClick={() => setShowText((v) => !v)} aria-expanded={showText} style={{ background: 'none', border: 'none', color: pcDeep, fontWeight: 600, fontFamily: 'inherit', fontSize: 'var(--t-sm)', padding: '4px 0', cursor: 'pointer' }}>{showText ? 'הסתרת ההודעה' : 'איך ההודעה נראית'}</button>
                    {showText && <pre data-testid="rebook-text" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 'var(--t-sm)', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', padding: 10, margin: '0 0 8px', lineHeight: 1.6, direction: 'rtl' }}>{msg.text}</pre>}
                    <a href={msg.waLink} target="_blank" rel="noreferrer" data-testid="rebook-wa" onClick={() => { onOpened?.(booked); }} style={{ ...btn, background: 'var(--ink)', color: 'var(--surface)', marginTop: 4 }}>פתיחה בוואטסאפ שלי</a>
                    <button type="button" data-testid="rebook-queue" onClick={keepInQueue} disabled={!!busyKey || queued} style={{ ...ghost, marginTop: 8, opacity: queued ? 0.6 : 1 }}>
                      {busyKey === 'queue' ? <Spinner inline label="שומרת" /> : queued ? 'ההודעה מחכה בהודעות מוכנות לשליחה' : 'להשאיר להודעות מוכנות לשליחה'}
                    </button>
                  </>
                )}
              </div>
            )}
            <button type="button" data-testid="rebook-done" onClick={onClose} style={ghost}>סגירה</button>
          </>
        )}
      </div>
    </Sheet>
  );
}
