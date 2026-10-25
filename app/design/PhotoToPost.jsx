'use client';

// app/design/PhotoToPost.jsx
//
// "צילום אחרי טיפול": one photo in, a finished 4:5 post and a 9:16 story out, in HER brand, with a ready caption, and
// the studio's own save/share panel for each (SaveShare). Everything here is the short path; the drawing is
// canvasRender, the colours / logo / name are fillTemplate over her settings, the caption is defaultCaption (free,
// no AI), the share is SaveShare. The decisions (which template, may the photo be used) are lib/design/photoPost.js.
//
// The photo never leaves her phone: it is shrunk (resizeImage), drawn from a local blob URL, and dropped when she
// closes this. Nothing is uploaded, so a client's picture is not in any bucket and nothing needs cleaning up.
//
// Consent: the photo is used only after she ticks that the client agreed to have it posted (or that it is not a
// client at all), unticked by default - the same explicit yes the image picker asks for client photos.
//
// The file input is a plain <input type=file accept="image/*"> with no `capture`: on a phone that offers "take a
// photo" and "photo library" both (a forced `capture` took the camera only - the skin-scan fix of 2026-10-24).

import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../Icon';
import Sheet from '../Sheet';
import Spinner from '../Spinner';
import SaveShare from './SaveShare';
import { renderTemplateBlob } from './canvasRender';
import { resizeImage, IMAGE_PRESETS, COULD_NOT_SHRINK_HE } from '@/lib/imageResize';
import { getTemplate } from '@/lib/design/templates';
import { fillTemplate } from '@/lib/design/mapBranding';
import { defaultCaption } from '@/lib/design/defaultCaption';
import { accentStyle, DEFAULT_ACCENT } from '@/lib/theme';
import { businessFieldsOf } from '@/lib/businessFields';
import { pickPhotoKeys, startIndex, photoUse, photoFileProblem, photoInputs, photoCaption } from '@/lib/design/photoPost';

const btn = { padding: '12px 16px', fontSize: 'var(--t-sm)', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46 };
const solid = { ...btn, background: 'var(--pc-grad)', color: 'var(--pc-contrast)' };
const quiet = { ...btn, background: 'var(--surface)', color: 'var(--pc-deep)', border: '1px solid var(--line-2)' };

/** The browser can decode this blob? (HEIC on a non-Safari browser cannot: the studio would draw an empty plate.) */
function decodes(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img.naturalWidth > 0); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
    img.src = url;
  });
}

