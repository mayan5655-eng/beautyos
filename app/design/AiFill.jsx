'use client';

// app/design/AiFill.jsx
//
// AI as one way to fill a design. She types a brief; the Creative Director
// returns the words for this template (applied to the fields like typed
// text), the post copy, and three creative directions. Each direction can
// become a picture - one call, one image, her accent and offer in the brief,
// never any text inside the picture - and "וריאציה נוספת" asks for another
// take on the same direction. Everything lands in the fill form's state;
// saving is the same save button.

import { useState } from 'react';
import Icon from '../Icon';
import Spinner from '../Spinner';

const box = { border: '1px dashed var(--pc)', borderRadius: 'var(--r-md)', padding: '14px 14px 12px', marginBottom: 14, background: 'var(--pc-tint)' };
const input = { width: '100%', border: '1px solid var(--line-2)', borderRadius: 'var(--r-xs)', padding: '10px 12px', fontSize: 'var(--t-sm)', fontFamily: 'inherit', background: 'var(--surface)' };
const btn = { padding: '9px 14px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--pc-deep)', fontSize: 'var(--t-sm)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 40 };

export default function AiFill({ template, designId, imageSlot, readOnly, onValues, onImage, onCopy, toast }) {
  const [brief, setBrief] = useState('');
  const [state, setState] = useState('idle'); // idle | filling | done
  const [result, setResult] = useState(null);
  const [imgBusy, setImgBusy] = useState(-1);
  const [takes, setTakes] = useState({}); // direction index -> { count, lastUrl }
  const [error, setError] = useState('');
  const [spent, setSpent] = useState(0);

  const fill = async () => {
    if (readOnly) { toast?.('החשבון במצב קריאה בלבד', 'error'); return; }
    if (brief.trim().length < 3) { setError('כתבי מה הפוסט צריך להגיד, למשל: טיפול פנים קלאסי במבצע 249 ₪'); return; }
    setError(''); setState('filling');
    try {
      const res = await fetch('/api/designs/ai-fill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateKey: template.key, templateVersion: template.version, brief }) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'ה-AI לא ענה');
      setResult(data); setTakes({});
      onValues?.(data.values || {});
      onCopy?.(data.copy || null);
      setState('done');
      toast?.('הטקסטים מולאו. אפשר לשנות כל מילה.');
    } catch (e) { setError(String(e.message || e)); setState('idle'); }
  };

  const makeImage = async (i, variation) => {
    if (readOnly || !imageSlot) return;
    setImgBusy(i); setError('');
    try {
      const res = await fetch('/api/designs/ai-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ designId, direction: result.directions[i], variation }) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'התמונה לא נוצרה');
      setTakes((t) => ({ ...t, [i]: { count: variation + 1, lastUrl: data.url } }));
      if (typeof data.costUsd === 'number') setSpent((s) => s + data.costUsd);
      onImage?.(imageSlot.key, data.url);
      // Warn well before the wall, once it is close, so a limit is never a surprise.
      const left = Number.isFinite(data.capLimit) && Number.isFinite(data.capUsed) ? data.capLimit - data.capUsed : null;
      const note = left === null || left > 5 ? '' : left <= 0 ? ' זו הייתה התמונה האחרונה החודש, והן מתחדשות בתחילת החודש הבא.' : left === 1 ? ' נשארה לך עוד תמונה אחת החודש.' : ' נשארו לך עוד ' + left + ' תמונות החודש.';
      toast?.((variation ? 'וריאציה חדשה נכנסה לעיצוב.' : 'התמונה נכנסה לעיצוב.') + note);
    } catch (e) { setError(String(e.message || e)); } finally { setImgBusy(-1); }
  };

  const copyText = async () => {
    const text = [result?.copy?.text || '', (result?.copy?.hashtags || []).join(' ')].filter(Boolean).join('\n\n');
    try { await navigator.clipboard.writeText(text); toast?.('הטקסט לפוסט הועתק'); } catch { toast?.(text, 'info'); }
  };

  return (
    <div style={box}>
      <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}><Icon name="sparkle" size={14} /> מילוי עם AI</p>
      <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 8 }}>משפט אחד, וה-AI כותב את הטקסטים לתבנית, טקסט לפוסט ושלושה כיוונים לתמונה. דרך אחת למלא, לא היחידה.</p>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="לדוגמה: טיפול פנים קלאסי במבצע 249 ₪" style={{ ...input, flex: 1 }} dir="rtl" maxLength={400} onKeyDown={(e) => { if (e.key === 'Enter') fill(); }} />
        <button onClick={fill} disabled={state === 'filling' || readOnly} className="primary-btn" style={{ padding: '10px 16px', background: 'var(--pc-grad)', color: 'var(--pc-contrast)', fontSize: 'var(--t-sm)', whiteSpace: 'nowrap', opacity: state === 'filling' || readOnly ? 0.6 : 1 }}>
          {state === 'filling' ? <Spinner inline label="כותבת" /> : 'מלאי'}
        </button>
      </div>
      {error && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', marginTop: 8 }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 12 }}>
          {result.copy?.text && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '10px 12px', marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 'var(--t-xs)', fontWeight: 700, color: 'var(--ink-3)' }}>טקסט לפוסט</span>
                <button onClick={copyText} style={{ ...btn, minHeight: 32, padding: '4px 10px' }}><Icon name="copy" size={12} /> העתקה</button>
              </div>
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{result.copy.text}</p>
              {result.copy.hashtags?.length > 0 && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--pc-deep)', marginTop: 6 }}>{result.copy.hashtags.join(' ')}</p>}
            </div>
          )}
          {imageSlot ? (
            <>
              <p style={{ fontSize: 'var(--t-xs)', fontWeight: 700, color: 'var(--ink-3)', marginBottom: 6 }}>שלושה כיוונים לתמונה · כל תמונה עולה כ-50 אגורות ולוקחת עד דקה</p>
              <div style={{ display: 'grid', gap: 8 }}>
                {result.directions.map((d, i) => {
                  const take = takes[i];
                  return (
                    <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'center' }}>
                      {take?.lastUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- a fresh AI picture, its own size
                        <img src={take.lastUrl} alt="" style={{ width: 56, height: 70, objectFit: 'cover', borderRadius: 'var(--r-xs)', flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)' }}>{d.name}</p>
                        <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', lineHeight: 1.45 }}>{d.concept}</p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <button onClick={() => makeImage(i, 0)} disabled={imgBusy >= 0 || readOnly} style={btn}>{imgBusy === i ? <Spinner inline label="מציירת" /> : take ? 'שוב מההתחלה' : 'צרי תמונה'}</button>
                        {take && <button onClick={() => makeImage(i, take.count)} disabled={imgBusy >= 0 || readOnly} style={btn}><Icon name="refresh" size={12} /> וריאציה נוספת</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {spent > 0 && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginTop: 8 }}>עלות התמונות בסבב הזה: כ-{(spent * 3.7).toFixed(2)} ₪</p>}
            </>
          ) : (
            <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)' }}>לתבנית הזו אין מקום לתמונת AI; הטקסטים מולאו.</p>
          )}
        </div>
      )}
    </div>
  );
}
