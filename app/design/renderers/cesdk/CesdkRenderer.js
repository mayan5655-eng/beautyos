'use client';

// app/design/renderers/cesdk/CesdkRenderer.js
//
// The vendor layer. Implements lib/design/renderer.ts on IMG.LY CE.SDK:
// a SceneSpec becomes engine blocks, the engine's canvas is mounted into
// our container for touch editing (move, resize, retype), and every gesture
// is reported back in template units through pxBoxToPercent. Nothing
// outside this folder imports the engine.
//
// Lessons from the evaluation baked in: pixel design unit or every size is
// off; a text pill is backgroundColor/*, not a fill; Hebrew, digits and ₪
// need no direction marks; font file URLs must not contain brackets.

import { initEngine } from './engine';
import { pxBoxToPercent, boxChanged } from '@/lib/design/sceneSpec';
import { resolveImageRef } from '../../images';

const hexToRgba = (hex, a = 1) => {
  const h = String(hex || '').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  if (Number.isNaN(n) || (h.length !== 6 && h.length !== 3)) return { r: 0, g: 0, b: 0, a };
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a };
};

const typefaceFor = (file) => {
  const name = /Frank/i.test(file) ? 'Frank Ruhl Libre' : /Heebo/i.test(file) ? 'Heebo' : 'Assistant';
  const uri = /^https?:/.test(file) ? file : `${window.location.origin}${file}`;
  return { name, fonts: [{ uri, subFamily: 'Regular', weight: 'normal', style: 'normal' }] };
};

export default class CesdkRenderer {
  kind = 'cesdk';
  engine = null;
  page = null;
  spec = null;
  ids = new Map();      // spec block id -> engine block id
  back = new Map();     // engine block id -> spec block
  opts = null;
  unsubscribe = [];
  container = null;

  available() {
    return typeof window !== 'undefined' && !!window.WebAssembly;
  }

  async mount(opts) {
    this.opts = opts;
    this.container = opts.container;
    this.engine = await initEngine();
    const engine = this.engine;
    const canvasEl = engine.element;
    if (canvasEl) {
      canvasEl.style.width = '100%';
      canvasEl.style.height = '100%';
      canvasEl.style.display = 'block';
      opts.container.replaceChildren(canvasEl);
    }
    try { engine.editor.setSettingBool('page/title/show', false); } catch { /* older build */ }
    try { engine.editor.setSettingBool('mouse/enableScroll', false); } catch { /* ignore */ }
    try { engine.editor.setSettingBool('touch/singlePointPanning', false); } catch { /* ignore */ }
    try { engine.editor.setSettingBool('touch/pinchAction', false); } catch { /* ignore */ }
    await this.build(opts.spec, opts.editable);
    this.listen();
  }

  async update(spec) {
    if (!this.engine) return;
    this.stopListening();
    await this.build(spec, this.opts?.editable ?? false);
    this.listen();
  }

  async build(spec, editable) {
    const engine = this.engine;
    this.spec = spec;
    this.ids.clear(); this.back.clear();
    const scene = engine.scene.create('Free', { designUnit: 'Pixel' });
    const page = engine.block.create('page');
    engine.block.setWidth(page, spec.width);
    engine.block.setHeight(page, spec.height);
    engine.block.appendChild(scene, page);
    const bg = engine.block.createFill('color');
    engine.block.setColor(bg, 'fill/color/value', hexToRgba(spec.background));
    engine.block.setFill(page, bg);
    this.page = page;

    for (const b of spec.blocks) {
      let id = null;
      if (b.kind === 'rect') id = this.rect(b);
      else if (b.kind === 'texture') id = this.texture(b);
      else if (b.kind === 'deco') id = await this.deco(b);
      else if (b.kind === 'rating') { this.rating(b); continue; }
      else if (b.kind === 'image') id = await this.image(b);
      else if (b.kind === 'logo') id = await this.logo(b);
      else if (b.kind === 'text') id = this.text(b);
      if (id == null) continue;
      engine.block.appendChild(page, id);
      this.ids.set(b.id, id); this.back.set(id, b);
      // Only text and pictures are hers to move; plates and washes stay put.
      const movable = editable && (b.kind === 'text' || b.kind === 'image' || b.kind === 'logo');
      for (const scope of ['layer/move', 'layer/resize']) { try { engine.block.setScopeEnabled(id, scope, movable); } catch { /* scope missing */ } }
      for (const scope of ['layer/rotate', 'layer/flip', 'layer/crop', 'lifecycle/destroy', 'lifecycle/duplicate']) { try { engine.block.setScopeEnabled(id, scope, false); } catch { /* ignore */ } }
      try { engine.block.setScopeEnabled(id, 'text/edit', editable && b.kind === 'text' && b.editable); } catch { /* ignore */ }
    }
    try { engine.scene.zoomToBlock(page, 8, 8, 8, 8); } catch { /* ignore */ }
  }

