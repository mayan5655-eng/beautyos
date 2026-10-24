'use client';

// app/design/SaveShare.jsx
//
// The "your post is ready" panel every export ends in. A blob download after an async render is what used to be
// the only way out, and on a phone it fails (see lib/design/sharePost.js for where and why). Here she gets, in order:
//   1. the phone's own share sheet with the file in it (Instagram, WhatsApp, Facebook, "Save Image" to Photos),
//      opened from HER tap on this panel - not from the render's promise, which iOS no longer counts as a tap;
//   2. the picture itself, as a data: image, to long-press and save when the browser cannot share files;
//   3. the plain download, for a computer.
// The post text is copied on the same tap, because Instagram drops any text a share sheet hands it.

import { useEffect, useMemo, useState } from 'react';
import Icon from '../Icon';
import Sheet from '../Sheet';
import { downloadBlob } from './exportPng';
import { canShareFile, inAppBrowser, isIos, isTouchDevice, plainMime, shareFileName, shareOutcome } from '@/lib/design/sharePost';

const APP_HE = { instagram: 'אינסטגרם', facebook: 'פייסבוק', whatsapp: 'וואטסאפ', tiktok: 'טיקטוק', line: 'LINE' };
const btn = { padding: '12px 16px', fontSize: 'var(--t-sm)', width: '100%', justifyContent: 'center', minHeight: 46 };

