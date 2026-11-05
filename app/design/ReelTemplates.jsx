'use client';

// app/design/ReelTemplates.jsx
//
// "תבניות רילס": she picks a template (each one with its own pace, transitions, words, colour look and music),
// films what the shot list asks for, picks a music mood (generated in her browser, royalty free), watches the
// preview and gets a finished 9:16 reel in her brand. Then the studio's own save/share panel (SaveShare).
//
// Four steps on one sheet, phone first: template -> shot list -> music -> preview and export.
// Same rules as "רילס מהצילומים שלי" (OwnReel.jsx), which this sits next to:
//   * nothing leaves her phone: photos are shrunk and drawn from local blob URLs, clips are read where they are, the
//     music is synthesized here, the finished reel is a local file until she shares it. No bucket, no AI, no cost;
//   * consent: unticked by default, nothing is made until she says the client agreed (ownReelUse), and new footage
//     unticks it again;
//   * a plain <input type=file accept="image/*,video/*"> with no `capture`, so a phone offers the camera and the library.
// The decisions are lib/design/reelTemplates.js and lib/design/reelMusic.js; the drawing is reelTemplateDraw.js.

import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../Icon';
import Sheet from '../Sheet';
import Spinner from '../Spinner';
import SaveShare from './SaveShare';
import { accentStyle, DEFAULT_ACCENT } from '@/lib/theme';
import { businessFieldsOf } from '@/lib/businessFields';
import { instagramHandle } from '@/lib/design/mapBranding';
import { mediaKind, ownMediaProblem, ownReelUse, ownReelCaption } from '@/lib/design/ownReel';
import { MOODS, moodById, renderMood, encodeWav } from '@/lib/design/reelMusic';
import {
  groupsFor, templatesIn, getReelTemplate, GROUP_LABELS, LOOK_LABELS, EFFECT_LABELS, TRANSITION_LABELS, LINE_MAX,
  planTemplateReel, resolveTexts, filmSeconds, distanceLabel, rateAt,
} from '@/lib/design/reelTemplates';
import { probeVideo, loadLook } from './ownReelDraw';
import { preparePhoto, createPainter, drawPlaceholder, playRealtime, renderTemplateReel, musicFor, endLinesWithLink } from './reelTemplateDraw';

const btn = { padding: '12px 16px', fontSize: 'var(--t-sm)', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46, fontFamily: 'inherit', cursor: 'pointer', borderRadius: 'var(--r-sm)' };
const solid = { ...btn, background: 'var(--pc-grad)', color: 'var(--pc-contrast)', border: 'none' };
const quiet = { ...btn, background: 'var(--surface)', color: 'var(--pc-deep)', border: '1px solid var(--line-2)' };
// 16px, not a type token: under 16px an iPhone zooms the page when the field is tapped (same as OwnReel).
// eslint-disable-next-line local/design-tokens
const field = { fontSize: 16, padding: '8px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)', fontFamily: 'inherit', width: '100%', minWidth: 0, background: 'var(--surface)' };
const chip = (on) => ({ padding: '8px 12px', borderRadius: 'var(--r-full)', border: `1px solid ${on ? 'var(--pc)' : 'var(--line-2)'}`, background: on ? 'var(--pc-tint)' : 'var(--surface)', color: on ? 'var(--pc-deep)' : 'var(--ink-2)', fontSize: 'var(--t-xs)', fontWeight: on ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', minHeight: 38, whiteSpace: 'nowrap' });
const small = { fontSize: 'var(--t-xs)', color: 'var(--ink-2)', lineHeight: 1.6, margin: 0 };
const TIPS_KEY = 'kalmea.reelTemplates.tipsSeen';

const TIPS = {
  lashes: ['טבעת אור מלפנים, בגובה העיניים. בלי אור תקרה מלמעלה.', 'זום 2x או מצב מאקרו, במקום לקרב את הטלפון.', 'הילוך איטי של 120 או 240 פריימים לרגע שהעיניים נפתחות.', 'חצובה או מעמד, כדי שהצילום יהיה יציב.', 'רקע כהה עם נורות קטנות רחוקות מאחור, לבוקה רך.', 'מצלמים לאורך, כמו שרואים באינסטגרם.'],
  nails: ['טבעת אור מלמעלה, היד על משטח ניטרלי עם טקסטורה.', 'מאקרו או זום 2x על הציפורניים.', 'הילוך איטי של 120 או 240 פריימים לסיבוב היד ולברק.', 'חצובה מעל השולחן לצילומי התהליך.', 'רקע כהה עם נורות קטנות רחוקות, לבוקה רך.', 'מצלמים לאורך, כמו שרואים באינסטגרם.'],
};
TIPS.facial = TIPS.lashes;

let seq = 0;
const readTipsSeen = () => { try { return window.localStorage.getItem(TIPS_KEY) === '1'; } catch { return false; } };
const writeTipsSeen = () => { try { window.localStorage.setItem(TIPS_KEY, '1'); } catch { /* private mode: shown again next time */ } };

/** A small looping preview of a template, drawn with abstract placeholder shapes (never faces). */
function TemplatePreview({ template, style, look, width = 150, seed = 0 }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !look) return undefined;
    c.width = 180; c.height = 320;
    const plan = planTemplateReel(template, { bpm: moodById(style.mood)?.bpm });
    const mk = () => { const x = document.createElement('canvas'); x.width = 135; x.height = 240; return x; };
    const photos = template.slots.map((_, i) => drawPlaceholder(mk(), template.group, i, 0, seed));
    const vid = mk();
    const painter = createPainter({ canvas: c, plan, look, lookId: style.look, textStyle: style.textStyle, photos });
    let raf = 0, last = 0, visible = true;
    const t0 = performance.now() - seed * 1300; // the cards start at different moments, so the grid is not all title frames
    let io = null;
    if (typeof IntersectionObserver !== 'undefined') { io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(c); }
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (!visible || now - last < 55) return;
      last = now;
      const el = (now - t0) % plan.totalMs;
      const s = plan.scenes[painter.sceneAt(el)];
      const frame = s.kind === 'video' ? drawPlaceholder(vid, template.group, s.slot, ((el - s.startMs) / 1000) * rateAt(s.effect, (el - s.startMs) / s.ms), seed) : null;
      painter.paint(el, frame);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); io?.disconnect(); };
  }, [template, style, look, seed]);
  return <canvas ref={ref} aria-hidden style={{ width, aspectRatio: '9 / 16', display: 'block', borderRadius: 'var(--r-sm)', background: '#1b1418' }} />;
}

