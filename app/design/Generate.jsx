'use client';

// app/design/Generate.jsx
//
// Free-form generation, capped. She types what she wants to post and gets
// two or three finished posts - each already a design in her list, each
// editable like any other. The counter ("3 מתוך 9 החודש") shows before she
// spends one; at the cap the button closes and the templates below stay
// open, because templates are unlimited by design.

import { useEffect, useMemo, useState } from 'react';
import Icon from '../Icon';
import Spinner from '../Spinner';
import DomPreview from './DomPreview';
import { getTemplate } from '@/lib/design/templates';
import { getReel } from '@/lib/design/reels';
import { fillReel } from '@/lib/design/reel';
import { fillTemplate } from '@/lib/design/mapBranding';
import { businessFieldsOf } from '@/lib/businessFields';
import { TOPIC_BANK, SHAPE_META, buildTopicBrief } from '@/lib/ai/topicBank';

const input = { width: '100%', border: '1px solid var(--line-2)', borderRadius: 'var(--r-xs)', padding: '10px 12px', fontSize: 'var(--t-sm)', fontFamily: 'inherit', background: 'var(--surface)', resize: 'vertical', minHeight: 64 };
const btn = { padding: '9px 14px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--pc-deep)', fontSize: 'var(--t-sm)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 40 };

// A topic-bank shape's channel decides the starting format — she can still
// change it with the existing format buttons before generating. 'carousel'
// has no real multi-slide mechanism yet (see lib/ai/topicBank.ts's
// SHAPE_META comment and WORK_PLAN.md); it starts as an ordinary feed post.
const FORMAT_FOR_CHANNEL = { post_story: 'feed45', carousel: 'feed45', reel_post: 'reel' };

async function fetchAllowance() {
  const res = await fetch('/api/designs/generate');
  const data = await res.json().catch(() => null);
  return res.ok && data?.success ? { used: data.used, cap: data.cap } : null;
}

/** @param preset { brief, format } to start from (the week view hands over a filming idea as a reel brief); remount with a key to apply a new one. */
export default function Generate({ settings, readOnly, toast, onCreated, onOpen, preset = null }) {
  const [brief, setBrief] = useState(preset?.brief || '');
  const [format, setFormat] = useState(preset?.format || 'feed45');
  const [allowance, setAllowance] = useState(null); // { used, cap } | null while loading
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { options, copy }
  const [error, setError] = useState('');
  const [showTopics, setShowTopics] = useState(false);
  const [topicQuery, setTopicQuery] = useState('');

  useEffect(() => {
    let alive = true;
    fetchAllowance().then((a) => { if (alive) setAllowance(a || { used: 0, cap: 0 }); });
    return () => { alive = false; };
  }, []);

  const atCap = allowance ? allowance.used >= allowance.cap : false;

  // Her own field(s) only — a nails technician never sees cosmetics topics
  // and vice versa; a dual-field tenant sees both, unlabelled as such since
  // the topic names themselves make the field obvious.
  const fields = useMemo(() => businessFieldsOf(settings), [settings]);
  const topics = useMemo(() => {
    const mine = TOPIC_BANK.filter((t) => fields.includes(t.field));
    const q = topicQuery.trim();
    return q ? mine.filter((t) => t.name.includes(q)) : mine;
  }, [fields, topicQuery]);

  /** brief/fmt override the current state — used by a topic-bank pick, which
   *  composes both and must not wait a render for setState to catch up. */
  const generate = async (overrideBrief, overrideFmt) => {
    const b = overrideBrief ?? brief;
    const f = overrideFmt ?? format;
    if (readOnly) { toast?.('החשבון במצב קריאה בלבד', 'error'); return; }
    if (b.trim().length < 3) { setError('כתבי מה תרצי לפרסם, למשל: מבצע לטיפול פנים לפני החג'); return; }
    setError(''); setBusy(true); setResult(null);
    try {
      const res = await fetch('/api/designs/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brief: b, format: f }) });
      const data = await res.json().catch(() => null);
      if (typeof data?.used === 'number' && typeof data?.cap === 'number') setAllowance({ used: data.used, cap: data.cap });
      if (!res.ok || !data?.success) throw new Error(data?.error || 'היצירה לא הצליחה');
      setResult({ options: data.options, copy: data.copy });
      onCreated?.(data.options);
      toast?.(`${data.options.length} אפשרויות מוכנות. בחרי אחת ותערכי.`);
    } catch (e) { setError(String(e.message || e)); } finally { setBusy(false); }
  };

  /** A topic-bank pick: compose the brief, show it in the box (so she can
   *  see and tweak what triggered the result), and generate immediately. */
  const pickTopic = (topic, shapeKey) => {
    if (atCap) return;
    const composed = buildTopicBrief(topic, shapeKey);
    const fmt = FORMAT_FOR_CHANNEL[SHAPE_META[shapeKey].channel] || 'feed45';
    setBrief(composed);
    setFormat(fmt);
    generate(composed, fmt);
  };

  const copyText = async () => {
    const text = [result?.copy?.text || '', (result?.copy?.hashtags || []).join(' ')].filter(Boolean).join('\n\n');
    try { await navigator.clipboard.writeText(text); toast?.('הטקסט לפוסט הועתק'); } catch { toast?.(text, 'info'); }
  };

  return (
    <div className="glass-card" style={{ padding: '22px 24px', marginBottom: 18, border: '1px solid var(--pc)', background: 'var(--pc-tint)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <p className="serif" style={{ fontSize: 'var(--t-xl)', fontWeight: 600, color: 'var(--ink)' }}><Icon name="sparkle" size={18} /> כתבי מה תרצי, ותקבלי פוסט מוכן</p>
        <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: atCap ? 'var(--danger)' : 'var(--pc-deep)' }}>
          {allowance === null ? '…' : `${allowance.used} מתוך ${allowance.cap} החודש`}
        </p>
      </div>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 12 }}>
        משפט אחד. ה-AI בוחר תבנית, כותב את הטקסטים ומצייר תמונה, ומחזיר שלוש אפשרויות לבחירה. כל אחת נשמרת אצלך ואפשר לשנות בה הכול. התבניות למטה פתוחות תמיד, בלי הגבלה.
      </p>
      {atCap ? (
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '10px 12px' }}>
          ניצלת את {allowance.cap} היצירות של החודש. בחודש הבא הן מתחדשות; בינתיים כל תבנית בגלריה פתוחה לך.
        </p>
      ) : (
        <>
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="לדוגמה: מבצע לטיפול פנים קלאסי ב-249 ₪ לפני ראש השנה" style={input} dir="rtl" maxLength={400} rows={2} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {[['feed45', 'פוסט 4:5'], ['story', 'סטורי 9:16'], ['reel', 'רילס']].map(([k, l]) => (
                <button key={k} onClick={() => setFormat(k)} style={{ ...btn, minHeight: 34, padding: '5px 12px', background: format === k ? 'var(--pc)' : 'var(--surface)', color: format === k ? 'var(--pc-contrast)' : 'var(--ink-2)' }}>{l}</button>
              ))}
            </div>
            <button onClick={() => generate()} disabled={busy || readOnly || allowance === null} className="primary-btn" style={{ padding: '10px 18px', background: 'var(--pc-grad)', color: 'var(--pc-contrast)', fontSize: 'var(--t-sm)', marginInlineStart: 'auto', opacity: busy || readOnly ? 0.6 : 1 }}>
              {busy ? <Spinner inline label="בונה שלוש אפשרויות, עד דקה" /> : format === 'reel' ? 'צרי לי רילס' : 'צרי לי פוסט'}
            </button>
            <button onClick={() => setShowTopics((v) => !v)} style={{ ...btn, minHeight: 34, padding: '5px 12px' }}>
              <Icon name="bulb" size={13} /> {showTopics ? 'סגירת בנק נושאים' : 'לא יודעת על מה? בנק נושאים'}
            </button>
          </div>

          {showTopics && (
            <div style={{ marginTop: 10, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '12px 12px 8px' }}>
              <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', lineHeight: 1.5, marginBottom: 8 }}>
                {topics.length} נושאים אמיתיים לתחום שלך. בחרי נושא וזווית — ה-AI כותב פוסט טרי סביבו, לא טקסט קבוע מראש.
              </p>
              <input value={topicQuery} onChange={(e) => setTopicQuery(e.target.value)} placeholder="חיפוש נושא..." style={{ ...input, minHeight: 'unset', marginBottom: 8 }} dir="rtl" />
              <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {topics.map((t) => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '6px 2px', borderTop: '1px solid var(--line)' }}>
                    <span style={{ fontSize: 'var(--t-xs)', fontWeight: 600, color: 'var(--ink)', flex: '1 1 140px', minWidth: 0 }}>{t.name}</span>
                    {Object.entries(SHAPE_META).map(([key, meta]) => (
                      <button key={key} title={meta.goal} onClick={() => pickTopic(t, key)} disabled={busy || readOnly}
                        style={{ fontSize: 'var(--t-xs)', padding: '4px 9px', borderRadius: 'var(--r-full)', border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--pc-deep)', cursor: busy || readOnly ? 'default' : 'pointer', fontFamily: 'inherit', opacity: busy || readOnly ? 0.5 : 1 }}>
                        {meta.label}
                      </button>
                    ))}
                  </div>
                ))}
                {topics.length === 0 && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', padding: '8px 2px' }}>לא נמצאו נושאים תואמים.</p>}
              </div>
            </div>
          )}
        </>
      )}
      {error && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', marginTop: 8 }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 }}>
            {result.options.map((d, i) => {
              const reel = d.format === 'reel' ? getReel(d.template_key, d.template_version) : null;
              const t = reel ? reel.scenes[0].frame : getTemplate(d.template_key, d.template_version);
              if (!t) return null;
              const fill = reel ? fillReel(reel, { settings, inputs: d.values, images: d.images, brand: d.overrides?.brand }).scenes[0] : fillTemplate(t, { settings, inputs: d.values, images: d.images, brand: d.overrides?.brand });
              const ratio = t.format === 'story' ? '9 / 16' : '4 / 5';
              return (
                <div key={d.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ borderRadius: 'var(--r-sm)', overflow: 'hidden', border: '1px solid var(--line)', boxShadow: 'var(--shadow-xs)', aspectRatio: ratio, background: 'var(--surface-2)' }}>
                    <DomPreview template={t} fill={fill} width={150} style={{ width: '100%', height: 'auto', aspectRatio: ratio }} />
                  </div>
                  <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', lineHeight: 1.45 }}>{i + 1}. {d.angle || t.name}{d.pictureFailed ? ' · התמונה לא נוצרה, בחרי מהגלריה' : ''}</p>
                  <button onClick={() => onOpen?.(d)} className="primary-btn" style={{ padding: '9px 0', background: 'var(--pc-grad)', color: 'var(--pc-contrast)', fontSize: 'var(--t-sm)' }}>לפתוח ולערוך</button>
                </div>
              );
            })}
          </div>
          {result.copy?.text && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '10px 12px', marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 'var(--t-xs)', fontWeight: 700, color: 'var(--ink-3)' }}>טקסט לפוסט</span>
                <button onClick={copyText} style={{ ...btn, minHeight: 32, padding: '4px 10px' }}><Icon name="copy" size={12} /> העתקה</button>
              </div>
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{result.copy.text}</p>
              {result.copy.hashtags?.length > 0 && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--pc-deep)', marginTop: 6 }}>{result.copy.hashtags.join(' ')}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
