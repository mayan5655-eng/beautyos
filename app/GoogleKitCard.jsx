'use client';

// app/GoogleKitCard.jsx
//
// The content tab: "להימצא בגוגל". Three parts, all in lib/googleKit.ts:
//   1. her Google Business Profile checklist with a score: what Kalmea already knows is ticked for her, the rest she ticks
//      herself (saved in settings.automations.google_kit through onSaveTicks, like the booking buttons' ticks);
//   2. the writer: a profile description, 4 posts for the month and 15 local search phrases (POST /api/marketing/google-kit,
//      metered like every AI feature);
//   3. a first search ad: 3 headlines, 2 descriptions, her tagged link and a starting budget as guidance. She sets it up in
//      her own Google Ads account; Kalmea spends nothing.
// Nothing is published to Google: there is no access to her account, every text is a copy button, and the card says so.
// Hidden behind NEXT_PUBLIC_GOOGLE_KIT: off (empty) renders nothing at all.
//
// Props:
//   settings     her settings row (automations, branding, review_url, hours, business_phone, business_fields)
//   bookingUrl   her booking link, untagged (her short address when she has one)
//   serviceNames her active treatment names
//   onSaveTicks(next) -> Promise<boolean>   saves automations.google_kit; false = not saved (the tick goes back)
//   toast(msg, kind?)

import { useMemo, useState } from 'react';
import {
  googleKitEnabled, googleLink, suggestCategories, categoriesText, hoursLinesHe, CHECKLIST, checklistState, withTick,
  scoreLineHe, googlePhoneOf, LIMITS, ADS_BUDGET_HE,
} from '@/lib/googleKit';
import { parseClinicAddress } from '@/lib/ai/profileHygiene';

