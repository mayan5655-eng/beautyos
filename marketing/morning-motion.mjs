// marketing/morning-motion.mjs
//
// The tutorial video "connecting Morning (Green Invoice) to Kalmea", for the cosmetician who wants her legal receipts issued by
// her own Morning account. Same style as home-icon-motion.mjs: DRAWN screens (her Morning account cannot be filmed, and no real
// keys may appear), on-screen titles and music, so it works with the sound off. No Morning logo or design: a plain settings page
// with Morning's own menu words, and Kalmea's own card as it is in app/beautyos.jsx (Settings > חיבורים).
//
// What it may claim, and where each claim comes from:
//   - the path in Morning (הגדרות > כלים למפתחים > מפתחות API) and "an API plan (Best and up)": the hint under the card in the app;
//     a plan without API answers "Product is not included in your subscription" (seen 2026-11-03).
//   - "first choose the business type": the card's own rule (the connect button is off until business_tax_status is set).
//   - what happens next: lib/legalReceipts (cash, transfer, Bit at the till -> a document from her Morning account; a Grow card
//     payment gets Grow's document, never a second one; a cancelled payment gets a linked cancelling document).
// The keys on screen are made up and partly hidden.
//
//   node morning-motion.mjs                 -> out/tutorials/kalmea-tutorial-morning.mp4 + poster
//   node morning-motion.mjs --frame=12.5    -> one still, out/motion/frame.png
//
// Music: "Beauty Skincare Cosmetic Music" by GR0ZA, Pixabay Content License (see welcome-motion.mjs). Without the music file
// (it is not committed) the video gets a silent track and says so.

import fs from 'node:fs';
import path from 'node:path';
import { BASE, OUT, ff, log } from './lib.mjs';
import { DIR, MUSIC, el, lines, title, petals, timeline, page, render } from './motion-lib.mjs';

const stillAt = process.argv.find((a) => a.startsWith('--frame='))?.split('=')[1];
const TUT = path.join(OUT, 'tutorials');
for (const d of [TUT, DIR]) fs.mkdirSync(d, { recursive: true });

const ICON = `${BASE}/icons/icon-192.png`;
const L = 110, T = 225, PW = 320, PH = 600; // the drawn phone, on the 540x960 stage

const CSS = `
.mock{left:${L}px;top:${T}px;width:${PW}px;height:${PH}px;border-radius:38px;overflow:hidden;background:#fff;border:8px solid #1F3A30;box-sizing:border-box;box-shadow:0 30px 60px -24px rgba(31,58,48,.45)}
.scr{position:absolute;inset:0;background:#FBF8F1;padding:22px 16px;box-sizing:border-box;direction:rtl}
.scr.web{background:#F5F6F8}
.url{background:#E9EBEF;border-radius:10px;font:600 13px KA;color:#555;text-align:center;padding:6px;direction:ltr;margin-bottom:14px}
.h{font:700 21px KF;color:#1F3A30;margin:4px 0 12px}
.web .h{color:#2B2B2B}
.item{background:#fff;border-radius:12px;padding:12px 14px;margin-bottom:8px;font:600 16px KA;color:#333;display:flex;justify-content:space-between;align-items:center}
.item.on{background:#FCE9EC;box-shadow:inset 0 0 0 3px #E8A9B5}
.item small{font:600 12px KA;color:#8A948F}
.card{background:#fff;border:1px solid #E4DCCF;border-radius:16px;padding:14px;margin-top:6px}
.card b{display:block;font:700 16px KA;color:#1F3A30;margin-bottom:6px}
.card p{margin:0 0 8px;font:600 12px/1.45 KA;color:#6B756F}
.inp{border:1px solid #D9D1C4;border-radius:10px;padding:9px 10px;font:600 14px KA;color:#9AA29E;background:#fff;margin-bottom:8px;direction:ltr;text-align:left}
.inp.full{color:#1F3A30}
.btn{background:#1F3A30;color:#fff;border-radius:12px;text-align:center;font:700 16px KA;padding:11px}
.btn.web{background:#2F6FEB}
.key{background:#fff;border-radius:12px;padding:12px;margin-bottom:8px}
.key small{display:block;font:600 12px KA;color:#8A948F;margin-bottom:4px}
.key div{display:flex;justify-content:space-between;align-items:center;direction:ltr;font:600 14px KA;color:#222}
.key span.cp{font:700 12px KA;color:#2F6FEB;background:#EAF0FD;border-radius:8px;padding:4px 8px}
.ok{color:#2E7D57;font:700 18px KA;margin-top:10px}
.radio{display:flex;gap:8px;margin-bottom:8px}.radio span{flex:1;text-align:center;border:1px solid #D9D1C4;border-radius:10px;padding:9px 4px;font:600 14px KA;color:#3B4842;background:#fff}
.radio span.on{background:#1F3A30;color:#fff;border-color:#1F3A30}
.tap{width:58px;height:58px;border-radius:50%;background:rgba(232,120,146,.42);border:3px solid #E87892;box-sizing:border-box}
.step{left:26px;top:178px;width:40px;height:40px;border-radius:50%;background:#1F3A30;color:#fff;font:700 22px KF;display:flex;align-items:center;justify-content:center}
.hint{left:24px;right:24px;text-align:center;font:600 21px/1.35 KA;color:#3B4842}
.chk{left:40px;right:40px;background:#fff;border-radius:16px;padding:12px 16px;font:600 19px/1.35 KA;color:#1F3A30;box-shadow:0 14px 30px -14px rgba(31,58,48,.38)}
.chk .y{color:#2E7D57}`;

