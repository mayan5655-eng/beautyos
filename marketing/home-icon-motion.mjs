// marketing/home-icon-motion.mjs
//
// The tutorial video "how to add Kalmea to the phone's home screen": iPhone (Safari) and Android (Chrome). Same style as the
// other motion videos (motion-lib.mjs), but the phones are DRAWN, not recorded: a home-screen install cannot be filmed in a
// desktop browser. So the screens are illustrations of Safari's and Chrome's own steps, and the words on them are the
// system's words. Wording follows the app's own banners (app/ios-install-banner.tsx, app/install-prompt-banner.tsx).
// No voice: on-screen titles and music, so it works with the sound off.
//
//   node home-icon-motion.mjs                 -> out/tutorials/kalmea-tutorial-home-icon.mp4 + poster + contact sheet
//   node home-icon-motion.mjs --frame=12.5    -> one still, out/motion/frame.png
//
// Music: "Beauty Skincare Cosmetic Music" by GR0ZA, Pixabay Content License (see welcome-motion.mjs).

import fs from 'node:fs';
import path from 'node:path';
import { BASE, OUT, ff, log } from './lib.mjs';
import { DIR, MUSIC, el, title, pop, petals, endCard, timeline, page, render } from './motion-lib.mjs';

const stillAt = process.argv.find((a) => a.startsWith('--frame='))?.split('=')[1];
const TUT = path.join(OUT, 'tutorials');
for (const d of [TUT, DIR]) fs.mkdirSync(d, { recursive: true });

const ICON = `${BASE}/icons/icon-192.png`;
const L = 110, T = 225, PW = 320, PH = 600; // the drawn phone, on the 540x960 stage

const CSS = `
.mock{left:${L}px;top:${T}px;width:${PW}px;height:${PH}px;border-radius:38px;overflow:hidden;background:#fff;border:8px solid #1F3A30;box-sizing:border-box;box-shadow:0 30px 60px -24px rgba(31,58,48,.45)}
.mock .web{position:absolute;inset:0;background:#FBF6EE;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px}
.mock .web img.fl{width:120px}.mock .web img.wm{width:150px}
.mock .web b{font:600 19px KA;color:#3B4842}
.bar-i{position:absolute;left:0;right:0;bottom:0;background:#F4F4F6;border-top:1px solid #DDD;padding:9px 12px 16px}
.pill{background:#fff;border-radius:12px;text-align:center;font:600 16px KA;color:#222;padding:8px;direction:ltr}
.tools{display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding:0 10px;color:#2F7CF6;direction:ltr}
.tools svg{width:26px;height:26px;display:block}
.bar-a{position:absolute;left:0;right:0;top:0;background:#fff;border-bottom:1px solid #E3E3E3;padding:26px 10px 9px;display:flex;align-items:center;gap:8px;flex-direction:row-reverse}
.bar-a .pill{flex:1;background:#EFF1F4;border-radius:999px;padding:7px}
.dots{width:30px;height:30px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px}.dots i{width:5px;height:5px;border-radius:50%;background:#444}
.sheet{position:absolute;left:0;right:0;bottom:0;background:#F2F2F7;border-radius:18px 18px 0 0;padding:14px 12px 22px}
.row{display:flex;align-items:center;justify-content:space-between;background:#fff;padding:13px 14px;font:600 18px KA;color:#222;border-bottom:1px solid #EEE}
.row.on{background:#FCE9EC;box-shadow:inset 0 0 0 3px #E8A9B5;border-radius:10px;font-weight:600}
.row svg{width:22px;height:22px;display:block}
.menu{position:absolute;top:66px;left:8px;width:236px;background:#fff;border-radius:14px;box-shadow:0 14px 34px -10px rgba(0,0,0,.4);overflow:hidden}
.dlg{position:absolute;left:18px;right:18px;top:170px;background:#fff;border-radius:20px;padding:20px;box-shadow:0 20px 50px -14px rgba(0,0,0,.45);text-align:center}
.dlg h4{margin:0 0 14px;font:600 20px KA;color:#222}
.dlg .i{width:72px;height:72px;border-radius:17px;display:block;margin:0 auto 8px}
.dlg .n{font:600 18px KA;color:#222;direction:ltr}
.dlg .acts{display:flex;justify-content:center;gap:38px;margin-top:18px;font:600 18px KA;color:#1A73E8}
.ihead{position:absolute;left:0;right:0;top:0;background:#F4F4F6;display:flex;justify-content:space-between;align-items:center;padding:30px 16px 12px;font:600 18px KA}
.ihead span{color:#2F7CF6}.ihead b{font:600 18px KA;color:#222}
.ibody{position:absolute;left:14px;right:14px;top:94px;background:#fff;border-radius:14px;padding:14px;display:flex;align-items:center;gap:12px}
.ibody img{width:60px;height:60px;border-radius:14px}.ibody .n{font:600 18px KA;color:#222;direction:ltr}
.dim{position:absolute;inset:0;background:rgba(0,0,0,.35)}
.home{position:absolute;inset:0;background:linear-gradient(170deg,#D6E4DE,#F3DDE1)}
.grid{position:absolute;left:22px;right:22px;top:60px;display:grid;grid-template-columns:repeat(4,1fr);gap:20px 16px;direction:ltr}
.grid i{display:block;aspect-ratio:1;border-radius:13px;background:rgba(255,255,255,.55)}
.hicon{left:${L + 8 + 22 + 3 * ((PW - 16 - 44 - 48) / 4 + 16)}px;top:${T + 8 + 60 + 2 * ((PW - 16 - 44 - 48) / 4 + 20)}px;width:${(PW - 16 - 44 - 48) / 4}px;text-align:center}
.hicon img{width:100%;border-radius:13px;display:block;box-shadow:0 8px 18px -6px rgba(0,0,0,.4)}
.hicon span{font:600 12px KA;color:#222;direction:ltr;display:block;margin-top:3px}
.tap{width:58px;height:58px;border-radius:50%;background:rgba(232,120,146,.42);border:3px solid #E87892;box-sizing:border-box}
.step{left:26px;top:178px;width:40px;height:40px;border-radius:50%;background:#1F3A30;color:#fff;font:700 22px KF;display:flex;align-items:center;justify-content:center}
.hint{left:24px;right:24px;text-align:center;font:600 21px/1.35 KA;color:#3B4842}
.chk{left:50px;right:50px;background:#fff;border-radius:16px;padding:12px 16px;font:600 20px/1.3 KA;color:#1F3A30;box-shadow:0 14px 30px -14px rgba(31,58,48,.38)}
.ok{color:#1B7F4B}.no{color:#B4465A}`;

const SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
const PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="#222" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/></svg>';
const ARROW = (s) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${s}"/></svg>`;

const web = `<div class="web"><img class="fl" src="${BASE}/flower-full.png"><img class="wm" src="${BASE}/kalmea-wordmark.png"><b>עסק פורח, חיים עם יותר שקט</b></div>`;
const safari = `${web}<div class="bar-i"><div class="pill">kalmea.app</div><div class="tools">${ARROW('M15 5l-7 7 7 7')}${ARROW('M9 5l7 7-7 7')}${SHARE}${ARROW('M4 6h16v13H4zM12 6v13')}${ARROW('M8 8h12v12H8zM4 16V4h12')}</div></div>`;
const chrome = `${web}<div class="bar-a"><div class="dots"><i></i><i></i><i></i></div><div class="pill">kalmea.app</div></div>`;
const mock = (a, b, inner, anim = 'fade') => el('mock', a, b, anim, inner);
/** A tap at a point inside the drawn phone. */
const tap = (t, x, y) => el('tap', t, +(t + 1).toFixed(2), 'pop', '', `left:${L + 8 + x - 29}px;top:${T + 8 + y - 29}px`);
const step = (a, b, n) => el('step', a, b, 'pop', String(n));
const hint = (a, b, s, top = 838) => el('hint', a, b, 'up', s, `top:${top}px`);
const homeScreen = `<div class="home"><div class="grid">${'<i></i>'.repeat(11)}</div></div>`;
const hicon = (t, b) => el('hicon', t, b, 'pop', `<img src="${ICON}"><span>Kalmea</span>`);

const tl = timeline();

tl.scene(4.2, (at, end) => `
  ${title(at(0.1), end, 'קלמיה', 'על מסך הבית', 'big')}
  ${el('', at(0.8), end, 'pop', `<img src="${ICON}" style="width:190px;border-radius:44px;display:block;box-shadow:0 24px 50px -20px rgba(31,58,48,.5)">`, 'left:175px;top:370px')}
  ${hint(at(1.5), end, 'נפתחת בלחיצה אחת, כמו כל אפליקציה', 620)}`);

tl.scene(6.4, (at, end) => `
  ${title(at(0.1), end, 'קודם כל:', 'פותחים בדפדפן')}
  ${el('chk', at(0.7), end, 'up', '<span class="ok">✓</span> באייפון: <b>Safari</b>', 'top:300px')}
  ${el('chk', at(1.3), end, 'up', '<span class="ok">✓</span> באנדרואיד: <b>Chrome</b>', 'top:376px')}
  ${el('chk', at(2.1), end, 'up', '<span class="no">✗</span> לא מתוך וואטסאפ או אינסטגרם', 'top:452px')}
  ${hint(at(3), end, 'נכנסים ל-kalmea.app ומתחברים לחשבון', 560)}`);

// ── iPhone ─────────────────────────────────────────────────────────────────────────
tl.scene(3, (at, end) => `${title(at(0.1), end, 'באייפון', '', 'big')}${el('', at(0.5), end, 'pop', `<img src="${BASE}/flower-full.png" style="width:200px;display:block">`, 'left:170px;top:300px')}`);

tl.scene(4.6, (at, end) => `
  ${title(at(0.1), end, 'כפתור השיתוף')}
  ${step(at(0.3), end, 1)}${mock(at(0.1), end, safari)}${tap(at(1.8), 152, 554)}
  ${hint(at(0.9), end, 'הריבוע עם החץ, בסרגל של Safari')}`);

