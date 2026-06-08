const fs = require("fs");
const p = "app/beautyos.jsx";
let s = fs.readFileSync(p, "utf8");
const log = [];

// 1) Inject a useEffect that writes the chosen color into CSS variables,
//    so the static <style> block can use var(--pc) / var(--pc-tint).
const anchor = "  const pcShadow = `rgba(${pcRgb.r},${pcRgb.g},${pcRgb.b},0.25)`;";
const injected = anchor + `
  // Push the active palette into CSS variables for the static <style> block
  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty("--pc", pc);
    document.documentElement.style.setProperty("--pc-tint", pcTint);
  }`;
if (s.includes(anchor) && !s.includes('--pc')) { s = s.replace(anchor, injected); log.push("1 css-vars: OK"); }
else log.push("1 css-vars: SKIP/NOT FOUND");

// 2) Static CSS buttons -> use the CSS variable
const css1 = ".call-btn{background:#C77B92;";
const css1b = ".call-btn{background:var(--pc);";
if (s.includes(css1)) { s = s.replace(css1, css1b); log.push("2a call-btn: OK"); } else log.push("2a call-btn: NOT FOUND");

const css2 = "color:#C77B92;font-size:13px;cursor:pointer;font-family:inherit;transition:background";
const css2b = "color:var(--pc);font-size:13px;cursor:pointer;font-family:inherit;transition:background";
if (s.includes(css2)) { s = s.replace(css2, css2b); log.push("2b icon-btn: OK"); } else log.push("2b icon-btn: NOT FOUND");

// 3) Neutralize hardcoded pink borders -> neutral border already used elsewhere
const beforeB = (s.match(/1px solid #E8B5C4/g)||[]).length;
s = s.split("1px solid #E8B5C4").join("1px solid #EFE7EB");
const beforeBD = (s.match(/1px dashed #E8B5C4/g)||[]).length;
s = s.split("1px dashed #E8B5C4").join("1px dashed #EFE7EB");
log.push("3 borders replaced: " + (beforeB + beforeBD));

// 4) Decorative pink gradient lines -> tint variable shade (use pcTint via inline)
const beforeG = (s.match(/linear-gradient\(90deg,#F6D9E2,#E8B5C4,#F6D9E2\)/g)||[]).length;
s = s.split("linear-gradient(90deg,#F6D9E2,#E8B5C4,#F6D9E2)").join("${pcGrad}");
log.push("4 gradient lines replaced: " + beforeG);

fs.writeFileSync(p, s, "utf8");
log.forEach(l => console.log(l));
