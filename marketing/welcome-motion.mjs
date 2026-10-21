// marketing/welcome-motion.mjs
//
// The welcome video sent after signup (kalmea.app/tutorials, first video). Version 3, from the owner's notes: realistic (the
// real app moving inside the phone, recorded from the demo tenant), fun and surprising (pop-up windows, features bursting out,
// "why this is not a regular booking system"), handwritten titles (Gveret Levin), and music.
//
//   node welcome-motion.mjs --shots        still screens used for the flying reel thumbnails -> out/motion/shots/
//   node welcome-motion.mjs --clips        real clips of the app (demo tenant, no captions)   -> out/motion/clips/<id>.webm
//   node welcome-motion.mjs                render -> out/motion/kalmea-welcome-motion.mp4 (720x1280, 30 fps, H.264 + AAC music)
//   node welcome-motion.mjs --frame=12.5   one still at t = 12.5 s -> out/motion/frame.png (for checking)
//
// Built like cost-animation.mjs: nothing on the page runs by itself. Every element, and the frame shown by every clip, is a
// function of the clock t; the script steps t one frame at a time, seeks each clip to its frame, and screenshots. Same result on
// every run. Scenes are listed with their own length and every time inside a scene is relative to its start.
//
// Music: "Beauty Skincare Cosmetic Music" by GR0ZA, Pixabay (Content License: free for commercial use, no credit required),
// https://pixabay.com/music/beats-beauty-skincare-cosmetic-music-582613/ . Kept in in/music/ (not committed).
//
// What it may claim (checked 2026-10-21; the owner asked for the first three as features, to be switched on before this version
// replaces the live one):
//  - Card payments (Grow), the cancellation charge (needs Grow) and automatic WhatsApp messages (needs the central number and
//    platform_settings.whatsapp_auto_utility_enabled) were NOT live on that date. Do not put this version on /tutorials until
//    they are.
//  - The advisor answer is an illustration from the demo tenant's own home-screen numbers, marked "דוגמה מחשבון דמו"; no AI
//    call is made (the advisor clip types the question and never sends it). Gap-fill says "with your OK".
//  - The face at the end is the product's AI presenter, labelled "דמות AI להמחשה".
//  - Hebrew: every line is its own element with the break chosen here; a digit never starts a line; times, sums and the phone
//    number are isolated (dir=ltr), and ₪ is glued to its digits inside that isolate.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  BASE, BRAND, OUT, DEMO_TENANT, AI_ROUTES, openBrowser, recordTake, ff, duration, log, pause,
} from './lib.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ffmpeg = require('ffmpeg-static');

const FPS = 30, W = 540, H = 960, DPR = 720 / 540;
const DIR = path.join(OUT, 'motion'), SHOTS = path.join(DIR, 'shots'), CLIPS = path.join(DIR, 'clips');
const MUSIC = path.join(path.dirname(OUT), 'in', 'music', 'gr0za-beauty-skincare-cosmetic-music-582613.mp3');
const stillAt = process.argv.find((a) => a.startsWith('--frame='))?.split('=')[1];
for (const d of [SHOTS, CLIPS]) fs.mkdirSync(d, { recursive: true });

const nav = (p, l) => p.locator('button:visible', { hasText: new RegExp(`${l}$`) }).last();
const btn = (p, re) => p.locator('button:visible', { hasText: re }).first();
const home = async (p) => { await p.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await nav(p, 'יומן').waitFor({ timeout: 20000 }); await pause(1200); };

// ── 1a. stills (the reels row, for the flying thumbnails) ─────────────────────────────────────────────
if (process.argv.includes('--shots')) {
  const browser = await openBrowser();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 764 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'he-IL' });
  await ctx.route('**/*', (r) => (r.request().method() !== 'GET' && AI_ROUTES.test(new URL(r.request().url()).pathname)) ? r.abort() : r.continue());
  await ctx.request.get(`${BASE}/demo/cosmetics`, { maxRedirects: 0 });
  const p = await ctx.newPage();
  await home(p); await nav(p, 'תוכן').tap(); await p.getByText('מה מפרסמים השבוע').first().waitFor({ timeout: 15000 }); await pause(1500);
  await btn(p, /^תבניות/).tap(); await pause(1500);
  await p.getByText(/רצף מוכן של/).first().evaluate((el) => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -160); }); await pause(2500);
  await p.screenshot({ path: path.join(SHOTS, 'reels.png') });
  await browser.close();
  log(`stills -> ${SHOTS}`);
  process.exit(0);
}