tl.scene(5, (at, end) => `
  ${title(at(0.1), end, 'הוספה למסך הבית')}
  ${step(at(0.3), end, 2)}${mock(at(0.1), end, `${safari}<div class="dim"></div><div class="sheet"><div class="row"><span>העתקה</span></div><div class="row"><span>הוספה לסימניות</span></div><div class="row on"><span>הוספה למסך הבית</span>${PLUS}</div><div class="row"><span>הדפסה</span></div></div>`)}
  ${tap(at(2.2), 150, 487)}
  ${hint(at(0.9), end, 'לא מופיע? גוללים קצת למטה ברשימה')}`);

tl.scene(4.4, (at, end) => `
  ${title(at(0.1), end, 'לוחצים "הוספה"')}
  ${step(at(0.3), end, 3)}${mock(at(0.1), end, `<div class="web" style="background:#F2F2F7"></div><div class="ihead"><span>ביטול</span><b>הוספה למסך הבית</b><span>הוספה</span></div><div class="ibody"><img src="${ICON}"><div class="n">Kalmea</div></div>`)}
  ${tap(at(1.8), 48, 46)}
  ${hint(at(0.9), end, 'בפינה העליונה של המסך')}`);

tl.scene(5.2, (at, end) => `
  ${title(at(0.1), end, 'זהו, היא שם!')}
  ${mock(at(0.1), end, homeScreen)}${hicon(at(0.8), end)}${petals(390, 480, at(0.9), 10)}
  ${hint(at(1.8), end, 'בפתיחה הראשונה מתחברים עוד פעם אחת, וזה רגיל באייפון')}`);

// ── Android ────────────────────────────────────────────────────────────────────────
tl.scene(3, (at, end) => `${title(at(0.1), end, 'באנדרואיד', '', 'big')}${el('', at(0.5), end, 'pop', `<img src="${BASE}/flower-full.png" style="width:200px;display:block">`, 'left:170px;top:300px')}`);

tl.scene(4.6, (at, end) => `
  ${title(at(0.1), end, 'שלוש הנקודות')}
  ${step(at(0.3), end, 1)}${mock(at(0.1), end, chrome)}${tap(at(1.8), 25, 44)}
  ${hint(at(0.9), end, 'בפינה העליונה של Chrome')}`);

tl.scene(5.2, (at, end) => `
  ${title(at(0.1), end, 'הוספה למסך הבית')}
  ${step(at(0.3), end, 2)}${mock(at(0.1), end, `${chrome}<div class="menu"><div class="row"><span>כרטיסייה חדשה</span></div><div class="row"><span>היסטוריה</span></div><div class="row on"><span>הוספה למסך הבית</span></div><div class="row"><span>הגדרות</span></div></div>`)}
  ${tap(at(2.2), 125, 190)}
  ${hint(at(0.9), end, 'בחלק מהטלפונים כתוב: התקנת האפליקציה')}`);

tl.scene(4.4, (at, end) => `
  ${title(at(0.1), end, 'מאשרים')}
  ${step(at(0.3), end, 3)}${mock(at(0.1), end, `${chrome}<div class="dim"></div><div class="dlg"><h4>הוספה למסך הבית</h4><img class="i" src="${ICON}"><div class="n">Kalmea</div><div class="acts"><span>ביטול</span><span>הוספה</span></div></div>`)}
  ${tap(at(1.8), 113, 361)}
  ${hint(at(0.9), end, 'ואם הטלפון שואל שוב, מאשרים פעם נוספת')}`);

tl.scene(4.2, (at, end) => `
  ${title(at(0.1), end, 'זהו, היא שם!')}
  ${mock(at(0.1), end, homeScreen)}${hicon(at(0.8), end)}${petals(390, 480, at(0.9), 10)}`);

tl.scene(5.2, (at) => endCard(at(0.1), 'נתקעת?', 'אנחנו כאן בוואטסאפ'));

const seconds = tl.seconds;
const html = page(tl.html, CSS);

if (stillAt != null) {
  log(`still -> ${await render({ html, seconds, still: +stillAt })} (${seconds} s)`);
} else {
  if (!fs.existsSync(MUSIC)) throw new Error(`missing the music file ${MUSIC}`);
  const mix = path.join(DIR, 'home-icon-audio.m4a');
  ff(['-stream_loop', '-1', '-i', MUSIC, '-t', String(seconds), '-af', `volume=0.5,afade=t=in:st=0:d=0.8,afade=t=out:st=${(seconds - 2).toFixed(2)}:d=2`, '-c:a', 'aac', '-b:a', '128k', mix]);
  const outFile = path.join(TUT, 'kalmea-tutorial-home-icon.mp4');
  await render({ html, seconds, outFile, audio: mix });
  log(`${seconds} s, ${(fs.statSync(outFile).size / 1048576).toFixed(1)} MB -> ${outFile}`);
  ff(['-ss', '4.9', '-i', outFile, '-frames:v', '1', '-q:v', '4', path.join(TUT, 'kalmea-home-icon-poster.jpg')]);
  ff(['-i', outFile, '-vf', 'fps=1/2.5,scale=180:-1,tile=8x3', '-frames:v', '1', path.join(TUT, 'home-icon-sheet.png')]);
}