const mock = (a, b, inner, anim = 'fade') => el('mock', a, b, anim, inner);
/** A tap at a point inside the drawn phone. */
const tap = (t, x, y) => el('tap', t, +(t + 1).toFixed(2), 'pop', '', `left:${L + 8 + x - 29}px;top:${T + 8 + y - 29}px`);
const step = (a, b, n) => el('step', a, b, 'pop', String(n));
const hint = (a, b, s, top = 838) => el('hint', a, b, 'up', s, `top:${top}px`);
const chk = (a, b, s, top) => el('chk', a, b, 'up', `<span class="y">✓</span> ${s}`, `top:${top}px`);

// Kalmea's own screens (app/beautyos.jsx), drawn.
const kalmeaBusiness = (chosen) => `<div class="scr"><div class="h">העסק שלי</div>
  <div class="card"><b>סוג העסק</b><div class="radio"><span class="${chosen ? 'on' : ''}">עוסקת פטורה</span><span>עוסקת מורשית</span></div>
  <p>הסוג קובע איזה מסמך יופק: קבלה, או חשבונית מס קבלה.</p></div><div style="height:12px"></div><div class="btn">שמירה</div></div>`;
const kalmeaCard = (filled, connected) => `<div class="scr"><div class="h">חיבורים</div>
  <div class="card"><b>קבלות וחשבוניות חוקיות (מורנינג)</b>
  ${connected
    ? '<div class="ok">✓ מחוברת</div><p style="margin-top:8px">מעכשיו כל תשלום בקופה מקבל מסמך מהחשבון שלך.</p>'
    : `<p>מפתח נוצר במורנינג: הגדרות, כלים למפתחים, מפתחות API.</p>
  <div class="inp ${filled ? 'full' : ''}">${filled ? '7c2e••••••••••' : 'מזהה המפתח (API key id)'}</div>
  <div class="inp ${filled ? 'full' : ''}">${filled ? '••••••••••••••••' : 'הסוד (API secret)'}</div>
  <div class="btn">חיבור החשבון</div>`}</div></div>`;
// Her Morning account, drawn plainly (menu words only, no logo, no design).
const morningMenu = `<div class="scr web"><div class="url">morning</div><div class="h">הגדרות</div>
  <div class="item"><span>פרטי העסק</span></div><div class="item"><span>מסמכים</span></div>
  <div class="item on"><span>כלים למפתחים</span><small>‹</small></div><div class="item"><span>משתמשים</span></div></div>`;
const morningKeys = `<div class="scr web"><div class="url">morning</div><div class="h">מפתחות API</div>
  <p style="font:600 13px/1.5 KA;color:#666;margin:0 0 14px">מפתח מאפשר לתוכנה אחרת להפיק מסמכים בחשבון שלך.</p>
  <div class="btn web">הוספת מפתח</div></div>`;
const morningNewKey = `<div class="scr web"><div class="url">morning</div><div class="h">המפתח נוצר</div>
  <div class="key"><small>מזהה (ID)</small><div><span>7c2e••••-••••-••••</span><span class="cp">העתקה</span></div></div>
  <div class="key"><small>סוד (Secret)</small><div><span>••••••••••••••••</span><span class="cp">העתקה</span></div></div></div>`;

const tl = timeline();

tl.scene(4.4, (at, end) => `
  ${title(at(0.1), end, 'קבלות חוקיות', 'ישירות ממורנינג', 'big')}
  ${el('', at(0.8), end, 'pop', `<img src="${ICON}" style="width:170px;border-radius:40px;display:block;box-shadow:0 24px 50px -20px rgba(31,58,48,.5)">`, 'left:185px;top:390px')}
  ${hint(at(1.5), end, 'מחברים פעם אחת, וכל תשלום בקופה מקבל מסמך מהחשבון שלך', 620)}`);

tl.scene(6.4, (at, end) => `
  ${title(at(0.1), end, 'מה צריך?')}
  ${chk(at(0.7), end, 'חשבון מורנינג במסלול שכולל API<br><small style="font-size:16px;color:#6B756F">מסלול Best ומעלה</small>', 290)}
  ${chk(at(1.4), end, 'סוג העסק מסומן בקלמיה', 410)}
  ${chk(at(2.1), end, 'בערך 3 דקות, פעם אחת', 486)}
  ${hint(at(3), end, 'במסלול שאין בו API, מורנינג לא יאפשרו ליצור מפתח', 600)}`);

