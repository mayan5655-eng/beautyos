'use client';

// app/design/ownReelDraw.js
//
// Draws and encodes "רילס מהצילומים שלי" (app/design/OwnReel.jsx) in her browser. The timeline, the words and the
// closing card's lines are lib/design/ownReel.js; this file paints them:
//
//   a photo scene   her photo covering the 9:16 frame with a slow Ken Burns zoom
//   a video scene   her clip's frames, in order, covering the frame (no zoom: the clip moves on its own)
//   over both       her logo (or business name) in a chip at the top, the opening line on the first scene, the scene's
//                   one line in a pill of HER colour, and a thin bar of her colour along the bottom
//   the end card    her logo, name, "לקביעת תור", phone and handle, each line drawn on its own
//   between scenes  a short crossfade from the last frame of the scene before
//
// Text is drawn straight onto the canvas (lib/design/canvasText), one line at a time, never rasterised from the DOM
// (.claude/skills/kalmea §4). The video goes through the studio's encoder (reelEncoder.js: frame-exact H.264 MP4),
// and through MediaRecorder in real time where the browser cannot encode.
//
// A clip's frames come from mediabunny's decoder (WebCodecs) when the browser can decode the clip, otherwise from a
// <video> element seeked frame by frame (slower, but it plays anything the browser can play). Nothing is uploaded.

import { Input, BlobSource, ALL_FORMATS, CanvasSink } from 'mediabunny';
import { CANVAS } from '@/lib/design/contract';
import { FONTS, colorsFor, instagramHandle } from '@/lib/design/mapBranding';
import { drawText } from '@/lib/design/canvasText';
import { pickRecorderMime, fileExtFor } from '@/lib/design/recorderMime';
import { captionLine, endCardLines, HEADLINE_MAX } from '@/lib/design/ownReel';
import { resolveFamily, loadImage } from './canvasRender';
import { encodePresets, canEncodeMusic, encodeReelMp4 } from './reelEncoder';

export const W = CANVAS.story.w, H = CANVAS.story.h;
const FADE_MS = 400;
const WORDS_IN_MS = 350;

// ── Clips ───────────────────────────────────────────────────────────────────

/** Duration and size of a clip from a <video> element; rejects (Hebrew) when this browser cannot open it. */
export function probeVideo(url) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'metadata';
    const done = (fn) => { clearTimeout(t); v.removeAttribute('src'); try { v.load(); } catch { /* ignore */ } fn(); };
    const t = setTimeout(() => done(() => reject(new Error('הסרטון לא נפתח בדפדפן הזה'))), 15000);
    const finish = () => {
      const d = Number.isFinite(v.duration) ? v.duration : 0;
      const r = { durationMs: Math.round(d * 1000), w: v.videoWidth, h: v.videoHeight };
      done(() => resolve(r));
    };
    v.onloadedmetadata = () => {
      if (Number.isFinite(v.duration)) { finish(); return; }
      // A recorded WebM (and some phone files) says "Infinity" until it is read to the end: seek far, then it knows.
      // Without this a 2-second clip got the full 6 seconds and froze on its last frame (smoke, 2026-10-25).
      // Read it when the seek has landed, not on the first durationchange: Chrome reports a tiny interim value first
      // (a 2.5 s clip came out as 0 s in one smoke run). Still unknown after that = 0, which the plan treats as "up to 6 s".
      v.onseeked = finish;
      v.currentTime = 1e7;
    };
    v.onerror = () => done(() => reject(new Error('הסרטון לא נפתח בדפדפן הזה. אפשר לנסות סרטון אחר, או לשמור אותו שוב מהגלריה.')));
    v.src = url;
  });
}

/** Wait for one event (or a timeout, which rejects). */
const once = (el, ev, ms = 8000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => { el.removeEventListener(ev, on); reject(new Error(`${ev} timed out`)); }, ms);
  const on = () => { clearTimeout(t); el.removeEventListener(ev, on); resolve(); };
  el.addEventListener(ev, on);
});

/** A clip read by seeking a <video> element: `frameAt(sec)` returns something drawable (the element itself). */
async function seekClip(url) {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
  v.src = url;
  await once(v, 'loadeddata', 15000);
  let at = -1;
  return {
    kind: 'seek',
    async frameAt(sec) {
      // Within half a frame at 30 fps is the same picture: no seek (a 60 fps encode asks twice per source frame).
      if (at >= 0 && Math.abs(sec - at) < 1 / 60) return v;
      const target = Math.max(0, Math.min(sec, (v.duration || sec) - 0.01));
      if (Math.abs(v.currentTime - target) > 0.001) { v.currentTime = target; await once(v, 'seeked'); }
      at = sec;
      return v;
    },
    video: v,
    close() { try { v.pause(); v.removeAttribute('src'); v.load(); } catch { /* ignore */ } },
  };
}

