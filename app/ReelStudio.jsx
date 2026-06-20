"use client";

// ============================================================
// ReelStudio - turns uploaded photos into a real MP4 slideshow
// Standalone component. Does NOT touch beautyos.jsx.
// Uses ffmpeg.wasm (loaded from CDN at runtime) to encode an
// actual .mp4 file the user can download and upload to Instagram.
// All UI text is Hebrew; all code comments are English only.
// ============================================================

import { useState, useRef, useCallback } from "react";

// Vertical reel canvas size (Instagram/TikTok standard 9:16)
const W = 1080;
const H = 1920;
const FPS = 30;

// Theme color (can be passed as prop; default is BeautyOS pink)
export default function ReelStudio({ primaryColor = "#C77B92", businessName = "BeautyOS" }) {
  const pc = primaryColor;

  const [slides, setSlides] = useState([]);      // [{id, img(HTMLImageElement), url, caption}]
  const [title, setTitle] = useState("");
  const [secondsPer, setSecondsPer] = useState(2.5);
  const [music, setMusic] = useState(null);      // {file, url}
  const [building, setBuilding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [videoUrl, setVideoUrl] = useState(null);
  const [error, setError] = useState(null);

  const ffmpegRef = useRef(null);
  const canvasRef = useRef(null);

  // ---- Load an uploaded image file into an HTMLImageElement ----
  const fileToImage = (file) =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = reject;
      img.src = url;
    });

  // ---- Handle adding photos ----
  const addPhotos = async (fileList) => {
    setError(null);
    const files = Array.from(fileList || []);
    for (const file of files) {
      try {
        const { img, url } = await fileToImage(file);
        setSlides((prev) => [
          ...prev,
          { id: Date.now() + Math.random(), img, url, caption: "" },
        ]);
      } catch {
        // skip unreadable file
      }
    }
  };

  const removeSlide = (id) =>
    setSlides((prev) => prev.filter((s) => s.id !== id));

  const moveSlide = (id, dir) =>
    setSlides((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const setCaption = (id, caption) =>
    setSlides((prev) => prev.map((s) => (s.id === id ? { ...s, caption } : s)));

  // ---- Draw a single frame onto the canvas ----
  // i = slide index, t = progress within this slide (0..1)
  const drawFrame = useCallback(
    (ctx, slide, t, isFirst, isLast) => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);

      const img = slide.img;
      // Cover-fit the image into the 9:16 frame
      const scale = Math.max(W / img.width, H / img.height);
      // Gentle Ken Burns zoom: 1.0 -> 1.08 across the slide
      const zoom = 1 + 0.08 * t;
      const dw = img.width * scale * zoom;
      const dh = img.height * scale * zoom;
      const dx = (W - dw) / 2;
      const dy = (H - dh) / 2;
      ctx.globalAlpha = 1;
      ctx.drawImage(img, dx, dy, dw, dh);

      // Fade in/out at the very start and end of the whole video
      let fade = 1;
      if (isFirst && t < 0.15) fade = t / 0.15;
      if (isLast && t > 0.85) fade = (1 - t) / 0.15;
      if (fade < 1) {
        ctx.globalAlpha = 1 - fade;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }

      // Bottom gradient for text legibility
      const grad = ctx.createLinearGradient(0, H * 0.6, 0, H);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.65)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, H * 0.6, W, H * 0.4);

      // Title at top (first slide emphasis, but show on all)
      if (title) {
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.font = "700 64px Arial";
        ctx.textAlign = "center";
        ctx.direction = "rtl";
        wrapText(ctx, title, W / 2, 180, W - 160, 78);
      }

      // Per-slide caption near bottom
      if (slide.caption) {
        ctx.fillStyle = "#fff";
        ctx.font = "600 56px Arial";
        ctx.textAlign = "center";
        ctx.direction = "rtl";
        wrapText(ctx, slide.caption, W / 2, H - 360, W - 160, 70);
      }

      // Business name watermark
      ctx.fillStyle = pc;
      ctx.font = "700 44px Arial";
      ctx.textAlign = "center";
      ctx.fillText(businessName, W / 2, H - 120);
    },
    [title, pc, businessName]
  );

  // ---- Build the MP4 ----
  const buildVideo = async () => {
    if (slides.length === 0) {
      setError("הוסיפי לפחות תמונה אחת");
      return;
    }
    setBuilding(true);
    setError(null);
    setVideoUrl(null);
    setProgress(0);
    setStatusText("טוען את מנוע הווידאו... (פעם ראשונה לוקח קצת)");

    try {
      // Lazy-load ffmpeg.wasm from CDN
      if (!ffmpegRef.current) {
        const { FFmpeg } = await import(
          "https://esm.sh/@ffmpeg/ffmpeg@0.12.10"
        );
        const { toBlobURL } = await import("https://esm.sh/@ffmpeg/util@0.12.1");
        const ffmpeg = new FFmpeg();
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
        await ffmpeg.load({
          coreURL: await toBlobURL(
            `${baseURL}/ffmpeg-core.js`,
            "text/javascript"
          ),
          wasmURL: await toBlobURL(
            `${baseURL}/ffmpeg-core.wasm`,
            "application/wasm"
          ),
        });
        ffmpegRef.current = ffmpeg;
      }
      const ffmpeg = ffmpegRef.current;

      // Prepare canvas
      const canvas = canvasRef.current;
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");

      // Render every frame to a JPEG and write into ffmpeg's filesystem
      const framesPerSlide = Math.round(secondsPer * FPS);
      const totalFrames = framesPerSlide * slides.length;
      let frameNo = 0;

      setStatusText("מצייר פריימים...");
      for (let s = 0; s < slides.length; s++) {
        const slide = slides[s];
        for (let f = 0; f < framesPerSlide; f++) {
          const t = f / framesPerSlide;
          drawFrame(ctx, slide, t, s === 0, s === slides.length - 1);
          const blob = await new Promise((res) =>
            canvas.toBlob(res, "image/jpeg", 0.9)
          );
          const buf = new Uint8Array(await blob.arrayBuffer());
          const name = `frame${String(frameNo).padStart(5, "0")}.jpg`;
          await ffmpeg.writeFile(name, buf);
          frameNo++;
          setProgress(Math.round((frameNo / totalFrames) * 70));
          // Yield to the UI thread occasionally
          if (frameNo % 5 === 0) await new Promise((r) => setTimeout(r, 0));
        }
      }

      // If music was uploaded, write it too
      let hasAudio = false;
      if (music && music.file) {
        const mbuf = new Uint8Array(await music.file.arrayBuffer());
        await ffmpeg.writeFile("music.mp3", mbuf);
        hasAudio = true;
      }

      setStatusText("מקודד וידאו MP4...");
      setProgress(80);

      const args = [
        "-framerate", String(FPS),
        "-i", "frame%05d.jpg",
      ];
      if (hasAudio) args.push("-i", "music.mp3", "-shortest");
      args.push(
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "ultrafast",
        "-movflags", "+faststart",
        "output.mp4"
      );

      await ffmpeg.exec(args);

      setProgress(95);
      setStatusText("כמעט מוכן...");
      const data = await ffmpeg.readFile("output.mp4");
      const blob = new Blob([data.buffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      setProgress(100);
      setStatusText("");

      // Clean up frames from ffmpeg fs to free memory
      for (let i = 0; i < totalFrames; i++) {
        try {
          await ffmpeg.deleteFile(`frame${String(i).padStart(5, "0")}.jpg`);
        } catch {}
      }
    } catch (err) {
      console.error("[ReelStudio] build error:", err);
      setError("שגיאה ביצירת הווידאו: " + (err?.message || "לא ידוע"));
      setStatusText("");
    } finally {
      setBuilding(false);
    }
  };

  const downloadVideo = () => {
    if (!videoUrl) return;
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `reel-${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const pcGrad = `linear-gradient(90deg, ${pc}, ${lighten(pc, 0.2)})`;
  const pcTint = lighten(pc, 0.86);

  return (
    <div dir="rtl" style={{ fontFamily: "'Heebo', sans-serif", maxWidth: 640, margin: "0 auto" }}>
      <canvas ref={canvasRef} style={{ display: "none" }} />

      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: "#2A2A2A", marginBottom: 4 }}>
          🎬 סטודיו רילסים
        </h2>
        <p style={{ fontSize: 12.5, color: "#8A8088" }}>
          העלי תמונות וקבלי סרטון MP4 מוכן לאינסטגרם
        </p>
      </div>

      {/* TITLE + TIMING */}
      <div style={{ background: "#fff", borderRadius: 16, padding: "16px 18px", border: "1px solid #EFE7EB", marginBottom: 14 }}>
        <p style={{ fontSize: 10, color: "#8A8088", fontWeight: 600, marginBottom: 5 }}>כותרת לסרטון (לא חובה)</p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="לדוגמה: תוצאות טיפול פנים ✨"
          style={{ width: "100%", border: "1px solid #EFE7EB", borderRadius: 12, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", direction: "rtl", background: pcTint, boxSizing: "border-box", marginBottom: 12 }}
        />
        <p style={{ fontSize: 10, color: "#8A8088", fontWeight: 600, marginBottom: 5 }}>
          זמן לכל תמונה: {secondsPer} שניות
        </p>
        <input
          type="range" min="1" max="5" step="0.5"
          value={secondsPer}
          onChange={(e) => setSecondsPer(Number(e.target.value))}
          style={{ width: "100%", accentColor: pc }}
        />
      </div>

      {/* PHOTOS */}
      <div style={{ background: "#fff", borderRadius: 16, padding: "16px 18px", border: "1px solid #EFE7EB", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#2A2A2A" }}>תמונות ({slides.length})</p>
          <label style={{ background: pcGrad, color: "#fff", borderRadius: 20, padding: "7px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
            + הוספת תמונות
            <input type="file" accept="image/*" multiple style={{ display: "none" }}
              onChange={(e) => addPhotos(e.target.files)} />
          </label>
        </div>

        {slides.length === 0 ? (
          <p style={{ fontSize: 11, color: "#C9B8C2", textAlign: "center", padding: "20px 0" }}>
            עוד לא הוספת תמונות. לחצי "הוספת תמונות" כדי להתחיל.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {slides.map((s, i) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, background: pcTint, borderRadius: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: pc, width: 20 }}>{i + 1}</span>
                <img alt="" src={s.url} style={{ width: 44, height: 60, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
                <input
                  value={s.caption}
                  onChange={(e) => setCaption(s.id, e.target.value)}
                  placeholder="כיתוב (לא חובה)"
                  style={{ flex: 1, minWidth: 0, border: "1px solid #EFE7EB", borderRadius: 8, padding: "6px 9px", fontSize: 11, fontFamily: "inherit", outline: "none", direction: "rtl", background: "#fff" }}
                />
                <button onClick={() => moveSlide(s.id, -1)} disabled={i === 0} style={{ background: "#fff", border: "1px solid #EFE7EB", borderRadius: 6, width: 24, height: 24, cursor: "pointer", color: pc, opacity: i === 0 ? 0.4 : 1 }}>↑</button>
                <button onClick={() => moveSlide(s.id, 1)} disabled={i === slides.length - 1} style={{ background: "#fff", border: "1px solid #EFE7EB", borderRadius: 6, width: 24, height: 24, cursor: "pointer", color: pc, opacity: i === slides.length - 1 ? 0.4 : 1 }}>↓</button>
                <button onClick={() => removeSlide(s.id)} style={{ background: "none", border: "none", color: "#F44336", fontSize: 15, cursor: "pointer" }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MUSIC (optional) */}
      <div style={{ background: "#fff", borderRadius: 16, padding: "16px 18px", border: "1px solid #EFE7EB", marginBottom: 14 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#2A2A2A", marginBottom: 8 }}>מוזיקה (לא חובה)</p>
        <label style={{ display: "block", padding: "10px 0", textAlign: "center", borderRadius: 10, border: "1px dashed #EFE7EB", fontSize: 11.5, color: pc, cursor: "pointer", fontWeight: 600 }}>
          {music ? "✓ " + music.file.name : "+ העלאת קובץ מוזיקה (MP3)"}
          <input type="file" accept="audio/*" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) setMusic({ file: f, url: URL.createObjectURL(f) }); }} />
        </label>
        <p style={{ fontSize: 9, color: "#C9B8C2", marginTop: 6, textAlign: "center" }}>
          השתמשי במוזיקה חופשית לשימוש (כדי שאינסטגרם לא יחסום)
        </p>
      </div>

      {/* BUILD */}
      <button onClick={buildVideo} disabled={building || slides.length === 0}
        style={{ width: "100%", padding: "14px 0", background: pcGrad, color: "#fff", border: "none", borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: building ? "default" : "pointer", fontFamily: "inherit", opacity: building || slides.length === 0 ? 0.6 : 1, marginBottom: 12 }}>
        {building ? "יוצרת סרטון... 🎬" : "🎬 צרי סרטון MP4"}
      </button>

      {building && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ background: "#F0E7EC", borderRadius: 8, height: 10, overflow: "hidden", marginBottom: 6 }}>
            <div style={{ background: pcGrad, height: 10, width: `${progress}%`, transition: "width 0.2s" }} />
          </div>
          <p style={{ fontSize: 11, color: pc, textAlign: "center", fontWeight: 500 }}>{statusText} {progress}%</p>
        </div>
      )}

      {error && (
        <div style={{ background: "#FFFAF7", border: "1px solid #FFDAC1", borderRadius: 12, padding: "12px 16px", marginBottom: 14 }}>
          <p style={{ fontSize: 11.5, color: pc, fontWeight: 600 }}>{error}</p>
        </div>
      )}

      {videoUrl && (
        <div style={{ background: "#fff", borderRadius: 16, padding: "16px 18px", border: "1px solid #EFE7EB", textAlign: "center" }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#2A2A2A", marginBottom: 12 }}>✨ הסרטון מוכן!</p>
          <video src={videoUrl} controls style={{ width: "100%", maxWidth: 270, borderRadius: 14, marginBottom: 12, background: "#000" }} />
          <button onClick={downloadVideo}
            style={{ width: "100%", padding: "13px 0", background: pcGrad, color: "#fff", border: "none", borderRadius: 14, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            ⬇ הורדת הסרטון (MP4)
          </button>
          <p style={{ fontSize: 9.5, color: "#C9B8C2", marginTop: 8 }}>
            הורידי את הקובץ והעלי אותו ישירות לאינסטגרם / וואטסאפ סטטוס
          </p>
        </div>
      )}
    </div>
  );
}

// ---- Helper: lighten a hex color toward white by amount (0..1) ----
function lighten(hex, amt) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  const c = m
    ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
    : { r: 199, g: 123, b: 146 };
  const f = (v) => Math.round(v + (255 - v) * amt);
  return `#${[f(c.r), f(c.g), f(c.b)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

// ---- Helper: draw wrapped, centered RTL text ----
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(" ");
  let line = "";
  const lines = [];
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  lines.forEach((ln, i) => {
    // Outline for readability
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.strokeText(ln, x, y + i * lineHeight);
    ctx.fillText(ln, x, y + i * lineHeight);
  });
}
