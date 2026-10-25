'use client';
// app/GreetingsPanel.jsx
//
// Settings > הודעות: personal greetings (birthday, "שנה אצלי", holiday). Every switch starts OFF. Turning one on shows who would get
// what this week, with a tick per name she can remove, and nothing is saved until she presses "שמרי". The rules (consent, Shabbat,
// once a year, daily cap) live in lib/greetings; this file only shows them.
//
// Honesty: greetings are queued in "הודעות מוכנות לשליחה" and she sends each from her own WhatsApp. Nothing here says "sent" for a
// message that is only waiting (lib/waStatusLabel.js decides each status word).
import { useCallback, useEffect, useRef, useState } from 'react';
import { waStatusLabel } from '@/lib/waStatusLabel';
import { hebrewDateShort } from '@/lib/messages.js';
import { skipKey } from '@/lib/greetings/greetings.js';

const OCC = [
  { key: 'birthday', icon: '🎂', title: 'יום הולדת', sub: 'ביום ההולדת של הלקוחה' },
  { key: 'anniversary', icon: '🌸', title: 'שנה אצלי', sub: 'כשמלאה שנה מהביקור הראשון שלה אצלך' },
  { key: 'holiday', icon: '🌿', title: 'ברכת חג', sub: 'יומיים לפני החג שבחרת' },
];
const ariaOf = (o) => (o.key === 'holiday' ? o.title : `ברכת ${o.title}`);
const OCC_LABEL = { birthday: 'יום הולדת', anniversary: 'שנה אצלי', holiday: 'חג' };
const HELD_LABEL = {
  no_consent: (n) => `${n} לקוחות בלי אישור דיוור לא יקבלו`,
  no_phone: (n) => `${n} בלי מספר טלפון תקין`,
  already_sent: (n) => `${n} כבר קיבלו השנה`,
  one_a_day: (n) => `${n} יחכו ליום אחר (ברכה אחת ביום ללקוחה)`,
};
const WINDOW_NOTE = {
  shabbat: 'עכשיו שבת, אז שום דבר לא נכנס לרשימה. זה יחכה למוצאי שבת.',
  'saturday-night-done': 'ברכות שהגיע זמנן ייכנסו לרשימה מחר.',
  holiday: 'עכשיו חג, אז שום דבר לא נכנס לרשימה עד שהחג יוצא.',
  night: 'ברכות נכנסות לרשימה רק בשעות היום.',
};

const card = { border: '1px solid var(--line)', borderRadius: 'var(--r-md, 14px)', background: 'var(--surface)', padding: 12, marginBottom: 10 };
const field = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--line-2)', borderRadius: 'var(--r-xs)', padding: '9px 10px', fontSize: 16, fontFamily: 'inherit', background: 'var(--surface)', direction: 'rtl' };
const small = { fontSize: 'var(--t-xs)', color: 'var(--ink-3)', lineHeight: 1.5 };

function Switch({ on, onChange, label, pc }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      style={{ flexShrink: 0, width: 52, height: 44, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ width: 46, height: 26, borderRadius: 13, background: on ? (pc || 'var(--brand-deep, #1F3A30)') : 'var(--line-2)', position: 'relative', transition: 'background .15s' }}>
        <span style={{ position: 'absolute', top: 3, insetInlineStart: on ? 23 : 3, width: 20, height: 20, borderRadius: 10, background: '#fff', transition: 'inset-inline-start .15s', boxShadow: '0 1px 2px rgba(0,0,0,.25)' }} />
      </span>
    </button>
  );
}

