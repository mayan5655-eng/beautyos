'use client';

// app/design/ReelRender.jsx
//
// The composited reel recorder. A reel is a sequence of story frames; this
// turns a filled reel into a video file in her browser, with no server video
// stack - canvas + WebCodecs (frame-exact H.264 High MP4, app/design/reelEncoder.js),
// or canvas + MediaRecorder where WebCodecs is missing - drawing the frames the studio draws:
//
//   per scene, once:   the frame's non-photo layers are drawn straight onto
//                      canvases by canvasRender (the same drawer the PNG
//                      export uses: wrapped, fitted, never clipped text,
//                      Hebrew in order, the strip, the decoration), split
//                      into what sits UNDER the photos and what sits OVER them
//   per video frame:   background, the under canvas, the photo layers drawn
//                      live with a slow Ken Burns zoom and their wash, then
//                      the over canvas; scenes cut, crossfade or slide
//
// Music is optional and hers (an audio file), mixed into the recording.

import { useRef, useState } from 'react';
import Icon from '../Icon';
import Spinner from '../Spinner';
import { CANVAS } from '@/lib/design/contract';
import SaveShare from './SaveShare';
import { resolveImageRef } from './images';
import { renderLayersCanvas, drawImageLayer, drawGraphicLayer, boxPx, loadImage } from './canvasRender';
import { pickRecorderMime, fileExtFor } from '@/lib/design/recorderMime';
import { sceneStarts, sceneIndexAt } from '@/lib/design/reelEncode';
import { pickEncodePreset, canEncodeMusic, encodeReelMp4 } from './reelEncoder';

const W = CANVAS.story.w, H = CANVAS.story.h, FPS = 30; // FPS: the MediaRecorder fallback only
const TRANSITION_MS = 500;

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

/** A graphic that moves (waves, spinning stars, a floating dot): drawn live, every frame, never pre-rendered. */
const isLive = (l) => l.type === 'graphic' && !!l.motion && l.motion !== 'none';

/**
 * Layer order for a frame that has live graphics. The usual under/photos/over split assumes everything that is
 * not a photo can be drawn once; here a moving wave sits BETWEEN static layers, so the frame is cut into runs:
 * a static run (rendered once to a canvas), a photo, or one live graphic, in the layers' own order.
 */
