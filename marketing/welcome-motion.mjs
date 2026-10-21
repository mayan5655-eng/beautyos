// marketing/welcome-motion.mjs
//
// The welcome video sent after signup (kalmea.app/tutorials, first video): short, light, playful. Not a screen walkthrough:
// what makes Kalmea different pops and floats in over real screens of the demo tenant.
//
//   node welcome-motion.mjs --shots        capture the real screens first (demo tenant, AI routes blocked) -> out/motion/shots/
//   node welcome-motion.mjs                render -> out/motion/kalmea-welcome-motion.mp4 (720x1280, 30 fps, H.264 + AAC silence)
//   node welcome-motion.mjs --frame=12.5   one still at t = 12.5 s -> out/motion/frame.png (for checking)
//
// Built like cost-animation.mjs: the page has no running animation, every element is a pure function of the clock t, and
// the script steps t one frame at a time and screenshots it. Same result on every run, no dropped frames. Scenes are listed
// with their own length and every time inside a scene is relative to its start, so a scene can be added or dropped freely.
//
// Honesty rules (the product's, not this video's invention):
//  - Only what is ON in production is shown as a feature (checked 2026-10-21). Online payments (Grow) is not live yet: its
//    scene says "בקרוב". The evening "מחר שלך" message is opt-in: its scene says she can turn it on. Not shown at all: content
//    plan, auto-publish, the WhatsApp AI bot, Facebook lead ads.
//  - Reminders say "יום לפני התור", not "automatically": automatic sending needs the central WhatsApp number switched on
//    (platform_settings.whatsapp_auto_utility_enabled); until then they wait in her queue for one tap.
//  - The advisor answer and the goal-free numbers are illustrations from the demo tenant's own home screen (17 new clients,
//    3 self-booked), marked "דוגמה מחשבון דמו". No AI call is made to get them. Message bubbles reuse the product's wording
//    (lib/reminders/dailyReminders.js, lib/eveningSummary.js) with demo names.
//  - Gap-fill says "with your OK": the offer goes out only when she says yes.
//  - The face at the end is the product's AI presenter, with the same "דמות AI להמחשה" label the templates carry.
//  - Hebrew: every line is its own element with the break chosen here; a digit never starts a line; times and the phone
//    number are isolated (dir=ltr spans).

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { BASE, BRAND, OUT, DEMO_TENANT, AI_ROUTES, openBrowser, log, pause } from './lib.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ffmpeg = require('ffmpeg-static');

const FPS = 30, W = 540, H = 960, DPR = 720 / 540;
const DIR = path.join(OUT, 'motion'), SHOTS = path.join(DIR, 'shots');
const stillAt = process.argv.find((a) => a.startsWith('--frame='))?.split('=')[1];
fs.mkdirSync(SHOTS, { recursive: true });