tl.scene(5.2, (at, end) => `
  ${title(at(0.1), end, 'בקלמיה: סוג העסק')}
  ${step(at(0.3), end, 1)}${mock(at(0.1), end, kalmeaBusiness(false))}
  ${el('mock', at(1.9), end, 'fade', kalmeaBusiness(true))}${tap(at(1.6), 225, 128)}${tap(at(2.8), 152, 236)}
  ${hint(at(0.9), end, 'הגדרות ← העסק שלי ← בוחרים ושומרים')}`);

tl.scene(5, (at, end) => `
  ${title(at(0.1), end, 'במורנינג: הגדרות')}
  ${step(at(0.3), end, 2)}${mock(at(0.1), end, morningMenu)}${tap(at(2), 152, 196)}
  ${hint(at(0.9), end, 'נכנסים לחשבון שלך במורנינג ← כלים למפתחים')}`);

tl.scene(5, (at, end) => `
  ${title(at(0.1), end, 'מפתחות API')}
  ${step(at(0.3), end, 3)}${mock(at(0.1), end, morningKeys)}${tap(at(2), 152, 158)}
  ${hint(at(0.9), end, 'לוחצים על "הוספת מפתח"')}`);

tl.scene(5.6, (at, end) => `
  ${title(at(0.1), end, 'מעתיקים שני קודים')}
  ${step(at(0.3), end, 4)}${mock(at(0.1), end, morningNewKey)}${tap(at(1.8), 247, 126)}${tap(at(3.2), 247, 206)}
  ${hint(at(0.9), end, 'מזהה וסוד. את הסוד לא שולחים לאף אחד')}`);

tl.scene(6.2, (at, end) => `
  ${title(at(0.1), end, 'בקלמיה: חיבורים')}
  ${step(at(0.3), end, 5)}${mock(at(0.1), end, kalmeaCard(false, false))}
  ${el('mock', at(2.4), end, 'fade', kalmeaCard(true, false))}${tap(at(1.6), 152, 166)}${tap(at(2.2), 152, 210)}${tap(at(3.8), 152, 256)}
  ${hint(at(0.9), end, 'מדביקים את שני הקודים ← "חיבור החשבון"')}`);

tl.scene(4.6, (at, end) => `
  ${title(at(0.1), end, 'זהו, מחוברת!')}
  ${mock(at(0.1), end, kalmeaCard(true, true))}${petals(270, 400, at(0.6), 10)}`);

tl.scene(7.4, (at, end) => `
  ${title(at(0.1), end, 'ומעכשיו')}
  ${chk(at(0.7), end, 'מזומן, העברה או ביט בקופה:<br>קבלה מהחשבון שלך במורנינג', 260)}
  ${chk(at(1.6), end, 'אשראי דרך Grow:<br>המסמך מגיע מ-Grow, בלי כפילות', 400)}
  ${chk(at(2.5), end, 'ביטלת תשלום?<br>יוצא מסמך ביטול שמקושר אליו', 540)}`);

// The ending has no presenter: the owner wants no AI figures (2026-10-30). Same ending as the other tutorials.
tl.scene(4.6, (at) => `
  ${el('', at(0.2), 999, 'pop', `<img src="${ICON}" style="width:150px;border-radius:34px;display:block">`, 'left:195px;top:190px')}
  ${el('title big', at(0.5), 999, 'up', lines(['נתקעת?', 'אנחנו כאן בוואטסאפ']), 'top:380px')}
  ${el('phoneno', at(1.2), 999, 'up', '<div class="ltr">050-7321978</div>', 'top:590px')}
  <img class="el" src="${BASE}/kalmea-wordmark.png" data-in="${at(1.7)}" data-out="999" data-a="pop" style="left:180px;top:680px;width:180px">`);

const seconds = tl.seconds;
const html = page(tl.html, CSS);

if (stillAt != null) {
  log(`still -> ${await render({ html, seconds, still: +stillAt })} (${seconds} s)`);
} else {
  const mix = path.join(DIR, 'morning-audio.m4a');
  if (fs.existsSync(MUSIC)) {
    ff(['-stream_loop', '-1', '-i', MUSIC, '-t', String(seconds), '-af', `volume=0.5,afade=t=in:st=0:d=0.8,afade=t=out:st=${(seconds - 2).toFixed(2)}:d=2`, '-c:a', 'aac', '-b:a', '128k', mix]);
  } else {
    log(`NO MUSIC: ${MUSIC} is missing, so this render has a silent track`);
    ff(['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', String(seconds), '-c:a', 'aac', '-b:a', '64k', mix]);
  }
  const outFile = path.join(TUT, 'kalmea-tutorial-morning.mp4');
  await render({ html, seconds, outFile, audio: mix });
  ff(['-ss', '1.8', '-i', outFile, '-frames:v', '1', '-q:v', '3', path.join(TUT, 'kalmea-tutorial-morning.jpg')]);
  log(`video -> ${outFile} (${seconds.toFixed(1)} s)`);
}