  place(id, b) {
    const e = this.engine.block;
    e.setPositionX(id, b.x); e.setPositionY(id, b.y); e.setWidth(id, b.w); e.setHeight(id, b.h);
  }

  texture(b) {
    const e = this.engine.block;
    const id = e.create('graphic');
    e.setShape(id, e.createShape('rect'));
    const fill = e.createFill('image');
    e.setString(fill, 'fill/image/imageFileURI', `${window.location.origin}/design-grain.png`);
    e.setFill(id, fill);
    try { e.setContentFillMode(id, 'Cover'); } catch { /* ignore */ }
    try { e.setOpacity(id, b.opacity); } catch { /* ignore */ }
    try { e.setEnum(id, 'blend/mode', b.blend === 'multiply' ? 'Multiply' : 'SoftLight'); } catch { /* ignore */ }
    this.place(id, b);
    return id;
  }


  // Five stars as star shapes, the first `count` filled, the rest outlined.
  rating(b) {
    const e = this.engine.block;
    const group = [];
    const size = b.h;
    const gap = size * 0.18;
    for (let i = 0; i < b.total; i++) {
      const id = e.create('graphic');
      const shape = e.createShape('star');
      try { e.setInt(shape, 'shape/star/points', 5); e.setFloat(shape, 'shape/star/innerDiameter', 0.5); } catch { /* defaults */ }
      e.setShape(id, shape);
      const filled = i < b.count;
      const fill = e.createFill('color');
      e.setColor(fill, 'fill/color/value', hexToRgba(b.color, filled ? 1 : 0));
      e.setFill(id, fill);
      try { e.setStrokeEnabled(id, true); e.setStrokeColor(id, hexToRgba(b.color)); e.setStrokeWidth(id, Math.max(1.5, size * 0.06)); } catch { /* ignore */ }
      // RTL: the first star is the rightmost.
      const x = b.align === 'left' ? b.x + i * (size + gap) : b.x + b.w - (i + 1) * size - i * gap;
      e.setPositionX(id, x); e.setPositionY(id, b.y); e.setWidth(id, size); e.setHeight(id, size);
      for (const scope of ['layer/move', 'layer/resize', 'editor/select']) { try { e.setScopeEnabled(id, scope, false); } catch { /* ignore */ } }
      e.appendChild(this.page, id);
      group.push(id);
    }
    return group.length ? group[0] : null;
  }

