// marketing/promo-motion.mjs
//
// THE PROMO: "everything Kalmea does", for Instagram and the site, with original music cut on its beat.
//
//   node promo-shots.mjs                    first: the real screens (see that file for where each one comes from)
//   node promo-motion.mjs                   all four cuts, into out/promo/
//   node promo-motion.mjs reel|short|wide|podcast
//   node promo-motion.mjs reel --frame=12.5 one still (out/promo/frame-reel-12.5.png)
//   node promo-motion.mjs reel --voice clip.m4a   a voice track over the music: the music ducks under it (sidechain)
//
//   reel     90 s, 9:16 (720x1280)   hook, pain, twelve features, the monthly report, the offer
//   short    30 s, 9:16              the same story, the fastest beats
//   wide     90 s, 16:9 (1280x720)   the reel's timeline, laid out for the site
//   podcast  9:16, about 65 s        the owner's podcast clip (podcast.mp4, not committed: --podcast=<path>, default
//            out/promo/in/podcast.mp4) is the spine; between her on-camera lines the screens that prove them, her voice under them,
//            her words as captions; the music sits 18 dB under her voice and comes up between her lines
//
// Rules, all from this repo's video lessons (kalmea skill section 4) and the owner's standing rules:
//   * Hebrew is drawn by Chromium, one line per element, breaks chosen here; no line starts with a digit; sums, times and the URL
//     sit in an isolated LTR span with the shekel sign glued to the digits. Nothing is rasterised from the app's DOM: the app
//     screens are screenshots, the words on top are ours. Every frame is a pure function of t (no live animation).
//   * Before rendering, every text box is checked against the frame edges and for clipping (scrollWidth > clientWidth).
//   * Only what is live on main: reminders are shown as her one tap from her own WhatsApp (never "automatic"); no waitlist offers
//     (that screen promises an automatic WhatsApp); no voice booking (a per-business flag); card payments through Grow, deposits,
//     paying from a WhatsApp link and the refund on a void are on main and shown.
//   * No em dashes in any copy.
//   * The music is promo-music.mjs: original, generated here, 120 BPM; every cut below lands on its beat grid (0.5 s).

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { BRAND, openBrowser, log } from './lib.mjs';
import { writePromoTrack, BEAT } from './promo-music.mjs';

const require = createRequire(import.meta.url);
const ffmpeg = require('ffmpeg-static');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, '..', 'public');
const PROMO = path.join(HERE, 'out', 'promo');
const SHOTS = path.join(PROMO, 'shots');
const FPS = 30;
const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const MARKS = fs.existsSync(path.join(SHOTS, 'marks.json')) ? JSON.parse(fs.readFileSync(path.join(SHOTS, 'marks.json'), 'utf8')) : {};
const mark = (id, text, fallback) => (MARKS[id] && MARKS[id][text] != null ? MARKS[id][text] : fallback);

/** css height of a screenshot (they are taken at 2x, 430 css px wide) */
function shotHeight(id) {
  const f = path.join(SHOTS, `${id}.png`);
  if (!fs.existsSync(f)) throw new Error(`missing ${f}: run  node promo-shots.mjs  first`);
  const b = fs.readFileSync(f);
  return b.readUInt32BE(20) / 2;
}

// ── layouts ──────────────────────────────────────────────────────────────────────────────────────
const LAYOUTS = {
  portrait: { W: 540, H: 960, out: [720, 1280],
    title: 'left:20px;right:20px;top:58px;text-align:center', titleSize: 46,
    chip: 'left:0;right:0;top:196px;text-align:center',
    phone: { left: 105, top: 238, w: 330, h: 586 },
    pop: (i = 0) => `left:28px;right:28px;top:${742 + i * 92}px`,
    side: (i) => (i % 2 ? `left:26px;top:${300 + i * 70}px` : `right:26px;top:${300 + i * 70}px`),
    region: { left: 34, top: 250, width: 472, height: 520 },
    cap: 'left:16px;right:16px;top:846px', },
  landscape: { W: 960, H: 540, out: [1280, 720],
    title: 'right:36px;width:500px;top:150px;text-align:right', titleSize: 46,
    chip: 'right:44px;width:430px;top:104px;text-align:right',
    phone: { left: 150, top: 36, w: 262, h: 466 },
    pop: (i = 0) => `right:44px;width:430px;top:${300 + i * 96}px`,
    side: (i) => `right:${44 + (i % 2) * 120}px;top:${290 + i * 40}px`,
    region: { left: 60, top: 40, width: 420, height: 460 },
    cap: 'left:40px;right:40px;top:440px', },
};

// ── building blocks (times are absolute seconds) ─────────────────────────────────────────────────
const el = (cls, tin, tout, a, inner, style = '', extra = '') => `<div class="el ${cls}" data-in="${tin}" data-out="${tout}" data-a="${a}" ${extra} style="${style}">${inner}</div>`;
const lines = (ls) => ls.map((l) => `<div>${l}</div>`).join('');
const ltr = (s) => `<span class="ltr">${s}</span>`;
const r2 = (x) => +x.toFixed(2);

function make(L) {
  const P = L.phone, inner = P.w - 14, scale = inner / 430, viewCss = (P.h - 14) / scale;
  const title = (tin, tout, l1, l2, size = L.titleSize) => el('title', tin, tout, 'up', lines(l2 ? [l1, l2] : [l1]), `${L.title};font-size:${size}px`);
  const chip = (tin, tout, text) => el('chipw', tin, tout, 'up', `<span class="chip">${text}</span>`, L.chip);
  /**
   * The phone with one or more screens: [{ id, from, to, at }] (from/to: css px of the screenshot at the top of the phone; `at`:
   * seconds into the phone's time when that screen cuts in). The screen pans from `from` to `to` while it is shown.
   */
  const phone = (tin, tout, screens, a = 'rise', style = '') => {
    const imgs = screens.map((s, i) => {
      const max = Math.max(0, shotHeight(s.id) - viewCss);
      const from = Math.min(max, s.from || 0), to = Math.min(max, s.to ?? from);
      const sIn = r2(tin + (s.at || 0)), sOut = i < screens.length - 1 ? r2(tin + screens[i + 1].at) : tout;
      return `<img class="el scr" src="/shots/${s.id}.png" data-in="${sIn}" data-out="${r2(sOut + 0.25)}" data-a="${i ? 'fade' : 'none'}" data-pan="${r2(-from * scale)},${r2(-to * scale)},${r2(sIn + 0.4)},${r2(sOut - 0.2)}" style="width:${inner}px">`;
    }).join('');
    return el('phone', tin, tout, a, imgs, `left:${P.left}px;top:${P.top}px;width:${P.w}px;height:${P.h}px;${style}`, 'data-float="2"');
  };
  const pop = (tin, tout, head, ls, i = 0, icon = 'flower') => el('pop', tin, tout, 'drop',
    `<img src="/public/brand-icons/icon-${icon}.png"><div class="pb"><div class="ph"><b>${head}</b><span>עכשיו</span></div>${lines(ls)}</div>`, L.pop(i), 'data-float="3"');
  const wa = (tin, tout, kicker, ls, style, mine = false) => el(`bub wa${mine ? ' mine' : ''}`, tin, tout, 'pop', `<div class="k">${kicker}</div>${lines(ls)}`, style, 'data-float="3"');
  const tag = (tin, tout, text, style) => el('bub tag', tin, tout, 'pop', text, style, 'data-float="4"');
  const petals = (cx, cy, tin, n = 12) => Array.from({ length: n }, (_, i) => {
    const ang = (i / n) * Math.PI * 2, d = 120 + (i % 3) * 45;
    return `<img class="el petal" src="/public/flower-pink-solid.png" data-in="${tin}" data-out="${r2(tin + 1.4)}" data-a="burst" data-dx="${Math.round(Math.cos(ang) * d)}" data-dy="${Math.round(Math.sin(ang) * d)}" style="left:${cx}px;top:${cy}px">`;
  }).join('');
  return { P, title, chip, phone, pop, wa, tag, petals };
}