export default function SaveShare({ open, onClose, blob, kind = 'image', ext = 'png', downloadName, caption = '', toast }) {
  const env = useMemo(() => {
    if (typeof navigator === 'undefined') return { ua: '', touch: 0 };
    return { ua: navigator.userAgent || '', touch: navigator.maxTouchPoints || 0 };
  }, []);
  const file = useMemo(() => {
    if (!blob) return null;
    try { return new File([blob], shareFileName(kind, ext), { type: plainMime(blob.type, kind === 'video' ? 'video/mp4' : 'image/png') }); } catch { return null; }
  }, [blob, kind, ext]);
  const shareable = typeof navigator !== 'undefined' && canShareFile(navigator, file);
  const app = inAppBrowser(env.ua);
  const ios = isIos(env.ua, env.touch);
  const phone = isTouchDevice(env.ua, env.touch);

  // The picture as a data: URL - an <img> with it can be long-pressed and saved in every phone browser, the in-app
  // ones included, where a blob: URL sometimes cannot. A video plays from a blob: URL (a data: video is too big).
  const [src, setSrc] = useState('');
  useEffect(() => {
    if (!open || !blob) { setSrc(''); return undefined; }
    if (kind === 'video') { const u = URL.createObjectURL(blob); setSrc(u); return () => URL.revokeObjectURL(u); }
    let alive = true;
    const r = new FileReader();
    r.onload = () => { if (alive) setSrc(String(r.result || '')); };
    r.readAsDataURL(blob);
    return () => { alive = false; };
  }, [open, blob, kind]);

  const [note, setNote] = useState('');
  useEffect(() => { if (!open) setNote(''); }, [open]);

  const copyCaption = () => {
    if (!caption || !navigator.clipboard?.writeText) return false;
    navigator.clipboard.writeText(caption).catch(() => {});
    return true;
  };

  const share = () => {
    if (!file) return;
    // Both calls start inside this tap; navigator.share must not wait on anything before it.
    const copied = copyCaption();
    navigator.share({ files: [file] }).then(() => {
      setNote('');
      toast?.(copied ? 'נשלח. הטקסט של הפוסט מועתק, הדביקי אותו בכיתוב' : 'נשלח');
    }).catch((e) => {
      const o = shareOutcome(e);
      if (o === 'cancelled') return;
      if (o === 'gesture') { setNote('הטלפון ביקש לחיצה נוספת. לחצי שוב על "שיתוף ושמירה".'); return; }
      setNote(kind === 'video' ? 'השיתוף לא הצליח. אפשר להוריד את הסרטון בכפתור למטה.' : 'השיתוף לא הצליח. לחיצה ארוכה על התמונה ← "שמירה בתמונות", ומשם לאינסטגרם.');
    });
  };

  const download = () => {
    if (!blob) return;
    if (copyCaption()) toast?.('הטקסט של הפוסט הועתק');
    downloadBlob(blob, downloadName || shareFileName(kind, ext));
  };

  const copyLink = () => {
    const url = typeof window !== 'undefined' ? window.location.origin : 'https://kalmea.app';
    navigator.clipboard?.writeText(url).then(() => toast?.('הקישור הועתק. הדביקי אותו בספארי או בכרום'), () => toast?.('פתחי את kalmea.app בספארי או בכרום', 'error'));
  };

  const longPress = ios ? 'לחיצה ארוכה על התמונה ← "הוספה לתמונות"' : 'לחיצה ארוכה על התמונה ← "הורדת תמונה"';

  return (
    <Sheet open={open} onClose={onClose} zIndex={1300} width={420} ariaLabel="save-share"
      title={kind === 'video' ? 'הרילס מוכן' : 'הפוסט מוכן'}
      subtitle={shareable ? 'שמרי לגלריה או שתפי ישר לאינסטגרם, לוואטסאפ או לפייסבוק.' : 'כך שומרים אותו בטלפון ומעלים לרשתות.'}>
      <div style={{ display: 'grid', gap: 12 }}>
        {app && (
          <div role="note" style={{ background: 'var(--pc-tint)', border: '1px solid var(--pc)', borderRadius: 'var(--r-sm)', padding: '10px 12px', fontSize: 'var(--t-sm)', lineHeight: 1.6, color: 'var(--ink)' }}>
            פתחת את Kalmea מתוך {APP_HE[app]}. הדפדפן הפנימי שלו חוסם הורדות ושיתוף קבצים. {kind === 'video' ? '' : `אפשר לנסות ${longPress}, או `}לפתוח את kalmea.app בספארי או בכרום ולייצא שם.
            <button type="button" onClick={copyLink} className="primary-btn" style={{ marginTop: 8, padding: '8px 12px', background: 'var(--surface)', color: 'var(--pc-deep)', border: '1px solid var(--line-2)', fontSize: 'var(--t-xs)' }}><Icon name="copy" size={12} /> העתקת הקישור לאפליקציה</button>
          </div>
        )}

        {src && (kind === 'video'
          ? <video src={src} controls playsInline style={{ width: '100%', maxWidth: 260, maxHeight: '46vh', margin: '0 auto', borderRadius: 'var(--r-sm)', display: 'block', background: '#000' }} />
          : <img src={src} alt="הפוסט שלך" data-testid="save-share-image"
              style={{ width: '100%', maxWidth: 320, maxHeight: '46vh', objectFit: 'contain', margin: '0 auto', display: 'block', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)', WebkitTouchCallout: 'default', userSelect: 'auto' }} />)}

        {shareable && (
          <button type="button" onClick={share} className="primary-btn" data-testid="save-share-share" style={{ ...btn, background: 'var(--pc-grad)', color: 'var(--pc-contrast)' }}>
            <Icon name="share" size={15} /> שיתוף ושמירה לגלריה
          </button>
        )}

        {note && <p role="alert" style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', margin: 0, lineHeight: 1.6 }}>{note}</p>}

        <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', lineHeight: 1.7, margin: 0 }}>
          {shareable
            ? <>בחלון שנפתח: {ios ? '"שמירת תמונה"' : '"שמירה"'} שומרת {kind === 'video' ? 'את הסרטון' : 'את התמונה'} בגלריה, או בחרי ישר אינסטגרם / וואטסאפ / פייסבוק.{caption ? ' הטקסט של הפוסט מועתק באותה לחיצה, הדביקי אותו בכיתוב.' : ''}</>
            : kind === 'video'
              ? (ios ? 'הורידי את הסרטון, ואז באפליקציית "קבצים" ← "הורדות" לחצי עליו ← שיתוף ← "שמירת וידאו".' : 'הורידי את הסרטון, והוא יופיע בגלריה או בתיקיית ההורדות.')
              : phone ? <>{longPress}. אחרי זה היא בגלריה, ומשם מעלים לאינסטגרם כרגיל.</> : 'הורידי את התמונה למחשב והעלי אותה לאינסטגרם או לפייסבוק.'}
        </p>

        <button type="button" onClick={download} className="primary-btn" data-testid="save-share-download" style={{ ...btn, background: 'var(--surface)', color: 'var(--pc-deep)', border: '1px solid var(--line-2)' }}>
          <Icon name="download" size={14} /> {phone ? 'הורדה כקובץ' : 'הורדה'}{kind === 'video' ? ` (${ext})` : ''}
        </button>
      </div>
    </Sheet>
  );
}
