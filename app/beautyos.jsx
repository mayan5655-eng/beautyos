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
  const [showImportModal,   setShowImportModal]    = useState(false);
  const [importText,        setImportText]         = useState("");
  const [importing,         setImporting]          = useState(false);
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
  // AI content generator (posts)
  const [postGoal,       setPostGoal]       = useState("");
  const [postVariations, setPostVariations] = useState(null);
  const [postStrategy,   setPostStrategy]   = useState(null);
  const [postLoading,    setPostLoading]    = useState(false);
  const [postError,      setPostError]      = useState(null);
  const [groups,         setGroups]         = useState(null);
  const [groupsLoading,  setGroupsLoading]  = useState(false);
  const [groupsError,    setGroupsError]    = useState(null);
  const [savedCampaigns, setSavedCampaigns] = useState(null);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [aiPostsView,    setAiPostsView]    = useState("create"); // create | saved
  const [marketingView,  setMarketingView]  = useState("campaigns"); // campaigns | ai
  const [activeTab,         setActiveTab]          = useState("dashboard");
  const [clientTab,         setClientTab]          = useState("info");
  const [scanLoading,       setScanLoading]        = useState(false);
  const [scanReport,        setScanReport]         = useState(null);
  const [clientScans,       setClientScans]        = useState([]);
  const [scansLoading,      setScansLoading]       = useState(false);
  const [viewScan,          setViewScan]           = useState(null);
  const [communityPosts,    setCommunityPosts]     = useState([]);
  const [communityLoading,  setCommunityLoading]   = useState(false);
  const [showPostModal,     setShowPostModal]      = useState(false);
  const [newPost,           setNewPost]            = useState({title:"",body:"",post_type:"update",cta_label:"",image_url:""});
  const [postImageUploading, setPostImageUploading] = useState(false);
  const [savingPost,        setSavingPost]         = useState(false);
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
  const pc = (settings&&settings.primary_color)||"#C77B92";
  const origin = typeof window!=="undefined"?window.location.origin:"";

  const activeServices = services.filter(s=>s.active!==false);
  const workingHours = HOURS_ALL.slice(Math.max((settings?.working_hours_start||8)-7,0),Math.min((settings?.working_hours_end||19)-7,HOURS_ALL.length));
  const cashierTotal = Math.max(0,cashierItems.reduce((s,item)=>s+(item.price*item.qty),0)-Number(cashierDiscount||0));

  useEffect(()=>{ loadAll(); /* eslint-disable-next-line */ },[]);

  // Load skin-scan history whenever a client card is opened
  useEffect(() => {
    if (selectedClient?.id) loadClientScans(selectedClient.id);
    else setClientScans([]);
    /* eslint-disable-next-line */
  }, [selectedClient?.id]);

  // Load saved campaigns the first time the AI marketing view is opened
  useEffect(() => {
    if (activeTab === "campaigns" && marketingView === "ai" && savedCampaigns === null) {
      loadSavedCampaigns();
    }
    /* eslint-disable-next-line */
  }, [activeTab, marketingView]);

  useEffect(() => {
    if (activeTab === "community") loadCommunityPosts();
    /* eslint-disable-next-line */
  }, [activeTab]);

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

  // Parse pasted text into {name, phone} rows. Accepts "name, phone" or
  // "name <tab/space> phone", one per line.
  const parseImportText = (text) => {
    const rows = [];
    (text || "").split("\n").forEach((line) => {
      const raw = line.trim();
      if (!raw) return;
      // Split on comma, tab, or 2+ spaces
      let parts = raw.split(/,|\t|\s{2,}/).map((p) => p.trim()).filter(Boolean);
      if (parts.length === 1) {
        // Try "name phone" with a single space before a phone-like token
        const m = raw.match(/^(.*?)[\s]+([0-9\-+() ]{6,})$/);
        if (m) parts = [m[1].trim(), m[2].trim()];
      }
      let name = parts[0] || "";
      let phone = parts[1] || "";
      // If the first token looks like a phone and second like a name, swap
      if (/^[0-9\-+() ]{6,}$/.test(name) && phone && !/^[0-9\-+() ]{6,}$/.test(phone)) {
        [name, phone] = [phone, name];
      }
      phone = phone.replace(/[^\d+]/g, "");
      if (name) rows.push({ name, phone });
    });
    return rows;
  };

  // Open the device contact picker (works on Chrome/Android only)
  const pickFromContacts = async () => {
    if (!(navigator.contacts && navigator.contacts.select)) {
      toast("המכשיר לא תומך בבחירה מאנשי קשר - השתמשי בהדבקה ידנית", "error");
      return;
    }
    try {
      const selected = await navigator.contacts.select(["name", "tel"], { multiple: true });
      const lines = selected.map((c) => {
        const nm = (c.name && c.name[0]) || "";
        const tel = (c.tel && c.tel[0]) || "";
        return `${nm}, ${tel}`;
      });
      setImportText((prev) => (prev ? prev + "\n" : "") + lines.join("\n"));
    } catch {
      // user cancelled - ignore
    }
  };

  // Save all parsed contacts as new clients
  const importContacts = async () => {
    if (importing) return;
    const rows = parseImportText(importText);
    if (rows.length === 0) { toast("לא נמצאו אנשי קשר להוספה", "error"); return; }
    setImporting(true);
    try {
      const toInsert = rows.map((r) => ({ ...emptyClient, name: r.name, phone: r.phone, status: "active" }));
      const { data, error } = await supabase.from("clients").insert(toInsert).select();
      if (error) { handleDbError(error, "import clients"); return; }
      if (data) setClients((prev) => [...prev, ...data]);
      setShowImportModal(false);
      setImportText("");
      toast(`${rows.length} לקוחות נוספו`);
    } finally {
      setImporting(false);
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
        if(data&&data[0])setSettings(data[0]);
      }else{
        const {data,error}=await supabase.from("settings").insert([editSettings]).select();
        if(error){handleDbError(error, "create settings"); return;}
        if(data&&data[0])setSettings(data[0]);
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

  // Downscale + compress an image file in the browser before sending it to
  // the AI, so we never hit the server's request-size limit (413).
  const compressImage = (file, maxDim = 1024, quality = 0.8) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
          else if (height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          canvas.toBlob(
            (blob) => resolve({ base64: dataUrl.split(",")[1], mediaType: "image/jpeg", blob }),
            "image/jpeg", quality
          );
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Load all saved skin scans for a client (newest first)
  const loadClientScans = async (clientId) => {
    setScansLoading(true);
    try {
      const { data } = await supabase
        .from("skin_scans")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      setClientScans(data || []);
    } catch { setClientScans([]); }
    finally { setScansLoading(false); }
  };

  // Scan a client's skin: analyze with AI, store the image, and save the full
  // report to skin_scans so it builds a history per client.
  const scanClientSkin = async (client, file) => {
    if (!file || scanLoading) return;
    setScanLoading(true); setScanReport(null);
    try {
      // Compress in the browser first to avoid 413 (payload too large)
      const { base64, mediaType, blob } = await compressImage(file);
      const res = await fetch("/api/skin-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mediaType }),
      });
      const data = await res.json();
      if (!data.success) { toast(data.error || "הניתוח נכשל", "error"); setScanLoading(false); return; }
      setScanReport(data.report);

      // Upload the scan image to storage (best-effort)
      let imageUrl = null;
      try {
        const fileName = `${client.id}/scan_${Date.now()}.jpg`;
        const { error: ue } = await supabase.storage.from("client-images").upload(fileName, blob, { contentType: "image/jpeg" });
        if (!ue) {
          const { data: urlData } = supabase.storage.from("client-images").getPublicUrl(fileName);
          imageUrl = urlData.publicUrl;
        }
      } catch {}

      // Save the full report to skin_scans (per-client history).
      // tenant_id is set automatically by the column default (get_user_tenant_id()).
      try {
        await supabase.from("skin_scans").insert({
          client_id: client.id,
          image_url: imageUrl,
          report: data.report,
          score: data.report.score,
          skin_type: data.report.skin_type,
        });
      } catch (e) { /* non-fatal */ }

      // Refresh history if this client's card is open
      loadClientScans(client.id);
      toast("✦ הסריקה נשמרה לכרטיס");
    } catch (err) {
      toast("שגיאה בסריקה", "error");
    } finally {
      setScanLoading(false);
    }
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

  // === AI MARKETING: full flow (strategy -> posts with images, + groups) ===
  const generatePosts = async () => {
    if (!postGoal.trim()) { toast("נא לכתוב מה תרצי לפרסם", "error"); return; }
    if (postLoading) return;
    setPostLoading(true); setPostError(null); setPostVariations(null); setPostStrategy(null);
    try {
      // Step 1: strategy
      const sRes = await fetch("/api/marketing/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: postGoal.trim() }),
      });
      const sData = await sRes.json();
      if (!sRes.ok || !sData.strategy) {
        setPostError(sData.error || "יצירת האסטרטגיה נכשלה");
        setPostLoading(false);
        return;
      }
      setPostStrategy(sData.strategy);

      // Step 2: post variations (with Unsplash images) based on that strategy
      const vRes = await fetch("/api/marketing/variations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy: sData.strategy, count: 5 }),
      });
      const vData = await vRes.json();
      if (vRes.ok && vData.variations) {
        setPostVariations(vData.variations);
      } else {
        setPostError(vData.error || "יצירת הפוסטים נכשלה");
      }
    } catch (err) {
      setPostError(err.message);
    } finally {
      setPostLoading(false);
    }
  };

  const loadGroups = async () => {
    if (groupsLoading) return;
    setGroupsLoading(true); setGroupsError(null);
    try {
      const res = await fetch("/api/marketing/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 10 }),
      });
      const data = await res.json();
      if (res.ok && data.groups) {
        setGroups(data.groups);
      } else {
        setGroupsError(data.error || "טעינת הקבוצות נכשלה");
      }
    } catch (err) {
      setGroupsError(err.message);
    } finally {
      setGroupsLoading(false);
    }
  };

  // Copy a public link (scanner / booking) for the current tenant
  const copyPublicLink = async (kind) => {
    const t = settings.tenant_id;
    if (!t) { toast("חסר מזהה עסק - נסי לרענן", "error"); return; }
    const base = "https://beautyos-theta.vercel.app";
    const url = kind === "scan" ? `${base}/skin-scan?t=${t}` : kind === "community" ? `${base}/community?t=${t}` : `${base}/book?t=${t}`;
    try {
      await navigator.clipboard.writeText(url);
      toast(kind === "scan" ? "קישור הסורק הועתק" : kind === "community" ? "קישור הקהילה הועתק" : "קישור קביעת התור הועתק");
    } catch {
      toast(url, "info");
    }
  };

  // Load the community feed posts for this tenant (newest first)
  const loadCommunityPosts = async () => {
    setCommunityLoading(true);
    try {
      const { data } = await supabase
        .from("community_posts")
        .select("*")
        .order("created_at", { ascending: false });
      setCommunityPosts(data || []);
    } catch { setCommunityPosts([]); }
    finally { setCommunityLoading(false); }
  };

  // Upload an image for a community post to the shared bucket
  const uploadPostImage = async (file) => {
    if (!file) return;
    setPostImageUploading(true);
    try {
      const { base64, blob } = await compressImage(file, 1280, 0.82);
      const fileName = `community/${Date.now()}.jpg`;
      const { error: ue } = await supabase.storage.from("client-images").upload(fileName, blob, { contentType: "image/jpeg" });
      if (!ue) {
        const { data: urlData } = supabase.storage.from("client-images").getPublicUrl(fileName);
        setNewPost(p => ({ ...p, image_url: urlData.publicUrl }));
        toast("התמונה הועלתה");
      } else { toast("שגיאה בהעלאת תמונה", "error"); }
    } catch { toast("שגיאה בהעלאת תמונה", "error"); }
    finally { setPostImageUploading(false); }
  };

  // Save a new community post
  const saveCommunityPost = async () => {
    if (savingPost) return;
    if (!newPost.body && !newPost.title) { toast("כתבי תוכן לפוסט", "error"); return; }
    setSavingPost(true);
    try {
      const { data, error } = await supabase.from("community_posts").insert([{
        title: newPost.title || null,
        body: newPost.body || null,
        image_url: newPost.image_url || null,
        post_type: newPost.post_type || "update",
        cta_label: newPost.cta_label || null,
      }]).select();
      if (error) { handleDbError(error, "create community post"); return; }
      if (data && data[0]) setCommunityPosts(prev => [data[0], ...prev]);
      setNewPost({ title:"", body:"", post_type:"update", cta_label:"", image_url:"" });
      setShowPostModal(false);
      toast("הפוסט פורסם למרחב הלקוחות");
    } finally { setSavingPost(false); }
  };

  // Delete a community post
  const deleteCommunityPost = async (id) => {
    try {
      await supabase.from("community_posts").delete().eq("id", id);
      setCommunityPosts(prev => prev.filter(p => p.id !== id));
      toast("הפוסט נמחק");
    } catch { toast("שגיאה במחיקה", "error"); }
  };

  const copyPost = async (v) => {
    const text = `${v.body}\n\n${v.callToAction}\n\n${(v.hashtags || []).join(" ")}`;
    try {
      await navigator.clipboard.writeText(text);
      toast("הפוסט הועתק - אפשר להדביק בפייסבוק/אינסטגרם");
    } catch {
      toast("לא ניתן להעתיק אוטומטית", "error");
    }
  };

  // Open Facebook's share dialog. We also copy the post text to the clipboard
  // so she can paste it straight into the Facebook composer.
  const shareToFacebook = async (v) => {
    const text = `${v.body}\n\n${v.callToAction}\n\n${(v.hashtags || []).join(" ")}`;
    try { await navigator.clipboard.writeText(text); } catch {}
    const shareUrl = "https://www.facebook.com/sharer/sharer.php?u=" +
      encodeURIComponent("https://beautyos-theta.vercel.app") +
      "&quote=" + encodeURIComponent(text);
    window.open(shareUrl, "_blank", "width=640,height=640");
    toast("הטקסט הועתק - הדביקי אותו בחלון של פייסבוק");
  };

  // Download the post image as a 1080x1080 square (Facebook/Instagram ready)
  const downloadImage = async (url, idx) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const bitmap = await createImageBitmap(blob);
      const SIZE = 1080;
      const canvas = document.createElement("canvas");
      canvas.width = SIZE; canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      // Cover-crop the source into a centered square
      const scale = Math.max(SIZE / bitmap.width, SIZE / bitmap.height);
      const w = bitmap.width * scale;
      const h = bitmap.height * scale;
      ctx.drawImage(bitmap, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
      canvas.toBlob((out) => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(out);
        link.download = `beautyos-post-${idx || 1}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        toast("התמונה הורדה בפורמט פוסט (1080x1080)");
      }, "image/jpeg", 0.92);
    } catch {
      window.open(url, "_blank");
      toast("התמונה נפתחה בחלון חדש - לחצי שמירה");
    }
  };

  // Save the current generated campaign + posts to the database
  const saveCampaign = async () => {
    if (!postVariations || postVariations.length === 0) return;
    if (savingCampaign) return;
    setSavingCampaign(true);
    try {
      const res = await fetch("/api/marketing/save-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: postGoal.trim().slice(0, 40),
          goal: postGoal.trim(),
          strategy: postStrategy,
          variations: postVariations,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast("✦ הקמפיין נשמר");
        loadSavedCampaigns();
      } else {
        toast(data.error || "השמירה נכשלה", "error");
      }
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSavingCampaign(false);
    }
  };

  const loadSavedCampaigns = async () => {
    try {
      const res = await fetch("/api/marketing/list");
      const data = await res.json();
      if (res.ok && data.campaigns) setSavedCampaigns(data.campaigns);
    } catch {}
  };

  const deleteCampaign = (campaignId) => {
    askConfirm({
      title: "מחיקת קמפיין",
      message: "למחוק את הקמפיין וכל הפוסטים שלו?",
      confirmText: "מחיקה",
      danger: true,
      onConfirm: async () => {
        const res = await fetch("/api/marketing/delete-campaign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId }),
        });
        if (res.ok) {
          toast("הקמפיין נמחק");
          loadSavedCampaigns();
        } else {
          toast("המחיקה נכשלה", "error");
        }
      },
    });
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
          {id:"community",label:"קהילה"},
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
 <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
 <button onClick={()=>{setImportText("");setShowImportModal(true);}} style={{background:"#fff",color:"#C77B92",border:"1px solid #E8B5C4",borderRadius:24,padding:"9px 16px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>ייבוא לקוחות</button>
 <button onClick={()=>{setEditingClient(null);setNewClient(emptyClient);setShowClientModal(true);}} style={{background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",border:"none",borderRadius:24,padding:"9px 18px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 6px 16px rgba(199,123,146,0.25)"}}>✦ מטופלת חדשה</button>
 </div>
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
 <h2 className="serif" style={{fontSize:22,fontWeight:600,color:"#2A2A2A",marginBottom:16}}>שיווק</h2>

 {/* INNER SUB-TABS */}
 <div style={{display:"flex",gap:6,marginBottom:18}}>
 <button onClick={()=>setMarketingView("campaigns")} className="primary-btn" style={{padding:"8px 18px",fontSize:12,background:marketingView==="campaigns"?"linear-gradient(90deg,#C77B92,#D89AAE)":"#fff",color:marketingView==="campaigns"?"#fff":"#8A8088",border:marketingView==="campaigns"?"none":"1px solid #EFE7EB"}}>קמפיינים בפייסבוק</button>
 <button onClick={()=>{setMarketingView("ai");if(savedCampaigns===null)loadSavedCampaigns();}} className="primary-btn" style={{padding:"8px 18px",fontSize:12,background:marketingView==="ai"?"linear-gradient(90deg,#C77B92,#D89AAE)":"#fff",color:marketingView==="ai"?"#fff":"#8A8088",border:marketingView==="ai"?"none":"1px solid #EFE7EB"}}>תוכן AI</button>
 </div>

 {marketingView==="campaigns"&&(<>

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
 </>)}

 {marketingView==="ai"&&(<>
 <div style={{textAlign:"center",marginBottom:18}}>
 <h2 className="serif" style={{fontSize:26,fontWeight:600,color:"#2A2A2A",marginBottom:6}}>תוכן AI לפוסטים</h2>
 <p style={{fontSize:12.5,color:"#8A8088"}}>כתבי מה תרצי לפרסם, וקבלי 5 פוסטים מוכנים לפייסבוק ואינסטגרם</p>
 </div>

 {/* VIEW TOGGLE */}
 <div style={{display:"flex",gap:6,justifyContent:"center",marginBottom:22}}>
 <button onClick={()=>setAiPostsView("create")} className="primary-btn" style={{padding:"8px 20px",fontSize:12,background:aiPostsView==="create"?"linear-gradient(90deg,#C77B92,#D89AAE)":"#fff",color:aiPostsView==="create"?"#fff":"#8A8088",border:aiPostsView==="create"?"none":"1px solid #EFE7EB"}}>יצירת פוסטים</button>
 <button onClick={()=>{setAiPostsView("saved");loadSavedCampaigns();}} className="primary-btn" style={{padding:"8px 20px",fontSize:12,background:aiPostsView==="saved"?"linear-gradient(90deg,#C77B92,#D89AAE)":"#fff",color:aiPostsView==="saved"?"#fff":"#8A8088",border:aiPostsView==="saved"?"none":"1px solid #EFE7EB"}}>הקמפיינים שלי{savedCampaigns&&savedCampaigns.length>0?` (${savedCampaigns.length})`:""}</button>
 </div>

 {aiPostsView==="create"&&(<>

 <div style={{background:"#fff",borderRadius:20,padding:"22px 24px",border:"1px solid #EFE7EB",marginBottom:18,position:"relative",overflow:"hidden"}}>
 <div style={{position:"absolute",top:0,right:0,left:0,height:4,background:"linear-gradient(90deg,#F6D9E2,#E8B5C4,#F6D9E2)"}}/>
 <p style={{fontSize:11,color:"#8A8088",fontWeight:600,marginBottom:8}}>מה תרצי לפרסם?</p>
 <textarea value={postGoal} onChange={e=>setPostGoal(e.target.value)} rows={3}
 placeholder="לדוגמה: מבצע על טיפולי פנים לחודש הקרוב / להחזיר לקוחות שלא הגיעו מזמן / לפרסם טיפול חדש של הסרת שיער בלייזר"
 style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:14,padding:"12px 14px",fontSize:13,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FCEEF3",resize:"none",marginBottom:12}}/>
 <button onClick={generatePosts} disabled={postLoading} className="primary-btn" style={{width:"100%",padding:"13px 0",background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",fontSize:14}}>
 {postLoading?"יוצרת פוסטים... ✦":"✦ צרי לי 5 פוסטים"}
 </button>
 </div>

 {postError&&(
 <div style={{background:"#FFFAF7",border:"1px solid #FFDAC1",borderRadius:14,padding:"12px 16px",marginBottom:16}}>
 <p style={{fontSize:11.5,color:"#C77B92",fontWeight:600}}>{postError}</p>
 </div>
 )}

 {postLoading&&(
 <div style={{textAlign:"center",padding:"30px 0"}}>
 <p style={{fontSize:13,color:"#C77B92",fontWeight:500}}>ה-AI בונה אסטרטגיה וכותב 5 וריאציות... רגע אחד ✦</p>
 </div>
 )}

 {postStrategy&&!postLoading&&(
 <div style={{background:"linear-gradient(135deg,#FBEEF2,#F6D9E2)",borderRadius:18,padding:"18px 22px",marginBottom:18}}>
 <p style={{fontSize:11,color:"#C77B92",fontWeight:700,marginBottom:6}}>האסטרטגיה של ה-AI</p>
 <p style={{fontSize:12.5,color:"#3A2A30",lineHeight:1.6,marginBottom:8}}>{postStrategy.strategy}</p>
 {postStrategy.keyPoints&&postStrategy.keyPoints.length>0&&(
 <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
 {postStrategy.keyPoints.map((kp,i)=>(
 <span key={i} style={{fontSize:9.5,background:"rgba(255,255,255,0.7)",color:"#C77B92",padding:"3px 10px",borderRadius:20,fontWeight:500}}>{kp}</span>
 ))}
 </div>
 )}
 </div>
 )}

 {postVariations&&postVariations.length>0&&postVariations.map((v,i)=>(
 <div key={i} style={{background:"#fff",borderRadius:18,border:"1px solid #EFE7EB",marginBottom:14,overflow:"hidden"}}>
 {v.image&&v.image.url&&(
 <div style={{position:"relative"}}>
 <img alt="" src={v.image.url} style={{width:"100%",height:200,objectFit:"cover",objectPosition:"center",display:"block"}}/>
 {v.image.photographerName&&(
 <span style={{position:"absolute",bottom:6,left:6,background:"rgba(0,0,0,0.45)",color:"#fff",fontSize:8,padding:"2px 7px",borderRadius:10}}>צילום: {v.image.photographerName}</span>
 )}
 </div>
 )}
 <div style={{padding:"20px 22px"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:6}}>
 <div style={{display:"flex",alignItems:"center",gap:8}}>
 <span className="serif" style={{fontSize:22,fontWeight:600,color:"#E8B5C4"}}>{i+1}</span>
 <span style={{fontSize:9,background:"#FBEEF2",color:"#C77B92",padding:"3px 10px",borderRadius:20,fontWeight:600}}>{({emotional:"רגשי",educational:"חינוכי",urgency:"דחיפות",social_proof:"המלצות",engaging_question:"שאלה מעוררת"})[v.variationType]||v.variationType}</span>
 </div>
 <button onClick={()=>copyPost(v)} className="primary-btn" style={{padding:"6px 14px",background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",fontSize:10}}>העתיקי</button>
 </div>
 {v.title&&<p className="serif" style={{fontSize:16,fontWeight:600,color:"#2A2A2A",marginBottom:6}}>{v.title}</p>}
 <p style={{fontSize:13,color:"#3A2A30",lineHeight:1.65,whiteSpace:"pre-wrap",marginBottom:10}}>{v.body}</p>
 {v.callToAction&&<p style={{fontSize:12.5,color:"#C77B92",fontWeight:600,marginBottom:8}}>{v.callToAction}</p>}
 {v.hashtags&&v.hashtags.length>0&&(
 <p style={{fontSize:11,color:"#8A8088"}}>{v.hashtags.join(" ")}</p>
 )}
 <div style={{display:"flex",gap:6,marginTop:12,flexWrap:"wrap"}}>
 <button onClick={()=>shareToFacebook(v)} style={{flex:"1 1 auto",padding:"8px 12px",background:"#1877F2",color:"#fff",border:"none",borderRadius:10,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>שיתוף לפייסבוק</button>
 <button onClick={()=>copyPost(v)} style={{flex:"1 1 auto",padding:"8px 12px",background:"#fff",color:"#C77B92",border:"1px solid #E8B5C4",borderRadius:10,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>העתקת טקסט</button>
 {v.image&&v.image.url&&<button onClick={()=>downloadImage(v.image.url,v.variationNumber)} style={{flex:"1 1 auto",padding:"8px 12px",background:"#fff",color:"#C77B92",border:"1px solid #E8B5C4",borderRadius:10,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>הורדת תמונה</button>}
 </div>
 <p style={{fontSize:9,color:"#C9B8C2",marginTop:6}}>לאינסטגרם: הורידי את התמונה והדביקי את הטקסט</p>
 </div>
 </div>
 ))}

 {postVariations&&postVariations.length===0&&!postError&&(
 <p style={{fontSize:12,color:"#8A8088",textAlign:"center",padding:"20px 0"}}>לא נוצרו פוסטים. נסי שוב עם תיאור אחר.</p>
 )}

 {postVariations&&postVariations.length>0&&(
 <button onClick={saveCampaign} disabled={savingCampaign} className="primary-btn" style={{width:"100%",padding:"12px 0",background:"#fff",color:"#C77B92",border:"1.5px solid #C77B92",fontSize:13,marginBottom:8}}>
 {savingCampaign?"שומרת...":"✦ שמרי את הקמפיין הזה"}
 </button>
 )}

 {/* FACEBOOK GROUPS SECTION */}
 <div style={{background:"#fff",borderRadius:20,padding:"22px 24px",border:"1px solid #EFE7EB",marginTop:24,position:"relative",overflow:"hidden"}}>
 <div style={{position:"absolute",top:0,right:0,left:0,height:4,background:"linear-gradient(90deg,#F6D9E2,#E8B5C4,#F6D9E2)"}}/>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,flexWrap:"wrap",gap:8}}>
 <h3 className="serif" style={{fontSize:18,fontWeight:600,color:"#2A2A2A"}}>קבוצות פייסבוק לפרסום</h3>
 <button onClick={loadGroups} disabled={groupsLoading} className="primary-btn" style={{padding:"7px 14px",background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",fontSize:11}}>{groupsLoading?"מחפשת...":groups===null?"הציעי לי קבוצות":"רענני"}</button>
 </div>
 <p style={{fontSize:11,color:"#8A8088",marginBottom:groups?14:0}}>קבוצות שכדאי לחפש ולהצטרף אליהן כדי לפרסם בהן</p>

 {groupsError&&<p style={{fontSize:11,color:"#C77B92",fontWeight:600,marginTop:10}}>{groupsError}</p>}

 {groups&&groups.length>0&&groups.map((g,i)=>(
 <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"11px 0",borderBottom:i<groups.length-1?"1px solid #F7F0F3":"none"}}>
 <div style={{flex:1,minWidth:0}}>
 <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:2}}>
 <p style={{fontSize:12.5,fontWeight:600,color:"#2A2A2A"}}>{g.name}</p>
 <span style={{fontSize:8.5,background:"#FBEEF2",color:"#C77B92",padding:"2px 8px",borderRadius:20,fontWeight:500}}>{g.category}</span>
 </div>
 <p style={{fontSize:10.5,color:"#8A8088",lineHeight:1.5}}>{g.reasoning}</p>
 </div>
 <a href={`https://www.facebook.com/search/groups/?q=${encodeURIComponent(g.name)}`} target="_blank" rel="noreferrer" className="wa-btn" style={{background:"#5580C4",padding:"5px 10px",fontSize:9,whiteSpace:"nowrap"}}>חפשי</a>
 </div>
 ))}
 </div>
 </>)}

 {aiPostsView==="saved"&&(<>
 {savedCampaigns===null&&<p style={{fontSize:12,color:"#8A8088",textAlign:"center",padding:"30px 0"}}>טוען...</p>}
 {savedCampaigns&&savedCampaigns.length===0&&(
 <div style={{background:"#fff",borderRadius:18,padding:"40px 20px",textAlign:"center",border:"1px solid #EFE7EB"}}>
 <p style={{fontSize:13,color:"#8A8088",marginBottom:6}}>עדיין לא שמרת קמפיינים</p>
 <p style={{fontSize:11,color:"#C9B8C2"}}>צרי פוסטים בלשונית "יצירת פוסטים" ולחצי "שמרי את הקמפיין"</p>
 </div>
 )}
 {savedCampaigns&&savedCampaigns.length>0&&savedCampaigns.map(c=>(
 <div key={c.id} style={{background:"#fff",borderRadius:18,border:"1px solid #EFE7EB",marginBottom:14,overflow:"hidden"}}>
 <div style={{background:"linear-gradient(90deg,#FBEEF2,#F6D9E2)",padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
 <div style={{flex:1,minWidth:0}}>
 <p className="serif" style={{fontSize:16,fontWeight:600,color:"#2A2A2A"}}>{c.name||c.goal}</p>
 <p style={{fontSize:10,color:"#8A8088",marginTop:2}}>{c.created_at?new Date(c.created_at).toLocaleDateString("he-IL"):""} · {(c.posts||[]).length} פוסטים</p>
 </div>
 <button onClick={()=>deleteCampaign(c.id)} className="primary-btn" style={{padding:"5px 12px",background:"#fff",color:"#C62828",border:"1px solid #F5D0D0",fontSize:10}}>מחקי</button>
 </div>
 <div style={{padding:"14px 18px"}}>
 {c.ai_strategy&&<p style={{fontSize:11.5,color:"#6B6B6B",lineHeight:1.6,marginBottom:12}}>{c.ai_strategy}</p>}
 {(c.posts||[]).map((p,i)=>(
 <div key={i} style={{borderTop:i>0?"1px solid #F7F0F3":"none",padding:"10px 0"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4,gap:6}}>
 {p.title&&<p style={{fontSize:13,fontWeight:600,color:"#2A2A2A"}}>{p.title}</p>}
 <button onClick={()=>copyPost({body:p.body,callToAction:p.call_to_action,hashtags:p.hashtags})} className="primary-btn" style={{padding:"4px 10px",background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",fontSize:9,flexShrink:0}}>העתיקי</button>
 </div>
 <p style={{fontSize:12,color:"#3A2A30",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{p.body}</p>
 {p.call_to_action&&<p style={{fontSize:11.5,color:"#C77B92",fontWeight:600,marginTop:4}}>{p.call_to_action}</p>}
 {p.hashtags&&p.hashtags.length>0&&<p style={{fontSize:10,color:"#8A8088",marginTop:4}}>{p.hashtags.join(" ")}</p>}
 </div>
 ))}
 </div>
 </div>
 ))}
 </>)}
 </>)}
 </div>
 </>)}

          {/* COMMUNITY — clients feed for this tenant */}
          {activeTab==="community"&&(<>
 <div style={{maxWidth:760,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,flexWrap:"wrap",gap:8}}>
 <div>
 <h2 className="serif" style={{fontSize:21,fontWeight:600,color:"#2A2A2A"}}>מרחב הלקוחות</h2>
 <p style={{fontSize:11.5,color:"#8A8088",marginTop:2}}>פרסמי עדכונים, מבצעים וטיפים — הלקוחות שלך רואות הכל במקום אחד.</p>
 </div>
 <div style={{display:"flex",gap:7}}>
 <button onClick={()=>copyPublicLink("community")} style={{padding:"9px 14px",background:"#fff",color:"#C77B92",border:"1px solid #E8B5C4",borderRadius:11,fontSize:11.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>העתקת קישור לקהילה</button>
 <button onClick={()=>{setNewPost({title:"",body:"",post_type:"update",cta_label:"",image_url:""});setShowPostModal(true);}} className="primary-btn" style={{padding:"9px 16px",background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",fontSize:11.5}}>+ פוסט חדש</button>
 </div>
 </div>

 {communityLoading?<p style={{fontSize:12,color:"#C9B8C2",marginTop:20}}>טוען...</p>
 :communityPosts.length===0?(
 <div style={{textAlign:"center",padding:"48px 20px",background:"rgba(255,255,255,0.6)",borderRadius:18,marginTop:14}}>
 <div style={{fontSize:34,marginBottom:10}}>💜</div>
 <p style={{fontSize:14,fontWeight:600,color:"#2A2A2A",marginBottom:5}}>עוד אין פוסטים</p>
 <p style={{fontSize:11.5,color:"#8A8088",maxWidth:360,margin:"0 auto"}}>פרסמי את הפוסט הראשון — מבצע, טיפ, או עדכון — והלקוחות שלך יראו אותו במרחב הלקוחות.</p>
 </div>
 ):(
 <div style={{display:"flex",flexDirection:"column",gap:13,marginTop:14}}>
 {communityPosts.map(p=>(
 <div key={p.id} style={{background:"#fff",borderRadius:16,overflow:"hidden",border:"1px solid #EFE7EB"}}>
 {p.image_url&&<img alt="" src={p.image_url} style={{width:"100%",maxHeight:280,objectFit:"cover",objectPosition:"center",display:"block"}}/>}
 <div style={{padding:"14px 16px"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
 <span style={{fontSize:9.5,fontWeight:700,color:"#fff",background:p.post_type==="offer"?"#C77B92":p.post_type==="tip"?"#7BA88E":"#A89BB0",padding:"3px 9px",borderRadius:20}}>{p.post_type==="offer"?"מבצע":p.post_type==="tip"?"טיפ":"עדכון"}</span>
 <span style={{fontSize:9,color:"#C9B8C2"}}>{new Date(p.created_at).toLocaleDateString("he-IL")}</span>
 </div>
 {p.title&&<p style={{fontSize:14.5,fontWeight:700,color:"#2A2A2A",marginBottom:4}}>{p.title}</p>}
 {p.body&&<p style={{fontSize:12.5,color:"#4A3A42",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{p.body}</p>}
 {p.cta_label&&<div style={{marginTop:10}}><span style={{display:"inline-block",padding:"7px 16px",background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",fontSize:11,fontWeight:600,borderRadius:20}}>{p.cta_label}</span></div>}
 <div style={{display:"flex",justifyContent:"flex-start",marginTop:10}}>
 <button onClick={()=>deleteCommunityPost(p.id)} style={{background:"none",border:"none",color:"#C9B8C2",fontSize:10.5,cursor:"pointer",fontFamily:"inherit"}}>מחיקה</button>
 </div>
 </div>
 </div>
 ))}
 </div>
 )}
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

      {/* IMPORT CONTACTS MODAL */}
      {showImportModal&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:14}} onClick={()=>setShowImportModal(false)}>
 <div onClick={e=>e.stopPropagation()} className="modal-card" style={{background:"#fff",borderRadius:22,padding:24,width:420,maxWidth:"100%",maxHeight:"90vh",overflowY:"auto"}}>
 <p className="serif" style={{fontSize:18,fontWeight:600,color:"#2A2A2A",marginBottom:6}}>ייבוא לקוחות</p>
 <p style={{fontSize:11.5,color:"#8A8088",marginBottom:14,lineHeight:1.6}}>הוסיפי כמה לקוחות בבת אחת. כתבי כל לקוחה בשורה נפרדת, בפורמט: שם, טלפון</p>

 <button onClick={pickFromContacts} style={{width:"100%",padding:"11px 0",background:"#fff",color:"#C77B92",border:"1px dashed #E8B5C4",borderRadius:12,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginBottom:6}}>📇 בחירה מאנשי הקשר בטלפון</button>
 <p style={{fontSize:9,color:"#C9B8C2",marginBottom:14,textAlign:"center"}}>(עובד בעיקר בטלפונים אנדרואיד. באייפון/מחשב — השתמשי בהדבקה למטה)</p>

 <p style={{fontSize:10,color:"#8A8088",marginBottom:5}}>או הדביקי כאן (שורה לכל לקוחה):</p>
 <textarea value={importText} onChange={e=>setImportText(e.target.value)} rows={7} placeholder={"דנה כהן, 0541234567\nמיכל לוי, 0529876543"} style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1px solid #E8D5DD",fontSize:12.5,fontFamily:"inherit",marginBottom:8,boxSizing:"border-box",resize:"vertical",direction:"rtl"}}/>

 {importText.trim()&&<p style={{fontSize:10.5,color:"#7BA88E",marginBottom:12}}>זוהו {parseImportText(importText).length} לקוחות</p>}

 <div style={{display:"flex",gap:8}}>
 <button onClick={importContacts} disabled={importing} className="primary-btn" style={{flex:2,padding:"12px 0",background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",fontSize:13,opacity:importing?0.6:1}}>{importing?"מוסיף...":"הוספת הלקוחות"}</button>
 <button onClick={()=>setShowImportModal(false)} style={{flex:1,padding:"12px 0",background:"#fff",color:"#8A8088",border:"1px solid #E8D5DD",borderRadius:12,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>ביטול</button>
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
      {showPostModal&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1300,padding:14}} onClick={()=>setShowPostModal(false)}>
 <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:20,maxWidth:460,width:"100%",maxHeight:"90vh",overflowY:"auto",padding:"22px"}}>
 <p className="serif" style={{fontSize:18,fontWeight:600,color:"#2A2A2A",marginBottom:14}}>פוסט חדש למרחב הלקוחות</p>

 <p style={{fontSize:10,color:"#8A8088",marginBottom:5}}>סוג הפוסט</p>
 <div style={{display:"flex",gap:6,marginBottom:13}}>
 {[{k:"update",l:"עדכון"},{k:"offer",l:"מבצע"},{k:"tip",l:"טיפ"}].map(t=>(
 <button key={t.k} onClick={()=>setNewPost({...newPost,post_type:t.k})} style={{flex:1,padding:"8px 0",borderRadius:10,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:newPost.post_type===t.k?"2px solid #C77B92":"1px solid #E8B5C4",background:newPost.post_type===t.k?"#FCEEF3":"#fff",color:"#C77B92"}}>{t.l}</button>
 ))}
 </div>

 <p style={{fontSize:10,color:"#8A8088",marginBottom:5}}>כותרת (לא חובה)</p>
 <input value={newPost.title} onChange={e=>setNewPost({...newPost,title:e.target.value})} placeholder="לדוגמה: מבצע אביב על טיפולי פנים" style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1px solid #E8D5DD",fontSize:12.5,fontFamily:"inherit",marginBottom:12,boxSizing:"border-box"}}/>

 <p style={{fontSize:10,color:"#8A8088",marginBottom:5}}>תוכן</p>
 <textarea value={newPost.body} onChange={e=>setNewPost({...newPost,body:e.target.value})} rows={4} placeholder="כתבי כאן את העדכון, המבצע או הטיפ..." style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1px solid #E8D5DD",fontSize:12.5,fontFamily:"inherit",marginBottom:12,boxSizing:"border-box",resize:"vertical"}}/>

 <p style={{fontSize:10,color:"#8A8088",marginBottom:5}}>טקסט לכפתור (לא חובה)</p>
 <input value={newPost.cta_label} onChange={e=>setNewPost({...newPost,cta_label:e.target.value})} placeholder="לדוגמה: לפרטים בוואטסאפ" style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1px solid #E8D5DD",fontSize:12.5,fontFamily:"inherit",marginBottom:12,boxSizing:"border-box"}}/>

 <p style={{fontSize:10,color:"#8A8088",marginBottom:5}}>תמונה (לא חובה)</p>
 {newPost.image_url&&<img alt="" src={newPost.image_url} style={{width:"100%",maxHeight:160,objectFit:"cover",borderRadius:10,marginBottom:8}}/>}
 <label style={{display:"block",padding:"9px 0",textAlign:"center",borderRadius:10,border:"1px dashed #E8B5C4",fontSize:11.5,color:"#C77B92",cursor:"pointer",marginBottom:16,fontWeight:600}}>
 {postImageUploading?"מעלה...":newPost.image_url?"החלפת תמונה":"+ הוספת תמונה"}
 <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files&&e.target.files[0];if(f)uploadPostImage(f);}}/>
 </label>

 <div style={{display:"flex",gap:8}}>
 <button onClick={saveCommunityPost} disabled={savingPost} className="primary-btn" style={{flex:1,padding:"12px 0",background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",fontSize:13,opacity:savingPost?0.6:1}}>{savingPost?"מפרסם...":"פרסום"}</button>
 <button onClick={()=>setShowPostModal(false)} style={{padding:"12px 18px",background:"#fff",color:"#8A8088",border:"1px solid #E8D5DD",borderRadius:12,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>ביטול</button>
 </div>
 </div>
 </div>
      )}

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
 <div style={{borderTop:"1px solid #EFE7EB",paddingTop:12,marginTop:4}}>
 <p style={{fontSize:10,color:"#8A8088",marginBottom:8,fontWeight:600}}>בוט הוואטסאפ החכם</p>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
 <span style={{fontSize:12,color:"#2A2A2A"}}>הבוט פעיל</span>
 <button onClick={()=>setEditSettings({...editSettings,bot_active:!(editSettings.bot_active!==false)})} style={{width:46,height:26,borderRadius:13,border:"none",cursor:"pointer",background:(editSettings.bot_active!==false)?"#C77B92":"#D8CEd3",position:"relative",transition:"background .2s"}}>
 <span style={{position:"absolute",top:3,left:(editSettings.bot_active!==false)?23:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
 </button>
 </div>
 {(editSettings.bot_active!==false)&&(
 <div>
 <p style={{fontSize:10,color:"#8A8088",marginBottom:6}}>מתי הבוט יענה?</p>
 <div style={{display:"flex",gap:6}}>
 <button onClick={()=>setEditSettings({...editSettings,bot_mode:"always"})} style={{flex:1,padding:"9px 0",borderRadius:10,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:(editSettings.bot_mode||"always")==="always"?"2px solid #C77B92":"1px solid #E8B5C4",background:(editSettings.bot_mode||"always")==="always"?"#FCEEF3":"#fff",color:"#C77B92"}}>תמיד</button>
 <button onClick={()=>setEditSettings({...editSettings,bot_mode:"after_hours"})} style={{flex:1,padding:"9px 0",borderRadius:10,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:editSettings.bot_mode==="after_hours"?"2px solid #C77B92":"1px solid #E8B5C4",background:editSettings.bot_mode==="after_hours"?"#FCEEF3":"#fff",color:"#C77B92"}}>רק מחוץ לשעות העבודה</button>
 </div>
 <p style={{fontSize:9,color:"#C9B8C2",marginTop:6}}>{editSettings.bot_mode==="after_hours"?"הבוט יענה רק כשאת לא בשעות/ימי העבודה — בשאר הזמן את עונה בעצמך.":"הבוט יענה לכל הודעה נכנסת, בכל שעה."}</p>
 </div>
 )}
 </div>
 <div style={{borderTop:"1px solid #EFE7EB",paddingTop:12,marginTop:4}}>
 <p style={{fontSize:10,color:"#8A8088",marginBottom:8,fontWeight:600}}>קישורים ללקוחות (לשליחה בוואטסאפ / ביו)</p>
 <button onClick={()=>copyPublicLink("scan")} style={{width:"100%",padding:"10px 0",background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",border:"none",borderRadius:12,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginBottom:7}}>✦ העתקת קישור לסורק העור</button>
 <button onClick={()=>copyPublicLink("book")} style={{width:"100%",padding:"10px 0",background:"#fff",color:"#C77B92",border:"1px solid #E8B5C4",borderRadius:12,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>📅 העתקת קישור לקביעת תור</button>
 </div>
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
 <label style={{display:"block",marginTop:8,background:"rgba(255,255,255,0.95)",color:"#C77B92",borderRadius:20,padding:"9px 0",fontSize:11,fontWeight:700,textAlign:"center",cursor:"pointer"}}>
 {scanLoading?"סורקת...":"✦ סריקת עור AI"}
 <input type="file" accept="image/*" capture="user" disabled={scanLoading} onChange={e=>{const f=e.target.files?.[0]; if(f) scanClientSkin(c,f); e.target.value="";}} style={{display:"none"}}/>
 </label>
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
                  {[{k:"info",l:"פרטים"},{k:"history",l:`היסטוריה (${appts.length})`},{k:"scans",l:`סריקות עור (${clientScans.length})`},{k:"receipts",l:`קבלות (${cReceipts.length})`},{k:"packages",l:`חבילות (${cPackages.length})`},{k:"forms",l:`טפסים (${cForms.length})`},{k:"images",l:`תמונות (${c.images?.length||0})`}].map(t=>(
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
                  {clientTab==="scans"&&(
                    scansLoading?<p style={{fontSize:11,color:"#C9B8C2"}}>טוען סריקות...</p>
                    :clientScans.length===0?<p style={{fontSize:11,color:"#C9B8C2"}}>אין סריקות עדיין. לחצי על "סריקת עור AI" למעלה.</p>
                    :clientScans.map(s=>(
 <div key={s.id} onClick={()=>setViewScan(s)} style={{display:"flex",alignItems:"center",gap:11,padding:"10px 0",borderBottom:"1px solid #F7F0F3",cursor:"pointer"}}>
 {s.image_url?<img alt="" src={s.image_url} style={{width:46,height:46,borderRadius:10,objectFit:"cover",flexShrink:0}}/>:<div style={{width:46,height:46,borderRadius:10,background:"#FCEEF3",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:18}}>✦</div>}
 <div style={{flex:1}}>
 <p style={{fontSize:11.5,fontWeight:600,color:"#2A2A2A"}}>{s.skin_type||"סריקת עור"}</p>
 <p style={{fontSize:9,color:"#8A8088"}}>{new Date(s.created_at).toLocaleDateString("he-IL")}{s.report?.clinical_treatment?` · ${s.report.clinical_treatment}`:""}</p>
 </div>
 <div style={{width:34,height:34,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",border:`3px solid ${s.score>=75?"#388E3C":s.score>=50?"#E8920C":"#C77B92"}`,flexShrink:0}}><span style={{fontSize:12,fontWeight:800,color:s.score>=75?"#388E3C":s.score>=50?"#E8920C":"#C77B92"}}>{s.score}</span></div>
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

      {/* SKIN SCAN RESULT MODAL */}
      {(scanReport||viewScan)&&(()=>{ const SR = scanReport || viewScan.report; const closeModal=()=>{setScanReport(null);setViewScan(null);}; return (
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1300,padding:14}} onClick={closeModal}>
 <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:20,maxWidth:420,width:"100%",maxHeight:"88vh",overflowY:"auto",padding:"22px 22px"}}>
 {viewScan?.image_url&&<img alt="" src={viewScan.image_url} style={{width:"100%",maxHeight:200,objectFit:"cover",borderRadius:14,marginBottom:14}}/>}
 <div style={{textAlign:"center",marginBottom:14}}>
 <div style={{width:90,height:90,borderRadius:"50%",margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"center",border:`6px solid ${SR.score>=75?"#388E3C":SR.score>=50?"#E8920C":"#C77B92"}`}}>
 <span style={{fontSize:30,fontWeight:800,color:SR.score>=75?"#388E3C":SR.score>=50?"#E8920C":"#C77B92"}}>{SR.score}</span>
 </div>
 <p className="serif" style={{fontSize:16,fontWeight:600,color:"#2A2A2A",marginTop:10}}>{SR.skin_type}</p>
 </div>
 {SR.summary&&<p style={{fontSize:12.5,color:"#3A2A30",lineHeight:1.6,textAlign:"center",marginBottom:14}}>{SR.summary}</p>}
 {SR.concerns?.length>0&&(
 <div style={{marginBottom:12}}>
 <p style={{fontSize:12,fontWeight:700,color:"#2A2A2A",marginBottom:6}}>ממצאים</p>
 {SR.concerns.map((c,i)=>(<p key={i} style={{fontSize:11.5,color:"#6B6B6B",marginBottom:3}}>• {c}</p>))}
 </div>
 )}
 {SR.clinical_treatment&&(
 <div style={{background:"linear-gradient(135deg,#FBEEF2,#F6D9E2)",borderRadius:14,padding:"12px 16px",marginBottom:12}}>
 <p style={{fontSize:10,color:"#8A8088",marginBottom:2}}>טיפול מומלץ</p>
 <p style={{fontSize:14,fontWeight:700,color:"#C77B92"}}>{SR.clinical_treatment}</p>
 {SR.matched_service&&<p style={{fontSize:11,color:"#8A8088",marginTop:2}}>אצלך: {SR.matched_service}</p>}
 </div>
 )}
 {SR.clinic_plan&&(
 <div style={{background:"#fff",borderRadius:14,padding:"12px 16px",marginBottom:12,border:"1.5px solid #E8B5C4"}}>
 <p style={{fontSize:12,fontWeight:700,color:"#C77B92",marginBottom:6}}>✦ תכנית טיפול בקליניקה</p>
 {SR.clinic_plan.treatment_type&&<p style={{fontSize:11.5,color:"#2A2A2A",fontWeight:600,marginBottom:3}}>{SR.clinic_plan.treatment_type}</p>}
 {SR.clinic_plan.sessions&&<p style={{fontSize:11,color:"#6B6B6B",marginBottom:6}}>{SR.clinic_plan.sessions}</p>}
 {SR.clinic_plan.steps?.length>0&&SR.clinic_plan.steps.map((s,i)=>(<p key={i} style={{fontSize:11,color:"#4A3A52",lineHeight:1.5,marginBottom:2}}>• {s}</p>))}
 {SR.clinic_plan.expected_results&&<p style={{fontSize:10.5,color:"#388E3C",marginTop:6}}>תוצאה צפויה: {SR.clinic_plan.expected_results}</p>}
 </div>
 )}
 {SR.home_plan&&(
 <div style={{background:"#FCEEF3",borderRadius:14,padding:"12px 16px",marginBottom:12}}>
 <p style={{fontSize:12,fontWeight:700,color:"#C77B92",marginBottom:6}}>✦ תכנית טיפוח לבית</p>
 {SR.home_plan.summary&&<p style={{fontSize:11,color:"#4A3A52",lineHeight:1.5,marginBottom:6}}>{SR.home_plan.summary}</p>}
 {SR.home_plan.products?.length>0&&SR.home_plan.products.map((p,i)=>(<p key={i} style={{fontSize:11,color:"#4A3A52",lineHeight:1.5,marginBottom:2}}>• {p}</p>))}
 {SR.home_plan.tips?.length>0&&SR.home_plan.tips.map((t,i)=>(<p key={i} style={{fontSize:10.5,color:"#8A8088",lineHeight:1.5,marginTop:i===0?6:2}}>טיפ: {t}</p>))}
 </div>
 )}
 {SR.therapist_notes&&(
 <div style={{background:"#F8F3FC",borderRadius:14,padding:"12px 16px",marginBottom:12,border:"1px solid #E5D4F0"}}>
 <p style={{fontSize:11,fontWeight:700,color:"#6B4A8C",marginBottom:6}}>הערות למטפלת</p>
 {SR.therapist_notes.skin_assessment&&<p style={{fontSize:11,color:"#4A3A52",lineHeight:1.5,marginBottom:6}}>{SR.therapist_notes.skin_assessment}</p>}
 {SR.therapist_notes.protocol&&<p style={{fontSize:11,color:"#4A3A52",lineHeight:1.5}}><b>פרוטוקול:</b> {SR.therapist_notes.protocol}</p>}
 {SR.therapist_notes.cautions&&<p style={{fontSize:10.5,color:"#C0392B",lineHeight:1.5,marginTop:6}}>⚠️ {SR.therapist_notes.cautions}</p>}
 </div>
 )}
 <button onClick={closeModal} className="primary-btn" style={{width:"100%",padding:"12px 0",background:"linear-gradient(90deg,#C77B92,#D89AAE)",color:"#fff",fontSize:13}}>סגירה ✓</button>
 {!viewScan&&<p style={{fontSize:9.5,color:"#C9B8C2",textAlign:"center",marginTop:8}}>הסריקה נשמרה לכרטיס הלקוחה</p>}
 </div>
 </div>
      ); })()}

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