// ── the reel's story ─────────────────────────────────────────────────────────────────────────────
// One feature = one 4.5 s scene (nine beats). chip, two title lines, the screens, and what pops up on top.
function features(B, L) {
  const { title, chip, phone, pop, wa, tag } = B;
  const portrait = L.W < L.H;
  return [
    { key: 'booking', build: (t, e) => `${chip(t, e, 'קביעת תור אונליין')}${title(r2(t + 0.1), e, 'לקוחות קובעות לבד,', 'גם בשתיים בלילה')}
      ${phone(t, e, [{ id: 'book', from: mark('book', 'הטיפולים שלי', 720) - 40, to: mark('book', 'הטיפולים שלי', 720) + 420, at: 0 }, { id: 'buttons', from: 0, at: 2.5 }])}
      ${tag(r2(t + 2.9), e, 'כפתור באינסטגרם', L.side(0))}${tag(r2(t + 3.3), e, 'כפתור בגוגל', L.side(1))}` },
    { key: 'reminders', build: (t, e) => `${chip(t, e, 'תזכורות')}${title(r2(t + 0.1), e, 'תזכורת לכל תור,', 'בנגיעה אחת')}
      ${phone(t, e, [{ id: 'messages', from: 0, at: 0 }])}
      ${wa(r2(t + 1.2), e, 'נשלח מהוואטסאפ שלך', ['שלום נועה, תזכורת לתור', 'שלך בסטודיו רונית מחר.', 'מחכות לראות אותך!'], portrait ? 'left:150px;top:560px' : 'right:44px;top:300px', true)}
      ${pop(r2(t + 2.8), e, 'קלמיה', ['נועה אישרה את התור בקישור,', 'והיומן כבר מעודכן'], portrait ? 1 : 1, 'calendar')}` },
    { key: 'deposit', build: (t, e) => `${chip(t, e, 'מקדמות בכרטיס')}${title(r2(t + 0.1), e, 'מקדמה בכרטיס,', 'כבר בקביעת התור')}
      ${phone(t, e, [{ id: 'pay', from: 0, at: 0 }, { id: 'paid', from: 0, at: 2.6 }])}
      ${pop(r2(t + 3.0), e, 'תשלום התקבל', [`מקדמה של ${ltr('₪100')} דרך Grow`], 0, 'wallet')}` },
    { key: 'grow', build: (t, e) => `${chip(t, e, 'סליקת אשראי דרך Grow')}${title(r2(t + 0.1), e, 'שולחת קישור בוואטסאפ,', 'והיא משלמת בשנייה')}
      ${wa(r2(t + 0.4), r2(t + 2.2), 'נשלח מהוואטסאפ שלך', ['היי נועה 🌸', 'הנה קישור מאובטח לתשלום:', ltr('kalmea.app/pay/…')], portrait ? 'left:70px;top:330px' : 'left:120px;top:150px', true)}
      ${phone(r2(t + 1.9), e, [{ id: 'pay', from: 0, at: 0 }], 'rise')}
      ${pop(r2(t + 3.0), e, 'ביטלת מכירה בקופה?', ['הכסף חוזר לכרטיס שלה, במלואו'], 0, 'wallet')}` },
    { key: 'till', build: (t, e) => `${chip(t, e, 'קופה ומלאי')}${title(r2(t + 0.1), e, 'קופה, מוצרים', 'ומלאי שמתעדכן לבד')}
      ${phone(t, e, [{ id: 'till', from: 0, at: 0 }, { id: 'products', from: 0, at: 2.2 }])}
      ${tag(r2(t + 3.0), e, 'מלאי נמוך? את יודעת מיד', portrait ? 'left:110px;top:780px' : 'right:44px;top:320px')}` },
    { key: 'vouchers', build: (t, e) => `${chip(t, e, 'שוברי מתנה')}${title(r2(t + 0.1), e, 'שובר מתנה', 'שנמכר אונליין')}
      ${phone(t, e, [{ id: 'gift', from: 0, to: 420, at: 0 }, { id: 'voucher', from: 0, at: 2.4 }])}
      ${pop(r2(t + 3.0), e, 'נמכר שובר מתנה', ['טיפול פנים קלאסי, לנועה'], 0, 'heart')}` },
    { key: 'loyalty', build: (t, e) => `${chip(t, e, 'כרטיסיית נאמנות')}${title(r2(t + 0.1), e, 'כרטיסיית ניקובים', 'שמחזירה אותן אלייך')}
      ${phone(t, e, [{ id: 'client', from: 40, to: 60, at: 0 }])}
      ${tag(r2(t + 2.4), e, 'עוד 3 ביקורים למתנה 🎁', portrait ? 'left:120px;top:780px' : 'right:44px;top:320px')}` },
    { key: 'rebook', build: (t, e) => `${chip(t, e, 'התור הבא')}${title(r2(t + 0.1), e, 'התור הבא נקבע', 'עוד לפני שיצאה')}
      ${phone(t, e, [{ id: 'calendar', from: 0, at: 0 }, { id: 'rebook', from: 0, at: 1.6 }])}
      ${tag(r2(t + 2.8), e, 'קבעי לה שוב, בנגיעה', portrait ? 'left:130px;top:780px' : 'right:44px;top:320px')}` },
    { key: 'reviews', build: (t, e) => `${chip(t, e, 'ביקורות בגוגל')}${title(r2(t + 0.1), e, 'ביקורות בגוגל,', 'בשני צעדים')}
      ${phone(t, e, [{ id: 'review', from: 120, at: 0 }])}
      ${tag(r2(t + 2.2), e, '★★★★★', portrait ? 'left:180px;top:785px' : 'right:44px;top:320px')}` },
    { key: 'forms', build: (t, e) => `${chip(t, e, 'בלי ניירת')}${title(r2(t + 0.1), e, 'הצהרת בריאות', 'וסריקת עור')}
      ${phone(t, e, [{ id: 'form', from: 0, to: 520, at: 0 }, { id: 'scan', from: 0, at: 2.3 }])}
      ${tag(r2(t + 1.2), e, 'נחתמת מהטלפון שלה', portrait ? 'left:120px;top:785px' : 'right:44px;top:320px')}` },
    { key: 'help', build: (t, e) => `${chip(t, e, 'עזרה מיידית')}${title(r2(t + 0.1), e, 'נתקעת?', 'העוזרת עונה מיד')}
      ${phone(t, e, [{ id: 'help', from: 60, at: 0 }])}` },
    { key: 'client', build: (t, e) => `${chip(t, e, 'הדף של הלקוחה')}${title(r2(t + 0.1), e, 'לכל לקוחה', 'דף אישי כמו אפליקציה')}
      ${phone(t, e, [{ id: 'client', from: 0, to: 640, at: 0 }])}` },
  ];
}