export default function GreetingsPanel({ pc, toast }) {
  const [loaded, setLoaded] = useState(null); // what the server has: { config, plan, recent, holidays, defaultTexts, window }
  const [draft, setDraft] = useState(null);
  const [plan, setPlan] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | error
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const saved = useRef(null);
  const seq = useRef(0);

  const post = useCallback(async (action, config) => {
    const r = await fetch('/api/greetings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, config }) });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d?.success) throw new Error(d?.error || 'לא הצלחנו, אפשר לנסות שוב בעוד רגע');
    return d;
  }, []);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const r = await fetch('/api/greetings', { cache: 'no-store' });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.success) throw new Error(d?.error || 'x');
      setLoaded(d); setDraft(d.config); setPlan(d.plan); saved.current = JSON.stringify(d.config); setState('ready');
    } catch { setState('error'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // The preview follows the draft, so switching a greeting on shows who would get it before anything is saved.
  const refresh = useCallback(async (next) => {
    const mine = ++seq.current;
    try {
      const d = await post('preview', next);
      if (mine === seq.current) setPlan(d.plan);
    } catch { /* the previous preview stays; saving still works */ }
  }, [post]);

  const change = (patch) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    refresh(next);
  };
  const setOcc = (k, patch) => change({ [k]: { ...draft[k], ...patch } });

  const dirty = draft && JSON.stringify(draft) !== saved.current;
  const anyOn = draft && ['birthday', 'anniversary', 'holiday'].some((k) => draft[k].enabled);

  const toggleItem = (it) => {
    const key = skipKey(it.clientId, it.occasion, it.ref);
    const skip = new Set(draft.skip);
    if (skip.has(key)) skip.delete(key); else skip.add(key);
    change({ skip: [...skip] });
  };

  const save = async () => {
    setBusy(true);
    try {
      const d = await post('save', draft);
      setDraft(d.config); setPlan(d.plan); saved.current = JSON.stringify(d.config);
      toast?.(anyOn ? 'נשמר. הברכות יחכו לך ב"הודעות מוכנות לשליחה" ביום שלהן.' : 'נשמר. כל הברכות כבויות.', 'success');
    } catch (e) {
      toast?.(e.message, 'error');
    } finally { setBusy(false); }
  };

  if (state === 'loading') return <p style={small} data-testid="greetings-loading">טוענת את הברכות…</p>;
  if (state === 'error') {
    return (
      <div style={card} data-testid="greetings-error">
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', marginBottom: 8 }}>לא הצלחנו לטעון את הברכות האישיות. אפשר לנסות שוב.</p>
        <button type="button" className="primary-btn" onClick={load} style={{ minHeight: 44, padding: '8px 16px', fontSize: 'var(--t-sm)' }}>נסי שוב</button>
      </div>
    );
  }

  const texts = loaded.defaultTexts;
  const items = plan?.items || [];
  const heldLines = Object.entries(plan?.held || {}).filter(([k]) => HELD_LABEL[k]).map(([k, n]) => HELD_LABEL[k](n));
  const windowNote = WINDOW_NOTE[loaded.window];

  return (
    <div data-testid="greetings-panel">
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', fontWeight: 600, marginBottom: 4 }}>ברכות אישיות ללקוחות</p>
      <p style={{ ...small, marginBottom: 10 }}>
        ברכה קצרה בקול שלך ביום הולדת, כשמלאה שנה מהביקור הראשון, ובחגים. הכול כבוי עד שתדליקי. הברכות מחכות לך ב&quot;הודעות מוכנות לשליחה&quot; ואת שולחת כל אחת בוואטסאפ שלך,
        רק ללקוחות שאישרו דיוור, בלי שבת, חגים ולילה, ברכה אחת בשנה לכל אירוע.
      </p>

      {OCC.map((o) => {
        const cfg = draft[o.key];
        const shown = cfg.text || texts[o.key];
        return (
          <div key={o.key} style={card} data-testid={`greeting-${o.key}`}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)', fontWeight: 600 }}>{o.icon} {o.title}</div>
                <div style={small}>{o.sub}</div>
              </div>
              <Switch on={cfg.enabled} onChange={(v) => setOcc(o.key, { enabled: v })} label={ariaOf(o)} pc={pc} />
            </div>
            {cfg.enabled && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {o.key === 'holiday' && (
                  <div>
                    <div style={{ ...small, marginBottom: 4 }}>באילו חגים?</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {loaded.holidays.map((h) => {
                        const on = cfg.holidays.includes(h.key);
                        return (
                          <button key={h.key} type="button" aria-pressed={on}
                            onClick={() => setOcc('holiday', { holidays: on ? cfg.holidays.filter((x) => x !== h.key) : [...cfg.holidays, h.key] })}
                            style={{ minHeight: 44, padding: '0 14px', borderRadius: 22, border: `1px solid ${on ? (pc || 'var(--brand-deep)') : 'var(--line-2)'}`, background: on ? 'var(--surface-2)' : 'var(--surface)', color: 'var(--ink)', fontSize: 'var(--t-sm)', fontFamily: 'inherit', fontWeight: on ? 700 : 400 }}>
                            {on ? '✓ ' : ''}{h.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--t-xs)', color: 'var(--ink-2)' }}>
                  <span>הנוסח (אפשר לשנות; {'{name}'} שם הלקוחה, {'{clinic}'} שם העסק)</span>
                  <textarea aria-label={`נוסח ${ariaOf(o)}`} rows={4} maxLength={400} value={shown}
                    onChange={(e) => setOcc(o.key, { text: e.target.value === texts[o.key] ? '' : e.target.value })} style={{ ...field, resize: 'vertical', lineHeight: 1.5 }} />
                </label>
                {cfg.text && (
                  <button type="button" onClick={() => setOcc(o.key, { text: '' })} style={{ alignSelf: 'flex-start', minHeight: 44, background: 'none', border: 'none', color: 'var(--ink-2)', textDecoration: 'underline', fontFamily: 'inherit', fontSize: 'var(--t-xs)' }}>חזרה לנוסח המקורי</button>
                )}
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--t-xs)', color: 'var(--ink-2)' }}>
                  <span>מתנה קטנה ממך (לא חובה)</span>
                  <input aria-label={`מתנה ב${ariaOf(o)}`} maxLength={80} value={cfg.gift} placeholder="למשל: שדרוג מתנה בטיפול הבא" onChange={(e) => setOcc(o.key, { gift: e.target.value })} style={field} />
                  {o.key === 'birthday' && !cfg.gift && <span style={small}>ריק? אז תופיע המתנה מ&quot;מתנת יום הולדת בהודעה&quot; אם כתבת שם אחת.</span>}
                </label>
              </div>
            )}
          </div>
        );
      })}

      <div style={card} data-testid="greetings-preview">
        <div style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)', fontWeight: 600, marginBottom: 2 }}>מי תקבל ברכה בשבוע הקרוב</div>
        {!anyOn ? (
          <p style={small}>כל הברכות כבויות, אז שום דבר לא ייכנס לרשימה. כשתדליקי ברכה, כאן תראי מי תקבל אותה לפני שמשהו קורה.</p>
        ) : items.length === 0 ? (
          <p style={small} data-testid="greetings-empty">
            {plan?.clientCount === 0 ? 'עוד אין לקוחות בעסק. כשיהיו, כאן תראי מי תקבל ברכה.' : 'השבוע אין ימי הולדת, ימי "שנה אצלי" או חגים שמתאימים ללקוחות עם אישור דיוור.'}
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {items.map((it) => {
              const k = skipKey(it.clientId, it.occasion, it.ref);
              const isOpen = open === k;
              return (
                <li key={k} style={{ borderTop: '1px solid var(--line)', padding: '4px 0' }} data-testid="greeting-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button type="button" role="checkbox" aria-checked={!it.skipped} aria-label={`${it.name}: ${OCC_LABEL[it.occasion]}`} onClick={() => toggleItem(it)}
                      style={{ width: 44, height: 44, flexShrink: 0, border: 'none', background: 'transparent', fontSize: 22, color: it.skipped ? 'var(--ink-3)' : (pc || 'var(--brand-deep)'), cursor: 'pointer' }}>{it.skipped ? '☐' : '☑'}</button>
                    <button type="button" onClick={() => setOpen(isOpen ? null : k)} aria-expanded={isOpen}
                      style={{ flex: 1, minWidth: 0, minHeight: 44, textAlign: 'start', background: 'none', border: 'none', fontFamily: 'inherit', color: 'var(--ink)', opacity: it.skipped ? 0.5 : 1 }}>
                      <span style={{ fontSize: 'var(--t-sm)', fontWeight: 600 }}>{it.name || 'ללא שם'}</span>
                      <span style={{ ...small, display: 'block' }}>{OCC_LABEL[it.occasion]}{it.holidayKey ? ` · ${loaded.holidays.find((h) => h.key === it.holidayKey)?.name || ''}` : ''} · {it.sendOn === plan.today ? 'היום' : hebrewDateShort(it.sendOn)}</span>
                    </button>
                  </div>
                  {isOpen && <p style={{ ...small, whiteSpace: 'pre-wrap', background: 'var(--surface-2)', borderRadius: 8, padding: 10, margin: '2px 0 8px' }} data-testid="greeting-message">{it.message}</p>}
                </li>
              );
            })}
          </ul>
        )}
        {anyOn && heldLines.length > 0 && <p style={{ ...small, marginTop: 8 }}>{heldLines.join(' · ')}</p>}
        {anyOn && windowNote && <p style={{ ...small, marginTop: 6 }}>{windowNote}</p>}
        <p style={{ ...small, marginTop: 6 }}>ביום שלה, כל ברכה נכנסת ל&quot;הודעות מוכנות לשליחה&quot; ומחכה שתפתחי אותה בוואטסאפ. לא יוצאות יותר מ-{draft.daily_cap} ברכות ביממה.</p>
      </div>

      <button type="button" className="primary-btn" disabled={!dirty || busy} onClick={save} data-testid="greetings-save"
        style={{ minHeight: 48, width: '100%', fontSize: 'var(--t-sm)', opacity: !dirty || busy ? 0.6 : 1 }}>
        {busy ? 'שומרת…' : dirty ? (anyOn ? 'שמרי והפעילי' : 'שמרי') : 'הכול שמור'}
      </button>

      <div style={{ ...card, marginTop: 10 }} data-testid="greetings-recent">
        <div style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)', fontWeight: 600, marginBottom: 4 }}>מה קרה עם הברכות האחרונות</div>
        {loaded.recent.length === 0 ? <p style={small}>עוד לא הוכנו ברכות.</p> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {loaded.recent.slice(0, 8).map((m) => {
              const s = waStatusLabel(m);
              return (
                <li key={m.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderTop: '1px solid var(--line)', fontSize: 'var(--t-xs)' }}>
                  <span style={{ color: 'var(--ink)' }}>{m.recipient_name || 'ללא שם'}</span>
                  <span style={{ color: s.color }}>{s.text}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
