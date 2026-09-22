// Width-coded rows (measurable, no credits): visual order of Hebrew, digits
// and symbols, wrap line order, and manual line breaks.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import CreativeEngine from '@cesdk/node';
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const tf = { name: 'Assistant', fonts: [{ uri: pathToFileURL(path.join(here, 'Assistant.ttf')).href, subFamily: 'Regular', weight: 'normal', style: 'normal' }] };
const A = 'אאאאאאאאאא';
const rows = [
  ['r1', `${A} בב`],                 // two Hebrew words: which is on the right?
  ['r2', `${A} 12 ₪`],
  ['r3', `${A} ₪12`],
  ['r4', `12% ${A} !`],
  ['r5', `ב 12:30 ${A}`],
  ['r6', `${A} ${A} ${A} בב`, 0.62], // narrow: must wrap; where does the short line go?
  ['r7', `${A} ${A}\nבב`],           // manual break
];
const W = 1080, H = 1350;
const engine = await CreativeEngine.init({ license: process.env.CESDK_LICENSE || undefined });
try {
  const scene = engine.scene.create('Free', { designUnit: 'Pixel' });
  const page = engine.block.create('page');
  engine.block.setWidth(page, W); engine.block.setHeight(page, H);
  engine.block.appendChild(scene, page);
  const bg = engine.block.createFill('color'); engine.block.setColor(bg, 'fill/color/value', { r: 1, g: 1, b: 1, a: 1 }); engine.block.setFill(page, bg);
  rows.forEach(([name, str, width = 0.84], i) => {
    const t = engine.block.create('text');
    engine.block.setString(t, 'text/text', str);
    engine.block.setBool(t, 'text/automaticFontSizeEnabled', false);
    engine.block.setFloat(t, 'text/fontSize', 54);
    engine.block.setFloat(t, 'text/lineHeight', 1.2);
    engine.block.setEnum(t, 'text/horizontalAlignment', 'Right');
    engine.block.setFont(t, tf.fonts[0].uri, tf);
    engine.block.setTextColor(t, { r: 0, g: 0, b: 0, a: 1 });
    engine.block.setWidth(t, W * width); engine.block.setHeightMode(t, 'Auto');
    engine.block.setPositionX(t, W * (0.92 - width)); engine.block.setPositionY(t, H * (0.03 + i * 0.13));
    engine.block.appendChild(page, t);
  });
  const blob = await engine.block.export(page, { mimeType: 'image/png' });
  const out = path.join(process.env.USERPROFILE, 'OneDrive', 'שולחן העבודה', 'cesdk-hebrew-probe2.png');
  fs.writeFileSync(out, Buffer.from(await blob.arrayBuffer()));
  console.log('saved', out);
} finally { engine.dispose(); }
