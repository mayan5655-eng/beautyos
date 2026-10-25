'use client';

// app/design/OwnReel.jsx
//
// "רילס מהצילומים שלי": she picks up to six of her own photos and short clips (her work, a before and an after, a
// treatment), puts them in order, ticks that the client agreed, and gets a finished 9:16 reel in her brand with a
// Hebrew line on every scene and a closing card with how to book. Then the studio's own save/share panel (SaveShare).
//
// Same rules as "צילום אחרי טיפול" (PhotoToPost.jsx):
//   * nothing leaves her phone: photos are shrunk and drawn from local blob URLs, clips are read where they are, the
//     finished reel is a local file until she shares it; closing this drops all of it. No bucket, no AI, no cost;
//   * consent: unticked by default, nothing is made until she says the client agreed (or no client is in them);
//   * a plain <input type=file> with no `capture`, so a phone offers the camera and the library both.
// The decisions (timeline, words, consent, files) are lib/design/ownReel.js; the drawing is app/design/ownReelDraw.js.

import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../Icon';
import Sheet from '../Sheet';
import Spinner from '../Spinner';
import SaveShare from './SaveShare';
import { resizeImage, IMAGE_PRESETS, COULD_NOT_SHRINK_HE } from '@/lib/imageResize';
import { accentStyle, DEFAULT_ACCENT } from '@/lib/theme';
import { businessFieldsOf } from '@/lib/businessFields';
import { instagramHandle } from '@/lib/design/mapBranding';
import { mediaKind, ownMediaProblem, roomFor, planOwnReel, defaultCaptions, defaultHeadline, canBeforeAfter, ownReelUse, ownReelCaption, CAPTION_MAX, HEADLINE_MAX, MAX_ITEMS } from '@/lib/design/ownReel';
import { probeVideo, loadLook, renderOwnReel } from './ownReelDraw';

