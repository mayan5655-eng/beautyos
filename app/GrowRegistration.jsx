'use client';
// app/GrowRegistration.jsx
//
// Inside the Grow card (app/GrowCard.jsx), for a business with no Grow account: open one from here, through Grow's lead
// registration (GetLink, lib/grow/registration.ts). She types her ID / business number and her mobile; Grow texts the form
// link to that mobile, and she fills it from that phone (or right here, in Grow's form inside the card).
// States after she starts:
//   waiting   the request is with Grow; she can open the form here, or fix a wrong mobile (same business number, right
//             mobile: Grow updates the same lead)
//   rejected  Grow said no, with Grow's words when it gave any; she can try again or leave details instead
//   (approved never shows here: the card switches to "connected" by itself, with clearing on)
// Grow's GetLink errors come back in plain Hebrew; "already has a Grow account" (149) offers the "I have Grow" door.
//
// Design (2026-10-20 pass): one promise line, then the three steps as a short checklist with round marks (the ads' list), labelled
// fields, ONE filled primary button in her accent (quieter when disabled, never washed out), and the fallback as a quiet link.
// Settings cards use her accent (pc), so this one does too.
import { useEffect, useRef, useState } from 'react';

const digits = (v) => String(v || '').replace(/\D/g, '');

/** Grow's form in an iframe posts { action: 'success' | 'close', source: 'growRegister' }. Only from the form's own origin. */
function GrowFormFrame({ url, onSuccess, onClose }) {
  const origin = (() => { try { return new URL(url).origin; } catch { return ''; } })();
  const cb = useRef({ onSuccess, onClose });
  useEffect(() => { cb.current = { onSuccess, onClose }; });
  useEffect(() => {
    const onMsg = (e) => {
      if (!origin || e.origin !== origin) return;
      let d = e.data;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return; } }
      if (!d || d.source !== 'growRegister') return;
      if (d.action === 'success') cb.current.onSuccess();
      else if (d.action === 'close') cb.current.onClose();
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [origin]);
  if (!origin) return null;
  return (
    <div data-testid="grow-reg-frame" style={{ marginTop: 12, border: '1px solid var(--line)', borderRadius: 'var(--r-md)', overflow: 'hidden', background: 'var(--surface)', boxShadow: 'var(--shadow-sm)' }}>
      <iframe src={url} title="טופס ההרשמה של Grow" style={{ width: '100%', height: 640, border: 0, display: 'block' }} />
      <button type="button" onClick={onClose} style={{ width: '100%', minHeight: 46, border: 0, borderTop: '1px solid var(--line)', background: 'var(--surface-2)', fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer', color: 'var(--ink)' }}>סגירת הטופס</button>
    </div>
  );
}

const STEP_TEXT = ['ממלאים כאן תעודת זהות או מספר עוסק ונייד', 'מגיע SMS מ-Grow עם טופס קצר', 'Grow מאשרת, והסליקה נפתחת כאן לבד'];

/** The three steps, the way the ads list things: a round mark and one short line. Each state: done | active | todo. */
function Steps({ states, sub }) {
  return (
    <ol data-testid="grow-reg-steps" style={{ listStyle: 'none', margin: '0 0 16px', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {STEP_TEXT.map((t, i) => {
        const st = states[i];
        return (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span aria-hidden style={{
              width: 26, height: 26, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700,
              background: st === 'done' ? 'var(--k-sage, #DCE4D5)' : st === 'active' ? 'var(--pc)' : 'transparent',
              color: st === 'done' ? 'var(--brand-accent, #1F3A30)' : st === 'active' ? 'var(--pc-contrast)' : 'var(--ink-3)',
              border: st === 'todo' ? '1.5px solid var(--line-2)' : 'none',
            }}>
              {st === 'done'
                ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>
                : i + 1}
            </span>
            <span style={{ paddingTop: 3, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 'var(--t-md)', color: st === 'todo' ? 'var(--ink-3)' : 'var(--ink)', fontWeight: st === 'active' ? 700 : 400, lineHeight: 1.5 }}>{t}</span>
              {sub && sub[i] && <span style={{ display: 'block', fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.6, marginTop: 2 }}>{sub[i]}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function GrowRegistration({ registration, pc, isDemo, busy, onStart, onFallback, onHaveAccount, onFormDone, frameOrigin }) {
  const [form, setForm] = useState({ businessNumber: '', phone: '' });
  const [failure, setFailure] = useState(null); // { code, error, growId }
  const [sent, setSent] = useState(null); // { phoneMasked, url } right after a successful GetLink
  const [fixPhone, setFixPhone] = useState(false);
  const [frame, setFrame] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const text = { fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.7, margin: 0 };
  const label = { display: 'block', fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink-2)', marginBottom: 6 };
  const inp = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '11px 12px', fontSize: 'var(--t-lg)', fontFamily: 'inherit', outline: 'none', background: 'var(--surface)', color: 'var(--ink)', minHeight: 46, direction: 'ltr', textAlign: 'right' };
  // Her accent, filled: the one primary action. Disabled turns neutral (not a washed-out accent), so it reads "not yet", never broken.
  const primary = (off) => ({
    width: '100%', minHeight: 48, borderRadius: 'var(--r-full)', border: 0, background: off ? 'var(--surface-2)' : pc, color: off ? 'var(--ink-3)' : 'var(--pc-contrast)',
    fontSize: 'var(--t-lg)', fontWeight: 700, fontFamily: 'inherit', cursor: off ? 'not-allowed' : 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', boxShadow: off ? 'none' : 'var(--shadow-accent)',
  });
  const link = { background: 'none', border: 0, padding: '8px 0', fontFamily: 'inherit', fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 };
  const soft = { background: 'var(--k-petal, #FBEDE9)', borderRadius: 'var(--r-md)', padding: '12px 14px' };
  const bn = digits(form.businessNumber);
  const ph0 = digits(form.phone);
  const ph = ph0.startsWith('972') ? '0' + ph0.slice(3) : ph0;
  const ok = bn.length >= 5 && bn.length <= 9 && /^05\d{8}$/.test(ph);
  const off = busy || isDemo || !ok;

  const start = async () => {
    setFailure(null);
    const r = await onStart({ businessNumber: bn, phone: ph });
    if (!r) return;
    if (r.success) { setSent({ phoneMasked: r.phoneMasked || '', url: r.url || '' }); setFixPhone(false); }
    else setFailure({ code: r.code || '', error: r.error || 'לא הצלחנו לפתוח את ההרשמה, נסי שוב', growId: r.growId || '' });
  };

  const fields = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label>
        <span style={label}>תעודת זהות או מספר עוסק</span>
        <input value={form.businessNumber} onChange={set('businessNumber')} inputMode="numeric" autoComplete="off" placeholder="9 ספרות" style={inp} />
      </label>
      <label>
        <span style={label}>נייד</span>
        <input value={form.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" placeholder="05X-XXXXXXX" style={inp} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-sm)', color: 'var(--ink-2)', marginTop: 6, lineHeight: 1.5 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden style={{ flexShrink: 0 }}><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></svg>
          ה-SMS יגיע לנייד הזה, ואת הטופס ממלאים מהטלפון הזה.
        </span>
      </label>
      {failure && (
        <div data-testid="grow-reg-error" role="alert" style={soft}>
          <p style={{ ...text, color: 'var(--ink)', fontWeight: 700 }}>{failure.error}</p>
          {failure.code === 'exists' && onHaveAccount && (
            <button type="button" style={{ ...primary(false), marginTop: 10 }} onClick={onHaveAccount}>יש לי חשבון Grow</button>
          )}
          {failure.growId && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', margin: '6px 0 0' }}>קוד שגיאה <bdi>{failure.growId}</bdi></p>}
        </div>
      )}
    </div>
  );

  const waiting = sent || (registration && registration.status === 'waiting');
  if (waiting && !fixPhone) {
    const url = (sent && sent.url) || (registration && registration.url) || '';
    // In the card only when the page's CSP allows exactly that origin; otherwise Grow's own page in a new tab.
    const canFrame = (() => { try { return !!url && !!frameOrigin && new URL(url).origin === frameOrigin; } catch { return false; } })();
    const smsLine = sent && sent.phoneMasked
      ? <>נשלח לנייד <span dir="ltr">{sent.phoneMasked}</span>. ממלאים מהטלפון הזה, או כאן.</>
      : 'ממלאים מה-SMS, או כאן.';
    return (
      <div data-testid="grow-reg-waiting">
        <Steps states={['done', 'active', 'todo']} sub={[null, smsLine, 'בדרך כלל תוך כמה ימי עבודה.']} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
          {canFrame && !frame && <button type="button" style={primary(false)} onClick={() => setFrame(true)}>למלא את הטופס כאן</button>}
          {url && !canFrame && <a href={url} target="_blank" rel="noreferrer" style={primary(false)}>לפתוח את הטופס של Grow</a>}
          <button type="button" style={{ ...link, alignSelf: 'center' }} onClick={() => { setFixPhone(true); setFrame(false); }}>הנייד לא נכון?</button>
        </div>
        {canFrame && frame && (
          <GrowFormFrame url={url} onClose={() => setFrame(false)} onSuccess={() => { setFrame(false); onFormDone?.(); }} />
        )}
      </div>
    );
  }

  if (fixPhone) {
    return (
      <div data-testid="grow-reg-fix-phone">
        <p style={{ ...text, marginBottom: 12 }}>אותו מספר עוסק, והנייד הנכון. Grow תעדכן את אותה בקשה ותשלח SMS חדש.</p>
        {fields}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 4, marginTop: 14 }}>
          <button type="button" disabled={off} onClick={start} style={primary(off)}>{busy ? 'שולחת…' : 'עדכון הנייד'}</button>
          <button type="button" style={{ ...link, alignSelf: 'center' }} onClick={() => setFixPhone(false)}>חזרה</button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="grow-reg-form">
      {registration && registration.status === 'rejected' && (
        <div data-testid="grow-reg-rejected" style={{ ...soft, marginBottom: 14 }}>
          <p style={{ ...text, fontWeight: 700, color: 'var(--ink)' }}>Grow לא אישרה את פתיחת החשבון</p>
          {registration.message && <p style={text}>מה שנמסר מ-Grow: {registration.message}</p>}
          <p style={text}>אפשר לנסות שוב עם פרטים מעודכנים, או להשאיר פרטים ונעזור.</p>
        </div>
      )}
      <p style={{ ...text, fontSize: 'var(--t-md)', color: 'var(--ink)', marginBottom: 12 }}>פותחים חשבון סליקה ב-Grow בשלושה צעדים. התשלומים נכנסים לחשבון שלך, ו-Grow מפיקה את הקבלה.</p>
      <Steps states={['active', 'todo', 'todo']} />
      {fields}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 4, marginTop: 14 }}>
        {/* When Grow says she already has an account, that door is the primary one and this steps back to an outline. */}
        <button type="button" disabled={off} onClick={start}
          style={failure && failure.code === 'exists' && !off ? { ...primary(false), background: 'transparent', color: 'var(--pc-text)', border: `1.5px solid ${pc}`, boxShadow: 'none' } : primary(off)}>
          {busy ? 'פותחת את ההרשמה…' : 'פתיחת חשבון ב-Grow'}
        </button>
        <p style={{ ...text, fontSize: 'var(--t-xs)', textAlign: 'center', color: 'var(--ink-3)', marginTop: 6 }}>בלי כרטיס אשראי ובלי חיוב.</p>
        <button type="button" style={{ ...link, alignSelf: 'center' }} onClick={onFallback}>מעדיפה שנחזור אלייך? להשאיר פרטים</button>
      </div>
    </div>
  );
}