export default function ReelTemplates({ open, onClose, settings, toast, readOnly = false, clientName = '', bookingUrl = '' }) {
  const fields = useMemo(() => businessFieldsOf(settings), [settings]);
  const groups = useMemo(() => groupsFor(fields), [fields]);
  const [step, setStep] = useState('pick'); // pick | shots | music | preview
  const [group, setGroup] = useState(() => groups[0]);
  const [tplId, setTplId] = useState(null);
  const [vi, setVi] = useState(0); // variant index
  const [media, setMedia] = useState({}); // slot index -> { id, kind, file, url, img?, durationMs? }
  const [edits, setEdits] = useState({}); // text key -> lines
  const [music, setMusic] = useState(null); // null = the variant's mood | { type: 'mood', id } | { type: 'own', name, url } | { type: 'none' }
  const [look, setLook] = useState(null);
  const [tipsSeen, setTipsSeen] = useState(() => (typeof window === 'undefined' ? true : readTipsSeen()));
  const [agreed, setAgreed] = useState(false);
  const [adding, setAdding] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [out, setOut] = useState(null);
  const [caption, setCaption] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [sample, setSample] = useState(null); // { id, url } the mood being auditioned
  const canvasRef = useRef(null);
  const previewRef = useRef(null);
  const playerRef = useRef(null);
  const audioRef = useRef(null);
  const musicCache = useRef(null); // { key, url }
  const mediaRef = useRef(media);
  useEffect(() => { mediaRef.current = media; }, [media]);

  const tpl = tplId ? getReelTemplate(tplId) : null;
  const variant = tpl ? tpl.variants[Math.min(vi, tpl.variants.length - 1)] : null;
  const chosen = music || (variant ? { type: 'mood', id: variant.mood } : null);
  const moodId = chosen?.type === 'mood' ? chosen.id : variant?.mood;
  const bpm = moodById(moodId)?.bpm || tpl?.bpm;
  const items = tpl ? tpl.slots.map((_, i) => media[i] || null) : [];
  const texts = tpl ? resolveTexts(tpl, { edits }) : [];
  const defaults = tpl ? resolveTexts(tpl) : [];
  // plain values: the React Compiler memoizes them (manual useMemo here was skipped by it)
  const plan = tpl ? planTemplateReel(tpl, { bpm, items, texts }) : null;
  const filled = items.filter(Boolean).length;
  const missing = tpl ? tpl.slots.length - filled : 0;
  const branding = settings?.branding && typeof settings.branding === 'object' ? settings.branding : {};
  const first = clientName ? clientName.trim().split(/\s+/)[0] : '';

  const dropItem = (it) => { if (it) { try { URL.revokeObjectURL(it.url); } catch { /* ignore */ } } };
  const dropOut = () => setOut((o) => { if (o) URL.revokeObjectURL(o.url); return null; });
  // A finished reel carries the soundtrack it was made with: any change of music (a mood, her own file, or none) drops it, so
  // preview and share can never hand out the old one (Vercel review, 2026-11-05).
  useEffect(() => { dropOut(); }, [music]); // eslint-disable-line react-hooks/exhaustive-deps
  const stopPreview = () => { playerRef.current?.stop(); playerRef.current = null; setPlaying(false); };
  const stopSample = () => { try { audioRef.current?.pause(); } catch { /* ignore */ } setSample((s) => { if (s) URL.revokeObjectURL(s.url); return null; }); };
  const dropMusicCache = () => { if (musicCache.current) URL.revokeObjectURL(musicCache.current.url); musicCache.current = null; };


  // The parents mount this only while it is open, so closing it unmounts it: everything local is dropped here.
  useEffect(() => () => { Object.values(mediaRef.current).forEach(dropItem); playerRef.current?.stop(); dropMusicCache(); try { audioRef.current?.pause(); } catch { /* ignore */ } }, []);
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    loadLook(settings).then((l) => { if (alive) setLook({ ...l, lines: endLinesWithLink(l.lines) }); }).catch(() => {});
    return () => { alive = false; };
  }, [open, settings]);
  // anything she changes stops a running preview (play() resets `playing` when it ends)
  useEffect(() => { playerRef.current?.stop(); playerRef.current = null; }, [step, tplId, vi, music, media, edits]);

  const choose = (id) => { setTplId(id); setVi(0); setMusic((m) => (m?.type === 'own' || m?.type === 'none' ? m : null)); setEdits({}); setStep('shots'); setError(''); dropOut(); };

  // ── footage ──
  const take = async (file) => {
    const problem = ownMediaProblem(file);
    if (problem) throw new Error(problem);
    if (mediaKind(file) === 'photo') return { id: ++seq, kind: 'photo', file, ...(await preparePhoto(file)) };
    const url = URL.createObjectURL(file);
    try { return { id: ++seq, kind: 'video', file, url, ...(await probeVideo(url)) }; } catch (e) { URL.revokeObjectURL(url); throw e; }
  };
  const put = (slots, files) => {
    // slots: which slot each file goes to
    (async () => {
      setError(''); dropOut(); setAdding(slots[0] ?? 0);
      const problems = [];
      const next = {};
      for (let k = 0; k < files.length && k < slots.length; k++) {
        try { next[slots[k]] = await take(files[k]); } catch (e) { problems.push(String(e?.message || e)); }
      }
      setMedia((m) => { const n = { ...m }; for (const [i, it] of Object.entries(next)) { dropItem(n[i]); n[i] = it; } return n; });
      if (Object.keys(next).length) setAgreed(false); // new footage: she says yes for it too
      if (problems.length) setError([...new Set(problems)].join(' · '));
      setAdding(-1);
    })();
  };
  const onSlotFile = (i) => (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) put([i], [f]); };
  const onMany = (e) => {
    const files = Array.from(e.target.files || []); e.target.value = '';
    if (!files.length || !tpl) return;
    const empty = tpl.slots.map((_, i) => i).filter((i) => !media[i]);
    const order = empty.length ? empty : tpl.slots.map((_, i) => i);
    put(order, files);
  };
  const removeAt = (i) => { setMedia((m) => { const n = { ...m }; dropItem(n[i]); delete n[i]; return n; }); dropOut(); };

  // ── music ──
  const musicUrlFor = () => {
    if (chosen?.type === 'none') return null;
    if (chosen?.type === 'own') return chosen.url;
    const key = `${moodId}|${plan.totalMs}|${plan.endStartMs}|${plan.scenes.map((s) => s.transition).join(',')}`;
    if (musicCache.current?.key === key) return musicCache.current.url;
    dropMusicCache();
    const url = musicFor(moodId, plan);
    musicCache.current = { key, url };
    return url;
  };
  const audition = (id) => {
    stopSample();
    if (sample?.id === id) return;
    const { channels, sampleRate } = renderMood(id, { durationMs: 9000, endStartMs: 9000, sampleRate: 24000 });
    const url = URL.createObjectURL(new Blob([encodeWav(channels, sampleRate)], { type: 'audio/wav' }));
    const a = new Audio(url);
    a.onended = () => stopSample();
    audioRef.current = a;
    a.play().catch(() => {});
    setSample({ id, url });
  };

  // ── preview ──
  const play = async () => {
    if (playing) { stopPreview(); return; }
    const c = previewRef.current;
    if (!c || !look || !plan) return;
    let audioCtx = null;
    if (chosen?.type !== 'none') { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { audioCtx = null; } } // inside the tap: iPhone lets it play
    setPlaying(true); setStatus('מכינה את המוזיקה');
    await new Promise((r) => setTimeout(r, 30));
    try {
      const url = audioCtx ? musicUrlFor() : null;
      c.width = 360; c.height = 640;
      const painter = createPainter({ canvas: c, plan, look, lookId: variant.look, textStyle: variant.textStyle, photos: items.map((it) => it?.img || null) });
      const run = await playRealtime({ canvas: c, painter, plan, items, audioCtx, musicUrl: url });
      playerRef.current = run;
      setStatus('');
      await run.done;
    } catch (e) {
      console.warn('[reel-templates] preview failed:', e?.message || e);
      setError('התצוגה המקדימה לא הצליחה בדפדפן הזה. אפשר עדיין להכין את הרילס.');
    } finally {
      try { await audioCtx?.close(); } catch { /* ignore */ }
      setPlaying(false); setStatus('');
    }
  };

  // ── export ──
  const make = async () => {
    const use = ownReelUse({ count: filled, agreed, readOnly });
    if (!use.ok) { setError(use.why); return; }
    if (missing > 0) { setError(`חסרים עוד ${missing} צילומים ברשימה`); return; }
    stopPreview(); stopSample();
    setBusy(true); setError(''); setProgress(0); dropOut(); setCaption(null);
    let left = false;
    const onVis = () => { if (document.hidden) left = true; };
    document.addEventListener('visibilitychange', onVis);
    try {
      setStatus('מכינה את המוזיקה');
      await new Promise((r) => setTimeout(r, 30));
      const l = look || await loadLook(settings).then((x) => ({ ...x, lines: endLinesWithLink(x.lines) }));
      const musicUrl = musicUrlFor();
      const { blob, ext } = await renderTemplateReel({
        canvas: canvasRef.current, plan, items, photos: items.map((it) => it?.img || null), look: l,
        lookId: variant.look, textStyle: variant.textStyle, musicUrl,
        onProgress: (p) => setProgress(Math.round(p * 100)), onStatus: setStatus, shouldStop: () => left,
      });
      setOut({ blob, ext, url: URL.createObjectURL(blob) });
      toast?.('הרילס מוכן');
    } catch (e) {
      const msg = String(e?.message || e || '');
      if (!/[֐-׿]/.test(msg)) console.error('[reel-templates] render failed:', msg);
      setError(left ? 'ההכנה הופסקה כי עזבת את המסך באמצע. השאירי את המסך הזה פתוח עד שהרילס מוכן, ונסי שוב.'
        : /[֐-׿]/.test(msg) ? msg : 'יצירת הרילס לא הצליחה בדפדפן הזה. נסי שוב, ואם זה חוזר פתחי את kalmea.app בספארי או בכרום מעודכן (לא מתוך אינסטגרם או פייסבוק).');
    } finally {
      document.removeEventListener('visibilitychange', onVis);
      setBusy(false); setStatus('');
    }
  };

  const headline = texts.flat().find((t) => t.lines.length)?.lines.join(' ') || tpl?.name || '';
  const baseText = ownReelCaption({ headline, businessName: settings?.business_name, phone: settings?.business_phone, instagram: instagramHandle(branding.instagram) });
  const text = caption ?? (bookingUrl ? `${baseText}\nקישור לקביעת תור: ${bookingUrl}` : baseText);
  const seconds = plan ? Math.round(plan.totalMs / 1000) : 0;
  const back = { pick: null, shots: 'pick', music: 'shots', preview: 'music' }[step];

  const variantChips = tpl && (
    <div style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)' }}>סגנון (אותם צילומים, רילס אחר)</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} data-testid="reel-tpl-variants">
        {tpl.variants.map((v, i) => (
          <button key={v.id} type="button" onClick={() => { setVi(i); setMusic((m) => (m?.type === 'mood' ? null : m)); dropOut(); }} style={chip(i === vi)} data-testid="reel-tpl-variant">
            {v.label} · {LOOK_LABELS[v.look]} · {moodById(v.mood)?.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={accentStyle((settings && settings.primary_color) || DEFAULT_ACCENT)}>
      <Sheet open={open && !sharing} onClose={onClose} zIndex={1200} width={500} ariaLabel="reel-templates" busy={busy || adding >= 0}
        title={tpl && step !== 'pick' ? tpl.name : 'תבניות רילס'}
        subtitle={step === 'pick' ? 'בוחרות תבנית, מצלמות לפי הרשימה, ומקבלות רילס עם מוזיקה, מעברים ואפקטים.' : step === 'shots' ? 'רשימת צילומים' : step === 'music' ? 'מוזיקה' : 'תצוגה מקדימה'}>
        <div style={{ display: 'grid', gap: 12 }} data-testid="reel-templates" data-step={step}>
          {back && !busy && (
            <button type="button" onClick={() => { setStep(back); setError(''); }} style={{ background: 'none', border: 'none', color: 'var(--pc-deep)', fontSize: 'var(--t-sm)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0', justifySelf: 'start', minHeight: 36 }} data-testid="reel-tpl-back">
              <Icon name="arrow-right" size={14} /> חזרה
            </button>
          )}

          {/* ── 1. the template ── */}
          {step === 'pick' && (
            <>
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }} data-testid="reel-tpl-groups">
                {groups.map((g) => <button key={g} type="button" onClick={() => setGroup(g)} style={chip(group === g)}>{GROUP_LABELS[g]}</button>)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }} data-testid="reel-tpl-list">
                {templatesIn(group).map((t, ti) => {
                  const v = t.variants[0];
                  const p = planTemplateReel(t, { bpm: moodById(v.mood)?.bpm });
                  return (
                    <button key={t.id} type="button" onClick={() => choose(t.id)} data-testid="reel-tpl-card" data-id={t.id}
                      style={{ textAlign: 'right', border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: 'var(--r-md)', padding: 8, cursor: 'pointer', fontFamily: 'inherit', display: 'grid', gap: 6, alignContent: 'start', minWidth: 0 }}>
                      <TemplatePreview template={t} style={v} look={look} width="100%" seed={ti} />
                      <span style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)' }}>{t.name}</span>
                      <span style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', lineHeight: 1.5 }}>{t.blurb}</span>
                      <span style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)' }}>{t.slots.length} צילומים · {Math.round(p.totalMs / 1000)} שניות · {moodById(v.mood)?.label}</span>
                    </button>
                  );
                })}
              </div>
              <p style={small}>התמונות בתצוגה הן צורות לדוגמה. ברילס שלך יופיעו הצילומים שלך, עם הלוגו, הצבע והשם של העסק.</p>
            </>
          )}

          {/* ── 2. the shot list ── */}
          {step === 'shots' && tpl && (
            <>
              {!tipsSeen && (
                <div data-testid="reel-tpl-tips" style={{ border: '1px solid var(--line)', background: 'var(--pc-tint)', borderRadius: 'var(--r-md)', padding: '12px 14px', display: 'grid', gap: 6 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 'var(--t-sm)', color: 'var(--ink)' }}><Icon name="bulb" size={14} /> טיפים לצילום שנראה מקצועי</p>
                  <ul style={{ margin: 0, paddingInlineStart: 18, display: 'grid', gap: 3 }}>
                    {(TIPS[tpl.group] || TIPS.lashes).map((t) => <li key={t} style={small}>{t}</li>)}
                  </ul>
                  <button type="button" onClick={() => { writeTipsSeen(); setTipsSeen(true); }} style={{ ...quiet, minHeight: 40, padding: '8px 12px' }} data-testid="reel-tpl-tips-ok">הבנתי</button>
                </div>
              )}
              {variantChips}
              <label className="primary-btn" style={{ ...quiet, cursor: adding >= 0 ? 'not-allowed' : 'pointer', opacity: adding >= 0 ? 0.6 : 1 }} data-testid="reel-tpl-many">
                <Icon name="upload" size={15} /> {filled ? 'להוסיף כמה קבצים יחד' : 'בחירת כל הצילומים יחד'}
                <input type="file" accept="image/*,video/*" multiple disabled={adding >= 0} onChange={onMany} style={{ display: 'none' }} />
              </label>
              <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }} data-testid="reel-tpl-shots">
                {tpl.slots.map((s, i) => {
                  const it = media[i];
                  const sc = plan?.scenes[i];
                  const secs = filmSeconds(s, bpm);
                  return (
                    <li key={s.id} data-testid="reel-tpl-shot" style={{ border: `1px solid ${it ? 'var(--pc)' : 'var(--line)'}`, borderRadius: 'var(--r-md)', padding: 10, background: 'var(--surface)', display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <div style={{ width: 58, aspectRatio: '9 / 16', borderRadius: 'var(--r-xs)', overflow: 'hidden', background: it ? '#000' : 'var(--pc-tint)', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--pc-deep)', fontWeight: 700 }}>
                          {it ? (it.kind === 'photo'
                            ? <img src={it.url} alt={`צילום ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            : <video src={`${it.url}#t=0.1`} muted playsInline preload="metadata" aria-label={`סרטון ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />)
                            : <span>{i + 1}</span>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 4 }}>
                          <p style={{ margin: 0, fontSize: 'var(--t-sm)', color: 'var(--ink)', lineHeight: 1.55 }}>{s.shot.what}</p>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            <Tag>{s.media === 'photo' ? 'תמונה' : s.media === 'clip' ? `סרטון, בערך ${secs} שניות` : `תמונה או סרטון של ${secs} שניות`}</Tag>
                            <Tag>{distanceLabel(s.shot.distance)}</Tag>
                            {s.shot.slowmo && <Tag strong>הילוך איטי</Tag>}
                          </div>
                          <p style={{ ...small, color: 'var(--ink-3)' }}><Icon name="sun" size={11} /> {s.shot.light}</p>
                          <p style={{ ...small, color: 'var(--ink-3)' }}>{EFFECT_LABELS[s.effect]}{i > 0 ? ` · נכנס ב${TRANSITION_LABELS[s.transition]}` : ''}{sc ? ` · ${(sc.ms / 1000).toFixed(1)} שניות ברילס` : ''}</p>
                        </div>
                      </div>
                      {(defaults[i] || []).map((tx) => {
                        const cur = edits[tx.key] ?? tx.lines;
                        return (
                          <div key={tx.key} style={{ display: 'grid', gap: 4 }}>
                            {tx.lines.map((_, li) => (
                              <input key={li} value={cur[li] ?? ''} maxLength={LINE_MAX} placeholder="בלי טקסט" aria-label={`טקסט על צילום ${i + 1}`} data-testid="reel-tpl-text"
                                onChange={(e) => { const v = e.target.value; setEdits((ed) => { const next = (ed[tx.key] ?? tx.lines).slice(); next[li] = v; return { ...ed, [tx.key]: next }; }); dropOut(); }} style={field} />
                            ))}
                          </div>
                        );
                      })}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <label className="primary-btn" style={{ ...(it ? quiet : solid), flex: 1, minHeight: 42, padding: '9px 12px', cursor: adding >= 0 ? 'not-allowed' : 'pointer', opacity: adding >= 0 && adding !== i ? 0.6 : 1 }} data-testid="reel-tpl-pick">
                          {adding === i ? <Spinner inline label="טוענת" /> : <><Icon name="camera" size={15} /> {it ? 'להחליף' : 'צילום או העלאה'}</>}
                          <input type="file" accept="image/*,video/*" disabled={adding >= 0} onChange={onSlotFile(i)} data-testid="reel-tpl-input" style={{ display: 'none' }} />
                        </label>
                        {it && <button type="button" onClick={() => removeAt(i)} aria-label="להסיר" style={{ ...quiet, width: 46, flex: 'none', padding: 0, minHeight: 42 }}><Icon name="x" size={14} /></button>}
                      </div>
                    </li>
                  );
                })}
              </ol>
              <button type="button" onClick={() => setStep('music')} disabled={missing > 0} className="primary-btn" style={{ ...solid, opacity: missing > 0 ? 0.5 : 1 }} data-testid="reel-tpl-to-music">
                {missing > 0 ? `חסרים עוד ${missing} צילומים` : <>להמשיך למוזיקה <Icon name="arrow-left" size={14} /></>}
              </button>
              {tipsSeen && <button type="button" onClick={() => setTipsSeen(false)} style={{ background: 'none', border: 'none', color: 'var(--ink-3)', fontSize: 'var(--t-xs)', cursor: 'pointer', fontFamily: 'inherit', minHeight: 36 }}>טיפים לצילום</button>}
            </>
          )}

          {/* ── 3. music ── */}
          {step === 'music' && tpl && (
            <>
              <p style={small}>מוזיקה שנוצרת אצלך בטלפון, בלי זכויות יוצרים. החיתוכים ברילס יושבים על הביט של המוזיקה שבחרת.</p>
              <div style={{ display: 'grid', gap: 8 }} data-testid="reel-tpl-moods">
                {MOODS.map((m) => {
                  const on = chosen?.type === 'mood' && chosen.id === m.id;
                  return (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${on ? 'var(--pc)' : 'var(--line)'}`, background: on ? 'var(--pc-tint)' : 'var(--surface)', borderRadius: 'var(--r-md)', padding: '8px 10px' }}>
                      <button type="button" onClick={() => audition(m.id)} aria-label={sample?.id === m.id ? 'לעצור' : `להשמיע ${m.label}`} data-testid="reel-tpl-audition"
                        style={{ width: 42, height: 42, borderRadius: '50%', border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--pc-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none' }}>
                        <Icon name={sample?.id === m.id ? 'pause' : 'play'} size={15} />
                      </button>
                      <button type="button" onClick={() => setMusic({ type: 'mood', id: m.id })} data-testid="reel-tpl-mood" data-id={m.id}
                        style={{ flex: 1, minWidth: 0, textAlign: 'right', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 0', minHeight: 42 }}>
                        <span style={{ display: 'block', fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)' }}>{m.label}{m.id === variant.mood ? ' (מתאים לתבנית)' : ''}</span>
                        <span style={{ display: 'block', fontSize: 'var(--t-xs)', color: 'var(--ink-2)' }}>{m.hint} · {m.bpm} BPM</span>
                      </button>
                      {on && <Icon name="check" size={16} />}
                    </div>
                  );
                })}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${chosen?.type === 'own' ? 'var(--pc)' : 'var(--line)'}`, background: chosen?.type === 'own' ? 'var(--pc-tint)' : 'var(--surface)', borderRadius: 'var(--r-md)', padding: '12px 12px', cursor: 'pointer', minHeight: 46 }} data-testid="reel-tpl-own-music">
                  <Icon name="music" size={15} />
                  <span style={{ flex: 1, fontSize: 'var(--t-sm)', color: 'var(--ink)' }}>{chosen?.type === 'own' ? chosen.name : 'המוזיקה שלי (קובץ שמע)'}</span>
                  <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setMusic((m) => { if (m?.type === 'own') URL.revokeObjectURL(m.url); return { type: 'own', name: f.name, url: URL.createObjectURL(f) }; }); }} />
                </label>
                <button type="button" onClick={() => setMusic((m) => { if (m?.type === 'own') URL.revokeObjectURL(m.url); return { type: 'none' }; })} data-testid="reel-tpl-no-music"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${chosen?.type === 'none' ? 'var(--pc)' : 'var(--line)'}`, background: chosen?.type === 'none' ? 'var(--pc-tint)' : 'var(--surface)', borderRadius: 'var(--r-md)', padding: '12px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'right', minHeight: 46 }}>
                  <Icon name="ban" size={15} />
                  <span style={{ flex: 1, fontSize: 'var(--t-sm)', color: 'var(--ink)' }}>בלי מוזיקה</span>
                </button>
                {chosen?.type === 'none' && <p style={{ ...small, background: 'var(--pc-tint)', borderRadius: 'var(--r-sm)', padding: '8px 10px' }} data-testid="reel-tpl-no-music-tip">באינסטגרם אפשר להוסיף שיר טרנדי בעצמך, זה עוזר לחשיפה.</p>}
                {chosen?.type === 'own' && <p style={small}>החיתוכים יישארו על הקצב של התבנית ({bpm} BPM), כי את הקצב של השיר שלך אנחנו לא יודעות.</p>}
              </div>
              <button type="button" onClick={() => { stopSample(); setStep('preview'); }} className="primary-btn" style={solid} data-testid="reel-tpl-to-preview">
                לתצוגה מקדימה <Icon name="arrow-left" size={14} />
              </button>
            </>
          )}

          {/* ── 4. preview and export ── */}
          {step === 'preview' && tpl && !out && (
            <>
              {variantChips}
              <div style={{ position: 'relative', width: '100%', maxWidth: 260, margin: '0 auto' }}>
                <canvas ref={previewRef} width={360} height={640} data-testid="reel-tpl-preview" style={{ width: '100%', aspectRatio: '9 / 16', display: 'block', borderRadius: 'var(--r-md)', background: '#1b1418' }} />
                {!playing && (
                  <button type="button" onClick={play} aria-label="לצפות בתצוגה המקדימה" data-testid="reel-tpl-play"
                    style={{ position: 'absolute', inset: 0, margin: 'auto', width: 74, height: 74, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.9)', color: 'var(--pc-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: 'var(--shadow-lg)' }}>
                    <Icon name="play" size={28} />
                  </button>
                )}
                {playing && <button type="button" onClick={stopPreview} aria-label="לעצור" style={{ position: 'absolute', bottom: 10, insetInlineStart: 10, width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.85)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="pause" size={16} /></button>}
              </div>
              <p style={{ ...small, textAlign: 'center' }}>
                {seconds} שניות · {chosen?.type === 'none' ? 'בלי מוזיקה' : chosen?.type === 'own' ? 'המוזיקה שלך' : moodById(moodId)?.label} · {LOOK_LABELS[variant.look]}
                {status && playing ? ` · ${status}` : ''}
              </p>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 'var(--t-sm)', color: 'var(--ink)', lineHeight: 1.6 }}>
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} data-testid="reel-tpl-consent" style={{ marginTop: 4, width: 18, height: 18, flex: 'none' }} />
                <span>{first ? `${first} אישרה לי` : 'הלקוחה אישרה לי'} במפורש לפרסם את התמונות והסרטונים האלה ברשתות (או שאין בהם לקוחה). בלי אישור לא מכינים רילס.</span>
              </label>
              <button type="button" onClick={make} disabled={busy || !agreed || readOnly || missing > 0} data-testid="reel-tpl-make" className="primary-btn" style={{ ...solid, opacity: !agreed || busy || readOnly ? 0.5 : 1 }}>
                {busy ? <Spinner inline label={status || 'מכינה'} /> : <><Icon name="film" size={15} /> הכיני לי את הרילס</>}
              </button>
              {busy && <div style={{ height: 6, background: 'var(--line)', borderRadius: 'var(--r-full)', overflow: 'hidden' }}><div data-testid="reel-tpl-progress" style={{ height: '100%', width: `${progress}%`, background: 'var(--pc)', transition: 'width 0.2s' }} /></div>}
              {busy && <p style={small}>זה לוקח פחות מדקה. השאירי את המסך הזה פתוח.</p>}
            </>
          )}

          {step === 'preview' && out && (
            <>
              <video src={out.url} controls playsInline data-testid="reel-tpl-video" style={{ width: '100%', maxWidth: 240, margin: '0 auto', borderRadius: 'var(--r-sm)', display: 'block', background: '#000', aspectRatio: '9 / 16' }} />
              <button type="button" onClick={() => setSharing(true)} data-testid="reel-tpl-share" className="primary-btn" style={solid}><Icon name="share" size={14} /> שמירה ושיתוף הרילס</button>
              {out.ext !== 'mp4' && <p style={small}>הדפדפן הזה שומר את הסרטון בפורמט שאינסטגרם לא מקבלת. כדי לקבל קובץ שאפשר להעלות, הכיני את הרילס בכרום מעודכן או בספארי.</p>}
              <label style={{ display: 'grid', gap: 4, fontSize: 'var(--t-xs)', color: 'var(--ink-2)' }}>
                הטקסט לפוסט (אפשר לערוך)
                <textarea value={text} onChange={(e) => setCaption(e.target.value)} rows={4} data-testid="reel-tpl-post-text" style={{ ...field, lineHeight: 1.6, resize: 'vertical' }} />
              </label>
              <button type="button" onClick={dropOut} className="primary-btn" style={quiet}>לשנות ולהכין שוב</button>
              {tpl.variants.length > 1 && <p style={small}>רוצה עוד גרסה מאותם צילומים? לחצי &quot;לשנות ולהכין שוב&quot; ובחרי סגנון אחר.</p>}
            </>
          )}

          {error && <p role="alert" data-testid="reel-tpl-error" style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', margin: 0, lineHeight: 1.6 }}>{error}</p>}
        </div>
      </Sheet>

      {out && (
        <SaveShare open={open && sharing} onClose={() => setSharing(false)} blob={out.blob} kind="video" source="ownreel" ext={out.ext}
          downloadName={`kalmea-reel.${out.ext}`} caption={text} toast={toast} />
      )}

      {/* The reel's canvas, off-screen. */}
      <div aria-hidden style={{ position: 'fixed', left: -30000, top: 0, pointerEvents: 'none' }}><canvas ref={canvasRef} width={1080} height={1920} /></div>
    </div>
  );
}

function Tag({ children, strong = false }) {
  return <span style={{ fontSize: 'var(--t-xs)', padding: '2px 8px', borderRadius: 'var(--r-full)', background: strong ? 'var(--pc-tint)' : 'var(--bg)', color: strong ? 'var(--pc-deep)' : 'var(--ink-2)', border: '1px solid var(--line)', fontWeight: strong ? 700 : 500 }}>{children}</span>;
}