/** A clip decoded in order by mediabunny: fast and frame-exact. Throws when this browser cannot decode the clip. */
async function decodeClip(file, ms) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track || !(await track.canDecode())) { input.dispose?.(); throw new Error('no decoder'); }
  let first = 0;
  try { first = await track.getFirstTimestamp(); } catch { /* 0 */ }
  const sink = new CanvasSink(track, { width: W, height: H, fit: 'cover', poolSize: 3 });
  const gen = sink.canvases(first, first + ms / 1000 + 0.2);
  let cur = (await gen.next()).value || null;
  if (!cur) { input.dispose?.(); throw new Error('no frames'); }
  let next = (await gen.next()).value || null;
  return {
    kind: 'decode',
    async frameAt(sec) {
      const ts = first + sec;
      while (next && next.timestamp <= ts + 1e-4) { cur = next; next = (await gen.next()).value || null; }
      return cur.canvas;
    },
    close() { Promise.resolve().then(() => gen.return?.()).catch(() => {}).finally(() => { try { input.dispose?.(); } catch { /* ignore */ } }); },
  };
}

async function openClip(item, ms) {
  try { return await decodeClip(item.file, ms); } catch { return seekClip(item.url); }
}

// ── Drawing ─────────────────────────────────────────────────────────────────

const sizeOf = (src) => ({ w: src.videoWidth || src.naturalWidth || src.width, h: src.videoHeight || src.naturalHeight || src.height });