function orderedRuns(layers) {
  const runs = [];
  let cur = null;
  layers.forEach((l, i) => {
    if (l.type === 'image') { cur = null; runs.push({ kind: 'photo', layer: l }); }
    else if (isLive(l)) { cur = null; runs.push({ kind: 'live', layer: l }); }
    else {
      if (!cur) { cur = { kind: 'static', members: new Set() }; runs.push(cur); }
      cur.members.add(i);
    }
  });
  return runs;
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
  const [sharing, setSharing] = useState(false);
  const canvasRef = useRef(null);
  const audioRef = useRef(null);

  const missing = fills.flatMap((f, i) => f.missing.map((m) => `${reel.scenes[i].label}: ${m.startsWith('slot:') ? 'תמונה' : m}`));

  const render = async () => {
    if (video?.url) { try { URL.revokeObjectURL(video.url); } catch { /* ignore */ } }
    setBusy(true); setError(''); setVideo(null); setProgress(0);
    let audioCtx = null;
    let leftTheTab = false;
    const onVisibility = () => { if (document.hidden) leftTheTab = true; };
    document.addEventListener('visibilitychange', onVisibility);
    try {
      // 1. Draw every scene's under/over layers onto canvases, and load its photos.
      setStatus('מציירת את הסצנות');
      const scenes = [];
      let startAcc = 0;
      for (let i = 0; i < reel.scenes.length; i++) {
        const frame = reel.scenes[i].frame;
        const startMs = startAcc;
        startAcc += reel.scenes[i].seconds * 1000;
        // A frame with a moving graphic is drawn run by run in layer order (see orderedRuns); every other frame
        // keeps the original under / photos / over path unchanged.
        if (frame.layers.some(isLive)) {
          const runs = [];
          for (const run of orderedRuns(frame.layers)) {
            if (run.kind === 'static') runs.push({ kind: 'static', canvas: await renderLayersCanvas(frame, fills[i], (l, k) => run.members.has(k)) });
            else if (run.kind === 'photo') {
              const ref = fills[i].images?.[run.layer.slot];
              const src = ref ? await resolveImageRef(ref) : null;
              runs.push({ kind: 'photo', layer: run.layer, img: await loadImage(src), box: boxPx(run.layer, W, H) });
            } else runs.push({ kind: 'live', layer: run.layer, box: boxPx(run.layer, W, H) });
          }
          scenes.push({ runs, under: null, over: null, imgs: [], colors: fills[i].colors, fonts: fills[i].fonts, motion: reel.scenes[i].motion, transition: reel.scenes[i].transition, ms: reel.scenes[i].seconds * 1000, startMs });
          setProgress(Math.round(((i + 1) / reel.scenes.length) * 20));
          continue;
        }
        const { photos, under: underFilter, over: overFilter } = splitLayers(frame.layers);
        const under = frame.layers.some((l, k, all) => underFilter(l, k, all)) ? await renderLayersCanvas(frame, fills[i], underFilter) : null;
        const over = frame.layers.some((l, k, all) => overFilter(l, k, all)) ? await renderLayersCanvas(frame, fills[i], overFilter) : null;
        const imgs = [];
        for (const l of photos) {
          const ref = fills[i].images?.[l.slot];
          const src = ref ? await resolveImageRef(ref) : null;
          imgs.push({ layer: l, img: await loadImage(src), box: boxPx(l, W, H) });
        }
        scenes.push({ under, over, imgs, colors: fills[i].colors, fonts: fills[i].fonts, motion: reel.scenes[i].motion, transition: reel.scenes[i].transition, ms: reel.scenes[i].seconds * 1000, startMs });
        setProgress(Math.round(((i + 1) / reel.scenes.length) * 20));
      }

      // 2. Draw a scene at progress t (0..1) into a canvas.
      const drawScene = (ctx, s, t) => {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = s.colors.surface; ctx.fillRect(0, 0, W, H);
        if (s.runs) {
          // Reel-global seconds: a wave keeps travelling across a scene cut instead of restarting each scene.
          const tReel = (s.startMs + t * s.ms) / 1000;
          for (const r of s.runs) {
            if (r.kind === 'static') ctx.drawImage(r.canvas, 0, 0, W, H);
            else if (r.kind === 'photo') drawImageLayer(ctx, r.layer, r.box, r.img, s.colors, s.motion === 'kenburns' ? 1 + 0.08 * t : 1);
            else drawGraphicLayer(ctx, r.layer, r.box, s.colors, s.fonts, tReel);
          }
          return;
        }
        if (s.under) ctx.drawImage(s.under, 0, 0, W, H);
        for (const p of s.imgs) drawImageLayer(ctx, p.layer, p.box, p.img, s.colors, s.motion === 'kenburns' ? 1 + 0.08 * t : 1);
        if (s.over) ctx.drawImage(s.over, 0, 0, W, H);
      };

      // 3. The frame `el` ms into the reel: the scene on screen, or two scenes mid-transition.
      const canvas = canvasRef.current;
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      const a = document.createElement('canvas'); a.width = W; a.height = H; const actx = a.getContext('2d');
      const b = document.createElement('canvas'); b.width = W; b.height = H; const bctx = b.getContext('2d');
      const { starts, total } = sceneStarts(scenes);
      const drawAt = (c, el) => {
        const i = sceneIndexAt(starts, el);
        const s = scenes[i];
        const tIn = Math.min((el - starts[i]) / (s.ms || 1), 1);
        const into = el - starts[i];
        if (i > 0 && s.transition !== 'cut' && into < TRANSITION_MS) {
          const p = into / TRANSITION_MS;
          drawScene(actx, scenes[i - 1], 1); drawScene(bctx, s, tIn);
          c.clearRect(0, 0, W, H);
          if (s.transition === 'fade') { c.drawImage(a, 0, 0); c.globalAlpha = p; c.drawImage(b, 0, 0); c.globalAlpha = 1; }
          else { const e = 1 - Math.pow(1 - p, 3); c.drawImage(a, -e * W, 0); c.drawImage(b, W - e * W, 0); }
        } else drawScene(c, s, tIn);
      };

      // 4a. Frame-exact MP4 (WebCodecs, H.264 High, 60 fps when it can): see lib/design/reelEncode.js for why.
      const preset = await pickEncodePreset(W, H);
      if (preset && (!music || (await canEncodeMusic()))) {
        setStatus('מקודדת את הסרטון באיכות גבוהה');
        const blob = await encodeReelMp4({ canvas, drawAt, totalMs: total, preset, musicUrl: music?.url || null, onProgress: (p) => setProgress(20 + Math.round(p * 80)) });
        const url = URL.createObjectURL(blob);
        setVideo({ url, ext: 'mp4', blob });
        setStatus('');
        toast?.('הרילס מוכן');
        try { await onVideo?.(blob, 'mp4'); } catch (e) { setError('הסרטון מוכן להורדה, אבל לא נשמר בחשבון: ' + String(e?.message || e)); }
        return;
      }

      // 4b. Fallback: record the canvas in real time with MediaRecorder. A tab that goes to the background stops
      // requestAnimationFrame, so the file would come out with frozen frames and nothing would say so: stop instead.
      if (typeof MediaRecorder === 'undefined') throw new Error('הדפדפן לא תומך ביצירת וידאו. נסי בכרום או בספארי מעודכן.');
      if (document.hidden) throw new Error('הטאב לא פעיל. חזרי למסך הזה ונסי שוב.');
      drawScene(ctx, scenes[0], 0);

      const mime = pickRecorderMime(); // H.264 + AAC when the browser can; see lib/design/recorderMime.js for why
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
      const recorder = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: 12_000_000 });
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      const finished = new Promise((resolve) => { recorder.onstop = resolve; });
      recorder.start();
      setStatus('מקליטה את הסרטון');

      const t0 = performance.now();
      await new Promise((done) => {
        const tick = (now) => {
          if (leftTheTab) { done(); return; }
          const el = now - t0;
          drawAt(ctx, Math.min(el, total));
          setProgress(20 + Math.round(Math.min(el / total, 1) * 80));
          if (el < total) requestAnimationFrame(tick); else done();
        };
        requestAnimationFrame(tick);
      });
      recorder.stop();
      await finished;
      if (leftTheTab) throw new Error('ההקלטה הופסקה כי עזבת את הטאב באמצע. השאירי את המסך הזה פתוח עד שהסרטון מוכן, ונסי שוב.');
      // What the recorder REPORTS it recorded decides the name: an MP4 box around VP9/Opus is not a postable .mp4.
      const actualMime = recorder.mimeType || mime;
      const ext = fileExtFor(actualMime);
      const blob = new Blob(chunks, { type: actualMime });
      const url = URL.createObjectURL(blob);
      setVideo({ url, ext, blob });
      setStatus('');
      toast?.('הרילס מוכן');
      // Keeping a copy in her account is a bonus on top of the download. When it fails she is told, instead of
      // the "ready" above implying it was stored.
      try { await onVideo?.(blob, ext); } catch (e) { setError('הסרטון מוכן להורדה, אבל לא נשמר בחשבון: ' + String(e?.message || e)); }
    } catch (e) {
      setError(String(e?.message || e || 'הרנדר נכשל'));
    } finally {
      document.removeEventListener('visibilitychange', onVisibility);
      if (audioRef.current) { try { audioRef.current.pause(); } catch { /* ignore */ } }
      if (audioCtx) { try { await audioCtx.close(); } catch { /* ignore */ } }
      setBusy(false);
    }
  };

  const total = reel.scenes.reduce((n, s) => n + s.seconds, 0);

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '14px 14px 12px', background: 'var(--surface)' }}>
      <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}><Icon name="film" size={14} /> הסרטון</p>
      <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 10 }}>{reel.scenes.length} סצנות, {total} שניות, 9:16 ב-1080×1920. הרנדר קורה כאן בדפדפן ולוקח בערך {Math.ceil(total + 8)} שניות.{reel.musicVibe ? ` מוזיקה מומלצת: ${reel.musicVibe}.` : ''}</p>
      {missing.length > 0 && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--warning, #B26B00)', marginBottom: 8 }}>חסר: {missing.join(', ')}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={render} disabled={busy} className="primary-btn" style={{ padding: '10px 18px', background: 'var(--pc-grad)', color: 'var(--pc-contrast)', fontSize: 'var(--t-sm)', opacity: busy ? 0.6 : 1 }}>
          {busy ? <Spinner inline label={status || 'מרנדרת'} /> : video ? 'לרנדר שוב' : 'ליצור את הסרטון'}
        </button>
        <label style={{ fontSize: 'var(--t-xs)', color: 'var(--pc-deep)', cursor: 'pointer', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '8px 12px', background: 'var(--surface)' }}>
          <Icon name="music" size={12} /> {music ? music.name : 'מוזיקה (לא חובה)'}
          <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) { if (music?.url) { try { URL.revokeObjectURL(music.url); } catch { /* ignore */ } } setMusic({ name: f.name, url: URL.createObjectURL(f) }); } }} />
        </label>
        {music && <button onClick={() => setMusic(null)} style={{ background: 'none', border: 'none', color: 'var(--ink-3)', fontSize: 'var(--t-xs)', cursor: 'pointer', fontFamily: 'inherit' }}>בלי מוזיקה</button>}
      </div>
      {busy && <div style={{ height: 6, background: 'var(--line)', borderRadius: 'var(--r-full)', marginTop: 10, overflow: 'hidden' }}><div style={{ height: '100%', width: `${progress}%`, background: 'var(--pc)', transition: 'width 0.2s' }} /></div>}
      {error && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', marginTop: 8 }}>{error}</p>}
      {video && (
        <div style={{ marginTop: 12 }}>
          <video src={video.url} controls playsInline style={{ width: '100%', maxWidth: 240, borderRadius: 'var(--r-sm)', display: 'block', background: '#000' }} />
          {/* The share sheet needs her own tap, so the finished video waits in the panel for it. */}
          <button onClick={() => setSharing(true)} className="primary-btn" style={{ marginTop: 8, padding: '9px 16px', background: 'var(--surface)', color: 'var(--pc-deep)', border: '1px solid var(--line-2)', fontSize: 'var(--t-sm)' }}>
            <Icon name="share" size={14} /> שמירה ושיתוף הסרטון ({video.ext})
          </button>
          <SaveShare open={sharing} onClose={() => setSharing(false)} blob={video.blob} kind="video" ext={video.ext} downloadName={`${(name || reel.name).replace(/[^\p{L}\p{N}]+/gu, '-')}-reel.${video.ext}`} toast={toast} />
          {video.ext !== 'mp4' && (
            <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', lineHeight: 1.6, marginTop: 8 }}>הדפדפן הזה שומר את הסרטון בפורמט שאינסטגרם לא מקבלת. כדי לקבל קובץ שאפשר להעלות, יצרי את הרילס ב-Chrome מעודכן או בספארי.</p>
          )}
        </div>
      )}

      {/* The recorder's canvas, off-screen. */}
      <div aria-hidden style={{ position: 'fixed', left: -30000, top: 0, pointerEvents: 'none' }}>
        <canvas ref={canvasRef} width={W} height={H} />
        <audio ref={audioRef} />
      </div>
    </div>
  );
}
