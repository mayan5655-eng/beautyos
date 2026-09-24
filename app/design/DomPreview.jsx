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

import { useEffect, useLayoutEffect, useRef } from 'react';
import { CANVAS, ratingCount } from '@/lib/design/contract';
import { fitText } from '@/lib/design/fitText';
import { textDirection } from '@/lib/design/canvasText';
import { applyOverrides, isPrivateRef } from '@/lib/design/design';
import { useResolvedImages } from './images';

const hexToRgb = (hex) => {
  const h = String(hex || '').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return Number.isNaN(n) ? { r: 0, g: 0, b: 0 } : { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};
const rgba = (hex, a) => { const { r, g, b } = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };
const pct = (n) => `${n}%`;
// A five-point star in a 24-unit box.
const STAR = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z';

// Shrinks the text until it fits its box and its line budget, to half the
// base size at most (lib/design/fitText). Works on the element's style
// directly: measuring and shrinking is a layout concern, not state, and it
// must finish before paint. Refits when the fonts arrive, so a fit measured
// with a fallback font is corrected.
//
// The container is right-to-left, so a flex row STARTS at the right edge:
// 'right' is flex-start and 'left' is flex-end. Text with no Hebrew in it
// (a phone, a handle) is set left-to-right so it reads in order.
function AutoFitText({ content, basePx, lineHeight, maxLines, align, valign, weight, font, color, pill, pillColor, letterSpacing }) {
  const ref = useRef(null);
  const boxRef = useRef(null);
  const fit = () => {
    const el = ref.current, box = boxRef.current;
    if (!el || !box) return;
    const lh = lineHeight || 1.2;
    const { px } = fitText({
      basePx, lineHeight: lh, maxLines: maxLines || 0, boxWidth: box.clientWidth, boxHeight: box.clientHeight,
      measure: (size) => {
        el.style.fontSize = `${size}px`;
        // A pill has padding: it counts toward the box, but not toward the number of lines.
        const cs = getComputedStyle(el);
        const padV = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
        return { width: el.scrollWidth, height: el.scrollHeight, contentHeight: el.scrollHeight - padV };
      },
    });
    el.style.fontSize = `${px}px`;
  };
  useLayoutEffect(fit, [content, basePx, maxLines, font, weight, lineHeight]);
  useEffect(() => {
    let alive = true;
    if (typeof document !== 'undefined' && document.fonts?.ready) document.fonts.ready.then(() => { if (alive) fit(); });
    return () => { alive = false; };
  });

  const justify = align === 'center' ? 'center' : align === 'left' ? 'flex-end' : 'flex-start';
  return (
    <div ref={boxRef} style={{ width: '100%', height: '100%', display: 'flex', alignItems: valign === 'top' ? 'flex-start' : valign === 'bottom' ? 'flex-end' : 'center', justifyContent: justify, direction: 'rtl', overflow: 'hidden' }}>
      <div
        ref={ref}
        style={{
          maxWidth: '100%',
          fontFamily: font, fontSize: `${basePx}px`, fontWeight: weight || 600, lineHeight: lineHeight || 1.2, letterSpacing: letterSpacing ? `${letterSpacing}em` : undefined,
          color, textAlign: align, direction: textDirection(String(content || '')), whiteSpace: maxLines === 1 ? 'nowrap' : 'normal', wordBreak: 'break-word', display: 'block',
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
export default function DomPreview({ template, fill, overrides = null, width = 300, id, style, layerFilter = null, transparent = false }) {
  const canvas = CANVAS[template.format] || CANVAS.feed45;
  const k = width / canvas.w;
  const height = Math.round(canvas.h * k);
  const colors = { ...fill.colors, ...(overrides?.colors || {}) };
  const layers = applyOverrides(template, overrides).filter((l, i, all) => (layerFilter ? layerFilter(l, i, all) : true));
  const resolved = useResolvedImages(fill.images);

  return (
    <div id={id} dir="rtl" style={{ position: 'relative', width, height, overflow: 'hidden', background: transparent ? 'transparent' : colors.surface, borderRadius: 0, ...style }}>
      {layers.map((l) => {
        const box = { position: 'absolute', left: pct(l.box.x), top: pct(l.box.y), width: pct(l.box.w), height: pct(l.box.h) };
        if (l.type === 'shape') {
          const bg = l.gradient ? `linear-gradient(${l.gradient.angle}deg, ${colors[l.color]}, ${colors[l.gradient.to]})` : colors[l.color];
          return <div key={l.id} style={{ ...box, background: bg, opacity: l.opacity ?? 1, borderRadius: l.shape === 'ellipse' ? '50%' : `${(l.radius || 0) * k}px` }} />;
        }
        if (l.type === 'rating') {
          const n = ratingCount(fill.values?.[l.bind]);
          return (
            <div key={l.id} style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: l.align === 'left' ? 'flex-end' : 'flex-start', gap: '3%', direction: 'rtl' }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <svg key={i} viewBox="0 0 24 24" style={{ height: '100%', width: 'auto', flexShrink: 0 }}>
                  <path d={STAR} fill={i < n ? colors[l.color] : 'none'} stroke={colors[l.color]} strokeWidth="1.6" strokeLinejoin="round" />
                </svg>
              ))}
            </div>
          );
        }
        if (l.type === 'deco') {
          // The drawing is a mask; the colour role fills it. One SVG serves every brand.
          const mask = `url(/design-deco/${l.asset}.svg) center / contain no-repeat`;
          return <div key={l.id} style={{ ...box, WebkitMask: mask, mask, background: colors[l.color], opacity: l.opacity ?? 1, transform: l.flip ? 'scaleX(-1)' : undefined, pointerEvents: 'none' }} />;
        }
        if (l.type === 'texture') {
          return <div key={l.id} style={{ ...box, backgroundImage: 'url(/design-grain.png)', backgroundSize: `${Math.max(96, 256 * k)}px`, opacity: l.opacity, mixBlendMode: l.blend || 'soft-light', pointerEvents: 'none' }} />;
        }
        if (l.type === 'image') {
          const ref = fill.images?.[l.slot];
          const src = isPrivateRef(ref) ? resolved[ref] : ref;
          const focus = l.focus || { x: 0.5, y: 0.5 };
          const overlay = l.overlay
            ? l.overlay.direction === 'bottom'
              ? `linear-gradient(to top, ${rgba(colors[l.overlay.color], l.overlay.opacity)} 0%, ${rgba(colors[l.overlay.color], l.overlay.opacity * 0.6)} 40%, transparent 75%)`
              : l.overlay.direction === 'rise'
              ? `linear-gradient(to top, ${rgba(colors[l.overlay.color], l.overlay.opacity)} 0%, ${rgba(colors[l.overlay.color], l.overlay.opacity)} 38%, ${rgba(colors[l.overlay.color], l.overlay.opacity * 0.55)} 55%, transparent 80%)`
            : l.overlay.direction === 'top'
                ? `linear-gradient(to bottom, ${rgba(colors[l.overlay.color], l.overlay.opacity)} 0%, transparent 70%)`
                : rgba(colors[l.overlay.color], l.overlay.opacity)
            : null;
          return (
            <div key={l.id} style={{ ...box, overflow: 'hidden', borderRadius: l.radius === 999 ? '50%' : l.shape === 'arch' ? `${(l.box.w / 100) * width / 2}px ${(l.box.w / 100) * width / 2}px 0 0` : `${(l.radius || 0) * k}px`, background: `linear-gradient(160deg, ${colors.blush}, ${colors.sand})` }}>
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
              <div key={l.id} style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
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
                content={str} basePx={l.size * k} lineHeight={l.lineHeight} maxLines={l.maxLines} align={l.align} valign={l.valign} weight={l.weight} letterSpacing={l.letterSpacing}
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