const FEATURE_LEN = 4.5;

function painScenes(B, L, t0, short) {
  const { title, wa, el: _ } = { ...B, el };
  const R = L.region, portrait = L.W < L.H;
  const msgs = ['יש לך משהו מחר?', 'אפשר להזיז לחמישי?', 'כמה עולה פילינג?', 'את פנויה בערב? 🙏', 'אני מאחרת 10 דקות'];
  const cx = (i) => (portrait ? (i % 2 ? `left:${R.left}px` : `right:${R.left}px`) : (i % 2 ? `left:${R.left}px` : `left:${R.left + 150}px`));
  const scenes = [];
  // 1. WhatsApp that never ends
  const s1 = (t, e, n = 5) => `${title(t, e, 'הוואטסאפ', 'לא נגמר')}
    ${msgs.slice(0, n).map((m, i) => wa(r2(t + 0.25 + i * 0.4), e, `לקוחה · ${ltr(`22:${String(14 + i * 7).padStart(2, '0')}`)}`, [m], `${cx(i)};top:${R.top + 20 + i * (R.height / n)}px`)).join('')}
    ${el('badge', r2(t + 1.6), e, 'pop', '47', portrait ? 'left:400px;top:220px' : 'left:420px;top:40px')}`;
  // 2. the no-show
  const s2 = (t, e) => `${title(t, e, 'תור ריק.', 'כסף שהלך.')}
    ${el('slot', r2(t + 0.2), e, 'up', `<div class="tm">${ltr('10:00')}</div><div><b>נועה</b><div>טיפול פנים קלאסי</div></div>`, portrait ? `left:60px;right:60px;top:380px` : `left:80px;width:380px;top:150px`)}
    ${el('stamp', r2(t + 1.0), e, 'stamp', 'לא הגיעה', portrait ? 'left:170px;top:520px' : 'left:170px;top:300px')}`;
  // 3. chasing payments
  const s3 = (t, e) => `${title(t, e, 'ולרדוף', 'אחרי תשלומים')}
    ${wa(r2(t + 0.2), e, 'את · לפני 3 ימים', ['היי מותק, מזכירה בעדינות', 'על התשלום מהטיפול 🙏'], portrait ? 'left:90px;top:330px' : 'left:70px;top:90px', true)}
    ${wa(r2(t + 1.1), e, 'את · היום', ['?'], portrait ? 'left:90px;top:470px' : 'left:70px;top:230px', true)}
    ${el('seen', r2(t + 1.6), e, 'fade', 'נקרא ✓✓ · אין תשובה', portrait ? 'left:90px;top:560px' : 'left:70px;top:320px')}`;
  // 4. the notebook
  const s4 = (t, e) => `${title(t, e, 'והמחברת?', 'איפה המחברת?')}
    ${el('note', r2(t + 0.2), e, 'fly', lines([`רחל, ג׳ ${ltr('10:00')}`, `<s>שלומית ה׳</s> ו׳?`, 'דנה, להתקשר!!', `חייבת לי ${ltr('₪260')}`, '<s>מיכל</s>']), portrait ? 'left:90px;top:330px' : 'left:90px;top:80px', 'data-rot="-4"')}`;
  if (short) {
    scenes.push([t0, 2, (t, e) => s1(t, e, 3)]);
    scenes.push([t0 + 2, 2, s2]);
  } else {
    scenes.push([t0, 3, s1], [t0 + 3, 3.5, s2], [t0 + 6.5, 3, s3], [t0 + 9.5, 3.5, s4]);
  }
  return scenes;
}

function hookScene(B, L, t, e) {
  const portrait = L.W < L.H;
  const pops = ['לקוחה: אפשר להזיז?', 'לקוחה: יש מקום מחר?', 'לקוחה: כמה זה עולה?'];
  return `${el('title big', t, e, 'up', lines(['סיימת את הלקוחה האחרונה,', 'ועכשיו מתחילה']), `${L.title};font-size:${portrait ? 40 : 40}px`)}
    ${el('title accent', r2(t + 0.7), e, 'pop', lines(['המשמרת השנייה.']), `${L.title};top:${portrait ? 160 : 260}px;font-size:${portrait ? 54 : 56}px`)}
    ${pops.map((p, i) => el('pop slim', r2(t + 0.3 + i * 0.45), e, 'drop', `<img src="/public/brand-icons/icon-envelope.png"><div class="pb"><div class="ph"><b>וואטסאפ</b><span>עכשיו</span></div><div>${p}</div></div>`, portrait ? `left:40px;right:40px;top:${360 + i * 96}px` : `left:60px;width:400px;top:${60 + i * 96}px`, 'data-float="3" data-buzz="1"')).join('')}`;
}

function turnScene(B, L, t, e) {
  const portrait = L.W < L.H;
  return `${el('title big', t, e, 'up', lines(['מה אם הכול', 'היה עובד בשבילך?']), `${L.title};top:${portrait ? 300 : 170}px;font-size:${portrait ? 52 : 50}px`)}
    <img class="el" src="/public/flower-full.png" data-in="${r2(t + 0.3)}" data-out="${e}" data-a="spin" style="left:${portrait ? 210 : 410}px;top:${portrait ? 520 : 330}px;width:120px">`;
}

