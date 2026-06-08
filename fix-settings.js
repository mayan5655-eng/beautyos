const fs = require("fs");
const p = "app/beautyos.jsx";
let s = fs.readFileSync(p, "utf8");

// Edit 1: get user + their tenant at start of loadAll
const a1 = `  const loadAll = async () => {
    try {`;
const a2 = `  const loadAll = async () => {
    try {
      // Get the logged-in user and their tenant, to load the correct settings row
      const { data: { user } } = await supabase.auth.getUser();
      let myTenantId = null;
      if (user) {
        const { data: tm } = await supabase.from("tenant_members").select("tenant_id").eq("user_id", user.id).maybeSingle();
        myTenantId = tm?.tenant_id || null;
      }`;

// Edit 2: pick the row for this tenant, not [0]
const b1 = `      if(st.data&&st.data.length>0) setSettings(st.data[0]);`;
const b2 = `      if(st.data && st.data.length > 0) {
        // Pick the settings row for this user tenant, not just the first row
        const myRow = st.data.find(s => s.tenant_id === myTenantId) || st.data[0];
        setSettings(myRow);
      }`;

let ok1 = s.includes(a1), ok2 = s.includes(b1);
s = s.replace(a1, a2).replace(b1, b2);
fs.writeFileSync(p, s, "utf8");
console.log("Edit 1 (loadAll user):", ok1 ? "OK" : "NOT FOUND");
console.log("Edit 2 (pick row):", ok2 ? "OK" : "NOT FOUND");