const btn = { padding: '12px 16px', fontSize: 'var(--t-sm)', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46 };
const solid = { ...btn, background: 'var(--pc-grad)', color: 'var(--pc-contrast)' };
const quiet = { ...btn, background: 'var(--surface)', color: 'var(--pc-deep)', border: '1px solid var(--line-2)' };
const field = { fontSize: 16, padding: '9px 11px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)', fontFamily: 'inherit', width: '100%', minWidth: 0 };
const small = { width: 40, height: 40, borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none' };

let seq = 0;

/** A photo, shrunk once and decoded: what the reel draws. Rejects in Hebrew when this browser cannot read it (HEIC off Safari). */
async function preparePhoto(file) {
  const blob = await resizeImage(file, { ...IMAGE_PRESETS.gallery, maxWidth: 1600, maxHeight: 1600 });
  const url = URL.createObjectURL(blob);
  const img = await new Promise((resolve) => { const i = new Image(); i.onload = () => resolve(i.naturalWidth > 0 ? i : null); i.onerror = () => resolve(null); i.src = url; });
  if (!img) { URL.revokeObjectURL(url); throw new Error(COULD_NOT_SHRINK_HE); }
  return { url, img };
}

export default function OwnReel({ open, onClose, settings, toast, readOnly = false, clientName = '' }) {
  const [items, setItems] = useState([]); // { id, kind, file, url, img?, durationMs? }
  const [captions, setCaptions] = useState({}); // id -> her words (absent = the default)
  const [headline, setHeadline] = useState(null); // null = the default
  const [beforeAfter, setBeforeAfter] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [music, setMusic] = useState(null); // { name, url }
  const [out, setOut] = useState(null); // { blob, url, ext }
  const [caption, setCaption] = useState(null);
  const [sharing, setSharing] = useState(false);
  const canvasRef = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const fields = useMemo(() => businessFieldsOf(settings), [settings]);
  const first = clientName ? clientName.trim().split(/\s+/)[0] : '';
  const ba = beforeAfter && canBeforeAfter(items.length);
  const defaults = useMemo(() => defaultCaptions(items.length, { beforeAfter: ba, fields }), [items.length, ba, fields]);
  const wordsFor = (it, i) => (captions[it.id] ?? defaults[i] ?? '');
  const head = headline ?? defaultHeadline(fields);
  const plan = useMemo(() => planOwnReel(items), [items]);
  const branding = settings?.branding && typeof settings.branding === 'object' ? settings.branding : {};

  const drop = (list) => { for (const it of list) { try { URL.revokeObjectURL(it.url); } catch { /* ignore */ } } };
  const dropOut = () => setOut((o) => { if (o) URL.revokeObjectURL(o.url); return null; });
  const reset = () => {
    drop(itemsRef.current); setItems([]); setCaptions({}); setHeadline(null); setBeforeAfter(false); setAgreed(false);
    setBusy(false); setError(''); setNote(''); setCaption(null); setSharing(false); dropOut();
    setMusic((m) => { if (m) URL.revokeObjectURL(m.url); return null; });
  };
  useEffect(() => { if (!open) reset(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => drop(itemsRef.current), []);

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const { take, note: tooMany } = roomFor(items.length, files.length);
    setError(''); setNote(tooMany); setAdding(true); dropOut();
    const added = [], problems = [];
    for (const f of files.slice(0, take)) {
      const problem = ownMediaProblem(f);
      if (problem) { problems.push(problem); continue; }
      try {
        if (mediaKind(f) === 'photo') added.push({ id: ++seq, kind: 'photo', file: f, ...(await preparePhoto(f)) });
        else {
          const url = URL.createObjectURL(f);
          try { added.push({ id: ++seq, kind: 'video', file: f, url, ...(await probeVideo(url)) }); } catch (err) { URL.revokeObjectURL(url); throw err; }
        }
      } catch (err) { problems.push(String(err?.message || err)); }
    }
    setItems((p) => [...p, ...added]);
    if (added.length) setAgreed(false); // new pictures: she says yes for these too
    if (problems.length) setError([...new Set(problems)].join(' · '));
    setAdding(false);
  };

  const remove = (id) => { setItems((p) => { const it = p.find((x) => x.id === id); if (it) drop([it]); return p.filter((x) => x.id !== id); }); dropOut(); };
  const moveUp = (i) => { if (i <= 0) return; setItems((p) => { const n = p.slice(); [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; }); dropOut(); };

  const make = async () => {
    const use = ownReelUse({ count: items.length, agreed, readOnly });
    if (!use.ok) { setError(use.why); return; }
    setBusy(true); setError(''); setProgress(0); dropOut(); setCaption(null);
    let left = false;
    const onVis = () => { if (document.hidden) left = true; };
    document.addEventListener('visibilitychange', onVis);
    try {
      setStatus('טוענת את המיתוג שלך');
      const look = await loadLook(settings);
      const { blob, ext } = await renderOwnReel({
        canvas: canvasRef.current, plan, items, captions: items.map(wordsFor), headline: head, look, musicUrl: music?.url || null,
        onProgress: (p) => setProgress(Math.round(p * 100)), onStatus: setStatus, shouldStop: () => left,
      });
      setOut({ blob, ext, url: URL.createObjectURL(blob) });
      toast?.('הרילס מוכן');
    } catch (e) {
      const msg = String(e?.message || e || '');
      if (!/[֐-׿]/.test(msg)) console.error('[own-reel] render failed:', msg);
      setError(left ? 'ההכנה הופסקה כי עזבת את המסך באמצע. השאירי את המסך הזה פתוח עד שהרילס מוכן, ונסי שוב.'
        : /[֐-׿]/.test(msg) ? msg : 'יצירת הרילס לא הצליחה בדפדפן הזה. נסי שוב, ואם זה חוזר פתחי את kalmea.app בספארי או בכרום מעודכן (לא מתוך אינסטגרם או פייסבוק).');
    } finally {
      document.removeEventListener('visibilitychange', onVis);
      setBusy(false); setStatus('');
    }
  };

  const text = caption ?? ownReelCaption({ headline: head, businessName: settings?.business_name, phone: settings?.business_phone, instagram: instagramHandle(branding.instagram) });
  const seconds = Math.round(plan.totalMs / 1000);

  return (
    <div style={accentStyle((settings && settings.primary_color) || DEFAULT_ACCENT)}>
      <Sheet open={open && !sharing} onClose={onClose} zIndex={1200} width={460} ariaLabel="own-reel" busy={busy || adding}
        title="רילס מהצילומים שלי"
        subtitle="תמונות וסרטונים שלך, ורילס מוכן בעיצוב שלך.">
        <div style={{ display: 'grid', gap: 12 }} data-testid="own-reel">
          {!out && (
            <>
              {items.length > 0 && (
                <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }} data-testid="own-reel-items">
                  {items.map((it, i) => (
                    <li key={it.id} data-testid="own-reel-item" style={{ display: 'flex', gap: 8, alignItems: 'center', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: 6, background: 'var(--surface)' }}>
                      <div style={{ width: 54, aspectRatio: '9 / 16', borderRadius: 'var(--r-xs)', overflow: 'hidden', background: '#000', flex: 'none', position: 'relative' }}>
                        {it.kind === 'photo'
                          ? <img src={it.url} alt={`תמונה ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          : <video src={`${it.url}#t=0.1`} muted playsInline preload="metadata" aria-label={`סרטון ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                        {it.kind === 'video' && <span style={{ position: 'absolute', bottom: 2, insetInlineStart: 2, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, borderRadius: 4, padding: '0 4px' }}><Icon name="film" size={9} /> {Math.round((plan.scenes[i]?.ms || 0) / 1000)}״</span>}
                      </div>
                      <label style={{ flex: 1, minWidth: 0, display: 'grid', gap: 3, fontSize: 'var(--t-xs)', color: 'var(--ink-2)' }}>
                        {i + 1}. {i === 0 ? 'פותח את הרילס' : i === items.length - 1 ? 'לפני הסיום' : 'באמצע'}
                        <input value={wordsFor(it, i)} maxLength={CAPTION_MAX} placeholder="בלי טקסט" onChange={(e) => { const v = e.target.value; setCaptions((c) => ({ ...c, [it.id]: v })); }} data-testid="own-reel-caption-input" style={field} />
                      </label>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <button type="button" onClick={() => moveUp(i)} disabled={i === 0 || busy} aria-label="להקדים" style={{ ...small, opacity: i === 0 ? 0.35 : 1 }}><Icon name="arrow-up" size={14} /></button>
                        <button type="button" onClick={() => remove(it.id)} disabled={busy} aria-label="להסיר" data-testid="own-reel-remove" style={small}><Icon name="x" size={14} /></button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              {items.length < MAX_ITEMS && (
                <label data-testid="own-reel-pick" className="primary-btn" style={{ ...(items.length ? quiet : solid), cursor: busy || adding ? 'not-allowed' : 'pointer', opacity: busy || adding ? 0.6 : 1 }}>
                  {adding ? <Spinner inline label="טוענת" /> : <><Icon name="camera" size={16} /> {items.length ? 'להוסיף עוד' : 'בחירת תמונות וסרטונים'}</>}
                  <input type="file" accept="image/*,video/*" multiple disabled={busy || adding} onChange={onFiles} data-testid="own-reel-input" style={{ display: 'none' }} />
                </label>
              )}
              {note && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', margin: 0 }}>{note}</p>}

              {items.length === 0 && (
                <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', lineHeight: 1.7, margin: 0 }}>
                  עד {MAX_ITEMS} תמונות או סרטונים קצרים מהעבודה שלך: לפני ואחרי, הטיפול עצמו, התוצאה. מקבלות רילס 9:16 עם הלוגו, הצבע והשם של העסק, משפט על כל סצנה וכרטיס סיום עם הטלפון. הכול נשאר בטלפון שלך ולא נשמר אצלנו.
                </p>
              )}

              {items.length > 0 && (
                <>
                  {canBeforeAfter(items.length) && (
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--t-sm)', color: 'var(--ink)' }}>
                      <input type="checkbox" checked={beforeAfter} onChange={(e) => { setBeforeAfter(e.target.checked); setCaptions({}); }} data-testid="own-reel-before-after" style={{ width: 18, height: 18, flex: 'none' }} />
                      <span>לפני ואחרי (הראשונה "לפני", האחרונה "אחרי")</span>
                    </label>
                  )}
                  <label style={{ display: 'grid', gap: 4, fontSize: 'var(--t-xs)', color: 'var(--ink-2)' }}>
                    כותרת בפתיחה
                    <input value={head} maxLength={HEADLINE_MAX} onChange={(e) => setHeadline(e.target.value)} data-testid="own-reel-headline" style={field} />
                  </label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: 'var(--t-xs)', color: 'var(--pc-deep)', cursor: 'pointer', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '9px 12px', background: 'var(--surface)', minHeight: 40, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="music" size={12} /> {music ? music.name : 'מוזיקה (לא חובה)'}
                      <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setMusic((m) => { if (m) URL.revokeObjectURL(m.url); return { name: f.name, url: URL.createObjectURL(f) }; }); }} />
                    </label>
                    {music && <button type="button" onClick={() => setMusic((m) => { if (m) URL.revokeObjectURL(m.url); return null; })} style={{ background: 'none', border: 'none', color: 'var(--ink-3)', fontSize: 'var(--t-xs)', cursor: 'pointer', fontFamily: 'inherit', minHeight: 40 }}>בלי מוזיקה</button>}
                    <span style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)' }}>{seconds} שניות עם כרטיס הסיום</span>
                  </div>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 'var(--t-sm)', color: 'var(--ink)', lineHeight: 1.6 }}>
                    <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} data-testid="own-reel-consent" style={{ marginTop: 4, width: 18, height: 18, flex: 'none' }} />
                    <span>{first ? `${first} אישרה לי` : 'הלקוחה אישרה לי'} במפורש לפרסם את התמונות והסרטונים האלה ברשתות (או שאין בהם לקוחה). בלי אישור לא מכינים רילס.</span>
                  </label>
                  <button type="button" onClick={make} disabled={busy || !agreed || readOnly || adding} data-testid="own-reel-make" className="primary-btn" style={{ ...solid, opacity: !agreed || busy || readOnly ? 0.5 : 1 }}>
                    {busy ? <Spinner inline label={status || 'מכינה'} /> : <><Icon name="film" size={15} /> הכיני לי רילס</>}
                  </button>
                  {busy && <div style={{ height: 6, background: 'var(--line)', borderRadius: 'var(--r-full)', overflow: 'hidden' }}><div data-testid="own-reel-progress" style={{ height: '100%', width: `${progress}%`, background: 'var(--pc)', transition: 'width 0.2s' }} /></div>}
                  {busy && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', margin: 0 }}>זה לוקח כחצי דקה. השאירי את המסך הזה פתוח.</p>}
                </>
              )}
            </>
          )}

          {out && (
            <>
              <video src={out.url} controls playsInline data-testid="own-reel-video" style={{ width: '100%', maxWidth: 240, margin: '0 auto', borderRadius: 'var(--r-sm)', display: 'block', background: '#000', aspectRatio: '9 / 16' }} />
              <button type="button" onClick={() => setSharing(true)} data-testid="own-reel-share" className="primary-btn" style={solid}><Icon name="share" size={14} /> שמירה ושיתוף הרילס</button>
              {out.ext !== 'mp4' && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', lineHeight: 1.6, margin: 0 }}>הדפדפן הזה שומר את הסרטון בפורמט שאינסטגרם לא מקבלת. כדי לקבל קובץ שאפשר להעלות, הכיני את הרילס בכרום מעודכן או בספארי.</p>}
              <label style={{ display: 'grid', gap: 4, fontSize: 'var(--t-xs)', color: 'var(--ink-2)' }}>
                הטקסט לפוסט (אפשר לערוך)
                <textarea value={text} onChange={(e) => setCaption(e.target.value)} rows={4} data-testid="own-reel-post-text" style={{ ...field, lineHeight: 1.6, resize: 'vertical' }} />
              </label>
              <button type="button" onClick={dropOut} data-testid="own-reel-edit" className="primary-btn" style={quiet}>לשנות ולהכין שוב</button>
            </>
          )}

          {error && <p role="alert" data-testid="own-reel-error" style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', margin: 0, lineHeight: 1.6 }}>{error}</p>}
        </div>
      </Sheet>

      {out && (
        <SaveShare open={open && sharing} onClose={() => setSharing(false)} blob={out.blob} kind="video" source="reel" ext={out.ext}
          downloadName={`kalmea-reel.${out.ext}`} caption={text} toast={toast} />
      )}

      {/* The reel's canvas, off-screen. */}
      <div aria-hidden style={{ position: 'fixed', left: -30000, top: 0, pointerEvents: 'none' }}><canvas ref={canvasRef} width={1080} height={1920} /></div>
    </div>
  );
}
