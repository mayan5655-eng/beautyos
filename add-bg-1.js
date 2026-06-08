const fs = require("fs");
const p = "app/beautyos.jsx";
let s = fs.readFileSync(p, "utf8");
const a1 = `  const [designing,         setDesigning]          = useState(false);`;
const a2 = a1 + `
  const [designBg,          setDesignBg]           = useState(null);`;
if (s.includes(a1) && !s.includes("setDesignBg")) { s = s.replace(a1, a2); console.log("1 state: OK"); }
else console.log("1 state: SKIP/NOT FOUND");
fs.writeFileSync(p, s, "utf8");
