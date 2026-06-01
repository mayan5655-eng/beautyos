"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./supabase";

// ============================================================
// CONSTANTS
// ============================================================

const DEFAULT_SERVICES = [
  {name:"טיפול פנים",price:250,duration:60,color:"#C77B92",active:true},
  {name:"הסרת שיער",price:180,duration:45,color:"#D89AAE",active:true},
  {name:"עיצוב גבות",price:80,duration:30,color:"#E8B5C4",active:true},
  {name:"מניקור",price:120,duration:45,color:"#CBA0B4",active:true},
  {name:"פדיקור",price:150,duration:60,color:"#B98AA0",active:true},
  {name:"לק ג'ל",price:160,duration:60,color:"#DBA9BC",active:true},
  {name:"בוטוקס",price:800,duration:45,color:"#A86C82",active:true},
  {name:"פילינג",price:350,duration:60,color:"#D193A8",active:true},
  {name:"טיפול פלזמה",price:600,duration:60,color:"#9E6178",active:true},
  {name:"מכשור מתקדם",price:400,duration:60,color:"#C283A0",active:true},
];

const HOURS_ALL = ["07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"];
const DAYS_HE = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
const MONTHS_HE = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const SKIN_TYPES = ["יבש","שמן","מעורב","רגיש","נורמלי","אסתתי"];
const STATUS_COLORS = {"VIP":"#C77B92","active":"#D89AAE","cold":"#C9B8C2","hot":"#B85C7E"};
const STATUS_LABELS = {"VIP":"VIP","active":"פעילה","cold":"לא פעילה","hot":"חמה"};
const FORM_TYPES = [
  {key:"general",label:"הצהרת בריאות כללית"},
  {key:"plasma",label:"טיפול פלזמה"},
  {key:"device",label:"מכשור מתקדם"},
  {key:"laser",label:"הסרת שיער בלייזר"},
  {key:"peel",label:"פילינג כימי"},
];
const LEAD_SOURCES = ["פייסבוק","אינסטגרם","גוגל","טיקטוק","המלצה","הליכה ברחוב","אחר"];
const LEAD_STATUSES = {
 "new":       {label:"חדש",         color:"#5580C4",bg:"#EBF3FF"},
 "contacted": {label:"יצרתי קשר",  color:"#C77B92",bg:"#FBEEF2"},
 "scheduled": {label:"נקבע תור",   color:"#388E3C",bg:"#E8F5E9"},
 "closed":    {label:"נסגר",        color:"#7B1FA2",bg:"#F3E5F5"},
 "lost":      {label:"לא רלוונטי", color:"#C62828",bg:"#FEEBEE"},
};
const SOURCE_ICONS = {"פייסבוק":"◦","אינסטגרם":"◦","גוגל":"◦","טיקטוק":"◦","המלצה":"◦","הליכה ברחוב":"◦","אחר":"◦"};
const PAYMENT_METHODS = [
  {key:"מזומן",icon:"◦",color:"#C77B92"},
  {key:"אשראי",icon:"◦",color:"#B98AA0"},
  {key:"ביט",icon:"◦",color:"#A86C82"},
  {key:"פייבוקס",icon:"◦",color:"#D193A8"},
  {key:"העברה",icon:"◦",color:"#9E6178"},
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getWeekDates(startDate) {
  const days = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    days.push(d);
  }
  return days;
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function formatDateHe(date) {
  return `${date.getDate()}/${date.getMonth()+1}`;
}

function waLink(phone) {
  if (!phone) return null;
  const clean = phone.replace(/\D/g,"");
  const intl = clean.startsWith("0") ? "972" + clean.slice(1) : clean;
  return `https://wa.me/${intl}`;
}

function waMsg(phone, msg) {
  if (!phone) return null;
  const clean = phone.replace(/\D/g,"");
  const intl = clean.startsWith("0") ? "972" + clean.slice(1) : clean;
  return `https://wa.me/${intl}?text=${encodeURIComponent(msg)}`;
}
function waConfirmLink(phone, name, service, date, hour, apptId, origin) {
  const confirmUrl = `${origin}/confirm?id=${apptId}&action=confirm`;
  const cancelUrl  = `${origin}/confirm?id=${apptId}&action=cancel`;
  return waMsg(
    phone,
    `שלום ${name}! ✦\nתזכורת לתור מחר:\n${service}\n${date} בשעה ${hour}:00\n\nלאישור התור:\n${confirmUrl}\n\nלביטול התור:\n${cancelUrl}\n\nמחכים לך! `
  );
}

function waBirthday(phone, name, businessName) {
  return waMsg(phone, `שלום ${name}! \nיום הולדת שמח! \nמ${businessName} אנחנו שולחים לך ברכות חמות!\nלרגל היום המיוחד - 15% הנחה על הטיפול הבא שלך \nנחכה לך! ✦`);
}

function waReview(phone, name) {
  return waMsg(phone, `שלום ${name}! \nתודה שביקרת אצלנו!\nנשמח מאוד אם תשאירי לנו ביקורת \nזה לוקח רק דקה ועוזר לנו מאוד! `);
}

function waPayment(phone, name, amount, service, method, businessPhone) {
  let payLine = "";
  if (method==="ביט"&&businessPhone) payLine=`\nביט: ${businessPhone}`;
  else if (method==="פייבוקס") payLine=`\nפייבוקס`;
  else if (method==="העברה") payLine=`\nהעברה בנקאית`;
  return waMsg(phone, `שלום ${name}! \nתודה על הביקור! ✦\nלתשלום עבור ${service}:\nסכום: ₪${amount}${payLine}\n\nתודה רבה! `);
}

const emptyClient = {name:"",phone:"",birthday:"",skinType:"",allergies:"",medical:"",notes:"",status:"active"};
const emptyLead = {name:"",phone:"",source:"פייסבוק",service_interest:"",status:"new",notes:"",reminder_date:""};

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function BeautyOS() {
  const router = useRouter();

  // === DATA STATES ===
  const [appointments, setAppointments] = useState([]);
  const [clients,      setClients]      = useState([]);
  const [forms,        setForms]        = useState([]);
  const [leads,        setLeads]        = useState([]);
  const [receipts,     setReceipts]     = useState([]);
  const [services,     setServices]     = useState(DEFAULT_SERVICES);
  const [packages,     setPackages]     = useState([]);
  const [waitlist,     setWaitlist]     = useState([]);
  const [settings,     setSettings]     = useState({business_name:"BeautyOS",therapist_name:"רונית",primary_color:"#C77B92",working_hours_start:8,working_hours_end:19,business_phone:""});

  // === UI STATES ===
  const [weekStart,         setWeekStart]         = useState(new Date());
  const [showModal,         setShowModal]          = useState(false);
  const [showClientModal,   setShowClientModal]    = useState(false);
  const [showLeadModal,     setShowLeadModal]      = useState(false);
  const [showSettings,      setShowSettings]       = useState(false);
  const [showCashier,       setShowCashier]        = useState(false);
  const [showReceipt,       setShowReceipt]        = useState(null);
  const [showPackageModal,  setShowPackageModal]   = useState(false);
  const [showWaitlistModal, setShowWaitlistModal]  = useState(false);
  const [editingClient,     setEditingClient]      = useState(null);
  const [editingLead,       setEditingLead]        = useState(null);
  const [selectedClient,    setSelectedClient]     = useState(null);
  const [selectedLead,      setSelectedLead]       = useState(null);
  // Facebook campaigns (live ad performance)
  const [fbCampaigns,    setFbCampaigns]    = useState(null);
  const [fbTotals,       setFbTotals]       = useState(null);
  const [fbLoading,      setFbLoading]      = useState(false);
  const [fbError,        setFbError]        = useState(null);
  const [fbDatePreset,   setFbDatePreset]   = useState("last_30d");
  const [activeTab,         setActiveTab]          = useState("dashboard");
  const [clientTab,         setClientTab]          = useState("info");
  const [settingsTab,       setSettingsTab]        = useState("general");
  const [leadFilter,        setLeadFilter]         = useState("all");
  const [leadSearch,        setLeadSearch]         = useState("");
  const [leadSourceFilter,  setLeadSourceFilter]   = useState("all");
  const [hoveredAppt,       setHoveredAppt]        = useState(null);
  const [loading,           setLoading]            = useState(true);
  const [uploading,         setUploading]          = useState(false);
  const [searchQuery,       setSearchQuery]        = useState("");
  const [globalSearch,      setGlobalSearch]       = useState("");
  const [filterStatus,      setFilterStatus]       = useState("all");
  const [filterSkin,        setFilterSkin]         = useState("all");
  const [receiptFilter,     setReceiptFilter]      = useState("all");
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  // === FORM STATES ===
  const [newAppt,    setNewAppt]    = useState({clientId:"",name:"",service:"",duration:60,date:formatDate(new Date()),hour:9,price:0});
  const [newClient,  setNewClient]  = useState(emptyClient);
  const [newLead,    setNewLead]    = useState(emptyLead);
  const [apptNote,   setApptNote]   = useState("");
  const [editSettings,   setEditSettings]   = useState(null);
  const [newService,     setNewService]     = useState({name:"",price:0,duration:60,color:"#E8B5C4",active:true});
  const [showNewService, setShowNewService] = useState(false);
  const [cashierAppt,     setCashierAppt]     = useState(null);
  const [cashierClient,   setCashierClient]   = useState(null);
  const [cashierSearch,   setCashierSearch]   = useState("");
  const [cashierItems,    setCashierItems]    = useState([]);
  const [cashierDiscount, setCashierDiscount] = useState(0);
  const [paymentMethod,   setPaymentMethod]   = useState("מזומן");
  const [cashierNote,     setCashierNote]     = useState("");
  const [newPackage,  setNewPackage]  = useState({client_id:"",client_name:"",service:"",total_sessions:5,price:0});
  const [newWaitlist, setNewWaitlist] = useState({client_id:"",client_name:"",phone:"",service:"",preferred_date:"",notes:""});

  // === WHATSAPP CENTER STATE ===
  const [waSentToday, setWaSentToday] = useState({});
  const [waBroadcastMsg, setWaBroadcastMsg] = useState("");
  const [waBroadcastAudience, setWaBroadcastAudience] = useState("all");
  const [waFreeClient, setWaFreeClient] = useState(null);
  const [waFreeSearch, setWaFreeSearch] = useState("");
  const [waFreeMsg, setWaFreeMsg] = useState("");

  // === UX SYSTEMS: Toasts, Confirm, Busy ===
  const [toasts, setToasts] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [busy, setBusy] = useState({});

  const toast = useCallback((msg, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  const askConfirm = useCallback((opts) => {
    setConfirmDialog({
      title: opts.title || "אישור",
      message: opts.message || "האם את בטוחה?",
      confirmText: opts.confirmText || "אישור",
      cancelText: opts.cancelText || "ביטול",
      danger: opts.danger || false,
      onConfirm: opts.onConfirm,
    });
  }, []);

  const setBusyKey = useCallback((key, val) => {
    setBusy(prev => {
      if (val) return { ...prev, [key]: true };
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const isBusy = useCallback((key) => !!busy[key], [busy]);

  const handleDbError = useCallback((err, context = "") => {
    console.error(`[BeautyOS DB error] ${context}:`, err);
    toast(`שגיאה: ${err?.message || "פעולה נכשלה"}`, "error");
  }, [toast]);

  const handleLogout = useCallback(() => {
    askConfirm({
      title: "התנתקות",
      message: "האם להתנתק מהמערכת?",
      confirmText: "התנתקי",
      onConfirm: async () => {
        try {
          setBusyKey("logout", true);
          await supabase.auth.signOut();
          router.push("/login");
          router.refresh();
        } catch (err) {
          handleDbError(err, "logout");
          setBusyKey("logout", false);
        }
      },
    });
  }, [askConfirm, handleDbError, router, setBusyKey]);

  // === COMPUTED ===
  const weekDates = getWeekDates(weekStart);
  const now    = new Date();
  const today  = formatDate(now);
  const tomorrow = formatDate(new Date(now.getTime()+86400000));
  const thisMonth = now.getMonth();
  const thisYear  = now.getFullYear();
  const lastMonth = thisMonth===0?11:thisMonth-1;
  const lastMonthYear = thisMonth===0?thisYear-1:thisYear;
  const pc = settings.primary_color||"#C77B92";
  const origin = typeof window!=="undefined"?window.location.origin:"";

  const activeServices = services.filter(s=>s.active!==false);
  const workingHours = HOURS_ALL.slice(Math.max(settings.working_hours_start-7,0),Math.min(settings.working_hours_end-7,HOURS_ALL.length));
  const cashierTotal = Math.max(0,cashierItems.reduce((s,item)=>s+(item.price*item.qty),0)-Number(cashierDiscount||0));

  useEffect(()=>{ loadAll(); /* eslint-disable-next-line */ },[]);

  const loadAll = async () => {
    try {
      const [a,c,f,l,sv,st,r,pk,wl] = await Promise.all([
        supabase.from("appointments").select("*"),
        supabase.from("clients").select("*"),
        supabase.from("forms").select("*"),
        supabase.from("leads").select("*"),
        supabase.from("service_prices").select("*"),
        supabase.from("settings").select("*"),
        supabase.from("receipts").select("*"),
        supabase.from("packages").select("*"),
        supabase.from("waitlist").select("*"),
      ]);
      if(a.data)  setAppointments(a.data);
      if(c.data)  setClients(c.data);
      if(f.data)  setForms(f.data);
      if(l.data)  setLeads(l.data);
      if(sv.data&&sv.data.length>0) setServices(sv.data);
      if(st.data && st.data.length === 0) { router.replace("/onboarding"); return; }
      if(st.data&&st.data.length>0) setSettings(st.data[0]);
      if(r.data)  setReceipts(r.data);
      if(pk.data) setPackages(pk.data);
      if(wl.data) setWaitlist(wl.data);
    } catch (err) {
      handleDbError(err, "loadAll");
    } finally {
      setLoading(false);
    }
  };

  // === CALCULATIONS ===
  const thisMonthRevenue = useMemo(() => receipts.filter(r=>{if(!r.created_at)return false;const d=new Date(r.created_at);return d.getMonth()===thisMonth&&d.getFullYear()===thisYear;}).reduce((s,r)=>s+(Number(r.amount)||0),0), [receipts, thisMonth, thisYear]);
  const lastMonthRevenue = useMemo(() => receipts.filter(r=>{if(!r.created_at)return false;const d=new Date(r.created_at);return d.getMonth()===lastMonth&&d.getFullYear()===lastMonthYear;}).reduce((s,r)=>s+(Number(r.amount)||0),0), [receipts, lastMonth, lastMonthYear]);
  const todayAppts    = useMemo(() => appointments.filter(a=>a.date===today), [appointments, today]);
  const tomorrowAppts = useMemo(() => appointments.filter(a=>a.date===tomorrow), [appointments, tomorrow]);
  const weekAppts     = appointments.filter(a=>{if(!a.date)return false;const d=new Date(a.date);const ws=new Date(weekStart);const we=new Date(weekStart);we.setDate(we.getDate()+5);return d>=ws&&d<=we;});
  const thisMonthAppts = appointments.filter(a=>{if(!a.date)return false;const d=new Date(a.date);return d.getMonth()===thisMonth&&d.getFullYear()===thisYear;});

  const getLastAppt    = (cid) => appointments.filter(a=>String(a.client_id)===String(cid)).sort((a,b)=>(b.date||"").localeCompare(a.date||""))[0];
  const getDaysSince   = (cid) => {const l=getLastAppt(cid);if(!l?.date)return 999;return Math.floor((now-new Date(l.date))/(1000*60*60*24));};
  const getClientTotal = (cid) => receipts.filter(r=>String(r.client_id)===String(cid)).reduce((s,r)=>s+(Number(r.amount)||0),0);
  const getClientAppts = (cid) => appointments.filter(a=>String(a.client_id)===String(cid));
  const getClientForms = (cid) => forms.filter(f=>String(f.client_id)===String(cid));
  const getClientReceipts = (cid) => receipts.filter(r=>String(r.client_id)===String(cid));
  const getClientPackages = (cid) => packages.filter(p=>String(p.client_id)===String(cid)&&p.active);

  const activeClients = clients.filter(c=>getDaysSince(c.id)<=60);
  const coldClients   = clients.filter(c=>getDaysSince(c.id)>60);
  const topClients    = [...clients].sort((a,b)=>getClientTotal(b.id)-getClientTotal(a.id)).filter(c=>getClientTotal(c.id)>0).slice(0,5);

  const serviceStats = activeServices.map(s=>({name:s.name,color:s.color,count:appointments.filter(a=>a.service===s.name).length,revenue:receipts.filter(r=>r.service===s.name).reduce((sum,r)=>sum+(Number(r.amount)||0),0)})).sort((a,b)=>b.count-a.count);
  const avgTransaction = receipts.length>0?Math.round(receipts.reduce((s,r)=>s+(Number(r.amount)||0),0)/receipts.length):0;

  const monthlyData = Array.from({length:6},(_,i)=>{
    const d=new Date(now);d.setMonth(now.getMonth()-(5-i));
    const m=d.getMonth(),y=d.getFullYear();
    const appts=appointments.filter(a=>{if(!a.date)return false;const ad=new Date(a.date);return ad.getMonth()===m&&ad.getFullYear()===y;});
    const rev=receipts.filter(r=>{if(!r.created_at)return false;const rd=new Date(r.created_at);return rd.getMonth()===m&&rd.getFullYear()===y;}).reduce((s,r)=>s+(Number(r.amount)||0),0);
    return {month:MONTHS_HE[m].slice(0,3),count:appts.length,revenue:rev};
  });

  const upcomingBirthdays = clients.filter(c=>{
    if(!c.birthday)return false;
    try{const b=new Date(c.birthday);const bd=new Date(now.getFullYear(),b.getMonth(),b.getDate());if(bd<now)bd.setFullYear(now.getFullYear()+1);return Math.floor((bd-now)/(1000*60*60*24))<=30&&Math.floor((bd-now)/(1000*60*60*24))>=0;}catch{return false;}
  }).sort((a,b)=>{const days=(c)=>{const bx=new Date(c.birthday);const bd=new Date(now.getFullYear(),bx.getMonth(),bx.getDate());if(bd<now)bd.setFullYear(now.getFullYear()+1);return Math.floor((bd-now)/(1000*60*60*24));};return days(a)-days(b);});

  const tomorrowConfirmed  = tomorrowAppts.filter(a=>a.confirmation_status==="confirmed").length;
  const tomorrowCancelled  = tomorrowAppts.filter(a=>a.confirmation_status==="cancelled").length;
  const tomorrowPending    = tomorrowAppts.filter(a=>!a.confirmation_status||a.confirmation_status==="pending").length;

  const newLeadsCount      = leads.filter(l=>l.status==="new").length;
  const thisMonthLeads     = leads.filter(l=>{if(!l.created_at)return false;const d=new Date(l.created_at);return d.getMonth()===thisMonth&&d.getFullYear()===thisYear;});
  const convertedLeads     = leads.filter(l=>l.status==="closed");
  const conversionRate     = leads.length>0?Math.round((convertedLeads.length/leads.length)*100):0;
  const leadsWithReminders = leads.filter(l=>l.reminder_date&&l.reminder_date<=tomorrow&&l.status!=="closed"&&l.status!=="lost");

  const campaignStats = LEAD_SOURCES.map(source=>{
    const sourceLeads=leads.filter(l=>l.source===source);
    const converted=sourceLeads.filter(l=>l.status==="closed");
    const revenue=converted.reduce((sum,l)=>{if(!l.client_id)return sum;return sum+receipts.filter(r=>String(r.client_id)===String(l.client_id)).reduce((s,r)=>s+(Number(r.amount)||0),0);},0);
    return {source,icon:SOURCE_ICONS[source],total:sourceLeads.length,converted:converted.length,revenue,rate:sourceLeads.length>0?Math.round((converted.length/sourceLeads.length)*100):0};
  }).filter(s=>s.total>0).sort((a,b)=>b.revenue-a.revenue);

  const paymentBreakdown = PAYMENT_METHODS.map(m=>({...m,total:receipts.filter(r=>r.payment_method===m.key).reduce((s,r)=>s+(Number(r.amount)||0),0),count:receipts.filter(r=>r.payment_method===m.key).length})).filter(m=>m.count>0);
  const filteredReceipts = receiptFilter==="all"?receipts:receipts.filter(r=>r.payment_method===receiptFilter);

  const filteredLeads = leads.filter(l=>{
    const matchSearch=!leadSearch||l.name?.includes(leadSearch)||l.phone?.includes(leadSearch);
    const matchFilter=leadFilter==="all"||l.status===leadFilter;
    const matchSource=leadSourceFilter==="all"||l.source===leadSourceFilter;
    return matchSearch&&matchFilter&&matchSource;
  }).sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||""));

  const filteredClients = clients.filter(c=>{
    const matchSearch=!searchQuery||c.name?.includes(searchQuery)||c.phone?.includes(searchQuery);
    const matchStatus=filterStatus==="all"||c.status===filterStatus||(filterStatus==="cold"&&getDaysSince(c.id)>60)||(filterStatus==="active"&&getDaysSince(c.id)<=60);
    const matchSkin=filterSkin==="all"||c.skinType===filterSkin;
    return matchSearch&&matchStatus&&matchSkin;
  });

  const globalResults = globalSearch.length<2?[]:[
    ...clients.filter(c=>c.name?.includes(globalSearch)||c.phone?.includes(globalSearch)).map(c=>({type:"client",label:c.name,sub:c.phone||"",obj:c})),
    ...leads.filter(l=>l.name?.includes(globalSearch)||l.phone?.includes(globalSearch)).map(l=>({type:"lead",label:l.name,sub:l.source,obj:l})),
    ...appointments.filter(a=>a.name?.includes(globalSearch)).map(a=>({type:"appt",label:a.name,sub:a.service+" · "+a.date,obj:a})),
  ].slice(0,8);

  const getAppt = (date,hour) => appointments.find(a=>a.date===formatDate(date)&&Number(a.hour)===Number(hour));

  const getApptColor = (appt) => {
    if(appt.confirmation_status==="confirmed") return "#4CAF50";
    if(appt.confirmation_status==="cancelled") return "#F44336";
    return appt.color||"#E8B5C4";
  };

  // ============================================================
  // HANDLERS
  // ============================================================

  const handleSlotClick = (date,hour) => {
    if(getAppt(date,hour))return;
    const svc=activeServices[0];
    setNewAppt({clientId:"",name:"",service:svc?.name||"",duration:svc?.duration||60,date:formatDate(date),hour,price:svc?.price||0});
    setApptNote("");setShowModal(true);
  };

  const handleClientSelect = (clientId) => {
    const c=clients.find(c=>String(c.id)===String(clientId));
    setNewAppt(prev=>({...prev,clientId,name:c?c.name:""}));
  };

  const handleServiceSelect = (svcName) => {
    const svc=activeServices.find(s=>s.name===svcName);
    setNewAppt(prev=>({...prev,service:svcName,duration:svc?.duration||60,price:svc?.price||0}));
  };

  const handleSave = async () => {
    if(!newAppt.name.trim()){toast("נא להזין שם לקוחה","error");return;}
    if(isBusy("saveAppt")) return;
    setBusyKey("saveAppt", true);
    try {
      let clientId=newAppt.clientId;
      if(!clientId){
        const {data:nc,error:ce}=await supabase.from("clients").insert([{name:newAppt.name,phone:"",skinType:"",notes:"",status:"active"}]).select();
        if(ce){handleDbError(ce, "create client"); return;}
        if(nc?.[0]){clientId=nc[0].id;setClients(prev=>[...prev,nc[0]]);}
      }
      const svcColor=activeServices.find(s=>s.name===newAppt.service)?.color||"#E8B5C4";
      const appt={date:newAppt.date,hour:Number(newAppt.hour),name:newAppt.name,service:newAppt.service,duration:Number(newAppt.duration),color:svcColor,client_id:clientId,note:apptNote,price:Number(newAppt.price)||0,confirmation_status:"pending",confirmation_sent:false};
      const {data,error}=await supabase.from("appointments").insert([appt]).select();
      if(error){handleDbError(error, "create appointment"); return;}
      if(data)setAppointments(prev=>[...prev,data[0]]);
      setShowModal(false);setApptNote("");
      toast("התור נשמר בהצלחה");
    } finally {
      setBusyKey("saveAppt", false);
    }
  };

  const handleDelete = (appt) => {
    askConfirm({
      title: "מחיקת תור",
      message: `למחוק את התור של ${appt.name} (${appt.service}, ${appt.date} ${appt.hour}:00)?`,
      confirmText: "מחיקה",
      danger: true,
      onConfirm: async () => {
        const {error} = await supabase.from("appointments").delete().eq("id",appt.id);
        if (error) { handleDbError(error, "delete appointment"); return; }
        setAppointments(prev=>prev.filter(a=>a.id!==appt.id));
        setHoveredAppt(null);
        toast("התור נמחק");
      },
    });
  };

  const handleSendConfirmation = async (appt) => {
    const client=clients.find(c=>String(c.id)===String(appt.client_id));
    if(!client?.phone){toast("אין מספר טלפון ללקוחה","error");return;}
    const link=waConfirmLink(client.phone,appt.name,appt.service,appt.date,appt.hour,appt.id,origin);
    window.open(link,"_blank");
    const {data, error}=await supabase.from("appointments").update({confirmation_sent:true}).eq("id",appt.id).select();
    if (error) { handleDbError(error, "mark confirmation_sent"); return; }
    if(data)setAppointments(prev=>prev.map(a=>a.id===appt.id?data[0]:a));
  };

  const handleSendAllConfirmations = async () => {
    const pending=tomorrowAppts.filter(a=>!a.confirmation_sent);
    if(pending.length===0){toast("כבר נשלחו תזכורות לכל התורים מחר", "info");return;}
    askConfirm({
      title: "שליחת תזכורות",
      message: `לשלוח תזכורת ל-${pending.length} לקוחות?`,
      confirmText: "שליחה",
      onConfirm: async () => {
        for(const appt of pending){
          await handleSendConfirmation(appt);
          await new Promise(r=>setTimeout(r,500));
        }
        toast(`נשלחו תזכורות ל-${pending.length} לקוחות`);
      },
    });
  };

  const handleSaveClient = async () => {
    if(!newClient.name.trim()){toast("נא להזין שם","error");return;}
    if(isBusy("saveClient")) return;
    setBusyKey("saveClient", true);
    try {
      if(editingClient){
        const {data,error}=await supabase.from("clients").update(newClient).eq("id",editingClient.id).select();
        if(error){handleDbError(error, "update client"); return;}
        if(data){setClients(prev=>prev.map(c=>c.id===editingClient.id?data[0]:c));setSelectedClient(data[0]);}
        toast("הלקוחה עודכנה");
      }else{
        const {data,error}=await supabase.from("clients").insert([newClient]).select();
        if(error){handleDbError(error, "create client"); return;}
        if(data)setClients(prev=>[...prev,data[0]]);
        toast("הלקוחה נוספה");
      }
      setShowClientModal(false);setEditingClient(null);setNewClient(emptyClient);
    } finally {
      setBusyKey("saveClient", false);
    }
  };

  const handleSaveLead = async () => {
    if(!newLead.name.trim()){toast("נא להזין שם","error");return;}
    if(isBusy("saveLead")) return;
    setBusyKey("saveLead", true);
    try {
      if(editingLead){
        const {data,error}=await supabase.from("leads").update(newLead).eq("id",editingLead.id).select();
        if(error){handleDbError(error, "update lead"); return;}
        if(data){setLeads(prev=>prev.map(l=>l.id===editingLead.id?data[0]:l));setSelectedLead(data[0]);}
        toast("הליד עודכן");
      }else{
        const {data,error}=await supabase.from("leads").insert([newLead]).select();
        if(error){handleDbError(error, "create lead"); return;}
        if(data)setLeads(prev=>[...prev,data[0]]);
        toast("הליד נוסף");
      }
      setShowLeadModal(false);setEditingLead(null);setNewLead(emptyLead);
    } finally {
      setBusyKey("saveLead", false);
    }
  };

  const handleUpdateLeadStatus = async (lead,status) => {
    const {data,error}=await supabase.from("leads").update({status}).eq("id",lead.id).select();
    if(error){handleDbError(error, "update lead status"); return;}
    if(data){setLeads(prev=>prev.map(l=>l.id===lead.id?data[0]:l));setSelectedLead(data[0]);}
  };

  const handleConvertLead = (lead) => {
    askConfirm({
      title: "המרת ליד ללקוחה",
      message: `להמיר את ${lead.name} ללקוחה רשומה?`,
      confirmText: "המרה",
      onConfirm: async () => {
        const {data:cd,error:ce}=await supabase.from("clients").insert([{name:lead.name,phone:lead.phone||"",skinType:"",notes:`הומר מליד — מקור: ${lead.source}`,status:"active"}]).select();
        if(ce){handleDbError(ce, "convert lead -> create client"); return;}
        const {data:ld, error:le}=await supabase.from("leads").update({status:"closed",converted_at:new Date().toISOString(),client_id:cd[0].id}).eq("id",lead.id).select();
        if(le){handleDbError(le, "convert lead -> update lead"); return;}
        setClients(prev=>[...prev,cd[0]]);
        if(ld)setLeads(prev=>prev.map(l=>l.id===lead.id?ld[0]:l));
        setSelectedLead(null);
        toast(`${lead.name} הומרה ללקוחה`);
      },
    });
  };

  const handleSetReminder = async (lead,date) => {
    const {data,error}=await supabase.from("leads").update({reminder_date:date}).eq("id",lead.id).select();
    if(error){handleDbError(error, "set reminder"); return;}
    if(data){setLeads(prev=>prev.map(l=>l.id===lead.id?data[0]:l));setSelectedLead(data[0]);}
  };

  const handleUploadImage = async (e,client) => {
    const file=e.target.files[0];if(!file)return;
    setUploading(true);
    try {
      const fileName=`${client.id}/${Date.now()}_${file.name}`;
      const {error:ue}=await supabase.storage.from("client-images").upload(fileName,file);
      if(ue){handleDbError(ue, "upload image"); return;}
      const {data:urlData}=supabase.storage.from("client-images").getPublicUrl(fileName);
      const newImages=[...(client.images||[]),urlData.publicUrl];
      const {data,error}=await supabase.from("clients").update({images:newImages}).eq("id",client.id).select();
      if(error){handleDbError(error, "save image url"); return;}
      if(data){setClients(prev=>prev.map(c=>c.id===client.id?data[0]:c));setSelectedClient(data[0]);}
      toast("התמונה הועלתה");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteImage = (client,imageUrl) => {
    askConfirm({
      title: "מחיקת תמונה",
      message: "למחוק את התמונה?",
      confirmText: "מחיקה",
      danger: true,
      onConfirm: async () => {
        const newImages=(client.images||[]).filter(img=>img!==imageUrl);
        const {data,error}=await supabase.from("clients").update({images:newImages}).eq("id",client.id).select();
        if(error){handleDbError(error, "delete image"); return;}
        if(data){setClients(prev=>prev.map(c=>c.id===client.id?data[0]:c));setSelectedClient(data[0]);}
        toast("התמונה נמחקה");
      },
    });
  };

  const handleSendForm = async (client,formType) => {
    const {data,error}=await supabase.from("forms").insert([{client_id:client.id,client_name:client.name,form_type:formType,status:"pending"}]).select();
    if(error){handleDbError(error, "create form"); return;}
    setForms(prev=>[...prev,data[0]]);
    const link=`${origin}/form?id=${data[0].id}`;
    try {
      await navigator.clipboard.writeText(link);
      toast("הקישור הועתק - מוכן לשליחה");
    } catch {
      toast(`הקישור: ${link}`, "info");
    }
  };

  const handleSaveSettings = async () => {
    if(isBusy("saveSettings")) return;
    setBusyKey("saveSettings", true);
    try {
      if(settings.id){
        const {data,error}=await supabase.from("settings").update(editSettings).eq("id",settings.id).select();
        if(error){handleDbError(error, "update settings"); return;}
        if(data)setSettings(data[0]);
      }else{
        const {data,error}=await supabase.from("settings").insert([editSettings]).select();
        if(error){handleDbError(error, "create settings"); return;}
        if(data)setSettings(data[0]);
      }
      setEditSettings(null);
      toast("ההגדרות נשמרו");
    } finally {
      setBusyKey("saveSettings", false);
    }
  };

  const handleSaveService = async (svc,idx) => {
    if(svc.id){
      const {data,error}=await supabase.from("service_prices").update(svc).eq("id",svc.id).select();
      if(error){handleDbError(error, "update service"); return;}
      if(data){setServices(prev=>prev.map((s,i)=>i===idx?data[0]:s)); toast("המחיר עודכן");}
    }
  };

  const handleAddService = async () => {
    if(!newService.name.trim()){toast("נא להזין שם שירות","error");return;}
    const {data,error}=await supabase.from("service_prices").insert([newService]).select();
    if(error){handleDbError(error, "add service"); return;}
    if(data){setServices(prev=>[...prev,data[0]]);setNewService({name:"",price:0,duration:60,color:"#E8B5C4",active:true});setShowNewService(false); toast("השירות נוסף");}
  };

  const handleOpenCashier = (appt) => {
    setCashierAppt(appt||null);
    if(appt){
      const client=clients.find(c=>String(c.id)===String(appt.client_id));
      setCashierClient(client||null);setCashierSearch(client?.name||"");
      const svc=activeServices.find(s=>s.name===appt.service);
      setCashierItems([{id:Date.now(),name:appt.service,price:svc?.price||appt.price||0,qty:1,color:svc?.color||"#E8B5C4"}]);
    }else{setCashierClient(null);setCashierSearch("");setCashierItems([]);}
    setPaymentMethod("מזומן");setCashierDiscount(0);setCashierNote("");setShowCashier(true);
  };

  const handleSaveReceipt = async () => {
    if(!cashierItems.length){toast("נא להוסיף פריט אחד לפחות","error");return;}
    if(isBusy("saveReceipt")) return;
    setBusyKey("saveReceipt", true);
    try {
      const serviceNames=cashierItems.map(i=>i.name).join(", ");
      const receipt={
        client_id:cashierClient?.id||null,
        client_name:cashierClient?.name||"לקוחה",
        appointment_id:cashierAppt?.id||null,
        service:serviceNames,
        amount:cashierTotal,
        payment_method:paymentMethod,
        note:cashierNote,
        items:JSON.stringify(cashierItems),
        discount:Number(cashierDiscount||0),
      };
      const {data,error}=await supabase.from("receipts").insert([receipt]).select();
      if(error){handleDbError(error, "save receipt"); return;}
      setReceipts(prev=>[...prev,data[0]]);
      // Send receipt to client via WhatsApp (GreenAPI)
      if(cashierClient?.phone){
        fetch("/api/create-receipt",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            client_name:cashierClient.name,
            client_phone:cashierClient.phone,
            service:serviceNames,
            amount:cashierTotal,
            payment_method:paymentMethod,
          }),
        }).then(()=>toast("הקבלה נשלחה ללקוחה ב-WhatsApp"));
      }
      setShowCashier(false);setShowReceipt(data[0]);
      setCashierItems([]);setCashierClient(null);setCashierSearch("");setCashierDiscount(0);setCashierNote("");setCashierAppt(null);
      toast(`קבלה נוצרה — ₪${cashierTotal}`);
    } finally {
      setBusyKey("saveReceipt", false);
    }
  };

  // Credit card payment via Grow - opens secure payment page
  const handleCreditPayment = async () => {
    if(!cashierItems.length){toast("נא להוסיף פריט אחד לפחות","error");return;}
    if(isBusy("creditPayment")) return;
    setBusyKey("creditPayment", true);
    try {
      const serviceNames=cashierItems.map(i=>i.name).join(", ");
      const res=await fetch("/api/payment/create",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          sum:cashierTotal,
          description:serviceNames,
          fullName:cashierClient?.name||"לקוחה",
          phone:cashierClient?.phone||"",
          clientId:cashierClient?.id||"",
          appointmentId:cashierAppt?.id||"",
        }),
      });
      const data=await res.json();
      if(data.ok&&data.url){
        // Open Grow secure payment page in a new tab
        window.open(data.url,"_blank");
        toast("💳 דף התשלום נפתח - הקבלה תיווצר אוטומטית לאחר התשלום");
        setShowCashier(false);
      }else{
        toast(`שגיאה בפתיחת התשלום: ${data.error||"לא ידוע"}`,"error");
      }
    } catch(err) {
      handleDbError(err,"credit payment");
    } finally {
      setBusyKey("creditPayment", false);
    }
  };

  const handleSavePackage = async () => {
    if(!newPackage.client_id||!newPackage.service){toast("נא לבחור לקוחה ושירות","error");return;}
    const {data,error}=await supabase.from("packages").insert([newPackage]).select();
    if(error){handleDbError(error, "save package"); return;}
    if(data){setPackages(prev=>[...prev,data[0]]);setShowPackageModal(false);toast("החבילה נוספה");}
  };

  const handleUsePackageSession = async (pkg) => {
    const used=Number(pkg.used_sessions)+1;
    const active=used<Number(pkg.total_sessions);
    const {data,error}=await supabase.from("packages").update({used_sessions:used,active}).eq("id",pkg.id).select();
    if(error){handleDbError(error, "use package session"); return;}
    if(data){setPackages(prev=>prev.map(p=>p.id===pkg.id?data[0]:p)); toast(active?`טיפול ${used}/${pkg.total_sessions}`:"החבילה הסתיימה");}
  };

  const handleSaveWaitlist = async () => {
    if(!newWaitlist.client_name||!newWaitlist.service){toast("נא למלא פרטים","error");return;}
    const {data,error}=await supabase.from("waitlist").insert([newWaitlist]).select();
    if(error){handleDbError(error, "save waitlist"); return;}
    if(data){setWaitlist(prev=>[...prev,data[0]]);setShowWaitlistModal(false);toast("נוספה לרשימת המתנה");}
  };

  const handleExportCSV = () => {
    const rows=[["שם","טלפון","שירות","תאריך","סכום","אמצעי תשלום"]];
    receipts.forEach(r=>{const client=clients.find(c=>String(c.id)===String(r.client_id));rows.push([r.client_name,client?.phone||"",r.service,r.created_at?.slice(0,10)||"",r.amount,r.payment_method]);});
    const csv=rows.map(r=>r.join(",")).join("\n");
    const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=`beautyos_${today}.csv`;a.click();URL.revokeObjectURL(url);
    toast("הקובץ ירד");
  };

  // === WHATSAPP CENTER HANDLERS ===
  const waSendOne = (clientId, phone, message) => {
    if(!phone){toast("אין מספר טלפון ללקוחה","error");return;}
    const link=waMsg(phone,message);
    if(link)window.open(link,"_blank");
    if(clientId)setWaSentToday(prev=>({...prev,[clientId]:true}));
  };

  const waSendGroup = (items) => {
    const targets=items.filter(it=>it.phone);
    if(targets.length===0){toast("אין נמענים עם טלפון","error");return;}
    askConfirm({
      title:"שליחה קבוצתית",
      message:`ייפתחו ${targets.length} חלונות וואטסאפ — אחד לכל לקוחה. לאשר?`,
      confirmText:"שלחי",
      onConfirm:async()=>{
        for(const t of targets){
          waSendOne(t.clientId,t.phone,t.message);
          await new Promise(r=>setTimeout(r,700));
        }
        toast(`נפתחו ${targets.length} הודעות`);
      },
    });
  };

  const openEditClient = (client) => {
    setEditingClient(client);
    setNewClient({name:client.name||"",phone:client.phone||"",birthday:client.birthday||"",skinType:client.skinType||"",allergies:client.allergies||"",medical:client.medical||"",notes:client.notes||"",status:client.status||"active"});
    setShowClientModal(true);
  };

  const openEditLead = (lead) => {
    setEditingLead(lead);
    setNewLead({name:lead.name||"",phone:lead.phone||"",source:lead.source||"פייסבוק",service_interest:lead.service_interest||"",status:lead.status||"new",notes:lead.notes||"",reminder_date:lead.reminder_date||""});
    setShowLeadModal(true);
  };

  // Fetch live Facebook ad campaigns for the current tenant
  const loadFbCampaigns = async (preset) => {
    setFbLoading(true); setFbError(null);
    try {
      const dp = preset || fbDatePreset;
      const res = await fetch(`/api/marketing/campaigns?datePreset=${dp}`);
      const data = await res.json();
      if (data.ok) {
        setFbCampaigns(data.campaigns || []);
        setFbTotals(data.totals || null);
      } else {
        setFbCampaigns([]);
        setFbError(data.error || "לא ניתן לטעון קמפיינים");
      }
    } catch (err) {
      setFbError(err.message);
      setFbCampaigns([]);
    } finally {
      setFbLoading(false);
    }
  };

  if(loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontSize:18,fontFamily:"'Varela Round',sans-serif",background:"linear-gradient(180deg,#FCEEF3 0%,#FFFFFF 340px)",color:"#C77B92"}}>✦ טוען את {settings.business_name}...</div>;

  return (
 <div dir="rtl" style={{fontFamily:"'Varela Round','Heebo',sans-serif",background:"linear-gradient(180deg,#FCEEF3 0%,#FFFFFF 420px)",minHeight:"100vh",display:"flex",flexDirection:"column",color:"#2A2A2A"}}>
 <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Varela+Round&family=Heebo:wght@300;400;500;600;700&display=swap');
        .serif{font-family:'Playfair Display',serif}
        .slot:hover{background:#FCEEF3!important;cursor:pointer}
        .appt-card{transition:transform 0.15s}.appt-card:hover{transform:scale(1.02)}
        .client-row:hover{background:#FCEEF3!important;cursor:pointer}
        .stat-card{transition:all 0.25s}.stat-card:hover{transform:translateY(-3px);box-shadow:0 12px 28px rgba(199,123,146,0.13)}
        .lead-row:hover{background:#FCEEF3!important;cursor:pointer}
        .wa-btn{background:#25D366;color:#fff;border:none;border-radius:20px;padding:6px 11px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:4px;text-decoration:none}
        .wa-btn:hover{background:#1ea355}
        .call-btn{background:#C77B92;color:#fff;border:none;border-radius:20px;padding:6px 11px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:4px;text-decoration:none}
        .icon-btn{background:rgba(199,123,146,0.10);border:none;border-radius:50%;width:30px;height:30px;color:#C77B92;font-size:13px;cursor:pointer;font-family:inherit;transition:background 0.15s;display:inline-flex;align-items:center;justify-content:center}
        .icon-btn:hover{background:rgba(199,123,146,0.20)}
        .icon-btn:disabled{opacity:0.5;cursor:default}
        .primary-btn{border:none;border-radius:24px;font-weight:600;cursor:pointer;font-family:inherit;transition:opacity 0.15s,transform 0.1s}
        .primary-btn:active:not(:disabled){transform:scale(0.97)}
        .primary-btn:disabled{opacity:0.5;cursor:default}
        @keyframes toast-in{from{transform:translateY(-12px);opacity:0}to{transform:translateY(0);opacity:1}}
        .toast{animation:toast-in 0.2s ease-out}
        .mobile-only{display:none}
        @media (max-width:680px){
          .desktop-only{display:none!important}
          .mobile-only{display:flex!important}
          .sidebar-aside{position:fixed!important;top:0;bottom:0;right:0;width:80%!important;max-width:280px;z-index:1500;transform:translateX(100%);transition:transform 0.25s}
          .sidebar-aside.open{transform:translateX(0)}
          .sidebar-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:1499}
          .header-search{max-width:none!important}
          .modal-card{width:94%!important;max-width:380px!important}
          .client-drawer,.lead-drawer{width:100%!important}
        }
        @media print{body *{visibility:hidden}.receipt-print,.receipt-print *{visibility:visible}.receipt-print{position:fixed;top:0;left:0;width:100%;padding:40px}}
      `}</style>

      {/* TOASTS */}
      {toasts.length>0&&(
 <div style={{position:"fixed",top:14,left:"50%",transform:"translateX(-50%)",zIndex:5000,display:"flex",flexDirection:"column",gap:7,alignItems:"center",pointerEvents:"none"}}>
          {toasts.map(t=>{
            const colors={success:{bg:"#2A2A2A",fg:"#fff"},error:{bg:"#C62828",fg:"#fff"},info:{bg:"#C77B92",fg:"#fff"}};
            const c=colors[t.type]||colors.success;
            return(
 <div key={t.id} className="toast" style={{background:c.bg,color:c.fg,padding:"9px 18px",borderRadius:24,fontSize:12,fontWeight:600,boxShadow:"0 6px 20px rgba(0,0,0,0.18)",maxWidth:"90vw",direction:"rtl",pointerEvents:"auto"}}>
                {t.msg}
 </div>
            );
          })}
 </div>
      )}

      {/* CONFIRM DIALOG */}
      {confirmDialog&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:4000,padding:14}} onClick={()=>setConfirmDialog(null)}>
 <div onClick={e=>e.stopPropagation()} className="modal-card" style={{background:"#fff",borderRadius:20,padding:24,width:340,maxWidth:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.25)"}}>
 <h3 className="serif" style={{fontSize:19,fontWeight:600,color:"#2A2A2A",marginBottom:8}}>{confirmDialog.title}</h3>
 <p style={{fontSize:12.5,color:"#6B6B6B",lineHeight:1.5,marginBottom:18}}>{confirmDialog.message}</p>
 <div style={{display:"flex",gap:7}}>
 <button onClick={()=>setConfirmDialog(null)} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1.5px solid #EFE7EB",borderRadius:24,background:"#fff",fontSize:12,color:"#8A8088"}}>{confirmDialog.cancelText}</button>
 <button onClick={()=>{const fn=confirmDialog.onConfirm;setConfirmDialog(null);if(fn)fn();}} className="primary-btn" style={{flex:2,padding:"11px 0",background:confirmDialog.danger?"#C62828":"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",fontSize:12}}>{confirmDialog.confirmText}</button>
 </div>
 </div>
 </div>
      )}

      {/* OMBRE PROMO BAR */}
 <div style={{background:"linear-gradient(90deg,#F6D9E2 0%,#FBEEF2 25%,#FFFFFF 50%,#FBEEF2 75%,#F6D9E2 100%)",textAlign:"center",padding:"8px",fontSize:11.5,letterSpacing:"1px",color:"#C77B92",fontWeight:600,flexShrink:0}}>
        ✦ &nbsp; {settings.business_name} &nbsp; ✦
 </div>

      {/* HEADER */}
 <header style={{background:"rgba(255,255,255,0.82)",backdropFilter:"blur(8px)",borderBottom:"1px solid #EFE7EB",padding:"0 16px",display:"flex",alignItems:"center",justifyContent:"space-between",height:60,flexShrink:0,gap:8,flexWrap:"nowrap"}}>
 <div style={{display:"flex",alignItems:"center",gap:9,flexShrink:0}}>
 <button className="mobile-only icon-btn" onClick={()=>setShowMobileSidebar(true)} style={{display:"none"}}>☰</button>
 <span className="serif" style={{fontWeight:600,fontSize:17,letterSpacing:"1px"}}>{settings.business_name}</span>
 <span className="desktop-only serif" style={{fontStyle:"italic",fontSize:12,color:"#C77B92",letterSpacing:"2px",borderRight:"1px solid #EFE7EB",paddingRight:9,marginRight:2}}>BeautyOS</span>
          {newLeadsCount>0&&<span onClick={()=>setActiveTab("leads")} style={{background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:20,cursor:"pointer"}}>{newLeadsCount}</span>}
          {tomorrowCancelled>0&&<span className="desktop-only" style={{background:"#F44336",color:"#fff",fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:20}}>{tomorrowCancelled}</span>}
 </div>
 <div className="header-search" style={{position:"relative",flex:1,maxWidth:280,minWidth:80}}>
 <input value={globalSearch} onChange={e=>setGlobalSearch(e.target.value)} placeholder="חיפוש..."
            style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:24,padding:"7px 14px",fontSize:11.5,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3",color:"#2A2A2A"}}/>
          {globalResults.length>0&&(
 <div style={{position:"absolute",top:"100%",right:0,left:0,background:"#fff",borderRadius:14,boxShadow:"0 8px 24px rgba(199,123,146,0.15)",zIndex:999,overflow:"hidden",marginTop:6}}>
              {globalResults.map((r,i)=>(
 <div key={i} onClick={()=>{setGlobalSearch("");if(r.type==="client"){setSelectedClient(r.obj);setClientTab("info");}else if(r.type==="lead"){setSelectedLead(r.obj);setActiveTab("leads");}}}
                  style={{padding:"9px 14px",borderBottom:"1px solid #FCEEF3",cursor:"pointer",display:"flex",gap:8,alignItems:"center"}} className="client-row">
 <span style={{fontSize:12}}>{r.type==="client"?"":r.type==="lead"?"":""}</span>
 <div><p style={{fontSize:11.5,fontWeight:600,color:"#2A2A2A"}}>{r.label}</p><p style={{fontSize:9,color:"#8A8088"}}>{r.sub}</p></div>
 </div>
              ))}
 </div>
          )}
 </div>
 <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          {upcomingBirthdays[0]&&<span className="desktop-only" style={{fontSize:10,color:"#C77B92"}}>{upcomingBirthdays[0].name}</span>}
 <span className="desktop-only" style={{fontSize:11.5,color:"#8A8088"}}>שלום, {settings.therapist_name} </span>
 <button onClick={()=>{setEditSettings({...settings});setShowSettings(true);}} className="icon-btn" title="הגדרות">⚙</button>
 <button onClick={handleExportCSV} className="icon-btn" title="ייצוא CSV">↓</button>
 <button onClick={handleLogout} disabled={isBusy("logout")} className="icon-btn" title="התנתקות">⏻</button>
 </div>
 </header>

      {/* TABS */}
 <div style={{background:"rgba(255,255,255,0.82)",backdropFilter:"blur(8px)",borderBottom:"1px solid #EFE7EB",display:"flex",justifyContent:"center",padding:"0 6px",overflowX:"auto",flexShrink:0,WebkitOverflowScrolling:"touch",gap:6}}>
        {[
          {id:"dashboard",label:"סקירה"},
          {id:"calendar", label:"יומן"},
          {id:"clients",  label:"מטופלות"},
          {id:"leads",    label:`פניות${newLeadsCount>0?` (${newLeadsCount})`:""}`},
          {id:"cashier",  label:"תשלומים"},
          {id:"whatsapp", label:"הודעות"},
          {id:"campaigns",label:"שיווק"},
          {id:"packages", label:"מנויים"},
        ].map(tab=>(
 <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{background:"none",border:"none",padding:"14px 14px",fontSize:13,fontWeight:activeTab===tab.id?600:400,color:activeTab===tab.id?"#2A2A2A":"#8A8088",borderBottom:activeTab===tab.id?`2.5px solid #C77B92`:"2.5px solid transparent",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",letterSpacing:"0.3px"}}>{tab.label}</button>
        ))}
 </div>

 <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {showMobileSidebar&&<div className="sidebar-backdrop mobile-only" onClick={()=>setShowMobileSidebar(false)}/>}
 <aside className={`sidebar-aside${showMobileSidebar?" open":""}`} style={{width:195,background:"rgba(255,255,255,0.6)",borderLeft:"1px solid #EFE7EB",padding:"14px 11px",display:"flex",flexDirection:"column",gap:11,flexShrink:0,overflowY:"auto"}}>
 <div>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
 <p className="serif" style={{fontSize:14,fontWeight:600,color:"#2A2A2A"}}>היום ({todayAppts.length})</p>
 <button className="mobile-only" onClick={()=>setShowMobileSidebar(false)} style={{display:"none",background:"none",border:"none",fontSize:14,cursor:"pointer",color:"#8A8088"}}>✕</button>
 </div>
            {todayAppts.length===0?<p style={{fontSize:10.5,color:"#C9B8C2"}}>אין תורים</p>
              :todayAppts.sort((a,b)=>a.hour-b.hour).map(a=>(
 <div key={a.id} style={{background:"linear-gradient(90deg,#FCEEF3,#FFFFFF)",borderRight:`3px solid ${getApptColor(a)}`,borderRadius:10,padding:"7px 9px",marginBottom:5}}>
 <p style={{fontSize:11,fontWeight:600,color:"#2A2A2A"}}>{a.name}</p>
 <p style={{fontSize:9,color:"#8A8088"}}>{workingHours[Number(a.hour)-settings.working_hours_start]||a.hour+":00"} · {a.service}</p>
                  {a.confirmation_status==="confirmed"&&<span style={{fontSize:8,color:"#4CAF50",fontWeight:700}}>אישרה</span>}
                  {a.confirmation_status==="cancelled"&&<span style={{fontSize:8,color:"#F44336",fontWeight:700}}>ביטלה</span>}
 <button onClick={()=>handleOpenCashier(a)} style={{background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",border:"none",borderRadius:14,padding:"3px 9px",fontSize:8,cursor:"pointer",fontFamily:"inherit",marginTop:3,display:"block"}}>גבי</button>
 </div>
              ))}
 </div>

          {tomorrowAppts.length>0&&(
 <div>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
 <p className="serif" style={{fontSize:14,fontWeight:600,color:"#2A2A2A"}}>מחר ({tomorrowAppts.length})</p>
 <button onClick={handleSendAllConfirmations} style={{background:"rgba(199,123,146,0.12)",color:"#C77B92",border:"none",borderRadius:14,padding:"3px 8px",fontSize:8,cursor:"pointer",fontFamily:"inherit"}}>שליחה מרוכזת</button>
 </div>
 <div style={{background:"#FCEEF3",borderRadius:10,padding:"6px 9px",marginBottom:6,fontSize:9}}>
 <span style={{color:"#4CAF50"}}>{tomorrowConfirmed} </span>
 <span style={{color:"#F44336"}}>{tomorrowCancelled} </span>
 <span style={{color:"#8A8088"}}>⏳ {tomorrowPending}</span>
 </div>
              {tomorrowAppts.map(a=>{
                const client=clients.find(c=>String(c.id)===String(a.client_id));
                const confColor=a.confirmation_status==="confirmed"?"#4CAF50":a.confirmation_status==="cancelled"?"#F44336":"#8A8088";
                return(
 <div key={a.id} style={{background:"linear-gradient(90deg,#FCEEF3,#FFFFFF)",borderRight:`3px solid ${getApptColor(a)}`,borderRadius:10,padding:"6px 8px",marginBottom:5}}>
 <p style={{fontSize:11,fontWeight:600,color:"#2A2A2A"}}>{a.name}</p>
 <p style={{fontSize:9,color:"#8A8088"}}>{a.service}</p>
                    {client?.phone&&!a.confirmation_sent&&(
 <button onClick={()=>handleSendConfirmation(a)} style={{background:"#25D366",color:"#fff",border:"none",borderRadius:14,padding:"3px 8px",fontSize:8,cursor:"pointer",fontFamily:"inherit",marginTop:3}}>שלחי תזכורת</button>
                    )}
                    {a.confirmation_sent&&<span style={{fontSize:8,color:confColor,fontWeight:700}}>{a.confirmation_status==="confirmed"?"אישרה":a.confirmation_status==="cancelled"?"ביטלה":"נשלח"}</span>}
 </div>
                );
              })}
 </div>
          )}

          {leadsWithReminders.length>0&&(
 <div>
 <p className="serif" style={{fontSize:13,fontWeight:600,color:"#C77B92",marginBottom:5}}>תזכורות פניות</p>
              {leadsWithReminders.map(l=>(
 <div key={l.id} onClick={()=>{setSelectedLead(l);setActiveTab("leads");setShowMobileSidebar(false);}} style={{background:"#FFF3E0",borderRadius:10,padding:"5px 9px",marginBottom:3,cursor:"pointer"}}>
 <p style={{fontSize:10.5,fontWeight:600,color:"#2A2A2A"}}>{l.name}</p>
 <p style={{fontSize:8.5,color:"#8A8088"}}>{l.reminder_date}</p>
 </div>
              ))}
 </div>
          )}

          {coldClients.slice(0,3).length>0&&(
 <div>
 <p className="serif" style={{fontSize:13,fontWeight:600,color:"#8A8088",marginBottom:4}}>להתחדשות</p>
              {coldClients.slice(0,3).map(c=>(
 <div key={c.id} onClick={()=>{setSelectedClient(c);setClientTab("info");setShowMobileSidebar(false);}} style={{fontSize:9.5,color:"#C77B92",marginBottom:3,cursor:"pointer"}}>{c.name} ({getDaysSince(c.id)}י)</div>
              ))}
 </div>
          )}

 <button onClick={()=>{const svc=activeServices[0];setNewAppt({clientId:"",name:"",service:svc?.name||"",duration:svc?.duration||60,date:formatDate(new Date()),hour:settings.working_hours_start,price:svc?.price||0});setApptNote("");setShowModal(true);setShowMobileSidebar(false);}}
            style={{background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",border:"none",borderRadius:24,padding:"11px 10px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginTop:"auto",boxShadow:"0 6px 16px rgba(199,123,146,0.25)"}}>
            ✦ קביעת תור
 </button>
 </aside>

 <main style={{flex:1,overflow:"auto",padding:"22px 18px"}}>
          {/* DASHBOARD */}
          {activeTab==="dashboard"&&(<>
            {(()=>{
              const hour=now.getHours();
              const greeting=hour<12?"בוקר טוב":hour<17?"צהריים טובים":hour<21?"ערב טוב":"לילה טוב";
              const bdToday=upcomingBirthdays.filter(c=>{const b=new Date(c.birthday);const bd=new Date(now.getFullYear(),b.getMonth(),b.getDate());if(bd<now)bd.setFullYear(now.getFullYear()+1);return Math.floor((bd-now)/(1000*60*60*24))===0;});
              const revTrend=lastMonthRevenue>0?Math.round(((thisMonthRevenue-lastMonthRevenue)/lastMonthRevenue)*100):null;
              const stats=[
                {label:"הכנסות החודש",value:`₪${thisMonthRevenue.toLocaleString()}`,
                  sub:revTrend!==null?(revTrend>=0?`↑ ${revTrend}% מהחודש שעבר`:`↓ ${Math.abs(revTrend)}% מהחודש שעבר`):"החודש הראשון שלך"},
                {label:"תורים השבוע",value:weekAppts.length,sub:`${todayAppts.length} מהם היום`},
                {label:"לקוחות פעילות",value:activeClients.length,sub:thisMonthLeads.length>0?`${thisMonthLeads.length} פניות חדשות החודש`:"אין פניות חדשות"},
                {label:"להתחדשות",value:coldClients.length,sub:coldClients.length>0?"שווה לשלוח הודעה":"כל הלקוחות פעילות "},
              ];
              const maxRev=Math.max(...monthlyData.map(m=>m.revenue),1);
              return(<>
                {/* HERO */}
 <div style={{textAlign:"center",marginBottom:40,maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <h1 className="serif" style={{fontSize:38,fontWeight:600,color:"#2A2A2A",marginBottom:11,letterSpacing:"0.5px"}}>{greeting}, <span style={{background:"linear-gradient(90deg,#C77B92,#D89AAE)",WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent",fontStyle:"italic"}}>{settings.therapist_name}</span></h1>
 <p style={{fontSize:13.5,color:"#8A8088",fontWeight:300,maxWidth:480,margin:"0 auto"}}>
                    {todayAppts.length>0?`יום יפה מחכה לך — ${todayAppts.length} תורים בלוח`:"אין תורים היום — זמן מצוין להתארגן"}{upcomingBirthdays.length>0?`, ${upcomingBirthdays.length} ימי הולדת לחגוג השבוע`:""}{coldClients.length>0?`, ו-${coldClients.length} לקוחות מחכות להתחדשות`:""}.
 </p>
 <div style={{width:80,height:2,background:"linear-gradient(90deg,transparent,#C77B92,transparent)",margin:"20px auto 0"}}/>
                  {bdToday.length>0&&(
 <div style={{marginTop:16,background:"linear-gradient(90deg,#FBEEF2,#F6D9E2)",borderRadius:14,padding:"9px 16px",fontSize:11.5,color:"#C77B92",display:"inline-block",fontWeight:500}}>
                      היום יום הולדת ל{bdToday.map(c=>c.name).join(", ")} — שווה לשלוח ברכה חמה
 </div>
                  )}
 </div>

                {/* STAT CARDS */}
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14,marginBottom:40,maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
                  {stats.map((s,i)=>(
 <div key={i} className="stat-card" style={{background:"linear-gradient(180deg,#FFFFFF 0%,#FDF4F7 100%)",borderRadius:18,padding:"24px 22px",border:"1px solid #EFE7EB",textAlign:"center"}}>
 <p style={{fontSize:11,color:"#8A8088",fontWeight:500,letterSpacing:"1.2px",marginBottom:12}}>{s.label}</p>
 <p className="serif" style={{fontSize:34,fontWeight:600,color:"#2A2A2A",lineHeight:1}}>{s.value}</p>
                      {s.sub&&<p style={{fontSize:10.5,color:"#C77B92",marginTop:9,fontWeight:500}}>{s.sub}</p>}
 </div>
                  ))}
 </div>

                {/* REVENUE CHART */}
 <div style={{background:"#fff",borderRadius:20,padding:"24px 26px",border:"1px solid #EFE7EB",marginBottom:24,maxWidth:1180,marginLeft:"auto",marginRight:"auto",position:"relative",overflow:"hidden"}}>
 <div style={{position:"absolute",top:0,right:0,left:0,height:4,background:"linear-gradient(90deg,#F6D9E2,#E8B5C4,#F6D9E2)"}}/>
 <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20,justifyContent:"center"}}>
 <span style={{width:40,height:1,background:"linear-gradient(90deg,transparent,#E8B5C4)"}}/>
 <h3 className="serif" style={{fontSize:22,fontWeight:600,color:"#2A2A2A"}}>הכנסות 6 חודשים אחרונים</h3>
 <span style={{width:40,height:1,background:"linear-gradient(90deg,#E8B5C4,transparent)"}}/>
 </div>
 <div style={{display:"flex",alignItems:"flex-end",gap:10,height:150,paddingBottom:4}}>
                    {monthlyData.map((m,i)=>{
                      const h=Math.round((m.revenue/maxRev)*120);
                      const isCurrent=i===monthlyData.length-1;
                      return(
 <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
 <span style={{fontSize:9.5,fontWeight:600,color:isCurrent?"#C77B92":"#B0A8AE"}}>{m.revenue>0?`₪${m.revenue.toLocaleString()}`:""}</span>
 <div style={{width:"100%",maxWidth:46,height:Math.max(h,4),borderRadius:"10px 10px 4px 4px",background:isCurrent?"linear-gradient(180deg,#D89AAE 0%,#C77B92 100%)":"linear-gradient(180deg,#F6D9E2 0%,#E8B5C4 100%)",transition:"height 0.3s"}}/>
 <span style={{fontSize:10,color:isCurrent?"#2A2A2A":"#B0A8AE",fontWeight:isCurrent?600:500}}>{m.month}</span>
 </div>
                      );
                    })}
 </div>
 </div>

                {/* SECTION TITLE */}
 <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16,margin:"0 0 24px"}}>
 <span style={{width:50,height:1,background:"linear-gradient(90deg,transparent,#E8B5C4)"}}/>
 <h2 className="serif" style={{fontSize:24,fontWeight:600,color:"#2A2A2A"}}>היום שלך</h2>
 <span style={{width:50,height:1,background:"linear-gradient(90deg,#E8B5C4,transparent)"}}/>
 </div>

 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:18,maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{background:"#fff",borderRadius:20,padding:"24px 26px",border:"1px solid #EFE7EB",position:"relative",overflow:"hidden"}}>
 <div style={{position:"absolute",top:0,right:0,left:0,height:4,background:"linear-gradient(90deg,#F6D9E2,#E8B5C4,#F6D9E2)"}}/>
 <h3 className="serif" style={{fontSize:21,fontWeight:600,color:"#2A2A2A",marginBottom:16}}>דורש תשומת לב</h3>
                    {(()=>{
                      const items=[];
                      if(newLeadsCount>0)items.push({icon:"",text:`${newLeadsCount} פניות חדשות ממתינות למענה`,tab:"leads"});
                      if(leadsWithReminders.length>0)items.push({icon:"",text:`${leadsWithReminders.length} תזכורות מעקב להיום`,tab:"leads"});
                      if(coldClients.length>0)items.push({icon:"✦",text:`${coldClients.length} לקוחות לא ביקרו 60+ ימים`,tab:"whatsapp"});
                      const tomorrowNotSent=tomorrowAppts.filter(a=>!a.confirmation_sent).length;
                      if(tomorrowNotSent>0)items.push({icon:"",text:`${tomorrowNotSent} תורי מחר ללא תזכורת שנשלחה`,tab:"whatsapp"});
                      if(items.length===0)return <p style={{fontSize:11.5,color:"#8A8088",padding:"8px 0"}}>הכל מטופל — אין משימות פתוחות </p>;
                      return items.map((it,i)=>(
 <div key={i} onClick={()=>setActiveTab(it.tab)} className="stat-card" style={{display:"flex",alignItems:"center",gap:11,padding:"12px 14px",background:"linear-gradient(90deg,#FCEEF3,#FFFFFF)",borderRadius:14,marginBottom:8,cursor:"pointer"}}>
 <span style={{fontSize:16}}>{it.icon}</span>
 <p style={{fontSize:12,color:"#2A2A2A",fontWeight:500,flex:1}}>{it.text}</p>
 <span style={{fontSize:12,color:"#C77B92"}}>←</span>
 </div>
                      ));
                    })()}
 </div>

 <div style={{background:"#fff",borderRadius:20,padding:"24px 26px",border:"1px solid #EFE7EB",position:"relative",overflow:"hidden"}}>
 <div style={{position:"absolute",top:0,right:0,left:0,height:4,background:"linear-gradient(90deg,#F6D9E2,#E8B5C4,#F6D9E2)"}}/>
 <h3 className="serif" style={{fontSize:21,fontWeight:600,color:"#2A2A2A",marginBottom:16}}>תורים להיום</h3>
                    {todayAppts.length===0?<p style={{fontSize:11.5,color:"#8A8088",padding:"8px 0"}}>אין תורים מתוכננים להיום</p>
                      :todayAppts.sort((a,b)=>a.hour-b.hour).map((a,i,arr)=>(
 <div key={a.id} style={{display:"flex",alignItems:"center",gap:13,padding:"13px 0",borderBottom:i<arr.length-1?"1px solid #EFE7EB":"none"}}>
 <span className="serif" style={{fontSize:18,fontWeight:600,color:"#C77B92",width:50,flexShrink:0}}>{a.hour}:00</span>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:13,fontWeight:600,color:"#2A2A2A"}}>{a.name}</p>
 <p style={{fontSize:10.5,color:"#8A8088",marginTop:1}}>{a.service}</p>
 </div>
 <span style={{fontSize:9.5,padding:"5px 13px",borderRadius:20,fontWeight:500,background:"linear-gradient(90deg,#FBEEF2,#F6D9E2)",color:"#C77B92"}}>{a.confirmation_status==="confirmed"?"אושר":a.confirmation_status==="cancelled"?"בוטל":"ממתין"}</span>
 </div>
                      ))}
 </div>

 <div style={{background:"#fff",borderRadius:20,padding:"24px 26px",border:"1px solid #EFE7EB",position:"relative",overflow:"hidden"}}>
 <div style={{position:"absolute",top:0,right:0,left:0,height:4,background:"linear-gradient(90deg,#F6D9E2,#E8B5C4,#F6D9E2)"}}/>
 <h3 className="serif" style={{fontSize:21,fontWeight:600,color:"#2A2A2A",marginBottom:16}}>ימי הולדת קרובים</h3>
                    {upcomingBirthdays.length===0?<p style={{fontSize:11.5,color:"#8A8088",padding:"8px 0"}}>אין ימי הולדת ב-30 הימים הקרובים</p>
                      :upcomingBirthdays.slice(0,5).map((c,i,arr)=>{
                        const b=new Date(c.birthday);const bd=new Date(now.getFullYear(),b.getMonth(),b.getDate());if(bd<now)bd.setFullYear(now.getFullYear()+1);
                        return(
 <div key={c.id} style={{display:"flex",alignItems:"center",gap:14,padding:"11px 0",borderBottom:i<arr.length-1?"1px solid #EFE7EB":"none"}}>
 <div className="serif" style={{width:44,height:44,borderRadius:14,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:600,color:"#fff",background:"linear-gradient(135deg,#E8B5C4 0%,#C77B92 100%)",boxShadow:"0 5px 12px rgba(199,123,146,0.26)"}}>{b.getDate()}</div>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:12.5,fontWeight:600,color:"#2A2A2A"}}>{c.name}</p>
 <p style={{fontSize:10,color:"#8A8088",marginTop:1}}>{bd.getDate()}/{bd.getMonth()+1}</p>
 </div>
                            {c.phone&&<a href={waBirthday(c.phone,c.name,settings.business_name)} target="_blank" rel="noreferrer" style={{fontSize:9.5,padding:"6px 14px",borderRadius:20,fontWeight:500,background:"linear-gradient(90deg,#FBEEF2,#F6D9E2)",color:"#C77B92",textDecoration:"none"}}>ברכה</a>}
 </div>
                        );
                      })}
 </div>
 </div>
 </>);
            })()}
 </>)}

          {/* CALENDAR */}
          {activeTab==="calendar"&&(<>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:7,maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <h2 className="serif" style={{fontSize:22,fontWeight:600,color:"#2A2A2A"}}>{formatDateHe(weekDates[0])} – {formatDateHe(weekDates[5])}</h2>
 <div style={{display:"flex",gap:5,alignItems:"center"}}>
 <div className="desktop-only" style={{display:"flex",gap:6,fontSize:9,color:"#8A8088",marginLeft:6}}>
 <span style={{color:"#4CAF50",fontWeight:700}}>● אישרה</span>
 <span style={{color:"#F44336",fontWeight:700}}>● ביטלה</span>
 <span style={{color:"#8A8088"}}>● ממתין</span>
 </div>
 <button onClick={()=>{const d=new Date(weekStart);d.setDate(d.getDate()-6);setWeekStart(d);}} style={{background:"#fff",border:"1px solid #EFE7EB",borderRadius:20,padding:"6px 12px",cursor:"pointer",fontSize:11,color:"#C77B92"}}>←</button>
 <button onClick={()=>setWeekStart(new Date())} style={{background:"#FCEEF3",border:"1px solid #EFE7EB",borderRadius:20,padding:"6px 12px",cursor:"pointer",fontSize:11,color:"#C77B92"}}>היום</button>
 <button onClick={()=>{const d=new Date(weekStart);d.setDate(d.getDate()+6);setWeekStart(d);}} style={{background:"#fff",border:"1px solid #EFE7EB",borderRadius:20,padding:"6px 12px",cursor:"pointer",fontSize:11,color:"#C77B92"}}>→</button>
 </div>
 </div>
 <div style={{background:"#fff",borderRadius:18,overflow:"auto",border:"1px solid #EFE7EB",maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{display:"grid",gridTemplateColumns:"50px repeat(6,minmax(70px,1fr))",borderBottom:"1px solid #EFE7EB",background:"linear-gradient(90deg,#FCEEF3,#FFFFFF)",minWidth:480}}>
 <div/>
                {weekDates.map((d,i)=>{
                  const isToday=formatDate(d)===today;
                  const dayAppts=appointments.filter(a=>a.date===formatDate(d));
                  const hasCancel=dayAppts.some(a=>a.confirmation_status==="cancelled");
                  return(
 <div key={i} style={{padding:"9px 4px",textAlign:"center",borderRight:i<5?"1px solid #EFE7EB":"none",background:hasCancel?"#FFF3F3":"transparent"}}>
 <p style={{fontSize:9,color:"#8A8088"}}>{DAYS_HE[d.getDay()]}</p>
 <p className="serif" style={{fontSize:16,fontWeight:600,color:isToday?"#C77B92":"#2A2A2A"}}>{d.getDate()}</p>
 <p style={{fontSize:7,color:"#C9B8C2"}}>{d.getMonth()+1}/{d.getFullYear().toString().slice(2)}</p>
                      {hasCancel&&<p style={{fontSize:7,color:"#F44336"}}>ביטול</p>}
 </div>
                  );
                })}
 </div>
              {workingHours.map((hour,hi)=>(
 <div key={hour} style={{display:"grid",gridTemplateColumns:"50px repeat(6,minmax(70px,1fr))",borderBottom:hi<workingHours.length-1?"1px solid #F7F0F3":"none",minHeight:54,minWidth:480}}>
 <div style={{padding:"4px 3px 0",fontSize:8,color:"#C9B8C2",textAlign:"center",borderLeft:"1px solid #EFE7EB"}}>{hour}</div>
                  {weekDates.map((date,di)=>{
                    const appt=getAppt(date,settings.working_hours_start+hi);
                    const apptColor=appt?getApptColor(appt):null;
                    return(
 <div key={di} className={!appt?"slot":""} onClick={()=>handleSlotClick(date,settings.working_hours_start+hi)} style={{borderRight:di<5?"1px solid #F7F0F3":"none",position:"relative",padding:2,minHeight:54}}>
                        {appt&&(
 <div className="appt-card" onMouseEnter={()=>setHoveredAppt(appt.id)} onMouseLeave={()=>setHoveredAppt(null)}
                            style={{background:apptColor,borderRadius:10,padding:"4px 6px",height:"calc(100% - 2px)",position:"relative",border:appt.confirmation_status==="confirmed"?"2px solid #4CAF50":appt.confirmation_status==="cancelled"?"2px solid #F44336":"none"}}>
 <p style={{fontSize:9,fontWeight:700,color:"#fff",textShadow:"0 1px 2px rgba(0,0,0,0.3)"}}>{appt.name}</p>
 <p style={{fontSize:7,color:"rgba(255,255,255,0.9)"}}>{appt.service}</p>
                            {appt.confirmation_status==="confirmed"&&<span style={{fontSize:7}}>✓</span>}
                            {appt.confirmation_status==="cancelled"&&<span style={{fontSize:7}}>✕</span>}
 <div style={{display:"flex",gap:2,position:"absolute",bottom:2,right:2}}>
                              {appt.client_id&&<button onClick={e=>{e.stopPropagation();setSelectedClient(clients.find(c=>String(c.id)===String(appt.client_id)));setClientTab("info");}} style={{background:"rgba(255,255,255,0.7)",border:"none",borderRadius:4,padding:"1px 3px",fontSize:7,cursor:"pointer"}}></button>}
 <button onClick={e=>{e.stopPropagation();handleOpenCashier(appt);}} style={{background:"rgba(255,255,255,0.7)",border:"none",borderRadius:4,padding:"1px 3px",fontSize:7,cursor:"pointer"}}></button>
 </div>
                            {hoveredAppt===appt.id&&<button onClick={e=>{e.stopPropagation();handleDelete(appt);}} style={{position:"absolute",top:2,left:2,background:"rgba(0,0,0,0.2)",border:"none",borderRadius:4,width:13,height:13,fontSize:7,cursor:"pointer",color:"#fff"}}>✕</button>}
 </div>
                        )}
 </div>
                    );
                  })}
 </div>
              ))}
 </div>
 </>)}

          {/* CLIENTS */}
          {activeTab==="clients"&&(<>
 <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:7}}>
 <h2 className="serif" style={{fontSize:22,fontWeight:600,color:"#2A2A2A"}}>לקוחות ({filteredClients.length})</h2>
 <button onClick={()=>{setEditingClient(null);setNewClient(emptyClient);setShowClientModal(true);}} style={{background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",border:"none",borderRadius:24,padding:"9px 18px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 6px 16px rgba(199,123,146,0.25)"}}>✦ מטופלת חדשה</button>
 </div>
 <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
 <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="שם או טלפון..." style={{flex:1,minWidth:140,border:"1px solid #EFE7EB",borderRadius:24,padding:"9px 14px",fontSize:11.5,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#fff"}}/>
 <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{border:"1px solid #EFE7EB",borderRadius:24,padding:"9px 12px",fontSize:10.5,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#fff",color:"#6B6B6B"}}>
 <option value="all">כל הסטטוסים</option><option value="VIP">VIP</option><option value="hot">חמות</option><option value="active">✓ פעילות</option><option value="cold">להתחדשות</option>
 </select>
 <select value={filterSkin} onChange={e=>setFilterSkin(e.target.value)} style={{border:"1px solid #EFE7EB",borderRadius:24,padding:"9px 12px",fontSize:10.5,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#fff",color:"#6B6B6B"}}>
 <option value="all">כל עור</option>{SKIN_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
 </select>
 </div>
            {filteredClients.length===0?<p style={{color:"#C9B8C2",fontSize:11}}>לא נמצאו לקוחות</p>
              :filteredClients.map(client=>{
                const appts=getClientAppts(client.id);
                const last=appts.sort((a,b)=>b.id-a.id)[0];
                const statusColor=STATUS_COLORS[client.status]||"#E8B5C4";
                const days=getDaysSince(client.id);
                const total=getClientTotal(client.id);
                return(
 <div key={client.id} className="client-row" onClick={()=>{setSelectedClient(client);setClientTab("info");}} style={{background:"#fff",borderRadius:16,padding:"12px 14px",border:"1px solid #EFE7EB",display:"flex",alignItems:"center",gap:11,marginBottom:7}}>
 <div style={{width:40,height:40,borderRadius:"50%",background:client.images?.[0]?"transparent":statusColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:700,color:"#fff",flexShrink:0,overflow:"hidden"}}>
                      {client.images?.[0]?<img alt="" src={client.images[0]} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:client.name[0]}
 </div>
 <div style={{flex:1,minWidth:0}}>
 <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2,flexWrap:"wrap"}}>
 <p style={{fontWeight:600,fontSize:13,color:"#2A2A2A"}}>{client.name}</p>
                        {client.status&&<span style={{fontSize:7,background:statusColor,color:"#fff",padding:"2px 7px",borderRadius:20,fontWeight:600}}>{STATUS_LABELS[client.status]}</span>}
                        {days>90&&<span style={{fontSize:7,background:"#FEEBEE",color:"#C62828",padding:"2px 7px",borderRadius:20}}>{days}י</span>}
                        {total>0&&<span style={{fontSize:7,background:"#FCEEF3",color:"#C77B92",padding:"2px 7px",borderRadius:20,fontWeight:700}}>₪{total.toLocaleString()}</span>}
 </div>
 <p style={{fontSize:9,color:"#8A8088",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{client.phone&&`${client.phone} · `}{appts.length} תורים{last&&` · ${last.service}`}</p>
 </div>
                    {client.phone&&<a href={waLink(client.phone)} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} className="wa-btn" style={{padding:"5px 8px",fontSize:9}}></a>}
 <span style={{fontSize:11,color:"#C77B92"}}>←</span>
 </div>
                );
              })}
 </div>
 </>)}

          {/* LEADS */}
          {activeTab==="leads"&&(<>
 <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:7}}>
 <h2 className="serif" style={{fontSize:22,fontWeight:600,color:"#2A2A2A"}}>פניות ({leads.length})</h2>
 <button onClick={()=>{setEditingLead(null);setNewLead(emptyLead);setShowLeadModal(true);}} style={{background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",border:"none",borderRadius:24,padding:"9px 18px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 6px 16px rgba(199,123,146,0.25)"}}>✦ פנייה חדשה</button>
 </div>
 <div style={{display:"flex",gap:6,marginBottom:12,overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
 <div onClick={()=>setLeadFilter("all")} className="stat-card" style={{background:leadFilter==="all"?"linear-gradient(90deg,#C77B92,#D89AAE)":"#fff",borderRadius:24,padding:"7px 14px",border:"1px solid #EFE7EB",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
 <span style={{fontSize:10.5,fontWeight:600,color:leadFilter==="all"?"#fff":"#2A2A2A"}}>הכל ({leads.length})</span>
 </div>
              {Object.entries(LEAD_STATUSES).map(([key,s])=>(
 <div key={key} onClick={()=>setLeadFilter(leadFilter===key?"all":key)} className="stat-card" style={{background:leadFilter===key?s.bg:"#fff",borderRadius:24,padding:"7px 14px",border:`1px solid ${leadFilter===key?s.color:"#EFE7EB"}`,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
 <span style={{fontSize:9.5,fontWeight:leadFilter===key?700:400,color:leadFilter===key?s.color:"#6B6B6B"}}>{s.label} ({leads.filter(l=>l.status===key).length})</span>
 </div>
              ))}
 </div>
 <input value={leadSearch} onChange={e=>setLeadSearch(e.target.value)} placeholder="חיפוש..." style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:24,padding:"9px 14px",fontSize:11.5,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#fff",marginBottom:10}}/>
            {filteredLeads.length===0?<p style={{color:"#C9B8C2",fontSize:11}}>לא נמצאו לידים</p>
              :filteredLeads.map(lead=>{
                const st=LEAD_STATUSES[lead.status]||LEAD_STATUSES.new;
                const hasReminder=lead.reminder_date&&lead.reminder_date<=tomorrow;
                return(
 <div key={lead.id} className="lead-row" onClick={()=>setSelectedLead(lead)} style={{background:"#fff",borderRadius:16,padding:"11px 14px",border:`1px solid ${hasReminder?"#FF9800":"#EFE7EB"}`,display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
 <div style={{width:34,height:34,borderRadius:"50%",background:st.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}}>{SOURCE_ICONS[lead.source]||""}</div>
 <div style={{flex:1,minWidth:0}}>
 <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:1,flexWrap:"wrap"}}>
 <p style={{fontWeight:600,fontSize:12,color:"#2A2A2A"}}>{lead.name}</p>
 <span style={{fontSize:7,background:st.bg,color:st.color,padding:"2px 6px",borderRadius:20,fontWeight:600}}>{st.label}</span>
                        {hasReminder&&<span style={{fontSize:7,background:"#FFF3E0",color:"#FF9800",padding:"2px 6px",borderRadius:20}}></span>}
 </div>
 <p style={{fontSize:9,color:"#8A8088",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{lead.phone&&`${lead.phone} · `}{SOURCE_ICONS[lead.source]} {lead.source}{lead.service_interest&&` · ${lead.service_interest}`}</p>
 </div>
                    {lead.phone&&<a href={waLink(lead.phone)} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} className="wa-btn" style={{padding:"4px 7px",fontSize:9}}></a>}
                    {lead.status!=="closed"&&lead.status!=="lost"&&<button onClick={e=>{e.stopPropagation();handleConvertLead(lead);}} style={{background:"#4CAF50",color:"#fff",border:"none",borderRadius:20,padding:"4px 9px",fontSize:9,cursor:"pointer",fontFamily:"inherit",fontWeight:600,flexShrink:0}}>המר ✓</button>}
 </div>
                );
              })}
 </div>
 </>)}

          {/* CASHIER */}
          {activeTab==="cashier"&&(<>
 <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:7}}>
 <h2 className="serif" style={{fontSize:22,fontWeight:600,color:"#2A2A2A"}}>תשלומים וקבלות</h2>
 <div style={{display:"flex",gap:6}}>
 <button onClick={()=>handleOpenCashier(null)} style={{background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",border:"none",borderRadius:24,padding:"9px 18px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 6px 16px rgba(199,123,146,0.25)"}}>✦ תשלום חדש</button>
 <button onClick={handleExportCSV} style={{background:"#fff",color:"#C77B92",border:"1px solid #EFE7EB",borderRadius:24,padding:"9px 18px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>ייצוא Excel</button>
 </div>
 </div>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10,marginBottom:16}}>
 <div style={{background:"linear-gradient(180deg,#FFFFFF,#FDF4F7)",borderRadius:16,padding:"14px 16px",border:"1px solid #EFE7EB"}}>
 <p style={{fontSize:9,color:"#8A8088"}}>הכנסות החודש</p>
 <p className="serif" style={{fontSize:22,fontWeight:600,color:"#C77B92"}}>₪{thisMonthRevenue.toLocaleString()}</p>
 </div>
              {paymentBreakdown.map(p=>(
 <div key={p.key} style={{background:"#fff",borderRadius:16,padding:"14px 16px",border:"1px solid #EFE7EB"}}>
 <p style={{fontSize:9,color:"#8A8088"}}>{p.icon} {p.key}</p>
 <p className="serif" style={{fontSize:19,fontWeight:600,color:"#2A2A2A"}}>₪{p.total.toLocaleString()}</p>
 <p style={{fontSize:7,color:"#8A8088"}}>{p.count} עסקאות</p>
 </div>
              ))}
 </div>

            {todayAppts.length>0&&(
 <div style={{background:"#fff",borderRadius:18,padding:16,border:"1px solid #EFE7EB",marginBottom:14}}>
 <h3 className="serif" style={{fontSize:16,fontWeight:600,color:"#2A2A2A",marginBottom:12}}>תורים היום — תשלום מהיר</h3>
                {todayAppts.map(a=>{
                  const client=clients.find(c=>String(c.id)===String(a.client_id));
                  const paid=receipts.some(r=>String(r.appointment_id)===String(a.id));
                  return(
 <div key={a.id} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 11px",background:paid?"#F3FFF6":"#FCEEF3",borderRadius:12,marginBottom:6,border:`1px solid ${paid?"#B5EAD7":"#EFE7EB"}`,flexWrap:"wrap"}}>
 <div style={{flex:1,minWidth:120}}>
 <p style={{fontSize:11,fontWeight:600,color:"#2A2A2A"}}>{a.name}</p>
 <p style={{fontSize:9,color:"#8A8088"}}>{a.service} · ₪{a.price}</p>
 </div>
                      {paid?<span style={{fontSize:10,color:"#4CAF50",fontWeight:700}}>שולם</span>
                        :<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                          {client?.phone&&PAYMENT_METHODS.slice(1).map(pm=>(
 <a key={pm.key} href={waPayment(client.phone,a.name,a.price,a.service,pm.key,settings.business_phone)} target="_blank" rel="noreferrer"
                              style={{background:pm.color,color:"#fff",border:"none",borderRadius:14,padding:"4px 8px",fontSize:8,cursor:"pointer",textDecoration:"none",fontWeight:600}}>{pm.icon}</a>
                          ))}
 <button onClick={()=>handleOpenCashier(a)} style={{background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",border:"none",borderRadius:14,padding:"4px 10px",fontSize:9,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}></button>
 </div>
                      }
 </div>
                  );
                })}
 </div>
            )}

 <div style={{background:"#fff",borderRadius:18,padding:16,border:"1px solid #EFE7EB"}}>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:5}}>
 <h3 className="serif" style={{fontSize:16,fontWeight:600,color:"#2A2A2A"}}>קבלות</h3>
 <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {["all",...PAYMENT_METHODS.map(p=>p.key)].map(m=>(
 <button key={m} onClick={()=>setReceiptFilter(m)} style={{background:receiptFilter===m?"linear-gradient(90deg,#C77B92,#D89AAE)":"#FCEEF3",color:receiptFilter===m?"#fff":"#6B6B6B",border:"1px solid #EFE7EB",borderRadius:20,padding:"3px 9px",fontSize:8,cursor:"pointer",fontFamily:"inherit"}}>
                      {m==="all"?"הכל":m}
 </button>
                  ))}
 </div>
 </div>
              {filteredReceipts.length===0?<p style={{color:"#C9B8C2",fontSize:11}}>אין קבלות</p>
                :filteredReceipts.sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||"")).slice(0,20).map(r=>(
 <div key={r.id} onClick={()=>setShowReceipt(r)} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 11px",background:"#FCEEF3",borderRadius:12,marginBottom:5,cursor:"pointer"}} className="client-row">
 <div style={{width:30,height:30,borderRadius:"50%",background:PAYMENT_METHODS.find(p=>p.key===r.payment_method)?.color||"#E8B5C4",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0}}>
                      {PAYMENT_METHODS.find(p=>p.key===r.payment_method)?.icon||""}
 </div>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:11,fontWeight:600,color:"#2A2A2A"}}>{r.client_name}</p>
 <p style={{fontSize:8,color:"#8A8088",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.service} · {r.payment_method} · {r.created_at?.slice(0,10)}</p>
 </div>
 <p className="serif" style={{fontSize:14,fontWeight:600,color:"#C77B92"}}>₪{r.amount}</p>
 </div>
                ))}
 </div>
 </div>
 </>)}

          {/* WHATSAPP CENTER */}
          {activeTab==="whatsapp"&&(()=>{
            const reminderTargets=tomorrowAppts.map(a=>{
              const cl=clients.find(c=>String(c.id)===String(a.client_id));
              return {clientId:a.client_id,name:a.name,phone:cl?.phone,
                message:`שלום ${a.name}! ✦\nתזכורת לתור מחר:\n${a.service}\nבשעה ${a.hour}:00\n\nמחכים לך! `};
            });
            const birthdayTargets=upcomingBirthdays.map(c=>{
              const b=new Date(c.birthday);const bd=new Date(now.getFullYear(),b.getMonth(),b.getDate());
              if(bd<now)bd.setFullYear(now.getFullYear()+1);
              const days=Math.floor((bd-now)/(1000*60*60*24));
              return {clientId:c.id,name:c.name,phone:c.phone,days,
                message:`שלום ${c.name}! \nיום הולדת שמח! \nמ${settings.business_name} אנחנו שולחים לך ברכות חמות!\nלרגל היום המיוחד - 15% הנחה על הטיפול הבא שלך \nנחכה לך! ✦`};
            });
            const coldTargets=coldClients.map(c=>({clientId:c.id,name:c.name,phone:c.phone,days:getDaysSince(c.id),
              message:`שלום ${c.name}! \nמתגעגעים אלייך ב${settings.business_name}!\nמזמן לא ראינו אותך — נשמח לפנק אותך בטיפול \nרוצה לקבוע תור? פשוט תכתבי לנו `}));
            const weekAgo=formatDate(new Date(now.getTime()-7*86400000));
            const reviewClientIds=[...new Set(appointments.filter(a=>a.date&&a.date>=weekAgo&&a.date<=today).map(a=>String(a.client_id)))];
            const reviewTargets=reviewClientIds.map(cid=>{
              const c=clients.find(cl=>String(cl.id)===cid);
              if(!c)return null;
              return {clientId:c.id,name:c.name,phone:c.phone,
                message:`שלום ${c.name}! \nתודה שביקרת אצלנו ב${settings.business_name}!\nנשמח מאוד אם תשאירי לנו ביקורת \nזה לוקח רק דקה ועוזר לנו מאוד! `};
            }).filter(Boolean);

            const audienceClients=clients.filter(c=>{
              if(!c.phone)return false;
              if(waBroadcastAudience==="all")return true;
              if(waBroadcastAudience==="vip")return c.status==="VIP";
              if(waBroadcastAudience==="active")return getDaysSince(c.id)<=60;
              if(waBroadcastAudience==="cold")return getDaysSince(c.id)>60;
              return true;
            });

            const groups=[
              {key:"reminders",icon:"",title:"תזכורות לתורי מחר",color:"#FF9800",bg:"#FFF3E0",targets:reminderTargets,empty:"אין תורים מחר"},
              {key:"birthdays",icon:"",title:"ברכות יום הולדת",color:"#C77B92",bg:"#FBEEF2",targets:birthdayTargets,empty:"אין ימי הולדת ב-30 הימים הקרובים"},
              {key:"cold",icon:"",title:"מטופלות להתחדשות (60+ יום)",color:"#5580C4",bg:"#EBF3FF",targets:coldTargets,empty:"כל המטופלות פעילות! "},
              {key:"review",icon:"",title:"בקשת ביקורת (השבוע האחרון)",color:"#9C27B0",bg:"#F3E5F5",targets:reviewTargets,empty:"אין ביקורים בשבוע האחרון"},
            ];

            return(<>
 <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <h2 className="serif" style={{fontSize:22,fontWeight:600,color:"#2A2A2A",marginBottom:4}}>מרכז הודעות</h2>
 <p style={{fontSize:11,color:"#8A8088",marginBottom:16}}>שליחת הודעות מוכנות ללקוחות — בלחיצה אחת</p>

 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:12,marginBottom:16}}>
                {groups.map(g=>{
                  const withPhone=g.targets.filter(t=>t.phone);
                  return(
 <div key={g.key} style={{background:"#fff",borderRadius:18,border:`1px solid #EFE7EB`,overflow:"hidden"}}>
 <div style={{background:g.bg,padding:"12px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
 <div style={{display:"flex",alignItems:"center",gap:8}}>
 <span style={{fontSize:16}}>{g.icon}</span>
 <div>
 <p style={{fontSize:11.5,fontWeight:700,color:"#2A2A2A"}}>{g.title}</p>
 <p style={{fontSize:9,color:g.color,fontWeight:600}}>{withPhone.length} נמענים</p>
 </div>
 </div>
                        {withPhone.length>0&&(
 <button onClick={()=>waSendGroup(g.targets)} style={{background:"#25D366",color:"#fff",border:"none",borderRadius:20,padding:"7px 12px",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>שליחה מרוכזת</button>
                        )}
 </div>
 <div style={{padding:"10px 12px",maxHeight:200,overflowY:"auto"}}>
                        {g.targets.length===0?<p style={{fontSize:10,color:"#C9B8C2",padding:"6px 0"}}>{g.empty}</p>
                          :g.targets.map((t,i)=>(
 <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 4px",borderBottom:i<g.targets.length-1?"1px solid #F7F0F3":"none"}}>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:10,fontWeight:600,color:"#2A2A2A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                  {waSentToday[t.clientId]&&<span style={{color:"#4CAF50"}}>✓ </span>}{t.name}
 </p>
 <p style={{fontSize:8,color:"#A89AA2"}}>{t.phone||"אין טלפון"}{t.days!==undefined?` · ${t.days} ימים`:""}</p>
 </div>
                              {t.phone?(
 <button onClick={()=>waSendOne(t.clientId,t.phone,t.message)} className="wa-btn" style={{padding:"4px 9px",fontSize:9}}>שלחי</button>
                              ):<span style={{fontSize:8,color:"#D8CDD4"}}>—</span>}
 </div>
                          ))}
 </div>
 </div>
                  );
                })}
 </div>

 <div style={{background:"#fff",borderRadius:18,border:"1px solid #EFE7EB",padding:16,marginBottom:14}}>
 <h3 className="serif" style={{fontSize:16,fontWeight:600,color:"#2A2A2A",marginBottom:12}}>שליחת הודעה לקבוצה</h3>
 <p style={{fontSize:9,color:"#8A8088",marginBottom:6}}>בחרי קהל יעד</p>
 <div style={{display:"flex",gap:4,marginBottom:12,flexWrap:"wrap"}}>
                  {[{k:"all",l:"כל המטופלות"},{k:"vip",l:"VIP"},{k:"active",l:"✓ פעילות"},{k:"cold",l:"להתחדשות"}].map(a=>(
 <button key={a.k} onClick={()=>setWaBroadcastAudience(a.k)} style={{padding:"6px 12px",border:"1px solid",borderColor:waBroadcastAudience===a.k?"#C77B92":"#EFE7EB",borderRadius:20,background:waBroadcastAudience===a.k?"linear-gradient(90deg,#C77B92,#D89AAE)":"#FCEEF3",color:waBroadcastAudience===a.k?"#fff":"#6B6B6B",fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:waBroadcastAudience===a.k?700:400}}>{a.l}</button>
                  ))}
 </div>
 <textarea value={waBroadcastMsg} onChange={e=>setWaBroadcastMsg(e.target.value)} rows={3}
                  placeholder="כתבי כאן את ההודעה... למשל: שלום! החודש מבצע מיוחד — 20% הנחה על טיפולי פנים "
                  style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:14,padding:"10px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3",resize:"none",marginBottom:8}}/>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
 <p style={{fontSize:10,color:"#8A8088"}}>{audienceClients.length} לקוחות עם טלפון בקבוצה זו</p>
 <button onClick={()=>{
                    if(!waBroadcastMsg.trim()){toast("נא לכתוב הודעה","error");return;}
                    waSendGroup(audienceClients.map(c=>({clientId:c.id,name:c.name,phone:c.phone,message:`שלום ${c.name}! ${waBroadcastMsg}`})));
                  }} style={{background:"#25D366",color:"#fff",border:"none",borderRadius:24,padding:"9px 16px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>שלחי לקבוצה</button>
 </div>
 </div>

 <div style={{background:"#fff",borderRadius:18,border:"1px solid #EFE7EB",padding:16}}>
 <h3 className="serif" style={{fontSize:16,fontWeight:600,color:"#2A2A2A",marginBottom:12}}>הודעה אישית למטופלת</h3>
 <div style={{position:"relative",marginBottom:8}}>
 <input value={waFreeSearch} onChange={e=>{setWaFreeSearch(e.target.value);if(!e.target.value)setWaFreeClient(null);}}
                    placeholder="חיפוש לקוחה לפי שם או טלפון..."
                    style={{width:"100%",border:`1px solid ${waFreeClient?"#4CAF50":"#EFE7EB"}`,borderRadius:14,padding:"10px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:waFreeClient?"#F3FFF6":"#FCEEF3"}}/>
                  {waFreeClient&&<span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:13}}>✓</span>}
                  {waFreeSearch.length>1&&!waFreeClient&&(
 <div style={{position:"absolute",top:"100%",right:0,left:0,background:"#fff",borderRadius:14,boxShadow:"0 8px 24px rgba(199,123,146,0.12)",zIndex:99,overflow:"hidden",marginTop:3,maxHeight:180,overflowY:"auto"}}>
                      {clients.filter(c=>c.name?.includes(waFreeSearch)||c.phone?.includes(waFreeSearch)).slice(0,6).map(c=>(
 <div key={c.id} onClick={()=>{setWaFreeClient(c);setWaFreeSearch(c.name);}} className="client-row" style={{padding:"9px 12px",borderBottom:"1px solid #FCEEF3",cursor:"pointer"}}>
 <p style={{fontSize:11,fontWeight:600,color:"#2A2A2A"}}>{c.name}</p>
 <p style={{fontSize:9,color:"#8A8088"}}>{c.phone||"אין טלפון"}</p>
 </div>
                      ))}
 </div>
                  )}
 </div>
 <textarea value={waFreeMsg} onChange={e=>setWaFreeMsg(e.target.value)} rows={3}
                  placeholder="כתבי כאן את ההודעה..."
                  style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:14,padding:"10px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3",resize:"none",marginBottom:8}}/>
 <button onClick={()=>{
                  if(!waFreeClient){toast("נא לבחור לקוחה","error");return;}
                  if(!waFreeClient.phone){toast("אין טלפון ללקוחה זו","error");return;}
                  if(!waFreeMsg.trim()){toast("נא לכתוב הודעה","error");return;}
                  waSendOne(waFreeClient.id,waFreeClient.phone,waFreeMsg);
                  setWaFreeMsg("");
                }} style={{background:"#25D366",color:"#fff",border:"none",borderRadius:24,padding:"10px 16px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",width:"100%"}}>שלחי הודעה</button>
 </div>
 </div>
 </>);
          })()}

          {/* CAMPAIGNS */}
          {activeTab==="campaigns"&&(<>
 <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <h2 className="serif" style={{fontSize:22,fontWeight:600,color:"#2A2A2A",marginBottom:16}}>ניתוח שיווק</h2>

 {/* FACEBOOK LIVE CAMPAIGNS */}
 <div style={{background:"#fff",borderRadius:18,padding:16,border:"1px solid #EFE7EB",marginBottom:16}}>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
 <h3 className="serif" style={{fontSize:17,fontWeight:600,color:"#2A2A2A"}}>קמפיינים בפייסבוק ואינסטגרם</h3>
 <div style={{display:"flex",gap:5,alignItems:"center"}}>
 <select value={fbDatePreset} onChange={e=>{setFbDatePreset(e.target.value);loadFbCampaigns(e.target.value);}} style={{border:"1px solid #EFE7EB",borderRadius:20,padding:"6px 10px",fontSize:10,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3",color:"#6B6B6B"}}>
 <option value="today">היום</option>
 <option value="last_7d">7 ימים</option>
 <option value="last_30d">30 ימים</option>
 <option value="last_90d">90 ימים</option>
 </select>
 <button onClick={()=>loadFbCampaigns()} disabled={fbLoading} className="primary-btn" style={{padding:"7px 14px",background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",fontSize:11}}>{fbLoading?"טוען...":fbCampaigns===null?"טעני קמפיינים":"רענני"}</button>
 </div>
 </div>

 {fbCampaigns===null&&!fbLoading&&!fbError&&(
 <p style={{fontSize:11,color:"#8A8088",padding:"10px 0"}}>לחצי "טעני קמפיינים" כדי לראות את ביצועי המודעות שלך בפייסבוק ואינסטגרם — הוצאה, לידים, ומחיר לליד.</p>
 )}

 {fbError&&(
 <div style={{background:"#FFFAF7",border:"1px solid #FFDAC1",borderRadius:12,padding:"11px 14px"}}>
 <p style={{fontSize:11,color:"#C77B92",fontWeight:600,marginBottom:3}}>לא ניתן לטעון כרגע</p>
 <p style={{fontSize:10,color:"#8A8088"}}>{fbError}</p>
 </div>
 )}

 {fbTotals&&fbCampaigns&&fbCampaigns.length>0&&(
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:10,marginBottom:14}}>
 <div style={{background:"linear-gradient(180deg,#FFFFFF,#FDF4F7)",borderRadius:14,padding:"12px 14px",border:"1px solid #EFE7EB"}}>
 <p style={{fontSize:9,color:"#8A8088"}}>סה״כ הוצאה</p>
 <p className="serif" style={{fontSize:20,fontWeight:600,color:"#C77B92"}}>₪{Math.round(fbTotals.spend).toLocaleString()}</p>
 </div>
 <div style={{background:"linear-gradient(180deg,#FFFFFF,#FDF4F7)",borderRadius:14,padding:"12px 14px",border:"1px solid #EFE7EB"}}>
 <p style={{fontSize:9,color:"#8A8088"}}>לידים</p>
 <p className="serif" style={{fontSize:20,fontWeight:600,color:"#2A2A2A"}}>{fbTotals.leads}</p>
 </div>
 <div style={{background:"linear-gradient(180deg,#FFFFFF,#FDF4F7)",borderRadius:14,padding:"12px 14px",border:"1px solid #EFE7EB"}}>
 <p style={{fontSize:9,color:"#8A8088"}}>מחיר לליד</p>
 <p className="serif" style={{fontSize:20,fontWeight:600,color:"#C77B92"}}>{fbTotals.cpl?`₪${fbTotals.cpl}`:"—"}</p>
 </div>
 <div style={{background:"linear-gradient(180deg,#FFFFFF,#FDF4F7)",borderRadius:14,padding:"12px 14px",border:"1px solid #EFE7EB"}}>
 <p style={{fontSize:9,color:"#8A8088"}}>חשיפות</p>
 <p className="serif" style={{fontSize:20,fontWeight:600,color:"#2A2A2A"}}>{fbTotals.impressions.toLocaleString()}</p>
 </div>
 </div>
 )}

 {fbCampaigns&&fbCampaigns.length>0&&fbCampaigns.map(c=>(
 <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 12px",background:"#FCEEF3",borderRadius:12,marginBottom:6,flexWrap:"wrap"}}>
 <div style={{flex:1,minWidth:140}}>
 <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
 <p style={{fontSize:12,fontWeight:600,color:"#2A2A2A"}}>{c.name}</p>
 <span style={{fontSize:7,padding:"2px 7px",borderRadius:20,fontWeight:600,background:c.status==="ACTIVE"?"#E8F5E9":"#F0E7EC",color:c.status==="ACTIVE"?"#388E3C":"#8A8088"}}>{c.status==="ACTIVE"?"פעיל":"מושהה"}</span>
 </div>
 <p style={{fontSize:9,color:"#8A8088",marginTop:2}}>{c.impressions.toLocaleString()} חשיפות · {c.clicks} קליקים</p>
 </div>
 <div style={{textAlign:"center",minWidth:60}}>
 <p style={{fontSize:8,color:"#8A8088"}}>הוצאה</p>
 <p className="serif" style={{fontSize:14,fontWeight:600,color:"#C77B92"}}>₪{Math.round(c.spend).toLocaleString()}</p>
 </div>
 <div style={{textAlign:"center",minWidth:45}}>
 <p style={{fontSize:8,color:"#8A8088"}}>לידים</p>
 <p className="serif" style={{fontSize:14,fontWeight:600,color:"#2A2A2A"}}>{c.leads}</p>
 </div>
 <div style={{textAlign:"center",minWidth:55}}>
 <p style={{fontSize:8,color:"#8A8088"}}>לליד</p>
 <p className="serif" style={{fontSize:14,fontWeight:600,color:"#C77B92"}}>{c.cpl?`₪${c.cpl}`:"—"}</p>
 </div>
 </div>
 ))}

 {fbCampaigns&&fbCampaigns.length===0&&!fbError&&(
 <p style={{fontSize:11,color:"#8A8088",padding:"8px 0"}}>לא נמצאו קמפיינים בטווח הזמן הזה.</p>
 )}
 </div>

 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10,marginBottom:16}}>
              {[
                {label:"סה״כ לידים",value:leads.length,icon:""},
                {label:"הומרו",value:convertedLeads.length,icon:"✓"},
                {label:"המרה",value:`${conversionRate}%`,icon:""},
                {label:"הכנסות מלידים",value:`₪${campaignStats.reduce((s,c)=>s+c.revenue,0).toLocaleString()}`,icon:""},
              ].map((s,i)=>(
 <div key={i} className="stat-card" style={{background:"linear-gradient(180deg,#FFFFFF,#FDF4F7)",borderRadius:16,padding:"14px 14px",border:`1px solid #EFE7EB`}}>
 <div style={{fontSize:15,marginBottom:3}}>{s.icon}</div>
 <p style={{fontSize:9,color:"#8A8088",marginBottom:2}}>{s.label}</p>
 <p className="serif" style={{fontSize:19,fontWeight:600,color:"#C77B92"}}>{s.value}</p>
 </div>
              ))}
 </div>
 <div style={{background:"#fff",borderRadius:18,padding:16,border:"1px solid #EFE7EB",marginBottom:14}}>
 <h3 className="serif" style={{fontSize:16,fontWeight:600,color:"#2A2A2A",marginBottom:14}}>ביצועים לפי מקור</h3>
              {campaignStats.length===0?<p style={{color:"#C9B8C2",fontSize:11}}>אין נתונים עדיין</p>
                :campaignStats.map((s,i)=>(
 <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px",background:i%2===0?"#FCEEF3":"#fff",borderRadius:12,marginBottom:4}}>
 <span style={{fontSize:16,flexShrink:0}}>{s.icon}</span>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:11.5,fontWeight:700,color:"#2A2A2A"}}>{s.source}</p>
 <div style={{display:"flex",gap:7,marginTop:1,flexWrap:"wrap"}}>
 <span style={{fontSize:8,color:"#8A8088"}}>{s.total} לידים</span>
 <span style={{fontSize:8,color:"#4CAF50"}}>{s.converted} הומרו</span>
 <span style={{fontSize:8,color:"#C77B92",fontWeight:700}}>{s.rate}%</span>
 </div>
 <div style={{background:"#F0E7EC",borderRadius:4,height:4,marginTop:3}}>
 <div style={{background:"linear-gradient(90deg,#C77B92,#D89AAE)",borderRadius:4,height:4,width:`${s.rate}%`}}/>
 </div>
 </div>
 <p className="serif" style={{fontSize:14,fontWeight:600,color:"#C77B92"}}>₪{s.revenue.toLocaleString()}</p>
 </div>
                ))}
 </div>
 </div>
 </>)}

          {/* PACKAGES */}
          {activeTab==="packages"&&(<>
 <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:7}}>
 <h2 className="serif" style={{fontSize:22,fontWeight:600,color:"#2A2A2A"}}>מנויי טיפולים</h2>
 <div style={{display:"flex",gap:6}}>
 <button onClick={()=>setShowPackageModal(true)} style={{background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",border:"none",borderRadius:24,padding:"9px 16px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 6px 16px rgba(199,123,146,0.25)"}}>+ חבילה חדשה</button>
 <button onClick={()=>setShowWaitlistModal(true)} style={{background:"#fff",color:"#C77B92",border:"1px solid #EFE7EB",borderRadius:24,padding:"9px 16px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>רשימת המתנה</button>
 </div>
 </div>

 <div style={{background:"#fff",borderRadius:18,padding:16,border:"1px solid #EFE7EB",marginBottom:14}}>
 <h3 className="serif" style={{fontSize:16,fontWeight:600,color:"#2A2A2A",marginBottom:12}}>חבילות פעילות ({packages.filter(p=>p.active).length})</h3>
              {packages.filter(p=>p.active).length===0?<p style={{color:"#C9B8C2",fontSize:11}}>אין חבילות פעילות</p>
                :packages.filter(p=>p.active).map(pkg=>(
 <div key={pkg.id} style={{background:"#FCEEF3",borderRadius:14,padding:"12px 14px",marginBottom:8,border:"1px solid #EFE7EB"}}>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:7,flexWrap:"wrap",gap:5}}>
 <div>
 <p style={{fontSize:12,fontWeight:700,color:"#2A2A2A"}}>{pkg.client_name}</p>
 <p style={{fontSize:10,color:"#8A8088"}}>{pkg.service} · ₪{pkg.price}</p>
 </div>
 <button onClick={()=>handleUsePackageSession(pkg)} style={{background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",border:"none",borderRadius:20,padding:"5px 11px",fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
                        ✓ השתמשי
 </button>
 </div>
 <div style={{display:"flex",gap:3,marginBottom:4}}>
                      {Array.from({length:Number(pkg.total_sessions)},(_,i)=>(
 <div key={i} style={{flex:1,height:8,borderRadius:4,background:i<Number(pkg.used_sessions)?"linear-gradient(90deg,#C77B92,#D89AAE)":"#F0E7EC"}}/>
                      ))}
 </div>
 <p style={{fontSize:9,color:"#8A8088"}}>{pkg.used_sessions}/{pkg.total_sessions} טיפולים · נותרו {Number(pkg.total_sessions)-Number(pkg.used_sessions)}</p>
 </div>
                ))}
 </div>

 <div style={{background:"#fff",borderRadius:18,padding:16,border:"1px solid #EFE7EB"}}>
 <h3 className="serif" style={{fontSize:16,fontWeight:600,color:"#2A2A2A",marginBottom:12}}>רשימת המתנה ({waitlist.filter(w=>w.status==="waiting").length})</h3>
              {waitlist.filter(w=>w.status==="waiting").length===0?<p style={{color:"#C9B8C2",fontSize:11}}>אין ממתינות</p>
                :waitlist.filter(w=>w.status==="waiting").map(w=>(
 <div key={w.id} style={{background:"#FCEEF3",borderRadius:14,padding:"10px 14px",marginBottom:6,border:`1px solid #EFE7EB`,display:"flex",alignItems:"center",gap:8}}>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:11,fontWeight:600,color:"#2A2A2A"}}>{w.client_name}</p>
 <p style={{fontSize:9,color:"#8A8088"}}>{w.service}{w.preferred_date&&` · ${w.preferred_date}`}</p>
 </div>
                    {w.phone&&<a href={waLink(w.phone)} target="_blank" rel="noreferrer" className="wa-btn" style={{padding:"4px 8px",fontSize:9}}></a>}
 </div>
                ))}
 </div>
 </div>
 </>)}
 </main>
 </div>

      {/* APPT MODAL */}
      {showModal&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:14}} onClick={()=>setShowModal(false)}>
 <div onClick={e=>e.stopPropagation()} className="modal-card" style={{background:"#fff",borderRadius:22,padding:24,width:360,maxWidth:"100%",maxHeight:"90vh",overflowY:"auto"}}>
 <h3 className="serif" style={{fontSize:20,fontWeight:600,color:"#2A2A2A",marginBottom:14}}>קביעת תור חדש</h3>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {clients.length>0&&<select value={newAppt.clientId} onChange={e=>handleClientSelect(e.target.value)} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3"}}><option value="">— בחרי לקוחה קיימת —</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}{c.phone?` · ${c.phone}`:""}</option>)}</select>}
 <input value={newAppt.name} onChange={e=>setNewAppt({...newAppt,name:e.target.value,clientId:""})} placeholder="או הזיני שם מטופלת חדשה" style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3"}}/>
 <div style={{display:"flex",gap:6}}>
 <div style={{flex:1}}><p style={{fontSize:9,color:"#8A8088",marginBottom:3}}>תאריך</p><input type="date" value={newAppt.date} onChange={e=>setNewAppt({...newAppt,date:e.target.value})} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none",background:"#FCEEF3"}}/></div>
 <div style={{flex:1}}><p style={{fontSize:9,color:"#8A8088",marginBottom:3}}>שעה</p><select value={newAppt.hour} onChange={e=>setNewAppt({...newAppt,hour:Number(e.target.value)})} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3"}}>{workingHours.map((h,i)=><option key={h} value={settings.working_hours_start+i}>{h}</option>)}</select></div>
 </div>
 <select value={newAppt.service} onChange={e=>handleServiceSelect(e.target.value)} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3"}}>
 <option value="">— בחרי שירות —</option>{activeServices.map(s=><option key={s.name} value={s.name}>{s.name} — ₪{s.price} ({s.duration}′)</option>)}
 </select>
 <div style={{display:"flex",gap:4}}>{[30,45,60,90].map(d=><button key={d} onClick={()=>setNewAppt({...newAppt,duration:d})} style={{flex:1,padding:"7px 0",border:"1px solid",borderColor:newAppt.duration===d?"#C77B92":"#EFE7EB",borderRadius:12,background:newAppt.duration===d?"linear-gradient(90deg,#C77B92,#D89AAE)":"#FCEEF3",color:newAppt.duration===d?"#fff":"#6B6B6B",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{d}′</button>)}</div>
 <input type="number" value={newAppt.price||""} onChange={e=>setNewAppt({...newAppt,price:e.target.value})} placeholder="₪ מחיר" style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",background:"#FCEEF3",textAlign:"right"}}/>
 <textarea value={apptNote} onChange={e=>setApptNote(e.target.value)} placeholder="הערה" rows={2} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3",resize:"none"}}/>
 </div>
 <div style={{display:"flex",gap:6,marginTop:16}}>
 <button onClick={()=>setShowModal(false)} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid #EFE7EB",background:"#fff",fontSize:12,color:"#8A8088"}}>ביטול</button>
 <button onClick={handleSave} disabled={isBusy("saveAppt")} className="primary-btn" style={{flex:2,padding:"11px 0",background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",fontSize:12}}>{isBusy("saveAppt")?"שומר...":"שמירה ✓"}</button>
 </div>
 </div>
 </div>
      )}

      {/* CLIENT MODAL */}
      {showClientModal&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:14}} onClick={()=>setShowClientModal(false)}>
 <div onClick={e=>e.stopPropagation()} className="modal-card" style={{background:"#fff",borderRadius:22,padding:24,width:380,maxWidth:"100%",maxHeight:"90vh",overflowY:"auto"}}>
 <h3 className="serif" style={{fontSize:20,fontWeight:600,color:"#2A2A2A",marginBottom:14}}>{editingClient?"עריכת מטופלת":"מטופלת חדשה"}</h3>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
 <input value={newClient.name} onChange={e=>setNewClient({...newClient,name:e.target.value})} placeholder="שם מלא *" style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3"}}/>
 <input value={newClient.phone} onChange={e=>setNewClient({...newClient,phone:e.target.value})} placeholder="טלפון" style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3"}}/>
 <input type="date" value={newClient.birthday} onChange={e=>setNewClient({...newClient,birthday:e.target.value})} placeholder="תאריך לידה" style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",background:"#FCEEF3"}}/>
 <select value={newClient.skinType} onChange={e=>setNewClient({...newClient,skinType:e.target.value})} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3"}}><option value="">סוג עור</option>{SKIN_TYPES.map(t=><option key={t}>{t}</option>)}</select>
 <textarea value={newClient.allergies} onChange={e=>setNewClient({...newClient,allergies:e.target.value})} placeholder="אלרגיות" rows={2} style={{width:"100%",border:"1px solid #FFDAC1",borderRadius:12,padding:"9px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FFFAF7",resize:"none"}}/>
 <textarea value={newClient.medical} onChange={e=>setNewClient({...newClient,medical:e.target.value})} placeholder="מצבים רפואיים" rows={2} style={{width:"100%",border:"1px solid #A7C4F4",borderRadius:12,padding:"9px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#F7FAFF",resize:"none"}}/>
 <textarea value={newClient.notes} onChange={e=>setNewClient({...newClient,notes:e.target.value})} placeholder="הערות" rows={2} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3",resize:"none"}}/>
 <div><p style={{fontSize:9,color:"#8A8088",marginBottom:4}}>סטטוס</p><div style={{display:"flex",gap:4}}>{Object.entries(STATUS_LABELS).map(([key,label])=><button key={key} onClick={()=>setNewClient({...newClient,status:key})} style={{flex:1,padding:"7px 2px",border:"1px solid",borderColor:newClient.status===key?"#C77B92":"#EFE7EB",borderRadius:12,background:newClient.status===key?STATUS_COLORS[key]:"#FCEEF3",color:newClient.status===key?"#fff":"#6B6B6B",fontSize:9,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{label}</button>)}</div></div>
 </div>
 <div style={{display:"flex",gap:6,marginTop:16}}>
 <button onClick={()=>setShowClientModal(false)} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid #EFE7EB",background:"#fff",fontSize:12,color:"#8A8088"}}>ביטול</button>
 <button onClick={handleSaveClient} disabled={isBusy("saveClient")} className="primary-btn" style={{flex:2,padding:"11px 0",background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",fontSize:12}}>{isBusy("saveClient")?"שומר...":"שמירה ✓"}</button>
 </div>
 </div>
 </div>
      )}

      {/* LEAD MODAL */}
      {showLeadModal&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:14}} onClick={()=>setShowLeadModal(false)}>
 <div onClick={e=>e.stopPropagation()} className="modal-card" style={{background:"#fff",borderRadius:22,padding:24,width:370,maxWidth:"100%",maxHeight:"90vh",overflowY:"auto"}}>
 <h3 className="serif" style={{fontSize:20,fontWeight:600,color:"#2A2A2A",marginBottom:14}}>{editingLead?"עריכת פנייה":"פנייה חדשה"}</h3>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
 <input value={newLead.name} onChange={e=>setNewLead({...newLead,name:e.target.value})} placeholder="שם *" style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3"}}/>
 <input value={newLead.phone} onChange={e=>setNewLead({...newLead,phone:e.target.value})} placeholder="טלפון" style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3"}}/>
 <div><p style={{fontSize:9,color:"#8A8088",marginBottom:3}}>מקור</p><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{LEAD_SOURCES.map(s=><button key={s} onClick={()=>setNewLead({...newLead,source:s})} style={{padding:"6px 9px",border:"1px solid",borderColor:newLead.source===s?"#C77B92":"#EFE7EB",borderRadius:20,background:newLead.source===s?"linear-gradient(90deg,#C77B92,#D89AAE)":"#FCEEF3",color:newLead.source===s?"#fff":"#6B6B6B",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>{SOURCE_ICONS[s]} {s}</button>)}</div></div>
 <select value={newLead.service_interest} onChange={e=>setNewLead({...newLead,service_interest:e.target.value})} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3"}}><option value="">תחום עניין</option>{activeServices.map(s=><option key={s.name}>{s.name}</option>)}</select>
 <div><p style={{fontSize:9,color:"#8A8088",marginBottom:3}}>סטטוס</p><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{Object.entries(LEAD_STATUSES).map(([key,s])=><button key={key} onClick={()=>setNewLead({...newLead,status:key})} style={{padding:"6px 9px",border:"1px solid",borderColor:newLead.status===key?s.color:"#EFE7EB",borderRadius:20,background:newLead.status===key?s.bg:"#FCEEF3",color:newLead.status===key?s.color:"#6B6B6B",fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:newLead.status===key?700:400}}>{s.label}</button>)}</div></div>
 <div><p style={{fontSize:9,color:"#8A8088",marginBottom:3}}>תזכורת מעקב</p><input type="date" value={newLead.reminder_date} onChange={e=>setNewLead({...newLead,reminder_date:e.target.value})} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",background:"#FCEEF3"}}/></div>
 <textarea value={newLead.notes} onChange={e=>setNewLead({...newLead,notes:e.target.value})} placeholder="הערות" rows={2} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3",resize:"none"}}/>
 </div>
 <div style={{display:"flex",gap:6,marginTop:16}}>
 <button onClick={()=>setShowLeadModal(false)} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid #EFE7EB",background:"#fff",fontSize:12,color:"#8A8088"}}>ביטול</button>
 <button onClick={handleSaveLead} disabled={isBusy("saveLead")} className="primary-btn" style={{flex:2,padding:"11px 0",background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",fontSize:12}}>{isBusy("saveLead")?"שומר...":"שמירה ✓"}</button>
 </div>
 </div>
 </div>
      )}

      {/* CASHIER MODAL */}
      {showCashier&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:14}} onClick={()=>setShowCashier(false)}>
 <div onClick={e=>e.stopPropagation()} className="modal-card" style={{background:"#fff",borderRadius:22,padding:24,width:420,maxWidth:"100%",maxHeight:"92vh",overflowY:"auto"}}>
 <h3 className="serif" style={{fontSize:20,fontWeight:600,color:"#2A2A2A",marginBottom:14}}>קופה — תשלום חדש</h3>
            {/* CLIENT SEARCH */}
 <div style={{position:"relative",marginBottom:10}}>
 <input value={cashierSearch} onChange={e=>{setCashierSearch(e.target.value);if(!e.target.value)setCashierClient(null);}} placeholder="חיפוש לקוחה..." style={{width:"100%",border:`1px solid ${cashierClient?"#4CAF50":"#EFE7EB"}`,borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:cashierClient?"#F3FFF6":"#FCEEF3"}}/>
              {cashierSearch.length>1&&!cashierClient&&(
 <div style={{position:"absolute",top:"100%",right:0,left:0,background:"#fff",borderRadius:12,boxShadow:"0 8px 24px rgba(199,123,146,0.12)",zIndex:99,overflow:"hidden",marginTop:3,maxHeight:160,overflowY:"auto"}}>
                  {clients.filter(c=>c.name?.includes(cashierSearch)||c.phone?.includes(cashierSearch)).slice(0,6).map(c=>(
 <div key={c.id} onClick={()=>{setCashierClient(c);setCashierSearch(c.name);}} className="client-row" style={{padding:"9px 12px",borderBottom:"1px solid #FCEEF3",cursor:"pointer"}}>
 <p style={{fontSize:11,fontWeight:600,color:"#2A2A2A"}}>{c.name}</p><p style={{fontSize:9,color:"#8A8088"}}>{c.phone||"אין טלפון"}</p>
 </div>
                  ))}
 </div>
              )}
 </div>
            {/* ITEMS */}
 <div style={{marginBottom:10}}>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
 <p style={{fontSize:10,color:"#8A8088",fontWeight:600}}>פריטים</p>
 <select onChange={e=>{const svc=activeServices.find(s=>s.name===e.target.value);if(svc){setCashierItems(prev=>[...prev,{id:Date.now(),name:svc.name,price:svc.price,qty:1,color:svc.color}]);}e.target.value="";}} style={{border:"1px solid #EFE7EB",borderRadius:10,padding:"5px 9px",fontSize:10,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3",color:"#C77B92"}}><option value="">+ הוסיפי שירות</option>{activeServices.map(s=><option key={s.name} value={s.name}>{s.name} — ₪{s.price}</option>)}</select>
 </div>
              {cashierItems.length===0?<p style={{fontSize:10,color:"#C9B8C2",padding:"8px 0"}}>לא נבחרו פריטים</p>
                :cashierItems.map(item=>(
 <div key={item.id} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 9px",background:"#FCEEF3",borderRadius:10,marginBottom:4}}>
 <span style={{width:8,height:8,borderRadius:"50%",background:item.color||"#E8B5C4",flexShrink:0}}/>
 <p style={{flex:1,fontSize:11,fontWeight:600,color:"#2A2A2A"}}>{item.name}</p>
 <button onClick={()=>setCashierItems(prev=>prev.map(i=>i.id===item.id?{...i,qty:Math.max(1,i.qty-1)}:i))} className="icon-btn" style={{width:22,height:22,fontSize:11}}>−</button>
 <span style={{fontSize:11,minWidth:16,textAlign:"center"}}>{item.qty}</span>
 <button onClick={()=>setCashierItems(prev=>prev.map(i=>i.id===item.id?{...i,qty:i.qty+1}:i))} className="icon-btn" style={{width:22,height:22,fontSize:11}}>+</button>
 <input type="number" value={item.price} onChange={e=>setCashierItems(prev=>prev.map(i=>i.id===item.id?{...i,price:Number(e.target.value)}:i))} style={{width:54,border:"1px solid #EFE7EB",borderRadius:8,padding:"4px 6px",fontSize:10,fontFamily:"inherit",outline:"none",textAlign:"center",background:"#fff"}}/>
 <button onClick={()=>setCashierItems(prev=>prev.filter(i=>i.id!==item.id))} style={{background:"none",border:"none",color:"#F44336",fontSize:13,cursor:"pointer"}}>✕</button>
 </div>
                ))}
 </div>
            {/* DISCOUNT */}
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
 <p style={{fontSize:11,color:"#8A8088",flex:1}}>הנחה (₪)</p>
 <input type="number" value={cashierDiscount||""} onChange={e=>setCashierDiscount(e.target.value)} placeholder="0" style={{width:80,border:"1px solid #EFE7EB",borderRadius:10,padding:"7px 10px",fontSize:11,fontFamily:"inherit",outline:"none",textAlign:"center",background:"#FCEEF3"}}/>
 </div>
            {/* PAYMENT METHOD */}
 <p style={{fontSize:10,color:"#8A8088",fontWeight:600,marginBottom:5}}>אמצעי תשלום</p>
 <div style={{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"}}>
              {PAYMENT_METHODS.map(pm=>(
 <button key={pm.key} onClick={()=>setPaymentMethod(pm.key)} style={{flex:"1 0 28%",padding:"9px 4px",border:"1px solid",borderColor:paymentMethod===pm.key?pm.color:"#EFE7EB",borderRadius:12,background:paymentMethod===pm.key?pm.color:"#FCEEF3",color:paymentMethod===pm.key?"#fff":"#6B6B6B",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{pm.icon} {pm.key}</button>
              ))}
 </div>
            {/* BIT/PAYBOX/TRANSFER PAYMENT REQUEST BOX */}
            {["ביט","פייבוקס","העברה"].includes(paymentMethod)&&cashierClient?.phone&&(
 <div style={{background:"#F3E5F5",borderRadius:12,padding:"10px 12px",marginBottom:10}}>
 <p style={{fontSize:10,color:"#7B1FA2",fontWeight:600,marginBottom:6}}>שלחי בקשת תשלום ב-{paymentMethod}</p>
 <a href={waPayment(cashierClient.phone,cashierClient.name,cashierTotal,cashierItems.map(i=>i.name).join(", "),paymentMethod,settings.business_phone)} target="_blank" rel="noreferrer"
                  className="wa-btn" style={{display:"inline-flex",padding:"7px 12px",fontSize:10}}>שלחי בקשת תשלום</a>
 </div>
            )}
            {/* NOTE */}
 <textarea value={cashierNote} onChange={e=>setCashierNote(e.target.value)} placeholder="הערה לקבלה" rows={2} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3",resize:"none",marginBottom:10}}/>
            {/* TOTAL */}
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",background:"linear-gradient(90deg,#FBEEF2,#F6D9E2)",borderRadius:14,marginBottom:14}}>
 <span style={{fontSize:12,color:"#8A8088",fontWeight:600}}>סה״כ לתשלום</span>
 <span className="serif" style={{fontSize:26,fontWeight:700,color:"#C77B92"}}>₪{cashierTotal.toLocaleString()}</span>
 </div>
            {paymentMethod==="אשראי"&&(
              <button onClick={handleCreditPayment} disabled={isBusy("creditPayment")} className="primary-btn" style={{width:"100%",padding:"13px 0",background:"linear-gradient(90deg,#9E6178,#C77B92)",color:"#fff",fontSize:13,marginBottom:8}}>{isBusy("creditPayment")?"פותח תשלום...":"💳 גבי באשראי דרך Grow"}</button>
            )}
 <div style={{display:"flex",gap:6}}>
 <button onClick={()=>setShowCashier(false)} className="primary-btn" style={{flex:1,padding:"12px 0",border:"1px solid #EFE7EB",background:"#fff",fontSize:12,color:"#8A8088"}}>ביטול</button>
 <button onClick={handleSaveReceipt} disabled={isBusy("saveReceipt")} className="primary-btn" style={{flex:2,padding:"12px 0",background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",fontSize:13}}>{isBusy("saveReceipt")?"שומר...":"צרי קבלה ידנית ✓"}</button>
 </div>
 </div>
 </div>
      )}

      {/* RECEIPT MODAL */}
      {showReceipt&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1100,padding:14}} onClick={()=>setShowReceipt(null)}>
 <div onClick={e=>e.stopPropagation()} className="modal-card" style={{background:"#fff",borderRadius:22,padding:0,width:360,maxWidth:"100%",maxHeight:"92vh",overflowY:"auto",overflow:"hidden"}}>
 <div className="receipt-print" style={{padding:24}}>
 <div style={{textAlign:"center",borderBottom:"2px dashed #EFE7EB",paddingBottom:14,marginBottom:14}}>
 <p className="serif" style={{fontSize:22,fontWeight:600,color:"#2A2A2A"}}>{settings.business_name}</p>
 <p style={{fontSize:10,color:"#8A8088",marginTop:2}}>קבלה</p>
                {settings.business_phone&&<p style={{fontSize:9,color:"#A89AA2"}}>{settings.business_phone}</p>}
 </div>
 <div style={{fontSize:11,color:"#2A2A2A",lineHeight:1.9}}>
 <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"#8A8088"}}>לקוחה:</span><span style={{fontWeight:600}}>{showReceipt.client_name}</span></div>
 <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"#8A8088"}}>תאריך:</span><span>{showReceipt.created_at?.slice(0,10)}</span></div>
 <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"#8A8088"}}>שירות:</span><span style={{fontWeight:600}}>{showReceipt.service}</span></div>
 <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"#8A8088"}}>אמצעי תשלום:</span><span>{showReceipt.payment_method}</span></div>
                {showReceipt.discount>0&&<div style={{display:"flex",justifyContent:"space-between",color:"#C77B92"}}><span>הנחה:</span><span>−₪{showReceipt.discount}</span></div>}
                {showReceipt.note&&<div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"#8A8088"}}>הערה:</span><span>{showReceipt.note}</span></div>}
 </div>
 <div style={{borderTop:"2px dashed #EFE7EB",marginTop:14,paddingTop:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
 <span style={{fontSize:13,fontWeight:600,color:"#8A8088"}}>סה״כ:</span>
 <span className="serif" style={{fontSize:26,fontWeight:700,color:"#C77B92"}}>₪{showReceipt.amount}</span>
 </div>
 <p style={{textAlign:"center",fontSize:9,color:"#C9B8C2",marginTop:14}}>תודה ונתראה בקרוב ✦</p>
 </div>
 <div style={{display:"flex",gap:6,padding:"0 24px 24px"}}>
 <button onClick={()=>window.print()} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid #EFE7EB",background:"#fff",fontSize:11,color:"#6B6B6B"}}>הדפסה</button>
              {(()=>{const cl=clients.find(c=>String(c.id)===String(showReceipt.client_id));return cl?.phone?(
 <a href={waMsg(cl.phone,`שלום ${showReceipt.client_name}! ✦\nקבלה מ${settings.business_name}:\n${showReceipt.service}\nסכום: ₪${showReceipt.amount}\nתודה! `)} target="_blank" rel="noreferrer" className="primary-btn" style={{flex:1,padding:"11px 0",background:"#25D366",color:"#fff",fontSize:11,textAlign:"center",textDecoration:"none"}}>שליחה</a>
              ):null;})()}
 <button onClick={()=>setShowReceipt(null)} className="primary-btn" style={{flex:1,padding:"11px 0",background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",fontSize:11}}>סגירה</button>
 </div>
 </div>
 </div>
      )}

      {/* PACKAGE MODAL */}
      {showPackageModal&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:14}} onClick={()=>setShowPackageModal(false)}>
 <div onClick={e=>e.stopPropagation()} className="modal-card" style={{background:"#fff",borderRadius:22,padding:24,width:340,maxWidth:"100%"}}>
 <h3 className="serif" style={{fontSize:20,fontWeight:600,color:"#2A2A2A",marginBottom:14}}>חבילת טיפולים חדשה</h3>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
 <select value={newPackage.client_id} onChange={e=>{const c=clients.find(cl=>String(cl.id)===e.target.value);setNewPackage({...newPackage,client_id:e.target.value,client_name:c?.name||""});}} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3"}}><option value="">— בחרי לקוחה —</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
 <select value={newPackage.service} onChange={e=>setNewPackage({...newPackage,service:e.target.value})} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3"}}><option value="">— בחרי שירות —</option>{activeServices.map(s=><option key={s.name}>{s.name}</option>)}</select>
 <div style={{display:"flex",gap:6}}>
 <div style={{flex:1}}><p style={{fontSize:9,color:"#8A8088",marginBottom:3}}>מספר טיפולים</p><input type="number" value={newPackage.total_sessions} onChange={e=>setNewPackage({...newPackage,total_sessions:Number(e.target.value)})} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none",textAlign:"center",background:"#FCEEF3"}}/></div>
 <div style={{flex:1}}><p style={{fontSize:9,color:"#8A8088",marginBottom:3}}>מחיר חבילה ₪</p><input type="number" value={newPackage.price} onChange={e=>setNewPackage({...newPackage,price:Number(e.target.value)})} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none",textAlign:"center",background:"#FCEEF3"}}/></div>
 </div>
 </div>
 <div style={{display:"flex",gap:6,marginTop:16}}>
 <button onClick={()=>setShowPackageModal(false)} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid #EFE7EB",background:"#fff",fontSize:12,color:"#8A8088"}}>ביטול</button>
 <button onClick={handleSavePackage} className="primary-btn" style={{flex:2,padding:"11px 0",background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",fontSize:12}}>שמירה ✓</button>
 </div>
 </div>
 </div>
      )}

      {/* WAITLIST MODAL */}
      {showWaitlistModal&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:14}} onClick={()=>setShowWaitlistModal(false)}>
 <div onClick={e=>e.stopPropagation()} className="modal-card" style={{background:"#fff",borderRadius:22,padding:24,width:340,maxWidth:"100%"}}>
 <h3 className="serif" style={{fontSize:20,fontWeight:600,color:"#2A2A2A",marginBottom:14}}>הוספה לרשימת המתנה</h3>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
 <select value={newWaitlist.client_id} onChange={e=>{const c=clients.find(cl=>String(cl.id)===e.target.value);setNewWaitlist({...newWaitlist,client_id:e.target.value,client_name:c?.name||"",phone:c?.phone||""});}} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3"}}><option value="">— בחרי לקוחה —</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
 <select value={newWaitlist.service} onChange={e=>setNewWaitlist({...newWaitlist,service:e.target.value})} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3"}}><option value="">— בחרי שירות —</option>{activeServices.map(s=><option key={s.name}>{s.name}</option>)}</select>
 <input type="date" value={newWaitlist.preferred_date} onChange={e=>setNewWaitlist({...newWaitlist,preferred_date:e.target.value})} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",background:"#FCEEF3"}}/>
 <textarea value={newWaitlist.notes} onChange={e=>setNewWaitlist({...newWaitlist,notes:e.target.value})} placeholder="הערות" rows={2} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3",resize:"none"}}/>
 </div>
 <div style={{display:"flex",gap:6,marginTop:16}}>
 <button onClick={()=>setShowWaitlistModal(false)} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid #EFE7EB",background:"#fff",fontSize:12,color:"#8A8088"}}>ביטול</button>
 <button onClick={handleSaveWaitlist} className="primary-btn" style={{flex:2,padding:"11px 0",background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",fontSize:12}}>שמירה ✓</button>
 </div>
 </div>
 </div>
      )}

      {/* SETTINGS MODAL */}
      {showSettings&&editSettings&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:14}} onClick={()=>{setShowSettings(false);setEditSettings(null);}}>
 <div onClick={e=>e.stopPropagation()} className="modal-card" style={{background:"#fff",borderRadius:22,padding:0,width:440,maxWidth:"100%",maxHeight:"92vh",overflow:"hidden",display:"flex",flexDirection:"column"}}>
 <div style={{padding:"20px 24px 0"}}>
 <h3 className="serif" style={{fontSize:20,fontWeight:600,color:"#2A2A2A",marginBottom:14}}>⚙ הגדרות</h3>
 <div style={{display:"flex",gap:4,borderBottom:"1px solid #EFE7EB"}}>
                {[{k:"general",l:"כללי"},{k:"services",l:"שירותים"},{k:"hours",l:"שעות"},{k:"payment",l:"תשלום"}].map(t=>(
 <button key={t.k} onClick={()=>setSettingsTab(t.k)} style={{background:"none",border:"none",padding:"9px 12px",fontSize:11.5,fontWeight:settingsTab===t.k?600:400,color:settingsTab===t.k?"#2A2A2A":"#8A8088",borderBottom:settingsTab===t.k?"2.5px solid #C77B92":"2.5px solid transparent",cursor:"pointer",fontFamily:"inherit"}}>{t.l}</button>
                ))}
 </div>
 </div>
 <div style={{padding:"16px 24px",overflowY:"auto",flex:1}}>
              {settingsTab==="general"&&(
 <div style={{display:"flex",flexDirection:"column",gap:9}}>
 <div><p style={{fontSize:9,color:"#8A8088",marginBottom:3}}>שם העסק</p><input value={editSettings.business_name||""} onChange={e=>setEditSettings({...editSettings,business_name:e.target.value})} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3"}}/></div>
 <div><p style={{fontSize:9,color:"#8A8088",marginBottom:3}}>שם המטפלת</p><input value={editSettings.therapist_name||""} onChange={e=>setEditSettings({...editSettings,therapist_name:e.target.value})} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3"}}/></div>
 <div><p style={{fontSize:9,color:"#8A8088",marginBottom:3}}>צבע ראשי</p><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{["#C77B92","#D89AAE","#E8B5C4","#A86C82","#B85C7E","#9E6178","#CBA0B4"].map(col=><button key={col} onClick={()=>setEditSettings({...editSettings,primary_color:col})} style={{width:32,height:32,borderRadius:"50%",background:col,border:editSettings.primary_color===col?"3px solid #2A2A2A":"2px solid #EFE7EB",cursor:"pointer"}}/>)}</div></div>
 </div>
              )}
              {settingsTab==="services"&&(
 <div>
                  {services.map((svc,idx)=>(
 <div key={idx} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",background:"#FCEEF3",borderRadius:12,marginBottom:5}}>
 <span style={{width:10,height:10,borderRadius:"50%",background:svc.color||"#E8B5C4",flexShrink:0}}/>
 <input value={svc.name} onChange={e=>setServices(prev=>prev.map((s,i)=>i===idx?{...s,name:e.target.value}:s))} style={{flex:1,minWidth:0,border:"none",background:"transparent",fontSize:11,fontFamily:"inherit",outline:"none",fontWeight:600,color:"#2A2A2A"}}/>
 <input type="number" value={svc.price} onChange={e=>setServices(prev=>prev.map((s,i)=>i===idx?{...s,price:Number(e.target.value)}:s))} style={{width:54,border:"1px solid #EFE7EB",borderRadius:8,padding:"4px 6px",fontSize:10,fontFamily:"inherit",outline:"none",textAlign:"center",background:"#fff"}}/>
 <input type="number" value={svc.duration} onChange={e=>setServices(prev=>prev.map((s,i)=>i===idx?{...s,duration:Number(e.target.value)}:s))} style={{width:44,border:"1px solid #EFE7EB",borderRadius:8,padding:"4px 6px",fontSize:10,fontFamily:"inherit",outline:"none",textAlign:"center",background:"#fff"}}/>
 <button onClick={()=>handleSaveService(svc,idx)} className="icon-btn" style={{width:26,height:26,fontSize:11}}>✓</button>
 </div>
                  ))}
                  {showNewService?(
 <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",background:"#FBEEF2",borderRadius:12,marginTop:6}}>
 <input value={newService.name} onChange={e=>setNewService({...newService,name:e.target.value})} placeholder="שם שירות" style={{flex:1,minWidth:0,border:"1px solid #EFE7EB",borderRadius:8,padding:"4px 8px",fontSize:11,fontFamily:"inherit",outline:"none",background:"#fff"}}/>
 <input type="number" value={newService.price} onChange={e=>setNewService({...newService,price:Number(e.target.value)})} placeholder="₪" style={{width:54,border:"1px solid #EFE7EB",borderRadius:8,padding:"4px 6px",fontSize:10,fontFamily:"inherit",outline:"none",textAlign:"center",background:"#fff"}}/>
 <button onClick={handleAddService} className="icon-btn" style={{width:26,height:26,fontSize:11}}>✓</button>
 </div>
                  ):<button onClick={()=>setShowNewService(true)} style={{background:"#FCEEF3",border:"1px dashed #C77B92",borderRadius:12,padding:"8px 0",width:"100%",fontSize:11,color:"#C77B92",cursor:"pointer",fontFamily:"inherit",marginTop:6}}>+ הוסיפי שירות</button>}
 </div>
              )}
              {settingsTab==="hours"&&(
 <div style={{display:"flex",flexDirection:"column",gap:9}}>
 <div style={{display:"flex",gap:6}}>
 <div style={{flex:1}}><p style={{fontSize:9,color:"#8A8088",marginBottom:3}}>שעת פתיחה</p><select value={editSettings.working_hours_start} onChange={e=>setEditSettings({...editSettings,working_hours_start:Number(e.target.value)})} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3"}}>{HOURS_ALL.map((h,i)=><option key={h} value={7+i}>{h}</option>)}</select></div>
 <div style={{flex:1}}><p style={{fontSize:9,color:"#8A8088",marginBottom:3}}>שעת סגירה</p><select value={editSettings.working_hours_end} onChange={e=>setEditSettings({...editSettings,working_hours_end:Number(e.target.value)})} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3"}}>{HOURS_ALL.map((h,i)=><option key={h} value={7+i}>{h}</option>)}</select></div>
 </div>
 </div>
              )}
              {settingsTab==="payment"&&(
 <div style={{display:"flex",flexDirection:"column",gap:9}}>
 <div><p style={{fontSize:9,color:"#8A8088",marginBottom:3}}>טלפון לביט / בקשות תשלום</p><input value={editSettings.business_phone||""} onChange={e=>setEditSettings({...editSettings,business_phone:e.target.value})} placeholder="050-0000000" style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3"}}/></div>
 <p style={{fontSize:10,color:"#A89AA2",lineHeight:1.5}}>המספר הזה ישמש לבקשות תשלום ב-ביט שנשלחות ללקוחות </p>
 </div>
              )}
 </div>
 <div style={{display:"flex",gap:6,padding:"14px 24px",borderTop:"1px solid #EFE7EB"}}>
 <button onClick={()=>{setShowSettings(false);setEditSettings(null);}} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid #EFE7EB",background:"#fff",fontSize:12,color:"#8A8088"}}>סגירה</button>
 <button onClick={handleSaveSettings} disabled={isBusy("saveSettings")} className="primary-btn" style={{flex:2,padding:"11px 0",background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",fontSize:12}}>{isBusy("saveSettings")?"שומר...":"שמירה ✓"}</button>
 </div>
 </div>
 </div>
      )}

      {/* CLIENT PROFILE DRAWER */}
      {selectedClient&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",justifyContent:"flex-start",zIndex:1200}} onClick={()=>setSelectedClient(null)}>
 <div onClick={e=>e.stopPropagation()} className="client-drawer" style={{background:"#fff",width:440,maxWidth:"100%",height:"100%",overflowY:"auto",boxShadow:"4px 0 30px rgba(0,0,0,0.12)"}}>
            {(()=>{
              const c=selectedClient;
              const appts=getClientAppts(c.id).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
              const cReceipts=getClientReceipts(c.id).sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||""));
              const cForms=getClientForms(c.id);
              const cPackages=getClientPackages(c.id);
              const total=getClientTotal(c.id);
              const days=getDaysSince(c.id);
              const statusColor=STATUS_COLORS[c.status]||"#E8B5C4";
              return(<>
 <div style={{background:"linear-gradient(135deg,#E8B5C4 0%,#C77B92 100%)",padding:"22px 22px 18px",color:"#fff",position:"relative"}}>
 <button onClick={()=>setSelectedClient(null)} style={{position:"absolute",top:14,left:14,background:"rgba(255,255,255,0.25)",border:"none",borderRadius:"50%",width:30,height:30,color:"#fff",fontSize:14,cursor:"pointer"}}>✕</button>
 <div style={{display:"flex",alignItems:"center",gap:14}}>
 <div style={{width:60,height:60,borderRadius:"50%",background:c.images?.[0]?"transparent":"rgba(255,255,255,0.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,fontWeight:700,overflow:"hidden",flexShrink:0}}>{c.images?.[0]?<img alt="" src={c.images[0]} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:c.name[0]}</div>
 <div style={{flex:1}}>
 <h3 className="serif" style={{fontSize:23,fontWeight:600}}>{c.name}</h3>
 <p style={{fontSize:11,opacity:0.9}}>{c.phone||"אין טלפון"}</p>
 <div style={{display:"flex",gap:5,marginTop:5,flexWrap:"wrap"}}>
 <span style={{fontSize:8,background:"rgba(255,255,255,0.25)",padding:"2px 8px",borderRadius:20,fontWeight:600}}>{STATUS_LABELS[c.status]||"פעילה"}</span>
                        {c.skinType&&<span style={{fontSize:8,background:"rgba(255,255,255,0.25)",padding:"2px 8px",borderRadius:20}}>{c.skinType}</span>}
                        {total>0&&<span style={{fontSize:8,background:"rgba(255,255,255,0.25)",padding:"2px 8px",borderRadius:20,fontWeight:700}}>₪{total.toLocaleString()}</span>}
 </div>
 </div>
 </div>
 <div style={{display:"flex",gap:6,marginTop:14}}>
                    {c.phone&&<a href={waLink(c.phone)} target="_blank" rel="noreferrer" style={{flex:1,background:"#fff",color:"#C77B92",borderRadius:20,padding:"8px 0",fontSize:11,fontWeight:700,textAlign:"center",textDecoration:"none"}}>וואטסאפ</a>}
 <button onClick={()=>openEditClient(c)} style={{flex:1,background:"rgba(255,255,255,0.25)",color:"#fff",border:"none",borderRadius:20,padding:"8px 0",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✎ עריכה</button>
 </div>
 </div>

                {/* INSIGHTS */}
                {(()=>{
                  const insights=[];
                  if(days>90)insights.push({icon:"",text:`לא ביקרה ${days} ימים — שווה הודעת התחדשות`,color:"#5580C4"});
                  if(c.allergies)insights.push({icon:"",text:`אלרגיות: ${c.allergies}`,color:"#FF9800"});
                  if(c.medical)insights.push({icon:"",text:`רפואי: ${c.medical}`,color:"#5580C4"});
                  if(total>2000)insights.push({icon:"",text:`לקוחה מובילה — ₪${total.toLocaleString()} סה״כ`,color:"#C77B92"});
                  if(cPackages.length>0)insights.push({icon:"",text:`${cPackages.length} חבילות פעילות`,color:"#7B1FA2"});
                  if(insights.length===0)return null;
                  return(
 <div style={{padding:"14px 22px 0"}}>
                      {insights.map((ins,i)=>(
 <div key={i} style={{display:"flex",alignItems:"center",gap:9,padding:"9px 12px",background:"#FCEEF3",borderRadius:12,marginBottom:6,borderRight:`3px solid ${ins.color}`}}>
 <span style={{fontSize:14}}>{ins.icon}</span>
 <p style={{fontSize:10.5,color:"#2A2A2A",fontWeight:500}}>{ins.text}</p>
 </div>
                      ))}
 </div>
                  );
                })()}

                {/* TABS */}
 <div style={{display:"flex",gap:3,padding:"14px 22px 0",borderBottom:"1px solid #EFE7EB",overflowX:"auto"}}>
                  {[{k:"info",l:"פרטים"},{k:"history",l:`היסטוריה (${appts.length})`},{k:"receipts",l:`קבלות (${cReceipts.length})`},{k:"packages",l:`חבילות (${cPackages.length})`},{k:"forms",l:`טפסים (${cForms.length})`},{k:"images",l:`תמונות (${c.images?.length||0})`}].map(t=>(
 <button key={t.k} onClick={()=>setClientTab(t.k)} style={{background:"none",border:"none",padding:"8px 9px",fontSize:10.5,fontWeight:clientTab===t.k?600:400,color:clientTab===t.k?"#2A2A2A":"#8A8088",borderBottom:clientTab===t.k?"2.5px solid #C77B92":"2.5px solid transparent",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{t.l}</button>
                  ))}
 </div>

 <div style={{padding:"16px 22px"}}>
                  {clientTab==="info"&&(
 <div style={{display:"flex",flexDirection:"column",gap:9,fontSize:11.5}}>
                      {c.birthday&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F7F0F3"}}><span style={{color:"#8A8088"}}>יום הולדת</span><span style={{fontWeight:600}}>{c.birthday}</span></div>}
                      {c.skinType&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F7F0F3"}}><span style={{color:"#8A8088"}}>סוג עור</span><span style={{fontWeight:600}}>{c.skinType}</span></div>}
                      {c.allergies&&<div style={{padding:"8px 10px",background:"#FFFAF7",borderRadius:10,border:"1px solid #FFDAC1"}}><p style={{color:"#FF9800",fontWeight:700,fontSize:9,marginBottom:2}}>אלרגיות</p><p>{c.allergies}</p></div>}
                      {c.medical&&<div style={{padding:"8px 10px",background:"#F7FAFF",borderRadius:10,border:"1px solid #A7C4F4"}}><p style={{color:"#5580C4",fontWeight:700,fontSize:9,marginBottom:2}}>רפואי</p><p>{c.medical}</p></div>}
                      {c.notes&&<div style={{padding:"8px 10px",background:"#FCEEF3",borderRadius:10}}><p style={{color:"#8A8088",fontWeight:700,fontSize:9,marginBottom:2}}>הערות</p><p>{c.notes}</p></div>}
 </div>
                  )}
                  {clientTab==="history"&&(
                    appts.length===0?<p style={{fontSize:11,color:"#C9B8C2"}}>אין היסטוריית תורים</p>
                    :appts.map(a=>(
 <div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:"1px solid #F7F0F3"}}>
 <span style={{width:8,height:8,borderRadius:"50%",background:a.color||"#E8B5C4",flexShrink:0}}/>
 <div style={{flex:1}}><p style={{fontSize:11,fontWeight:600,color:"#2A2A2A"}}>{a.service}</p><p style={{fontSize:9,color:"#8A8088"}}>{a.date} · {a.hour}:00{a.price?` · ₪${a.price}`:""}</p></div>
                        {a.confirmation_status==="confirmed"&&<span style={{fontSize:8,color:"#4CAF50"}}>✓</span>}
 </div>
                    ))
                  )}
                  {clientTab==="receipts"&&(
                    cReceipts.length===0?<p style={{fontSize:11,color:"#C9B8C2"}}>אין קבלות</p>
                    :cReceipts.map(r=>(
 <div key={r.id} onClick={()=>setShowReceipt(r)} className="client-row" style={{display:"flex",alignItems:"center",gap:9,padding:"9px 10px",background:"#FCEEF3",borderRadius:10,marginBottom:5,cursor:"pointer"}}>
 <span style={{fontSize:13}}>{PAYMENT_METHODS.find(p=>p.key===r.payment_method)?.icon||""}</span>
 <div style={{flex:1}}><p style={{fontSize:10.5,fontWeight:600,color:"#2A2A2A"}}>{r.service}</p><p style={{fontSize:8.5,color:"#8A8088"}}>{r.created_at?.slice(0,10)} · {r.payment_method}</p></div>
 <span className="serif" style={{fontSize:13,fontWeight:600,color:"#C77B92"}}>₪{r.amount}</span>
 </div>
                    ))
                  )}
                  {clientTab==="packages"&&(
                    cPackages.length===0?<p style={{fontSize:11,color:"#C9B8C2"}}>אין חבילות פעילות</p>
                    :cPackages.map(pkg=>(
 <div key={pkg.id} style={{background:"#FCEEF3",borderRadius:12,padding:"11px 12px",marginBottom:7}}>
 <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><p style={{fontSize:11,fontWeight:700,color:"#2A2A2A"}}>{pkg.service}</p><button onClick={()=>handleUsePackageSession(pkg)} style={{background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",border:"none",borderRadius:14,padding:"3px 9px",fontSize:9,cursor:"pointer",fontFamily:"inherit"}}>✓ השתמשי</button></div>
 <div style={{display:"flex",gap:2}}>{Array.from({length:Number(pkg.total_sessions)},(_,i)=><div key={i} style={{flex:1,height:6,borderRadius:3,background:i<Number(pkg.used_sessions)?"#C77B92":"#F0E7EC"}}/>)}</div>
 <p style={{fontSize:8.5,color:"#8A8088",marginTop:3}}>{pkg.used_sessions}/{pkg.total_sessions}</p>
 </div>
                    ))
                  )}
                  {clientTab==="forms"&&(
 <div>
 <p style={{fontSize:9,color:"#8A8088",marginBottom:6}}>שלחי טופס לחתימה דיגיטלית</p>
 <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:12}}>
                        {FORM_TYPES.map(ft=>(
 <button key={ft.key} onClick={()=>handleSendForm(c,ft.key)} style={{background:"#FCEEF3",border:"1px solid #EFE7EB",borderRadius:10,padding:"8px 11px",fontSize:10.5,color:"#2A2A2A",cursor:"pointer",fontFamily:"inherit",textAlign:"right"}}>{ft.label}</button>
                        ))}
 </div>
                      {cForms.length>0&&<>
 <p style={{fontSize:9,color:"#8A8088",marginBottom:5}}>טפסים קיימים</p>
                        {cForms.map(f=>(
 <div key={f.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:f.status==="signed"?"#F3FFF6":"#FFFAF7",borderRadius:10,marginBottom:4}}>
 <span style={{fontSize:12}}>{f.status==="signed"?"✓":"⏳"}</span>
 <p style={{flex:1,fontSize:10,color:"#2A2A2A"}}>{FORM_TYPES.find(ft=>ft.key===f.form_type)?.label||f.form_type}</p>
 <span style={{fontSize:8,color:f.status==="signed"?"#4CAF50":"#FF9800"}}>{f.status==="signed"?"נחתם":"ממתין"}</span>
 </div>
                        ))}
 </>}
 </div>
                  )}
                  {clientTab==="images"&&(
 <div>
 <label style={{display:"block",background:"#FCEEF3",border:"1px dashed #C77B92",borderRadius:12,padding:"14px 0",textAlign:"center",fontSize:11,color:"#C77B92",cursor:"pointer",marginBottom:10}}>
                        {uploading?"מעלה...":"העלי תמונה"}
 <input type="file" accept="image/*" onChange={e=>handleUploadImage(e,c)} style={{display:"none"}} disabled={uploading}/>
 </label>
 <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                        {(c.images||[]).map((img,i)=>(
 <div key={i} style={{position:"relative",paddingBottom:"100%",borderRadius:10,overflow:"hidden",background:"#FCEEF3"}}>
 <img alt="" src={img} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>
 <button onClick={()=>handleDeleteImage(c,img)} style={{position:"absolute",top:3,left:3,background:"rgba(0,0,0,0.45)",border:"none",borderRadius:"50%",width:20,height:20,color:"#fff",fontSize:9,cursor:"pointer"}}>✕</button>
 </div>
                        ))}
 </div>
                      {(!c.images||c.images.length===0)&&<p style={{fontSize:10,color:"#C9B8C2",textAlign:"center",marginTop:8}}>אין תמונות עדיין</p>}
 </div>
                  )}
 </div>
 </>);
            })()}
 </div>
 </div>
      )}

      {/* LEAD PROFILE DRAWER */}
      {selectedLead&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",justifyContent:"flex-start",zIndex:1200}} onClick={()=>setSelectedLead(null)}>
 <div onClick={e=>e.stopPropagation()} className="lead-drawer" style={{background:"#fff",width:400,maxWidth:"100%",height:"100%",overflowY:"auto",boxShadow:"4px 0 30px rgba(0,0,0,0.12)"}}>
            {(()=>{
              const l=selectedLead;
              const st=LEAD_STATUSES[l.status]||LEAD_STATUSES.new;
              return(<>
 <div style={{background:"linear-gradient(135deg,#D89AAE 0%,#C77B92 100%)",padding:"22px 22px 18px",color:"#fff",position:"relative"}}>
 <button onClick={()=>setSelectedLead(null)} style={{position:"absolute",top:14,left:14,background:"rgba(255,255,255,0.25)",border:"none",borderRadius:"50%",width:30,height:30,color:"#fff",fontSize:14,cursor:"pointer"}}>✕</button>
 <div style={{display:"flex",alignItems:"center",gap:13}}>
 <div style={{width:54,height:54,borderRadius:"50%",background:"rgba(255,255,255,0.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{SOURCE_ICONS[l.source]||""}</div>
 <div style={{flex:1}}>
 <h3 className="serif" style={{fontSize:21,fontWeight:600}}>{l.name}</h3>
 <p style={{fontSize:11,opacity:0.9}}>{l.phone||"אין טלפון"}</p>
 <span style={{fontSize:8,background:"rgba(255,255,255,0.25)",padding:"2px 8px",borderRadius:20,marginTop:4,display:"inline-block"}}>{SOURCE_ICONS[l.source]} {l.source}</span>
 </div>
 </div>
 <div style={{display:"flex",gap:6,marginTop:14}}>
                    {l.phone&&<a href={waLink(l.phone)} target="_blank" rel="noreferrer" style={{flex:1,background:"#fff",color:"#C77B92",borderRadius:20,padding:"8px 0",fontSize:11,fontWeight:700,textAlign:"center",textDecoration:"none"}}>וואטסאפ</a>}
 <button onClick={()=>openEditLead(l)} style={{flex:1,background:"rgba(255,255,255,0.25)",color:"#fff",border:"none",borderRadius:20,padding:"8px 0",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✎ עריכה</button>
 </div>
 </div>
 <div style={{padding:"16px 22px"}}>
 <p style={{fontSize:9,color:"#8A8088",marginBottom:5,fontWeight:600}}>סטטוס</p>
 <div style={{display:"flex",gap:3,flexWrap:"wrap",marginBottom:16}}>
                    {Object.entries(LEAD_STATUSES).map(([key,s])=>(
 <button key={key} onClick={()=>handleUpdateLeadStatus(l,key)} style={{padding:"6px 10px",border:"1px solid",borderColor:l.status===key?s.color:"#EFE7EB",borderRadius:20,background:l.status===key?s.bg:"#FCEEF3",color:l.status===key?s.color:"#6B6B6B",fontSize:9.5,cursor:"pointer",fontFamily:"inherit",fontWeight:l.status===key?700:400}}>{s.label}</button>
                    ))}
 </div>
                  {l.service_interest&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F7F0F3",fontSize:11.5}}><span style={{color:"#8A8088"}}>תחום עניין</span><span style={{fontWeight:600}}>{l.service_interest}</span></div>}
                  {l.created_at&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F7F0F3",fontSize:11.5}}><span style={{color:"#8A8088"}}>נוצר</span><span>{l.created_at.slice(0,10)}</span></div>}
 <div style={{marginTop:12}}>
 <p style={{fontSize:9,color:"#8A8088",marginBottom:4,fontWeight:600}}>תזכורת מעקב</p>
 <input type="date" value={l.reminder_date||""} onChange={e=>handleSetReminder(l,e.target.value)} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",background:"#FCEEF3"}}/>
 </div>
                  {l.notes&&<div style={{marginTop:12,padding:"9px 11px",background:"#FCEEF3",borderRadius:10}}><p style={{color:"#8A8088",fontWeight:700,fontSize:9,marginBottom:2}}>הערות</p><p style={{fontSize:11}}>{l.notes}</p></div>}
                  {l.status!=="closed"&&l.status!=="lost"&&(
 <button onClick={()=>handleConvertLead(l)} style={{width:"100%",marginTop:16,background:"#4CAF50",color:"#fff",border:"none",borderRadius:24,padding:"12px 0",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✓ המירי ללקוחה רשומה</button>
                  )}
 </div>
 </>);
            })()}
 </div>
 </div>
      )}

 </div>
  );
}