function climaxScene(B, L, t, e) {
  const { title, chip, phone, petals } = B;
  const portrait = L.W < L.H;
  const rep = mark('report', 'הטיפולים שהכניסו הכי הרבה', 518);
  return `${chip(t, e, 'הדוח החודשי')}${title(r2(t + 0.1), e, 'כל החודש שלך', 'במסך אחד')}
    ${phone(t, e, [{ id: 'report', from: 60, to: rep - 40, at: 0 }])}
    ${el('big-num', r2(t + 0.6), e, 'pop', `<span class="ltr count" data-from="0" data-to="6551" data-c0="${r2(t + 0.8)}" data-c1="${r2(t + 2.6)}">₪0</span><div class="sub">הכנסות החודש</div>`, portrait ? 'left:70px;right:70px;top:690px' : 'right:44px;width:430px;top:290px')}
    ${el('bub tag', r2(t + 3.0), e, 'pop', `ביקורים: ${ltr('26')}`, portrait ? 'left:60px;top:880px' : 'right:44px;top:420px', 'data-float="3"')}
    ${el('bub tag', r2(t + 3.4), e, 'pop', `לקוחות חדשות: ${ltr('12')}`, portrait ? 'right:60px;top:880px' : 'right:220px;top:420px', 'data-float="3"')}
    ${petals(portrait ? 270 : 700, portrait ? 800 : 330, r2(t + 2.6))}`;
}

function ctaScene(B, L, t, e) {
  const portrait = L.W < L.H;
  return `<img class="el" src="/public/kalmea-wordmark.png" data-in="${t}" data-out="999" data-a="pop" style="left:${portrait ? 130 : 330}px;top:${portrait ? 230 : 70}px;width:${portrait ? 280 : 300}px">
    ${el('title big', r2(t + 0.5), 999, 'up', lines(['תחזירי לעצמך', 'את הערבים']), `left:20px;right:20px;top:${portrait ? 380 : 190}px;text-align:center;font-size:${portrait ? 56 : 58}px`)}
    ${el('url', r2(t + 1.0), 999, 'up', lines([`חודש ניסיון חינם · ${ltr('kalmea.app')}`]), `left:0;right:0;top:${portrait ? 530 : 330}px;text-align:center`)}
    ${el('small', r2(t + 1.5), 999, 'up', lines(['בלי כרטיס אשראי ובלי התחייבות']), `left:0;right:0;top:${portrait ? 580 : 380}px;text-align:center`)}
    <img class="el" src="/public/flower-full.png" data-in="${r2(t + 0.2)}" data-out="999" data-a="spin" style="left:${portrait ? 230 : 440}px;top:${portrait ? 680 : 460}px;width:80px">
    ${B.petals(portrait ? 270 : 480, portrait ? 470 : 280, r2(t + 0.6))}`;
}

/** The 90 s and 30 s cuts. Returns { html, seconds, music: {sections, hits} }. */
function storyCut(layoutName, short) {
  const L = LAYOUTS[layoutName], B = make(L);
  const parts = [];
  const add = (t, len, fn) => parts.push(fn(r2(t), r2(t + len - 0.25)));
  const hits = [];
  if (!short) {
    add(0, 3, (t, e) => hookScene(B, L, t, e));
    for (const [t, len, fn] of painScenes(B, L, 3, false)) add(t, len, fn);
    add(16, 2, (t, e) => turnScene(B, L, t, e));
    const feats = features(B, L);
    feats.forEach((f, i) => { const t = 18 + i * FEATURE_LEN; add(t, FEATURE_LEN, f.build); hits.push({ s: t, kind: 'whoosh' }); });
    add(72, 10, (t, e) => climaxScene(B, L, t, e));
    parts.push(ctaScene(B, L, 82, 999));
    hits.push({ s: 3, kind: 'impact' }, { s: 18, kind: 'impact' }, { s: 72, kind: 'impact' }, { s: 82, kind: 'impact' });
    return { L, html: parts.join('\n'), seconds: 90, music: { sections: [{ kind: 'hook', bars: 2 }, { kind: 'pain', bars: 6 }, { kind: 'build', bars: 1 }, { kind: 'main', bars: 27 }, { kind: 'climax', bars: 5 }, { kind: 'outro', bars: 4 }], hits } };
  }
  add(0, 2, (t, e) => hookScene(B, L, t, e));
  for (const [t, len, fn] of painScenes(B, L, 2, true)) add(t, len, fn);
  add(6, 2, (t, e) => turnScene(B, L, t, e));
  const pick = ['booking', 'reminders', 'deposit', 'grow', 'till', 'vouchers', 'reviews', 'client'];
  const feats = features(B, L).filter((f) => pick.includes(f.key));
  feats.forEach((f, i) => {
    const t = 8 + i * 2;
    // a 2 s beat: the feature's own build, squeezed (its later layers simply never come in)
    parts.push(squeeze(f.build, t, 2));
    hits.push({ s: t, kind: 'whoosh' });
  });
  add(24, 3, (t, e) => climaxScene(B, L, t, e));
  parts.push(ctaScene(B, L, 27, 999));
  hits.push({ s: 2, kind: 'impact' }, { s: 8, kind: 'impact' }, { s: 24, kind: 'impact' }, { s: 27, kind: 'impact' });
  return { L, html: parts.join('\n'), seconds: 30, music: { sections: [{ kind: 'hook', bars: 1 }, { kind: 'pain', bars: 2 }, { kind: 'build', bars: 1 }, { kind: 'main', bars: 8 }, { kind: 'climax', bars: 1 }, { kind: 'outro', bars: 2 }], hits } };
}

/** Builds a feature scene at 4.5 s timing and rescales every data-in/out/pan/count time into `len` seconds starting at t. */
function squeeze(build, t, len) {
  const html = build(1000, r2(1000 + FEATURE_LEN - 0.25));
  const k = len / FEATURE_LEN;
  const map = (x) => (x >= 999 && x < 1000 ? x : r2(t + (x - 1000) * k));
  return html
    .replace(/data-(in|out|c0|c1)="([\d.]+)"/g, (_m, a, v) => `data-${a}="${map(+v)}"`)
    .replace(/data-pan="([-\d.]+),([-\d.]+),([\d.]+),([\d.]+)"/g, (_m, a, b, c, d) => `data-pan="${a},${b},${map(+c)},${map(+d)}"`);
}

