// "Voice" (25 s): a phone zooming into the demo app. She says one sentence, the appointment lands in the calendar, the
// day's revenue counts up, a ready post pops in, then the "one question" card appears.
//   node video-src/voice.mjs                 -> marketing/videos/voice-*.{mp4,webm,jpg}
//   node video-src/voice.mjs --still=2,6,12  -> stills (add --safe to draw the safe zone)
//
// The screens are RECREATED in HTML from the app's own tokens and the landing page's phone mock (same colours, card
// shapes and copy), not recorded: a deterministic frame-by-frame render is what keeps every frame sharp. Demo-style
// data only: first names plus an initial, nothing from a real tenant.
import { doc, render, BASE } from './vlib.mjs';

const SENTENCE = 'קבעי תור לרונית מחר בעשר וחצי';

const css = `
#phone{left:105px;top:222px;width:330px;height:640px;border-radius:40px;border:8px solid var(--ink);background:var(--ink);box-shadow:0 30px 60px rgba(24,48,36,.28);overflow:hidden;transform-origin:50% 50%}
#scr{position:absolute;inset:0;background:var(--cream);overflow:hidden;border-radius:30px}
#top{left:0;right:0;top:0;height:50px;display:flex;align-items:center;justify-content:space-between;padding:12px 16px 0}
#top img{height:22px}
#top .gear{width:18px;height:18px;border-radius:50%;border:2px solid var(--ink2);opacity:.6}
.view{position:absolute;left:0;right:0;top:50px;bottom:56px;padding:6px 14px 0}
.card{background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:0 1px 3px rgba(24,48,36,.06)}
.h{font:700 20px KF;color:var(--ink);margin:2px 2px 10px}
.rev{padding:12px 14px;margin-bottom:10px}
.rev .l{font:600 12px KA;color:var(--ink2)}
.rev .n{font:700 34px/1.15 KF;color:var(--deep);direction:ltr;text-align:right;font-variant-numeric:tabular-nums}
.ap{display:flex;align-items:center;gap:10px;padding:9px 12px;margin-bottom:7px;border-radius:13px;background:#fff;border:1px solid var(--line)}
.ap b{font:700 12px KA;color:var(--deep);min-width:38px}
.ap .nm{font:700 13px KA;color:var(--ink)}
.ap .sv{font:600 11px KA;color:var(--ink2)}
.slot{position:relative;display:flex;align-items:center;gap:10px;margin-bottom:8px}
.slot .tm{width:42px;font:700 12px KA;color:var(--ink2);text-align:left;direction:ltr}
.slot .bx{flex:1;height:50px;border-radius:14px;display:flex;align-items:center;padding:0 12px;font:600 12px KA}
.free{border:1.5px dashed #cfc6d6;color:#9a90a2;background:rgba(255,255,255,.55)}
.booked{background:var(--green);color:#fff;flex-direction:column;align-items:flex-start!important;justify-content:center}
.booked .nm{font:700 14px KA}
.booked .sv{font:600 11px KA;opacity:.92}
#nav{left:0;right:0;bottom:0;height:56px;background:#fff;border-top:1px solid var(--line);display:flex;justify-content:space-around;align-items:center;font:700 10px KA;color:var(--ink2)}
#mic{left:14px;bottom:70px;width:46px;height:46px;border-radius:50%;background:var(--deep);display:flex;align-items:center;justify-content:center}
#mic svg{width:22px;height:22px;stroke:#fff;fill:none;stroke-width:1.8;stroke-linecap:round}
#ring{left:14px;bottom:70px;width:46px;height:46px;border-radius:50%;border:2px solid var(--petal)}
#post{left:12px;right:12px;bottom:124px;padding:8px;border-radius:18px;opacity:0}
#post .im{height:150px;border-radius:12px;background:url(${BASE}/defaults/hero.jpg) center/cover}
#post .t{font:700 14px KA;color:var(--ink);margin:8px 4px 2px}
#post .s{font:600 11px KA;color:var(--ink2);margin:0 4px 4px}
#post .b{display:inline-block;margin:4px;padding:6px 12px;border-radius:99px;background:var(--deep);color:#fff;font:700 11px KA}
#q{left:12px;right:12px;bottom:124px;padding:12px 14px;border-radius:16px;border:1px solid rgba(233,169,161,.7);opacity:0}
#q .k{font:700 15px KH,KA;color:#A8544B;margin-bottom:4px}
#q .p{font:600 13px/1.5 KA;color:var(--ink2)}
#say{left:32px;right:32px;top:140px;padding:14px 18px;border-radius:22px;background:#fff;border:1px solid var(--line);box-shadow:0 12px 30px rgba(24,48,36,.14);display:flex;align-items:center;gap:12px;opacity:0}
#say svg{flex:none;width:30px;height:30px;stroke:var(--deep);fill:none;stroke-width:1.8;stroke-linecap:round}
#say span{font:700 30px/1.25 KA;color:var(--deep)}
#cap{left:32px;right:32px;top:138px;text-align:center;opacity:0}
#cap span{display:inline-block;padding:8px 20px;border-radius:99px;background:var(--cream);box-shadow:0 0 0 2px var(--deep) inset;font:700 28px/1.3 KA;color:var(--deep)}
#end{inset:0;background:var(--cream);opacity:0}
#end img{left:215px;top:240px;width:110px}
#end .big{top:380px;font-size:62px;line-height:1.15}
#end .url{top:520px;font-size:34px;color:var(--deep)}
`;
const body = `
<div id="phone" class="abs"><div id="scr">
  <div id="top" class="abs"><img src="${BASE}/kalmea-wordmark.png"><div class="gear"></div></div>
  <div id="vHome" class="view abs">
    <div class="h">בוקר טוב</div>
    <div class="card rev"><div class="l">הכנסות היום</div><div class="n" id="rev">₪0</div></div>
    <div class="ap"><b>10:30</b><div><div class="nm">אביגיל ג.</div><div class="sv">ניקוי פנים עמוק</div></div></div>
    <div class="ap"><b>12:00</b><div><div class="nm">דנה ל.</div><div class="sv">מניקור ג'ל</div></div></div>
  </div>
  <div id="vCal" class="view abs" style="opacity:0">
    <div class="h">יומן · מחר</div>
    <div class="slot"><div class="tm">09:00</div><div class="bx free">+ פנוי</div></div>
    <div class="slot"><div class="tm">10:30</div><div class="bx free" id="slotFree">+ פנוי</div><div id="newAp" class="bx booked abs" style="opacity:0;left:0;right:52px;height:50px"><div class="nm">רונית ✓</div><div class="sv">ניקוי פנים עמוק · 75 ד׳</div></div></div>
    <div class="slot"><div class="tm">12:00</div><div class="bx booked"><div class="nm">דנה ל. ✓</div><div class="sv">מניקור ג'ל · 60 ד׳</div></div></div>
    <div class="slot"><div class="tm">13:30</div><div class="bx booked"><div class="nm">נועה כ. ✓</div><div class="sv">טיפול פנים · 75 ד׳</div></div></div>
    <div class="slot"><div class="tm">15:00</div><div class="bx free">+ פנוי</div></div>
    <div class="slot"><div class="tm">16:00</div><div class="bx free">+ פנוי</div></div>
  </div>
  <div id="post" class="abs card"><div class="im"></div><div class="t">פוסט מוכן, בצבעים שלך</div><div class="s">ניקוי פנים עמוק</div><span class="b">לפרסום</span></div>
  <div id="q" class="abs card"><div class="k">שאלה אחת</div><div class="p">התפנה תור ב-14:00 — להציע אותו בוואטסאפ ללקוחות מתאימות?</div></div>
  <div id="ring" class="abs"></div>
  <div id="mic" class="abs"><svg viewBox="0 0 24 24"><rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg></div>
  <div id="nav" class="abs"><span>היום</span><span>יומן</span><span>לקוחות</span><span>תשלום</span><span>תוכן</span></div>
</div></div>
<div id="say" class="abs"><svg viewBox="0 0 24 24"><rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg><span id="sayText"></span></div>
<div id="cap" class="abs"><span id="capText"></span></div>
<div id="end" class="abs"><img class="abs" src="${BASE}/flower-full.png"><div class="big abs c kf">פשוט תגידי לה</div><div class="url abs c ltr">kalmea.app</div></div>
`;
const script = `
const SENT=${JSON.stringify(SENTENCE)};
const caps=[[5.9,10.6,'התור נכנס ליומן'],[11.0,15.0,'היום שלך, מסודר'],[15.6,19.4,'ופוסט מוכן, בצבעים שלך'],[19.9,23.2,'ושאלה אחת: להציע את התור שהתפנה']];
window.__t=(t)=>{
  const leave=1-inOut((t-23.2)/.8);
  // phone: fades in small, then slowly zooms into the screen
  const z=.74+.5*inOut((t-.2)/6.5)+.06*win(t,15,24);
  $('phone').style.transform='scale('+z+') translateY('+(-8*inOut((t-1)/5))+'px)';
  $('phone').style.opacity=out3(t/.6)*leave;
  // she speaks: the sentence types out, the mic pulses
  const typed=Math.floor(SENT.length*win(t,1.5,4.5));
  $('sayText').textContent=SENT.slice(0,typed);
  $('say').style.opacity=out3((t-1.1)/.4)*(1-out3((t-4.9)/.4));
  const speaking=t>1.2&&t<4.8;
  const ph=(t*1.5)%1;
  $('ring').style.opacity=speaking?(1-ph)*.9:0;
  $('ring').style.transform='scale('+(1+ph*1.0)+')';
  // home -> calendar -> home
  const toCal=inOut((t-5.2)/.6), toHome=inOut((t-10.8)/.6);
  const cal=toCal*(1-toHome);
  $('vCal').style.opacity=cal; $('vHome').style.opacity=1-cal;
  $('vCal').style.transform='translateX('+(1-cal)*24+'px)';
  // the new appointment pops into its slot
  const ap=back((t-5.9)/.55);
  $('newAp').style.opacity=out3((t-5.9)/.2);
  $('newAp').style.transform='scale('+(.86+.14*clamp(ap))+')';
  $('slotFree').style.opacity=1-out3((t-5.9)/.2);
  // revenue counts up
  $('rev').textContent=ils(890*out3((t-11.3)/3.0));
  // the ready post pops in, then leaves for the question card
  const post=back((t-15.2)/.6)*(1-inOut((t-19.4)/.5));
  $('post').style.opacity=clamp(post); $('post').style.transform='translateY('+(1-clamp(post))*60+'px) scale('+(.9+.1*clamp(post))+')';
  const q=out3((t-19.9)/.5)*(1-inOut((t-23.0)/.6));
  $('q').style.opacity=q; $('q').style.transform='translateY('+(1-q)*30+'px)';
  // subtitle
  let c=0,txt=''; for(const [a,b,s] of caps){ if(t>=a-.01&&t<=b+.4){ c=out3((t-a)/.35)*(1-out3((t-b)/.4)); txt=s; } }
  $('capText').textContent=txt; $('cap').style.opacity=c;
  // end card
  $('end').style.opacity=out3((t-23.4)/.7);
};
window.__t(0);
`;

await render({ name: 'voice', seconds: 25, html: doc(css, body, script), posterAt: 12.5 });