  // A line drawing in one colour: the SVG's currentColor becomes the role's hex,
  // and the result goes in as a data URI, so the engine never fetches it.
  async deco(b) {
    const e = this.engine.block;
    let svg = '';
    try { svg = await (await fetch(b.ref)).text(); } catch { return null; }
    if (!svg) return null;
    const tinted = svg.replace(/currentColor/g, b.color);
    const id = e.create('graphic');
    e.setShape(id, e.createShape('rect'));
    const fill = e.createFill('image');
    e.setString(fill, 'fill/image/imageFileURI', 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(tinted))));
    e.setFill(id, fill);
    try { e.setContentFillMode(id, 'Contain'); } catch { /* ignore */ }
    try { e.setOpacity(id, b.opacity); } catch { /* ignore */ }
    if (b.flip) { try { e.setFlipHorizontal(id, true); } catch { /* ignore */ } }
    this.place(id, b);
    for (const scope of ['layer/move', 'layer/resize', 'editor/select']) { try { e.setScopeEnabled(id, scope, false); } catch { /* ignore */ } }
    return id;
  }

  rect(b) {
    const e = this.engine.block;
    const id = e.create('graphic');
    e.setShape(id, e.createShape(b.shape === 'ellipse' ? 'ellipse' : 'rect'));
    let fill;
    if (b.gradientTo) {
      try {
        fill = e.createFill('gradient/linear');
        e.setGradientColorStops(fill, 'fill/gradient/colors', [{ color: hexToRgba(b.color), stop: 0 }, { color: hexToRgba(b.gradientTo), stop: 1 }]);
        const rad = ((b.gradientAngle - 90) * Math.PI) / 180;
        e.setFloat(fill, 'fill/gradient/linear/startPointX', 0.5 - Math.cos(rad) / 2); e.setFloat(fill, 'fill/gradient/linear/startPointY', 0.5 - Math.sin(rad) / 2);
        e.setFloat(fill, 'fill/gradient/linear/endPointX', 0.5 + Math.cos(rad) / 2); e.setFloat(fill, 'fill/gradient/linear/endPointY', 0.5 + Math.sin(rad) / 2);
      } catch { fill = null; }
    }
    if (!fill) { fill = e.createFill('color'); e.setColor(fill, 'fill/color/value', hexToRgba(b.color)); }
    e.setFill(id, fill);
    try { e.setOpacity(id, b.opacity); } catch { /* ignore */ }
    try { e.setFloat(e.getShape(id), 'shape/rect/cornerRadiusTL', b.radius); e.setFloat(e.getShape(id), 'shape/rect/cornerRadiusTR', b.radius); e.setFloat(e.getShape(id), 'shape/rect/cornerRadiusBL', b.radius); e.setFloat(e.getShape(id), 'shape/rect/cornerRadiusBR', b.radius); } catch { /* ignore */ }
    this.place(id, b);
    return id;
  }

  async image(b) {
    const e = this.engine.block;
    const id = e.create('graphic');
    e.setShape(id, e.createShape('rect'));
    const src = b.ref ? await resolveImageRef(b.ref) : null;
    if (src) {
      const fill = e.createFill('image');
      e.setString(fill, 'fill/image/imageFileURI', src);
      e.setFill(id, fill);
      try { e.setContentFillMode(id, b.fit === 'contain' ? 'Contain' : 'Cover'); } catch { /* ignore */ }
    } else {
      // No picture yet: the plate the spec names, so every renderer shows the same cream.
      let fill = null;
      try {
        fill = e.createFill('gradient/linear');
        e.setGradientColorStops(fill, 'fill/gradient/colors', [{ color: hexToRgba(this.spec.plate.from), stop: 0 }, { color: hexToRgba(this.spec.plate.to), stop: 1 }]);
        e.setFloat(fill, 'fill/gradient/linear/startPointX', 0); e.setFloat(fill, 'fill/gradient/linear/startPointY', 0);
        e.setFloat(fill, 'fill/gradient/linear/endPointX', 1); e.setFloat(fill, 'fill/gradient/linear/endPointY', 1);
      } catch { fill = null; }
      if (!fill) { fill = e.createFill('color'); e.setColor(fill, 'fill/color/value', hexToRgba(this.spec.plate.from)); }
      e.setFill(id, fill);
    }
    this.place(id, b);
    if (b.overlayColor && b.overlayOpacity > 0) {
      // The wash is its own block right after the picture; it moves with nothing and is not selectable.
      const wash = e.create('graphic');
      e.setShape(wash, e.createShape('rect'));
      let fill = null;
      if (b.overlayDirection !== 'flat') {
        try {
          fill = e.createFill('gradient/linear');
          const solid = hexToRgba(b.overlayColor, b.overlayOpacity), clear = hexToRgba(b.overlayColor, 0);
          const stops = b.overlayDirection === 'bottom' ? [{ color: clear, stop: 0.25 }, { color: solid, stop: 1 }]
            : b.overlayDirection === 'rise' ? [{ color: clear, stop: 0.2 }, { color: hexToRgba(b.overlayColor, b.overlayOpacity * 0.55), stop: 0.45 }, { color: solid, stop: 0.62 }, { color: solid, stop: 1 }]
            : [{ color: solid, stop: 0 }, { color: clear, stop: 0.7 }];
          e.setGradientColorStops(fill, 'fill/gradient/colors', stops);
          e.setFloat(fill, 'fill/gradient/linear/startPointX', 0.5); e.setFloat(fill, 'fill/gradient/linear/startPointY', 0);
          e.setFloat(fill, 'fill/gradient/linear/endPointX', 0.5); e.setFloat(fill, 'fill/gradient/linear/endPointY', 1);
        } catch { fill = null; }
      }
      if (!fill) { fill = e.createFill('color'); e.setColor(fill, 'fill/color/value', hexToRgba(b.overlayColor, b.overlayOpacity)); }
      e.setFill(wash, fill);
      this.place(wash, b);
      e.appendChild(this.page, id);
      e.appendChild(this.page, wash);
      for (const scope of ['layer/move', 'layer/resize', 'editor/select']) { try { e.setScopeEnabled(wash, scope, false); } catch { /* ignore */ } }
      this.ids.set(b.id, id); this.back.set(id, b);
      return null; // already appended, in order
    }
    return id;
  }

  async logo(b) {
    if (b.ref) {
      const e = this.engine.block;
      const id = e.create('graphic');
      e.setShape(id, e.createShape('rect'));
      const fill = e.createFill('image');
      e.setString(fill, 'fill/image/imageFileURI', b.ref);
      e.setFill(id, fill);
      try { e.setContentFillMode(id, 'Contain'); } catch { /* ignore */ }
      this.place(id, b);
      return id;
    }
    return this.text({ ...b, kind: 'text', bind: '', text: b.fallbackText || '', sizePx: 40, weight: 700, align: 'right', maxLines: 1, lineHeight: 1.1, pillColor: null, pillRadius: 0, pillPadding: 0, editable: false });
  }

  text(b) {
    const e = this.engine.block;
    const id = e.create('text');
    e.setString(id, 'text/text', b.text);
    e.setBool(id, 'text/automaticFontSizeEnabled', false);
    e.setFloat(id, 'text/fontSize', b.sizePx);
    e.setFloat(id, 'text/lineHeight', b.lineHeight);
    try { e.setFloat(id, 'text/letterSpacing', b.letterSpacing || 0); } catch { /* ignore */ }
    e.setEnum(id, 'text/horizontalAlignment', b.align === 'left' ? 'Left' : b.align === 'center' ? 'Center' : 'Right');
    try { e.setEnum(id, 'text/verticalAlignment', 'Center'); } catch { /* ignore */ }
    e.setFont(id, typefaceFor(b.fontFile).fonts[0].uri, typefaceFor(b.fontFile));
    e.setTextColor(id, hexToRgba(b.color));
    try { e.setBool(id, 'text/clipLinesOutsideOfFrame', true); } catch { /* ignore */ }
    if (b.pillColor) {
      e.setBool(id, 'backgroundColor/enabled', true);
      e.setColor(id, 'backgroundColor/color', hexToRgba(b.pillColor));
      e.setFloat(id, 'backgroundColor/cornerRadius', b.pillRadius);
      e.setFloat(id, 'backgroundColor/paddingLeft', b.pillPadding); e.setFloat(id, 'backgroundColor/paddingRight', b.pillPadding);
      e.setFloat(id, 'backgroundColor/paddingTop', Math.round(b.pillPadding * 0.55)); e.setFloat(id, 'backgroundColor/paddingBottom', Math.round(b.pillPadding * 0.55));
    }
    this.place(id, b);
    return id;
  }

  // ── Edits back to template terms ───────────────────────────────────────────
  listen() {
    const engine = this.engine;
    if (!this.opts?.editable) return;
    const report = () => this.report();
    try {
      if (typeof engine.block.onSelectionChanged === 'function') {
        this.unsubscribe.push(engine.block.onSelectionChanged(() => {
          const sel = engine.block.findAllSelected();
          this.opts?.onSelect?.(sel.length ? (this.back.get(sel[0])?.id ?? null) : null);
        }));
      }
    } catch { /* ignore */ }
    try {
      if (engine.event && typeof engine.event.subscribe === 'function') {
        this.unsubscribe.push(engine.event.subscribe([...this.back.keys()], () => this.schedule(report)));
      }
    } catch { /* ignore */ }
    // Gestures end with a pointer-up on the canvas; that is when a box is final.
    const el = this.container;
    if (el) {
      const onUp = () => this.schedule(report);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('keyup', onUp);
      this.unsubscribe.push(() => { el.removeEventListener('pointerup', onUp); el.removeEventListener('keyup', onUp); });
    }
  }

  schedule(fn) {
    clearTimeout(this.timer);
    this.timer = setTimeout(fn, 120);
  }

  stopListening() {
    for (const u of this.unsubscribe) { try { u(); } catch { /* ignore */ } }
    this.unsubscribe = [];
  }

  report() {
    if (!this.engine || !this.spec) return;
    const e = this.engine.block;
    const canvas = { w: this.spec.width, h: this.spec.height };
    const layers = {};
    const values = {};
    for (const [engineId, b] of this.back) {
      let box;
      try { box = pxBoxToPercent(canvas, { x: e.getPositionX(engineId), y: e.getPositionY(engineId), w: e.getFrameWidth(engineId), h: e.getFrameHeight(engineId) }); } catch { continue; }
      const original = pxBoxToPercent(canvas, { x: b.x, y: b.y, w: b.w, h: b.h });
      const o = {};
      if (boxChanged(box, original)) o.box = box;
      if (b.kind === 'text' && b.bind) {
        try {
          const text = e.getString(engineId, 'text/text');
          if (text !== b.text) values[b.bind] = text;
          const size = e.getFloat(engineId, 'text/fontSize');
          if (Math.abs(size - b.sizePx) > 0.5) o.size = Math.round(size);
        } catch { /* ignore */ }
      }
      if (Object.keys(o).length) layers[b.id] = o;
    }
    this.opts?.onEdit?.({ overrides: { layers }, values });
  }

  select(blockId) {
    if (!this.engine) return;
    const e = this.engine.block;
    try { for (const id of e.findAllSelected()) e.setSelected(id, false); } catch { /* ignore */ }
    const id = blockId ? this.ids.get(blockId) : null;
    if (id != null) { try { e.setSelected(id, true); } catch { /* ignore */ } }
  }

  apply(blockId, change) {
    const id = this.ids.get(blockId);
    const b = this.back.get(id);
    if (id == null || !b) return;
    const e = this.engine.block;
    try {
      if (change.sizePx && b.kind === 'text') e.setFloat(id, 'text/fontSize', change.sizePx);
      if (change.color && b.kind === 'text') e.setTextColor(id, hexToRgba(change.color));
      if (typeof change.text === 'string' && b.kind === 'text') e.setString(id, 'text/text', change.text);
    } catch { /* ignore */ }
    this.schedule(() => this.report());
  }

  async exportImage(mimeType = 'image/png') {
    try { for (const id of this.engine.block.findAllSelected()) this.engine.block.setSelected(id, false); } catch { /* ignore */ }
    return this.engine.block.export(this.page, { mimeType });
  }

  dispose() {
    this.stopListening();
    clearTimeout(this.timer);
    try { this.engine?.dispose(); } catch { /* ignore */ }
    this.engine = null; this.page = null; this.spec = null;
    this.ids.clear(); this.back.clear();
  }
}
