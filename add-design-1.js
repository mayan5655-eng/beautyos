const fs = require("fs");
const p = "app/beautyos.jsx";
let s = fs.readFileSync(p, "utf8");
const a1 = `  const [showPostModal,     setShowPostModal]      = useState(false);`;
const a2 = a1 + `
  const [designPost,        setDesignPost]         = useState(null);
  const [designing,         setDesigning]          = useState(false);`;
if (s.includes(a1) && !s.includes("setDesignPost")) { s = s.replace(a1, a2); console.log("1 state: OK"); }
else console.log("1 state: SKIP/NOT FOUND");
fs.writeFileSync(p, s, "utf8");
