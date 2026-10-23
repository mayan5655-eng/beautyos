'use client';
// TEMPORARY verification harness - never committed. Renders the same reel with the old recorder and the new encoder.
import { useMemo } from 'react';
import ReelRender from '../design/ReelRender';
import ReelRenderBefore from '../design/ReelRenderBefore';
import { stepByStep } from '@/lib/design/reels/launch';
import { fillReel } from '@/lib/design/reel';

const settings = { business_name: 'הסטודיו של נועה', therapist_name: 'נועה', business_phone: '050-1234567', primary_color: '#1F3A30' };

function useFill(img) {
  return useMemo(() => {
    const images = {};
    for (const sl of stepByStep.slots) images[sl.key] = img;
    const inputs = {};
    for (const v of stepByStep.variables) if (v.key.startsWith('s4_') && v.key.endsWith('subline')) inputs[v.key] = 'רק 249 ₪ החודש';
    return fillReel(stepByStep, { settings, inputs, images });
  }, [img]);
}

export default function Page() {
  const before = useFill('/__verify/before-1024x1536-high.png');
  const after = useFill('/__verify/after-1088x1920-high.png');
  if (typeof window !== 'undefined') window.__videos = window.__videos || {};
  const keep = (k) => async (blob, ext) => { window.__videos[k] = { blob, ext, type: blob.type }; };
  return (
    <div style={{ padding: 20, display: 'grid', gap: 20 }}>
      <div id="before"><h3>before</h3><ReelRenderBefore reel={stepByStep} fills={before.scenes} name="before" onVideo={keep('before')} /></div>
      <div id="after"><h3>after</h3><ReelRender reel={stepByStep} fills={after.scenes} name="after" onVideo={keep('after')} /></div>
    </div>
  );
}
