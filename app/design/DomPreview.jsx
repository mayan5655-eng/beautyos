'use client';

// app/design/DomPreview.jsx
//
// Our own renderer: a template + her fill drawn with HTML and CSS. It is
// what the gallery previews with, what the fill form shows, and what the
// PNG export captures (exportPng.js). No vendor here. Layers are absolute
// boxes in percentages of the canvas, so one component serves any width:
// pass `width` and everything scales, text included.
//
// Text shrinks to fit its box (AutoFitText), the way a template engine's
// auto-size would, so a long business name does not spill out of a pill.

import { useLayoutEffect, useRef } from 'react';
import { CANVAS } from '@/lib/design/contract';
import { applyOverrides, isPrivateRef } from '@/lib/design/design';
import { useResolvedImages } from './images';

const hexToRgb = (hex) => {
  const h = String(hex || '').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return Number.isNaN(n) ? { r: 0, g: 0, b: 0 } : { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};
const rgba = (hex, a) => { const { r, g, b } = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };
const pct = (n) => `${n}%`;

// Shrinks the text until it fits its box, to half the base size at most.
// Works on the element's style directly: measuring and shrinking is a
// layout concern, not state, and it must finish before paint.
function AutoFitText({ content, basePx, lineHeight, maxLines, align, weight, font, color, pill, pillColor }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let px = basePx;
    el.style.fontSize = `${px}px`;
    let guard = 0;
    while (guard++ < 24 && px > basePx * 0.5 && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) {
      px *= 0.93;
      el.style.fontSize = `${px}px`;
    }
  }, [content, basePx, maxLines, font, weight]);

  const justify = align === 'center' ? 'center' : align === 'left' ? 'flex-start' : 'flex-end';
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: justify, direction: 'rtl' }}>
      <div
        ref={ref}
        style={{
          maxWidth: '100%', maxHeight: '100%', overflow: 'hidden',
          fontFamily: font, fontSize: `${basePx}px`, fontWeight: weight || 600, lineHeight: lineHeight || 1.2,
          color, textAlign: align, whiteSpace: maxLines === 1 ? 'nowrap' : 'normal', wordBreak: 'break-word',
          display: maxLines && maxLines > 1 ? '-webkit-box' : 'block', WebkitLineClamp: maxLines && maxLines > 1 ? maxLines : undefined, WebkitBoxOrient: 'vertical',
          ...(pill ? { background: pillColor, borderRadius: `${pill.radius * (basePx / 40)}px`, padding: `${pill.padding * 0.6 * (basePx / 40)}px ${pill.padding * (basePx / 40)}px` } : {}),
        }}
      >
        {content}
      </div>
    </div>
  );
}

/**
 * @param template  a Template from lib/design/templates
 * @param fill      { values, images, colors, fonts, logoUrl } from mapBranding.fillTemplate
 * @param overrides her overrides (lib/design/design.ts)
 * @param width     rendered width in px (the canvas scales to it)
 */
export default function DomPreview({ template, fill, overrides = null, width = 300, id, style }) {
  const canvas = CANVAS[template.format] || CANVAS.feed45;
  const k = width / canvas.w;
  const height = Math.round(canvas.h * k);
  const colors = { ...fill.colors, ...(overrides?.colors || {}) };
  const layers = applyOverrides(template, overrides);
  const resolved = useResolvedImages(fill.images);

  return (
    <div id={id} dir="rtl" style={{ position: 'relative', width, height, overflow: 'hidden', background: colors.surface, borderRadius: 0, ...style }}>
      {layers.map((l) => {
        const box = { position: 'absolute', left: pct(l.box.x), top: pct(l.box.y), width: pct(l.box.w), height: pct(l.box.h) };
        if (l.type === 'shape') {
          const bg = l.gradient ? `linear-gradient(${l.gradient.angle}deg, ${colors[l.color]}, ${colors[l.gradient.to]})` : colors[l.color];
          return <div key={l.id} style={{ ...box, background: bg, opacity: l.opacity ?? 1, borderRadius: `${(l.radius || 0) * k}px` }} />;
        }
        if (l.type === 'image') {
          const ref = fill.images?.[l.slot];
          const src = isPrivateRef(ref) ? resolved[ref] : ref;
          const focus = l.focus || { x: 0.5, y: 0.5 };
          const overlay = l.overlay
            ? l.overlay.direction === 'bottom'
              ? `linear-gradient(to top, ${rgba(colors[l.overlay.color], l.overlay.opacity)} 0%, ${rgba(colors[l.overlay.color], l.overlay.opacity * 0.6)} 40%, transparent 75%)`
              : l.overlay.direction === 'top'
                ? `linear-gradient(to bottom, ${rgba(colors[l.overlay.color], l.overlay.opacity)} 0%, transparent 70%)`
                : rgba(colors[l.overlay.color], l.overlay.opacity)
            : null;
          return (
            <div key={l.id} style={{ ...box, overflow: 'hidden', borderRadius: l.radius === 999 ? '50%' : `${(l.radius || 0) * k}px`, background: `linear-gradient(160deg, ${colors.tint}, ${colors.surface})` }}>
              {src && (
                // eslint-disable-next-line @next/next/no-img-element -- her own pictures at their own size, captured by the exporter
                <img src={src} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: l.fit, objectPosition: `${focus.x * 100}% ${focus.y * 100}%`, display: 'block' }} />
              )}
              {overlay && <div style={{ position: 'absolute', inset: 0, background: overlay }} />}
            </div>
          );
        }
        if (l.type === 'logo') {
          if (fill.logoUrl) {
            return (
              <div key={l.id} style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- her logo file */}
                <img src={fill.logoUrl} alt="" crossOrigin="anonymous" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              </div>
            );
          }
          if (l.fallback === 'none' || !fill.values.business_name) return null;
          return (
            <div key={l.id} style={box}>
              <AutoFitText content={fill.values.business_name} basePx={40 * k} lineHeight={1.1} maxLines={1} align="right" weight={700} font={fill.fonts.display} color={colors[l.color || 'ink']} />
            </div>
          );
        }
        if (l.type === 'text') {
          const str = fill.values?.[l.bind] || '';
          if (!str) return null;
          return (
            <div key={l.id} style={box}>
              <AutoFitText
                content={str} basePx={l.size * k} lineHeight={l.lineHeight} maxLines={l.maxLines} align={l.align} weight={l.weight}
                font={fill.fonts[l.font]} color={colors[l.color]}
                pill={l.background || null} pillColor={l.background ? colors[l.background.color] : undefined}
              />
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
