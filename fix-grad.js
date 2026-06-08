const fs = require("fs");
const p = "app/beautyos.jsx";
let s = fs.readFileSync(p, "utf8");
// Fix: "${pcGrad}" inside quotes is literal text; make it a real JS variable
const before = (s.match(/background:"\$\{pcGrad\}"/g)||[]).length;
s = s.split('background:"${pcGrad}"').join("background:pcGrad");
fs.writeFileSync(p, s, "utf8");
console.log("Fixed gradient refs:", before);
