'use client';

// app/design/ImagePicker.jsx
//
// One picker for every picture slot. The slot says which sources it allows
// (contract SlotDef.sources); this shows those and nothing else: her gallery,
// clinic photos, portrait, hero, an upload from the device, pictures used in
// her other designs, and, for before/after slots, her client photos, which
// are refused until she ticks that the client agreed to publication.
// AI images arrive as one more source in stage 4.

import { useEffect, useMemo, useState } from 'react';
import Sheet from '../Sheet';
import Spinner from '../Spinner';
import { listClientPhotos, uploadDesignImage, useResolvedImages } from './images';

const SOURCE_LABELS = { gallery: 'הגלריה', clinic: 'הקליניקה', portrait: 'תמונה שלי', hero: 'תמונת נושא', upload: 'מהמכשיר', before: 'לפני (לקוחה)', after: 'אחרי (לקוחה)', ai: 'AI', previous: 'מעיצובים קודמים' };

function Thumb({ src, selected, onClick, label }) {
  return (
    <button onClick={onClick} aria-pressed={selected} className="tap44" style={{ position: 'relative', width: 84, height: 105, padding: 0, border: selected ? '3px solid var(--pc)' : '1px solid var(--line)', borderRadius: 'var(--r-xs)', overflow: 'hidden', background: 'var(--surface-2)', cursor: 'pointer' }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- picker thumbnails of her own files
        <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : <Spinner inline />}
      {label && <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, fontSize: 'var(--t-xs)', background: 'rgba(43,34,51,0.6)', color: '#fff', padding: '2px 4px', textAlign: 'center' }}>{label}</span>}
    </button>
  );
}

// Mounted per slot by the editor (key=slot.key), so the initial state below
// is always for the slot being picked.
export default function ImagePicker({ open, onClose, slot, current, branding, tenantId, previous = [], consent, onPick }) {
  const sources = useMemo(() => (slot?.sources || []).filter((s) => s !== 'ai'), [slot]);
  const [tab, setTab] = useState(sources[0] || null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [clientPhotos, setClientPhotos] = useState(null);
  const [agreed, setAgreed] = useState(!!consent);

  const wantsClientPhotos = sources.includes('before') || sources.includes('after');
  useEffect(() => {
    if (!open || !wantsClientPhotos) return;
    let alive = true;
    listClientPhotos().then((rows) => { if (alive) setClientPhotos(rows); });
    return () => { alive = false; };
  }, [open, wantsClientPhotos]);

  const b = branding || {};
  const own = {
    gallery: Array.isArray(b.gallery) ? b.gallery.filter(Boolean) : [],
    clinic: Array.isArray(b.clinic_photos) ? b.clinic_photos.filter(Boolean) : [],
    portrait: b.portrait_url ? [b.portrait_url] : [],
    hero: b.hero_image_url ? [b.hero_image_url] : [],
    previous: previous.filter(Boolean),
  };
  const clientRefs = (clientPhotos || []).flatMap((p) => [p.before, p.after]).filter(Boolean);
  const resolved = useResolvedImages(Object.fromEntries(clientRefs.map((r) => [r, r])));

  const pick = (ref) => { onPick(ref, agreed); onClose(); };

  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setUploading(true); setError('');
    try { pick(await uploadDesignImage(f, tenantId)); } catch (err) { setError(String(err?.message || err)); } finally { setUploading(false); }
  };

  if (!slot) return null;
  const isClient = tab === 'before' || tab === 'after';
  return (
    <Sheet open={open} onClose={onClose} width={520} zIndex={1300} title={`תמונה: ${slot.label}`}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {sources.map((s) => (
          <button key={s} onClick={() => setTab(s)} style={{ padding: '7px 12px', borderRadius: 'var(--r-full)', border: '1px solid var(--line-2)', background: tab === s ? 'var(--pc)' : 'var(--surface)', color: tab === s ? 'var(--pc-contrast)' : 'var(--ink-2)', fontSize: 'var(--t-sm)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{SOURCE_LABELS[s] || s}</button>
        ))}
      </div>

      {tab === 'upload' && (
        <label style={{ display: 'block', border: '1.5px dashed var(--line-2)', borderRadius: 'var(--r-sm)', padding: 18, textAlign: 'center', cursor: 'pointer', fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--pc-deep)' }}>
          {uploading ? <Spinner inline label="מעלה" /> : 'בחרי תמונה מהמכשיר'}
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} disabled={uploading} />
        </label>
      )}

      {tab && !isClient && tab !== 'upload' && (
        own[tab]?.length ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {own[tab].map((url) => <Thumb key={url} src={url} selected={current === url} onClick={() => pick(url)} />)}
          </div>
        ) : <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)' }}>אין עדיין תמונות במקור הזה. אפשר להעלות בהגדרות, או מהמכשיר כאן.</p>
      )}

      {isClient && (
        <>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 'var(--t-sm)', color: 'var(--ink)', marginBottom: 12, lineHeight: 1.5 }}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 3 }} />
            <span>הלקוחה אישרה לי במפורש לפרסם את התמונה הזו ברשתות. בלי אישור, התמונה לא נבחרת.</span>
          </label>
          {clientPhotos === null ? <Spinner inline label="טוענת תמונות לקוחות" /> : clientPhotos.length === 0 ? (
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)' }}>אין תמונות לפני/אחרי בכרטיסי הלקוחות.</p>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', opacity: agreed ? 1 : 0.45, pointerEvents: agreed ? 'auto' : 'none' }}>
              {clientPhotos.map((p) => {
                const ref = tab === 'before' ? p.before : p.after;
                if (!ref) return null;
                return <Thumb key={p.id + tab} src={resolved[ref]} selected={current === ref} onClick={() => pick(ref)} label={p.treatment} />;
              })}
            </div>
          )}
        </>
      )}

      {error && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', marginTop: 10 }}>{error}</p>}
      {current && (
        <button onClick={() => { onPick(null, false); onClose(); }} style={{ marginTop: 14, background: 'none', border: 'none', color: 'var(--danger)', fontSize: 'var(--t-sm)', cursor: 'pointer', fontFamily: 'inherit' }}>הסרת התמונה מהעיצוב</button>
      )}
    </Sheet>
  );
}