// ── the podcast cut ──────────────────────────────────────────────────────────────────────────────
// Her lines, timed from the burned subtitles (a frame every 0.5 s): [start, end] seconds in podcast.mp4.
const POD_LINES = [
  [0.0, 6.0, 'cam'],        // אף אחת לא פתחה עסק... אין סיכוי שאין שום מערכת שחושבת עליי, שאכפת לה ממני
  [6.0, 10.0, 'cam'],       // כן, קל. אפילו את צריכה לכתוב. את לא טכנולוגית, תדברי. זה יעבוד לך
  [10.0, 14.0, 'screen'],   // תקבעי לרחל תור מחר לשעה 10, נכנסת לך / תבטלי לשלומית את התור, מתבטל
  [14.0, 17.5, 'screen'],   // אה וגם הלקוחות יכולות לקבוע בעצמם זה לא פחות חשוב
  [17.5, 22.0, 'cam'],      // אפילו שנתיים... ושוכחת לטפל בלקוחות הקיימות
  [22.0, 27.5, 'screen'],   // תמצי אותם, הן רוצות לחזור אלייך... שתיזכרי בהן
  [27.5, 30.9, 'cam'],      // משהו משגשג. משהו שמתנהל בשבילך, שאת לא צריכה כל הזמן
  [30.9, 32.9, 'screen'],   // להתעסק בביורוקרטיה
  [32.9, 36.8, 'cam'],      // נחת, שתזכירי למה מלכתחילה בכלל פתחת את הדבר הזה
];

function podcastCut() {
  const L = LAYOUTS.portrait, B = make(L);
  const { phone, title, chip, pop, tag, wa } = B;
  const parts = [], voice = [], hits = [];
  let t = 0;
  const snap = (x) => Math.ceil(x / BEAT - 1e-6) * BEAT; // a music-only bridge ends on the beat
  const cam = (a, b) => { parts.push(el('cam', r2(t), r2(t + (b - a)), 'none', `<video muted playsinline preload="auto" src="/clip.webm" data-src="${a}" data-start="${r2(t)}"></video>`, 'left:0;top:0;width:540px;height:960px')); voice.push({ a, b, at: t }); t = r2(t + (b - a)); };
  // her words over the screens: two lines, white on a soft dark outline like her own subtitles, bottom of the frame
  const caps = (tin, spans) => spans.map(([d0, d1, l1, l2]) => el('cap', r2(tin + d0), r2(tin + d1), 'fade', lines(l2 ? [l1, l2] : [l1]), L.cap)).join('');
  const screenVO = (a, b, build, spans) => { const len = b - a; parts.push(build(r2(t), r2(t + len)) + caps(t, spans)); voice.push({ a, b, at: t }); t = r2(t + len); };
  const bridge = (len, build) => { const end = snap(t + len); parts.push(build(r2(t), r2(end - 0.15))); hits.push({ s: t, kind: 'whoosh' }); t = r2(end); };

  cam(0.0, 6.0);
  bridge(4, (a, e) => `${title(a, e, 'אז הנה היא:', 'מערכת שחושבת עלייך')}<img class="el" src="/public/kalmea-wordmark.png" data-in="${r2(a + 0.4)}" data-out="${e}" data-a="pop" style="left:150px;top:380px;width:240px">${B.petals(270, 440, r2(a + 0.5))}`);
  cam(6.0, 10.0);
  screenVO(10.0, 14.0, (a, e) => `${chip(a, e, 'היומן')}${phone(a, e, [{ id: 'calendar', from: 0, to: 160, at: 0 }], 'fade')}`,
    [[0, 2.2, 'תקבעי לרחל תור מחר לשעה 10,', 'נכנסת לך'], [2.2, 3.9, 'תבטלי לשלומית את התור,', 'מתבטל']]);
  screenVO(14.0, 17.5, (a, e) => `${chip(a, e, 'הדף שלך')}${phone(a, e, [{ id: 'book', from: mark('book', 'הטיפולים שלי', 720) - 60, to: mark('book', 'הטיפולים שלי', 720) + 380, at: 0 }], 'fade')}`,
    [[0, 3.4, 'אה, וגם הלקוחות יכולות לקבוע בעצמן,', 'זה לא פחות חשוב']]);
  bridge(5, (a, e) => `${title(a, e, 'מקדמה בכרטיס,', 'כבר בקביעת התור')}${phone(a, e, [{ id: 'pay', from: 0, at: 0 }, { id: 'paid', from: 0, at: 2.5 }], 'rise')}${pop(r2(a + 3.0), e, 'תשלום התקבל', [`מקדמה של ${ltr('₪100')} דרך Grow`], 0, 'wallet')}`);
  cam(17.5, 22.0);
  screenVO(22.0, 27.5, (a, e) => `${chip(a, e, 'הלקוחות הקיימות')}${phone(a, e, [{ id: 'messages', from: 0, at: 0 }, { id: 'client', from: 40, at: 2.7 }], 'fade')}`,
    [[0, 2.3, 'תמצי אותן, הן רוצות לחזור אלייך,', 'הן רוצות'], [2.3, 5.4, 'הן רק רוצות שתחשבי עליהן,', 'שתיזכרי בהן']]);
  bridge(7, (a, e) => `${title(a, e, 'התור הבא נקבע,', 'והביקורת בגוגל מגיעה')}${phone(a, e, [{ id: 'rebook', from: 0, at: 0 }, { id: 'review', from: 120, at: 3.5 }], 'rise')}
    ${tag(r2(a + 1.6), e, 'קבעי לה שוב ✓', 'left:150px;top:780px')}${tag(r2(a + 4.6), e, '★★★★★', 'left:190px;top:785px')}`);
  cam(27.5, 30.9);
  screenVO(30.9, 32.9, (a, e) => `${chip(a, e, 'הקופה')}${phone(a, e, [{ id: 'till', from: 0, at: 0 }], 'fade')}`, [[0, 1.95, 'להתעסק בביורוקרטיה.']]);
  bridge(8, (a, e) => `${title(a, e, 'סליקה, קופה ודוח חודשי,', 'הכול במקום אחד')}${phone(a, e, [{ id: 'paid', from: 0, at: 0 }, { id: 'products', from: 0, at: 2.4 }, { id: 'report', from: 60, at: 4.8 }], 'rise')}
    ${pop(r2(a + 1.0), r2(a + 2.4), 'ביטלת מכירה בקופה?', ['הכסף חוזר לכרטיס שלה, במלואו'], 0, 'wallet')}`);
  cam(32.9, 36.8);
  const ctaAt = t;
  parts.push(`<div class="el cream" data-in="${r2(ctaAt)}" data-out="999" data-a="fade" style="left:0;top:0;width:540px;height:960px"></div>` + ctaScene(B, L, r2(ctaAt), 999));
  t = r2(snap(ctaAt + 6));
  hits.push({ s: ctaAt, kind: 'impact' });
  const bars = Math.ceil(t / 2);
  return { L, html: parts.join('\n'), seconds: t, voice, music: { sections: [{ kind: 'hook', bars: 3 }, { kind: 'main', bars: Math.max(1, bars - 6) }, { kind: 'outro', bars: 3 }], hits } };
}