const box = { border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', background: 'var(--surface)' };
const smallBtn = { background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '8px 12px', minHeight: 36, fontSize: 'var(--t-xs)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' };
const mainBtn = { background: 'var(--brand-deep)', color: 'var(--brand-contrast)', border: 'none', borderRadius: 'var(--r-sm)', padding: '11px 16px', minHeight: 44, fontSize: 'var(--t-sm)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const inp = { width: '100%', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '9px 11px', fontSize: 'var(--t-sm)', fontFamily: 'inherit', background: 'var(--surface)', color: 'var(--ink)', boxSizing: 'border-box' };

function CopyRow({ text, onCopy, label = 'העתקה', testId, ltr = false, count = null }) {
  return (
    <div data-testid={testId} style={{ ...box, display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 10px', flexWrap: 'wrap' }}>
      <span dir={ltr ? 'ltr' : 'rtl'} style={{ flex: '1 1 200px', minWidth: 0, fontSize: 'var(--t-sm)', color: 'var(--ink)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: ltr ? 'break-all' : 'normal', textAlign: ltr ? 'left' : 'right' }}>{text}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {count && <span style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{count}</span>}
        <button type="button" onClick={() => onCopy(text)} style={smallBtn}>{label}</button>
      </span>
    </div>
  );
}

export default function GoogleKitCard({ settings, bookingUrl, serviceNames = [], onSaveTicks, toast }) {
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(null);
  const [saving, setSaving] = useState('');
  const [localTicks, setLocalTicks] = useState(null);
  const [years, setYears] = useState('');
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState('');
  const [profileKit, setProfileKit] = useState(null);
  const [adsKit, setAdsKit] = useState(null);
  const [error, setError] = useState({ profile: '', ads: '' });
  const [capNotice, setCapNotice] = useState('');

  const s = settings || {};
  const branding = (s.branding && typeof s.branding === 'object') ? s.branding : {};
  const automations = localTicks ? { ...(s.automations || {}), google_kit: localTicks } : s.automations;
  const state = useMemo(() => checklistState({ automations, branding, reviewUrl: s.review_url }), [automations, branding, s.review_url]);
  const cats = useMemo(() => suggestCategories(s.business_fields, serviceNames), [s.business_fields, serviceNames]);
  const hours = useMemo(() => hoursLinesHe(s), [s]);
  const phone = googlePhoneOf(s);
  const gbpLink = googleLink(bookingUrl, 'gbp');
  const cpcLink = googleLink(bookingUrl, 'cpc');
  const savedCity = parseClinicAddress(branding.public_address)?.city || '';

  if (!googleKitEnabled()) return null;

  const copy = async (text) => {
    if (!text) return;
    try { await navigator.clipboard.writeText(text); toast && toast('הועתק. עכשיו מדביקים בגוגל'); }
    catch { toast && toast('אי אפשר להעתיק כאן. אפשר לסמן את הטקסט ולהעתיק ידנית', 'info'); }
  };

  const toggle = async (key, on) => {
    if (saving || !onSaveTicks) return;
    const next = withTick(automations, key, on);
    setLocalTicks(next);
    setSaving(key);
    await onSaveTicks(next);
    setSaving('');
    setLocalTicks(null);
  };

  const generate = async (kind) => {
    if (busy) return;
    setBusy(kind);
    setError((e) => ({ ...e, [kind]: '' }));
    try {
      const r = await fetch('/api/marketing/google-kit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, years: years || undefined, city: savedCity ? undefined : (city || undefined) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'לא הצלחתי לכתוב הפעם. אפשר לנסות שוב בעוד רגע.');
      if (j.capNotice) setCapNotice(j.capNotice);
      if (kind === 'ads') setAdsKit({ headlines: j.headlines || [], descriptions: j.descriptions || [] });
      else setProfileKit({ description: j.description || '', posts: j.posts || [], keywords: j.keywords || [] });
    } catch (e) {
      setError((x) => ({ ...x, [kind]: (e && e.message) || 'לא הצלחתי לכתוב הפעם. אפשר לנסות שוב בעוד רגע.' }));
    } finally {
      setBusy('');
    }
  };

  const copyArea = (item) => {
    if (item.copy === 'categories') return <CopyRow testId="gk-copy-categories" text={categoriesText(cats)} onCopy={copy} />;
    if (item.copy === 'hours') {
      return hours.length
        ? <CopyRow testId="gk-copy-hours" text={hours.join('\n')} onCopy={copy} />
        : <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)' }}>שעות הפתיחה עוד לא מולאו בקלמיה. אחרי שתמלאי אותן בהגדרות, הן יופיעו כאן להעתקה.</p>;
    }
    if (item.copy === 'phone') return phone ? <CopyRow testId="gk-copy-phone" text={phone} onCopy={copy} ltr /> : null;
    if (item.copy === 'booking') return gbpLink ? <CopyRow testId="gk-copy-booking" text={gbpLink} onCopy={copy} label="העתקת הקישור" ltr /> : null;
    if (item.copy === 'description') {
      return profileKit?.description
        ? <CopyRow testId="gk-copy-description" text={profileKit.description} onCopy={copy} count={`${profileKit.description.length}/${LIMITS.description}`} />
        : null;
    }
    return null;
  };

  const doneCount = state.done;
  const barColor = state.score >= 100 ? 'var(--success)' : 'var(--brand-deep)';

  return (
    <section data-testid="google-kit" className="glass-card" style={{ padding: 18, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <h3 className="serif" style={{ flex: 1, fontSize: 'var(--t-xl)', fontWeight: 600, color: 'var(--ink)', margin: 0 }}>להימצא בגוגל</h3>
        <span data-testid="google-kit-score" style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: state.score >= 100 ? 'var(--success)' : 'var(--ink)' }}>{state.score}%</span>
      </div>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.6, margin: 0 }}>
        כשמישהי מחפשת טיפול באזור שלך, הפרופיל העסקי בגוגל הוא הדבר הראשון שהיא רואה. כאן תמצאי מה למלא שם, טקסטים מוכנים וקישור לקביעת תור.
        קלמיה לא מחוברת לחשבון הגוגל שלך ולא מפרסמת שם כלום: את מעתיקה ומדביקה.
      </p>
      <div aria-hidden style={{ height: 8, borderRadius: 'var(--r-full)', background: 'var(--line)', overflow: 'hidden' }}>
        <div style={{ width: `${state.score}%`, height: '100%', background: barColor, borderRadius: 'var(--r-full)' }} />
      </div>
      <p data-testid="google-kit-score-line" style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', margin: 0 }}>{doneCount} מתוך {state.total} · {scoreLineHe(state.score)}</p>
      <button type="button" data-testid="google-kit-toggle" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} style={{ ...smallBtn, alignSelf: 'flex-start', fontSize: 'var(--t-sm)', padding: '9px 14px', minHeight: 40 }}>
        {expanded ? 'סגירה' : state.done ? 'להמשיך מאיפה שעצרתי' : 'בואי נתחיל'}
      </button>

      {expanded && (<>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {CHECKLIST.map((item) => {
          const st = state.items.find((x) => x.key === item.key);
          const isOpen = open === item.key;
          return (
            <li key={item.key} data-testid={`gk-item-${item.key}`} style={{ ...box, background: isOpen ? 'var(--surface-2)' : 'var(--surface)' }}>
              <button type="button" onClick={() => setOpen(isOpen ? null : item.key)} aria-expanded={isOpen}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', minHeight: 48, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'right' }}>
                <span aria-hidden style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--t-xs)', fontWeight: 700, background: st.done ? 'var(--success)' : 'var(--line)', color: st.done ? '#FFFFFF' : 'var(--ink-2)' }}>{st.done ? '✓' : ''}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)' }}>{item.title}</span>
                  <span style={{ display: 'block', fontSize: 'var(--t-xs)', color: 'var(--ink-2)', marginTop: 1, lineHeight: 1.5 }}>{item.why}</span>
                </span>
                <span aria-hidden style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)' }}>{isOpen ? '▲' : '▼'}</span>
              </button>
              {isOpen && (
                <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <ol style={{ margin: 0, paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {item.steps.map((step, i) => <li key={i} style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)', lineHeight: 1.6 }}>{step}</li>)}
                  </ol>
                  {item.copy === 'categories' && (
                    <ul data-testid="gk-categories" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {cats.map((c) => (
                        <li key={c.en} style={{ fontSize: 'var(--t-xs)', fontWeight: 600, padding: '5px 10px', borderRadius: 'var(--r-full)', border: '1px solid var(--line-2)', background: c.primary ? 'var(--surface-2)' : 'var(--surface)', color: 'var(--ink)' }}>
                          {c.he} / <span dir="ltr">{c.en}</span>{c.primary ? ' · ראשית' : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                  {copyArea(item)}
                  {st.auto ? (
                    <p style={{ fontSize: 'var(--t-xs)', fontWeight: 700, color: 'var(--success)', margin: 0 }}>קלמיה כבר רואה שזה מוכן ✓</p>
                  ) : (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: saving ? 'wait' : 'pointer', fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--ink)', minHeight: 40 }}>
                      <input type="checkbox" checked={st.done} disabled={!!saving} onChange={(e) => toggle(item.key, e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--success)' }} data-testid={`gk-done-${item.key}`} />
                      {item.weekly ? 'פרסמתי השבוע' : 'סימנתי שעשיתי'}
                      {saving === item.key && <span style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', fontWeight: 500 }}>שומרת…</span>}
                    </label>
                  )}
                  {item.weekly && st.stale && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', margin: 0 }}>עבר שבוע מהפוסט האחרון שסימנת. הגיע הזמן לפוסט חדש 🌸</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* 2. The writer */}
      <div data-testid="google-kit-writer" style={{ borderTop: '1px solid var(--line)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>טקסטים מוכנים לפרופיל בגוגל</p>
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.6, margin: 0 }}>תיאור לעסק, 4 פוסטים לחודש ו-15 ביטויים שלקוחות מחפשות באזור שלך, לפי הטיפולים שלך. את בודקת, מעתיקה ומדביקה.</p>
        <div style={{ display: 'grid', gridTemplateColumns: savedCity ? '1fr' : '1fr 1fr', gap: 8 }}>
          <label style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', fontWeight: 600 }}>כמה שנים את בתחום (לא חובה)
            <input inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="למשל 8" style={{ ...inp, marginTop: 4 }} />
          </label>
          {!savedCity && (
            <label style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', fontWeight: 600 }}>העיר שלך
              <input value={city} onChange={(e) => setCity(e.target.value.slice(0, 40))} placeholder="למשל חולון" style={{ ...inp, marginTop: 4 }} />
            </label>
          )}
        </div>
        <button type="button" data-testid="gk-generate-profile" onClick={() => generate('profile')} disabled={!!busy} style={{ ...mainBtn, opacity: busy ? 0.7 : 1, alignSelf: 'flex-start' }}>
          {busy === 'profile' ? 'כותבת…' : profileKit ? 'כתבי לי גרסה אחרת' : 'כתבי לי טקסטים לגוגל'}
        </button>
        {error.profile && <p role="alert" style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', fontWeight: 600, margin: 0 }}>{error.profile}</p>}
        {capNotice && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', margin: 0 }}>{capNotice}</p>}
        {profileKit && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {profileKit.description && (<>
              <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', margin: '4px 0 0' }}>תיאור העסק</p>
              <CopyRow testId="gk-description" text={profileKit.description} onCopy={copy} count={`${profileKit.description.length}/${LIMITS.description}`} />
            </>)}
            {profileKit.posts.length > 0 && (<>
              <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', margin: '4px 0 0' }}>פוסטים לחודש, אחד לשבוע</p>
              {profileKit.posts.map((p, i) => <CopyRow key={i} testId={`gk-post-${i}`} text={p} onCopy={copy} />)}
            </>)}
            {profileKit.keywords.length > 0 && (<>
              <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', margin: '4px 0 0' }}>ביטויים שלקוחות מחפשות</p>
              <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', margin: 0 }}>משלבים אותם בטבעיות בתיאור ובפוסטים, לא כרשימה.</p>
              <CopyRow testId="gk-keywords" text={profileKit.keywords.join('\n')} onCopy={copy} label="העתקת הכל" />
            </>)}
          </div>
        )}
      </div>

      {/* 3. Paid search: a starter guide, in her own Google Ads account */}
      <div data-testid="google-kit-ads" style={{ borderTop: '1px solid var(--line)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>פרסום ממומן בגוגל</p>
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.6, margin: 0 }}>
          מדריך התחלה בלבד. המודעה עולה בחשבון Google Ads שלך, והתשלום הוא ישירות לגוגל, לפי התקציב שתבחרי. קלמיה לא נכנסת לחשבון ולא גובה כלום.
        </p>
        <ul style={{ margin: 0, paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {ADS_BUDGET_HE.lines.map((l, i) => <li key={i} style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)', lineHeight: 1.6 }}>{l}</li>)}
        </ul>
        {cpcLink && (<>
          <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', margin: 0 }}>הקישור שהמודעה מובילה אליו (מסומן, כדי שתראי בדוח המקורות כמה תורים הגיעו מהמודעה):</p>
          <CopyRow testId="gk-copy-cpc" text={cpcLink} onCopy={copy} label="העתקת הקישור" ltr />
        </>)}
        <button type="button" data-testid="gk-generate-ads" onClick={() => generate('ads')} disabled={!!busy} style={{ ...mainBtn, opacity: busy ? 0.7 : 1, alignSelf: 'flex-start' }}>
          {busy === 'ads' ? 'כותבת…' : adsKit ? 'כתבי לי גרסה אחרת' : 'כתבי לי מודעה ראשונה'}
        </button>
        {error.ads && <p role="alert" style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', fontWeight: 600, margin: 0 }}>{error.ads}</p>}
        {adsKit && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {adsKit.headlines.length > 0 && <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', margin: '4px 0 0' }}>כותרות (עד {LIMITS.headline} תווים)</p>}
            {adsKit.headlines.map((h, i) => <CopyRow key={`h${i}`} testId={`gk-headline-${i}`} text={h} onCopy={copy} count={`${h.length}/${LIMITS.headline}`} />)}
            {adsKit.descriptions.length > 0 && <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', margin: '4px 0 0' }}>תיאורים (עד {LIMITS.adDescription} תווים)</p>}
            {adsKit.descriptions.map((d, i) => <CopyRow key={`d${i}`} testId={`gk-addesc-${i}`} text={d} onCopy={copy} count={`${d.length}/${LIMITS.adDescription}`} />)}
          </div>
        )}
      </div>
      </>)}
    </section>
  );
}
