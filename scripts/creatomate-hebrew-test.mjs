// scripts/creatomate-hebrew-test.mjs
//
// A read-only evaluation of Creatomate for Hebrew. Renders ONE image and ONE
// three-second clip from an inline RenderScript source and saves both next to
// the Desktop, so the result can be looked at rather than guessed at.
//
//   CREATOMATE_API_KEY=… node scripts/creatomate-hebrew-test.mjs
//   node scripts/creatomate-hebrew-test.mjs --dry     # print the payloads only
//
// What it probes (each block is labelled in the frame so a screenshot reads
// on its own):
//   1. a Hebrew heading in a Google font with Hebrew glyphs (Assistant)
//   2. the same heading in a serif (Frank Ruhl Libre) - is the font there?
//   3. mixed Hebrew + numbers: price, duration, weekday + time (bidi order)
//   4. a wrapped right-aligned paragraph - line order and ragged edge side
//   5. Hebrew with Latin inside it (BloomOS) and mirrored parentheses
//   6. a caption pill, right-aligned at the bottom, as reels captions would be
//   7. the same caption on a 3 s clip, appearing at 1 s
//
// Costs: an image is 1 credit; a 3 s clip is a handful. The trial has 50.
// No template is saved to the account and nothing is integrated.

import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.creatomate.com/v2/renders';
const KEY = String(process.env.CREATOMATE_API_KEY || '').trim();
const DRY = process.argv.includes('--dry');

// Right-aligned Hebrew text block. x_alignment "100%" is Creatomate's right
// alignment; there is no direction/bidi property in the text element, so
// this is the whole RTL story - what the engine does with it is the test.
const heb = (name, text, y, opts = {}) => ({
  type: 'text', name, text,
  x: '92%', y, width: '84%', height: opts.height || '9%',
  x_anchor: '100%', y_anchor: '0%',
  x_alignment: '100%', y_alignment: '0%',
  font_family: opts.font || 'Assistant', font_weight: opts.weight || 700,
  font_size: opts.size || '5 vmin', line_height: '120%',
  fill_color: opts.color || '#2A2233',
  ...(opts.bg ? { background_color: opts.bg, background_x_padding: '30%', background_y_padding: '20%', background_border_radius: '30%' } : {}),
  ...(opts.extra || {}),
});
// A small grey label above each probe so the frame documents itself.
const label = (name, text, y) => ({
  type: 'text', name, text, x: '92%', y, width: '84%', height: '3%',
  x_anchor: '100%', y_anchor: '0%', x_alignment: '100%',
  font_family: 'Assistant', font_weight: 400, font_size: '2 vmin', fill_color: '#98879B',
});

const image = {
  output_format: 'png', width: 1080, height: 1350, fill_color: '#FEFAF7',
  elements: [
    label('l1', '1 · כותרת בעברית, Assistant', '3%'),
    heb('heading-assistant', 'טיפול פנים לאביב — הזמיני עכשיו', '6%', { size: '6 vmin' }),
    label('l2', '2 · אותה כותרת, Frank Ruhl Libre', '16%'),
    heb('heading-frank', 'טיפול פנים לאביב — הזמיני עכשיו', '19%', { font: 'Frank Ruhl Libre', size: '6 vmin' }),
    label('l3', '3 · עברית עם מספרים: מחיר, משך, יום ושעה', '29%'),
    heb('mixed-price', 'מחיר: ₪350 · משך: 60 דק׳', '32%', { weight: 600, size: '4.5 vmin' }),
    heb('mixed-time', 'יום שלישי, 14:30 · 3 מפגשים', '38%', { weight: 600, size: '4.5 vmin' }),
    label('l4', '4 · פסקה גלישה, מיושרת לימין', '46%'),
    heb('paragraph', 'הסריקה נועדה להתרשמות ראשונית בלבד ואינה מהווה אבחון רפואי. תוצאות מדויקות יותר מתקבלות בפגישה בקליניקה, אחרי בדיקה אישית.', '49%', { weight: 400, size: '3.6 vmin', height: '16%' }),
    label('l5', '5 · לטינית בתוך עברית וסוגריים', '66%'),
    heb('latin-inside', 'מופעל ע"י BloomOS (בקליניקה שלך) — 100% טבעי!', '69%', { weight: 600, size: '4.2 vmin' }),
    label('l6', '6 · כתובית עם רקע, מיושרת לימין למטה', '80%'),
    heb('caption', 'שלב 1: ניקוי עמוק · 15 דק׳', '86%', { size: '4 vmin', color: '#FFFFFF', bg: '#C9A24B', height: '7%', extra: { width: null } }),
  ],
};

const clip = {
  output_format: 'mp4', width: 1080, height: 1920, duration: 3, frame_rate: 25, fill_color: '#2A2233',
  elements: [
    heb('clip-heading', 'טיפול פנים לאביב', '40%', { size: '8 vmin', color: '#FFFFFF' }),
    { ...heb('clip-caption', 'שלב 1: ניקוי עמוק · 15 דק׳ · ₪120', '80%', { size: '4.5 vmin', color: '#2A2233', bg: '#C9A24B', height: '7%', extra: { width: null } }), time: 1, duration: 2 },
  ],
};

async function render(source) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ source }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`POST ${res.status}: ${JSON.stringify(body).slice(0, 400)}`);
  const job = Array.isArray(body) ? body[0] : body;
  for (let i = 0; i < 60; i++) {
    if (job.status === 'succeeded' || job.status === 'failed') break;
    await new Promise((r) => setTimeout(r, 3000));
    const p = await fetch(`${API}/${job.id}`, { headers: { Authorization: `Bearer ${KEY}` } });
    Object.assign(job, await p.json());
    process.stdout.write(`  ${job.status}\r`);
  }
  return job;
}

async function save(url, file) {
  const r = await fetch(url);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

const outDir = process.env.OUT_DIR || path.join(process.env.USERPROFILE || '.', 'OneDrive', 'שולחן העבודה');

if (DRY) {
  console.log(JSON.stringify({ image, clip }, null, 2));
  process.exit(0);
}
if (!KEY) { console.error('CREATOMATE_API_KEY is not set'); process.exit(2); }

for (const [name, source, ext] of [['image', image, 'png'], ['clip', clip, 'mp4']]) {
  console.log(`rendering ${name}…`);
  const job = await render(source);
  console.log(`  ${name}: ${job.status}${job.error_message ? ' — ' + job.error_message : ''}`);
  if (job.status === 'succeeded' && job.url) {
    const file = path.join(outDir, `creatomate-hebrew-${name}.${ext}`);
    await save(job.url, file);
    console.log(`  saved ${file}\n  url   ${job.url}`);
  }
}
