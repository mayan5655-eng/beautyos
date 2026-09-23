'use client';

// app/design/ReelRender.jsx
//
// The composited reel recorder. A reel is a sequence of story frames; this
// turns a filled reel into a video file in her browser, with no server video
// stack, the way ReelStudio did - canvas + MediaRecorder - but drawing the
// frames the studio draws:
//
//   per scene, once:   the frame's non-photo layers are rasterised from the
//                      same DOM renderer the studio uses (fonts, Hebrew,
//                      strip, deco, safe contrast), split into what sits
//                      UNDER the photos and what sits OVER them
//   per video frame:   background, the under-raster, the photo layers drawn
//                      live with a slow Ken Burns zoom and their wash, then
//                      the over-raster; scenes cut, crossfade or slide
//
// Music is optional and hers (an audio file), mixed into the recording.

import { useRef, useState } from 'react';
import Icon from '../Icon';
import Spinner from '../Spinner';
import DomPreview from './DomPreview';
import { CANVAS } from '@/lib/design/contract';
import { captureElementPng, downloadBlob } from './exportPng';
import { resolveImageRef } from './images';

const W = CANVAS.story.w, H = CANVAS.story.h, FPS = 30;
const TRANSITION_MS = 500;

const hexToRgb = (hex) => {
  const h = String(hex || '').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return Number.isNaN(n) ? { r: 0, g: 0, b: 0 } : { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};
const rgba = (hex, a) => { const { r, g, b } = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };

const pickMime = () => {
  for (const c of ['video/mp4;codecs=h264', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return 'video/webm';
};

const loadImage = (src) => new Promise((resolve) => {
  if (!src) { resolve(null); return; }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

const blobToImage = async (blob) => { const url = URL.createObjectURL(blob); const img = await loadImage(url); return img; };

/** Which of a frame's layers are photos, and the split around them. */
function splitLayers(layers) {
  const idx = layers.map((l, i) => (l.type === 'image' ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return { under: () => false, over: () => true, photos: [] };
  const first = idx[0], last = idx[idx.length - 1];
  return {
    under: (l, i) => i < first && l.type !== 'image',
    over: (l, i) => i > last && l.type !== 'image',
    photos: layers.filter((l) => l.type === 'image'),
  };
}

/** Clip the context to a photo layer's shape, in px. */
function clipShape(ctx, box, l) {
  const { x, y, w, h } = box;
  ctx.beginPath();
  if (l.radius === 999) ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (l.shape === 'arch') { const r = w / 2; ctx.moveTo(x, y + h); ctx.lineTo(x, y + r); ctx.arc(x + r, y + r, r, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath(); }
  else { const r = l.radius || 0; ctx.roundRect(x, y, w, h, r); }
  ctx.clip();
}

/** Draw an image covering the box, keeping the focal point, zoomed by k. */
function drawCover(ctx, img, box, focus, k) {
  const scale = Math.max(box.w / img.width, box.h / img.height) * k;
  const dw = img.width * scale, dh = img.height * scale;
  const fx = focus?.x ?? 0.5, fy = focus?.y ?? 0.5;
  const dx = box.x - (dw - box.w) * fx, dy = box.y - (dh - box.h) * fy;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawWash(ctx, box, overlay, colors) {
  const c = colors[overlay.color]; const a = overlay.opacity;
  let g;
  if (overlay.direction === 'bottom') { g = ctx.createLinearGradient(0, box.y + box.h, 0, box.y); g.addColorStop(0, rgba(c, a)); g.addColorStop(0.4, rgba(c, a * 0.6)); g.addColorStop(0.75, rgba(c, 0)); }
  else if (overlay.direction === 'top') { g = ctx.createLinearGradient(0, box.y, 0, box.y + box.h); g.addColorStop(0, rgba(c, a)); g.addColorStop(0.7, rgba(c, 0)); }
  else if (overlay.direction === 'rise') { g = ctx.createLinearGradient(0, box.y + box.h, 0, box.y); g.addColorStop(0, rgba(c, a)); g.addColorStop(0.38, rgba(c, a)); g.addColorStop(0.55, rgba(c, a * 0.55)); g.addColorStop(0.8, rgba(c, 0)); }
  else g = rgba(c, a);
  ctx.fillStyle = g;
  ctx.fillRect(box.x, box.y, box.w, box.h);
}

/**
 * @param reel   the ReelTemplate
 * @param fills  one Fill per scene (lib/design/reel.ts fillReel)
 * @param name   file name stem
 * @param onVideo (blob, ext) after a successful render, for saving
 */
export default function ReelRender({ reel, fills, name, onVideo, toast }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [video, setVideo] = useState(null); // { url, ext, blob }
  const [music, setMusic] = useState(null);
  const [error, setError] = useState('');
  const canvasRef = useRef(null);
  const audioRef = useRef(null);
  const rasterRef = useRef(null);

  const missing = fills.flatMap((f, i) => f.missing.map((m) => `${reel.scenes[i].label}: ${m.startsWith('slot:') ? 'תמונה' : m}`));

  const render = async () => {
    if (typeof MediaRecorder === 'undefined') { setError('הדפדפן לא תומך בהקלטת וידאו. נסי בכרום או בספארי מעודכן.'); return; }
    setBusy(true); setError(''); setVideo(null); setProgress(0);
    let audioCtx = null;
    try {
      // 1. Rasterise every scene's under/over layers from the hidden DOM frames, load its photos.
      setStatus('מציירת את הסצנות');
      const host = rasterRef.current;
      const scenes = [];
      for (let i = 0; i < reel.scenes.length; i++) {
        const frame = reel.scenes[i].frame;
        const { photos } = splitLayers(frame.layers);
        const underEl = host.querySelector(`[data-scene="${i}"][data-part="under"]`);
        const overEl = host.querySelector(`[data-scene="${i}"][data-part="over"]`);
        const under = underEl && underEl.childElementCount ? await blobToImage(await captureElementPng(underEl)) : null;
        const over = overEl ? await blobToImage(await captureElementPng(overEl)) : null;
        const imgs = [];
        for (const l of photos) {
          const ref = fills[i].images?.[l.slot];
          const src = ref ? await resolveImageRef(ref) : null;
          imgs.push({ layer: l, img: await loadImage(src), box: { x: (l.box.x / 100) * W, y: (l.box.y / 100) * H, w: (l.box.w / 100) * W, h: (l.box.h / 100) * H } });
        }
        scenes.push({ under, over, imgs, colors: fills[i].colors, motion: reel.scenes[i].motion, transition: reel.scenes[i].transition, ms: reel.scenes[i].seconds * 1000 });
        setProgress(Math.round(((i + 1) / reel.scenes.length) * 20));
      }

      // 2. Draw a scene at progress t (0..1) into a canvas.
      const drawScene = (ctx, s, t) => {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = s.colors.surface; ctx.fillRect(0, 0, W, H);
        if (s.under) ctx.drawImage(s.under, 0, 0, W, H);
        for (const p of s.imgs) {
          ctx.save();
          clipShape(ctx, p.box, p.layer);
          if (p.img) drawCover(ctx, p.img, p.box, p.layer.focus, s.motion === 'kenburns' ? 1 + 0.08 * t : 1);
          else { const g = ctx.createLinearGradient(p.box.x, p.box.y, p.box.x + p.box.w, p.box.y + p.box.h); g.addColorStop(0, s.colors.blush); g.addColorStop(1, s.colors.sand); ctx.fillStyle = g; ctx.fillRect(p.box.x, p.box.y, p.box.w, p.box.h); }
          if (p.layer.overlay) drawWash(ctx, p.box, p.layer.overlay, s.colors);
          ctx.restore();
        }
        if (s.over) ctx.drawImage(s.over, 0, 0, W, H);
      };

      // 3. Record.
      const canvas = canvasRef.current;
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      const a = document.createElement('canvas'); a.width = W; a.height = H; const actx = a.getContext('2d');
      const b = document.createElement('canvas'); b.width = W; b.height = H; const bctx = b.getContext('2d');
      drawScene(ctx, scenes[0], 0);

      const mime = pickMime();
      const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
      const tracks = [...canvas.captureStream(FPS).getVideoTracks()];
      if (music && audioRef.current) {
        try {
          audioRef.current.src = music.url; audioRef.current.loop = true;
          await audioRef.current.play().catch(() => {});
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const source = audioCtx.createMediaElementSource(audioRef.current);
          const dest = audioCtx.createMediaStreamDestination();
          source.connect(dest); source.connect(audioCtx.destination);
          dest.stream.getAudioTracks().forEach((tr) => tracks.push(tr));
        } catch { /* video only */ }
      }
      const recorder = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: 6000000 });
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      const finished = new Promise((resolve) => { recorder.onstop = resolve; });
      recorder.start();
      setStatus('מקליטה את הסרטון');

      const starts = []; let acc = 0;
      for (const s of scenes) { starts.push(acc); acc += s.ms; }
      const total = acc;
      const t0 = performance.now();
      await new Promise((done) => {
        const tick = (now) => {
          const el = now - t0;
          let i = 0; while (i < scenes.length - 1 && el >= starts[i + 1]) i++;
          const s = scenes[i];
          const tIn = Math.min((el - starts[i]) / (s.ms || 1), 1);
          const into = el - starts[i];
          if (i > 0 && s.transition !== 'cut' && into < TRANSITION_MS) {
            const p = into / TRANSITION_MS;
            drawScene(actx, scenes[i - 1], 1); drawScene(bctx, s, tIn);
            ctx.clearRect(0, 0, W, H);
            if (s.transition === 'fade') { ctx.drawImage(a, 0, 0); ctx.globalAlpha = p; ctx.drawImage(b, 0, 0); ctx.globalAlpha = 1; }
            else { const e = 1 - Math.pow(1 - p, 3); ctx.drawImage(a, -e * W, 0); ctx.drawImage(b, W - e * W, 0); }
          } else drawScene(ctx, s, tIn);
          setProgress(20 + Math.round(Math.min(el / total, 1) * 80));
          if (el < total) requestAnimationFrame(tick); else done();
        };
        requestAnimationFrame(tick);
      });
      recorder.stop();
      await finished;
      const blob = new Blob(chunks, { type: mime });
      const url = URL.createObjectURL(blob);
      setVideo({ url, ext, blob });
      setStatus('');
      onVideo?.(blob, ext);
      toast?.('הרילס מוכן');
    } catch (e) {
      setError(String(e?.message || e || 'הרנדר נכשל'));
    } finally {
      if (audioRef.current) { try { audioRef.current.pause(); } catch { /* ignore */ } }
      if (audioCtx) { try { await audioCtx.close(); } catch { /* ignore */ } }
      setBusy(false);
    }
  };

  const total = reel.scenes.reduce((n, s) => n + s.seconds, 0);

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '14px 14px 12px', background: 'var(--surface)' }}>
      <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}><Icon name="film" size={14} /> הסרטון</p>
      <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 10 }}>{reel.scenes.length} סצנות, {total} שניות, 9:16. הרנדר קורה כאן בדפדפן ולוקח בערך {Math.ceil(total + 8)} שניות.{reel.musicVibe ? ` מוזיקה מומלצת: ${reel.musicVibe}.` : ''}</p>
      {missing.length > 0 && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--warning, #B26B00)', marginBottom: 8 }}>חסר: {missing.join(', ')}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={render} disabled={busy} className="primary-btn" style={{ padding: '10px 18px', background: 'var(--pc-grad)', color: 'var(--pc-contrast)', fontSize: 'var(--t-sm)', opacity: busy ? 0.6 : 1 }}>
          {busy ? <Spinner inline label={status || 'מרנדרת'} /> : video ? 'לרנדר שוב' : 'ליצור את הסרטון'}
        </button>
        <label style={{ fontSize: 'var(--t-xs)', color: 'var(--pc-deep)', cursor: 'pointer', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '8px 12px', background: 'var(--surface)' }}>
          <Icon name="music" size={12} /> {music ? music.name : 'מוזיקה (לא חובה)'}
          <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) setMusic({ name: f.name, url: URL.createObjectURL(f) }); }} />
        </label>
        {music && <button onClick={() => setMusic(null)} style={{ background: 'none', border: 'none', color: 'var(--ink-3)', fontSize: 'var(--t-xs)', cursor: 'pointer', fontFamily: 'inherit' }}>בלי מוזיקה</button>}
      </div>
      {busy && <div style={{ height: 6, background: 'var(--line)', borderRadius: 'var(--r-full)', marginTop: 10, overflow: 'hidden' }}><div style={{ height: '100%', width: `${progress}%`, background: 'var(--pc)', transition: 'width 0.2s' }} /></div>}
      {error && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', marginTop: 8 }}>{error}</p>}
      {video && (
        <div style={{ marginTop: 12 }}>
          <video src={video.url} controls playsInline style={{ width: '100%', maxWidth: 240, borderRadius: 'var(--r-sm)', display: 'block', background: '#000' }} />
          <button onClick={() => downloadBlob(video.blob, `${(name || reel.name).replace(/[^\p{L}\p{N}]+/gu, '-')}-reel.${video.ext}`)} className="primary-btn" style={{ marginTop: 8, padding: '9px 16px', background: 'var(--surface)', color: 'var(--pc-deep)', border: '1px solid var(--line-2)', fontSize: 'var(--t-sm)' }}>
            <Icon name="download" size={14} /> הורדת הסרטון ({video.ext})
          </button>
        </div>
      )}

      {/* The recorder's canvas and the frames it rasterises, off-screen. */}
      <div aria-hidden style={{ position: 'fixed', left: -30000, top: 0, pointerEvents: 'none' }}>
        <canvas ref={canvasRef} width={W} height={H} />
        <audio ref={audioRef} />
        <div ref={rasterRef}>
          {reel.scenes.map((s, i) => {
            const { under, over } = splitLayers(s.frame.layers);
            return (
              <div key={s.id}>
                <div data-scene={i} data-part="under"><DomPreview template={s.frame} fill={fills[i]} width={W} transparent layerFilter={under} /></div>
                <div data-scene={i} data-part="over"><DomPreview template={s.frame} fill={fills[i]} width={W} transparent layerFilter={over} /></div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