// ── 1. the real screens (demo tenant only; any non-GET to an AI route is aborted) ───────────────────
if (process.argv.includes('--shots')) {
  const browser = await openBrowser();
  const phone = async (owner) => {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 764 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'he-IL' });
    await ctx.route('**/*', (r) => (r.request().method() !== 'GET' && AI_ROUTES.test(new URL(r.request().url()).pathname))
      ? (console.error(`[motion] blocked an AI call: ${r.request().url()}`), r.abort()) : r.continue());
    if (owner) await ctx.request.get(`${BASE}/demo/cosmetics`, { maxRedirects: 0 });
    const p = await ctx.newPage();
    // the demo banner (a sign-up prompt) and the two floating helpers are hidden, as in lib.mjs
    await p.addInitScript(() => setInterval(() => {
      for (const d of document.querySelectorAll('div')) { const t = d.innerText || ''; if (t.length < 120 && t.includes('זו תצוגת דמו') && t.includes('התחילי בחינם')) d.style.display = 'none'; }
      for (const b of document.querySelectorAll('button')) if ((b.innerText || '').trim() === 'תקועה?' || /^שליטה קולית/.test(b.getAttribute('aria-label') || '')) b.style.visibility = 'hidden';
    }, 200));
    return p;
  };
  const nav = (p, l) => p.locator('button:visible', { hasText: new RegExp(`${l}$`) }).last();
  const home = async (p) => { await p.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await nav(p, 'יומן').waitFor({ timeout: 20000 }); await pause(1500); };
  const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, `${n}.png`) });
  const p = await phone(true);
  await home(p); await nav(p, 'עוד').tap(); await pause(800);
  await p.locator('button:visible', { hasText: /יועץ AI/ }).first().tap(); await p.getByText('יועץ עסקי AI').first().waitFor({ timeout: 10000 }); await pause(1500);
  await shot(p, 'advisor');
  await home(p); await nav(p, 'תוכן').tap(); await p.getByText('מה מפרסמים השבוע').first().waitFor({ timeout: 15000 }); await pause(2500);
  await shot(p, 'content-week');
  await p.locator('button:visible', { hasText: /^תבניות/ }).first().tap(); await pause(1500);
  await p.getByText(/רצף מוכן של/).first().evaluate((el) => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -160); }); await pause(2500); // the reels row
  await shot(p, 'reels');
  await home(p); await nav(p, 'לקוחות').tap(); await pause(1000);
  await p.getByText('ליה דהן', { exact: true }).filter({ visible: true }).first().tap(); await pause(1500);
  await p.locator('button:visible', { hasText: /^היסטוריה/ }).first().tap(); await pause(1200);
  await shot(p, 'client-card');
  const q = await phone(false);
  await q.goto(`${BASE}/skin-scan?t=${DEMO_TENANT}`, { waitUntil: 'networkidle' }); await q.getByText(/הכירי את העור שלך/).first().waitFor({ timeout: 15000 }); await pause(1200);
  await shot(q, 'skin-scan');
  await q.goto(`${BASE}/book?t=${DEMO_TENANT}`, { waitUntil: 'networkidle' }); await q.locator('#bk-services').waitFor({ timeout: 15000 });
  await q.locator('#bk-services').evaluate((el) => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -20); }); await pause(1500);
  await shot(q, 'book');
  await browser.close();
  log(`screens -> ${SHOTS}`);
  process.exit(0);
}