// ── page and render ──────────────────────────────────────────────────────────────────────────────
const b64 = (f) => fs.readFileSync(f).toString('base64');
function page(L, body) {
  const { W, H } = L;
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>
@font-face{font-family:KG;src:url(data:font/woff2;base64,${b64(path.join(HERE, '..', 'fonts', 'GveretLevin.woff2'))}) format('woff2')}
@font-face{font-family:KF;src:url(/public/design-fonts/FrankRuhlLibre-700.ttf);font-weight:700}
@font-face{font-family:KA;src:url(/public/design-fonts/Assistant-600.ttf);font-weight:600}
@font-face{font-family:KB;src:url(/public/design-fonts/Assistant-700.ttf);font-weight:700}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:${BRAND.cream}}
#stage{position:absolute;inset:0;overflow:hidden}
.blob{position:absolute;border-radius:50%;filter:blur(2px)}
.el{position:absolute;opacity:0;will-change:transform,opacity}
.title{font:48px/1.12 KG,serif;color:${BRAND.deep};white-space:nowrap}
.title.accent{color:#C4766C}
.chip{display:inline-block;font:700 17px KB,sans-serif;color:${BRAND.deep};background:${BRAND.palePetal};border:1.5px solid ${BRAND.petal};border-radius:999px;padding:5px 16px}
.phone{border-radius:32px;overflow:hidden;background:#fff;border:7px solid ${BRAND.deep};box-shadow:0 30px 60px -24px rgba(31,58,48,.45);box-sizing:border-box}
.phone .scr{position:absolute;left:0;top:0;display:block}
.pop{display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.97);border-radius:22px;padding:12px 16px;box-shadow:0 24px 44px -16px rgba(31,58,48,.5);border:1px solid rgba(31,58,48,.08);box-sizing:border-box}
.pop img{width:44px;height:44px;border-radius:12px;background:${BRAND.palePetal};padding:4px;box-sizing:border-box}
.pop .pb{flex:1;font:600 18px/1.35 KA;color:#3B4842;white-space:nowrap}
.pop .ph{display:flex;justify-content:space-between;align-items:baseline}.pop .ph b{font:700 19px KF;color:${BRAND.deep}}.pop .ph span{font:600 13px KA;color:#6F7A74}
.pop.slim .pb{font-size:19px}
.bub{max-width:400px;padding:11px 18px;border-radius:20px;font:600 20px/1.35 KA,sans-serif;box-shadow:0 14px 30px -14px rgba(31,58,48,.38);white-space:nowrap}
.tag{background:${BRAND.petal};color:${BRAND.deep};font:700 20px KB;border-radius:999px}
.wa{background:#FFFFFF;color:#26332D;border-right:5px solid #25D366;border-radius:16px}
.wa.mine{background:#DCF8C6;border-right:none;border-left:5px solid #25D366}
.wa .k{font:700 14px KB;color:#1E8A4C;margin-bottom:3px}
.badge{width:64px;height:64px;border-radius:50%;background:#E0574F;color:#fff;font:700 30px/64px KB;text-align:center;box-shadow:0 10px 24px -8px rgba(160,40,30,.6)}
.slot{display:flex;gap:18px;align-items:center;background:#fff;border-radius:20px;padding:18px 22px;border-right:6px solid ${BRAND.petal};font:600 22px/1.4 KA;color:#3B4842;box-shadow:0 18px 36px -18px rgba(31,58,48,.4)}
.slot .tm{font:700 30px KF;color:${BRAND.deep}}.slot b{font:700 26px KF;color:${BRAND.deep}}
.stamp{font:700 46px KB;color:#C0392B;border:5px solid #C0392B;border-radius:14px;padding:4px 18px;transform:rotate(-12deg);background:rgba(255,255,255,.7)}
.seen{font:600 17px KA;color:#5E6B65}
.note{width:330px;padding:26px 30px 30px;background:repeating-linear-gradient(#FFFEF8 0 41px,#CFE0EA 41px 42px);border-radius:6px;box-shadow:0 22px 40px -18px rgba(31,58,48,.45);font:36px/42px KG;color:#2C3E50}
.note s{color:#9A6B6B}
.big-num{text-align:center;background:rgba(255,255,255,.96);border-radius:24px;padding:10px 0 14px;box-shadow:0 24px 44px -16px rgba(31,58,48,.5)}.big-num .count{font:700 74px KF;color:${BRAND.deep}}.big-num .sub{font:600 20px KA;color:#4F5F58}
.title.big{line-height:1.1}
.url{font:700 28px KB;color:${BRAND.deep}}
.small{font:600 20px KA;color:#4F5F58}
.cam video{width:100%;height:100%;object-fit:cover;display:block}
.cream{background:${BRAND.cream}}
.cap{text-align:center;font:700 26px/1.3 KB,sans-serif;color:#fff;text-shadow:0 0 3px #000,0 0 3px #000,0 2px 6px rgba(0,0,0,.8);white-space:nowrap;background:rgba(31,58,48,.82);border-radius:18px;padding:10px 12px}
.petal{width:30px;height:30px}
.ltr{direction:ltr;unicode-bidi:isolate;display:inline-block}
</style></head><body><div id="stage">
<div class="blob" id="b1" style="width:420px;height:420px;background:${BRAND.palePetal};left:-140px;top:-100px"></div>
<div class="blob" id="b2" style="width:360px;height:360px;background:${BRAND.sage}88;right:-130px;bottom:-90px"></div>
<img src="/public/flower-full.png" style="position:absolute;left:-60px;bottom:-50px;width:240px;opacity:.07">
${body}
</div><script>${RUNTIME}</script></body></html>`;
}

// every element is a function of t; the podcast clip is seeked to its frame and awaited before the screenshot
const RUNTIME = `
const clamp = (x) => Math.max(0, Math.min(1, x));
const out3 = (x) => 1 - Math.pow(1 - clamp(x), 3);
const inOut = (x) => { x = clamp(x); return x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
const back = (x) => { x = clamp(x); const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const els = [...document.querySelectorAll('.el')].map((e, i) => ({ e, i, tin: +e.dataset.in, tout: +e.dataset.out, a: e.dataset.a, fl: +(e.dataset.float || 0), rot: +(e.dataset.rot || 0), buzz: +(e.dataset.buzz || 0), dx: +(e.dataset.dx || 0), dy: +(e.dataset.dy || 0), pan: e.dataset.pan ? e.dataset.pan.split(',').map(Number) : null, v: e.querySelector('video') }));
const counts = [...document.querySelectorAll('.count')].map((e) => ({ e, a: +e.dataset.from, b: +e.dataset.to, t0: +e.dataset.c0, t1: +e.dataset.c1 }));
window.__t = async (t) => {
  document.getElementById('b1').style.transform = 'translate(' + Math.sin(t * .4) * 30 + 'px,' + Math.cos(t * .3) * 24 + 'px)';
  document.getElementById('b2').style.transform = 'translate(' + Math.cos(t * .35) * 28 + 'px,' + Math.sin(t * .45) * 22 + 'px)';
  const seeks = [];
  for (const o of els) {
    const k = (t - o.tin) / .45, p = out3(k), q = inOut((t - o.tout) / .3);
    let op = clamp(k * 2) * (1 - q), tr = '';
    const fl = o.fl ? ' translateY(' + (Math.sin(t * 1.7 + o.i) * o.fl).toFixed(2) + 'px)' : '';
    switch (o.a) {
      case 'pop': tr = 'scale(' + (.3 + .7 * back(k)) + ')'; break;
      case 'up': tr = 'translateY(' + (1 - p) * 30 + 'px)'; break;
      case 'rise': tr = 'translateY(' + (1 - out3((t - o.tin) / .6)) * 700 + 'px)'; break;
      case 'drop': tr = 'translateY(' + -(1 - back(k)) * 200 + 'px)'; break;
      case 'spin': tr = 'scale(' + (.3 + .7 * back(k)) + ') rotate(' + (1 - p) * -120 + 'deg)'; break;
      case 'fly': tr = 'translate(' + (1 - p) * 260 + 'px,' + (1 - p) * 160 + 'px) rotate(' + (o.rot + (1 - p) * 20) + 'deg) scale(' + (.6 + .4 * back(k)) + ')'; break;
      case 'stamp': { const s = 2.2 - 1.2 * back(k); tr = 'rotate(-12deg) scale(' + s + ')'; break; }
      case 'burst': { const b = out3((t - o.tin) / 1.1); tr = 'translate(' + o.dx * b + 'px,' + o.dy * b + 'px) rotate(' + b * 220 + 'deg) scale(' + (1 - b * .4) + ')'; op = clamp(k * 3) * (1 - clamp((t - o.tin - .6) / .8)); break; }
      case 'none': op = t >= o.tin && t < o.tout ? 1 : 0; break;
      default: tr = '';
    }
    if (o.buzz && t - o.tin < .5 && t >= o.tin) tr += ' translateX(' + (Math.sin((t - o.tin) * 90) * 5 * (1 - (t - o.tin) / .5)).toFixed(2) + 'px)';
    if (o.pan) { const [y0, y1, p0, p1] = o.pan; tr += ' translateY(' + (y0 + (y1 - y0) * inOut((t - p0) / Math.max(.1, p1 - p0))).toFixed(1) + 'px)'; }
    o.e.style.opacity = op.toFixed(3);
    o.e.style.transform = tr + fl;
    if (o.v && op > 0) {
      const want = Math.max(0, Math.min((o.v.duration || 0) - .04, +o.v.dataset.src + (t - +o.v.dataset.start)));
      if (Math.abs(o.v.currentTime - want) > .001) seeks.push(new Promise((r) => { o.v.addEventListener('seeked', r, { once: true }); o.v.currentTime = want; }));
    }
  }
  for (const c of counts) {
    const v = Math.round(c.a + (c.b - c.a) * out3((t - c.t0) / Math.max(.1, c.t1 - c.t0)));
    c.e.textContent = '₪' + v.toLocaleString('en-US');
  }
  await Promise.all(seeks);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
};`;

/** A small static server: the page, /public (the site's own images and fonts), /shots, /clip.webm (with Range, for seeking). */
function serve(html, clip) {
  const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.webm': 'video/webm' };
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (u === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(html); }
    let f = null;
    if (u.startsWith('/public/')) f = path.join(PUBLIC, u.slice(8));
    else if (u.startsWith('/shots/')) f = path.join(SHOTS, u.slice(7));
    else if (u === '/clip.webm') f = clip;
    if (!f || !(f === clip || f.startsWith(PUBLIC + path.sep) || f.startsWith(SHOTS + path.sep)) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    const size = fs.statSync(f).size, type = types[path.extname(f)] || 'application/octet-stream';
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
    if (m) {
      const a = +m[1], b = m[2] ? +m[2] : size - 1;
      res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${a}-${b}/${size}`, 'accept-ranges': 'bytes', 'content-length': b - a + 1 });
      return fs.createReadStream(f, { start: a, end: b }).pipe(res);
    }
    res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

async function renderVideo({ L, html, seconds, audio, outFile, still, clip }) {
  const server = await serve(page(L, html), clip);
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await openBrowser();
  try {
    const dpr = L.out[0] / L.W;
    const ctx = await browser.newContext({ viewport: { width: L.W, height: L.H }, deviceScaleFactor: dpr, locale: 'he-IL' });
    const pg = await ctx.newPage();
    await pg.goto(url, { waitUntil: 'networkidle', timeout: 180000 });
    await pg.evaluate(() => document.fonts.ready);
    await pg.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
    await pg.evaluate(() => Promise.all([...document.querySelectorAll('video')].map((v) => (v.readyState >= 2 ? 0 : new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error('the clip did not load')); })))));
    for (const f of ['48px KG', '700 20px KB', '600 20px KA', '700 20px KF']) if (!(await pg.evaluate((x) => document.fonts.check(x), f))) throw new Error(`font ${f} did not load`);
    const broken = await pg.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.src.slice(0, 80)));
    if (broken.length) throw new Error(`images did not load: ${broken.join(', ')}`);
    // nothing runs off the frame, nothing is clipped inside its box
    // nothing runs off the frame, and no text spills out of its own card (the text's own box, measured with a Range)
    const bad = await pg.evaluate(([W]) => [...document.querySelectorAll('.title,.bub,.pop,.cap,.chip,.url,.small,.big-num,.slot,.note')].map((e) => {
      const r = e.getBoundingClientRect(), t = { left: 1e9, right: -1e9 };
      const tw = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) { if (!n.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n); for (const q of rg.getClientRects()) { t.left = Math.min(t.left, q.left); t.right = Math.max(t.right, q.right); } }
      if (t.right < t.left) { t.left = r.left; t.right = r.right; }
      const spill = /\b(bub|pop|chip|slot|note|title|cap)\b/.test(e.className) && (t.left < r.left - 1 || t.right > r.right + 1);
      return { t: e.innerText.replace(/\s+/g, ' ').slice(0, 40), l: t.left, r: t.right, spill };
    }).filter((x) => x.l < 4 || x.r > W - 4 || x.spill), [L.W]);
    if (bad.length) throw new Error(`text off the frame or spilling out of its card: ${bad.map((x) => `"${x.t}" ${Math.round(x.l)}-${Math.round(x.r)}${x.spill ? ' spills' : ''}`).join('; ')}`);

    if (still != null) {
      // one or more stills: --frame=12.5 or --frame=3,12.5,40 (each into frame-<cut>-<t>.png)
      for (const s of String(still).split(',')) {
        await pg.evaluate((t) => window.__t(t), +s);
        await pg.screenshot({ path: outFile.replace('{t}', s) });
      }
      return outFile;
    }
    const enc = spawn(ffmpeg, ['-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-', '-i', audio,
      '-map', '0:v', '-map', '1:a', '-vf', `scale=${L.out[0]}:${L.out[1]}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.0',
      '-preset', 'slow', '-crf', '23', '-r', String(FPS), '-g', '60', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
      '-t', String(seconds), '-movflags', '+faststart', outFile], { stdio: ['pipe', 'ignore', 'pipe'] });
    let encErr = ''; enc.stderr.on('data', (d) => { encErr += d; });
    const done = new Promise((res) => enc.on('close', res));
    const N = Math.round(FPS * seconds);
    for (let i = 0; i < N; i++) {
      await pg.evaluate((t) => window.__t(t), i / FPS);
      const jpg = await pg.screenshot({ type: 'jpeg', quality: 93 });
      if (!enc.stdin.write(jpg)) await new Promise((r) => enc.stdin.once('drain', r));
      if (i % 300 === 0) log(`frame ${i}/${N}`);
    }
    enc.stdin.end();
    if ((await done) !== 0) throw new Error(`ffmpeg: ${encErr.slice(-800)}`);
    return outFile;
  } finally {
    await browser.close();
    server.close();
  }
}

function ff(args) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
}

/** The music for a cut, and with a voice: the voice on top, the music ducked under it. */
function soundtrack(name, cut, voiceArg) {
  const music = path.join(PROMO, `music-${name}.wav`);
  const st = writePromoTrack(music, { seconds: cut.seconds, sections: cut.music.sections, hits: cut.music.hits });
  log(`music ${path.basename(music)}: peak ${st.peakDb.toFixed(1)} dBFS, rms ${st.rmsDb.toFixed(1)} dBFS`);
  const mix = path.join(PROMO, `mix-${name}.m4a`);
  if (cut.voice) {
    // the podcast: her lines placed where the cut plays them; the music at -18 dB while she speaks, full between, 0.25 s ramps
    const src = cut.clipSource;
    const gainExpr = (() => {
      const segs = cut.voice.map((v) => [v.at, v.at + (v.b - v.a)]);
      const inside = segs.map(([a, b]) => `between(t,${a.toFixed(2)},${b.toFixed(2)})`).join('+');
      const ramp = segs.map(([a, b]) => `between(t,${(a - 0.25).toFixed(2)},${a.toFixed(2)})*(${a.toFixed(2)}-t)/0.25+between(t,${b.toFixed(2)},${(b + 0.25).toFixed(2)})*(t-${b.toFixed(2)})/0.25`).join('+');
      return `if(gt(${inside},0),0.126,if(gt(${ramp},0),0.126+0.874*min(1,${ramp}),1))`;
    })();
    const vparts = cut.voice.map((v, i) => `[1:a]atrim=${v.a}:${v.b},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(v.at * 1000)}:all=1[v${i}]`);
    const graph = [
      `[0:a]volume='${gainExpr}':eval=frame[m]`,
      ...vparts,
      `${cut.voice.map((_, i) => `[v${i}]`).join('')}amix=inputs=${cut.voice.length}:normalize=0:duration=longest[vo]`,
      '[vo]volume=1.6[vo2]',
      `[m][vo2]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[out]`,
    ];
    ff(['-i', music, '-i', src, '-filter_complex', graph.join(';'), '-map', '[out]', '-t', String(cut.seconds), '-c:a', 'aac', '-b:a', '160k', mix]);
    return mix;
  }
  if (voiceArg) {
    // an optional voice track from 0 s: the music ducks under it by itself (sidechain), then both are mixed
    ff(['-i', music, '-i', voiceArg, '-filter_complex',
      '[1:a]aresample=48000,aformat=channel_layouts=stereo,asplit=2[vk][vm];[0:a][vk]sidechaincompress=threshold=0.015:ratio=12:attack=15:release=350:makeup=1[m];[m][vm]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[out]',
      '-map', '[out]', '-t', String(cut.seconds), '-c:a', 'aac', '-b:a', '160k', mix]);
    return mix;
  }
  ff(['-i', music, '-t', String(cut.seconds), '-c:a', 'aac', '-b:a', '160k', mix]);
  return mix;
}

const CUTS = {
  reel: () => storyCut('portrait', false),
  short: () => storyCut('portrait', true),
  wide: () => storyCut('landscape', false),
  podcast: () => podcastCut(),
};
const NAMES = { reel: 'kalmea-promo-90s-9x16.mp4', short: 'kalmea-promo-30s-9x16.mp4', wide: 'kalmea-promo-90s-16x9.mp4', podcast: 'kalmea-promo-podcast-9x16.mp4' };

const which = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const todo = which.length ? which : ['reel', 'short', 'wide', 'podcast'];
for (const name of todo) {
  if (!CUTS[name]) throw new Error(`unknown cut ${name}`);
  const cut = CUTS[name]();
  let clip = null;
  if (name === 'podcast') {
    const src = arg('podcast') || path.join(PROMO, 'in', 'podcast.mp4');
    if (!fs.existsSync(src)) throw new Error(`missing the podcast clip ${src} (--podcast=<path>)`);
    cut.clipSource = src;
    clip = path.join(PROMO, 'podcast-intra.webm');
    // every frame a keyframe: the renderer seeks the clip 30 times a second
    if (!fs.existsSync(clip) || fs.statSync(clip).mtimeMs < fs.statSync(src).mtimeMs) ff(['-i', src, '-an', '-vf', 'fps=30', '-c:v', 'libvpx', '-g', '1', '-b:v', '3000k', '-crf', '10', clip]);
  }
  const still = arg('frame');
  if (still) { log(`still ${name} @ ${still}`); await renderVideo({ ...cut, still, outFile: path.join(PROMO, `frame-${name}-{t}.png`), clip }); continue; }
  const audio = soundtrack(name, cut, arg('voice'));
  const outFile = path.join(PROMO, NAMES[name]);
  log(`render ${name}: ${cut.seconds} s`);
  await renderVideo({ ...cut, audio, outFile, clip });
  log(`wrote ${outFile} (${(fs.statSync(outFile).size / 1e6).toFixed(1)} MB)`);
}