export default function PhotoToPost({ open, onClose, settings, toast, readOnly = false, clientName = '', onReel = null }) {
  const [file, setFile] = useState(null);
  const [thumb, setThumb] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(() => startIndex());
  const [headline, setHeadline] = useState('');
  const [caption, setCaption] = useState(null); // null = the generated one; a string = her edit
  const [out, setOut] = useState(null); // { post: {blob, url}, story: {blob, url}, caption, headlineDefault }
  const [sharing, setSharing] = useState(null); // 'post' | 'story'
  const photoUrl = useRef('');

  const fields = useMemo(() => businessFieldsOf(settings), [settings]);
  const first = clientName ? clientName.trim().split(/\s+/)[0] : '';

  const revokeOut = (o) => { if (o) { URL.revokeObjectURL(o.post.url); URL.revokeObjectURL(o.story.url); } };
  const reset = () => {
    setFile(null); setThumb(''); setAgreed(false); setBusy(false); setError(''); setHeadline(''); setCaption(null); setSharing(null);
    setOut((o) => { revokeOut(o); return null; });
    if (photoUrl.current) { URL.revokeObjectURL(photoUrl.current); photoUrl.current = ''; }
  };
  useEffect(() => { if (!open) reset(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (photoUrl.current) URL.revokeObjectURL(photoUrl.current); }, []);

  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const problem = photoFileProblem(f);
    if (problem) { setError(problem); return; }
    setError(''); setAgreed(false);
    setOut((o) => { revokeOut(o); return null; });
    setFile(f);
    setThumb((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(f); });
  };

  /** Shrink once, then draw the post and the story from the same local picture. */
  const make = async (nextStep = step, nextHeadline = headline) => {
    const use = photoUse({ hasPhoto: !!file, agreed, readOnly });
    if (!use.ok) { setError(use.why); return; }
    setBusy(true); setError('');
    try {
      let src = photoUrl.current;
      if (!src) {
        const blob = await resizeImage(file, { ...IMAGE_PRESETS.gallery, maxWidth: 1600, maxHeight: 1600 });
        if (!(await decodes(blob))) throw new Error(COULD_NOT_SHRINK_HE);
        src = URL.createObjectURL(blob);
        photoUrl.current = src;
      }
      const keys = pickPhotoKeys(fields, nextStep);
      const feed = getTemplate(keys.feed), story = getTemplate(keys.story);
      if (!feed || !story) throw new Error('התבנית לא נמצאה');
      const inputs = photoInputs(nextHeadline, feed);
      const fFeed = fillTemplate(feed, { settings, inputs, images: { photo: src } });
      const fStory = fillTemplate(story, { settings, inputs, images: { photo: src } });
      const [postBlob, storyBlob] = [await renderTemplateBlob(feed, fFeed), await renderTemplateBlob(story, fStory)];
      setOut((o) => {
        revokeOut(o);
        return {
          post: { blob: postBlob, url: URL.createObjectURL(postBlob) },
          story: { blob: storyBlob, url: URL.createObjectURL(storyBlob) },
          generated: photoCaption(defaultCaption, feed, fFeed.values, settings, undefined),
          headlineDefault: feed.variables.find((v) => v.key === 'headline')?.default || '',
          headlineMax: feed.variables.find((v) => v.key === 'headline')?.maxLength || 40,
        };
      });
      setStep(nextStep);
    } catch (e) {
      setError(String(e?.message || 'הכנת הפוסט נכשלה, נסי שוב'));
    } finally { setBusy(false); }
  };

  const text = caption ?? out?.generated ?? '';

  return (
    <div style={accentStyle((settings && settings.primary_color) || DEFAULT_ACCENT)}>
      <Sheet open={open && !sharing} onClose={onClose} zIndex={1200} width={440} ariaLabel="photo-to-post" busy={busy}
        title="צילום אחרי טיפול"
        subtitle="תמונה אחת, ופוסט וסטורי מוכנים בעיצוב שלך.">
        <div style={{ display: 'grid', gap: 12 }} data-testid="photo-to-post">
          {!out && (
            <>
              {thumb ? (
                <img src={thumb} alt="התמונה שנבחרה" data-testid="photo-to-post-thumb" style={{ width: '100%', maxWidth: 240, maxHeight: '34vh', objectFit: 'cover', margin: '0 auto', display: 'block', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)' }} />
              ) : null}
              <label data-testid="photo-to-post-pick" className="primary-btn" style={{ ...(thumb ? quiet : solid), cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                <Icon name="camera" size={16} /> {thumb ? 'תמונה אחרת' : 'צילום או בחירת תמונה'}
                <input type="file" accept="image/*" disabled={busy} onChange={onFile} data-testid="photo-to-post-input" style={{ display: 'none' }} />
              </label>
              {thumb && (
                <>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 'var(--t-sm)', color: 'var(--ink)', lineHeight: 1.6 }}>
                    <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} data-testid="photo-to-post-consent" style={{ marginTop: 4, width: 18, height: 18, flex: 'none' }} />
                    <span>{first ? `${first} אישרה לי` : 'הלקוחה אישרה לי'} במפורש לפרסם את התמונה הזו ברשתות (או שזו לא תמונה של לקוחה). בלי אישור לא מכינים פוסט.</span>
                  </label>
                  <button type="button" onClick={() => make()} disabled={busy || !agreed || readOnly} data-testid="photo-to-post-make" className="primary-btn" style={{ ...solid, opacity: !agreed || busy || readOnly ? 0.5 : 1 }}>
                    {busy ? <Spinner inline label="מכינה פוסט וסטורי" /> : <><Icon name="sparkle" size={15} /> הכיני לי פוסט וסטורי</>}
                  </button>
                </>
              )}
              {!thumb && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', lineHeight: 1.7, margin: 0 }}>הצילום נשאר בטלפון שלך ולא נשמר אצלנו. מקבלות פוסט 4:5 וסטורי 9:16 עם הלוגו, הצבעים והשם של העסק, וטקסט מוכן לכיתוב.</p>}
              {/* Several photos or a clip: the reel path (OwnReel.jsx), with the same consent and the same "stays on the phone". */}
              {!thumb && onReel && (
                <button type="button" onClick={onReel} data-testid="photo-to-post-reel" className="primary-btn" style={quiet}>
                  <Icon name="film" size={15} /> יש לי כמה תמונות או סרטון: רילס
                </button>
              )}
            </>
          )}

          {out && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'start' }}>
                <div>
                  <img src={out.post.url} alt="הפוסט" data-testid="photo-to-post-post" style={{ width: '100%', aspectRatio: '4 / 5', objectFit: 'cover', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)', display: 'block' }} />
                  <button type="button" onClick={() => setSharing('post')} data-testid="photo-to-post-share-post" className="primary-btn" style={{ ...solid, marginTop: 8, padding: '10px 8px' }}><Icon name="share" size={14} /> שיתוף הפוסט</button>
                </div>
                <div>
                  <img src={out.story.url} alt="הסטורי" data-testid="photo-to-post-story" style={{ width: '100%', aspectRatio: '9 / 16', objectFit: 'cover', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)', display: 'block' }} />
                  <button type="button" onClick={() => setSharing('story')} data-testid="photo-to-post-share-story" className="primary-btn" style={{ ...solid, marginTop: 8, padding: '10px 8px' }}><Icon name="share" size={14} /> שיתוף הסטורי</button>
                </div>
              </div>

              <label style={{ display: 'grid', gap: 4, fontSize: 'var(--t-xs)', color: 'var(--ink-2)' }}>
                כותרת על התמונה
                <input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={out.headlineMax} placeholder={out.headlineDefault} data-testid="photo-to-post-headline"
                  style={{ fontSize: 16, padding: '10px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)', fontFamily: 'inherit' }} />
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => make(step, headline)} disabled={busy} data-testid="photo-to-post-apply" className="primary-btn" style={{ ...quiet, opacity: busy ? 0.6 : 1 }}>{busy ? <Spinner inline label="מעדכנת" /> : 'עדכון הכותרת'}</button>
                <button type="button" onClick={() => make(step + 1, headline)} disabled={busy} data-testid="photo-to-post-another" className="primary-btn" style={{ ...quiet, opacity: busy ? 0.6 : 1 }}>עיצוב אחר</button>
              </div>

              <label style={{ display: 'grid', gap: 4, fontSize: 'var(--t-xs)', color: 'var(--ink-2)' }}>
                הטקסט לפוסט (אפשר לערוך)
                <textarea value={text} onChange={(e) => setCaption(e.target.value)} rows={5} data-testid="photo-to-post-caption"
                  style={{ fontSize: 16, padding: '10px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)', fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical' }} />
              </label>
            </>
          )}

          {error && <p role="alert" data-testid="photo-to-post-error" style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', margin: 0, lineHeight: 1.6 }}>{error}</p>}
        </div>
      </Sheet>

      {out && (
        <SaveShare
          open={open && !!sharing}
          onClose={() => setSharing(null)}
          blob={sharing === 'story' ? out.story.blob : out.post.blob}
          caption={sharing === 'story' ? '' : text}
          toast={toast}
        />
      )}
    </div>
  );
}
