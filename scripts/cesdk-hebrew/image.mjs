// CE.SDK Hebrew probe, image: the seven Creatomate probes, rendered headlessly
// with @cesdk/node the way a server-side caption renderer would.
//   CESDK_LICENSE=… node probe-image.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import CreativeEngine from '@cesdk/node';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const fontUri = (file) => pathToFileURL(path.join(here, file)).href;
const TYPEFACES = {
  Assistant: { name: 'Assistant', fonts: [{ uri: fontUri('Assistant.ttf'), subFamily: 'Regular', weight: 'normal', style: 'normal' }] },
  Frank: { name: 'Frank Ruhl Libre', fonts: [{ uri: fontUri('FrankRuhlLibre.ttf'), subFamily: 'Regular', weight: 'normal', style: 'normal' }] },
};
const INK = { r: 42 / 255, g: 34 / 255, b: 51 / 255, a: 1 };
const GREY = { r: 152 / 255, g: 135 / 255, b: 155 / 255, a: 1 };
const GOLD = { r: 201 / 255, g: 162 / 255, b: 75 / 255, a: 1 };

const W = 1080, H = 1350;
const engine = await CreativeEngine.init({ license: process.env.CESDK_LICENSE || undefined });
try {
  const scene = engine.scene.create("Free", { designUnit: "Pixel" });
  const page = engine.block.create('page');
  engine.block.setWidth(page, W); engine.block.setHeight(page, H);
  engine.block.appendChild(scene, page);
  const bg = engine.block.createFill('color');
  engine.block.setColor(bg, 'fill/color/value', { r: 254 / 255, g: 250 / 255, b: 247 / 255, a: 1 });
  engine.block.setFill(page, bg);

  // A right-aligned text block spanning 84% of the width, anchored 8% from the right edge.
  function text(str, yPct, { size = 54, font = 'Assistant', color = INK, align = 'Right', width = 0.84, autoHeight = true, bg = null } = {}) {
    const t = engine.block.create('text');
    engine.block.setString(t, 'text/text', str);
    engine.block.setBool(t, 'text/automaticFontSizeEnabled', false);
    engine.block.setFloat(t, 'text/fontSize', size);
    engine.block.setFloat(t, 'text/lineHeight', 1.2);
    engine.block.setEnum(t, 'text/horizontalAlignment', align);
    const tf = TYPEFACES[font];
    engine.block.setFont(t, tf.fonts[0].uri, tf);
    engine.block.setTextColor(t, color);
    engine.block.setWidth(t, W * width);
    if (autoHeight) engine.block.setHeightMode(t, 'Auto'); else engine.block.setHeight(t, 90);
    engine.block.setPositionX(t, W * (0.92 - width));
    engine.block.setPositionY(t, H * yPct);
    if (bg) {
      engine.block.setBool(t, 'backgroundColor/enabled', true);
      engine.block.setColor(t, 'backgroundColor/color', bg);
      engine.block.setFloat(t, 'backgroundColor/cornerRadius', 14);
      for (const s of ['Left', 'Right']) engine.block.setFloat(t, 'backgroundColor/padding' + s, 22);
      for (const s of ['Top', 'Bottom']) engine.block.setFloat(t, 'backgroundColor/padding' + s, 10);
    }
    engine.block.appendChild(page, t);
    return t;
  }
  const label = (s, y) => text(s, y, { size: 22, color: GREY });

  label('1 · כותרת בעברית, Assistant', 0.03);
  text('טיפול פנים לאביב — הזמיני עכשיו', 0.06, { size: 64 });
  label('2 · אותה כותרת, Frank Ruhl Libre', 0.16);
  text('טיפול פנים לאביב — הזמיני עכשיו', 0.19, { size: 64, font: 'Frank' });
  label('3 · עברית עם מספרים: מחיר, משך, יום ושעה', 0.29);
  text('מחיר: ₪350 · משך: 60 דק׳', 0.32, { size: 48 });
  text('יום שלישי, 14:30 · 3 מפגשים', 0.38, { size: 48 });
  label('4 · פסקה גלישה אוטומטית, מיושרת לימין', 0.46);
  text('הסריקה נועדה להתרשמות ראשונית בלבד ואינה מהווה אבחון רפואי. תוצאות מדויקות יותר מתקבלות בפגישה בקליניקה, אחרי בדיקה אישית.', 0.49, { size: 40 });
  label('5 · לטינית בתוך עברית וסוגריים', 0.64);
  text('מופעל ע"י BloomOS (בקליניקה שלך) — 100% טבעי!', 0.67, { size: 44 });
  label('6 · שורה שמתחילה בספרה', 0.75);
  text('100% טבעי!', 0.78, { size: 48 });
  label('7 · שקל אחרי רווח, ומקום הסימן בסוף שורה', 0.85);
  text('מחיר: 350 ₪', 0.88, { size: 48 });
  label('8 · כתובית עם רקע', 0.94);
  text('שלב 1: ניקוי עמוק · 15 דק׳', 0.955, { size: 40, color: { r: 1, g: 1, b: 1, a: 1 }, bg: GOLD, width: 0.5 });

  const blob = await engine.block.export(page, { mimeType: 'image/png' });
  const out = path.join(process.env.USERPROFILE, 'OneDrive', 'שולחן העבודה', 'cesdk-hebrew-image.png');
  fs.writeFileSync(out, Buffer.from(await blob.arrayBuffer()));
  console.log('saved', out, fs.statSync(out).size, 'bytes');
} finally { engine.dispose(); }
