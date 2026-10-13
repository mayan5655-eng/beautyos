// "Price" (15 s): the six costs from the landing page stack up, merge into one Kalmea card, the total drops to 499.
//   node video-src/price.mjs                 -> marketing/videos/price-*.{mp4,webm,jpg}
//   node video-src/price.mjs --still=2,5,9   -> stills (add --safe to draw the safe zone)
//
// The six rows and the totals are READ from app/LandingPage.jsx; the script refuses to render if they no longer add up
// to 3,831 - 10,068, the figures this video states.
import fs from 'node:fs';
import { doc, render, BASE } from './vlib.mjs';

const landing = fs.readFileSync(new URL('../../app/LandingPage.jsx', import.meta.url), 'utf8');
const block = landing.slice(landing.indexOf('const COST_ROWS = ['), landing.indexOf('];', landing.indexOf('const COST_ROWS = [')));
const ROWS = [...block.matchAll(/label:\s*"([^"]+)",\s*low:\s*(\d+),\s*high:\s*(\d+)/g)].map((m) => ({ label: m[1], low: +m[2], high: +m[3] }));
const LOW = ROWS.reduce((s, r) => s + r.low, 0), HIGH = ROWS.reduce((s, r) => s + r.high, 0);
if (ROWS.length !== 6 || LOW !== 3831 || HIGH !== 10068) throw new Error(`landing table is ${ROWS.length} rows, ${LOW}-${HIGH}; this video says 3,831-10,068`);
const PRICE = 499;

const css = `
#head{top:128px;width:150px;left:195px}
#eyebrow{top:178px;font-size:34px}
#card{left:32px;right:32px;top:250px;background:#fff;border-radius:22px;border:1px solid rgba(24,48,36,.08);box-shadow:0 1px 2px rgba(24,48,36,.04),0 18px 40px rgba(24,48,36,.10);overflow:hidden}
.row{display:flex;align-items:center;justify-content:space-between;padding:0 20px;height:62px;border-bottom:1px solid var(--line)}
.row:last-child{border-bottom:none}
.row .l{font:600 20px KA;color:var(--ink)}
.row .v{font:700 20px KA;color:var(--ink2);direction:ltr;unicode-bidi:plaintext}
#kcard{left:32px;right:32px;top:250px;height:350px;background:#fff;border-radius:22px;border:2px solid rgba(233,169,161,.7);box-shadow:0 18px 40px rgba(24,48,36,.12);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;opacity:0}
#kcard img{width:110px}
#kcard .t{font:700 34px/1.2 KF;color:var(--deep)}
#kcard .s{font:600 22px/1.4 KA;color:var(--ink2)}
#tl{top:632px;font-size:24px;color:var(--ink2)}
#tot{top:664px;display:flex;justify-content:center;align-items:baseline;gap:10px}
#tot span{font:700 56px/1.1 KF;color:var(--deep)}
#tot .u{font:700 28px KF}
#sub{top:742px;font-size:28px;color:var(--ink2);opacity:0}
#end{inset:0;opacity:0}
#end .big{top:300px;font-size:64px;line-height:1.15}
#end .no{top:470px;font-size:30px;color:var(--ink2)}
#end .url{top:560px;font-size:34px;color:var(--deep);letter-spacing:.02em}
`;
const body = `
<img id="head" class="abs" src="${BASE}/kalmea-wordmark.png">
<div id="eyebrow" class="abs c kf">כמה זה עולה בלי קלמיה</div>
<div id="card" class="abs">${ROWS.map((r) => `<div class="row" style="opacity:0"><span class="l">${r.label}</span><span class="v">${'₪' + r.low.toLocaleString('en-US')}–${'₪' + r.high.toLocaleString('en-US')}</span></div>`).join('')}</div>
<div id="kcard" class="abs"><img src="${BASE}/flower-full.png"><div class="t">קלמיה</div><div class="s">יומן · לקוחות · תשלומים · תוכן</div></div>
<div id="tl" class="abs c">סך הכל בחודש</div>
<div id="tot" class="abs c ltr"><span id="n1">₪0</span><span id="dash">–</span><span id="n2">₪0</span><span class="u" id="unit"></span></div>
<div id="sub" class="abs c kf">במקום שישה ספקים, מקום אחד.</div>
<div id="end" class="abs"><img class="abs" src="${BASE}/flower-full.png" style="left:215px;top:150px;width:110px"><div class="big abs c kf">חודש ראשון חינם</div><div class="no abs c">בלי כרטיס אשראי</div><div class="url abs c ltr">kalmea.app</div></div>
`;
const script = `
const rows=[...document.querySelectorAll('.row')];
const LOW=${LOW}, HIGH=${HIGH}, PRICE=${PRICE};
const lows=${JSON.stringify(ROWS.map((r) => r.low))}, highs=${JSON.stringify(ROWS.map((r) => r.high))};
window.__t=(t)=>{
  const intro=out3((t-.1)/.6), leaveAll=1-inOut((t-12.1)/.7);
  $('head').style.opacity=intro*leaveAll;
  $('eyebrow').style.opacity=intro*(1-inOut((t-5.5)/.6))*leaveAll;
  // 1) rows stack up one by one, the total follows
  let lo=0, hi=0;
  rows.forEach((r,i)=>{ const p=out3((t-(0.9+i*.55))/.5); r.style.opacity=p; r.style.transform='translateY('+(1-p)*16+'px)'; lo+=lows[i]*p; hi+=highs[i]*p; });
  // 2) rows merge into one Kalmea card (5.4 - 7.0)
  const m=inOut((t-5.4)/1.3);
  $('card').style.opacity=(out3((t-.7)/.4))*(1-m)*leaveAll;
  $('card').style.transform='scale('+(1-.12*m)+') translateY('+(-30*m)+'px)';
  $('kcard').style.opacity=out3((t-6.0)/.9)*leaveAll;
  $('kcard').style.transform='scale('+(.94+.06*out3((t-6.0)/.9))+')';
  // 3) the total: the sum of the rows, then it drops to the price
  $('tl').style.opacity=out3((t-1.0)/.5)*leaveAll;
  const drop=out3((t-6.4)/2.2);
  if(t<6.3){
    $('n1').textContent=ils(lo); $('dash').style.display=''; $('n2').textContent=ils(hi); $('unit').textContent='';
  } else {
    // both ends of the range fall onto the one price
    $('n1').textContent=ils(LOW+(PRICE-LOW)*drop);
    $('n2').textContent=ils(HIGH+(PRICE-HIGH)*drop);
    $('dash').style.display=drop>.995?'none':'';
    if(drop>.995){ $('n2').textContent=''; }
    $('unit').textContent=drop>.995?'לחודש':'';
  }
  $('tot').style.opacity=out3((t-1.0)/.5)*leaveAll;
  const settle=win(t,8.6,9.2); $('tot').style.transform='scale('+(1+.08*Math.sin(Math.PI*settle))+')';
  $('sub').style.opacity=out3((t-9.4)/.7)*leaveAll;
  // 4) end card
  $('end').style.opacity=out3((t-12.6)/.8);
};
window.__t(0);
`;

await render({ name: 'price', seconds: 15, html: doc(css, body, script), posterAt: 9.8 });
