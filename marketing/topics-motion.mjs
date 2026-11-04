// marketing/topics-motion.mjs
//
// Six short tutorial videos for /tutorials, one topic each, in the style of morning-motion.mjs: DRAWN app screens inside a
// phone (no real account is filmed, no real client appears), handwritten step titles, one caption line under the phone, and
// the same Kalmea flower end card with the support line. No AI presenter or figure anywhere (owner, 2026-10-30).
//
//   node topics-motion.mjs <id>              -> out/tutorials/kalmea-tutorial-<id>.mp4 + poster
//   node topics-motion.mjs <id> --publish    and copies both over public/tutorials/kalmea-<id>.{mp4,jpg}
//   node topics-motion.mjs <id> --frame=12.5 -> one still, out/motion/frame.png
//   node topics-motion.mjs <id> --stills=all -> a draft still every 1.5 s (or --stills=3,7.5), out/motion/s-<id>-<t>.png
//   Needs KALMEA_BASE serving public/ with CORS for the fonts (production, or a local static server) and, in a cloud
//   session, KALMEA_CHROMIUM=/opt/pw-browsers/chromium.
//   ids: appointment-actions | clients | till | reminders | my-page | services-hours | ai
//
// Every word drawn inside the phone is the app's own text, copied from the code (2026-11-04):
//   appointment-actions  app/MyDayCard.jsx (rows open the appointment, "✦ תור חדש"), lib/myDay.js (headline, gap line),
//                        lib/apptStatus.js (אישרה / ממתינה לאישור), app/beautyos.jsx APPT MODAL (the action row at the top of
//                        "עריכת תור": ₪ לתשלום, תזכורת, כרטיס לקוחה, ביטול התור), handleDelete (the confirm and "התור בוטל" +
//                        "החזרה"; the message to the client then waits in "הודעות מוכנות לשליחה"), handleOpenCashier.
//   clients              CLIENT MODAL ("לקוחה חדשה"), the import hub ("ייבוא נתונים", app/ImportChooser.tsx), lib/importMapping.js
//                        IMPORT_SPEC.clients, the mapping and result stages, the client drawer and its tabs.
//   till                 CASHIER MODAL (search, "+ הוסיפי שירות", הנחה ₪/%, טיפ, אמצעי תשלום, "שלחי בקשת תשלום", "רשמי תשלום ✓"),
//                        RECEIPT MODAL ("אישור תשלום", never "קבלה": lib/legalReceipts/policy.js), the agenda card ("✓ שולם").
//   reminders            "דורש תשומת לב" item and the "הודעות מוכנות לשליחה" sheet ("שליחה" -> "✓ נפתח", "סיימתי"),
//                        /api/send-reminder-manual's message (lib/messages.js), app/confirm/page.jsx + app/api/confirm (the
//                        client's side). Automatic sending is NOT shown: it is hidden until the central number works
//                        (waCentralConnected), so the video only shows her sending each message from her own WhatsApp.
//   my-page              Settings > הדף שלי ("הכתובת של העמוד שלך", "הקישורים שלך" and the ?src= chips), copyPublicLink's toast,
//                        app/BookingPage.jsx (services, day and hour, summary, consent, "התור נקבע!", address + "ניווט ב-Waze").
//   services-hours       Settings > יומן ושירותים (empty state, "רשימת טיפולים מוכנה", the price and minutes row, "+ הוסיפי
//                        שירות"), the seven-day hours list, "הפסקה שלי", the settings bar's "שמירה ✓" and "ההגדרות נשמרו".
//   ai                   the business advisor (activeTab "advisor": reached from "עוד" on a phone, the sidebar on a computer;
//                        its empty state, the four suggested questions, lib/advisorWait.js, advisorAction's button) and the AI
//                        block of the content tab (app/design/DesignStudio.jsx "עם AI", Generate.jsx with its "3 מתוך 9 החודש"
//                        counter, AiFill.jsx "מילוי עם AI", WeekView.jsx "מה לצלם השבוע", the reel script view in beautyos.jsx),
//                        and the limits (lib/ai/callCaps.ts designs/generate = 9 a month, lib/ai/capMessages.ts "מתחדשות בראשון
//                        לחודש"). The advisor's answer, the posts and the scripts are EXAMPLES written for the video and say so on
//                        screen where it matters; the posts are drawn as soft shapes, never a person. Not shown, because they are
//                        off by default: the weekly content plan and publishing to Instagram/Facebook (content_plan,
//                        content_publish_meta), the old campaign texts, the CE.SDK reel POC, add-on packs; nor anything that
//                        sends WhatsApp automatically.
// Where the app's own line has an em or en dash it is shortened, never re-worded (the owner's copy rule for new text): e.g. the
// till's title "קופה — תשלום חדש" is drawn as "קופה". Names, phones and sums are made up; the phones are the app's placeholders.
//
// Hebrew: drawn by Chromium, every line its own element with the break chosen here, nothing auto-wraps (white-space:nowrap and
// a check that fails the render if any line is wider than its box or leaves the phone's screen). Sums are written "₪80" with
// the sign glued to the digits, and no caption line starts with a digit.
//
// Music: as morning-motion.mjs (not committed; without it the video gets a silent track and says so).

import fs from 'node:fs';
import path from 'node:path';
import { BASE, OUT, ff, log, openBrowser } from './lib.mjs';
import { DIR, MUSIC, W, H, el, lines, title, petals, timeline, page, render } from './motion-lib.mjs';

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--'));
const stillAt = args.find((a) => a.startsWith('--frame='))?.split('=')[1];
const PUBLISH = args.includes('--publish');
const TUT = path.join(OUT, 'tutorials');
for (const d of [TUT, DIR]) fs.mkdirSync(d, { recursive: true });

const ICON = `${BASE}/icons/icon-192.png`;
const L = 110, T = 225, PW = 320, PH = 600; // the drawn phone, on the 540x960 stage (as in morning-motion.mjs)
// Her own accent (settings.primary_color drives her screens; here the default petal pink), not Kalmea's chrome.
const PC = '#E9A9A1', PCT = '#FBEDE9', PCD = '#8E4F47';

const CSS = `
.mock{left:${L}px;top:${T}px;width:${PW}px;height:${PH}px;border-radius:38px;overflow:hidden;background:#fff;border:8px solid #1F3A30;box-sizing:border-box;box-shadow:0 30px 60px -24px rgba(31,58,48,.45)}
.scr{position:absolute;inset:0;background:#FBF8F1;padding:20px 14px 0;box-sizing:border-box;direction:rtl;font:600 13px/1.4 KA;color:#1F3A30;overflow:hidden}
.scr *{box-sizing:border-box}
.scr p{margin:0}
.scr .nw,.scr .nw *{white-space:nowrap}
.h{font:700 21px KF;color:#1F3A30;margin:2px 0 10px}
.kick{font:600 11px KA;color:#6B756F;margin-bottom:1px}
.card{background:#fff;border:1px solid #E4DCCF;border-radius:16px;padding:12px;margin-bottom:10px}
.row{display:flex;align-items:center;gap:8px}
.sb{justify-content:space-between}
.mu{color:#6B756F;font-size:12px}
.mu2{color:#8A948F;font-size:11px}
.b{font-weight:700}
.pill{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:0 12px;height:32px;font:700 12.5px KA;white-space:nowrap}
.pill.tint{background:${PCT};border:1px solid ${PC};color:#1F3A30}
.pill.green{background:#1F3A30;color:#fff}
.pill.ghost{background:#fff;border:1px solid #D9D1C4;color:#1F3A30}
.pill.red{background:#fff;border:1px solid #D9D1C4;color:#C2413A}
.pill.ok{background:rgba(70,179,123,.12);color:#2E7D57;height:26px;padding:0 10px}
.pill.okb{background:#fff;border:1px solid #2E7D57;color:#2E7D57}
.btn{display:flex;align-items:center;justify-content:center;border-radius:12px;height:40px;font:700 14px KA;white-space:nowrap}
.btn.pc{background:linear-gradient(135deg,#F2C2BA,${PC});color:#1F3A30}
.btn.line{background:#fff;border:1px solid #D9D1C4;color:#3B4842}
.btn.dk{background:#1F3A30;color:#fff}
.btn.danger{background:#D9534F;color:#fff}
.btn.wa{background:#25D366;color:#fff}
.inp{border:1px solid #D9D1C4;border-radius:10px;height:36px;padding:0 10px;display:flex;align-items:center;font:600 13px KA;color:#9AA29E;background:#F6F2EA;white-space:nowrap;overflow:hidden}
.inp.f{color:#1F3A30;background:#fff}
.inp.ok{border-color:#2E7D57;background:#fff;color:#1F3A30}
.inp.ta{height:auto;min-height:36px;padding:7px 10px;align-items:flex-start;flex-direction:column;line-height:1.5}
.lbl{font:600 11.5px KA;color:#6B756F;margin:0 0 3px}
.chip{display:inline-flex;align-items:center;justify-content:center;height:30px;padding:0 10px;border-radius:9px;border:1px solid #D9D1C4;background:#fff;font:600 12px KA;color:#3B4842;white-space:nowrap}
.chip.on{background:linear-gradient(135deg,#F2C2BA,${PC});border-color:transparent;color:#1F3A30;font-weight:700}
.chips{display:flex;flex-wrap:wrap;gap:5px}
.dim{position:absolute;inset:0;background:rgba(31,58,48,.30)}
.sheet{position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:22px 22px 0 0;padding:14px 14px 16px;box-shadow:0 -10px 30px -12px rgba(31,58,48,.4)}
.sheet .st{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.sheet .st b{font:700 17px KF;color:#1F3A30}
.sheet .st span{font:600 14px KA;color:#8A948F}
.nav{position:absolute;left:0;right:0;bottom:0;height:52px;background:#fff;border-top:1px solid #E4DCCF;display:flex;justify-content:space-around;align-items:center;font:600 11.5px KA;color:#8A948F}
.nav span.on{color:#1F3A30;font-weight:700}
.toast{position:absolute;left:14px;right:14px;bottom:64px;background:#1F3A30;color:#FBF8F1;border-radius:14px;padding:10px 12px;font:700 12.5px KA;display:flex;justify-content:space-between;align-items:center;white-space:nowrap;box-shadow:0 10px 24px -10px rgba(31,58,48,.6)}
.toast u{text-decoration:none;color:${PC}}
.dayrow{display:flex;align-items:center;gap:9px;padding:7px 2px;border-top:1px solid #F0EAE0}
.dayrow .tm{width:40px;font:700 13px KA;color:#6B756F}
.dayrow .tm.n{color:#1F3A30}
.dot{width:7px;height:7px;border-radius:50%;flex:none}
.dayrow .who{flex:1;min-width:0}
.dayrow .who b{display:block;font:600 14px KA;color:#1F3A30}
.dayrow .who small{display:block;font:600 11.5px KA;color:#6B756F}
.badge{font:700 11px KA;padding:2px 8px;border-radius:999px;background:${PCT};color:#1F3A30}
.gap{font:600 11.5px KA;color:#6B756F;padding:0 0 4px 0;padding-inline-start:51px}
.url{background:#E9EBEF;border-radius:10px;font:600 12px KA;color:#555;text-align:center;padding:5px;direction:ltr;margin-bottom:10px;white-space:nowrap}
.drawer{position:absolute;left:0;right:0;top:0;background:linear-gradient(135deg,#F2C2BA 0%,${PC} 100%);padding:18px 14px 14px;color:#fff}
.drawer .av{width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;font:700 20px KF;flex:none}
.drawer h3{margin:0;font:700 19px KF;color:#fff}
.drawer .tg{font:700 11px KA;background:rgba(255,255,255,.3);padding:2px 8px;border-radius:999px}
.dbtn{flex:1;display:flex;align-items:center;justify-content:center;height:34px;border-radius:12px;font:700 12px KA;white-space:nowrap}
.dbtn.w{background:#fff;color:${PCD}}
.dbtn.t{background:rgba(255,255,255,.28);color:#fff}
.dbtn.o{background:transparent;border:1.5px solid rgba(255,255,255,.85);color:#fff}
.tabs{display:flex;gap:2px;border-bottom:1px solid #E4DCCF;padding:0 14px;font:600 12px KA;color:#8A948F;white-space:nowrap}
.tabs span{padding:8px 6px}
.tabs span.on{color:${PCD};font-weight:700;border-bottom:2.5px solid ${PC}}
.kv{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #F0EAE0;font-size:12.5px}
.kv span:first-child{color:#6B756F}
.box{border-radius:10px;padding:8px 10px;margin-top:8px}
.chat{position:absolute;inset:0;background:#EFE7DD;direction:rtl}
.chat .top{height:52px;background:#2F5D50;color:#fff;display:flex;align-items:center;gap:10px;padding:0 14px;font:700 15px KA}
.chat .top .av{width:32px;height:32px;border-radius:50%;background:#DCE4D5;color:#1F3A30;display:flex;align-items:center;justify-content:center;font:700 14px KF}
.chat .top small{display:block;font:600 11px KA;opacity:.8}
.msg{position:absolute;right:12px;left:40px;background:#D9FDD3;border-radius:12px 2px 12px 12px;padding:9px 11px;font:600 12.5px/1.5 KA;color:#1F2A24;box-shadow:0 1px 1px rgba(0,0,0,.12)}
.msg div{white-space:nowrap}
.lk{color:#1D6FB8;direction:ltr;unicode-bidi:isolate}
.compose{position:absolute;left:8px;right:8px;bottom:10px;display:flex;gap:8px;align-items:flex-end}
.compose .in{flex:1;background:#fff;border-radius:18px;padding:8px 12px;font:600 12px/1.5 KA;color:#1F2A24}
.compose .in div{white-space:nowrap}
.compose .snd{width:40px;height:40px;border-radius:50%;background:#2F5D50;flex:none;display:flex;align-items:center;justify-content:center;color:#fff;font:700 16px KA}
.pub{position:absolute;inset:0;background:#FBF8F1;padding:14px 14px 0;direction:rtl;text-align:center;font:600 13px/1.4 KA;color:#1F3A30}
.pub p{margin:0}
.chat{font:600 13px/1.4 KA}
.pub .bh{display:flex;align-items:center;justify-content:center;gap:8px;margin:4px 0 16px}
.pub .lg{width:34px;height:34px;border-radius:50%;background:${PCT};border:1px solid ${PC};display:flex;align-items:center;justify-content:center;font:700 15px KF;color:${PCD}}
.pub .bn{font:700 16px KF;color:#1F3A30}
.pub h1{font:700 24px KF;color:#1F3A30;margin:6px 0 8px}
.pub .pp{font:600 13.5px/1.6 KA;color:#3B4842}
.mark{width:56px;height:56px;border-radius:50%;margin:0 auto 8px;display:flex;align-items:center;justify-content:center;font:700 26px KA}
.svc{background:#fff;border:1px solid #E4DCCF;border-radius:14px;overflow:hidden;text-align:center}
.svc .ph{height:62px;background:linear-gradient(135deg,${PCT},#DCE4D5)}
.svc b{display:block;font:700 13.5px KF;color:#1F3A30;margin:8px 0 2px}
.svc small{display:block;font:600 11px KA;color:#8A948F}
.svc .cta{margin:8px 10px 10px;height:30px;border-radius:999px;background:${PCT};border:1px solid #F2C2BA;font:600 12.5px KA;display:flex;align-items:center;justify-content:center;color:#1F3A30}
.dc{width:50px;flex:none;border-radius:12px;background:#fff;border:1px solid #E4DCCF;text-align:center;padding:7px 0}
.dc.on{background:${PC};border-color:${PC}}
.dc small{display:block;font:600 10.5px KA;opacity:.75}
.dc b{display:block;font:700 17px KF}
.tg2{width:34px;height:20px;border-radius:999px;background:#D9D1C4;position:relative;flex:none}
.tg2::after{content:'';position:absolute;top:2px;right:2px;width:16px;height:16px;border-radius:50%;background:#fff}
.tg2.on{background:${PC}}
.tg2.on::after{right:auto;left:2px}
.hr{display:flex;align-items:center;gap:8px;padding:3px 9px;border-radius:10px;border:1px solid #E4DCCF;background:#F6F2EA;margin-bottom:4px}
.hr.off{background:#fff;opacity:.6}
.hr .dn{width:44px;font:600 12.5px KA}
.sel{border:1px solid #D9D1C4;border-radius:8px;padding:2px 8px;font:600 12px KA;background:#fff;direction:ltr}
.tsep{width:8px;height:1.5px;background:#8A948F}
.ring{border:3px solid #E87892;border-radius:14px;box-sizing:border-box;box-shadow:0 0 0 4px rgba(232,120,146,.18)}
.tap{width:58px;height:58px;border-radius:50%;background:rgba(232,120,146,.42);border:3px solid #E87892;box-sizing:border-box}
.step{left:26px;top:178px;width:40px;height:40px;border-radius:50%;background:#1F3A30;color:#fff;font:700 22px KF;display:flex;align-items:center;justify-content:center}
.hint{left:20px;right:20px;text-align:center;font:600 21px/1.35 KA;color:#3B4842}
.hint div,.title div,.chk div{white-space:nowrap}
.under{left:20px;right:20px;text-align:center}
.under span{display:inline-block;background:#fff;border:1px solid #E4DCCF;border-radius:12px;padding:6px 12px;font:600 17px KA;color:#1F3A30;direction:ltr;box-shadow:0 10px 24px -14px rgba(31,58,48,.4)}
.chk{left:34px;right:34px;background:#fff;border-radius:16px;padding:11px 16px;font:600 19px/1.4 KA;color:#1F3A30;box-shadow:0 14px 30px -14px rgba(31,58,48,.38)}
.chk .y{color:#2E7D57}
.chk small{font-size:15.5px;color:#6B756F}`;