/** A picture covering the frame around its centre, zoomed by `zoom`, drifting a little towards `drift` (-1..1). */
function cover(ctx, src, zoom = 1, drift = 0) {
  const { w, h } = sizeOf(src);
  if (!w || !h) return;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const s = Math.max(W / w, H / h) * zoom;
  const dw = w * s, dh = h * s;
  const x = (W - dw) / 2 + drift * (dw - W) / 2;
  ctx.drawImage(src, x, (H - dh) / 2, dw, dh);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** What every media scene carries: logo chip, words, the brand bar. `p` = 0..1 through the scene, `inMs` = ms into it. */
function drawOverlay(ctx, look, { caption, headline, inMs }) {
  const { colors, fam, logo, name } = look;
  // a soft shade at the bottom so the pill reads on a busy photo
  const g = ctx.createLinearGradient(0, H * 0.62, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = g; ctx.fillRect(0, H * 0.62, W, H * 0.38);

  // her mark, top right (RTL: where the eye starts)
  if (logo) {
    const { w, h } = sizeOf(logo);
    const s = Math.min(230 / w, 120 / h), dw = w * s, dh = h * s;
    ctx.save(); ctx.fillStyle = colors.surface; ctx.globalAlpha = 0.92;
    roundRect(ctx, W - 64 - dw - 36, 84, dw + 36, dh + 28, 26); ctx.fill(); ctx.restore();
    ctx.drawImage(logo, W - 64 - 18 - dw, 84 + 14, dw, dh);
  } else if (name) {
    drawText(ctx, { text: name, x: W * 0.3, y: 84, w: W * 0.7 - 64, h: 96, family: fam.display, weight: 700, sizePx: 46, lineHeight: 1.1, maxLines: 1, align: 'right', valign: 'center', color: colors.ink, pill: { color: colors.surface, radius: 26, padX: 26, padY: 14 } });
  }

  const a = Math.min(1, Math.max(0, inMs / WORDS_IN_MS));
  const rise = (1 - a) * 24;
  ctx.save(); ctx.globalAlpha = a;
  if (headline) drawText(ctx, { text: headline, x: 80, y: H * 0.70 + rise, w: W - 160, h: 130, family: fam.display, weight: 700, sizePx: 84, lineHeight: 1.15, maxLines: 1, align: 'center', valign: 'center', color: colors.ink, pill: { color: colors.surface, radius: 30, padX: 40, padY: 20 } });
  if (caption) drawText(ctx, { text: caption, x: 90, y: H * 0.80 + rise, w: W - 180, h: 110, family: fam.body, weight: 700, sizePx: 60, lineHeight: 1.15, maxLines: 1, align: 'center', valign: 'center', color: colors.contrast, pill: { color: colors.primary, radius: 999, padX: 44, padY: 18 } });
  ctx.restore();

  ctx.fillStyle = colors.primary; ctx.fillRect(0, H - 18, W, 18);
}

/** The closing card: everything on her own surface colour, one line at a time. */
function drawEnd(ctx, look, inMs) {
  const { colors, fam, logo, lines } = look;
  ctx.fillStyle = colors.surface; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = colors.blush; ctx.beginPath(); ctx.arc(W / 2, H * 0.42, W * 0.46, 0, Math.PI * 2); ctx.fill();
  const a = Math.min(1, Math.max(0, inMs / (WORDS_IN_MS * 1.5)));
  ctx.save(); ctx.globalAlpha = a;
  let y = H * 0.24;
  if (logo) {
    const { w, h } = sizeOf(logo);
    const s = Math.min(460 / w, 300 / h), dw = w * s, dh = h * s;
    ctx.drawImage(logo, (W - dw) / 2, y + (300 - dh) / 2, dw, dh);
    y += 340;
  } else y += 120;
  const spec = {
    name: { family: fam.display, weight: 700, sizePx: 92, h: 130, color: colors.ink },
    cta: { family: fam.body, weight: 600, sizePx: 58, h: 90, color: colors.deep },
    phone: { family: fam.body, weight: 700, sizePx: 76, h: 110, color: colors.ink },
    handle: { family: fam.body, weight: 600, sizePx: 54, h: 90, color: colors.deep },
  };
  for (const l of lines) {
    const s = spec[l.role];
    drawText(ctx, { text: l.text, x: 90, y, w: W - 180, h: s.h, family: s.family, weight: s.weight, sizePx: s.sizePx, lineHeight: 1.15, maxLines: 1, align: 'center', valign: 'center', color: s.color });
    y += s.h + (l.role === 'name' ? 40 : 10);
  }
  ctx.restore();
  ctx.fillStyle = colors.primary; ctx.fillRect(0, H - 18, W, 18);
}

/** Her look for this reel: colours, fonts, logo, name, the closing lines. */
export async function loadLook(settings, brand = {}) {
  const b = settings?.branding && typeof settings.branding === 'object' ? settings.branding : {};
  const colors = colorsFor(settings?.primary_color, typeof b.secondary_color === 'string' ? b.secondary_color : null);
  const fam = { display: resolveFamily(FONTS.display), body: resolveFamily(FONTS.body) };
  await Promise.all([`700 40px ${fam.display}`, `700 40px ${fam.body}`, `600 40px ${fam.body}`].map((f) => document.fonts?.load(f, 'אבג abc 123').catch(() => null)));
  const logo = brand.logo !== false && b.logo_url ? await loadImage(b.logo_url) : null;
  const name = captionLine(settings?.business_name || '', 40);
  const lines = endCardLines({ businessName: name, phone: settings?.business_phone || '', instagram: instagramHandle(b.instagram), showPhone: brand.phone !== false, showInstagram: brand.instagram !== false });
  return { colors, fam, logo, name, lines };
}

/**
 * Render the reel. Returns { blob, ext }.
 * @param {{ canvas: HTMLCanvasElement, plan: ReturnType<typeof import('@/lib/design/ownReel').planOwnReel>,
 *   items: { kind: 'photo'|'video', file: File, url: string, img?: HTMLImageElement }[], captions: string[], headline: string,
 *   look: Awaited<ReturnType<typeof loadLook>>, musicUrl?: string|null, onProgress?: (p: number) => void,
 *   onStatus?: (s: string) => void, shouldStop?: () => boolean }} opts
 */
export async function renderOwnReel({ canvas, plan, items, captions, headline, look, musicUrl = null, onProgress, onStatus, shouldStop }) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const snap = document.createElement('canvas'); snap.width = W; snap.height = H;
  const sctx = snap.getContext('2d');
  const words = captions.map((c) => captionLine(c || ''));
  const head = captionLine(headline || '', HEADLINE_MAX);

  // frame `el` ms into the reel, given the frame source of a video scene (null otherwise)
  let shown = -1;
  const sceneAt = (el) => { let i = 0; while (i < plan.scenes.length - 1 && el >= plan.scenes[i + 1].startMs) i++; return i; };
  const paint = (c, el, frame) => {
    const i = sceneAt(el), s = plan.scenes[i];
    const inMs = el - s.startMs;
    // the scene changed: keep the last picture of the one before, for the crossfade
    if (i !== shown) { if (shown >= 0) { sctx.clearRect(0, 0, W, H); sctx.drawImage(canvas, 0, 0); } shown = i; }
    c.save();
    c.fillStyle = look.colors.surface; c.fillRect(0, 0, W, H);
    if (s.kind === 'end') drawEnd(c, look, inMs);
    else {
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      const src = s.kind === 'video' ? frame : items[s.item].img;
      if (src) cover(c, src, s.kind === 'photo' ? 1 + 0.07 * Math.min(1, inMs / s.ms) : 1, s.kind === 'photo' ? (s.item % 2 ? 0.25 : -0.25) * Math.min(1, inMs / s.ms) : 0);
      drawOverlay(c, look, { caption: words[s.item], headline: s.item === 0 ? head : '', inMs });
    }
    c.restore();
    if (i > 0 && inMs < FADE_MS) {
      c.save(); c.globalAlpha = 1 - inMs / FADE_MS; c.drawImage(snap, 0, 0); c.restore();
    }
  };

  // one frame source per video scene, opened as the reel reaches it and closed after
  const clips = new Map();
  const clipFor = async (i) => {
    if (!clips.has(i)) {
      for (const [k, c] of clips) if (k !== i) { c.close(); clips.delete(k); }
      clips.set(i, await openClip(items[plan.scenes[i].item], plan.scenes[i].ms));
    }
    return clips.get(i);
  };
  let frame = null;
  const prepareAt = async (el) => {
    const i = sceneAt(el), s = plan.scenes[i];
    frame = s.kind === 'video' ? await (await clipFor(i)).frameAt((el - s.startMs) / 1000) : null;
  };

  try {
    // 1. Frame-exact MP4 (WebCodecs), preset after preset (a browser can say "supported" and still refuse).
    const presets = !musicUrl || (await canEncodeMusic()) ? await encodePresets(W, H) : [];
    for (const preset of presets) {
      onStatus?.('מכינה את הרילס'); shown = -1;
      try {
        const blob = await encodeReelMp4({ canvas, drawAt: (c, el) => paint(c, el, frame), prepareAt, totalMs: plan.totalMs, preset, musicUrl, onProgress, shouldStop });
        return { blob, ext: 'mp4' };
      } catch (e) {
        if (shouldStop?.()) throw e;
        console.warn('[own-reel] encoder preset failed, trying the next:', preset.label, e?.message || e);
        for (const c of clips.values()) c.close();
        clips.clear();
      }
    }

    // 2. MediaRecorder in real time: clips play in <video> elements while the canvas is recorded.
    if (typeof MediaRecorder === 'undefined') throw new Error('הדפדפן לא תומך ביצירת וידאו. נסי בכרום או בספארי מעודכן.');
    if (document.hidden) throw new Error('הטאב לא פעיל. חזרי למסך הזה ונסי שוב.');
    onStatus?.('מקליטה את הרילס'); shown = -1;
    const players = new Map();
    for (const s of plan.scenes) if (s.kind === 'video') { const c = await seekClip(items[s.item].url); await c.frameAt(0); players.set(s.item, c); }
    paint(ctx, 0, players.get(plan.scenes[0].item)?.video || null);
    const mime = pickRecorderMime();
    const tracks = [...canvas.captureStream(30).getVideoTracks()];
    let audioCtx = null, audio = null;
    if (musicUrl) {
      try {
        audio = new Audio(musicUrl); audio.loop = true;
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const dest = audioCtx.createMediaStreamDestination();
        audioCtx.createMediaElementSource(audio).connect(dest);
        dest.stream.getAudioTracks().forEach((t) => tracks.push(t));
        await audio.play().catch(() => {});
      } catch { /* video only */ }
    }
    const recorder = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: 12_000_000 });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    const finished = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start();
    let playing = -1;
    const t0 = performance.now();
    await new Promise((done) => {
      const tick = (now) => {
        if (shouldStop?.()) { done(); return; }
        const el = Math.min(now - t0, plan.totalMs);
        const i = sceneAt(el), s = plan.scenes[i];
        if (s.kind === 'video' && playing !== i) {
          for (const p of players.values()) p.video.pause();
          const p = players.get(s.item); p.video.currentTime = 0; p.video.play().catch(() => {});
          playing = i;
        }
        paint(ctx, el, s.kind === 'video' ? players.get(s.item).video : null);
        onProgress?.(el / plan.totalMs);
        if (el < plan.totalMs) requestAnimationFrame(tick); else done();
      };
      requestAnimationFrame(tick);
    });
    recorder.stop();
    await finished;
    for (const p of players.values()) p.close();
    if (audio) { try { audio.pause(); } catch { /* ignore */ } }
    if (audioCtx) { try { await audioCtx.close(); } catch { /* ignore */ } }
    if (shouldStop?.()) throw new Error('ההקלטה הופסקה כי עזבת את הטאב באמצע. השאירי את המסך הזה פתוח עד שהרילס מוכן, ונסי שוב.');
    const actual = recorder.mimeType || mime;
    return { blob: new Blob(chunks, { type: actual }), ext: fileExtFor(actual) };
  } finally {
    for (const c of clips.values()) c.close();
  }
}
