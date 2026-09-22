'use client';

// app/design/CesdkEditor.jsx
//
// The advanced editor's UI: a canvas mounted through the renderer interface
// and a small toolbar of ours (size, colour role, hide, reset) - RTL and
// touch-sized. It never imports the vendor; it asks renderers/index.js for
// whatever editor renderer this build has and talks to it only through
// lib/design/renderer.ts. What comes back is overrides + values in template
// terms, which the fill form saves like any other edit.

import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../Icon';
import Spinner from '../Spinner';
import { buildSceneSpec } from '@/lib/design/sceneSpec';
import { sanitizeOverrides } from '@/lib/design/design';
import { COLOR_ROLES } from '@/lib/design/contract';
import { createEditorRenderer, FONT_FILES } from './renderers';

const ROLE_LABELS = { primary: 'מותג', deep: 'כהה', tint: 'בהיר', contrast: 'ניגוד', secondary: 'משני', ink: 'טקסט', surface: 'לבן', muted: 'אפור' };

function mergeOverrides(base, edit) {
  const layers = { ...(base.layers || {}) };
  for (const [id, o] of Object.entries(edit.layers || {})) layers[id] = { ...(layers[id] || {}), ...o };
  return sanitizeOverrides({ ...base, layers });
}

export default function CesdkEditor({ template, fill, overrides, values, onChange, onExport, onClose }) {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [local, setLocal] = useState({ overrides: overrides || {}, values: values || {} });
  const [exporting, setExporting] = useState(false);

  const spec = useMemo(() => buildSceneSpec(template, { ...fill, values: { ...fill.values, ...local.values } }, local.overrides, FONT_FILES), [template, fill, local]);
  const initialSpec = useRef(spec);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await createEditorRenderer();
        if (!r || !r.available()) throw new Error('העורך המתקדם לא זמין בדפדפן הזה');
        if (!alive) { r.dispose(); return; }
        rendererRef.current = r;
        await r.mount({
          container: containerRef.current, spec: initialSpec.current, editable: true,
          onSelect: (id) => { if (alive) setSelected(id); },
          onEdit: (res) => {
            if (!alive) return;
            setLocal((prev) => {
              const next = { overrides: mergeOverrides(prev.overrides, res.overrides), values: { ...prev.values, ...res.values } };
              onChange?.(next);
              return next;
            });
          },
        });
        if (alive) setState('ready');
      } catch (e) { if (alive) { setError(String(e?.message || e)); setState('error'); } }
    })();
    return () => { alive = false; rendererRef.current?.dispose(); rendererRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once per editor session
  }, []);

  const selectedBlock = spec.blocks.find((b) => b.id === selected) || null;
  const layerOverride = (selectedBlock && local.overrides.layers?.[selectedBlock.id]) || {};

  const setLayer = (patch) => {
    if (!selectedBlock) return;
    setLocal((prev) => {
      const next = { ...prev, overrides: mergeOverrides(prev.overrides, { layers: { [selectedBlock.id]: patch } }) };
      onChange?.(next);
      return next;
    });
  };

  const bumpSize = (delta) => {
    if (!selectedBlock || selectedBlock.kind !== 'text') return;
    const size = Math.max(12, Math.min(300, Math.round((layerOverride.size || selectedBlock.sizePx) * (1 + delta))));
    setLayer({ size });
    rendererRef.current?.apply(selectedBlock.id, { sizePx: size });
  };

  const setColor = (role) => {
    if (!selectedBlock || selectedBlock.kind !== 'text') return;
    setLayer({ color: role });
    rendererRef.current?.apply(selectedBlock.id, { color: fill.colors[role] });
  };

  const hide = async () => {
    if (!selectedBlock) return;
    setLayer({ hidden: true });
    setSelected(null);
    // A hidden layer is not in the spec any more: rebuild the canvas.
    await rendererRef.current?.update(buildSceneSpec(template, { ...fill, values: { ...fill.values, ...local.values } }, mergeOverrides(local.overrides, { layers: { [selectedBlock.id]: { hidden: true } } }), FONT_FILES));
  };

  const reset = async () => {
    const next = { overrides: {}, values: {} };
    setLocal(next); onChange?.(next); setSelected(null);
    await rendererRef.current?.update(buildSceneSpec(template, fill, {}, FONT_FILES));
  };

  const exportNow = async () => {
    setExporting(true);
    try { const blob = await rendererRef.current?.exportImage('image/png'); if (blob) onExport?.(blob); } catch (e) { setError(String(e?.message || e)); } finally { setExporting(false); }
  };

  const btn = { padding: '9px 12px', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 'var(--t-sm)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 };

  return (
    <div>
      <div ref={containerRef} style={{ width: '100%', aspectRatio: `${spec.width} / ${spec.height}`, background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', overflow: 'hidden', border: '1px solid var(--line)', touchAction: 'none' }}>
        {state === 'loading' && <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner label="טוענת את העורך" /></div>}
      </div>
      {state === 'error' && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', marginTop: 8 }}>{error}</p>}
      {state === 'ready' && (
        <div style={{ marginTop: 10 }}>
          <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginBottom: 8 }}>
            {selectedBlock ? (selectedBlock.kind === 'text' ? 'טקסט נבחר: גררי להזזה, משכי בפינה לשינוי גודל, הקשה כפולה לעריכה.' : 'תמונה נבחרה: גררי להזזה או לשינוי גודל.') : 'הקישי על אלמנט כדי לערוך אותו.'}
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {selectedBlock?.kind === 'text' && (
              <>
                <button style={btn} onClick={() => bumpSize(-0.1)} aria-label="הקטנת טקסט">א−</button>
                <button style={btn} onClick={() => bumpSize(0.1)} aria-label="הגדלת טקסט">א+</button>
                {COLOR_ROLES.map((role) => (
                  <button key={role} onClick={() => setColor(role)} title={ROLE_LABELS[role]} aria-label={ROLE_LABELS[role]} style={{ ...btn, width: 44, padding: 0, background: fill.colors[role], borderColor: layerOverride.color === role ? 'var(--ink)' : 'var(--line-2)' }} />
                ))}
              </>
            )}
            {selectedBlock && <button style={btn} onClick={hide}><Icon name="x" size={13} /> הסתרה</button>}
            <button style={btn} onClick={reset}><Icon name="refresh" size={13} /> איפוס לתבנית</button>
            <button style={{ ...btn, background: 'var(--surface)', color: 'var(--pc-deep)' }} onClick={exportNow} disabled={exporting}>{exporting ? <Spinner inline label="מייצאת" /> : <><Icon name="download" size={13} /> ייצוא מהעורך</>}</button>
            <button style={{ ...btn, background: 'var(--pc-grad)', color: 'var(--pc-contrast)', border: 'none' }} onClick={onClose}><Icon name="check" size={13} /> סיימתי</button>
          </div>
        </div>
      )}
    </div>
  );
}