// ── building blocks ──────────────────────────────────────────────────────────────────────────────
let mockN = 0, cur = '';
/** A phone screen shown from a to b; taps and rings after it point at elements inside it by data-k. */
const mock = (a, b, inner, anim = 'fade') => { cur = `m${++mockN}`; return el('mock', a, b, anim, inner, '', `id="${cur}"`); };
const tap = (t, k) => el('tap', t, +(t + 1).toFixed(2), 'pop', '', '', `data-tid="${k}" data-mock="${cur}"`);
const ring = (t, tout, k) => el('ring', t, tout, 'pop', '', '', `data-tid="${k}" data-mock="${cur}" data-ring="1"`);
const step = (a, b, n) => el('step', a, b, 'pop', String(n));
const hint = (a, b, ls, top = 838) => el('hint', a, b, 'up', lines(Array.isArray(ls) ? ls : [ls]), `top:${top}px`);
const chk = (a, b, s, top) => el('chk', a, b, 'up', `<div><span class="y">✓</span> ${s}</div>`, `top:${top}px`);
const chk2 = (a, b, s, sub, top) => el('chk', a, b, 'up', `<div><span class="y">✓</span> ${s}</div><div><small>${sub}</small></div>`, `top:${top}px`);
const under = (a, b, s, top = 838) => el('under', a, b, 'up', `<span>${s}</span>`, `top:${top}px`);
const k = (key) => `data-k="${key}"`;

const nav = (on) => `<div class="nav">${['היום', 'יומן', 'לקוחות', 'תשלום', 'תוכן'].map((l) => `<span class="${l === on ? 'on' : ''}" ${k(`nav-${l}`)}>${l}</span>`).join('')}</div>`;
const sheet = (ttl, inner, top = null) => `<div class="dim"></div><div class="sheet" style="${top == null ? '' : `top:${top}px`}"><div class="st nw"><b>${ttl}</b><span>✕</span></div>${inner}</div>`;
const toast = (s, act = '') => `<div class="toast"><span>${s}</span>${act ? `<u>${act}</u>` : ''}</div>`;

function intro(tl, l1, l2, h) {
  tl.scene(4.4, (at, end) => `
  ${title(at(0.1), end, l1, l2, 'big')}
  ${el('', at(0.8), end, 'pop', `<img src="${ICON}" style="width:170px;border-radius:40px;display:block;box-shadow:0 24px 50px -20px rgba(31,58,48,.5)">`, 'left:185px;top:390px')}
  ${hint(at(1.5), end, h, 620)}`);
}
// The ending has no presenter: the owner wants no AI figures (2026-10-30). Same ending as morning-motion.mjs.
function ending(tl) {
  tl.scene(4.6, (at) => `
  ${el('', at(0.2), 999, 'pop', `<img src="${ICON}" style="width:150px;border-radius:34px;display:block">`, 'left:195px;top:190px')}
  ${el('title big', at(0.5), 999, 'up', lines(['נתקעת?', 'אנחנו כאן בוואטסאפ']), 'top:380px')}
  ${el('phoneno', at(1.2), 999, 'up', '<div class="ltr">050-7321978</div>', 'top:590px')}
  <img class="el" src="${BASE}/kalmea-wordmark.png" data-in="${at(1.7)}" data-out="999" data-a="pop" style="left:180px;top:680px;width:180px">`);
}

// ── shared screens ───────────────────────────────────────────────────────────────────────────────
const DAY = [
  { t: '09:00', who: 'נועה לוי', sub: 'טיפול פנים קלאסי · אישרה', dot: '#DCE4D5', badge: 'עכשיו', key: 'r1' },
  { t: '10:00', who: 'מיכל כהן', sub: 'עיצוב גבות · ממתינה לאישור', dot: 'pend', badge: 'הבאה', key: 'r2', gap: '☕ פנויה שעה וחצי עד 11:50' },
  { t: '11:50', who: 'שירה אברהם', sub: 'הרמת ריסים · אישרה', dot: '#DCE4D5', key: 'r3' },
  { t: '13:30', who: 'דנה מזרחי', sub: 'ניקוי פנים עמוק · ממתינה לאישור', dot: 'pend', key: 'r4' },
];
/** "היום שלי" (app/MyDayCard.jsx) over lib/myDay.js; `patch` changes a row (e.g. after the client confirmed). */
function myDay({ patch = {}, needs = '' } = {}) {
  const rows = DAY.map((r0) => ({ ...r0, ...(patch[r0.key] || {}) }));
  return `<div class="card" style="padding:12px 12px 6px">
    <div class="row sb nw" style="margin-bottom:2px"><span style="font:700 19px KF">היום שלי</span><span class="pill tint" ${k('new')}>✦ תור חדש</span></div>
    <p class="mu nw" style="margin-bottom:6px">4 תורים היום, מ-09:00 עד 14:45</p>
    ${rows.map((r) => `<div class="dayrow nw" ${k(r.key)}><span class="tm ${r.badge ? 'n' : ''}">${r.t}</span>
      <span class="dot" style="${r.dot === 'pend' ? 'border:1px solid #C07A72' : r.badge === 'עכשיו' ? `background:${PC}` : `background:${r.dot}`}"></span>
      <span class="who"><b>${r.who}</b><small>${r.sub}</small></span>${r.badge ? `<span class="badge">${r.badge}</span>` : ''}</div>
      ${r.gap ? `<p class="gap nw">${r.gap}</p>` : ''}`).join('')}
    ${needs}
  </div>`;
}
const onToday = (inner, opts) => `<div class="scr"><p class="h" style="margin-bottom:8px">היום</p>${myDay(opts)}${nav('היום')}${inner}</div>`;
const todayScr = (opts) => `<div class="scr"><p class="h" style="margin-bottom:8px">היום</p>${myDay(opts)}${nav('היום')}</div>`;

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1. appointment-actions
// ════════════════════════════════════════════════════════════════════════════════════════════════
function editSheet() {
  return sheet('עריכת תור', `
    <div class="chips" style="gap:6px;margin-bottom:10px" data-k="actions">
      <span class="pill tint" ${k('pay')}>₪ לתשלום</span><span class="pill ghost" ${k('remind')}>תזכורת</span>
      <span class="pill ghost" ${k('card')}>כרטיס לקוחה</span><span class="pill red" ${k('cancel')}>ביטול התור</span>
    </div>
    <div style="border:1px solid ${PC};background:${PCT};border-radius:10px;padding:8px 10px;margin-bottom:8px" class="nw">
      <p class="b" style="font-size:14.5px">מיכל כהן</p><p class="mu">לקוחה קיימת</p></div>
    <div class="row" style="gap:6px;margin-bottom:8px">
      <div style="flex:1"><p class="lbl">תאריך</p><div class="inp f" style="direction:ltr;justify-content:flex-end">04/11/2026</div></div>
      <div style="flex:1"><p class="lbl">שעה</p><div class="inp f" style="direction:ltr;justify-content:center">10:00</div></div></div>
    <p class="lbl">טיפול</p>
    <div class="chips" style="margin-bottom:12px"><span class="chip on">עיצוב גבות</span><span class="chip">טיפול פנים קלאסי</span><span class="chip">הרמת ריסים</span><span class="chip">ניקוי פנים עמוק</span></div>
    <div class="row" style="gap:6px"><div class="btn line" style="flex:1">ביטול</div><div class="btn pc" style="flex:2">שמירה ✓</div></div>`);
}
function tillSheet({ client = '', search = '', items = [], method = 'מזומן', discount = null, tip = 0, total = 0, request = false, top = 40 } = {}) {
  const methods = ['מזומן', 'אשראי', 'ביט', 'פייבוקס', 'העברה'];
  return sheet('קופה', `
    <div class="inp ${client ? 'ok' : search ? 'f' : ''}" style="margin-bottom:8px" ${k('search')}>${client || search || 'חיפוש לקוחה...'}</div>
    ${search && !client ? `<div style="border-radius:10px;box-shadow:0 8px 20px -8px rgba(31,58,48,.35);margin:-4px 0 8px;background:#fff" ${k('pick')}><div style="padding:7px 10px" class="nw"><p class="b" style="font-size:13.5px">נועה לוי</p><p class="mu" style="direction:ltr;text-align:right">054-1234567</p></div></div>` : ''}
    <div class="row sb nw" style="margin-bottom:5px"><span class="mu b" style="color:#3B4842">פריטים</span><span class="sel" style="direction:rtl;background:${PCT};color:${PCD}" ${k('add')}>+ הוסיפי שירות</span></div>
    ${items.length ? items.map((it) => `<div style="background:${PCT};border-radius:10px;padding:7px 9px;margin-bottom:6px" class="nw" ${k('item')}>
      <div class="row"><span class="dot" style="background:#C9A24B"></span><span class="b" style="flex:1">${it.name}</span><span style="color:#C2413A">✕</span></div>
      <div class="row" style="margin-top:5px"><span class="sel">−</span><span>1</span><span class="sel">+</span><span style="flex:1"></span><span class="sel" style="width:54px;text-align:center">${it.price}</span></div></div>`).join('')
    : '<p class="mu" style="padding:4px 0 8px">לא נבחרו פריטים</p>'}
    <div class="row nw" style="margin-bottom:6px" ${k('discount')}><span style="flex:1">הנחה${discount ? ` <span class="mu">· ₪${discount.ils}</span>` : ''}</span>
      <span class="row" style="gap:0;border:1px solid #E4DCCF;border-radius:9px;overflow:hidden"><span style="width:30px;height:30px;display:flex;align-items:center;justify-content:center;${discount ? '' : `background:${PC}`}">₪</span><span style="width:30px;height:30px;display:flex;align-items:center;justify-content:center;${discount ? `background:${PC}` : ''}">%</span></span>
      <span class="inp f" style="width:62px;height:30px;justify-content:center;background:${PCT}">${discount ? discount.pct : '0'}</span></div>
    <div class="row nw" style="margin-bottom:8px" ${k('tip')}><span style="flex:1">טיפ (₪)<span class="mu"> · לא נכלל בהכנסות</span></span>
      <span class="inp f" style="width:62px;height:30px;justify-content:center;background:${PCT}">${tip || '0'}</span></div>
    <p class="mu b nw" style="color:#3B4842;margin-bottom:5px">אמצעי תשלום</p>
    <div class="chips" style="gap:4px;margin-bottom:8px" ${k('methods')}>${methods.map((m) => `<span class="chip ${m === method ? 'on' : ''}" style="flex:1 0 28%;${m === method ? `background:${{ 'מזומן': '#C9A24B', 'אשראי': '#A67C52', 'ביט': '#C68A5E', 'פייבוקס': '#CBA15E', 'העברה': '#8C6239' }[m]};color:#fff` : `background:${PCT}`}" ${k(`m-${m}`)}>◦ ${m}</span>`).join('')}</div>
    ${request ? `<div style="background:${PCT};border-radius:10px;padding:8px 10px;margin-bottom:8px" class="nw"><p class="b" style="color:${PCD};margin-bottom:5px">שלחי בקשת תשלום ב-ביט</p><span class="pill" style="background:#25D366;color:#fff;height:28px">שלחי בקשת תשלום</span></div>` : ''}
    <div style="background:${PCT};border-radius:12px;padding:9px 12px;margin-bottom:10px" class="nw" ${k('total')}>
      <div class="row sb"><span class="b" style="color:#3B4842">סה״כ לתשלום</span><span style="font:700 24px KF;color:${PCD}">₪${total}</span></div>
      ${tip ? `<div class="row sb mu"><span>+ טיפ</span><span class="b">₪${tip}</span></div>` : ''}</div>
    <div class="row" style="gap:6px"><div class="btn line" style="flex:1">ביטול</div><div class="btn pc" style="flex:2" ${k('save')}>רשמי תשלום ✓</div></div>`, top);
}
function waChat(name, msgLines, { sent = false, top = 70 } = {}) {
  const body = msgLines.map((l) => `<div>${l || '&nbsp;'}</div>`).join('');
  return `<div class="chat"><div class="top"><span class="av">${name[0]}</span><span>${name}<small>וואטסאפ</small></span></div>
    ${sent ? `<div class="msg" style="top:${top}px">${body}</div>` : ''}
    <div class="compose"><div class="in">${sent ? '<div style="color:#8A948F">הודעה</div>' : body}</div><div class="snd" ${k('send')}>➤</div></div></div>`;
}
function clientDrawer({ name = 'מיכל כהן', phone = '052-9876543', total = '₪1,240', tab = 'info', allergies = 'לטקס', notes = 'מתחתנת בנובמבר' } = {}) {
  return `<div class="scr" style="padding:0">
    <div class="drawer" style="position:relative">
      <div class="row" style="gap:12px"><span class="av">${name[0]}</span><div style="flex:1" class="nw"><h3>${name}</h3>
        <p style="font:600 12px KA;opacity:.95;direction:ltr;text-align:right">${phone}</p>
        <div class="row" style="gap:5px;margin-top:4px"><span class="tg">פעילה</span><span class="tg">${total}</span></div></div></div>
      <div class="row" style="gap:6px;margin-top:10px"><span class="dbtn w">וואטסאפ</span><span class="dbtn t">עריכה</span></div>
      <div class="row" style="gap:6px;margin-top:7px"><span class="dbtn w" style="flex:2">✦ קביעת תור</span><span class="dbtn w" ${k('dpay')}>₪ תשלום</span></div>
      <div class="row" style="margin-top:7px"><span class="dbtn o">↻ קבעי לה שוב</span></div>
    </div>
    <div class="tabs" style="margin-top:8px"><span class="${tab === 'info' ? 'on' : ''}">פרטים</span><span ${k('hist')} class="${tab === 'hist' ? 'on' : ''}">היסטוריה (6)</span><span>תשלומים (6)</span><span>חבילות (0)</span><span>טפסים (1)</span></div>
    <div style="padding:8px 14px" class="nw">
      <div class="kv"><span>הגיעה מ</span><span class="b">אינסטגרם</span></div>
      ${allergies ? `<div class="box" style="background:#F6F2EA;border:1px solid rgba(242,184,75,.4)"><p class="b" style="color:#B07A1E">אלרגיות</p><p>${allergies}</p></div>` : ''}
      ${notes ? `<div class="box" style="background:${PCT}"><p class="b" style="color:#3B4842">הערות</p><p>${notes}</p></div>` : ''}
    </div></div>`;
}

