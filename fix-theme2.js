const fs = require("fs");
const p = "app/beautyos.jsx";
let s = fs.readFileSync(p, "utf8");
const log = [];

// 1) Thin decorative lines with transparent: pink -> var(--pc)
let n1 = 0;
["linear-gradient(90deg,transparent,#E8B5C4)","linear-gradient(90deg,#E8B5C4,transparent)"].forEach(g=>{
  const c=(s.split(g).length-1); n1+=c;
  s=s.split(g).join(g.replace("#E8B5C4","var(--pc)"));
});
log.push("1 thin lines: "+n1);

// 2) Pink gradient backgrounds inside quotes -> pcTint variable (remove quotes)
let n2 = 0;
[
  'background:"linear-gradient(90deg,#F6D9E2 0%,#FBEEF2 25%,#FFFFFF 50%,#FBEEF2 75%,#F6D9E2 100%)"',
  'background:"linear-gradient(90deg,#FBEEF2,#F6D9E2)"',
  'background:"linear-gradient(135deg,#FBEEF2,#F6D9E2)"'
].forEach(g=>{
  const c=(s.split(g).length-1); n2+=c;
  s=s.split(g).join("background:pcTint");
});
log.push("2 gradient backgrounds: "+n2);

// 3) Big numbers color -> pc
const big = 'fontSize:22,fontWeight:600,color:"#E8B5C4"';
if(s.includes(big)){ s=s.split(big).join("fontSize:22,fontWeight:600,color:pc"); log.push("3 big numbers: OK"); }
else log.push("3 big numbers: NOT FOUND");

// 4) Last pink border -> neutral
const b = "1.5px solid #E8B5C4";
const bc = (s.split(b).length-1);
s = s.split(b).join("1.5px solid #EFE7EB");
log.push("4 border 1.5px: "+bc);

fs.writeFileSync(p, s, "utf8");
log.forEach(l=>console.log(l));