const img = (n) => {
  const f = path.join(SHOTS, `${n}.png`);
  if (!fs.existsSync(f)) throw new Error(`missing ${f}: run  node welcome-motion.mjs --shots  first`);
  return `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
};
const S = { advisor: img('advisor'), week: img('content-week'), reels: img('reels'), scan: img('skin-scan'), card: img('client-card'), book: img('book') };

// ── 2. building blocks. Times are relative to the scene start (s); `end` is the scene's own length ──────
// data-in / data-out (absolute s), data-a (how it enters), data-float (px of idle bobbing), data-rot (deg)
const el = (cls, tin, tout, a, inner, style = '', extra = '') => `<div class="el ${cls}" data-in="${tin}" data-out="${tout}" data-a="${a}" ${extra} style="${style}">${inner}</div>`;
const lines = (ls) => ls.map((l) => `<div>${l}</div>`).join('');
const ltr = (s) => `<span class="ltr">${s}</span>`;

const SCENES = [];
let clock = 0;
const scene = (len, build) => { const t0 = clock; const end = t0 + len - 0.3; SCENES.push(build((s) => +(t0 + s).toFixed(2), end)); clock += len; };

const title = (at, end, l1, l2) => el('title', at(0.1), end, 'up', lines(l2 ? [l1, l2] : [l1]));
const phone = (at, end, src, a, tin = 0.4) => el('phone', at(tin), end, a, `<img src="${src}">`, 'left:120px', 'data-float="3"');
const bubble = (cls, ls, tin, tout, style, a = 'pop', fl = 4) => el(`bub ${cls}`, tin, tout, a, lines(ls), style, `data-float="${fl}"`);
const wa = (kicker, ls, tin, tout, style, extra = '') => el('bub wa', tin, tout, 'up', `<div class="k">${kicker}</div>${lines(ls)}${extra}`, style, 'data-float="4"');
const tag = (text, tin, tout, top) => el('tag', tin, tout, 'pop', text, `left:0;right:0;margin:auto;width:max-content;top:${top}px`, 'data-float="3"');
const note = (text, tin, tout) => el('note', tin, tout, 'fade', text, 'left:0;right:0;top:890px;text-align:center');
// a reel thumbnail cut out of the templates screen (CSS px of the 430x764 screenshot)
const reel = (x, y, left, top, rot, tin, tout) => el('thumb', tin, tout, 'fly', '',
  `left:${left}px;top:${top}px;background-image:url(${S.reels});background-size:${430 * 2.3}px ${764 * 2.3}px;background-position:-${x * 2.3}px -${y * 2.3}px`, `data-rot="${rot}" data-float="5"`);
const petals = (cx, cy, tin, n = 9) => Array.from({ length: n }, (_, i) => {
  const ang = (i / n) * Math.PI * 2, d = 120 + (i % 3) * 40;
  return `<img class="el petal" src="${BASE}/flower-pink-solid.png" data-in="${tin}" data-out="${tin + 1.4}" data-a="burst" data-dx="${Math.round(Math.cos(ang) * d)}" data-dy="${Math.round(Math.sin(ang) * d)}" style="left:${cx}px;top:${cy}px">`;
}).join('');

// ── 3. the scenes ────────────────────────────────────────────────────────────────────────────────
scene(3.8, (at, end) => `
  <img class="el" src="${BASE}/flower-full.png" data-in="${at(0.2)}" data-out="${end}" data-a="spin" style="left:200px;top:180px;width:140px">
  ${el('title', at(0.7), end, 'up', lines(['זו לא עוד מערכת', 'לקביעת תורים']), 'top:360px;font-size:50px')}
  <img class="el" src="${BASE}/kalmea-wordmark.png" data-in="${at(2.0)}" data-out="${end}" data-a="pop" style="left:150px;top:540px;width:240px">`);

scene(5.4, (at, end) => `
  ${title(at, end, 'הלקוחות קובעות לבד,', 'מסביב לשעון')}
  ${phone(at, end, S.book, 'rise')}
  ${bubble('ai', ['גם באמצע הלילה'], at(1.4), end, 'right:30px;top:470px')}
  ${bubble('me', ['רק בשעות שפנויות לך'], at(2.4), end, 'left:30px;top:600px')}`);

scene(5.6, (at, end) => `
  ${title(at, end, 'תזכורת בוואטסאפ', 'יום לפני התור')}
  ${wa('תזכורת ללקוחה', ['היי ליה,', 'תזכורת לתור שלך בקליניקה מחר.', '', 'ניקוי פנים עמוק · שעה ורבע'], at(0.7), end, 'right:40px;top:280px',
    `<div class="btns"><span>לאישור</span><span>לשינוי</span></div>`)}
  ${bubble('ai', ['הלקוחה מאשרת בלחיצה,', 'ואת רואה את זה ביומן'], at(2.4), end, 'left:30px;top:560px')}`);

scene(5.6, (at, end) => `
  ${title(at, end, 'ובערב: מחר שלך', 'בעשר שניות')}
  ${wa('מחר שלך · אלייך, בערב', ['מחר: שש לקוחות.', `הראשונה ב-${ltr('09:00')}, אור סבג.`, `והיום נגמר ב-${ltr('18:15')}.`, 'עוד לא אישרו: שני ודנה.', '', 'לילה טוב.'], at(0.7), end, 'right:50px;top:280px')}
  ${tag('אפשר להפעיל בהגדרות', at(2.2), end, 700)}`);

scene(6.0, (at, end) => `
  ${title(at, end, 'יועצת עסקית AI', 'שמכירה את המספרים שלך')}
  ${phone(at, end, S.advisor, 'rise')}
  ${bubble('me', ['איך היה החודש שלי?'], at(1.3), end, 'right:40px;top:470px')}
  ${bubble('ai', [`החודש נוספו ${ltr('17')} לקוחות חדשות,`, 'ו-3 תורים נקבעו לבד דרך הקישור'], at(2.6), end, 'left:28px;top:570px', 'pop', 5)}
  ${note('דוגמה מחשבון דמו', at(2.9), end)}`);

scene(6.2, (at, end) => `
  ${title(at, end, 'פוסטים ורילס', 'בצבעים ובלוגו שלך')}
  ${phone(at, end, S.week, 'right')}
  ${reel(30, 600, 22, 300, -9, at(1.4), end)}
  ${reel(222, 600, 400, 330, 8, at(2.0), end)}
  ${reel(91, 600, 30, 640, 6, at(2.6), end)}
  ${reel(344, 600, 395, 660, -7, at(3.2), end)}
  ${tag('מוכן לפרסום, בלחיצה', at(4.0), end, 880)}`);

scene(6.2, (at, end) => `
  ${title(at, end, 'סורק עור AI', 'שהופך לליד')}
  ${phone(at, end, S.scan, 'left')}
  ${bubble('ai', ['הלקוחה מצלמת סלפי'], at(1.4), end, 'right:26px;top:520px')}
  ${bubble('ai', ['ומקבלת שגרת טיפוח', 'והמלצה לטיפול שלך'], at(2.4), end, 'left:22px;top:640px', 'pop', 5)}
  ${el('lead', at(3.7), end, 'drop', `<img src="${BASE}/brand-icons/icon-sparkle.png"><div><div class="t">ליד חדש!</div><div class="s">מקור: סורק העור · נכנס לכרטיס הלקוחה</div></div>`)}`);

scene(5.0, (at, end) => `
  ${title(at, end, 'כרטיס לכל לקוחה', 'כל הטיפולים במקום אחד')}
  ${phone(at, end, S.card, 'rise')}
  ${bubble('ai', ['היסטוריה, הערות ותשלומים'], at(1.5), end, 'right:30px;top:600px')}`);

scene(5.4, (at, end) => `
  ${title(at, end, 'תור התבטל?', 'קלמיה עוזרת למלא אותו')}
  ${el('slot off', at(0.4), at(3.2), 'pop', `<div class="h">התור התבטל</div><div class="s">מיקרונידלינג · ${ltr('16:15')}</div>`)}
  ${el('av', at(1.4), at(3.3), 'fly', 'נ', 'left:30px;top:600px')}
  ${el('av', at(1.7), at(3.3), 'fly', 'ש', 'left:240px;top:640px')}
  ${el('av', at(2.0), at(3.3), 'fly', 'ד', 'left:450px;top:600px')}
  ${tag('הצעה ללקוחות מהרשימה, באישור שלך', at(1.5), end, 740)}
  ${el('slot on', at(3.2), end, 'pop', `<div class="h">התור התמלא ✓</div><div class="s">מי שלחצה ראשונה, קיבלה</div>`)}
  ${petals(255, 450, at(3.3))}`);

scene(5.2, (at, end) => `
  ${title(at, end, 'הודעות חכמות', 'מוכנות בזמן הנכון')}
  ${wa('יום הולדת', ['יום הולדת שמח! מתנה קטנה מחכה לך אצלי'], at(0.6), end, 'right:34px;top:270px')}
  ${wa('אחרי טיפול', ['איך היה? אשמח לביקורת קצרה'], at(1.4), end, 'left:30px;top:400px')}
  ${wa('החזרת לקוחה', ['מתגעגעת! הגיע הזמן לטיפול הבא?'], at(2.2), end, 'right:44px;top:530px')}
  ${wa('חבילה', ['החבילה שלך עומדת להסתיים'], at(3.0), end, 'left:40px;top:660px')}`);

scene(4.6, (at, end) => `
  ${title(at, end, 'ובקרוב:', 'סליקה ותשלום אונליין')}
  ${el('card pay', at(0.6), end, 'pop', `<img src="${BASE}/brand-icons/icon-wallet.png"><div><div class="t">תשלום מאובטח</div><div class="s">מקדמה בקביעת התור, או תשלום בסוף הטיפול</div></div>`, 'top:400px', 'data-float="3"')}`);

scene(5.0, (at) => `
  ${el('end-photo', at(0.1), 999, 'pop', `<img src="${BASE}/defaults/presenters/skin-presenter-1.jpg">`)}
  ${el('ailabel', at(0.6), 999, 'fade', 'דמות AI להמחשה')}
  ${el('title', at(0.6), 999, 'up', lines(['שאלה? אנחנו כאן', 'בוואטסאפ']), 'top:500px;font-size:46px')}
  ${el('title', at(1.4), 999, 'up', `<div class="ltr">050-7321978</div>`, 'top:640px;font:600 30px KA;color:#4F5F58')}
  <img class="el" src="${BASE}/kalmea-wordmark.png" data-in="${at(2.0)}" data-out="999" data-a="pop" style="left:180px;top:740px;width:180px">`);

const SECONDS = clock;

const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>
@font-face{font-family:KF;src:url(${BASE}/design-fonts/FrankRuhlLibre-700.ttf);font-weight:700}
@font-face{font-family:KA;src:url(${BASE}/design-fonts/Assistant-600.ttf);font-weight:600}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:${BRAND.cream}}
#stage{position:absolute;inset:0;overflow:hidden}
.blob{position:absolute;border-radius:50%;filter:blur(2px)}
.el{position:absolute;opacity:0;will-change:transform,opacity}
.title{left:24px;right:24px;top:70px;text-align:center;font:700 40px/1.22 KF,serif;color:${BRAND.deep}}
.phone{top:300px;width:300px;height:533px;border-radius:34px;overflow:hidden;background:#fff;border:7px solid ${BRAND.deep};box-shadow:0 30px 60px -24px rgba(31,58,48,.45)}
.phone img{width:100%;height:100%;object-fit:cover;object-position:top}
.bub{max-width:360px;padding:12px 18px;border-radius:22px;font:600 21px/1.35 KA,sans-serif;box-shadow:0 14px 30px -14px rgba(31,58,48,.38);white-space:nowrap}
.bub div:empty{height:10px}
.me{background:${BRAND.deep};color:${BRAND.cream};border-bottom-left-radius:6px}
.ai{background:#FFFDF8;color:${BRAND.deep};border:2px solid ${BRAND.petal};border-bottom-right-radius:6px}
.tag{background:${BRAND.petal};color:${BRAND.deep};font:700 20px KA;padding:9px 18px;border-radius:999px;box-shadow:0 12px 24px -12px rgba(31,58,48,.35)}
.wa{background:#FFFFFF;color:#26332D;border-right:5px solid #25D366;border-radius:16px}
.wa .k{font:700 14px KA;color:#25A55A;margin-bottom:4px}
.btns{display:flex;gap:8px;margin-top:12px}.btns span{flex:1;text-align:center;font:700 17px KA;color:#1B7F4B;background:#EAF7EF;border-radius:10px;padding:7px 10px}
.note{font:600 14px KA;color:#6B756F}
.thumb{width:${55 * 2.3}px;height:${100 * 2.3}px;border-radius:14px;box-shadow:0 18px 34px -16px rgba(31,58,48,.5);border:3px solid #fff}
.lead{left:40px;right:40px;top:250px;display:flex;align-items:center;gap:14px;background:#fff;border-radius:20px;padding:14px 18px;box-shadow:0 22px 40px -18px rgba(31,58,48,.5);border:2px solid ${BRAND.petal}}
.lead img,.pay img{width:46px;height:46px}
.lead .t,.pay .t{font:700 22px KF;color:${BRAND.deep}}.lead .s,.pay .s{font:600 16px KA;color:#5E6F68}
.slot{left:70px;right:70px;top:380px;height:150px;border-radius:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;box-shadow:0 24px 44px -20px rgba(31,58,48,.45)}
.slot .h{font:700 30px KF}.slot .s{font:600 20px KA}
.off{background:#fff;border:3px dashed #D88A8A;color:#B4545A}
.on{background:${BRAND.sage};border:3px solid ${BRAND.deep};color:${BRAND.deep}}
.av{width:58px;height:58px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:700 22px KF;color:${BRAND.deep};background:${BRAND.palePetal};border:3px solid #fff;box-shadow:0 10px 20px -8px rgba(31,58,48,.4)}
.petal{width:30px;height:30px}
.card{left:40px;right:40px;border-radius:22px;background:#fff;box-shadow:0 22px 40px -18px rgba(31,58,48,.45);overflow:hidden}
.pay{display:flex;align-items:center;gap:14px;padding:22px 20px;border:2px solid ${BRAND.petal}}
.ltr{direction:ltr;unicode-bidi:isolate}
.end-photo{left:120px;top:150px;width:300px;height:300px;border-radius:50%;overflow:hidden;border:8px solid #fff;box-shadow:0 26px 50px -20px rgba(31,58,48,.5)}
.end-photo img{width:100%;height:100%;object-fit:cover;object-position:50% 18%}
.ailabel{font:600 13px KA;color:${BRAND.deep};background:#fff;padding:4px 10px;border-radius:10px;left:200px;top:440px}
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
const els = [...document.querySelectorAll('.el')].map((e, i) => ({ e, i, tin: +e.dataset.in, tout: +e.dataset.out, a: e.dataset.a, fl: +(e.dataset.float || 0), rot: +(e.dataset.rot || 0), dx: +(e.dataset.dx || 0), dy: +(e.dataset.dy || 0) }));
window.__t = (t) => {
  document.getElementById('b1').style.transform = 'translate(' + Math.sin(t * .4) * 30 + 'px,' + Math.cos(t * .3) * 24 + 'px)';
  document.getElementById('b2').style.transform = 'translate(' + Math.cos(t * .35) * 28 + 'px,' + Math.sin(t * .45) * 22 + 'px)';
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
      case 'drop': tr = 'translateY(' + -(1 - back(k)) * 260 + 'px) rotate(' + Math.sin(clamp((t - o.tin - .5) / .6) * Math.PI * 4) * 2 * (1 - clamp((t - o.tin - .5) / .6)) + 'deg)'; break;
      case 'spin': tr = 'scale(' + (.3 + .7 * back(k)) + ') rotate(' + (1 - p) * -120 + 'deg)'; break;
      case 'fly': tr = 'translate(' + (1 - p) * (o.i % 2 ? 260 : -260) + 'px,' + (1 - p) * 180 + 'px) rotate(' + (o.rot + (1 - p) * 30) + 'deg) scale(' + (.5 + .5 * back(k)) + ')'; break;
      case 'burst': { const b = out3((t - o.tin) / 1.1); tr = 'translate(' + o.dx * b + 'px,' + o.dy * b + 'px) rotate(' + b * 220 + 'deg) scale(' + (1 - b * .4) + ')'; op = clamp(k * 3) * (1 - clamp((t - o.tin - .6) / .8)); break; }
      default: tr = '';
    }
    o.e.style.opacity = op.toFixed(3);
    o.e.style.transform = tr + fl;
  }
};
window.__t(0);
</script></body></html>`;

// ── 4. render ────────────────────────────────────────────────────────────────────────────────
const browser = await openBrowser();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, locale: 'he-IL' });
const page = await ctx.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
const broken = await page.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.src.slice(0, 80)));
if (broken.length) throw new Error(`images did not load: ${broken.join(', ')}`);
// nothing may run off the side of the frame (a bubble with a long line would be cut on a phone)
const wide = await page.evaluate(() => [...document.querySelectorAll('.bub,.tag,.title')].map((e) => { const r = e.getBoundingClientRect(); return { t: e.innerText.slice(0, 30), l: r.left, r: r.right }; }).filter((x) => x.l < 4 || x.r > 536));
if (wide.length) throw new Error(`runs off the frame: ${wide.map((x) => `"${x.t}" ${Math.round(x.l)}-${Math.round(x.r)}`).join('; ')}`);

if (stillAt) {
  await page.evaluate((t) => window.__t(t), +stillAt);
  const f = path.join(DIR, 'frame.png');
  await page.screenshot({ path: f });
  log(`still at t=${stillAt}s of ${SECONDS.toFixed(1)}s -> ${f}`);
  await browser.close();
  process.exit(0);
}

const outFile = path.join(DIR, 'kalmea-welcome-motion.mp4');
const enc = spawn(ffmpeg, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
  '-map', '0:v', '-map', '1:a', '-vf', 'scale=720:1280:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-profile:v', 'main', '-level', '3.1',
  '-preset', 'slow', '-crf', '21', '-r', String(FPS), '-c:a', 'aac', '-b:a', '64k', '-shortest', '-movflags', '+faststart', outFile], { stdio: ['pipe', 'ignore', 'pipe'] });
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
log(`${N} frames, ${SECONDS.toFixed(1)} s -> ${outFile} (${(fs.statSync(outFile).size / 1048576).toFixed(1)} MB)`);
