const fs = require("fs");
const p = "app/beautyos.jsx";
let s = fs.readFileSync(p, "utf8");
const log = [];

// 1) Add state for protocols (right after community state)
const a1 = `  const [communityPosts,    setCommunityPosts]     = useState([]);`;
const a2 = a1 + `
  const [protocols,         setProtocols]         = useState([]);
  const [protocolsLoading,  setProtocolsLoading]   = useState(false);`;
if (s.includes(a1) && !s.includes("setProtocols")) { s = s.replace(a1, a2); log.push("1 state: OK"); }
else log.push("1 state: SKIP/NOT FOUND");

// 2) Add loadProtocols function (right after loadCommunityPosts ends)
const b1 = `      setCommunityPosts(data || []);
    } catch { setCommunityPosts([]); }
    finally { setCommunityLoading(false); }
  };`;
const b2 = b1 + `
  // Load treatment protocols for the current tenant
  const loadProtocols = async () => {
    setProtocolsLoading(true);
    try {
      const { data } = await supabase
        .from("treatment_protocols")
        .select("*")
        .order("created_at", { ascending: false });
      setProtocols(data || []);
    } catch { setProtocols([]); }
    finally { setProtocolsLoading(false); }
  };`;
if (s.includes(b1) && !s.includes("loadProtocols")) { s = s.replace(b1, b2); log.push("2 loadProtocols: OK"); }
else log.push("2 loadProtocols: SKIP/NOT FOUND");

// 3) Add the tab to the menu (after packages tab)
const c1 = `          {id:"packages", label:"מנויים"},`;
const c2 = c1 + `
          {id:"protocols",label:"פרוטוקולים"},`;
if (s.includes(c1) && !s.includes('id:"protocols"')) { s = s.replace(c1, c2); log.push("3 tab: OK"); }
else log.push("3 tab: SKIP/NOT FOUND");

fs.writeFileSync(p, s, "utf8");
log.forEach(l => console.log(l));