function videoAppointmentActions(tl) {
  intro(tl, 'הכול מתוך התור', '', ['פותחים תור אחד, וכל מה שצריך', 'נמצא בשורה אחת למעלה']);

  tl.scene(5.6, (at, end) => `
  ${title(at(0.1), end, 'פותחים תור')}
  ${step(at(0.3), end, 1)}${mock(at(0.1), end, todayScr())}${ring(at(1.4), at(2.6), 'r2')}${tap(at(2.3), 'r2')}
  ${hint(at(0.9), end, ['ב״היום שלי״ כל שורה נפתחת:', 'לוחצים על התור'])}`);

  tl.scene(5.8, (at, end) => `
  ${title(at(0.1), end, 'למעלה: ארבע פעולות')}
  ${step(at(0.3), end, 2)}${mock(at(0.1), end, onToday(editSheet()))}${ring(at(1.2), end, 'actions')}
  ${hint(at(0.9), end, ['תשלום, תזכורת, הכרטיס שלה וביטול,', 'בלחיצה אחת, בלי לחפש'])}`);

  tl.scene(6, (at, end) => `
  ${title(at(0.1), end, 'לתשלום')}
  ${step(at(0.3), end, 3)}${mock(at(0.1), end, onToday(editSheet()))}${ring(at(0.8), at(2), 'pay')}${tap(at(1.6), 'pay')}
  ${mock(at(2.3), end, onToday(tillSheet({ client: 'מיכל כהן', items: [{ name: 'עיצוב גבות', price: 80 }], total: 80, top: null })))}
  ${hint(at(0.9), end, ['הקופה נפתחת עם הלקוחה', 'והטיפול כבר בפנים'])}`);

  const reminder = ['שלום מיכל! ✦', 'תזכורת לתור שלך בסטודיו ליה היום.', '', 'עיצוב גבות · 20 דקות', 'יום רביעי, 4 בנובמבר, 10:00', '', 'לאישור: <span class="lk">kalmea.app/confirm?id=…</span>', 'אם צריך לבטל, אפשר כאן:', '<span class="lk">kalmea.app/confirm?id=…</span>'];
  tl.scene(6.2, (at, end) => `
  ${title(at(0.1), end, 'תזכורת')}
  ${step(at(0.3), end, 4)}${mock(at(0.1), end, onToday(editSheet()))}${ring(at(0.8), at(2), 'remind')}${tap(at(1.6), 'remind')}
  ${mock(at(2.3), end, waChat('מיכל כהן', reminder))}${tap(at(4.2), 'send')}${mock(at(4.7), end, waChat('מיכל כהן', reminder, { sent: true }))}
  ${hint(at(0.9), end, ['הוואטסאפ שלך נפתח עם התזכורת כתובה,', 'עם קישור לאישור או לביטול'])}`);

  tl.scene(5.6, (at, end) => `
  ${title(at(0.1), end, 'כרטיס לקוחה')}
  ${step(at(0.3), end, 5)}${mock(at(0.1), end, onToday(editSheet()))}${ring(at(0.8), at(2), 'card')}${tap(at(1.6), 'card')}
  ${mock(at(2.3), end, clientDrawer())}
  ${hint(at(0.9), end, ['הטלפון, ההיסטוריה, האלרגיות', 'וההערות שלך עליה'])}`);

  const confirm = `<div class="scr"><p class="h" style="margin-bottom:8px">היום</p>${myDay()}${editSheet()}<div class="dim"></div>
    <div class="sheet" style="top:auto;bottom:150px;left:12px;right:12px;border-radius:20px"><div class="st nw"><b>ביטול תור</b><span>✕</span></div>
    <div class="nw" style="font-size:12.5px;color:#3B4842;line-height:1.6;margin-bottom:12px"><div>לבטל את התור של מיכל כהן</div><div>(עיצוב גבות, <span style="direction:ltr;unicode-bidi:isolate">4.11.2026 10:00</span>)?</div><div>התור יסומן כמבוטל וישאר ביומן.</div></div>
    <div class="row" style="gap:7px"><div class="btn line" style="flex:1">ביטול</div><div class="btn danger" style="flex:2" ${k('yes')}>ביטול התור</div></div></div></div>`;
  tl.scene(6.6, (at, end) => `
  ${title(at(0.1), end, 'ביטול התור')}
  ${step(at(0.3), end, 6)}${mock(at(0.1), end, onToday(editSheet()))}${ring(at(0.7), at(1.7), 'cancel')}${tap(at(1.3), 'cancel')}
  ${mock(at(1.9), end, confirm)}${tap(at(3.3), 'yes')}
  ${mock(at(3.9), end, `<div class="scr"><p class="h" style="margin-bottom:8px">היום</p>${myDay({ patch: { r2: { sub: 'עיצוב גבות · בוטל', badge: '' } } })}${toast('התור בוטל', 'החזרה')}${nav('היום')}</div>`)}
  ${hint(at(0.9), end, ['התור נשאר ביומן כמבוטל, ויש ״החזרה״.', 'ההודעה אליה מחכה לך ב״הודעות מוכנות לשליחה״'])}`);

  const newSheet = `<div class="scr"><p class="h" style="margin-bottom:8px">היום</p>${myDay()}${sheet('קביעת תור חדש', `
    <div class="inp" style="margin-bottom:10px">שם הלקוחה או טלפון</div>
    <div class="row" style="gap:6px;margin-bottom:8px"><div style="flex:1"><p class="lbl">תאריך</p><div class="inp f" style="direction:ltr;justify-content:flex-end">04/11/2026</div></div>
      <div style="flex:1"><p class="lbl">שעה</p><div class="inp f" style="direction:ltr;justify-content:center">10:30</div></div></div>
    <p class="lbl">טיפול</p><div class="chips" style="margin-bottom:12px"><span class="chip on">טיפול פנים קלאסי</span><span class="chip">עיצוב גבות</span><span class="chip">הרמת ריסים</span></div>
    <div class="row" style="gap:6px"><div class="btn line" style="flex:1">ביטול</div><div class="btn pc" style="flex:2">שמירה ✓</div></div>`)}</div>`;
  tl.scene(5.8, (at, end) => `
  ${title(at(0.1), end, 'לקוחה בלי תור?')}
  ${step(at(0.3), end, 7)}${mock(at(0.1), end, todayScr())}${ring(at(0.9), at(2.2), 'new')}${tap(at(1.8), 'new')}
  ${mock(at(2.4), end, newSheet)}
  ${hint(at(0.9), end, ['״✦ תור חדש״ בראש ״היום שלי״', 'קובע תור גם ביום עמוס'])}`);

  tl.scene(6.4, (at, end) => `
  ${title(at(0.1), end, 'בקיצור')}
  ${chk(at(0.6), end, 'לוחצים על שורה ב״היום שלי״', 250)}
  ${chk(at(1.3), end, '₪ לתשלום: הקופה מוכנה', 330)}
  ${chk(at(2), end, 'תזכורת: נפתחת בוואטסאפ שלך', 410)}
  ${chk(at(2.7), end, 'כרטיס לקוחה: הכול עליה', 490)}
  ${chk(at(3.4), end, 'ביטול: נשאר ביומן, עם החזרה', 570)}`);
  ending(tl);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2. clients
// ════════════════════════════════════════════════════════════════════════════════════════════════
const CL = [['נועה לוי', '054-1234567', 'פעילה'], ['מיכל כהן', '052-9876543', 'VIP'], ['שירה אברהם', '050-0000000', 'חמה'], ['דנה מזרחי', '054-1234567', 'פעילה']];
function clientsScr(list = CL, count = list.length, over = '') {
  return `<div class="scr">
    <div class="row nw" style="gap:5px;margin-bottom:10px"><span class="pill ghost" style="height:28px;background:${PCT}">לקוחות</span><span class="pill ghost" style="height:28px">פניות</span><span class="pill ghost" style="height:28px">הודעות</span></div>
    <p class="kick">ניהול קשרי לקוחות</p><p class="h" style="margin-bottom:8px">לקוחות <span style="color:#8A948F;font-weight:400">(${count})</span></p>
    <div class="row nw" style="gap:6px;margin-bottom:10px"><span class="pill ghost" style="color:${PCD}" ${k('import')}>ייבוא לקוחות</span><span class="pill" style="background:linear-gradient(135deg,#F2C2BA,${PC})" ${k('add')}>✦ לקוחה חדשה</span></div>
    ${list.map(([n, p, s]) => `<div class="card nw" style="padding:9px 12px;margin-bottom:6px"><div class="row"><span class="av" style="width:32px;height:32px;border-radius:50%;background:${PCT};display:flex;align-items:center;justify-content:center;font:700 14px KF;color:${PCD}">${n[0]}</span>
      <span style="flex:1"><b style="display:block;font-size:14px">${n}</b><small class="mu" style="direction:ltr;display:block;text-align:right">${p}</small></span><span class="badge">${s}</span></div></div>`).join('')}
    ${nav('לקוחות')}${over}</div>`;
}
function newClientSheet(filled) {
  const f = (v, ph, cls = '') => `<div class="inp ${v ? 'f' : ''} ${cls}" style="margin-bottom:7px">${v || ph}</div>`;
  return clientsScr(CL, 4, sheet('לקוחה חדשה', `
    ${f(filled ? 'רוני אזולאי' : '', 'שם מלא *')}
    <div class="inp ${filled ? 'f' : ''}" style="margin-bottom:7px;direction:ltr;justify-content:flex-end">${filled ? '050-0000000' : 'טלפון'}</div>
    ${f('', 'תאריך לידה')}
    ${f(filled ? 'לטקס' : '', 'אלרגיות')}
    ${f('', 'מצבים רפואיים')}
    <div class="inp ta ${filled ? 'f' : ''}" style="margin-bottom:8px">${filled ? '<div>אוהבת שקט בטיפול</div>' : '<div>משהו שכדאי לזכור עליה. למשל:</div><div>מתחתנת בנובמבר, לא אוהבת ריח חזק</div>'}</div>
    <p class="lbl">סטטוס</p><div class="row" style="gap:4px;margin-bottom:12px">${['VIP', 'פעילה', 'לא פעילה', 'חמה'].map((s) => `<span class="chip ${s === 'פעילה' ? 'on' : ''}" style="flex:1">${s}</span>`).join('')}</div>
    <div class="row" style="gap:6px"><div class="btn line" style="flex:1">ביטול</div><div class="btn pc" style="flex:2" ${k('save')}>שמירה ✓</div></div>`));
}
const LIST5 = [['רוני אזולאי', '050-0000000', 'פעילה'], ...CL];
const importHub = () => clientsScr(LIST5, 5, sheet('ייבוא נתונים', `
    <div class="nw" style="font-size:12.5px;color:#3B4842;line-height:1.6;margin-bottom:12px"><div>עוברת מתוכנה אחרת? אפשר להעביר את הנתונים</div><div>לכאן בכמה דקות, בלי להקליד הכל מחדש.</div><div>בחרי מה להעביר:</div></div>
    ${[['לקוחות', 'שמות, טלפונים, הערות, אלרגיות', 'hub-clients'], ['שירותים ומחירים', 'שם הטיפול, מחיר ומשך', ''], ['תורים עתידיים', 'תאריך, שעה ולקוחה', '']].map(([t, s, kk]) => `<div class="card nw row" style="padding:10px 12px;margin-bottom:7px" ${kk ? k(kk) : ''}><span style="flex:1"><b style="display:block;font-size:14px">${t}</b><small class="mu">${s}</small></span><span style="color:${PCD};font-size:16px">←</span></div>`).join('')}
    <div class="btn line" style="margin-top:8px">אולי מאוחר יותר</div>`));
function importPaste(pasted) {
  return clientsScr(LIST5, 5, sheet('ייבוא לקוחות', `
    <div class="nw" style="font-size:12px;color:#3B4842;line-height:1.55;margin-bottom:9px"><div>יש לך רשימת לקוחות בתוכנה אחרת? ייצאי אותה</div><div>לאקסל, סמני את העמודות, העתיקי והדביקי כאן.</div><div>בשלב הבא תבחרי מה כל עמודה מייצגת.</div></div>
    <div class="btn nw" style="height:36px;background:${PCT};border:1px dashed ${PC};color:${PCD};font-size:12.5px;margin-bottom:4px">בחירה מאנשי הקשר בטלפון</div>
    <p class="mu2 nw" style="text-align:center;margin-bottom:9px">(עובד בעיקר בטלפונים אנדרואיד)</p>
    <p class="lbl b nw">הדביקי כאן (שורה לכל לקוחה):</p>
    <div class="inp ta ${pasted ? 'f' : ''}" style="min-height:96px;margin-bottom:6px" ${k('paste')}>${pasted
    ? '<div>רוני אזולאי&nbsp;&nbsp;&nbsp;0500000000</div><div>יעל פרץ&nbsp;&nbsp;&nbsp;0541234567</div><div>הדס ביטון&nbsp;&nbsp;&nbsp;0529876543</div><div>…</div>'
    : '<div>דנה כהן&nbsp;&nbsp;&nbsp;0541234567</div><div>מיכל לוי&nbsp;&nbsp;&nbsp;0529876543</div>'}</div>
    ${pasted ? '<p class="nw" style="color:#2E7D57;font-weight:700;font-size:12.5px;margin-bottom:8px">זוהו 24 שורות ו-2 עמודות</p>' : '<div style="height:26px"></div>'}
    <div class="row" style="gap:6px"><div class="btn pc" style="flex:2;font-size:13px" ${k('next')}>המשיכי להתאמת עמודות ←</div><div class="btn line" style="flex:1">ביטול</div></div>`));
}
const importMap = () => clientsScr(LIST5, 5, sheet('ייבוא לקוחות', `
    <p class="nw" style="font-size:12.5px;color:#3B4842;margin-bottom:9px">בחרי מה כל עמודה מייצגת.</p>
    <p class="nw mu" style="margin-bottom:9px">☐ השורה הראשונה היא כותרות (לא לקוחה)</p>
    <div style="border:1px solid #E4DCCF;border-radius:10px;overflow:hidden;margin-bottom:9px" class="nw">
      <div class="row" style="gap:0;background:${PCT}"><span style="flex:1;padding:6px"><span class="sel" style="display:block;direction:rtl;border-color:${PC}">שם</span></span><span style="flex:1;padding:6px"><span class="sel" style="display:block;direction:rtl;border-color:${PC}">טלפון</span></span></div>
      ${[['רוני אזולאי', '0500000000'], ['יעל פרץ', '0541234567'], ['הדס ביטון', '0529876543'], ['אור שלום', '0500000000'], ['ליאת דהן', '0541234567']].map(([n, p], i) => `<div class="row" style="gap:0;background:${i % 2 ? '#F6F2EA' : '#fff'};border-top:1px solid #F0EAE0;font-size:12px"><span style="flex:1;padding:6px 8px">${n}</span><span style="flex:1;padding:6px 8px">${p}</span></div>`).join('')}</div>
    <div class="nw" style="font-size:12px;line-height:1.6;margin-bottom:12px"><div><b style="color:${PCD}">22 לקוחות ייווצרו</b> · 2 כבר קיימות אצלך</div><div>ולא ייווצרו שוב · מוצגות 5 שורות ראשונות</div></div>
    <div class="row" style="gap:6px"><div class="btn pc" style="flex:2" ${k('go')}>ייבוא 22 לקוחות</div><div class="btn line" style="flex:1">→ חזרה</div></div>`));
const importDone = () => clientsScr([...LIST5.slice(0, 1), ['יעל פרץ', '054-1234567', 'פעילה'], ['הדס ביטון', '052-9876543', 'פעילה'], ...CL], 27, sheet('ייבוא לקוחות', `
    <div style="text-align:center;padding:16px 0 18px"><p style="font:700 40px KF;color:${PCD}">22</p><p class="mu" style="font-size:13px">לקוחות נוספו</p></div>
    <div class="row" style="gap:6px"><div class="btn pc" style="flex:2">סיום</div><div class="btn line" style="flex:1">ייבוא נוסף</div></div>`));

function videoClients(tl) {
  intro(tl, 'כל הלקוחות שלך', 'במקום אחד', ['מוסיפים לקוחה ביד, או מעבירים', 'את כל הרשימה בבת אחת']);

  tl.scene(5.2, (at, end) => `
  ${title(at(0.1), end, 'לקוחה חדשה')}
  ${step(at(0.3), end, 1)}${mock(at(0.1), end, clientsScr())}${ring(at(1.2), at(2.6), 'add')}${tap(at(2.2), 'add')}
  ${hint(at(0.9), end, 'לקוחות ← ״✦ לקוחה חדשה״')}`);

  tl.scene(6.4, (at, end) => `
  ${title(at(0.1), end, 'שם וטלפון, וזהו')}
  ${step(at(0.3), end, 2)}${mock(at(0.1), end, newClientSheet(false))}${mock(at(1.8), end, newClientSheet(true))}${tap(at(4.6), 'save')}
  ${hint(at(0.9), end, ['רק השם חובה. אלרגיות והערות', 'עוזרות לך לזכור אותה בפעם הבאה'])}`);

  tl.scene(5.2, (at, end) => `
  ${title(at(0.1), end, 'הרבה לקוחות?')}
  ${step(at(0.3), end, 3)}${mock(at(0.1), end, clientsScr(LIST5, 5))}${ring(at(1.2), at(2.6), 'import')}${tap(at(2.2), 'import')}
  ${hint(at(0.9), end, ['יש לך רשימה בתוכנה אחרת או באקסל?', '״ייבוא לקוחות״'])}`);

  tl.scene(4.8, (at, end) => `
  ${title(at(0.1), end, 'בוחרים: לקוחות')}
  ${step(at(0.3), end, 4)}${mock(at(0.1), end, importHub())}${ring(at(1.2), at(2.6), 'hub-clients')}${tap(at(2.2), 'hub-clients')}
  ${hint(at(0.9), end, 'אפשר להעביר גם טיפולים ותורים עתידיים')}`);

  tl.scene(6.4, (at, end) => `
  ${title(at(0.1), end, 'מעתיקים ומדביקים')}
  ${step(at(0.3), end, 5)}${mock(at(0.1), end, importPaste(false))}${mock(at(2), end, importPaste(true))}${tap(at(4.8), 'next')}
  ${hint(at(0.9), end, ['שורה לכל לקוחה, מהאקסל או מהתוכנה הקודמת.', 'באנדרואיד אפשר גם לבחור מאנשי הקשר'])}`);

  tl.scene(6, (at, end) => `
  ${title(at(0.1), end, 'מה כל עמודה?')}
  ${step(at(0.3), end, 6)}${mock(at(0.1), end, importMap())}${tap(at(4), 'go')}
  ${hint(at(0.9), end, ['ניחשנו בשבילך שם וטלפון. לקוחה שכבר', 'אצלך (לפי הטלפון) לא נוצרת פעמיים'])}`);

  tl.scene(4, (at, end) => `
  ${title(at(0.1), end, 'זהו, הן אצלך!')}
  ${mock(at(0.1), end, importDone())}${petals(270, 400, at(0.6), 10)}`);

  tl.scene(6.2, (at, end) => `
  ${title(at(0.1), end, 'כרטיס הלקוחה')}
  ${step(at(0.3), end, 7)}${mock(at(0.1), end, clientDrawer({ name: 'רוני אזולאי', phone: '050-0000000', total: '₪980', allergies: 'לטקס', notes: 'אוהבת שקט בטיפול' }))}${ring(at(2.6), at(4.2), 'hist')}
  ${hint(at(0.9), end, ['וואטסאפ, קביעת תור ותשלום בלחיצה,', 'ההיסטוריה, האלרגיות וההערות שלך'])}`);

  tl.scene(5.6, (at, end) => `
  ${title(at(0.1), end, 'בקיצור')}
  ${chk(at(0.6), end, '״✦ לקוחה חדשה״: שם וטלפון', 280)}
  ${chk(at(1.3), end, '״ייבוא לקוחות״: מדביקים רשימה', 360)}
  ${chk(at(2), end, 'לקוחה קיימת לא נוצרת פעמיים', 440)}
  ${chk(at(2.7), end, 'הכרטיס שלה: כל מה שחשוב', 520)}`);
  ending(tl);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3. till
// ════════════════════════════════════════════════════════════════════════════════════════════════
const tillTab = (over = '') => `<div class="scr">
    <p class="kick">קופה ותשלומים</p><p class="h" style="margin-bottom:8px">תשלומים</p>
    <div class="row nw" style="gap:6px;margin-bottom:12px"><span class="pill" style="background:linear-gradient(135deg,#F2C2BA,${PC})" ${k('new')}>✦ תשלום חדש</span><span class="pill ghost">ייצוא לאקסל</span></div>
    <div class="card nw"><p class="mu">היום · תשלום אחד</p><p style="font:700 26px KF">₪180</p></div>
    <div class="card nw"><p class="mu">החודש · 38 תשלומים</p><p style="font:700 26px KF">₪8,940</p></div>
    ${nav('תשלום')}${over}</div>`;
const receipt = () => tillTab(sheet('', `
    <div style="text-align:center;border-bottom:2px dashed #E4DCCF;padding-bottom:10px;margin:-18px 0 10px" class="nw">
      <p style="font:700 20px KF">סטודיו ליה</p><p class="mu">אישור תשלום</p><p class="mu" style="direction:ltr">054-1234567</p></div>
    <div class="nw" style="font-size:12.5px;line-height:1.9">
      <div class="row sb"><span class="mu">לקוחה:</span><b>נועה לוי</b></div>
      <div class="row sb"><span class="mu">תאריך:</span><span>4.11.2026</span></div>
      <div class="row sb"><span class="mu">שירות:</span><b>טיפול פנים קלאסי</b></div>
      <div class="row sb"><span class="mu">אמצעי תשלום:</span><span>ביט</span></div>
      <div class="row sb" style="color:${PCD}"><span>הנחה (10%):</span><span>−₪26</span></div>
      <div class="row sb"><span class="mu">טיפ:</span><span>₪20</span></div></div>
    <p class="mu2 nw" style="margin-top:8px">אישור תשלום בלבד. אינו קבלה או חשבונית מס.</p>
    <div class="row sb nw" style="border-top:2px dashed #E4DCCF;margin-top:10px;padding-top:10px"><span class="b" style="font-size:14px;color:#3B4842">סה״כ:</span><span style="font:700 26px KF;color:${PCD}">₪234</span></div>
    <p class="mu nw" style="text-align:center;margin:8px 0 10px">תודה ונתראה בקרוב ✦</p>
    <div class="row" style="gap:6px"><div class="btn line" style="flex:1;font-size:12px">הדפסה</div><div class="btn wa" style="flex:1;font-size:12px" ${k('send')}>שליחה ללקוחה</div><div class="btn pc" style="flex:1;font-size:12px">סגירה</div></div>`, 62));
const ST = { ok: ['אישרה', '#2E7D57'], wait: ['ממתינה לאישור', '#B07A1E'] };
// The calendar's agenda card as app/beautyos.jsx draws it: the time on the start side, the name and the status word, the main
// action and "עוד ⋯".
const agenda = (rows) => `<div class="scr"><p class="h" style="margin-bottom:8px">יומן</p>${rows.map((r) => `<div class="row nw" style="align-items:stretch;gap:8px;margin-bottom:8px">
    <div style="width:38px;flex:none;text-align:center;padding-top:11px;font:700 13px KF;color:#8A948F">${r.t}</div>
    <div class="card" style="flex:1;margin:0;border-right:4px solid ${r.stripe || PC}" ${k(r.key)}><div class="row sb"><b style="font-size:15px">${r.name}</b><span style="font:700 11px KA;color:${ST[r.st][1]};border:1px solid ${ST[r.st][1]};border-radius:999px;padding:1px 8px" ${k(`${r.key}-st`)}>${ST[r.st][0]}</span></div>
    <p class="mu">${r.sub}</p><div class="row" style="gap:6px;margin-top:9px;flex-wrap:wrap">${r.actions}</div></div></div>`).join('')}${nav('יומן')}</div>`;

function videoTill(tl) {
  intro(tl, 'תשלום בקופה', 'בכמה לחיצות', ['בוחרים לקוחה וטיפול, איך שילמה,', 'ורושמים. אישור התשלום מוכן']);
  const facial = [{ name: 'טיפול פנים קלאסי', price: 260 }];

  tl.scene(5, (at, end) => `
  ${title(at(0.1), end, 'פותחים את הקופה')}
  ${step(at(0.3), end, 1)}${mock(at(0.1), end, tillTab())}${ring(at(1.2), at(2.6), 'new')}${tap(at(2.2), 'new')}
  ${hint(at(0.9), end, ['״תשלום״ למטה ← ״✦ תשלום חדש״.', 'מתוך תור: ״₪ לתשלום״, והכול כבר מוכן'])}`);

  tl.scene(5.4, (at, end) => `
  ${title(at(0.1), end, 'מי הלקוחה?')}
  ${step(at(0.3), end, 2)}${mock(at(0.1), end, tillTab(tillSheet()))}
  ${mock(at(1.4), end, tillTab(tillSheet({ search: 'נועה' })))}${tap(at(2.8), 'pick')}
  ${mock(at(3.4), end, tillTab(tillSheet({ client: 'נועה לוי' })))}
  ${hint(at(0.9), end, 'מקלידים כמה אותיות מהשם, ובוחרים')}`);

  tl.scene(5.4, (at, end) => `
  ${title(at(0.1), end, 'איזה טיפול?')}
  ${step(at(0.3), end, 3)}${mock(at(0.1), end, tillTab(tillSheet({ client: 'נועה לוי' })))}${tap(at(1.4), 'add')}
  ${mock(at(2.2), end, tillTab(tillSheet({ client: 'נועה לוי', items: facial, total: 260 })))}${ring(at(2.6), end, 'item')}
  ${hint(at(0.9), end, ['״+ הוסיפי שירות״. המחיר מגיע מהמחירון', 'ואפשר לשנות אותו כאן'])}`);

  tl.scene(6, (at, end) => `
  ${title(at(0.1), end, 'הנחה או טיפ')}
  ${step(at(0.3), end, 4)}${mock(at(0.1), end, tillTab(tillSheet({ client: 'נועה לוי', items: facial, total: 260 })))}${ring(at(1), at(2.6), 'discount')}
  ${mock(at(2.2), end, tillTab(tillSheet({ client: 'נועה לוי', items: facial, discount: { pct: 10, ils: 26 }, tip: 20, total: 234 })))}${ring(at(3), end, 'tip')}
  ${hint(at(0.9), end, ['הנחה בשקלים או באחוזים. הטיפ נרשם', 'בנפרד, ולא נכלל בהכנסות'])}`);

  tl.scene(6, (at, end) => `
  ${title(at(0.1), end, 'איך שילמה?')}
  ${step(at(0.3), end, 5)}${mock(at(0.1), end, tillTab(tillSheet({ client: 'נועה לוי', items: facial, discount: { pct: 10, ils: 26 }, tip: 20, total: 234 })))}${tap(at(1.5), 'm-ביט')}
  ${mock(at(2.1), end, tillTab(tillSheet({ client: 'נועה לוי', items: facial, discount: { pct: 10, ils: 26 }, tip: 20, total: 234, method: 'ביט', request: true, top: 14 })))}
  ${hint(at(0.9), end, ['מזומן, אשראי, ביט, פייבוקס או העברה.', 'בביט אפשר גם לשלוח לה בקשת תשלום'])}`);

  tl.scene(5, (at, end) => `
  ${title(at(0.1), end, 'רושמים')}
  ${step(at(0.3), end, 6)}${mock(at(0.1), end, tillTab(tillSheet({ client: 'נועה לוי', items: facial, discount: { pct: 10, ils: 26 }, tip: 20, total: 234, method: 'ביט', request: true, top: 14 })))}${ring(at(1), at(2.4), 'total')}${tap(at(2.6), 'save')}
  ${hint(at(0.9), end, 'בודקים את הסכום ← ״רשמי תשלום ✓״')}`);

  tl.scene(6.2, (at, end) => `
  ${title(at(0.1), end, 'אישור התשלום')}
  ${step(at(0.3), end, 7)}${mock(at(0.1), end, receipt())}${ring(at(2.8), at(4.4), 'send')}
  ${hint(at(0.9), end, ['נפתח מיד. ״שליחה ללקוחה״ מכינה לה', 'אותו בוואטסאפ, או ״הדפסה״'])}`);

  tl.scene(5, (at, end) => `
  ${title(at(0.1), end, 'וביומן: שולם')}
  ${step(at(0.3), end, 8)}${mock(at(0.1), end, agenda([
    { t: '09:00', key: 'a1', name: 'נועה לוי', st: 'ok', sub: 'טיפול פנים קלאסי · 60ד׳', actions: `<span class="pill ok" ${k('paid')}>✓ שולם</span><span class="pill tint">🧾 אישור התשלום</span><span class="pill ghost">↻ קבעי לה שוב</span><span class="pill ghost">עוד ⋯</span>` },
    { t: '10:00', key: 'a2', name: 'מיכל כהן', st: 'wait', stripe: '#DCE4D5', sub: 'עיצוב גבות · 20ד׳', actions: '<span class="pill tint">▶ התחלתי</span><span class="pill ghost">↻ קבעי לה שוב</span><span class="pill ghost">עוד ⋯</span>' },
  ]))}${ring(at(1.2), at(3.2), 'paid')}
  ${hint(at(0.9), end, ['התור מסומן ״✓ שולם״, ולחיצה', 'פותחת את אישור התשלום'])}`);

  tl.scene(6.4, (at, end) => `
  ${title(at(0.1), end, 'טוב לדעת')}
  ${chk(at(0.6), end, 'הסכום נכנס לסיכום ההכנסות', 270)}
  ${chk2(at(1.4), end, 'בלי חיבור: אישור תשלום, לא קבלה', 'קבלה חוקית? מחברים את מורנינג', 350)}
  ${chk2(at(2.2), end, 'יש על זה סרטון משלו', 'בעמוד הזה, תחת ״תשלומים וקבלות״', 470)}`);
  ending(tl);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4. reminders
// ════════════════════════════════════════════════════════════════════════════════════════════════
const needsRow = `<div style="margin-top:6px;padding-top:8px;border-top:1px solid #E4DCCF" class="nw"><p class="b" style="font-size:12.5px;margin-bottom:4px">מחכה לך</p>
    <div class="row" style="gap:8px;padding:5px 0;border-top:1px solid #F0EAE0"><div style="flex:1"><p style="font-size:13px">מיכל כהן: מחר ב-10:00, עוד לא אישרה</p><p class="mu">עוד לא נשלחה לה תזכורת</p></div></div>
    <div class="row" style="justify-content:flex-end;padding-bottom:6px"><span class="pill green" ${k('remind1')}>תזכורת בוואטסאפ</span></div></div>`;
const attention = (over = '') => `<div class="scr"><p class="h" style="margin-bottom:8px">היום</p>
    <div class="card nw"><p style="font:700 17px KF;margin-bottom:8px">דורש תשומת לב</p>
      <div style="border-right:3px solid #2E7D57;background:${PCT};border-radius:10px;padding:9px 10px">
        <div class="row" style="gap:5px"><b style="font-size:13px">הודעות מוכנות לשליחה</b><span class="badge" style="background:#fff;border:1px solid #E4DCCF;color:#6B756F">וואטסאפ</span><span class="badge" style="background:rgba(242,184,75,.18);color:#8A5D06">ממתין</span></div>
        <p style="font-size:12px;margin-top:2px">3 הודעות</p><p class="mu">כל אחת שלוחה בלחיצה אחת מהוואטסאפ שלך</p>
        <div class="row" style="gap:6px;margin-top:8px"><span class="pill" style="background:linear-gradient(135deg,#F2C2BA,${PC})" ${k('open')}>פתיחת הרשימה</span><span class="pill ghost">הסתרה</span></div></div></div>
    ${myDay({ needs: needsRow })}${nav('היום')}${over}</div>`;
const QUEUE = [['מיכל כהן', 'שלום מיכל! ✦ תזכורת לתור שלך בסטודיו ליה מחר.', 'לפני 2 שע׳'], ['דנה מזרחי', 'שלום דנה! ✦ תזכורת לתור שלך בסטודיו ליה מחר.', 'לפני 2 שע׳'], ['שירה אברהם', 'שלום שירה! ✦ תזכורת לתור שלך בסטודיו ליה מחר.', 'לפני 2 שע׳']];
function queueSheet(done = 0) {
  return attention(sheet('הודעות מוכנות לשליחה', `
    <div class="nw" style="font-size:12px;color:#3B4842;line-height:1.6;margin-bottom:10px"><div>ההודעות כאן עוד לא נשלחו. לחיצה על ״שליחה״</div><div>פותחת את הוואטסאפ שלך עם הטקסט מוכן,</div><div>ונשאר רק ללחוץ שליחה.</div></div>
    ${QUEUE.map(([n, m, a], i) => `<div class="row" style="gap:8px;padding:8px 0;${i ? 'border-top:1px solid #F0EAE0' : ''}"><div style="flex:1;min-width:0;overflow:hidden" class="nw"><p class="b" style="font-size:13px">${n}</p><p class="mu2" style="overflow:hidden;text-overflow:ellipsis">${m}</p><p style="font-size:11px;color:#B07A1E;${i < done ? 'visibility:hidden' : ''}">ממתינה · ${a}</p></div>
      ${i < done ? '<span class="pill" style="background:#F0EAE0;color:#8A948F;height:30px;border-radius:9px">✓ נפתח</span>' : `<span class="pill" style="background:#25D366;color:#fff;height:30px;border-radius:9px" ${k(`send${i}`)}>שליחה</span><span style="color:#8A948F">✕</span>`}</div>`).join('')}
    <div class="row" style="justify-content:flex-end;margin-top:10px"><span class="pill" style="background:linear-gradient(135deg,#F2C2BA,${PC});border-radius:12px" ${k('done')}>סיימתי</span></div>`));
}
const pubHead = `<div class="bh nw"><span class="lg">ל</span><span class="bn">סטודיו ליה</span></div>`;
const confirmOk = () => `<div class="pub"><div class="url">kalmea.app/confirm?id=…</div>${pubHead}
    <div class="mark" style="background:rgba(70,179,123,.12);color:#2E7D57">✓</div><h1>התור אושר!</h1>
    <div class="pp nw"><div>נתראה ביום חמישי, 5 בנובמבר,</div><div>בשעה 10:00 🌸</div></div>
    <p class="mu nw" style="margin-top:22px;font-size:13px">תוכלי לסגור את החלון</p></div>`;
const confirmAsk = () => `<div class="pub"><div class="url">kalmea.app/confirm?id=…</div>${pubHead}
    <h1 style="margin-top:20px">לבטל את התור?</h1><p class="pp b nw" style="color:#1F3A30;margin-bottom:6px">עיצוב גבות · 5.11 · 10:00</p>
    <div class="pp nw" style="font-size:12.5px"><div>ביטול משחרר את השעה שלך, ואי אפשר להחזיר אותה</div><div>מהקישור הזה. אם לא התכוונת לבטל,</div><div>אפשר פשוט לסגור את החלון.</div></div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px;align-items:center"><span class="pill" style="background:#C2413A;color:#fff;height:40px;width:200px" ${k('yes')}>כן, בטלי את התור</span><span class="pill ghost" style="height:40px;width:200px">לא, השאירי את התור</span></div></div>`;
const confirmCancelled = () => `<div class="pub"><div class="url">kalmea.app/confirm?id=…</div>${pubHead}
    <div class="mark" style="background:#F0EAE0;color:#6B756F">✕</div><h1>התור בוטל</h1>
    <div class="pp nw"><div>התור ביום חמישי, 5 בנובמבר, בשעה 10:00</div><div>בוטל, והשעה התפנתה.</div></div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px;align-items:center"><span class="pill tint" style="height:40px;width:210px">קביעת מועד אחר</span><span class="pill ghost" style="height:40px;width:210px">כתיבה לסטודיו ליה בוואטסאפ</span></div></div>`;

const TOMORROW = (st) => [
  { t: '10:00', key: 'b1', name: 'מיכל כהן', st, sub: 'עיצוב גבות · 20ד׳', actions: '<span class="pill tint">₪ לתשלום</span><span class="pill ghost">עוד ⋯</span>' },
  { t: '11:30', key: 'b2', name: 'דנה מזרחי', st: 'wait', sub: 'ניקוי פנים עמוק · 75ד׳', actions: '<span class="pill tint">₪ לתשלום</span><span class="pill ghost">עוד ⋯</span>' },
];
function videoReminders(tl) {
  intro(tl, 'תזכורות לתורים', 'בלחיצה אחת', ['התזכורות מוכנות לך, את שולחת', 'כל אחת מהוואטסאפ שלך']);

  tl.scene(5.8, (at, end) => `
  ${title(at(0.1), end, 'מתי הן מוכנות?')}
  ${chk2(at(0.7), end, 'כל יום אחר הצהריים', 'לתורים של מחר, ובמוצאי שבת בערב', 300)}
  ${chk2(at(1.5), end, 'עם קישור לאישור ולביטול', 'הלקוחה עונה בלחיצה', 420)}
  ${chk2(at(2.3), end, 'נשלחות מהוואטסאפ שלך', 'לחיצה אחת לכל הודעה', 540)}`);

  tl.scene(5.6, (at, end) => `
  ${title(at(0.1), end, 'איפה הן מחכות?')}
  ${step(at(0.3), end, 1)}${mock(at(0.1), end, attention())}${ring(at(1.3), at(2.9), 'open')}${tap(at(2.5), 'open')}
  ${hint(at(0.9), end, ['במסך ״היום״: ״הודעות מוכנות לשליחה״', '← ״פתיחת הרשימה״'])}`);

  tl.scene(5.4, (at, end) => `
  ${title(at(0.1), end, 'הרשימה')}
  ${step(at(0.3), end, 2)}${mock(at(0.1), end, queueSheet(0))}${ring(at(1.4), at(3.2), 'send0')}${tap(at(3.4), 'send0')}
  ${hint(at(0.9), end, ['כל הודעה כתובה ומוכנה.', 'לוחצים ״שליחה״ ליד הראשונה'])}`);

  const msg = ['שלום מיכל! ✦', 'תזכורת לתור שלך בסטודיו ליה מחר.', '', 'עיצוב גבות · 20 דקות', 'יום חמישי, 5 בנובמבר, 10:00', '', 'לאישור: <span class="lk">kalmea.app/confirm?id=…</span>', 'אם צריך לבטל, אפשר כאן:', '<span class="lk">kalmea.app/confirm?id=…</span>'];
  tl.scene(6, (at, end) => `
  ${title(at(0.1), end, 'הוואטסאפ שלך')}
  ${step(at(0.3), end, 3)}${mock(at(0.1), end, waChat('מיכל כהן', msg))}${tap(at(2.8), 'send')}
  ${mock(at(3.3), end, waChat('מיכל כהן', msg, { sent: true }))}
  ${hint(at(0.9), end, ['נפתח עם ההודעה כתובה, אצל הלקוחה.', 'לוחצים שליחה, וזהו'])}`);

  tl.scene(5.4, (at, end) => `
  ${title(at(0.1), end, 'והבאה בתור')}
  ${step(at(0.3), end, 4)}${mock(at(0.1), end, queueSheet(1))}${tap(at(1.6), 'send1')}${mock(at(2.4), end, queueSheet(3))}${tap(at(4), 'done')}
  ${hint(at(0.9), end, ['חוזרים לקלמיה, שולחים את הבאה,', 'ובסוף ״סיימתי״'])}`);

  tl.scene(5.2, (at, end) => `
  ${title(at(0.1), end, 'הלקוחה מאשרת')}
  ${step(at(0.3), end, 5)}${mock(at(0.1), end, confirmOk())}
  ${hint(at(0.9), end, ['היא לוחצת על ״לאישור״,', 'והתור מאושר'])}`);

  tl.scene(6.4, (at, end) => `
  ${title(at(0.1), end, 'או מבטלת')}
  ${step(at(0.3), end, 6)}${mock(at(0.1), end, confirmAsk())}${tap(at(2.6), 'yes')}${mock(at(3.2), end, confirmCancelled())}
  ${hint(at(0.9), end, ['השעה מתפנה, והיא יכולה', 'לקבוע מועד אחר מיד'])}`);

  tl.scene(5.2, (at, end) => `
  ${title(at(0.1), end, 'ואצלך ביומן')}
  ${step(at(0.3), end, 7)}${mock(at(0.1), end, agenda(TOMORROW('wait')))}${mock(at(1.6), end, agenda(TOMORROW('ok')))}${ring(at(2), end, 'b1-st')}
  ${hint(at(0.9), end, ['ביומן, ליד השם: ״אישרה״.', 'ביטול מגיע אלייך כהתראה באפליקציה'])}`);
  ending(tl);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 5. my-page
// ════════════════════════════════════════════════════════════════════════════════════════════════
const settingsTabs = (on) => `<div class="tabs nw" style="padding:0;margin:0 -14px 10px;padding-inline:8px;flex-wrap:wrap">${['העסק שלי', 'הדף שלי', 'יומן ושירותים', 'הודעות', 'לקוחות ופניות', 'חיבורים'].map((t) => `<span class="${t === on ? 'on' : ''}" ${k(`tab-${t}`)}>${t}</span>`).join('')}</div>`;
const myPageSettings = (toastText = '') => `<div class="scr"><p class="h">הגדרות</p>${settingsTabs('הדף שלי')}
    <div class="card nw" style="padding:10px 12px"><p class="b" style="color:#3B4842;margin-bottom:4px">הכתובת של העמוד שלך</p>
      <div class="row" style="gap:8px"><span class="b" style="direction:ltr">kalmea.app/studio-lia</span><span class="b" style="color:${PCD}">שינוי</span></div></div>
    <div class="card nw" style="padding:10px 12px;background:#F6F2EA" ${k('links')}>
      <p class="b" style="margin-bottom:2px">הקישורים שלך</p><p class="mu2" style="margin-bottom:8px">העמודים הציבוריים שלך, בצבעים שלך. העתיקי ושלחי.</p>
      <div class="row" style="gap:6px;margin-bottom:10px"><span class="pill ghost" style="border-radius:10px;color:${PCD}" ${k('book')}>עמוד ההזמנות</span><span class="pill ghost" style="border-radius:10px;color:${PCD}">סורק העור</span></div>
      <div class="mu2" style="margin-bottom:6px"><div>קישור לקביעת תור לפי המקום שבו תדביקי אותו,</div><div>כדי לדעת מה מביא תורים:</div></div>
      <div class="chips" style="gap:5px">${[['bio', 'לביו באינסטגרם'], ['story', 'לסטורי'], ['whatsapp', 'לסטטוס בוואטסאפ'], ['facebook', 'לפייסבוק'], ['tiktok', 'לטיקטוק'], ['google', 'לגוגל']].map(([c, l]) => `<span class="pill ghost" style="height:28px;font-size:11.5px;font-weight:600" ${k(`src-${c}`)}>${l}</span>`).join('')}</div></div>
    ${toastText ? `<div class="toast" style="bottom:16px"><span>${toastText}</span></div>` : ''}</div>`;
const bookSvc = () => `<div class="pub" style="padding-top:12px"><div class="url">kalmea.app/studio-lia</div>${pubHead}
    <p style="font:700 17px KF;margin-bottom:10px">הטיפולים שלי</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${[['טיפול פנים קלאסי', '60 דק׳ · ₪260', 'svc1'], ['עיצוב גבות', '20 דק׳ · ₪80', ''], ['הרמת ריסים', '60 דק׳ · ₪250', ''], ['ניקוי פנים עמוק', '75 דק׳ · ₪300', '']].map(([n, s, kk]) => `<div class="svc nw"><div class="ph"></div><b>${n}</b><small>${s}</small><div class="cta" ${kk ? k(kk) : ''}>קביעת תור</div></div>`).join('')}</div></div>`;
const bookDay = (picked) => `<div class="pub" style="padding-top:12px;text-align:right"><div class="url">kalmea.app/studio-lia</div>
    <p class="b nw" style="color:${PCD};margin-bottom:10px">→ חזרה לעמוד העסק</p>
    <p class="b nw" style="letter-spacing:2px;color:${PCD};margin-bottom:8px">בחרי יום</p>
    <div class="row" style="gap:6px;margin-bottom:16px">${[['חמישי', 5], ['שישי', 6], ['ראשון', 8], ['שני', 9], ['שלישי', 10]].map(([d, n], i) => `<div class="dc nw ${picked && i === 0 ? 'on' : ''}" ${i === 0 ? k('day') : ''}><small>${d}</small><b>${n}</b><small>נוב</small></div>`).join('')}</div>
    ${picked ? `<p class="b nw" style="letter-spacing:2px;color:${PCD};margin-bottom:8px">בחרי שעה</p>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">${['09:00', '10:00', '10:30', '11:00', '12:30', '13:00', '15:00', '16:30'].map((h) => `<span class="chip ${picked === h ? 'on' : ''}" style="direction:ltr" ${h === '10:30' ? k('hour') : ''}>${h}</span>`).join('')}</div>` : ''}</div>`;
const bookSummary = () => `<div class="pub" style="padding-top:12px;text-align:right"><div class="url">kalmea.app/studio-lia</div>
    <p class="b nw" style="color:${PCD};margin-bottom:8px">→ חזרה</p>
    <div class="card nw" style="padding:10px 12px"><p style="font:700 15px KF;margin-bottom:6px">סיכום התור</p>
      <div class="kv"><span>טיפול</span><b>טיפול פנים קלאסי</b></div><div class="kv"><span>תאריך</span><b>חמישי 5/11</b></div>
      <div class="kv"><span>שעה</span><b style="direction:ltr">10:30</b></div><div class="kv" style="border:none"><b>מחיר</b><b style="font:700 16px KF;color:${PCD}">₪260</b></div></div>
    <p style="font:700 15px KF;margin:4px 0 6px" class="nw">הפרטים שלך</p>
    <div class="inp f" style="margin-bottom:6px">רוני אזולאי</div><div class="inp f" style="margin-bottom:6px;direction:ltr;justify-content:flex-end">050-0000000</div>
    <div class="card nw" style="padding:8px 10px;font-size:11.5px;line-height:1.5;border-color:${PC}"><div>☑ אני מאשרת שהשם והטלפון שלי יישמרו אצל</div><div>סטודיו ליה לצורך ניהול התור, ושאקבל עליו</div><div>הודעות בוואטסאפ. <u>מדיניות הפרטיות</u></div></div>
    <div class="btn" style="background:${PC};color:#1F3A30" ${k('book')}>קביעת תור</div></div>`;
const bookDone = () => `<div class="pub" style="padding-top:12px"><div class="url">kalmea.app/studio-lia</div>
    <div style="font:700 30px KA;color:${PCD};margin:4px 0 2px">✦</div><h1 style="margin-top:0">התור נקבע!</h1>
    <p class="pp nw" style="margin-bottom:10px">נתראה בחמישי 5/11 בשעה 10:30</p>
    <div class="card nw" style="text-align:right;padding:8px 12px"><div class="kv"><span>טיפול</span><b>טיפול פנים קלאסי</b></div><div class="kv"><span>שם</span><b>רוני אזולאי</b></div><div class="kv" style="border:none"><span>טלפון</span><b style="direction:ltr">050-0000000</b></div></div>
    <p class="mu nw" style="margin-bottom:6px">שמרי את התור ביומן שלך, כדי שהטלפון יזכיר לך</p>
    <div class="row" style="gap:6px;justify-content:center;margin-bottom:12px"><span class="pill ghost">לאייפון / ליומן</span><span class="pill ghost">ליומן Google</span></div>
    <div ${k('addr')} style="display:inline-block;padding:2px 6px"><p class="pp nw" style="margin-bottom:6px">📍 הרצל 12, רמת גן</p>
    <span class="pill ghost" ${k('waze')}>ניווט ב-Waze</span></div>
    <p class="mu2 nw" style="margin-top:10px">נשמח לראותך</p></div>`;

function videoMyPage(tl) {
  intro(tl, 'הדף שלך', 'ללקוחות שלך', ['לקוחה נכנסת לקישור וקובעת תור לבד,', 'גם באמצע הלילה']);

  tl.scene(5.6, (at, end) => `
  ${title(at(0.1), end, 'הגדרות ← הדף שלי')}
  ${step(at(0.3), end, 1)}${mock(at(0.1), end, myPageSettings())}${ring(at(1.2), at(3.4), 'links')}
  ${hint(at(0.9), end, ['כאן הכתובת של הדף שלך,', 'ו״הקישורים שלך״ להעתקה'])}`);

  tl.scene(6.4, (at, end) => `
  ${title(at(0.1), end, 'קישור לאינסטגרם')}
  ${step(at(0.3), end, 2)}${mock(at(0.1), end, myPageSettings())}${ring(at(1), at(2.4), 'src-bio')}${tap(at(2), 'src-bio')}
  ${mock(at(2.5), end, myPageSettings('הקישור לקביעת תור הועתק'))}${under(at(2.9), end, 'kalmea.app/studio-lia?src=bio', 838)}
  ${hint(at(0.9), at(2.6), ['״לביו באינסטגרם״ מעתיק את הקישור', 'עם סימון של המקום'])}`);

  tl.scene(6.2, (at, end) => `
  ${title(at(0.1), end, 'ולסטטוס בוואטסאפ')}
  ${step(at(0.3), end, 3)}${mock(at(0.1), end, myPageSettings())}${tap(at(1.4), 'src-whatsapp')}
  ${mock(at(2), end, myPageSettings('הקישור לקביעת תור הועתק'))}${under(at(2.3), end, 'kalmea.app/studio-lia?src=whatsapp', 838)}
  ${hint(at(3.8), end, ['כך ״מאיפה הגיעו התורים״ יודע', 'מה מביא לך לקוחות'], 888)}`);

  tl.scene(5.4, (at, end) => `
  ${title(at(0.1), end, 'מה הלקוחה רואה?')}
  ${step(at(0.3), end, 4)}${mock(at(0.1), end, bookSvc())}${tap(at(2.4), 'svc1')}
  ${hint(at(0.9), end, ['את הטיפולים שלך, עם משך ומחיר.', 'בוחרת טיפול ← ״קביעת תור״'])}`);

  tl.scene(5.8, (at, end) => `
  ${title(at(0.1), end, 'יום ושעה')}
  ${step(at(0.3), end, 5)}${mock(at(0.1), end, bookDay(''))}${tap(at(1.3), 'day')}${mock(at(1.8), end, bookDay('x'))}${tap(at(3.2), 'hour')}${mock(at(3.7), end, bookDay('10:30'))}
  ${hint(at(0.9), end, 'רק שעות פנויות בשעות הפעילות שלך')}`);

  tl.scene(5.6, (at, end) => `
  ${title(at(0.1), end, 'שם וטלפון')}
  ${step(at(0.3), end, 6)}${mock(at(0.1), end, bookSummary())}${tap(at(3.4), 'book')}
  ${hint(at(0.9), end, ['רואה סיכום, ממלאת שם וטלפון,', 'מאשרת ולוחצת ״קביעת תור״'])}`);

  tl.scene(6.6, (at, end) => `
  ${title(at(0.1), end, 'התור נקבע!')}
  ${step(at(0.3), end, 7)}${mock(at(0.1), end, bookDone())}${ring(at(1.8), end, 'addr')}
  ${hint(at(0.9), end, ['בסוף היא רואה את הכתובת שלך', 'וכפתור ״ניווט ב-Waze״'])}`);

  tl.scene(5.8, (at, end) => `
  ${title(at(0.1), end, 'טוב לדעת')}
  ${chk2(at(0.6), end, 'הכתובת מופיעה אם מילאת אותה', 'הגדרות ← הדף שלי ← כתובת העסק', 290)}
  ${chk2(at(1.4), end, 'התור נכנס ליומן שלך לבד', 'ואת מקבלת התראה באפליקציה', 410)}
  ${chk2(at(2.2), end, 'כתובת קצרה עם שם העסק', 'שם, ב״הכתובת של העמוד שלך״', 530)}`);
  ending(tl);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 6. services-hours
// ════════════════════════════════════════════════════════════════════════════════════════════════
const saveBar = (dirty) => `<div style="position:absolute;left:0;right:0;bottom:0;padding:10px 14px;background:#fff;border-top:1px solid #E4DCCF"><div class="btn ${dirty ? 'pc' : 'line'}" ${k('savebar')}>שמירה ✓</div></div>`;
const svcEmpty = () => `<div class="scr"><p class="h">הגדרות</p>${settingsTabs('יומן ושירותים')}
    <div class="card nw" style="text-align:center;padding:16px 12px"><p style="font-size:22px;color:${PC}">✦</p><p class="b" style="margin-bottom:4px">עדיין לא הוספת שירותים</p>
      <div class="mu" style="line-height:1.6;margin-bottom:12px"><div>הוסיפי את הטיפולים שאת מציעה עם המחיר</div><div>ומשך הטיפול. הם יופיעו בקביעת תור,</div><div>בקופה ובעמוד ההזמנות שלך.</div></div>
      <span class="pill" style="background:linear-gradient(135deg,#F2C2BA,${PC});border-radius:12px;height:38px" ${k('tpl')}>בחרי מרשימת טיפולים מוכנה</span></div></div>`;
const PICKS = [['טיפול פנים קלאסי', 260, 60], ['ניקוי פנים עמוק', 300, 75], ['הרמת ריסים', 250, 60]];
const tplPicker = (n) => `<div class="scr"><p class="h">הגדרות</p>${settingsTabs('יומן ושירותים')}
    <div class="card nw" style="padding:10px 12px"><p class="b" style="margin-bottom:3px">רשימת טיפולים מוכנה</p>
      <div class="mu" style="line-height:1.55;margin-bottom:8px"><div>סימני רק את מה שאת מבצעת.</div><div>המחירים הם הצעה, שני אותם כאן או אחר כך.</div></div>
      <div class="row" style="background:${PCT};border-radius:10px;padding:7px 10px;margin-bottom:6px"><b style="flex:1">פנים</b>${n ? `<span class="badge" style="background:#fff;color:${PCD}">${n === 3 ? 2 : n} נבחרו</span>` : ''}<span class="mu">▲</span></div>
      ${PICKS.slice(0, 2).map(([nm, p, d], i) => `<div style="padding:5px 4px;border-bottom:1px solid #F0EAE0"><div class="row" ${k(`pk${i}`)}><span style="width:20px;height:20px;border-radius:6px;border:1.5px solid ${PC};${i < n ? `background:${PC};color:#1F3A30` : ''};display:flex;align-items:center;justify-content:center;font-size:12px">${i < n ? '✓' : ''}</span><b style="font-size:13px">${nm}</b></div>
        ${i < n ? `<div class="row mu" style="gap:6px;padding:4px 28px 2px 0">מחיר ₪<span class="sel">${p}</span>דקות<span class="sel">${d}</span></div>` : ''}</div>`).join('')}
      <div class="row" style="background:${PCT};border-radius:10px;padding:7px 10px;margin:6px 0"><b style="flex:1">גבות וריסים</b>${n === 3 ? `<span class="badge" style="background:#fff;color:${PCD}">1 נבחרו</span>` : ''}<span class="mu">▼</span></div>
      <div class="row" style="gap:6px;margin-top:8px"><div class="btn line" style="flex:1">ביטול</div><div class="btn ${n ? 'pc' : 'line'}" style="flex:2" ${k('addtpl')}>${n ? `הוספת ${n} טיפולים` : 'הוספת 0 טיפולים'}</div></div></div></div>`;
function svcList({ edited = false, adding = 0, added = false } = {}) {
  const rows = [...PICKS.map(([n, p, d], i) => [n, i === 0 && edited ? 280 : p, d]), ...(added ? [['עיצוב גבות', 80, 20]] : [])];
  return `<div class="scr"><p class="h">הגדרות</p>${settingsTabs('יומן ושירותים')}
    ${rows.map(([n, p, d], i) => `<div class="card nw" style="padding:8px 10px;margin-bottom:6px"><div class="row"><span class="dot" style="background:${['#C9A24B', '#A67C52', '#C68A5E', '#8C6239'][i]}"></span><b style="flex:1;font-size:13.5px">${n}</b><span class="mu2">▣</span><span style="color:#C2413A">✕</span></div>
      <div class="row" style="gap:6px;margin-top:5px;font-size:12px"><span class="sel" style="width:52px;text-align:center" ${i === 0 ? k('price0') : i === 3 ? k('dur3') : ''}>${p}</span><span>₪</span><span class="sel" style="width:46px;text-align:center" ${i === 3 ? k('dur3b') : ''}>${d}</span><span>דק׳</span></div></div>`).join('')}
    ${adding ? `<div class="row nw" style="gap:6px;padding:7px 9px;background:${PCT};border-radius:10px;margin-top:4px"><span class="inp f" style="flex:1;height:30px;background:#fff">${adding > 1 ? 'עיצוב גבות' : 'שם שירות'}</span><span class="inp f" style="width:50px;height:30px;justify-content:center;background:#fff">${adding > 1 ? '80' : '₪'}</span><span class="sel" style="direction:rtl">פנים</span><span class="pill ghost" style="width:32px;padding:0;height:30px;border-radius:9px" ${k('plus')}>+</span></div>`
    : `<div class="row" style="gap:6px;margin-top:4px"><span class="btn nw" style="flex:2;height:36px;background:${PCT};border:1px dashed ${PC};color:${PCD};font-size:12.5px" ${k('addrow')}>+ הוסיפי שירות</span><span class="btn nw" style="flex:2;height:36px;border:1px solid ${PC};background:#fff;color:${PCD};font-size:12.5px">רשימה מוכנה</span><span class="btn line nw" style="flex:1.4;height:36px;font-size:12px">ייבוא מחירון</span></div>`}
    ${saveBar(edited || added)}</div>`;
}
const DAYSH = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
function hours({ satOff = false, fri = '14:00', lunch = false, toastText = '' } = {}) {
  const hh = { 5: ['09:00', fri] };
  return `<div class="scr"><p class="h">הגדרות</p>${settingsTabs('יומן ושירותים')}
    <div class="mu nw" style="margin-bottom:6px">הגדירי לכל יום אם את עובדת ובאילו שעות.</div>
    ${DAYSH.map((d, i) => {
    const open = !(i === 6 && satOff);
    const [o, c] = hh[i] || ['09:00', '19:00'];
    return `<div class="hr nw ${open ? '' : 'off'}" ${k(`day${i}`)}><span class="dn">${d}</span><span class="tg2 ${open ? 'on' : ''}" ${k(`tg${i}`)}></span>${open ? `<span style="margin-right:auto" class="row"><span class="sel">${o}</span><span class="tsep"></span><span class="sel" ${i === 5 ? k('fri') : ''}>${c}</span></span>` : '<span class="mu b" style="margin-right:auto;font-size:11.5px">סגור</span>'}</div>`;
  }).join('')}
    <div class="hr nw" style="background:${lunch ? '#F6F2EA' : '#fff'};margin-top:6px;flex-wrap:wrap" ${k('lunch')}><span style="flex:1"><b style="display:block;font-size:13px">הפסקה שלי</b><small class="mu2">לקוחות שקובעות דרך הדף לא יוכלו לקחת אותה</small></span><span class="tg2 ${lunch ? 'on' : ''}"></span>
      ${lunch ? '<span class="row" style="flex-basis:100%;gap:6px;margin-top:5px;font-size:12px"><span class="sel">13:00</span>למשך<span class="sel" style="direction:rtl">30 דקות</span></span>' : ''}</div>
    ${saveBar(satOff || lunch)}${toastText ? `<div class="toast" style="bottom:66px"><span>${toastText}</span></div>` : ''}</div>`;
}

function videoServicesHours(tl) {
  intro(tl, 'טיפולים ושעות', 'פעם אחת', ['הטיפולים והשעות שלך מופיעים בקביעת תור,', 'בקופה ובדף שלך']);

  tl.scene(5.6, (at, end) => `
  ${title(at(0.1), end, 'הגדרות')}
  ${step(at(0.3), end, 1)}${mock(at(0.1), end, svcEmpty())}${tap(at(1.3), 'tab-יומן ושירותים')}${ring(at(2.6), at(4.4), 'tpl')}
  ${hint(at(0.9), end, ['״יומן ושירותים״. הכי מהיר:', 'רשימת טיפולים מוכנה'])}`);

  tl.scene(6.2, (at, end) => `
  ${title(at(0.1), end, 'מסמנים מה את עושה')}
  ${step(at(0.3), end, 2)}${mock(at(0.1), end, tplPicker(0))}${tap(at(1.2), 'pk0')}${mock(at(1.6), end, tplPicker(1))}${tap(at(2.4), 'pk1')}${mock(at(2.8), end, tplPicker(3))}${tap(at(4.4), 'addtpl')}
  ${hint(at(0.9), end, ['לכל טיפול מחיר ומשך מוצעים,', 'ואפשר לשנות כבר כאן'])}`);

  tl.scene(5.8, (at, end) => `
  ${title(at(0.1), end, 'מחיר ומשך')}
  ${step(at(0.3), end, 3)}${mock(at(0.1), end, svcList())}${ring(at(1.2), at(2.6), 'price0')}${mock(at(2.4), end, svcList({ edited: true }))}
  ${hint(at(0.9), end, ['בכל שורה: מחיר בשקלים ומשך בדקות.', 'המשך קובע כמה מקום התור תופס ביומן'])}`);

  tl.scene(6.4, (at, end) => `
  ${title(at(0.1), end, 'טיפול משלך')}
  ${step(at(0.3), end, 4)}${mock(at(0.1), end, svcList({ edited: true }))}${tap(at(1.2), 'addrow')}
  ${mock(at(1.7), end, svcList({ edited: true, adding: 1 }))}${mock(at(2.6), end, svcList({ edited: true, adding: 2 }))}${tap(at(3.6), 'plus')}
  ${mock(at(4.1), end, svcList({ edited: true, added: true }))}
  ${hint(at(0.9), end, ['״+ הוסיפי שירות״: שם ומחיר ← ״+״.', 'את המשך מעדכנים בשורה שלו'])}`);

  tl.scene(6, (at, end) => `
  ${title(at(0.1), end, 'שעות פעילות')}
  ${step(at(0.3), end, 5)}${mock(at(0.1), end, hours())}${ring(at(1.3), at(2.7), 'day5')}${tap(at(3.2), 'tg6')}${mock(at(3.6), end, hours({ satOff: true }))}
  ${hint(at(0.9), end, ['לכל יום שעת פתיחה וסגירה.', 'יום שלא עובדים: מכבים, והוא ״סגור״'])}`);

  tl.scene(5.4, (at, end) => `
  ${title(at(0.1), end, 'הפסקה שלי')}
  ${step(at(0.3), end, 6)}${mock(at(0.1), end, hours({ satOff: true }))}${tap(at(1.4), 'lunch')}${mock(at(1.9), end, hours({ satOff: true, lunch: true }))}
  ${hint(at(0.9), end, ['לקוחות לא יקבעו בה דרך הדף.', 'את עדיין יכולה'])}`);

  tl.scene(4.8, (at, end) => `
  ${title(at(0.1), end, 'שומרים')}
  ${step(at(0.3), end, 7)}${mock(at(0.1), end, hours({ satOff: true, lunch: true }))}${tap(at(1.3), 'savebar')}
  ${mock(at(1.8), end, hours({ satOff: true, lunch: true, toastText: 'ההגדרות נשמרו' }))}
  ${hint(at(0.9), end, '״שמירה ✓״ למטה, וזה בתוקף')}`);

  tl.scene(5.6, (at, end) => `
  ${title(at(0.1), end, 'טוב לדעת')}
  ${chk2(at(0.6), end, 'לקוחות קובעות רק בשעות שלך', 'ורק בשעות פנויות', 290)}
  ${chk2(at(1.4), end, 'את תמיד יכולה לקבוע ידנית', 'כל תור, ישר ביומן', 410)}
  ${chk2(at(2.2), end, 'יש מחירון באקסל?', '״ייבוא מחירון״ מעביר אותו', 530)}`);
  ending(tl);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 7. ai: the business advisor and the AI in the content tab
// ════════════════════════════════════════════════════════════════════════════════════════════════
// Inside a phone screen, a line can be WRITTEN (wipe: revealed from the right, the way Hebrew is read) or SHOWN (vis: fades
// in and rises a little) at its own moment, so a post or an answer grows line by line without swapping the whole screen.
// Both are absolute seconds, set by the runtime below (AI_RUNTIME). The text itself is still one element per line.
const wipe = (a, b) => `data-wipe="${a},${b}"`;
const vis = (a, b = 999) => `data-vis="${a},${b}"`;

const AI_CSS = `
.navx{position:absolute;left:0;right:0;bottom:0;height:52px;background:#fff;border-top:1px solid #E4DCCF;display:flex;justify-content:space-around;align-items:center;font:600 11px KA;color:#8A948F}
.navx span{flex:1;text-align:center}
.navx span.on{color:#1F3A30;font-weight:700}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
.tile{display:flex;align-items:center;justify-content:center;height:58px;border-radius:12px;border:1px solid #E4DCCF;background:#F6F2EA;font:600 12.5px KA;color:#3B4842;white-space:nowrap}
.adv-h{text-align:center}
.adv-h .kk{font:600 11px KA;color:#6B756F;letter-spacing:.04em}
.adv-h img{width:34px;height:34px;display:block;margin:2px auto 0}
.adv-h b{display:block;font:700 22px KF;color:#1F3A30}
.adv-h small{display:block;font:600 11.5px KA;color:#3B4842;margin-top:2px}
.qchip{display:inline-flex;align-items:center;height:30px;padding:0 11px;border-radius:14px;background:${PCT};border:1px solid #D9D1C4;font:600 11.5px KA;color:${PCD};white-space:nowrap}
.ubub{align-self:flex-start;background:linear-gradient(135deg,#F2C2BA,${PC});color:#1F3A30;border-radius:16px 16px 16px 4px;padding:9px 12px;font:600 12px/1.5 KA;white-space:nowrap}
.abub{align-self:flex-end;background:#F6F2EA;border:1px solid #E4DCCF;color:#1F3A30;border-radius:16px 16px 4px 16px;padding:9px 11px;font:600 11.5px/1.6 KA;width:252px}
.abub div{white-space:nowrap}
.abub .q{color:${PCD}}
.act{display:inline-flex;align-items:center;margin-top:8px;height:30px;padding:0 13px;border-radius:10px;background:linear-gradient(135deg,#F2C2BA,${PC});font:700 11.5px KA;color:#1F3A30;white-space:nowrap}
.gen{background:${PCT};border:1px solid ${PC};border-radius:16px;padding:12px}
.gen .gt{font:700 14.5px KF;color:#1F3A30}
.cnt{font:700 12px KA;color:${PCD};white-space:nowrap}
.aiblk{border:1px dashed #D9D1C4;border-radius:16px;padding:11px 11px 4px;background:#F6F2EA}
.aiblk .at{font:700 17px KF;color:#1F3A30}
.post{position:relative;border-radius:10px;overflow:hidden;border:1px solid #E4DCCF;aspect-ratio:4/5;background:linear-gradient(160deg,#FBEDE9,#F2C2BA)}
.post .c1{position:absolute;border-radius:50%;background:rgba(255,255,255,.55)}
.post .lf{position:absolute;border-radius:0 100% 0 100%;background:#DCE4D5}
.post .pt{position:absolute;left:6px;right:6px;text-align:center;font:700 13px/1.15 KF;color:#1F3A30;white-space:nowrap}
.post .ps{position:absolute;left:6px;right:6px;text-align:center;font:600 9px KA;color:#3B4842;white-space:nowrap}
.post .pb{position:absolute;left:50%;transform:translateX(-50%);font:700 8.5px KA;background:#1F3A30;color:#FBF8F1;border-radius:999px;padding:2px 8px;white-space:nowrap}
.mini{display:flex;align-items:center;justify-content:center;height:26px;border-radius:9px;font:700 11px KA;white-space:nowrap;background:linear-gradient(135deg,#F2C2BA,${PC});color:#1F3A30;margin-top:5px}
.txtbox{background:#fff;border:1px solid #E4DCCF;border-radius:10px;padding:8px 10px}
.txtbox div{white-space:nowrap;font:600 12px/1.6 KA;color:#1F3A30}
.wait{background:#fff;border:1px solid #E4DCCF;border-radius:10px;padding:10px;text-align:center}
.bar{height:4px;border-radius:4px;background:#E4DCCF;overflow:hidden;margin-top:8px;position:relative}
.bar i{position:absolute;top:0;bottom:0;width:40%;border-radius:4px;background:${PC}}
.idea{border-top:1px solid #E4DCCF;padding-top:5px;margin-top:4px}
.idea b{display:block;font:700 12.5px KA;color:#1F3A30}
.idea small{display:block;font:600 11px/1.45 KA;color:#3B4842}
.sbtn{display:inline-flex;align-items:center;height:26px;padding:0 9px;border-radius:9px;border:1px solid #D9D1C4;background:#fff;font:600 11px KA;color:${PCD};white-space:nowrap;margin-top:3px}
.cover{border-radius:14px;background:linear-gradient(135deg,#F2C2BA,${PC});padding:12px;text-align:center;color:#1F3A30}
.cover small{display:block;font:600 11px KA;opacity:.85}
.cover b{display:block;font:700 19px KF;margin:2px 0 4px}
.cover p{font:600 11.5px KA}
.scene{position:relative;background:#fff;border:1px solid #E4DCCF;border-radius:12px;padding:9px 12px 8px 10px;margin-top:8px;overflow:hidden}
.scene::before{content:'';position:absolute;top:0;right:0;bottom:0;width:4px;background:linear-gradient(135deg,#F2C2BA,${PC})}
.scene .sl{font:600 10.5px KA;color:#6B756F;margin-top:3px}
.scene .sv{font:600 12px/1.45 KA;color:#1F3A30}
.scene .sv2{font:600 11px/1.45 KA;color:#3B4842}
.mtoast{position:absolute;left:14px;right:14px;bottom:16px;background:#1F3A30;color:#FBF8F1;border-radius:14px;padding:10px 12px;font:700 12px KA;white-space:nowrap;box-shadow:0 10px 24px -10px rgba(31,58,48,.6);text-align:center}
.mt{display:flex;align-items:center;gap:9px;padding:9px 0;border-top:1px solid #E4DCCF}
.mt .ic{color:${PC};font:700 15px KA;width:14px}
.mt .lb{flex:1;font:600 12.5px/1.45 KA;color:#1F3A30}
.mt .lb small{display:block;font:600 10.5px KA;color:#6B756F}
.tagex{left:0;right:0;text-align:center}
.tagex span{display:inline-block;background:#fff;border:1px solid #E4DCCF;border-radius:999px;padding:3px 12px;font:600 14px KA;color:#6B756F}`;

/** The bottom bar as it really is on a phone: the five day screens and "עוד" (app/beautyos.jsx BOTTOM_NAV + the "עוד" button). */
const navMore = (on) => `<div class="navx">${['היום', 'יומן', 'לקוחות', 'תשלום', 'תוכן', 'עוד'].map((l) => `<span class="${l === on ? 'on' : ''}" ${k(`nx-${l}`)}>${l}</span>`).join('')}</div>`;
/** "עוד": the screens that are not in the bar (MORE_NAV, with the stub tabs hidden by default as in lib/featureFlags.ts). */
const moreSheet = () => `<div class="dim"></div><div class="sheet" style="padding-bottom:70px"><div style="width:42px;height:4px;border-radius:4px;background:#D9D1C4;margin:0 auto 12px"></div>
  <div class="tiles">${['תובנות', 'סיכום הכנסות', 'מנויים', 'יועץ AI', 'עזרה'].map((l) => `<span class="tile" ${k(`t-${l}`)}>${l}</span>`).join('')}</div></div>`;
const homeScr = (inner = '', on = 'היום') => `<div class="scr"><p class="h" style="margin-bottom:8px">היום</p>${myDay()}${inner}${navMore(on)}</div>`;

const ADV_Q = ['איך אחזיר לקוחות רדומות?', 'איך אעלה את ההכנסות החודש?', 'מה כדאי לתמחר מחדש?', 'רעיון לקמפיין לחודש חלש'];
// The advisor's header (activeTab "advisor"). The line under the title has a dash in the app; it is drawn without its second half.
const advHead = (small = false) => `<div class="adv-h nw"><p class="kk">בינה מלאכותית</p>${small ? '' : `<img src="${BASE}/brand-icons/icon-sparkle.png" alt="">`}<b>יועץ עסקי AI</b>${small ? '' : '<small>יועצת אישית שמכירה את הנתונים של סטודיו ליה</small>'}</div>`;
const advInput = (text = '', at = null) => `<div class="row" style="position:absolute;left:14px;right:14px;bottom:62px;gap:6px">
  <div class="inp f" style="flex:1;position:relative">${text ? `<span ${at ? wipe(at[0], at[1]) : ''}>${text}</span>` : '<span style="color:#9AA29E">כתבי שאלה עסקית…</span>'}</div>
  <div class="btn pc" style="height:36px;padding:0 14px;font-size:13px" ${k('send')}>שליחה</div></div>`;
function advEmpty({ fillAt = null } = {}) {
  return `<div class="scr">${advHead()}
  <div class="card" style="margin-top:10px;text-align:center;padding:14px 10px">
    <p class="nw" style="font:700 15px KA;margin-bottom:5px">איך אפשר לעזור לעסק שלך היום?</p>
    <div class="nw mu" style="line-height:1.55;margin-bottom:10px"><div>היועצת רואה את הנתונים האמיתיים שלך</div><div>ונותנת פתרונות ותוכניות עבודה.</div><div>נסי אחת מהשאלות:</div></div>
    <div class="chips" style="justify-content:center;gap:6px">${ADV_Q.map((q, i) => `<span class="qchip" ${k(`q${i}`)}>${q}</span>`).join('')}</div>
  </div>
  ${advInput()}${fillAt ? `<div ${vis(fillAt)} style="position:absolute;inset:0">${advInput(ADV_Q[0])}</div>` : ''}
  ${navMore('עוד')}</div>`;
}
// An EXAMPLE answer (written for this video, labelled as one on screen): built only on what the advisor's snapshot really
// holds (app/api/advisor/route.ts: dormant clients at 60+ days, the top services), and it promises nothing.
const ADV_A = [
  'לפי הנתונים שלך יש 23 לקוחות', 'רדומות, בלי ביקור מעל 60 יום.', '',
  '• התחילי מ-8 שעשו אצלך טיפול', 'פנים קלאסי, השירות המוביל שלך.',
  '• הודעה אישית לכל אחת,', 'לא הודעה אחת כללית לכולן.', '',
  '• הצעה לנוסח:', '<span class="q">״היי נועה, מזמן לא התראינו!</span>', '<span class="q">התפנה לי מקום השבוע, לשמור לך?</span>', '<span class="q">סטודיו ליה״</span>',
];
function advChat({ t0 = 0, full = false } = {}) {
  const T = (s) => +(t0 + s).toFixed(2);
  let c = T(2.9);
  const ans = ADV_A.map((l) => {
    if (!l) return '<div style="height:6px"></div>';
    const a = c; c = +(c + 0.5).toFixed(2);
    return `<div ${full ? '' : wipe(a, +(a + 0.45).toFixed(2))}>${l}</div>`;
  }).join('');
  return `<div class="scr">${advHead(true)}
  <div style="display:flex;flex-direction:column;gap:9px;margin-top:10px">
    <div class="ubub" ${full ? '' : vis(T(0.9))}>${ADV_Q[0]}</div>
    ${full ? '' : `<div class="abub nw" style="width:auto;position:absolute;left:14px;top:118px" ${vis(T(1.3), T(2.8))}>היועצת קוראת את המספרים של העסק שלך…</div>`}
    <div class="abub" ${full ? '' : `${vis(T(2.8))} data-down="${T(2.8)},${+(c + 0.5).toFixed(2)}"`}>${ans}<div ${full ? '' : vis(c)}><span class="act" ${k('act')}>← פתחי משימות ממתינות</span></div></div>
  </div>
  ${full ? advInput() : `<div ${vis(0, T(0.9))} style="position:absolute;inset:0">${advInput(ADV_Q[0])}</div><div ${vis(T(0.9))} style="position:absolute;inset:0">${advInput()}</div>`}
  ${navMore('עוד')}</div>`;
}
/** Further down the home screen (MarketingToday sits under the day's cards): "שיווק היום". */
const todayLower = () => `<div class="scr" style="padding-top:14px">
  <div class="card" style="padding:10px 12px 2px"><p style="font:700 15px KF;margin-bottom:2px">שיווק היום</p>
  <div class="mt nw" ${k('winback')}><span class="ic">✦</span><span class="lb">15 לקוחות לא הגיעו מעל 90 יום<small>הודעה אישית קטנה מחזירה הרבה מהן</small></span><span class="pill okb" style="height:30px;padding:0 9px;font-size:12px;border-color:${PC};color:#1F3A30">לרשימה</span></div>
  <div class="mt nw"><span class="ic">★</span><span class="lb">4 לקוחות היו אצלך השבוע<small>ביקורת טובה מביאה</small><small>לקוחות חדשות</small></span><span class="pill okb" style="height:30px;padding:0 9px;font-size:12px;border-color:${PC};color:#1F3A30">לבקש ביקורת</span></div></div>
  ${navMore('היום')}</div>`;
/** The content tab with the studio's AI block in view (app/beautyos.jsx "campaigns" + app/design/DesignStudio.jsx). */
const contentHead = () => `<p class="kick nw">פוסטים, רילסים וקמפיינים</p><p class="h" style="margin:0 0 8px">תוכן</p>
  <div class="row nw" style="gap:3px;background:#fff;border:1px solid #E4DCCF;border-radius:12px;padding:3px;margin-bottom:8px;display:inline-flex"><span class="chip on" style="height:28px">פוסטים ותבניות</span><span class="chip" style="height:28px;border:none">קמפיינים בפייסבוק</span></div>
  <div class="chips" style="margin-bottom:9px"><span class="chip on" style="height:27px">השבוע</span><span class="chip" style="height:27px">תבניות</span><span class="chip" style="height:27px">רעיונות</span><span class="chip" style="height:27px">שלי</span></div>`;
const aiBlockHead = () => `<p class="at nw">✦ עם AI</p><div class="mu nw" style="line-height:1.5;margin-bottom:8px"><div>כאן ה-AI מציע וכותב בשבילך. התבניות,</div><div>העיצובים שלך והפוסטים המוכנים</div><div>פתוחים תמיד, גם כשה-AI לא זמין.</div></div>`;
function contentScr() {
  return `<div class="scr">${contentHead()}
  <div class="card nw" style="padding:10px 12px;margin-bottom:9px"><p style="font:700 15px KF">מה מפרסמים השבוע</p><p class="mu">פוסטים שכבר מוכנים בצבעים שלך</p></div>
  <div class="aiblk" ${k('aiblk')}>${aiBlockHead()}
    <div class="card nw" style="padding:9px 10px;margin-bottom:7px"><p class="b">מה לצלם השבוע</p><p class="mu2">רעיונות של עשר דקות בעסק</p></div>
    <div class="card nw" style="padding:9px 10px;margin-bottom:7px"><p class="b">תסריט לצילום</p><p class="mu2">סצנה אחרי סצנה, על נושא שתבחרי</p></div>
    <div class="gen nw" style="padding:9px 10px"><p class="gt">כתבי מה תרצי, ותקבלי פוסט מוכן</p><p class="cnt">3 מתוך 9 החודש</p></div>
  </div>${navMore('תוכן')}</div>`;
}
/** A post as the AI or a template draws it: her colours, soft shapes, the words. No person in it. */
function postArt({ title1, title2 = '', sub = 'סטודיו ליה', badge = '', tone = 0, w = 84, textAt = null }) {
  const bg = ['linear-gradient(160deg,#FBEDE9,#F2C2BA)', 'linear-gradient(160deg,#DCE4D5,#FBF8F1)', 'linear-gradient(160deg,#FBF8F1,#E9A9A1)'][tone % 3];
  const s = w / 84;
  const tx = (cls, top, txt, i) => `<div class="${cls}" style="top:${Math.round(top * s)}px;font-size:${cls === 'pt' ? Math.round(13 * s) : Math.round(9 * s)}px" ${textAt ? wipe(+(textAt + i * 0.35).toFixed(2), +(textAt + i * 0.35 + 0.4).toFixed(2)) : ''}>${txt}</div>`;
  return `<div class="post" style="width:${w}px;background:${bg}">
    <div class="c1" style="width:${Math.round(70 * s)}px;height:${Math.round(70 * s)}px;left:${Math.round(-18 * s)}px;top:${Math.round(-14 * s)}px"></div>
    <div class="lf" style="width:${Math.round(30 * s)}px;height:${Math.round(30 * s)}px;right:${Math.round(8 * s)}px;bottom:${Math.round(10 * s)}px;opacity:.9"></div>
    <div class="c1" style="width:${Math.round(18 * s)}px;height:${Math.round(18 * s)}px;right:${Math.round(14 * s)}px;top:${Math.round(14 * s)}px;background:rgba(233,169,161,.6)"></div>
    ${tx('pt', 34, title1, 0)}${title2 ? tx('pt', 50, title2, 1) : ''}${tx('ps', 70, sub, 2)}
    ${badge ? `<div class="pb" style="top:${Math.round(84 * s)}px;font-size:${Math.round(8.5 * s)}px">${badge}</div>` : ''}</div>`;
}
const BRIEF = 'מבצע על טיפול פנים לפני החגים';
function genForm({ t0 }) {
  const T = (s) => +(t0 + s).toFixed(2);
  return `<div class="scr">${contentHead()}
  <div class="gen">
    <div class="row sb nw" style="margin-bottom:3px"><span class="gt">כתבי מה תרצי, ותקבלי פוסט מוכן</span></div>
    <p class="cnt" style="margin-bottom:5px">3 מתוך 9 החודש</p>
    <div class="nw mu" style="line-height:1.5;margin-bottom:8px;color:#3B4842"><div>משפט אחד. ה-AI בוחר תבנית, כותב את</div><div>הטקסטים ומצייר תמונה, ומחזיר שלוש</div><div>אפשרויות לבחירה.</div></div>
    <div class="inp f" style="height:40px;margin-bottom:8px"><span ${wipe(T(0.7), T(2.2))}>${BRIEF}</span></div>
    <div class="row nw" style="gap:4px;margin-bottom:8px"><span class="chip on" style="height:28px">פוסט 4:5</span><span class="chip" style="height:28px">סטורי 9:16</span><span class="chip" style="height:28px">רילס</span></div>
    <div class="btn pc" ${k('make')}>צרי לי פוסט</div>
    <div class="wait nw" style="margin-top:8px" ${vis(T(3.0))}><p style="font:700 13px KA;color:${PCD}">מכינה לך 3 עיצובים, זה לוקח כדקה</p><p class="mu2">אפשר להישאר בדף, זה לא נתקע.</p><div class="bar"><i data-slide="${T(3.0)}"></i></div></div>
  </div>${navMore('תוכן')}</div>`;
}
const POST_TEXT = ['החגים מתקרבים, והעור שלך', 'מבקש רגע של שקט.', 'טיפול פנים קלאסי במחיר מיוחד', 'עד ערב החג. המקומות מוגבלים.', 'לקביעת תור: הקישור בביו'];
function genResult({ t0 }) {
  const T = (s) => +(t0 + s).toFixed(2);
  const opts = [
    { title1: 'לפני החגים', title2: 'טיפול פנים', badge: 'מחיר מיוחד', tone: 0, angle: 'מחיר לפני החג' },
    { title1: 'רגע של שקט', title2: 'לעור שלך', badge: 'לקביעת תור', tone: 1, angle: 'רוגע לפני החג' },
    { title1: 'מתכוננות', title2: 'לחגים?', badge: 'המקומות מוגבלים', tone: 2, angle: 'מקומות אחרונים' },
  ];
  return `<div class="scr" style="padding-top:16px">
  <div class="gen" style="padding:10px">
    <div class="row sb nw"><span class="gt">כתבי מה תרצי, ותקבלי פוסט מוכן</span></div>
    <div style="position:relative;height:18px"><p class="cnt" style="position:absolute;right:0" ${vis(0, T(0.5))}>3 מתוך 9 החודש</p><p class="cnt" style="position:absolute;right:0" ${vis(T(0.5))}>4 מתוך 9 החודש</p></div>
    <div class="row" style="gap:7px;align-items:flex-start;margin-top:6px">${opts.map((o, i) => `<div style="width:82px" ${vis(T(0.3 + i * 0.35))}>${postArt({ ...o, w: 82 })}
      <p class="mu2 nw" style="margin-top:4px">${i + 1}. ${o.angle}</p><div class="mini" ${k(`open${i}`)}>לפתוח ולערוך</div></div>`).join('')}</div>
    <div class="txtbox" style="margin-top:10px" ${vis(T(1.6))}>
      <div class="row sb nw" style="margin-bottom:2px"><span style="font:700 11px KA;color:#6B756F">טקסט לפוסט</span><span class="sbtn" style="margin:0">העתקה</span></div>
      ${POST_TEXT.map((l, i) => `<div ${wipe(T(2.0 + i * 0.55), T(2.45 + i * 0.55))}>${l}</div>`).join('')}
      <div style="color:${PCD};font-size:11px" ${wipe(T(4.9), T(5.3))}>#טיפולפנים #סטודיוליה</div>
    </div>
  </div>${navMore('תוכן')}</div>`;
}
/** The template gallery (DesignStudio "תבניות") and the editor's "מילוי עם AI" (app/design/AiFill.jsx). */
function gallery() {
  return `<div class="scr">${contentHead().replace('<span class="chip on" style="height:27px">השבוע</span><span class="chip" style="height:27px">תבניות</span>', '<span class="chip" style="height:27px">השבוע</span><span class="chip on" style="height:27px">תבניות</span>')}
  <div class="row" style="gap:10px;align-items:flex-start">${[0, 1, 2].map((i) => `<div style="width:80px">${postArt({ title1: ['טיפול פנים', 'מבצע החודש', 'לקוחה חדשה?'][i], sub: 'סטודיו ליה', tone: i, w: 80 })}
    <p class="b nw" style="font-size:11.5px;margin-top:4px">${['טיפול בפוקוס', 'מבצע', 'היכרות'][i]}</p><div class="mini" ${k(`use${i}`)}>להשתמש בתבנית</div></div>`).join('')}</div>
  ${navMore('תוכן')}</div>`;
}
function editor({ t0 }) {
  const T = (s) => +(t0 + s).toFixed(2);
  return `<div class="scr">
  <div class="row" style="gap:12px;align-items:flex-start;margin-bottom:10px">
    <div style="position:relative;width:132px;flex:none">
      <div ${vis(0, T(2.4))}>${postArt({ title1: 'טיפול פנים', title2: '', sub: 'סטודיו ליה', tone: 0, w: 132 })}</div>
      <div style="position:absolute;inset:0" ${vis(T(2.3))}>${postArt({ title1: 'הטיפול הראשון', title2: 'במחיר היכרות', sub: 'סטודיו ליה', badge: '₪249 לטיפול הראשון', tone: 0, w: 132, textAt: T(2.4) })}</div>
    </div>
    <div class="nw" style="padding-top:6px"><p style="font:700 16px KF">טיפול בפוקוס</p><p class="mu2">פוסט 4:5</p><p class="mu2" style="margin-top:8px">ככה זה נראה עם הלוגו,</p><p class="mu2">הצבע והשם שלך.</p></div>
  </div>
  <div style="border:1px dashed ${PC};border-radius:14px;padding:11px;background:${PCT}">
    <p class="b nw" style="font-size:13.5px;margin-bottom:3px">✦ מילוי עם AI</p>
    <div class="nw mu" style="line-height:1.5;margin-bottom:8px;color:#3B4842"><div>משפט אחד, וה-AI כותב את הטקסטים לתבנית,</div><div>טקסט לפוסט ושלושה כיוונים לתמונה.</div></div>
    <div class="row" style="gap:6px"><div class="inp f" style="flex:1"><span ${wipe(T(0.5), T(1.6))}>הטיפול הראשון במבצע ₪249</span></div><div class="btn pc" style="height:36px;padding:0 16px;font-size:13px" ${k('fill')}>מלאי</div></div>
    <div class="txtbox" style="margin-top:9px" ${vis(T(3.0))}><div class="row sb nw"><span style="font:700 11px KA;color:#6B756F">טקסט לפוסט</span><span class="sbtn" style="margin:0">העתקה</span></div>
      <div ${wipe(T(3.3), T(3.8))}>הטיפול הראשון שלך אצלי, במחיר היכרות.</div><div ${wipe(T(3.9), T(4.4))}>לקביעת תור: הקישור בביו</div></div>
  </div>
  <div class="mtoast" ${vis(T(2.6), T(5.2))}>הטקסטים מולאו. אפשר לשנות כל מילה.</div>
  </div>`;
}
const IDEAS = [
  { title: 'לפני ואחרי: ניקוי פנים עמוק', brief: 'העור לפני ואחרי, באור יום מהחלון', day: 'יום ראשון' },
  { title: 'שלושה טיפים לעור בחורף', brief: 'את מדברת למצלמה, שלוש נקודות קצרות', day: 'יום שלישי' },
  { title: 'ככה נראה הבוקר בסטודיו', brief: 'מסדרים את החדר לפני הלקוחה הראשונה', day: 'יום רביעי' },
  { title: 'שאלה שלקוחות שואלות אותי', brief: 'תשובה אחת קצרה, עד עשרים שניות', day: 'יום חמישי' },
];
function shootScr({ t0 }) {
  const T = (s) => +(t0 + s).toFixed(2);
  return `<div class="scr"><div class="aiblk" style="padding-bottom:8px">${aiBlockHead()}
  <div class="card" style="padding:10px 11px;margin-bottom:6px">
    <p class="b nw" style="font-size:13.5px">◦ מה לצלם השבוע</p>
    <div class="nw mu2" style="line-height:1.45;color:#3B4842"><div>3 עד 5 רעיונות של עשר דקות בעסק, לפי</div><div>השירותים והיומן שלך. כל רעיון יכול להפוך לרילס.</div></div>
    <div style="position:relative;height:34px;margin-top:6px">
      <span class="sbtn" style="position:absolute;right:0;top:0;height:32px;font-size:12.5px" ${vis(0, T(1.5))} ${k('ideas')}>תני לי רעיונות</span>
      <span class="sbtn" style="position:absolute;right:0;top:0;height:32px;font-size:12.5px" ${vis(T(1.5), T(2.7))}>חושבת…</span>
      <p class="nw" style="position:absolute;right:0;top:8px;font:700 11.5px KA;color:${PCD}" ${wipe(T(2.7), T(3.3))}>השבוע: עור בחורף, לפני שהחגים מתמלאים</p>
    </div>
    ${IDEAS.map((d, i) => `<div class="idea nw" ${vis(T(3.3 + i * 0.75))}><b>${d.title}</b><small>${d.brief}</small><small>${d.day} · 10 דק'</small><span class="sbtn">להפוך לרילס</span></div>`).join('')}
  </div></div></div>`;
}
function scriptCard() {
  return `<div class="scr"><div class="aiblk" style="padding-bottom:8px">${aiBlockHead()}
  <div class="card nw" style="padding:10px 11px"><p class="b" style="font-size:13.5px">◦ תסריט לצילום</p><p class="mu2" style="color:#3B4842">ה-AI כותב תסריט קצר לרילס, סצנה אחרי סצנה,</p><p class="mu2" style="color:#3B4842">על נושא שתבחרי.</p><span class="sbtn" style="height:32px;font-size:12.5px;margin-top:6px" ${k('script')}>לכתוב תסריט</span></div>
  <div class="gen nw" style="padding:9px 10px;margin-top:2px"><p class="gt">כתבי מה תרצי, ותקבלי פוסט מוכן</p><p class="cnt">4 מתוך 9 החודש</p></div>
  </div>${navMore('תוכן')}</div>`;
}
const REEL_TOPIC = 'לפני ואחרי: ניקוי פנים עמוק';
function reelForm({ t0 }) {
  const T = (s) => +(t0 + s).toFixed(2);
  return `<div class="scr"><div class="sel nw" style="direction:rtl;display:inline-block;margin-bottom:10px;padding:5px 12px">← חזרה לפוסטים ותבניות</div>
  <div class="card">
    <p class="lbl">על מה הרילס?</p>
    <div class="inp f" style="height:52px;align-items:flex-start;padding-top:8px;margin-bottom:10px"><span ${wipe(T(0.4), T(1.5))}>${REEL_TOPIC}</span></div>
    <p class="lbl">אורך</p>
    <div class="row" style="gap:5px;margin-bottom:10px">${['15 שניות', '30 שניות', '60 שניות'].map((l) => `<span class="chip ${l === '30 שניות' ? 'on' : ''}" style="flex:1;border-radius:999px">${l}</span>`).join('')}</div>
    <p class="lbl">ווייב (לא חובה)</p>
    <div class="chips" style="margin-bottom:12px">${['רגוע ומפנק', 'אנרגטי וקצבי', 'חם ואישי', 'מקצועי ומסביר', 'כיפי וצעיר'].map((l) => `<span class="chip" style="border-radius:999px;position:relative" ${l === 'רגוע ומפנק' ? k('vibe') : ''}>${l}${l === 'רגוע ומפנק' ? `<span class="chip on" style="position:absolute;inset:-1px;border-radius:999px" ${vis(T(2.0))}>${l}</span>` : ''}</span>`).join('')}</div>
    <div class="btn pc" ${k('reel')}>צרי לי רילס</div>
  </div>
  <p class="nw" style="text-align:center;font:600 12.5px KA;color:${PCD};margin-top:14px" ${vis(T(3.0))}>ה-AI כותב לך תסריט, הוראות צילום והכל...</p>
  ${navMore('תוכן')}</div>`;
}
const SCENES = [
  { n: 1, sec: 4, spoken: ['בואי תראי מה קורה', 'בניקוי פנים עמוק אצלי'], screen: 'ניקוי פנים עמוק', film: ['קרוב על הידיים והמגבת,', 'אור רך מהחלון'] },
  { n: 2, sec: 8, spoken: ['קודם ניקוי עדין,', 'ואז אדים שמכינים את העור'], screen: 'שלב ראשון', film: ['מהצד, הטלפון על חצובה', 'בגובה הכתפיים'] },
];
function reelResult({ t0 }) {
  const T = (s) => +(t0 + s).toFixed(2);
  return `<div class="scr" style="padding-top:16px">
  <div class="cover nw" ${vis(0)}><small>כותרת לכריכה</small><b ${wipe(T(0.3), T(0.9))}>ניקוי פנים עמוק, מקרוב</b><p ${wipe(T(1.0), T(1.7))}>ככה נראה טיפול אצלי, מההתחלה ועד הסוף</p></div>
  <div class="btn line" style="height:34px;margin-top:8px;border-color:${PC};color:#1F3A30;font-size:12.5px" ${vis(T(1.5))}>העתיקי את כל הרילס</div>
  ${SCENES.map((s, i) => {
    const a = 2.0 + i * 2.2;
    return `<div class="scene nw" ${vis(T(a))}><div class="row" style="gap:7px"><span style="font:700 17px KF;color:${PCD}">${s.n}</span><span class="badge">סצנה · ${s.sec} שניות</span></div>
      <p class="sl">מה אומרים</p>${s.spoken.map((l, j) => `<div class="sv" ${wipe(T(a + 0.3 + j * 0.4), T(a + 0.65 + j * 0.4))}>${l}</div>`).join('')}
      <p class="sl">טקסט על המסך</p><div class="sv2">${s.screen}</div>
      <p class="sl">איך לצלם</p>${s.film.map((l) => `<div class="sv2">${l}</div>`).join('')}</div>`;
  }).join('')}
  ${navMore('תוכן')}</div>`;
}

function videoAi(tl) {
  intro(tl, 'AI בעסק', '', ['יועצת שמכירה את המספרים שלך,', 'ופוסטים ורילסים שנכתבים בשבילך']);

  tl.scene(6, (at, end) => `
  ${title(at(0.1), end, 'איפה היועצת?')}
  ${step(at(0.3), end, 1)}${mock(at(0.1), end, homeScr())}${tap(at(1.2), 'nx-עוד')}
  ${mock(at(1.7), end, homeScr(moreSheet(), 'עוד'))}${ring(at(2.6), at(4.2), 't-יועץ AI')}${tap(at(3.8), 't-יועץ AI')}
  ${hint(at(0.9), end, ['בטלפון: ״עוד״ ← ״יועץ AI״.', 'במחשב: ״יועץ AI״ בתפריט הצד'])}`);

  tl.scene(6.4, (at, end) => `
  ${title(at(0.1), end, 'יועץ עסקי AI')}
  ${step(at(0.3), end, 2)}${mock(at(0.1), end, advEmpty({ fillAt: at(3.3) }))}${ring(at(1.4), at(3.0), 'q0')}${tap(at(2.7), 'q0')}
  ${hint(at(0.9), end, ['שאלה מוכנה, או כל שאלה שלך.', 'לחיצה מכניסה אותה לתיבה'])}`);

  tl.scene(10.6, (at, end) => `
  ${title(at(0.1), end, 'שואלים')}
  ${step(at(0.3), end, 3)}${mock(at(0.1), end, advChat({ t0: at(0) }))}${tap(at(0.4), 'send')}
  ${el('tagex', at(3), end, 'fade', '<span>תשובה לדוגמה</span>', 'top:192px')}
  ${hint(at(0.9), end, ['התשובה נכתבת לפי הנתונים שלך:', 'הלקוחות, התורים וההכנסות'])}`);

  tl.scene(5.6, (at, end) => `
  ${title(at(0.1), end, 'מהתשובה לפעולה')}
  ${step(at(0.3), end, 4)}${mock(at(0.1), end, advChat({ full: true }))}${ring(at(0.7), at(2.1), 'act')}${tap(at(1.8), 'act')}
  ${mock(at(2.3), at(3.9), homeScr())}${mock(at(3.6), end, todayLower())}
  ${hint(at(0.9), end, ['הכפתור בתשובה פותח את המסך המתאים.', 'היועצת לא שולחת כלום בעצמה'])}`);

  tl.scene(5.6, (at, end) => `
  ${title(at(0.1), end, 'בלשונית תוכן')}
  ${step(at(0.3), end, 5)}${mock(at(0.1), end, contentScr())}${ring(at(1.3), end, 'aiblk')}
  ${hint(at(0.9), end, ['כל מה שה-AI עושה בתוכן', 'נמצא במסגרת אחת: ״עם AI״'])}`);

  tl.scene(12.2, (at, end) => `
  ${title(at(0.1), end, 'משפט אחד, פוסט מוכן')}
  ${step(at(0.3), end, 6)}${mock(at(0.1), at(5.6), genForm({ t0: at(0) }))}${tap(at(2.6), 'make')}
  ${mock(at(5.4), end, genResult({ t0: at(5.4) }))}
  ${hint(at(0.9), at(5.6), ['כותבים מה רוצים לפרסם,', 'ומקבלים שלוש אפשרויות בצבעים שלך'])}
  ${hint(at(5.9), end, ['וגם טקסט לפוסט.', 'כל אפשרות נשמרת אצלך לעריכה'])}`);

  tl.scene(9.2, (at, end) => `
  ${title(at(0.1), end, 'מתבנית לפוסט')}
  ${step(at(0.3), end, 7)}${mock(at(0.1), end, gallery())}${tap(at(1.1), 'use0')}
  ${mock(at(1.6), end, editor({ t0: at(1.6) }))}${tap(at(3.5), 'fill')}
  ${hint(at(0.9), end, ['בתבנית שבחרת: ״מילוי עם AI״', 'כותב את הטקסטים לתוכה'])}`);

  tl.scene(9.4, (at, end) => `
  ${title(at(0.1), end, 'מה לצלם השבוע')}
  ${step(at(0.3), end, 8)}${mock(at(0.1), end, shootScr({ t0: at(0) }))}${tap(at(1.1), 'ideas')}
  ${hint(at(0.9), end, ['רעיונות קצרים לפי השירותים שלך,', 'כל אחד עם יום מומלץ'])}`);

  tl.scene(11.4, (at, end) => `
  ${title(at(0.1), end, 'תסריט לרילס')}
  ${step(at(0.3), end, 9)}${mock(at(0.1), end, scriptCard())}${tap(at(0.8), 'script')}
  ${mock(at(1.3), at(5.4), reelForm({ t0: at(1.3) }))}${tap(at(3.0), 'vibe')}${tap(at(3.8), 'reel')}
  ${mock(at(5.2), end, reelResult({ t0: at(5.2) }))}
  ${hint(at(0.9), end, ['סצנה אחרי סצנה: מה אומרים,', 'מה כתוב על המסך ואיך מצלמים'])}`);

  tl.scene(7.4, (at, end) => `
  ${title(at(0.1), end, 'טוב לדעת')}
  ${chk2(at(0.6), end, 'את תמיד מאשרת לפני שמפרסמים', 'שום דבר לא עולה לרשת בלעדייך', 270)}
  ${chk2(at(1.6), end, 'מכסה חודשית ליצירות AI', 'המונה מראה כמה נשאר, והן מתחדשות בראשון לחודש', 390)}
  ${chk2(at(2.6), end, 'התבניות פתוחות תמיד', 'בלי הגבלה, גם כשה-AI לא זמין', 510)}`);
  ending(tl);
}
// Writing and showing inside a phone screen (see wipe / vis above), run with every frame after the shared runtime.
const AI_RUNTIME = `<script>
document.addEventListener('DOMContentLoaded', () => {
  const base = window.__t;
  const c = (x) => Math.max(0, Math.min(1, x));
  const wipes = [...document.querySelectorAll('[data-wipe]')].map((e) => { const [a, b] = e.dataset.wipe.split(',').map(Number); return { e, a, b }; });
  const shows = [...document.querySelectorAll('[data-vis]')].map((e) => { const [a, b] = e.dataset.vis.split(',').map(Number); return { e, a, b }; });
  const slides = [...document.querySelectorAll('[data-slide]')].map((e) => ({ e, a: +e.dataset.slide }));
  const downs = [...document.querySelectorAll('[data-down]')].map((e) => { const [a, b] = e.dataset.down.split(',').map(Number); return { e, a, b }; });
  window.__t = async (t) => {
    for (const w of wipes) { const p = c((t - w.a) / (w.b - w.a)); w.e.style.clipPath = 'inset(-4px 0 -4px ' + ((1 - p) * 100).toFixed(1) + '%)'; }
    for (const s of shows) { const p = c((t - s.a) / .35) * (1 - c((t - s.b) / .3)); s.e.style.opacity = p.toFixed(3); s.e.style.transform = 'translateY(' + ((1 - c((t - s.a) / .35)) * 8).toFixed(1) + 'px)'; }
    // A box that grows with what is written in it: revealed from the top down, its bottom edge 30px below the newest line.
    for (const d of downs) { const h = d.e.offsetHeight || 1; const p = c((t - d.a) / (d.b - d.a)); const px = Math.min(h, 34 + p * (h - 34)); d.e.style.clipPath = 'inset(0 0 ' + (h - px).toFixed(1) + 'px 0 round 16px 16px 4px 16px)'; }
    for (const s of slides) { const x = (Math.sin((t - s.a) * 2) + 1) / 2; s.e.style.insetInlineStart = (x * 60).toFixed(1) + '%'; }
    return base(t);
  };
});
</script>`;

// ── build, check, render ─────────────────────────────────────────────────────────────────────────
const VIDEOS = {
  ai: videoAi,
  'appointment-actions': videoAppointmentActions,
  clients: videoClients,
  till: videoTill,
  reminders: videoReminders,
  'my-page': videoMyPage,
  'services-hours': videoServicesHours,
};
if (!VIDEOS[id]) { console.error(`usage: node topics-motion.mjs <${Object.keys(VIDEOS).join('|')}> [--publish] [--frame=t]`); process.exit(1); }

const tl = timeline();
VIDEOS[id](tl);
const seconds = tl.seconds;
// Taps and rings sit on the element they point at (data-k inside their mock), measured once the fonts are in.
const PLACE = `<script>
document.fonts.ready.then(() => {
  const missing = [];
  for (const e of document.querySelectorAll('[data-tid]')) {
    const m = document.getElementById(e.dataset.mock);
    const t = m && m.querySelector('[data-k="' + e.dataset.tid + '"]');
    if (!t) { missing.push(e.dataset.mock + ':' + e.dataset.tid); continue; }
    const r = t.getBoundingClientRect();
    if (e.dataset.ring) { e.style.left = (r.left - 5) + 'px'; e.style.top = (r.top - 5) + 'px'; e.style.width = (r.width + 10) + 'px'; e.style.height = (r.height + 10) + 'px'; }
    else { e.style.left = (r.left + r.width / 2 - 29) + 'px'; e.style.top = (r.top + r.height / 2 - 29) + 'px'; }
  }
  window.__missing = missing; window.__placed = true;
});
</script>`;
const html = page(tl.html + PLACE + AI_RUNTIME, CSS + AI_CSS);

/** Fails on any line wider than its box, anything leaving the phone's screen or the frame, and any tap with no target. */
async function check() {
  const browser = await openBrowser();
  try {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, locale: 'he-IL' });
    const pg = await ctx.newPage();
    await pg.setContent(html, { waitUntil: 'networkidle', timeout: 180000 });
    await pg.waitForFunction(() => window.__placed === true, null, { timeout: 60000 });
    const res = await pg.evaluate(() => {
      const bad = [];
      for (const s of document.querySelectorAll('.mock')) {
        const box = s.getBoundingClientRect();
        const l = box.left + 8, r = box.right - 8;
        for (const e of s.querySelectorAll('*')) {
          const b = e.getBoundingClientRect();
          if (!b.width || e.closest('.tabs')) continue;
          if (b.left < l - 1 || b.right > r + 1) bad.push(`${s.id} leaves the screen: "${(e.innerText || e.className).slice(0, 40)}" ${Math.round(b.left)}-${Math.round(b.right)}`);
          const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
          if (own && !/^(KA|KF|KG)\b/.test(getComputedStyle(e).fontFamily)) bad.push(`${s.id} not in a brand font: "${e.textContent.trim().slice(0, 30)}" (${getComputedStyle(e).fontFamily})`);
          if (getComputedStyle(e).whiteSpace === 'nowrap' && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow !== 'ellipsis' && e.clientWidth) bad.push(`${s.id} line too wide: "${(e.innerText || '').slice(0, 40)}"`);
        }
      }
      for (const e of document.querySelectorAll('.hint div,.title div,.chk div,.under span')) {
        const b = e.getBoundingClientRect();
        if (e.scrollWidth > e.clientWidth + 1 || b.left < 4 || b.right > 536) bad.push(`caption too wide: "${e.innerText.slice(0, 40)}" ${Math.round(b.left)}-${Math.round(b.right)}`);
      }
      return { bad: [...new Set(bad)], missing: window.__missing };
    });
    if (res.missing.length) throw new Error(`taps with no target: ${res.missing.join(', ')}`);
    if (res.bad.length) throw new Error(`layout:\n  ${res.bad.slice(0, 30).join('\n  ')}`);
  } finally {
    await browser.close();
  }
}

await check();
const stills = args.find((a) => a.startsWith('--stills='))?.split('=')[1];
if (stills) {
  // A quick look at many moments in one browser (draft size), for checking a cut before the full render.
  const browser = await openBrowser();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, locale: 'he-IL' });
  const pg = await ctx.newPage();
  await pg.setContent(html, { waitUntil: 'networkidle', timeout: 180000 });
  await pg.waitForFunction(() => window.__placed === true);
  const ts = stills === 'all' ? Array.from({ length: Math.floor(seconds / 1.5) }, (_, i) => +(0.9 + i * 1.5).toFixed(2)) : stills.split(',').map(Number);
  for (const t of ts) { await pg.evaluate((x) => window.__t(x), t); await pg.screenshot({ path: path.join(DIR, `s-${id}-${String(t.toFixed(2)).padStart(6, '0')}.png`) }); }
  await browser.close();
  log(`${ts.length} stills -> ${DIR}/s-${id}-*.png (${seconds} s)`);
} else if (stillAt != null) {
  log(`still -> ${await render({ html, seconds, still: +stillAt })} (${seconds} s)`);
} else {
  const mix = path.join(DIR, `${id}-audio.m4a`);
  if (fs.existsSync(MUSIC)) {
    ff(['-stream_loop', '-1', '-i', MUSIC, '-t', String(seconds), '-af', `volume=0.5,afade=t=in:st=0:d=0.8,afade=t=out:st=${(seconds - 2).toFixed(2)}:d=2`, '-c:a', 'aac', '-b:a', '128k', mix]);
  } else {
    log(`NO MUSIC: ${MUSIC} is missing, so this render has a silent track`);
    ff(['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', String(seconds), '-c:a', 'aac', '-b:a', '64k', mix]);
  }
  const outFile = path.join(TUT, `kalmea-tutorial-${id}.mp4`);
  const poster = path.join(TUT, `kalmea-tutorial-${id}.jpg`);
  await render({ html, seconds, outFile, audio: mix });
  ff(['-ss', '1.8', '-i', outFile, '-frames:v', '1', '-q:v', '3', poster]);
  log(`video -> ${outFile} (${seconds.toFixed(1)} s, ${Math.round(fs.statSync(outFile).size / 1024)} KB)`);
  if (PUBLISH) {
    const pub = path.join(path.dirname(OUT), '..', 'public', 'tutorials');
    fs.copyFileSync(outFile, path.join(pub, `kalmea-${id}.mp4`));
    fs.copyFileSync(poster, path.join(pub, `kalmea-${id}.jpg`));
    log(`published -> public/tutorials/kalmea-${id}.{mp4,jpg}`);
  }
}
