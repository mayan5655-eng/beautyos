const fs = require("fs");
const p = "app/beautyos.jsx";
let s = fs.readFileSync(p, "utf8");
const a1 = `    if (activeTab === "community") loadCommunityPosts();`;
const a2 = a1 + `
    if (activeTab === "protocols") loadProtocols();`;
if (s.includes(a1) && !s.includes('activeTab === "protocols"')) { s = s.replace(a1, a2); console.log("hook: OK"); }
else console.log("hook: SKIP/NOT FOUND");
fs.writeFileSync(p, s, "utf8");
