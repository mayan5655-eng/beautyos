const fs = require("fs");
const p = "app/beautyos.jsx";
let s = fs.readFileSync(p, "utf8");
const log = [];

// 1) State for the form + modal
const a1 = `  const [showWaitlistModal, setShowWaitlistModal]  = useState(false);`;
const a2 = a1 + `
  const emptyProtocol = {brand:"",name:"",concern:"",skin_types:[],frequency:"",sessions_count:1,duration_minutes:60,price:0,notes:""};
  const [newProtocol,      setNewProtocol]      = useState(emptyProtocol);
  const [showProtocolModal, setShowProtocolModal] = useState(false);`;
if (s.includes(a1) && !s.includes("setNewProtocol")) { s = s.replace(a1, a2); log.push("1 state: OK"); }
else log.push("1 state: SKIP/NOT FOUND");

// 2) Save function (modeled on handleSaveWaitlist)
const b1 = `  const handleExportCSV = () => {`;
const b2 = `  const handleSaveProtocol = async () => {
    if(!newProtocol.brand||!newProtocol.name){toast("נא למלא מותג ושם","error");return;}
    const {data,error}=await supabase.from("treatment_protocols").insert([newProtocol]).select();
    if(error){handleDbError(error, "save protocol"); return;}
    if(data){setProtocols(prev=>[data[0],...prev]);setShowProtocolModal(false);setNewProtocol(emptyProtocol);toast("הפרוטוקול נשמר");}
  };

  const handleExportCSV = () => {`;
if (s.includes(b1) && !s.includes("handleSaveProtocol")) { s = s.replace(b1, b2); log.push("2 save: OK"); }
else log.push("2 save: SKIP/NOT FOUND");

fs.writeFileSync(p, s, "utf8");
log.forEach(l => console.log(l));
