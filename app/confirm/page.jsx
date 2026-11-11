'use client';

import { useEffect, useRef, useState, Suspense, useCallback } from 'react';
import Spinner from "../Spinner";
import { useSearchParams } from 'next/navigation';
import { PublicPage, BusinessHeader } from "../PublicChrome";
import RescheduleFlow from "./RescheduleFlow";
import { useTr } from "@/lib/i18n/useTr";
import { normalizeLang } from "@/lib/i18n/core";
import { useDocumentLang } from "@/lib/i18n/react";

function ConfirmContent() {
  // The business's language (lib/i18n), from the first answer of /api/confirm. Until it arrives a cancel link shows no
  // words at all (a short wait, capped below), so an Arabic or English client never reads a Hebrew question first.
  const [lang, setLang] = useState(null);
  const [langWaitOver, setLangWaitOver] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLangWaitOver(true), 2500); return () => clearTimeout(t); }, []);
  const learnLang = (d) => { if (d && typeof d.language === 'string') setLang(normalizeLang(d.language)); };
  useDocumentLang(lang);
  const tr = useTr(lang);
  const searchParams = useSearchParams();

  // All three come from the URL, which does not change while this page is open.
  const id = searchParams.get('id');
  const token = searchParams.get('t') || '';
  const action = searchParams.get('action') || 'confirm';

  // ready    - cancel links only: waiting for her to actually say yes
  // working  - request in flight
  // success / already / declined / error - terminal
  //
  // The opening status is a pure function of the URL, so it is computed here
  // rather than in an effect that immediately overwrites a placeholder. That
  // also removes a frame where a cancel link rendered "מעדכנת את התור שלך…"
  // before the effect got a chance to say otherwise.
  const [status, setStatus] = useState(() =>
    !id ? 'error' : action === 'cancel' ? 'ready' : action === 'reschedule' ? 'moveLoading' : 'working'
  );
  const [message, setMessage] = useState(() =>
    !id ? 'הקישור לא תקין, חסר בו מזהה התור.' : ''
  );
  // Public branding from the API's success path; optional - no logo, no space.
  const [brandInfo, setBrandInfo] = useState({ businessName: '', logoUrl: '', primaryColor: '' });
  // Her booking page and WhatsApp (lib/publicContact.ts), sent only on a signed answer: where to go after a cancel or a refusal.
  const [contact, setContact] = useState({ bookUrl: '', whatsapp: '' });
  // A business rule said no (409: inside her cancellation window, already past, already changed). Not a glitch: no
  // "אופס!" and no "נסי שוב", which could never succeed (2026-11-08 QA).
  const [refused, setRefused] = useState(false);
  // Refused only because it is inside her cancellation window: the appointment still stands, so the way out is writing to her,
  // not "book another time" (which would only add a second appointment next to the one she wants to cancel).
  const [tooLate, setTooLate] = useState(false);

  // Does not set 'working' itself. On mount that is already the status for a
  // confirm link, and setting state synchronously from an effect is a
  // cascading render. The two buttons that call this set it themselves.
  const send = useCallback(() => {
    fetch('/api/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action, token }),
    })
      .then(res => res.json().then(data => { setRefused(res.status === 409 && !data.success); setTooLate(res.status === 409 && data.tooLate === true); return data; }))
      .then(data => {
        if (data.success) {
          setStatus(data.alreadyDone ? 'already' : 'success');
          setMessage(data.message);
          setBrandInfo({ businessName: data.businessName || '', logoUrl: data.logoUrl || '', primaryColor: data.primaryColor || '' });
          learnLang(data);
        } else {
          setStatus('error');
          setMessage(data.error || tr("משהו השתבש"));
          if (data.businessName) setBrandInfo((b) => ({ ...b, businessName: data.businessName }));
        }
        setContact({ bookUrl: typeof data.bookUrl === 'string' && data.bookUrl.startsWith('/') ? data.bookUrl : '', whatsapp: /^\d{8,15}$/.test(String(data.whatsapp || '')) ? String(data.whatsapp) : '' });
      })
      .catch(err => {
        console.error(err);
        setStatus('error');
        setMessage(tr("לא הצלחנו להתחבר לשרת"));
      });
  }, [id, action, token]);

  // What the buttons call: show the spinner, then go.
  // Set once she has answered the question herself: a late peek answer must not overwrite what she already did.
  const answered = useRef(false);
  const sendNow = () => { answered.current = true; setStatus('working'); send(); };

  // A cancel link must NOT fire on load, so only the confirm path runs here.
  //
  // Making this a POST already stopped link-preview crawlers from cancelling a
  // real appointment, but it left the other half: the client herself. Opening
  // the link is one tap in a WhatsApp thread, and a mis-tap - or a tap meant
  // for the confirm link a line above - cancelled the booking before the page
  // had finished rendering, with nothing on screen to stop it and no way back.
  //
  // Confirming is the opposite case: it is not destructive, it is exactly what
  // the link says it does, and a second tap there is friction with no safety
  // behind it. So confirm still runs on load; cancel asks first.
  useEffect(() => {
    if (id && action === 'confirm') send();
  }, [id, action, send]);

  // "להזיז את התור" (app/api/confirm/reschedule): a read-only peek of the free times. On a reschedule link it IS the page; on a cancel
  // link the "move instead" button appears only when this peek says the move really works for this appointment (free times
  // exist, inside her rules and her move limit). A refused peek on a cancel link shows nothing extra: the cancel answer already
  // says why. Owner rule 2026-11-09: nothing is shown that does not work.
  const [movePeek, setMovePeek] = useState(null);
  useEffect(() => {
    if (!id || (action !== 'cancel' && action !== 'reschedule')) return;
    let gone = false;
    fetch('/api/confirm/reschedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, token, via: action, peek: true }) })
      .then(r => r.json().then(d => ({ code: r.status, d })))
      .then(({ code, d }) => {
        if (gone) return;
        const cleanContact = () => setContact({ bookUrl: typeof d.bookUrl === 'string' && d.bookUrl.startsWith('/') ? d.bookUrl : '', whatsapp: /^\d{8,15}$/.test(String(d.whatsapp || '')) ? String(d.whatsapp) : '' });
        learnLang(d);
        if (d?.success && d.peek) {
          if (action === 'reschedule') {
            setBrandInfo({ businessName: d.businessName || '', logoUrl: d.logoUrl || '', primaryColor: d.primaryColor || '' });
            cleanContact();
            setMovePeek(d);
            setStatus('move');
          } else if (Array.isArray(d.days) && d.days.length > 0) {
            setMovePeek(d);
          }
          return;
        }
        if (action !== 'reschedule') return;
        if (d?.businessName) setBrandInfo({ businessName: d.businessName || '', logoUrl: d.logoUrl || '', primaryColor: d.primaryColor || '' });
        cleanContact();
        setStatus('error');
        setRefused(code === 409);
        setTooLate(code === 409 && d.tooLate === true);
        setMessage(d?.error || tr("משהו השתבש"));
      })
      .catch(() => { if (!gone && action === 'reschedule') { setStatus('error'); setMessage(tr("לא הצלחנו להתחבר לשרת")); } });
    return () => { gone = true; };
  }, [id, action, token]);

  // A cancel link says WHICH appointment before she decides: a read-only peek (changes nothing).
  // A failed peek just leaves the question without the details.
  const [peekAppt, setPeekAppt] = useState(null);
  useEffect(() => {
    if (!id || action !== 'cancel') return;
    let gone = false;
    fetch('/api/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action, token, peek: true }) })
      .then(r => r.json())
      .then(d => {
        if (gone || !d?.success || !d.peek) return;
        setBrandInfo({ businessName: d.businessName || '', logoUrl: d.logoUrl || '', primaryColor: d.primaryColor || '' });
        learnLang(d);
        setPeekAppt(d.appointment || null);
        if (d.status === 'cancelled') { setStatus('already'); setMessage(tr("התור כבר בוטל בעבר")); }
        // The link could not cancel this one (inside her cancellation window, already past, already changed): say so now,
        // calmly, with how to reach her, instead of a "yes, cancel" button that would only be refused after the tap. Only
        // while the question is still on screen; the real request stays the authority (app/api/confirm).
        else if (d.refusal && typeof d.refusal.error === 'string' && !answered.current) {
          setStatus('error');
          setRefused(true);
          setTooLate(d.refusal.tooLate === true);
          setMessage(d.refusal.error);
          setContact({ bookUrl: typeof d.bookUrl === 'string' && d.bookUrl.startsWith('/') ? d.bookUrl : '', whatsapp: /^\d{8,15}$/.test(String(d.whatsapp || '')) ? String(d.whatsapp) : '' });
        }
      })
      .catch(() => {});
    return () => { gone = true; };
  }, [id, action, token]);

  const getStyles = () => {
    // No hourglass emoji: it was the last colour glyph on a page that is
    // otherwise monochrome, and minHeight on the mark slot keeps the layout
    // from jumping while this state has none.
    if (status === 'working' || status === 'moveLoading') return { emoji: '', title: tr("רגע..."), color: 'var(--ink-2)' };
    if (status === 'ready') return { emoji: '', title: tr("לבטל את התור?"), color: 'var(--ink)' };
    if (status === 'declined') return { emoji: '', title: tr("התור נשאר"), color: 'var(--pc-deep)' };
    if (status === 'error' && refused) return { emoji: '', title: action === 'cancel' ? tr("אי אפשר לבטל מהקישור") : action === 'reschedule' ? tr("אי אפשר להזיז מהקישור") : tr("אי אפשר לשנות מהקישור"), color: 'var(--ink)' };
    if (status === 'error') return { emoji: '', title: tr("אופס!"), color: 'var(--danger)' };
    if (status === 'success' && action === 'confirm') return { emoji: '', title: tr("התור אושר!"), color: 'var(--pc-deep)' };
    if (status === 'success' && action === 'cancel') return { emoji: '', title: tr("התור בוטל"), color: 'var(--ink-2)' };
    if (status === 'already') return { emoji: '', title: tr("כבר טופל"), color: 'var(--pc-deep)' };
    return { emoji: '', title: '', color: 'var(--ink)' };
  };

  const styles = getStyles();

  // Monochrome stroked marks rather than emoji. The page renders one glyph at
  // 64px as the whole visual answer, and on iOS the emoji versions came back in
  // full colour against a page that has none.
  const mark = (kind, colour) => {
    const common = { width: 58, height: 58, fill: 'none', stroke: colour, strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
    if (kind === 'tick') return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="9.2" /><path d="M7.8 12.4l2.9 2.9 5.5-5.9" /></svg>;
    if (kind === 'cross') return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="9.2" /><path d="M9 9l6 6M15 9l-6 6" /></svg>;
    if (kind === 'info') return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="9.2" /><path d="M12 11v5.4" /><circle cx="12" cy="7.9" r="0.9" fill={colour} stroke="none" /></svg>;
    if (kind === 'ask') return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="9.2" /><path d="M9.4 9.4a2.7 2.7 0 1 1 3.4 3.2c-.6.2-.9.8-.9 1.5v.4" /><circle cx="12" cy="17.4" r="0.9" fill={colour} stroke="none" /></svg>;
    return null;
  };

  const markKind =
    status === 'ready' ? 'ask'
    : status === 'declined' ? 'tick'
    : status === 'error' ? (refused ? 'info' : 'cross')
    : status === 'already' ? 'info'
    : status === 'success' ? (action === 'cancel' ? 'info' : 'tick')
    : null;

  if (status === 'move' && movePeek) {
    return (
      <PublicPage primary={brandInfo.primaryColor || null} lang={lang}>
        <div className="pub-card" style={{ padding: '30px 20px 28px' }}>
          <BusinessHeader logoUrl={brandInfo.logoUrl} name={brandInfo.businessName} lang={lang} />
          <RescheduleFlow lang={lang} id={id} token={token} via={action} peek={movePeek} businessName={brandInfo.businessName} whatsapp={contact.whatsapp}
            onBack={() => { answered.current = true; setStatus('declined'); }} onMoved={() => { answered.current = true; }} />
        </div>
      </PublicPage>
    );
  }

  if (status === 'ready' && !lang && !langWaitOver) {
    return <PublicPage owner="kalmea"><Spinner label="" /></PublicPage>;
  }

  return (
    <PublicPage primary={brandInfo.primaryColor || null} lang={lang}>
      <div className="pub-card" style={{ padding: '30px 24px 28px' }}>
        {/* HER logo and name first and large: this page is hers, Kalmea is the small mark below the card. */}
        <BusinessHeader logoUrl={brandInfo.logoUrl} name={brandInfo.businessName} lang={lang} />
        <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'center', minHeight: 58 }}>
          {markKind ? mark(markKind, styles.color) : null}
        </div>
        <h1 className="pub-h1">{styles.title}</h1>
        {(status === 'ready' || (status === 'error' && refused && action === 'cancel')) && peekAppt && (peekAppt.service || peekAppt.date) && (
          <p data-testid="cancel-which" className="pub-p" style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
            {[peekAppt.service, peekAppt.date, peekAppt.time].filter(Boolean).join(' · ')}
          </p>
        )}
        <p className="pub-p">
          {status === 'working' || status === 'moveLoading' ? <Spinner inline label={tr("מעדכנת את התור שלך")} /> : status === 'ready' ? tr("ביטול משחרר את השעה שלך, ואי אפשר להחזיר אותה מהקישור הזה. אם לא התכוונת לבטל, אפשר פשוט לסגור את החלון.")
            : status === 'declined' ? tr("לא שינינו כלום. נתראה בתור.")
            : message}
        </p>

        {status === 'ready' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
            <button type="button" onClick={sendNow} className="pub-pill pub-pill-danger">{tr("כן, בטלי את התור")}</button>
            <button type="button" onClick={() => { answered.current = true; setStatus('declined'); }} className="pub-pill pub-pill-quiet">{tr("לא, השאירי את התור")}</button>
          </div>
        )}

        {/* Moving instead of cancelling: only when the server said this appointment can really be moved now (movePeek). */}
        {status === 'ready' && movePeek && (
          <div data-testid="offer-move" style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line, #EAE3D2)' }}>
            <p className="pub-p" style={{ marginBottom: 10 }}>{tr("רוצה להזיז במקום לבטל?")}</p>
            <button type="button" onClick={() => { answered.current = true; setStatus('move'); }} className="pub-pill pub-pill-quiet">{tr("להזיז את התור למועד אחר")}</button>
          </div>
        )}

        {status === 'error' && id && !refused && (
          <button type="button" onClick={action === 'cancel' ? () => setStatus('ready') : action === 'reschedule' ? () => window.location.reload() : sendNow} className="pub-pill pub-pill-quiet" style={{ marginTop: 20, width: 'auto', display: 'inline-flex', padding: '11px 28px' }}>
            {tr("נסי שוב")}
          </button>
        )}

        {/* After a cancel, or when the link could not change the booking: book another time, or write to her. */}
        {((status === 'success' && action === 'cancel') || (status === 'already' && action === 'cancel') || status === 'error') && ((contact.bookUrl && !tooLate) || contact.whatsapp) && (
          <div data-testid="confirm-next" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
            {contact.bookUrl && !tooLate && <a href={contact.bookUrl} className="pub-pill" style={{ textDecoration: 'none' }}>{tr("קביעת מועד אחר")}</a>}
            {contact.whatsapp && <a href={`https://wa.me/${contact.whatsapp}`} target="_blank" rel="noreferrer" className={tooLate ? 'pub-pill' : 'pub-pill pub-pill-quiet'} style={{ textDecoration: 'none' }}>{tr("כתיבה ל{0} בוואטסאפ", [brandInfo.businessName || tr("עסק")])}</a>}
          </div>
        )}

        {(status === 'success' || status === 'already' || status === 'declined') && (
          <p style={{ fontSize: 'var(--t-md)', color: 'var(--ink-3)', marginTop: 20 }}>{tr("תוכלי לסגור את החלון")}</p>
        )}
      </div>
    </PublicPage>
  );
}

export default function ConfirmPage() {
  const tr = useTr();
  return (
    <Suspense fallback={<PublicPage owner="kalmea"><Spinner label={tr("טוענת")} /></PublicPage>}>
      <ConfirmContent />
    </Suspense>
  );
}