// ── 1b. real clips: the app moving, a finger gliding to what it taps, no captions. Demo tenant; AI routes abort the take ──
const CLIP_DEFS = {
  book: { owner: false,
    setup: async (h) => { await h.page.goto(`${BASE}/book?t=${DEMO_TENANT}`, { waitUntil: 'networkidle' }); await h.page.locator('#bk-services').waitFor({ timeout: 15000 }); await pause(300); },
    play: async (h) => { await pause(700); await h.glide(h.page.locator('#bk-services'), 1100); await pause(500);
      await h.tap(h.page.locator('#bk-services button', { hasText: 'קביעת תור' }).first(), { after: 900 });
      await h.page.getByText('בחרי יום').waitFor({ timeout: 10000 }); await pause(1600); } },
  payments: { setup: async (h) => { await home(h.page); await h.tap(nav(h.page, 'תשלום'), { before: 100, after: 1000 }); },
    play: async (h) => { await pause(900); await h.scrollBy(420, 2000); await pause(1500); } },
  calendar: { setup: async (h) => { await home(h.page); await h.tap(nav(h.page, 'יומן'), { before: 100, after: 1000 }); },
    play: async (h) => { await pause(1000); await h.tap(btn(h.page, /^שבוע$/), { before: 200, after: 1000 }); await h.scrollBy(260, 1600); await pause(800); } },
  messages: { setup: async (h) => { await home(h.page); await h.tap(nav(h.page, 'לקוחות'), { after: 700 }); await h.tap(btn(h.page, /^הודעות$/), { after: 1200 }); },
    play: async (h) => { await pause(1000); await h.scrollBy(300, 1800); await pause(1500); } }, // "שלחי" is never tapped
  home: { setup: async (h) => { await home(h.page); },
    play: async (h) => { await pause(900); await h.scrollBy(560, 2200); await pause(1400); } },
  advisor: { setup: async (h) => { await home(h.page); await h.tap(nav(h.page, 'עוד'), { after: 700 }); await h.tap(btn(h.page, /יועץ AI/), { after: 1500 }); },
    play: async (h) => { await pause(600); // the question is typed, never sent: no AI call
      await h.type(h.page.getByPlaceholder(/כתבי שאלה/), 'איך היה החודש שלי?', { after: 1500 }); } },
  content: { setup: async (h) => { await home(h.page); await h.tap(nav(h.page, 'תוכן'), { after: 1200 }); },
    play: async (h) => { await pause(700); await h.tap(btn(h.page, /^תבניות/), { before: 200, after: 900 }); await h.scrollBy(520, 2200); await pause(800); } },
  scan: { owner: false,
    setup: async (h) => { await h.page.goto(`${BASE}/skin-scan?t=${DEMO_TENANT}`, { waitUntil: 'networkidle' }); await h.page.getByText(/הכירי את העור שלך/).first().waitFor({ timeout: 15000 }); },
    play: async (h) => { await pause(1000); await h.scrollBy(460, 2200); await pause(1400); } },
  card: { setup: async (h) => { await home(h.page); await h.tap(nav(h.page, 'לקוחות'), { after: 900 }); },
    play: async (h) => { await h.tap(h.page.getByText('ליה דהן', { exact: true }).filter({ visible: true }).first(), { before: 300, after: 1300 });
      await h.tap(btn(h.page, /^היסטוריה/), { before: 400, after: 1400 }); } },
};

if (process.argv.includes('--clips')) {
  const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]?.split(',');
  const browser = await openBrowser();
  for (const [id, c] of Object.entries(CLIP_DEFS)) {
    if (only && !only.includes(id)) continue;
    log(`clip ${id}`);
    const raw = path.join(OUT, 'parts', `motion-${id}`);
    fs.rmSync(raw, { recursive: true, force: true });
    const setup = async (h) => { await h.page.addInitScript(() => { window.__hideDemoBanner = true; }); await c.setup(h); };
    const take = await recordTake(browser, raw, { owner: c.owner !== false, setup, play: c.play, label: `motion-${id}` });
    if (take.aiCalls.length) throw new Error(`clip ${id} touched an AI route: ${take.aiCalls.join(', ')}`);
    // every frame a keyframe: the renderer seeks to an exact frame 30 times a second
    const out = path.join(CLIPS, `${id}.webm`);
    ff(['-ss', Math.max(0, take.trim - 0.1).toFixed(2), '-i', take.file, '-an', '-vf', 'fps=30', '-c:v', 'libvpx', '-g', '1', '-b:v', '2500k', '-crf', '8', out]);
    log(`   ${duration(out).toFixed(1)} s`);
  }
  await browser.close();
  process.exit(0);
}

