const fs = require("fs");
const c = fs.readFileSync("app/beautyos.jsx", "utf8");
// Find ${pc...} that sits inside double quotes (that is the broken case)
const bad = c.match(/"[^"]*\$\{pc[^"]*"/g) || [];
console.log("BAD (literal in quotes):", bad.length);
bad.slice(0, 5).forEach(b => console.log("  ", b));
