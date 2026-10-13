// "Before and after" (20 s): split screen. Left: a messy paper appointment book and forgotten WhatsApp messages.
// Right: the calm Kalmea screens. It ends on "פחות בלגן. יותר שקט."
//   node video-src/beforeafter.mjs                 -> marketing/videos/beforeafter-*.{mp4,webm,jpg}
//   node video-src/beforeafter.mjs --still=2,8,18  -> stills (add --safe to draw the safe zone)
//
// Nothing here claims more than the app does today: a tidy calendar, a payment written down, a reminder message that
// is prepared and ready. No bot, no promise about numbers of spots. Names are demo-style first names plus an initial.
import { doc, render, BASE } from './vlib.mjs';

const css = `
.col{top:250px;width:236px;height:420px}
#L{left:42px}
#R{left:272px}
.lab{top:150px;width:236px;text-align:center;font:900 38px KF;color:var(--deep)}
#labL{left:32px}
#labR{left:272px}
#div{left:269px;top:150px;width:2px;height:560px;background:var(--deep);opacity:.18}
/* messy side */
.page{left:0;top:0;width:224px;height:330px;background:#FBF6E4;border-radius:6px;box-shadow:0 10px 24px rgba(0,0,0,.18);transform:rotate(-2.5deg);overflow:hidden;background-image:repeating-linear-gradient(#FBF6E4 0 29px,#cfd8e8 29px 30px)}
.page:before{content:"";position:absolute;right:30px;top:0;bottom:0;width:2px;background:#e48b8b}
.hw{position:absolute;right:40px;font:400 21px KH,KA;color:#2b3a8a;white-space:nowrap;transform-origin:100% 50%}
.cross{text-decoration:line-through;text-decoration-thickness:2px;color:#2b3a8a}
.ring{left:36px;top:228px;width:70px;height:70px;border-radius:50%;border:5px solid rgba(120,70,30,.28);box-shadow:inset 0 0 0 3px rgba(120,70,30,.12)}
.note{left:14px;top:60px;width:96px;padding:8px;background:#FFE680;font:400 19px/1.1 KH,KA;color:#7a3a00;box-shadow:0 6px 12px rgba(0,0,0,.2);transform:rotate(6deg)}
.wa{width:196px;padding:9px 12px;border-radius:12px 12px 12px 3px;background:#fff;box-shadow:0 3px 8px rgba(0,0,0,.14);font:600 15px/1.3 KA;color:#222}
.wa small{display:block;margin-top:3px;font:600 11px KA;color:#a0a0a0}
.badge{right:10px;top:-8px;min-width:26px;height:26px;border-radius:13px;background:#d9534f;color:#fff;font:700 14px/26px KA;text-align:center;padding:0 7px}
/* calm side */
.k{left:0;width:236px;background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:0 1px 3px rgba(24,48,36,.06)}
.k.ap{height:58px;display:flex;align-items:center;gap:10px;padding:0 12px;background:var(--green);border:none;color:#fff}
.k.ap b{font:700 15px KA;min-width:44px}
.k.ap .nm{font:700 15px KA}
.k.ap .sv{font:600 12px KA;opacity:.92}
.k.rm{padding:10px 12px}
.k.rm .a{font:700 14px KA;color:#A8544B}
.k.rm .b{font:600 14px/1.35 KA;color:var(--ink2)}
.k.pay{padding:10px 12px;display:flex;justify-content:space-between;align-items:center}
.k.pay .a{font:700 14px KA;color:var(--ink2)}
.k.pay .b{font:700 26px KF;color:var(--deep);direction:ltr}
.tick{display:inline-block;color:var(--green);font-weight:700}
#capL,#capR{top:700px;width:236px;text-align:center;font:700 22px/1.3 KA;color:var(--deep);opacity:0}
#capL{left:36px}#capR{left:272px}
#end{inset:0;background:var(--cream);opacity:0}
#end img{left:215px;top:210px;width:110px}
#end .big{top:350px;font-size:60px;line-height:1.2}
#end .url{top:560px;font-size:34px;color:var(--deep)}
`;
const body = `
<div id="labL" class="abs lab">לפני</div><div id="labR" class="abs lab">אחרי</div><div id="div" class="abs"></div>
<div id="L" class="abs col">
  <div class="abs page" id="page">
    <div class="hw" style="top:10px">שני 10:30 רונית</div>
    <div class="hw cross" style="top:40px;transform:rotate(-2deg)">12:00 דנה ?</div>
    <div class="hw" style="top:70px;transform:rotate(3deg)">13:30 ??? (נועה?)</div>
    <div class="hw cross" style="top:100px">15:00 מיכל</div>
    <div class="hw" style="top:130px;transform:rotate(-3deg)">לא לשכוח!! לסגור</div>
    <div class="hw cross" style="top:160px;transform:rotate(2deg)">רביעי 11:00 ...</div>
    <div class="hw" style="top:200px;transform:rotate(-4deg)">מי שילמה??</div>
    <div class="hw" style="top:245px;transform:rotate(2deg)">להתקשר חזרה</div>
    <div class="abs ring"></div>
    <div class="abs note">להחזיר לרונית!!</div>
  </div>
  <div class="abs wa" id="w1" style="left:10px;top:250px;transform:rotate(-2deg)">היי, אפשר תור לשבוע הבא?<small>לא נענה</small><div class="abs badge">3</div></div>
  <div class="abs wa" id="w2" style="left:4px;top:318px;transform:rotate(1.5deg)">ראית ששלחתי?<small>לא נענה</small></div>
  <div class="abs wa" id="w3" style="left:16px;top:372px;transform:rotate(-1deg)">שכחת אותי? :(<small>לא נענה</small><div class="abs badge">7</div></div>
</div>
<div id="R" class="abs col">
  <div class="abs k ap kk" style="top:0"><b>10:30</b><div><div class="nm">רונית</div><div class="sv">ניקוי פנים עמוק</div></div></div>
  <div class="abs k ap kk" style="top:68px"><b>12:00</b><div><div class="nm">דנה ל.</div><div class="sv">מניקור ג'ל</div></div></div>
  <div class="abs k ap kk" style="top:136px"><b>13:30</b><div><div class="nm">נועה כ.</div><div class="sv">טיפול פנים</div></div></div>
  <div class="abs k rm kk" style="top:210px"><div class="a">תזכורת מוכנה</div><div class="b">לרונית, מחר ב-10:30. לשלוח בלחיצה.</div></div>
  <div class="abs k pay kk" style="top:300px"><div class="a">תשלום נרשם <span class="tick">✓</span></div><div class="b">₪300</div></div>
</div>
<div id="capL" class="abs">מחברת, פתקים והודעות שנשכחו</div>
<div id="capR" class="abs">יומן, תזכורות ותשלומים במקום אחד</div>
<div id="end" class="abs"><img class="abs" src="${BASE}/flower-full.png"><div class="big abs c kf">פחות בלגן.<br>יותר שקט.</div><div class="url abs c ltr">kalmea.app</div></div>
`;
const script = `
const hws=[...document.querySelectorAll('.hw')], kk=[...document.querySelectorAll('.kk')];
const baseRot=hws.map((h)=>h.style.transform);
window.__t=(t)=>{
  const leave=1-inOut((t-16.2)/.8);
  $('labL').style.opacity=out3((t-.2)/.5)*leave; $('labR').style.opacity=out3((t-.2)/.5)*leave; $('div').style.opacity=.18*leave;
  // left: the page, then the scribbles one by one, then the notes pile up and the page shakes
  const pg=back((t-.5)/.6);
  $('page').style.opacity=clamp(pg)*leave;
  const shake=Math.sin(t*9)*2.2*win(t,9,13.5);
  $('page').style.transform='rotate('+(-2.5+shake)+'deg) translateY('+(1-clamp(pg))*30+'px)';
  hws.forEach((h,i)=>{ const p=out3((t-(1.0+i*.55))/.4); h.style.opacity=p; });
  document.querySelector('.ring').style.opacity=out3((t-4.4)/.4)*leave;
  document.querySelector('.note').style.opacity=out3((t-4.8)/.4)*leave;
  ['w1','w2','w3'].forEach((id,i)=>{ const p=back((t-(5.6+i*.9))/.45); $(id).style.opacity=clamp(p)*leave; $(id).style.marginTop=(1-clamp(p))*-20+'px'; });
  // right: calm cards settle in one at a time
  kk.forEach((k,i)=>{ const p=out3((t-(1.6+i*1.1))/.7); k.style.opacity=p*leave; k.style.transform='translateY('+(1-p)*22+'px)'; });
  // the left side dims a little while the right stays bright
  $('L').style.filter='saturate('+(1-.55*win(t,11,14))+')';
  $('L').style.opacity=1-.35*win(t,11,14);
  $('capL').style.opacity=out3((t-8.8)/.6)*leave; $('capR').style.opacity=out3((t-8.8)/.6)*leave;
  $('end').style.opacity=out3((t-16.8)/.8);
};
window.__t(0);
`;

await render({ name: 'beforeafter', seconds: 20, html: doc(css, body, script), posterAt: 13 });