// ── 2. building blocks ─────────────────────────────────────────────────────────────────────────────
const b64 = (f, type) => {
  if (!fs.existsSync(f)) throw new Error(`missing ${f}: run  node welcome-motion.mjs --shots  and  --clips  first`);
  return `data:${type};base64,${fs.readFileSync(f).toString('base64')}`;
};
const REELS = b64(path.join(SHOTS, 'reels.png'), 'image/png');
const GVERET = b64(new URL('../fonts/GveretLevin.woff2', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'font/woff2');
const clip = (id) => b64(path.join(CLIPS, `${id}.webm`), 'video/webm');

const el = (cls, tin, tout, a, inner, style = '', extra = '') => `<div class="el ${cls}" data-in="${tin}" data-out="${tout}" data-a="${a}" ${extra} style="${style}">${inner}</div>`;
const lines = (ls) => ls.map((l) => `<div>${l}</div>`).join('');
const ltr = (s) => `<span class="ltr">${s}</span>`;

const SCENES = [];
let clock = 0;
const scene = (len, build) => { const t0 = clock; const end = +(t0 + len - 0.3).toFixed(2); SCENES.push(build((s) => +(t0 + s).toFixed(2), end)); clock += len; };

// handwritten title, two lines chosen here
const title = (at, end, l1, l2) => el('title', at(0.1), end, 'up', lines(l2 ? [l1, l2] : [l1]));
// the phone, playing a real clip from the moment it lands (its frame is seeked to t - start)
const phone = (at, end, id, a = 'rise', tin = 0.3) => el('phone', at(tin), end, a,
  `<video muted playsinline preload="auto" data-start="${at(tin + 0.2)}" src="${clip(id)}"></video>`, 'left:125px', 'data-float="3"');
// a pop-up window, like a phone notification
const pop = (tin, tout, head, ls, style, icon = 'flower') => el('pop', tin, tout, 'drop',
  `<img src="${BASE}/brand-icons/icon-${icon}.png"><div class="pb"><div class="ph"><b>${head}</b><span>עכשיו</span></div>${lines(ls)}</div>`, style, 'data-float="3"');
const bubble = (cls, ls, tin, tout, style, a = 'pop', fl = 4) => el(`bub ${cls}`, tin, tout, a, lines(ls), style, `data-float="${fl}"`);
const wa = (kicker, ls, tin, tout, style, extra = '') => el('bub wa', tin, tout, 'pop', `<div class="k">${kicker}</div>${lines(ls)}${extra}`, style, 'data-float="4"');
const note = (text, tin, tout) => el('note', tin, tout, 'fade', text, 'left:0;right:0;top:905px;text-align:center');
const reel = (x, left, top, rot, tin, tout) => el('thumb', tin, tout, 'fly', '',
  `left:${left}px;top:${top}px;background-image:url(${REELS});background-size:${430 * 2.3}px ${764 * 2.3}px;background-position:-${x * 2.3}px -${600 * 2.3}px`, `data-rot="${rot}" data-float="5"`);
const petals = (cx, cy, tin, n = 10) => Array.from({ length: n }, (_, i) => {
  const ang = (i / n) * Math.PI * 2, d = 120 + (i % 3) * 45;
  return `<img class="el petal" src="${BASE}/flower-pink-solid.png" data-in="${tin}" data-out="${+(tin + 1.4).toFixed(2)}" data-a="burst" data-dx="${Math.round(Math.cos(ang) * d)}" data-dy="${Math.round(Math.sin(ang) * d)}" style="left:${cx}px;top:${cy}px">`;
}).join('');

// ── 3. the scenes ──────────────────────────────────────────────────────────────────────────────────
// 1. surprise opening: a plain diary gets crossed out and falls away, Kalmea blooms
scene(4.6, (at, end) => `
  ${el('plain', at(0.15), at(1.75), 'pop', `<div class="pl-h">יומן רגיל</div><div class="pl-g">${'<i></i>'.repeat(12)}</div>`, '', 'data-fall="1"')}
  ${el('strike', at(1.0), at(1.75), 'wipe', '')}
  <img class="el" src="${BASE}/flower-full.png" data-in="${at(1.85)}" data-out="${end}" data-a="spin" style="left:200px;top:170px;width:140px">
  ${el('title big', at(2.2), end, 'up', lines(['זו לא עוד מערכת', 'לקביעת תורים']), 'top:350px')}
  ${petals(255, 250, at(1.9))}`);

// 2. why not a regular system: everything else bursts out of the logo
const CHIPS = [['יועצת עסקית AI', 40, 250], ['סורק עור שהופך לליד', 270, 300], ['רילס בהתאמה אישית', 30, 380], ['סליקה', 330, 420],
  ['דמי ביטול', 60, 500], ['הודעות אוטומטיות', 270, 540], ['מילוי תורים שבוטלו', 40, 630], ['מחר שלך, כל ערב', 290, 680]];
scene(6.4, (at, end) => `
  ${title(at, end, 'מה יש פה', 'שאין במערכת רגילה?')}
  <img class="el" src="${BASE}/flower-full.png" data-in="${at(0.3)}" data-out="${end}" data-a="pop" data-float="4" style="left:225px;top:470px;width:90px">
  ${CHIPS.map(([t, x, y], i) => el('chip', at(0.9 + i * 0.42), end, 'burst-in', t, `left:${x}px;top:${y}px`, `data-dx="${255 - x - 80}" data-dy="${500 - y}" data-float="4"`)).join('')}`);

scene(6.0, (at, end) => `
  ${title(at, end, 'הלקוחות קובעות לבד,', 'גם באמצע הלילה')}
  ${phone(at, end, 'book')}
  ${pop(at(3.0), end, 'תור חדש נקבע!', ['ליה דהן · ניקוי פנים עמוק', `מחר ב-${ltr('11:00')}`], 'top:250px')}`);

scene(6.0, (at, end) => `
  ${title(at, end, 'סליקה בלי לצאת', 'מהמערכת')}
  ${phone(at, end, 'payments', 'right')}
  ${pop(at(1.8), end, 'התקבל תשלום', [`${ltr('₪380')} באשראי · גלית אדרי`], 'top:250px', 'wallet')}
  ${pop(at(3.4), end, 'מקדמה נגבתה', [`${ltr('₪100')} בקביעת התור · שירה מ.`], 'top:350px', 'wallet')}`);

scene(5.6, (at, end) => `
  ${title(at, end, 'ביטול ברגע האחרון?', 'יש דמי ביטול')}
  ${el('slot off', at(0.4), at(2.7), 'pop', `<div class="h">ביטול פחות משעתיים לפני</div><div class="s">מיקרונידלינג · ${ltr('16:15')}</div>`)}
  ${el('slot paid', at(2.6), end, 'pop', `<div class="h">דמי ביטול נגבו ✓</div><div class="s">לפי מדיניות הביטול שלך · ${ltr('₪100')}</div>`)}
  ${bubble('ai', ['הלקוחה אישרה את המדיניות', 'כבר כשקבעה את התור'], at(3.4), end, 'left:0;right:0;margin:auto;width:max-content;top:600px')}`);

scene(6.4, (at, end) => `
  ${title(at, end, 'תזכורות ואישורים,', 'אוטומטית בוואטסאפ')}
  ${phone(at, end, 'messages', 'left')}
  ${wa('תזכורת ללקוחה · יום לפני', ['היי ליה,', 'תזכורת לתור שלך בקליניקה מחר.'], at(1.8), end, 'right:24px;top:250px', `<div class="btns"><span>לאישור</span><span>לשינוי</span></div>`)}
  ${pop(at(3.8), end, 'ליה אישרה הגעה ✓', ['ניקוי פנים עמוק · מחר'], 'top:690px')}`);

scene(5.4, (at, end) => `
  ${title(at, end, 'ובערב: מחר שלך,', 'בעשר שניות')}
  ${phone(at, end, 'home')}
  ${wa('מחר שלך · אלייך, בערב', ['מחר: שש לקוחות.', `הראשונה ב-${ltr('09:00')}, אור סבג.`, `והיום נגמר ב-${ltr('18:15')}.`, '', 'לילה טוב.'], at(1.6), end, 'left:24px;top:300px')}`);

scene(6.2, (at, end) => `
  ${title(at, end, 'יועצת עסקית AI', 'שמכירה את המספרים שלך')}
  ${phone(at, end, 'advisor')}
  ${bubble('ai', [`החודש נוספו ${ltr('17')} לקוחות חדשות,`, 'ו-3 תורים נקבעו לבד דרך הקישור'], at(3.6), end, 'left:20px;top:330px', 'pop', 5)}
  ${note('דוגמה מחשבון דמו', at(3.9), end)}`);

scene(6.2, (at, end) => `
  ${title(at, end, 'רילס ופוסטים', 'בצבעים ובלוגו שלך')}
  ${phone(at, end, 'content', 'right')}
  ${reel(30, 18, 300, -9, at(2.2), end)}
  ${reel(222, 400, 330, 8, at(2.7), end)}
  ${reel(91, 26, 640, 6, at(3.2), end)}
  ${reel(344, 392, 660, -7, at(3.7), end)}`);

scene(6.2, (at, end) => `
  ${title(at, end, 'סורק עור AI', 'שהופך לליד')}
  ${phone(at, end, 'scan', 'left')}
  ${pop(at(3.4), end, 'ליד חדש!', ['מקור: סורק העור', 'נכנס לכרטיס הלקוחה'], 'top:250px', 'sparkle')}`);

scene(5.4, (at, end) => `
  ${title(at, end, 'תור התבטל?', 'קלמיה עוזרת למלא אותו')}
  ${el('slot off', at(0.4), at(3.0), 'pop', `<div class="h">התור התבטל</div><div class="s">מיקרונידלינג · ${ltr('16:15')}</div>`)}
  ${el('av', at(1.3), at(3.1), 'fly', 'נ', 'left:30px;top:600px')}
  ${el('av', at(1.6), at(3.1), 'fly', 'ש', 'left:240px;top:640px')}
  ${el('av', at(1.9), at(3.1), 'fly', 'ד', 'left:450px;top:600px')}
  ${bubble('tag', ['הצעה ללקוחות מהרשימה, באישור שלך'], at(1.4), end, 'left:0;right:0;margin:auto;width:max-content;top:740px')}
  ${el('slot on', at(3.0), end, 'pop', `<div class="h">התור התמלא ✓</div><div class="s">מי שלחצה ראשונה, קיבלה</div>`)}
  ${petals(255, 450, at(3.1))}`);

scene(4.8, (at, end) => `
  ${title(at, end, 'כרטיס לכל לקוחה,', 'כל הסיפור שלה')}
  ${phone(at, end, 'card')}`);

scene(5.4, (at) => `
  ${el('end-photo', at(0.1), 999, 'pop', `<img src="${BASE}/defaults/presenters/skin-presenter-1.jpg">`)}
  ${el('ailabel', at(0.6), 999, 'fade', 'דמות AI להמחשה')}
  ${el('title big', at(0.6), 999, 'up', lines(['שאלה? אנחנו כאן', 'בוואטסאפ']), 'top:490px')}
  ${el('phoneno', at(1.4), 999, 'up', `<div class="ltr">050-7321978</div>`)}
  <img class="el" src="${BASE}/kalmea-wordmark.png" data-in="${at(2.0)}" data-out="999" data-a="pop" style="left:180px;top:745px;width:180px">
  ${petals(270, 300, at(0.4), 12)}`);

const SECONDS = +clock.toFixed(2);

const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>
@font-face{font-family:KG;src:url(${GVERET}) format('woff2')}
@font-face{font-family:KF;src:url(${BASE}/design-fonts/FrankRuhlLibre-700.ttf);font-weight:700}
@font-face{font-family:KA;src:url(${BASE}/design-fonts/Assistant-600.ttf);font-weight:600}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:${BRAND.cream}}
#stage{position:absolute;inset:0;overflow:hidden}
.blob{position:absolute;border-radius:50%;filter:blur(2px)}
.el{position:absolute;opacity:0;will-change:transform,opacity}
.title{left:18px;right:18px;top:64px;text-align:center;font:48px/1.12 KG,serif;color:${BRAND.deep}}
.title.big{font-size:62px}
.phone{top:300px;width:290px;height:515px;border-radius:34px;overflow:hidden;background:#fff;border:7px solid ${BRAND.deep};box-shadow:0 30px 60px -24px rgba(31,58,48,.45)}
.phone video{width:100%;height:100%;object-fit:cover;object-position:top;display:block}
.pop{left:30px;right:30px;display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.97);border-radius:22px;padding:12px 16px;box-shadow:0 24px 44px -16px rgba(31,58,48,.5);border:1px solid rgba(31,58,48,.08)}
.pop img{width:44px;height:44px;border-radius:12px;background:${BRAND.palePetal};padding:4px;box-sizing:border-box}
.pop .pb{flex:1;font:600 18px/1.35 KA;color:#3B4842}
.pop .ph{display:flex;justify-content:space-between;align-items:baseline}.pop .ph b{font:700 20px KF;color:${BRAND.deep}}.pop .ph span{font:600 13px KA;color:#8A948F}
.bub{max-width:380px;padding:12px 18px;border-radius:22px;font:600 20px/1.35 KA,sans-serif;box-shadow:0 14px 30px -14px rgba(31,58,48,.38);white-space:nowrap}
.bub div:empty{height:10px}
.ai{background:#FFFDF8;color:${BRAND.deep};border:2px solid ${BRAND.petal};border-bottom-right-radius:6px}
.tag{background:${BRAND.petal};color:${BRAND.deep};font:700 19px KA;border-radius:999px}
.wa{background:#FFFFFF;color:#26332D;border-right:5px solid #25D366;border-radius:16px}
.wa .k{font:700 14px KA;color:#25A55A;margin-bottom:4px}
.btns{display:flex;gap:8px;margin-top:12px}.btns span{flex:1;text-align:center;font:700 17px KA;color:#1B7F4B;background:#EAF7EF;border-radius:10px;padding:7px 10px}
.note{font:600 14px KA;color:#6B756F}
.chip{padding:10px 18px;border-radius:999px;background:#fff;border:2px solid ${BRAND.petal};font:700 20px KA;color:${BRAND.deep};white-space:nowrap;box-shadow:0 12px 26px -12px rgba(31,58,48,.4)}
.chip:nth-child(odd){background:${BRAND.deep};color:${BRAND.cream};border-color:${BRAND.deep}}
.plain{left:110px;right:110px;top:330px;background:#F1F1EF;border:2px solid #D9D9D4;border-radius:18px;padding:16px;filter:grayscale(1)}
.pl-h{font:700 24px KA;color:#8C8C88;text-align:center;margin-bottom:12px}
.pl-g{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.pl-g i{height:34px;border-radius:6px;background:#E2E2DE}
.strike{left:90px;right:90px;top:430px;height:8px;border-radius:4px;background:#D85A5A;transform-origin:right center}
.thumb{width:${55 * 2.3}px;height:${100 * 2.3}px;border-radius:14px;box-shadow:0 18px 34px -16px rgba(31,58,48,.5);border:3px solid #fff}
.slot{left:60px;right:60px;top:360px;height:150px;border-radius:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;box-shadow:0 24px 44px -20px rgba(31,58,48,.45)}
.slot .h{font:700 28px KF}.slot .s{font:600 20px KA}
.off{background:#fff;border:3px dashed #D88A8A;color:#B4545A}
.on,.paid{background:${BRAND.sage};border:3px solid ${BRAND.deep};color:${BRAND.deep}}
.av{width:58px;height:58px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:700 22px KF;color:${BRAND.deep};background:${BRAND.palePetal};border:3px solid #fff;box-shadow:0 10px 20px -8px rgba(31,58,48,.4)}
.petal{width:30px;height:30px}
.ltr{direction:ltr;unicode-bidi:isolate}
.end-photo{left:120px;top:140px;width:300px;height:300px;border-radius:50%;overflow:hidden;border:8px solid #fff;box-shadow:0 26px 50px -20px rgba(31,58,48,.5)}
.end-photo img{width:100%;height:100%;object-fit:cover;object-position:50% 18%}
.ailabel{font:600 13px KA;color:${BRAND.deep};background:#fff;padding:4px 10px;border-radius:10px;left:200px;top:430px}
.phoneno{left:0;right:0;top:665px;text-align:center;font:700 32px KA;color:#4F5F58}
</style></head><body><div id="stage">
<div class="blob" id="b1" style="width:420px;height:420px;background:${BRAND.palePetal};left:-140px;top:-100px"></div>
<div class="blob" id="b2" style="width:360px;height:360px;background:${BRAND.sage}88;right:-130px;bottom:-90px"></div>
<img src="${BASE}/flower-full.png" style="position:absolute;left:-60px;bottom:-50px;width:240px;opacity:.07">
${SCENES.join('\n')}
</div><script>
const clamp = (x) => Math.max(0, Math.min(1, x));
const out3 = (x) => 1 - Math.pow(1 - clamp(x), 3);
const inOut = (x) => { x = clamp(x); return x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
const back = (x) => { x = clamp(x); const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const els = [...document.querySelectorAll('.el')].map((e, i) => ({ e, i, tin: +e.dataset.in, tout: +e.dataset.out, a: e.dataset.a, fl: +(e.dataset.float || 0), rot: +(e.dataset.rot || 0), dx: +(e.dataset.dx || 0), dy: +(e.dataset.dy || 0), fall: !!e.dataset.fall, v: e.querySelector('video') }));
window.__t = async (t) => {
  document.getElementById('b1').style.transform = 'translate(' + Math.sin(t * .4) * 30 + 'px,' + Math.cos(t * .3) * 24 + 'px)';
  document.getElementById('b2').style.transform = 'translate(' + Math.cos(t * .35) * 28 + 'px,' + Math.sin(t * .45) * 22 + 'px)';
  const seeks = [];
  for (const o of els) {
    const k = (t - o.tin) / .55, p = out3(k), q = inOut((t - o.tout) / .4);
    let op = clamp(k * 2) * (1 - q), tr = '';
    const fl = o.fl ? ' translateY(' + (Math.sin(t * 1.7 + o.i) * o.fl).toFixed(2) + 'px)' : '';
    switch (o.a) {
      case 'pop': tr = 'scale(' + (.3 + .7 * back(k)) + ')'; break;
      case 'up': tr = 'translateY(' + (1 - p) * 36 + 'px)'; break;
      case 'rise': tr = 'translateY(' + (1 - out3((t - o.tin) / .8)) * 700 + 'px)'; break;
      case 'left': tr = 'translateX(' + -(1 - p) * 600 + 'px) rotate(' + -(1 - p) * 8 + 'deg)'; break;
      case 'right': tr = 'translateX(' + (1 - p) * 600 + 'px) rotate(' + (1 - p) * 8 + 'deg)'; break;
      case 'drop': tr = 'translateY(' + -(1 - back(k)) * 220 + 'px) rotate(' + Math.sin(clamp((t - o.tin - .5) / .6) * Math.PI * 4) * 2 * (1 - clamp((t - o.tin - .5) / .6)) + 'deg)'; break;
      case 'spin': tr = 'scale(' + (.3 + .7 * back(k)) + ') rotate(' + (1 - p) * -120 + 'deg)'; break;
      case 'wipe': tr = 'scaleX(' + out3((t - o.tin) / .35) + ') rotate(-8deg)'; op = clamp(k * 6) * (1 - q); break;
      case 'fly': tr = 'translate(' + (1 - p) * (o.i % 2 ? 260 : -260) + 'px,' + (1 - p) * 180 + 'px) rotate(' + (o.rot + (1 - p) * 30) + 'deg) scale(' + (.5 + .5 * back(k)) + ')'; break;
      case 'burst-in': tr = 'translate(' + o.dx * (1 - back(k)) + 'px,' + o.dy * (1 - back(k)) + 'px) scale(' + (.2 + .8 * back(k)) + ')'; break;
      case 'burst': { const b = out3((t - o.tin) / 1.1); tr = 'translate(' + o.dx * b + 'px,' + o.dy * b + 'px) rotate(' + b * 220 + 'deg) scale(' + (1 - b * .4) + ')'; op = clamp(k * 3) * (1 - clamp((t - o.tin - .6) / .8)); break; }
      default: tr = '';
    }
    // the plain diary shakes, then falls away instead of fading
    if (o.fall) { const s = clamp((t - o.tin - .7) / .5), f = clamp((t - o.tout + .1) / .5); tr += ' rotate(' + (Math.sin(s * Math.PI * 6) * 4 * (1 - s) + f * 25) + 'deg) translateY(' + f * f * 700 + 'px)'; op = clamp(k * 2) * (1 - clamp((t - o.tout - .3) / .3)); }
    o.e.style.opacity = op.toFixed(3);
    o.e.style.transform = tr + fl;
    if (o.v && op > 0) {
      const want = Math.max(0, Math.min((o.v.duration || 0) - .05, t - +o.v.dataset.start));
      if (Math.abs(o.v.currentTime - want) > .001) seeks.push(new Promise((r) => { o.v.addEventListener('seeked', r, { once: true }); o.v.currentTime = want; }));
    }
  }
  await Promise.all(seeks);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
};
</script></body></html>`;

// ── 4. render ──────────────────────────────────────────────────────────────────────────────────────
const browser = await openBrowser();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, locale: 'he-IL' });
const page = await ctx.newPage();
await page.setContent(html, { waitUntil: 'networkidle', timeout: 120000 });
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
await page.evaluate(() => Promise.all([...document.querySelectorAll('video')].map((v) => (v.readyState >= 2 ? 0 : new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error('a clip did not load')); })))));
const fontOk = await page.evaluate(() => document.fonts.check('48px KG'));
if (!fontOk) throw new Error('Gveret Levin did not load');
const broken = await page.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.src.slice(0, 80)));
if (broken.length) throw new Error(`images did not load: ${broken.join(', ')}`);
// nothing may run off the side of the frame (a long line would be cut on a phone)
const wide = await page.evaluate(() => [...document.querySelectorAll('.bub,.chip,.title,.pop,.slot')].map((e) => { const r = e.getBoundingClientRect(); return { t: e.innerText.slice(0, 30), l: r.left, r: r.right }; }).filter((x) => x.l < 4 || x.r > 536));
if (wide.length) throw new Error(`runs off the frame: ${wide.map((x) => `"${x.t}" ${Math.round(x.l)}-${Math.round(x.r)}`).join('; ')}`);

if (stillAt) {
  await page.evaluate((t) => window.__t(t), +stillAt);
  const f = path.join(DIR, 'frame.png');
  await page.screenshot({ path: f });
  log(`still at t=${stillAt}s of ${SECONDS}s -> ${f}`);
  await browser.close();
  process.exit(0);
}

if (!fs.existsSync(MUSIC)) throw new Error(`missing the music file ${MUSIC} (see the header for where it comes from)`);
const outFile = path.join(DIR, 'kalmea-welcome-motion.mp4');
const fadeOut = (SECONDS - 2.2).toFixed(2);
const enc = spawn(ffmpeg, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-i', MUSIC,
  '-map', '0:v', '-map', '1:a', '-vf', 'scale=720:1280:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-profile:v', 'main', '-level', '3.1',
  '-preset', 'slow', '-crf', '21', '-r', String(FPS),
  '-af', `afade=t=in:st=0:d=0.6,afade=t=out:st=${fadeOut}:d=2.2,volume=0.85`, '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
  '-t', String(SECONDS), '-movflags', '+faststart', outFile], { stdio: ['pipe', 'ignore', 'pipe'] });
let encErr = ''; enc.stderr.on('data', (d) => { encErr += d; });
const done = new Promise((res) => enc.on('close', res));
const N = Math.round(FPS * SECONDS);
for (let i = 0; i < N; i++) {
  await page.evaluate((t) => window.__t(t), i / FPS);
  const png = await page.screenshot({ type: 'png' });
  if (!enc.stdin.write(png)) await new Promise((r) => enc.stdin.once('drain', r));
  if (i % 300 === 0) log(`frame ${i}/${N}`);
}
enc.stdin.end();
const code = await done;
await browser.close();
if (code !== 0) { console.error(encErr.slice(-800)); process.exit(1); }
log(`${N} frames, ${SECONDS} s -> ${outFile} (${(fs.statSync(outFile).size / 1048576).toFixed(1)} MB)`);
