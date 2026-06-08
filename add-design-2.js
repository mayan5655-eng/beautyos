const fs = require("fs");
const p = "app/beautyos.jsx";
let s = fs.readFileSync(p, "utf8");
const anchor = `  // Save the current generated campaign + posts to the database`;
const fn = `  // Render the styled post template (DOM node #post-design) to a 1080x1080 PNG
  const downloadPostImage = async () => {
    const node = document.getElementById("post-design");
    if (!node) { toast("התבנית לא נמצאה", "error"); return; }
    setDesigning(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(node, { backgroundColor: null, scale: 2, useCORS: true });
      canvas.toBlob((out) => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(out);
        link.download = "beautyos-design-" + Date.now() + ".png";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        toast("התמונה המעוצבת הורדה");
      }, "image/png");
    } catch (e) {
      toast("שגיאה ביצירת התמונה", "error");
    } finally { setDesigning(false); }
  };

`;
if (s.includes(anchor) && !s.includes("downloadPostImage")) { s = s.replace(anchor, fn + anchor); console.log("2 fn: OK"); }
else console.log("2 fn: SKIP/NOT FOUND");
fs.writeFileSync(p, s, "utf8");
