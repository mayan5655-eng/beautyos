"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./supabase";
import FloralCorners from "./FloralCorners";

// ============================================================
// CONSTANTS
// ============================================================

const DEFAULT_SERVICES = [
  {name:"טיפול פנים",price:250,duration:60,color:"#D98BA0",active:true},
  {name:"הסרת שיער",price:180,duration:45,color:"#C68A5E",active:true},
  {name:"עיצוב גבות",price:80,duration:30,color:"#D9B98C",active:true},
  {name:"מניקור",price:120,duration:45,color:"#CBA15E",active:true},
  {name:"פדיקור",price:150,duration:60,color:"#B0764E",active:true},
  {name:"לק ג'ל",price:160,duration:60,color:"#E0C068",active:true},
  {name:"בוטוקס",price:800,duration:45,color:"#A67C52",active:true},
  {name:"פילינג",price:350,duration:60,color:"#C9A227",active:true},
  {name:"טיפול פלזמה",price:600,duration:60,color:"#8C6239",active:true},
  {name:"מכשור מתקדם",price:400,duration:60,color:"#BC8A5F",active:true},
];

const HOURS_ALL = ["07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"];
const DAYS_HE = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
const MONTHS_HE = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

// שיעור המע"מ — קבוע יחיד, קל לשינוי כשהשיעור משתנה.
const VAT_RATE = 0.18;
// קטגוריות הוצאה (מפתח DB -> תווית בעברית)
const EXPENSE_CATEGORIES = [
  {k:"materials",l:"חומרים"},
  {k:"equipment",l:"ציוד"},
  {k:"marketing",l:"שיווק"},
  {k:"rent",     l:"שכירות"},
  {k:"other",    l:"אחר"},
];
// הסתייגות משפטית שמופיעה בכל דוח מס (מסך + הדפסה).
const TAX_DISCLAIMER = "הדוח הוא לנוחותך בלבד. יש לבדוק את הנתונים מול רואה חשבון / יועץ מס לפני הגשה לרשויות. האחריות על הדיווח היא של בעל העסק.";

// ─── Subscription plans (mapping only — NOT used to gate anything yet) ───
//
// ⚠️ תחזוקה: כשמוסיפים פיצ'ר חדש למערכת — מוסיפים אותו כאן לרמות שאמורות
//    לקבל אותו. פיצ'ר שלא רשום בשום רמה = premium בלבד (ברירת מחדל).
//    כלומר אם מוסיפים פיצ'ר ולא מעדכנים את המיפוי, basic/pro לא יקבלו אותו
//    עד שיירשם להם במפורש — רק premium יקבל אותו.
//
// Feature keys (short, English) and what they mean:
//   clients   - ניהול לקוחות      calendar  - יומן תורים
//   cashier   - קופה              receipts  - קבלות
//   marketing - שיווק / קמפיינים  leads     - ניהול לידים
//   whatsapp  - בוט וואטסאפ אוטומטי
//   birthdays - ברכות יום הולדת אוטומטיות
//   reviews   - בקשות ביקורת אוטומטיות
//   advisor   - יועץ עסקי AI       skinscan  - סריקת עור AI
//   reels     - יוצר רילסים        community - קהילה
// Tiers are cumulative: pro includes basic, premium includes pro.
const _PLAN_BASIC   = ["clients","calendar","cashier","receipts"];
const _PLAN_PRO     = [..._PLAN_BASIC, "marketing","leads","whatsapp","birthdays","reviews"];
const _PLAN_PREMIUM = [..._PLAN_PRO, "advisor","skinscan","reels","community"];
const PLAN_FEATURES = {
  none:    [],            // עסק שעדיין לא בחר מנוי
  basic:   _PLAN_BASIC,
  pro:     _PLAN_PRO,
  premium: _PLAN_PREMIUM,
};

// planAllows(plan, feature) -> true/false: האם לרמה יש גישה לפיצ'ר.
//  • premium מקבל תמיד הכל — כולל פיצ'רים עתידיים שלא רשומים במיפוי
//    (כך שמשתמשת premium לעולם לא תיחסם בטעות).
//  • פיצ'ר שלא רשום במיפוי של basic/pro -> false עבורן (= premium-only כברירת מחדל).
const planAllows = (plan, feature) => {
  if (plan === "premium") return true;
  return (PLAN_FEATURES[plan] || []).includes(feature);
};
const SKIN_TYPES = ["יבש","שמן","מעורב","רגיש","נורמלי","אסתתי"];
const STATUS_COLORS = {"VIP":"#C9A24B","active":"#7BAE7F","cold":"#B8AFA0","hot":"#C68A5E"};
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
 "contacted": {label:"יצרתי קשר",  color:"#A67C52",bg:"#F7F1E6"},
 "scheduled": {label:"נקבע תור",   color:"#5C9460",bg:"#EEF6EF"},
 "closed":    {label:"נסגר",        color:"#7B1FA2",bg:"#F3E5F5"},
 "lost":      {label:"לא רלוונטי", color:"#C62828",bg:"#FEEBEE"},
};
const SOURCE_ICONS = {"פייסבוק":"◦","אינסטגרם":"◦","גוגל":"◦","טיקטוק":"◦","המלצה":"◦","הליכה ברחוב":"◦","אחר":"◦"};
const PAYMENT_METHODS = [
  {key:"מזומן",icon:"◦",color:"#C9A24B"},
  {key:"אשראי",icon:"◦",color:"#A67C52"},
  {key:"ביט",icon:"◦",color:"#C68A5E"},
  {key:"פייבוקס",icon:"◦",color:"#CBA15E"},
  {key:"העברה",icon:"◦",color:"#8C6239"},
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
  const [expenses,     setExpenses]     = useState([]);
  const [services,     setServices]     = useState(DEFAULT_SERVICES);
  const [packages,     setPackages]     = useState([]);
  const [waitlist,     setWaitlist]     = useState([]);
  const [settings,     setSettings]     = useState({business_name:"",therapist_name:"רונית",primary_color:"#D98BA0",working_hours_start:8,working_hours_end:19,business_phone:""});

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
  const emptyProtocol = {brand:"",name:"",concern:"",skin_types:[],frequency:"",sessions_count:1,duration_minutes:60,price:0,notes:""};
  const [newProtocol,      setNewProtocol]      = useState(emptyProtocol);
  const [showProtocolModal, setShowProtocolModal] = useState(false);
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
  // Connected Facebook page for THIS tenant (row from facebook_pages), or null if not connected
  const [fbPage,         setFbPage]         = useState(null);
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
  // AI business advisor chat
  const [advisorMessages, setAdvisorMessages] = useState(null); // null = not loaded yet
  const [advisorInput,    setAdvisorInput]    = useState("");
  const [advisorSending,  setAdvisorSending]  = useState(false);
  // Subscription plan of the logged-in business: none | basic | pro | premium.
  // Loaded in loadAll; NOT used to gate anything yet.
  const [currentPlan,     setCurrentPlan]     = useState("none");
  // Tax-report screen controls
  const [taxYear,        setTaxYear]       = useState(new Date().getFullYear());
  const [taxPeriodMode,  setTaxPeriodMode] = useState("bimonthly"); // monthly | bimonthly
  const [taxPeriodIdx,   setTaxPeriodIdx]  = useState(Math.floor(new Date().getMonth()/2));
  const [newExpense,     setNewExpense]    = useState({amount:"",expense_date:new Date().toISOString().slice(0,10),description:"",category:"materials"});
  // Beauty Voice
  const [showVoice,      setShowVoice]     = useState(false);
  const [voiceStatus,    setVoiceStatus]   = useState("listening"); // listening|processing|result|error|unsupported
  const [voiceTranscript,setVoiceTranscript]=useState("");
  const [voiceIntent,    setVoiceIntent]   = useState(null);
  const [voiceErr,       setVoiceErr]      = useState("");
  const [voiceBooking,   setVoiceBooking]  = useState(null); // editable draft before confirm
  const [voiceInfo,      setVoiceInfo]     = useState(null); // read-only result (day / revenue)
  const [voiceCancel,    setVoiceCancel]   = useState(null); // { matches:[], selected: appt|null }
  const [voiceCall,      setVoiceCall]     = useState(null); // { matches:[], selected: client|null }
  const [voiceReceipt,   setVoiceReceipt]  = useState(null); // { clientName, amount, payment }
  const recognitionRef = useRef(null);
  const [aiPostsView,    setAiPostsView]    = useState("create"); // create | saved | reels
  // AI reel generator
  const [reelTopic,   setReelTopic]   = useState("");
  const [reelData,    setReelData]    = useState(null);
  const [reelLoading, setReelLoading] = useState(false);
  const [reelError,   setReelError]   = useState(null);
  const [marketingView,  setMarketingView]  = useState("campaigns"); // campaigns | ai
  const [activeTab,         setActiveTab]          = useState("dashboard");
  const [clientTab,         setClientTab]          = useState("info");
  const [scanLoading,       setScanLoading]        = useState(false);
  const [scanReport,        setScanReport]         = useState(null);
  const [clientScans,       setClientScans]        = useState([]);
  const [clientPhotos,      setClientPhotos]       = useState([]);
  const [photoUploading,    setPhotoUploading]     = useState(false);
  const [scansLoading,      setScansLoading]       = useState(false);
  const [viewScan,          setViewScan]           = useState(null);
  const [communityPosts,    setCommunityPosts]     = useState([]);
  const [protocols,         setProtocols]         = useState([]);
  const [protocolsLoading,  setProtocolsLoading]   = useState(false);
  const [communityLoading,  setCommunityLoading]   = useState(false);
  const [showPostModal,     setShowPostModal]      = useState(false);
  const [designPost,        setDesignPost]         = useState(null);
  const [designing,         setDesigning]          = useState(false);
  const [designBg,          setDesignBg]           = useState(null);
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
  const [newService,     setNewService]     = useState({name:"",price:0,duration:60,color:"#D9B98C",active:true});
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

  // `action` (optional): { label, onClick } renders a button inside the toast
  // (e.g. "ביטול" for undo). Toasts with an action linger a bit longer.
  const toast = useCallback((msg, type = "success", action = null) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, msg, type, action }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), action ? 5500 : 3500);
  }, []);

  // Keyboard activation for clickable elements that aren't native buttons:
  // Enter/Space triggers the element's own onClick (via .click()).
  const onKbdActivate = (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); }
  };

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
  const pc = (settings&&settings.primary_color)||"#D98BA0";
  // Derived theme shades from the chosen primary color, so the whole app
  // recolors when the cosmetician picks a color in settings.
  const hexToRgb = (h) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h || "");
    return m ? { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) } : { r:217, g:139, b:160 };
  };
  const lighten = (h, amt) => {
    const c = hexToRgb(h);
    const f = (v) => Math.round(v + (255 - v) * amt);
    return `#${[f(c.r),f(c.g),f(c.b)].map(x=>x.toString(16).padStart(2,"0")).join("")}`;
  };
  const pcRgb = hexToRgb(pc);
  const pc2 = lighten(pc, 0.22);                 // lighter partner for gradients
  const pcSoft = `rgba(${pcRgb.r},${pcRgb.g},${pcRgb.b},0.10)`;  // soft tint backgrounds
  const pcTint = lighten(pc, 0.86);                              // light selected/hover bg
  const pcGrad = `linear-gradient(90deg,${pc},${pc2})`;
  const pcShadow = `rgba(${pcRgb.r},${pcRgb.g},${pcRgb.b},0.25)`;
  // Push the active palette into CSS variables for the static <style> block
  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty("--pc", pc);
    document.documentElement.style.setProperty("--pc-tint", pcTint);
  }
  const origin = typeof window!=="undefined"?window.location.origin:"";

  const activeServices = useMemo(() => services.filter(s=>s.active!==false), [services]);
  const workingHours = HOURS_ALL.slice(Math.max((settings?.working_hours_start||8)-7,0),Math.min((settings?.working_hours_end||19)-7,HOURS_ALL.length));
  const cashierTotal = Math.max(0,cashierItems.reduce((s,item)=>s+(item.price*item.qty),0)-Number(cashierDiscount||0));

  useEffect(()=>{ loadAll(); /* eslint-disable-next-line */ },[]);

  // Facebook connect: load the current connection state on mount, and handle the
  // return from the OAuth callback. The callback redirects back here with
  // ?fb_success=true (page connected) or ?fb_error=... — show a toast, then strip
  // those params so a refresh doesn't re-fire the message.
  useEffect(() => {
    loadFbConnection();
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("fb_success") === "true") {
        toast("הדף חובר בהצלחה ✦");
        loadFbConnection();
      } else if (params.get("fb_error")) {
        toast("החיבור נכשל, נסי שוב", "error");
      }
      if (params.has("fb_success") || params.has("fb_error") || params.has("pages")) {
        params.delete("fb_success"); params.delete("fb_error"); params.delete("pages");
        const qs = params.toString();
        window.history.replaceState({}, "", window.location.pathname + (qs ? "?" + qs : ""));
      }
    } catch { /* non-fatal */ }
    /* eslint-disable-next-line */
  }, []);

  // Esc closes any open modal / drawer (does not touch session/tenant logic).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setShowModal(false); setShowClientModal(false); setShowImportModal(false);
      setShowLeadModal(false); setShowCashier(false); setShowReceipt(null);
      setShowPackageModal(false); setShowWaitlistModal(false); setShowProtocolModal(false);
      setShowPostModal(false); setShowSettings(false); setShowNewService(false);
      setSelectedClient(null); setSelectedLead(null);
      setEditingClient(null); setEditingLead(null); setEditSettings(null);
      setConfirmDialog(null); setShowMobileSidebar(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // When a modal opens, focus its first input field (all modals use .modal-card).
  const anyModalOpen = showModal||showClientModal||showImportModal||showLeadModal||
    showCashier||!!showReceipt||showPackageModal||showWaitlistModal||showProtocolModal||
    showPostModal||showSettings||!!confirmDialog;
  useEffect(() => {
    if (!anyModalOpen) return;
    const id = setTimeout(() => {
      const el = document.querySelector('.modal-card input:not([type="hidden"]):not([type="file"]), .modal-card textarea, .modal-card select');
      if (el) { try { el.focus(); } catch {} }
    }, 60);
    return () => clearTimeout(id);
  }, [anyModalOpen]);

  // Load skin-scan history whenever a client card is opened
  useEffect(() => {
   if (selectedClient?.id) { loadClientScans(selectedClient.id); loadClientPhotos(selectedClient.id); }
    else { setClientScans([]); setClientPhotos([]); }
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
    if (activeTab === "protocols") loadProtocols();
    if (activeTab === "advisor" && advisorMessages === null) loadAdvisor();
    /* eslint-disable-next-line */
  }, [activeTab]);

  // Keep the advisor chat scrolled to the latest message.
  useEffect(() => {
    const el = document.getElementById("advisor-scroll");
    if (el) el.scrollTop = el.scrollHeight;
  }, [advisorMessages, advisorSending]);

  const loadAll = async () => {
    try {
      // Get the logged-in user and their tenant, to load the correct settings row.
      // No session → redirect to login instead of rendering the app "logged out"
      // (which is what let writes fail silently with auth.uid() = NULL).
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      // Resolve the tenant with the SAME function the RLS policies use.
      // Reading tenant_members directly from the client is itself gated by
      // RLS and often returns null, which then mis-selects the settings row.
      const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
      const myTenantId = rpcTenant || null;
      const [a,c,f,l,sv,st,r,pk,wl,ex,tn] = await Promise.all([
        supabase.from("appointments").select("*"),
        supabase.from("clients").select("*"),
        supabase.from("forms").select("*"),
        supabase.from("leads").select("*"),
        supabase.from("service_prices").select("*"),
        supabase.from("settings").select("*"),
        supabase.from("receipts").select("*"),
        supabase.from("packages").select("*"),
        supabase.from("waitlist").select("*"),
        // Business expenses (for input-VAT in tax reports). RLS-scoped to tenant.
        supabase.from("expenses").select("*"),
        // Subscription plan for this tenant (read-only; no gating yet).
        supabase.from("tenants").select("plan").eq("id", myTenantId).maybeSingle(),
      ]);
      // Safe default 'none' if the row/column is missing for any reason.
      const plan = tn?.data?.plan || "none";
      setCurrentPlan(plan);
      console.log("[BeautyOS] current plan:", plan);
      if(a.data)  setAppointments(a.data);
      if(c.data)  setClients(c.data);
      if(f.data)  setForms(f.data);
      if(l.data)  setLeads(l.data);
      if(sv.data&&sv.data.length>0) setServices(sv.data);
      if(st.data && st.data.length === 0) { router.replace("/onboarding"); return; }
      if(st.data && st.data.length > 0) {
        // Pick the settings row for this user's tenant. Fall back to the most
        // recently created row (not an arbitrary array index) so the choice is
        // stable across refreshes and a just-saved row isn't masked by a stale one.
        const myRow = st.data.find(s => s.tenant_id === myTenantId)
          || [...st.data].sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")))[0];
        setSettings(myRow);
      }
      if(r.data)  setReceipts(r.data);
      if(ex?.data) setExpenses(ex.data);
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
  const weekAppts     = useMemo(() => appointments.filter(a=>{if(!a.date)return false;const d=new Date(a.date);const ws=new Date(weekStart);const we=new Date(weekStart);we.setDate(we.getDate()+5);return d>=ws&&d<=we;}), [appointments, weekStart]);
  const thisMonthAppts = useMemo(() => appointments.filter(a=>{if(!a.date)return false;const d=new Date(a.date);return d.getMonth()===thisMonth&&d.getFullYear()===thisYear;}), [appointments, thisMonth, thisYear]);

  const getLastAppt    = (cid) => appointments.filter(a=>String(a.client_id)===String(cid)).sort((a,b)=>(b.date||"").localeCompare(a.date||""))[0];
  const getDaysSince   = (cid) => {const l=getLastAppt(cid);if(!l?.date)return 999;return Math.floor((now-new Date(l.date))/(1000*60*60*24));};
  const getClientTotal = (cid) => receipts.filter(r=>String(r.client_id)===String(cid)).reduce((s,r)=>s+(Number(r.amount)||0),0);
  const getClientAppts = (cid) => appointments.filter(a=>String(a.client_id)===String(cid));
  const getClientForms = (cid) => forms.filter(f=>String(f.client_id)===String(cid));
  const getClientReceipts = (cid) => receipts.filter(r=>String(r.client_id)===String(cid));
  const getClientPackages = (cid) => packages.filter(p=>String(p.client_id)===String(cid)&&p.active);

  const activeClients = useMemo(() => clients.filter(c=>getDaysSince(c.id)<=60), [clients, appointments, today]);
  const coldClients   = useMemo(() => clients.filter(c=>getDaysSince(c.id)>60), [clients, appointments, today]);
  const topClients    = useMemo(() => [...clients].sort((a,b)=>getClientTotal(b.id)-getClientTotal(a.id)).filter(c=>getClientTotal(c.id)>0).slice(0,5), [clients, receipts]);

  const serviceStats = useMemo(() => activeServices.map(s=>({name:s.name,color:s.color,count:appointments.filter(a=>a.service===s.name).length,revenue:receipts.filter(r=>r.service===s.name).reduce((sum,r)=>sum+(Number(r.amount)||0),0)})).sort((a,b)=>b.count-a.count), [activeServices, appointments, receipts]);
  const avgTransaction = useMemo(() => receipts.length>0?Math.round(receipts.reduce((s,r)=>s+(Number(r.amount)||0),0)/receipts.length):0, [receipts]);

  const monthlyData = useMemo(() => Array.from({length:6},(_,i)=>{
    const d=new Date(now);d.setMonth(now.getMonth()-(5-i));
    const m=d.getMonth(),y=d.getFullYear();
    const appts=appointments.filter(a=>{if(!a.date)return false;const ad=new Date(a.date);return ad.getMonth()===m&&ad.getFullYear()===y;});
    const rev=receipts.filter(r=>{if(!r.created_at)return false;const rd=new Date(r.created_at);return rd.getMonth()===m&&rd.getFullYear()===y;}).reduce((s,r)=>s+(Number(r.amount)||0),0);
    return {month:MONTHS_HE[m].slice(0,3),count:appts.length,revenue:rev};
  /* now is derived from thisMonth/thisYear, which gate this memo */ }), [appointments, receipts, thisMonth, thisYear]);

  const upcomingBirthdays = useMemo(() => clients.filter(c=>{
    if(!c.birthday)return false;
    try{const b=new Date(c.birthday);const bd=new Date(now.getFullYear(),b.getMonth(),b.getDate());if(bd<now)bd.setFullYear(now.getFullYear()+1);return Math.floor((bd-now)/(1000*60*60*24))<=30&&Math.floor((bd-now)/(1000*60*60*24))>=0;}catch{return false;}
  }).sort((a,b)=>{const days=(c)=>{const bx=new Date(c.birthday);const bd=new Date(now.getFullYear(),bx.getMonth(),bx.getDate());if(bd<now)bd.setFullYear(now.getFullYear()+1);return Math.floor((bd-now)/(1000*60*60*24));};return days(a)-days(b);})
  /* now is gated by `today` (changes daily) */ , [clients, today]);

  const tomorrowConfirmed  = tomorrowAppts.filter(a=>a.confirmation_status==="confirmed").length;
  const tomorrowCancelled  = tomorrowAppts.filter(a=>a.confirmation_status==="cancelled").length;
  const tomorrowPending    = tomorrowAppts.filter(a=>!a.confirmation_status||a.confirmation_status==="pending").length;

  const newLeadsCount      = leads.filter(l=>l.status==="new").length;
  const thisMonthLeads     = leads.filter(l=>{if(!l.created_at)return false;const d=new Date(l.created_at);return d.getMonth()===thisMonth&&d.getFullYear()===thisYear;});
  const convertedLeads     = leads.filter(l=>l.status==="closed");
  const conversionRate     = leads.length>0?Math.round((convertedLeads.length/leads.length)*100):0;
  const leadsWithReminders = leads.filter(l=>l.reminder_date&&l.reminder_date<=tomorrow&&l.status!=="closed"&&l.status!=="lost");

  const campaignStats = useMemo(() => LEAD_SOURCES.map(source=>{
    const sourceLeads=leads.filter(l=>l.source===source);
    const converted=sourceLeads.filter(l=>l.status==="closed");
    const revenue=converted.reduce((sum,l)=>{if(!l.client_id)return sum;return sum+receipts.filter(r=>String(r.client_id)===String(l.client_id)).reduce((s,r)=>s+(Number(r.amount)||0),0);},0);
    return {source,icon:SOURCE_ICONS[source],total:sourceLeads.length,converted:converted.length,revenue,rate:sourceLeads.length>0?Math.round((converted.length/sourceLeads.length)*100):0};
  }).filter(s=>s.total>0).sort((a,b)=>b.revenue-a.revenue), [leads, receipts]);

  const paymentBreakdown = useMemo(() => PAYMENT_METHODS.map(m=>({...m,total:receipts.filter(r=>r.payment_method===m.key).reduce((s,r)=>s+(Number(r.amount)||0),0),count:receipts.filter(r=>r.payment_method===m.key).length})).filter(m=>m.count>0), [receipts]);
  const filteredReceipts = receiptFilter==="all"?receipts:receipts.filter(r=>r.payment_method===receiptFilter);

  const filteredLeads = useMemo(() => leads.filter(l=>{
    const matchSearch=!leadSearch||l.name?.includes(leadSearch)||l.phone?.includes(leadSearch);
    const matchFilter=leadFilter==="all"||l.status===leadFilter;
    const matchSource=leadSourceFilter==="all"||l.source===leadSourceFilter;
    return matchSearch&&matchFilter&&matchSource;
  }).sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||"")), [leads, leadSearch, leadFilter, leadSourceFilter]);

  const filteredClients = useMemo(() => clients.filter(c=>{
    const matchSearch=!searchQuery||c.name?.includes(searchQuery)||c.phone?.includes(searchQuery);
    const matchStatus=filterStatus==="all"||c.status===filterStatus||(filterStatus==="cold"&&getDaysSince(c.id)>60)||(filterStatus==="active"&&getDaysSince(c.id)<=60);
    const matchSkin=filterSkin==="all"||c.skinType===filterSkin;
    return matchSearch&&matchStatus&&matchSkin;
  }), [clients, appointments, searchQuery, filterStatus, filterSkin, today]);

  const globalResults = globalSearch.length<2?[]:[
    ...clients.filter(c=>c.name?.includes(globalSearch)||c.phone?.includes(globalSearch)).map(c=>({type:"client",label:c.name,sub:c.phone||"",obj:c})),
    ...leads.filter(l=>l.name?.includes(globalSearch)||l.phone?.includes(globalSearch)).map(l=>({type:"lead",label:l.name,sub:l.source,obj:l})),
    ...appointments.filter(a=>a.name?.includes(globalSearch)).map(a=>({type:"appt",label:a.name,sub:a.service+" · "+a.date,obj:a})),
  ].slice(0,8);

  const getAppt = (date,hour) => appointments.find(a=>a.date===formatDate(date)&&Number(a.hour)===Number(hour));

  const getApptColor = (appt) => {
    if(appt.confirmation_status==="confirmed") return "#7BAE7F";
    if(appt.confirmation_status==="cancelled") return "#F44336";
    return appt.color||"#D9B98C";
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
      const svcColor=activeServices.find(s=>s.name===newAppt.service)?.color||"#D9B98C";
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
        // Undo: re-insert the appointment (DB assigns a fresh id; tenant_id is
        // preserved so the RLS check still passes).
        const restore = async () => {
          const { id, created_at, ...rest } = appt;
          const { data, error: rErr } = await supabase.from("appointments").insert([rest]).select();
          if (rErr) { handleDbError(rErr, "restore appointment"); return; }
          if (data) setAppointments(prev=>[...prev, data[0]]);
          toast("התור שוחזר");
        };
        toast("התור נמחק", "success", { label: "ביטול", onClick: restore });
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
      // Resolve the tenant with the SAME function the RLS policies use
      // (get_user_tenant_id). Reading tenant_members directly from the client is
      // itself gated by RLS and frequently returns null - which made tenant_id
      // wrong, the UPDATE miss 0 rows, and the INSERT fail with an empty {} error.
      const { data: rpcTenant, error: rpcErr } = await supabase.rpc("get_user_tenant_id");
      const { data: { user: dbgUser } } = await supabase.auth.getUser();
      console.log("[SETTINGS DEBUG] auth user id:", dbgUser?.id);
      console.log("[SETTINGS DEBUG] rpc get_user_tenant_id ->", { rpcTenant, rpcErr: rpcErr && { message: rpcErr.message, code: rpcErr.code, details: rpcErr.details, hint: rpcErr.hint } });
      console.log("[SETTINGS DEBUG] settings.id / settings.tenant_id in state:", settings.id, settings.tenant_id);
      const tenantId = rpcTenant || settings.tenant_id || null;
      console.log("[SETTINGS DEBUG] resolved tenantId:", tenantId);
      if (!tenantId) {
        toast("לא זוהה עסק - נסי לצאת ולהיכנס שוב", "error");
        return;
      }

      // Build a clean payload: editable fields only. Never write the primary key
      // or created_at (immutable / generated), and always stamp the resolved
      // tenant_id so the RLS WITH CHECK passes.
      const payload = { ...editSettings };
      delete payload.id;
      delete payload.created_at;
      delete payload.tenant_id;
      payload.tenant_id = tenantId;
      if ("bot_active" in payload) {
        payload.bot_active = !(payload.bot_active === false || payload.bot_active === "false");
      }

      // Update the tenant's existing settings row. We key on tenant_id (not the
      // cached settings.id) so the write lines up exactly with the RLS USING
      // clause and can't miss because of a stale/empty id in state.
      console.log("[SETTINGS DEBUG] UPDATE payload:", JSON.stringify(payload));
      let savedRow = null;
      const {data:upd,error:updErr} = await supabase.from("settings").update(payload).eq("tenant_id",tenantId).select();
      console.log("[SETTINGS DEBUG] UPDATE result -> rows:", upd, "| error:", updErr && { message: updErr.message, code: updErr.code, details: updErr.details, hint: updErr.hint });
      if (updErr) { handleDbError(updErr, "update settings"); return; }
      savedRow = (upd && upd[0]) || null;

      // Only create a row if this tenant genuinely has none yet.
      if (!savedRow) {
        console.log("[SETTINGS DEBUG] UPDATE matched 0 rows -> attempting INSERT");
        const {data:ins,error:insErr} = await supabase.from("settings").insert([payload]).select();
        console.log("[SETTINGS DEBUG] INSERT result -> rows:", ins, "| error:", insErr && { message: insErr.message, code: insErr.code, details: insErr.details, hint: insErr.hint });
        if (insErr) { handleDbError(insErr, "create settings"); return; }
        savedRow = (ins && ins[0]) || null;
      }
      if (!savedRow) {
        // Both paths returned 0 rows - this is an RLS / permissions problem,
        // not a success. Tell the truth instead of toasting "saved".
        toast("השמירה נכשלה - אין הרשאה לעדכן את ההגדרות", "error");
        return;
      }
      setSettings(savedRow);
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
    if(data){setServices(prev=>[...prev,data[0]]);setNewService({name:"",price:0,duration:60,color:"#D9B98C",active:true});setShowNewService(false); toast("השירות נוסף");}
  };

  const handleOpenCashier = (appt) => {
    setCashierAppt(appt||null);
    if(appt){
      const client=clients.find(c=>String(c.id)===String(appt.client_id));
      setCashierClient(client||null);setCashierSearch(client?.name||"");
      const svc=activeServices.find(s=>s.name===appt.service);
      setCashierItems([{id:Date.now(),name:appt.service,price:svc?.price||appt.price||0,qty:1,color:svc?.color||"#D9B98C"}]);
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
      // Auto-send the receipt to the client on WhatsApp when enabled in settings.
      // Fire-and-forget: never blocks or breaks receipt creation; only warns on
      // failure. Uses the same sendReceiptToClient the manual button uses.
      if((settings.send_receipt_auto===true||settings.send_receipt_auto==="true") && cashierClient?.phone){
        sendReceiptToClient(data[0],{silent:true})
          .then(ok=>{ if(!ok) toast("הקבלה נוצרה, אך השליחה ללקוחה נכשלה","error"); })
          .catch(()=>toast("הקבלה נוצרה, אך השליחה ללקוחה נכשלה","error"));
      }
      setShowCashier(false);setShowReceipt(data[0]);
      setCashierItems([]);setCashierClient(null);setCashierSearch("");setCashierDiscount(0);setCashierNote("");setCashierAppt(null);
      toast(`קבלה נוצרה — ₪${cashierTotal}`);
    } finally {
      setBusyKey("saveReceipt", false);
    }
  };

  // Add a business expense (tenant_id is filled by the DB column default).
  const handleAddExpense = async () => {
    const amt = Number(newExpense.amount);
    if(!amt || amt<=0){ toast("נא להזין סכום תקין","error"); return; }
    if(!newExpense.expense_date){ toast("נא לבחור תאריך","error"); return; }
    if(isBusy("addExpense")) return;
    setBusyKey("addExpense", true);
    try {
      const payload = {
        amount: amt,
        expense_date: newExpense.expense_date,
        description: (newExpense.description||"").trim(),
        category: newExpense.category,
      };
      const {data,error} = await supabase.from("expenses").insert([payload]).select();
      if(error){ handleDbError(error,"add expense"); return; }
      if(data) setExpenses(prev=>[...prev, data[0]]);
      // Keep the chosen date + category for the next entry; clear amount + text.
      setNewExpense(prev=>({...prev, amount:"", description:""}));
      toast("ההוצאה נוספה");
    } finally {
      setBusyKey("addExpense", false);
    }
  };

  const handleDeleteExpense = (exp) => {
    askConfirm({
      title: "מחיקת הוצאה",
      message: `למחוק את ההוצאה${exp.description?` "${exp.description}"`:""} (₪${Number(exp.amount).toLocaleString()})?`,
      confirmText: "מחיקה",
      danger: true,
      onConfirm: async () => {
        const {error} = await supabase.from("expenses").delete().eq("id", exp.id);
        if(error){ handleDbError(error,"delete expense"); return; }
        setExpenses(prev=>prev.filter(e=>e.id!==exp.id));
        toast("ההוצאה נמחקה");
      },
    });
  };

  // ─── Beauty Voice: listen (Web Speech API) → understand (/api/voice-intent) ───
  const stopRecognition = () => {
    try { if (recognitionRef.current) recognitionRef.current.stop(); } catch {}
    recognitionRef.current = null;
  };
  const closeVoice = () => { stopRecognition(); setShowVoice(false); };

  const processVoice = async (transcript) => {
    setVoiceStatus("processing");
    try {
      const res = await fetch("/api/voice-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, today }),
      });
      const data = await res.json();
      if (res.ok && data.intent) {
        const intent = data.intent;
        setVoiceIntent(intent);
        if (intent.action === "book_appointment") prepareBooking(intent);
        else if (intent.action === "show_day") showDayInfo(intent);
        else if (intent.action === "revenue_summary") revenueInfo(intent);
        else if (intent.action === "cancel_appointment") prepareCancel(intent);
        else if (intent.action === "call_client") prepareCall(intent);
        else if (intent.action === "create_receipt") prepareReceipt(intent);
        else setVoiceStatus("result");
      } else { setVoiceErr(data.error || "לא הצלחתי להבין את הבקשה"); setVoiceStatus("error"); }
    } catch (err) {
      setVoiceErr(err.message); setVoiceStatus("error");
    }
  };

  // show_day: read-only list of the requested day's appointments (from state).
  const showDayInfo = (intent) => {
    const d = intent.date || today;
    const list = appointments.filter(a => a.date === d)
      .sort((a,b) => (Number(a.hour)||0) - (Number(b.hour)||0));
    setVoiceInfo({ kind: "day", date: d, items: list.map(a => ({ name: a.name, hour: a.hour, service: a.service })) });
    setVoiceStatus("info");
  };

  // revenue_summary: sum receipts for today / this month (read-only).
  const revenueInfo = (intent) => {
    const period = intent.period === "today" ? "today" : "month";
    const rs = period === "today"
      ? receipts.filter(r => (r.created_at||"").slice(0,10) === today)
      : receipts.filter(r => { const c = r.created_at && new Date(r.created_at); return c && c.getMonth() === thisMonth && c.getFullYear() === thisYear; });
    const total = rs.reduce((s,r) => s + (Number(r.amount)||0), 0);
    setVoiceInfo({ kind: "revenue", period, total, count: rs.length });
    setVoiceStatus("info");
  };

  // create_receipt: build an editable receipt draft (matching an existing client
  // if any). Nothing is created here — only on explicit confirm.
  const prepareReceipt = (intent) => {
    const nameSpoken = (intent.client_name || "").trim();
    let matched = null;
    if (nameSpoken) {
      const low = nameSpoken.toLowerCase();
      matched = clients.find(c => (c.name||"").trim().toLowerCase() === low)
             || clients.find(c => (c.name||"").toLowerCase().includes(low));
    }
    const payMap = { cash: "מזומן", card: "אשראי", bit: "ביט" };
    setVoiceReceipt({
      clientName: matched ? matched.name : nameSpoken,
      amount: (intent.amount != null && intent.amount !== "") ? String(intent.amount) : "",
      payment: payMap[intent.payment_method] || "מזומן",
    });
    setVoiceStatus("receipt");
  };

  // Create the receipt (and the client, if new) — ONLY on explicit confirm.
  // Mirrors handleSaveReceipt's DB fields; tenant_id is filled by the DB default.
  const handleVoiceReceipt = async () => {
    const b = voiceReceipt;
    if (!b) return;
    if (!b.clientName.trim()) { toast("חסר שם לקוחה", "error"); return; }
    const amt = Number(b.amount);
    if (!amt || amt <= 0) { toast("נא להזין סכום תקין", "error"); return; }
    if (isBusy("voiceReceipt")) return;
    setBusyKey("voiceReceipt", true);
    try {
      // Resolve the client: reuse an exact match, otherwise create a new one.
      let clientId = null;
      let clientName = b.clientName.trim();
      const existing = clients.find(c => (c.name||"").trim().toLowerCase() === clientName.toLowerCase());
      if (existing) { clientId = existing.id; clientName = existing.name; }
      else {
        const {data:nc,error:ce} = await supabase.from("clients")
          .insert([{name:clientName,phone:"",skinType:"",notes:"",status:"active"}]).select();
        if (ce) { handleDbError(ce, "create client (voice receipt)"); return; }
        if (nc?.[0]) { clientId = nc[0].id; setClients(prev=>[...prev, nc[0]]); }
      }
      const receipt = {
        client_id: clientId,
        client_name: clientName,
        appointment_id: null,
        service: "תשלום",
        amount: amt,
        payment_method: b.payment,
        note: "",
        items: JSON.stringify([]),
        discount: 0,
      };
      const {data,error} = await supabase.from("receipts").insert([receipt]).select();
      if (error) { handleDbError(error, "create receipt (voice)"); return; }
      closeVoice();
      toast("הקבלה הופקה ✦");
      // Open the receipt modal so the voice receipt gets the same actions
      // (print / manual "send to client") as a regular receipt.
      if (data) {
        setReceipts(prev=>[...prev, data[0]]);
        setShowReceipt(data[0]);
        // Auto-send to the client on WhatsApp when enabled (same helper as the
        // manual button). Fire-and-forget — never blocks or breaks creation.
        const cl = clients.find(c=>String(c.id)===String(data[0].client_id));
        if ((settings.send_receipt_auto===true||settings.send_receipt_auto==="true") && cl?.phone) {
          sendReceiptToClient(data[0],{silent:true})
            .then(ok=>{ if(!ok) toast("הקבלה נוצרה, אך השליחה ללקוחה נכשלה","error"); })
            .catch(()=>toast("הקבלה נוצרה, אך השליחה ללקוחה נכשלה","error"));
        }
      }
    } finally {
      setBusyKey("voiceReceipt", false);
    }
  };

  // Send a receipt summary to the client's WhatsApp via GreenAPI (server route
  // /api/send-receipt, which reuses lib/whatsapp.js — the same mechanism as
  // booking confirmations). Only sends when the client has a phone number.
  // `silent` suppresses toasts for the auto-send path. Returns true on success.
  const sendReceiptToClient = async (receipt, { silent = false } = {}) => {
    if (!receipt) return false;
    // Resolve the phone from the tenant's own client row; fall back to any
    // phone already on the receipt object.
    const cl = clients.find(c => String(c.id) === String(receipt.client_id));
    const phone = (cl?.phone || receipt.client_phone || "").trim();
    if (!phone) { if (!silent) toast("ללקוחה אין מספר טלפון", "error"); return false; }
    try {
      const res = await fetch("/api/send-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: settings.tenant_id,
          client_name: receipt.client_name,
          client_phone: phone,
          amount: receipt.amount,
          payment_method: receipt.payment_method,
          date: (receipt.created_at || "").slice(0, 10),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) { if (!silent) toast("שליחת הקבלה נכשלה", "error"); return false; }
      if (!silent) toast("הקבלה נשלחה ללקוחה ב-WhatsApp ✦");
      return true;
    } catch {
      if (!silent) toast("שליחת הקבלה נכשלה", "error");
      return false;
    }
  };

  // call_client: find the client by name; the call itself just opens tel:.
  const prepareCall = (intent) => {
    const nameSpoken = (intent.client_name || "").trim();
    if (!nameSpoken) { setVoiceErr("לא זוהה שם לקוחה לחיוג. נסי שוב."); setVoiceStatus("error"); return; }
    const low = nameSpoken.toLowerCase();
    let matches = clients.filter(c => (c.name||"").trim().toLowerCase() === low);
    if (matches.length === 0) matches = clients.filter(c => (c.name||"").toLowerCase().includes(low));
    if (matches.length === 0) { setVoiceErr(`לא מצאתי לקוחה בשם ${nameSpoken}`); setVoiceStatus("error"); return; }
    setVoiceCall({ matches, selected: matches.length === 1 ? matches[0] : null });
    setVoiceStatus("call");
  };

  // cancel_appointment: find matching appointments (by name, then date) — nothing
  // is deleted here; deletion happens only on explicit confirm.
  const prepareCancel = (intent) => {
    const nameSpoken = (intent.client_name || "").trim();
    if (!nameSpoken) { setVoiceErr("לא זוהה שם לקוחה לביטול. נסי שוב."); setVoiceStatus("error"); return; }
    const low = nameSpoken.toLowerCase();
    let matches = appointments.filter(a => (a.name||"").trim().toLowerCase() === low);
    if (matches.length === 0) matches = appointments.filter(a => (a.name||"").toLowerCase().includes(low));
    if (intent.date) matches = matches.filter(a => a.date === intent.date);
    if (matches.length === 0) { setVoiceErr(`לא מצאתי תור תואם ל${nameSpoken}`); setVoiceStatus("error"); return; }
    matches = [...matches].sort((a,b) => String(a.date||"").localeCompare(String(b.date||"")) || (Number(a.hour)||0)-(Number(b.hour)||0));
    setVoiceCancel({ matches, selected: matches.length === 1 ? matches[0] : null });
    setVoiceStatus("cancel");
  };

  // Delete the selected appointment — ONLY on explicit confirm (same as handleDelete).
  const handleVoiceCancel = async () => {
    const appt = voiceCancel?.selected;
    if (!appt) return;
    if (isBusy("voiceCancel")) return;
    setBusyKey("voiceCancel", true);
    try {
      const {error} = await supabase.from("appointments").delete().eq("id", appt.id);
      if (error) { handleDbError(error, "cancel appointment (voice)"); return; }
      setAppointments(prev => prev.filter(a => a.id !== appt.id));
      closeVoice();
      toast("התור בוטל");
    } finally {
      setBusyKey("voiceCancel", false);
    }
  };

  // Build an editable booking draft from the intent (matching against the
  // tenant's own clients/services already in state). Nothing is created here.
  const prepareBooking = (intent) => {
    const nameSpoken = (intent.client_name || "").trim();
    let matched = null;
    if (nameSpoken) {
      const low = nameSpoken.toLowerCase();
      matched = clients.find(c => (c.name||"").trim().toLowerCase() === low)
             || clients.find(c => (c.name||"").toLowerCase().includes(low));
    }
    const svcSpoken = (intent.service || "").trim();
    let svc = null;
    if (svcSpoken) {
      const low = svcSpoken.toLowerCase();
      svc = activeServices.find(s => (s.name||"").toLowerCase() === low)
         || activeServices.find(s => (s.name||"").toLowerCase().includes(low) || low.includes((s.name||"").toLowerCase()));
    }
    setVoiceBooking({
      clientName: matched ? matched.name : nameSpoken,
      service: svc ? svc.name : "",
      date: intent.date || today,
      time: intent.time || "",
    });
    setVoiceStatus("confirm");
  };

  // Create the appointment (and the client, if new) — ONLY on explicit confirm.
  // Mirrors the regular booking flow (same table, tenant_id filled by DB default).
  const handleVoiceBook = async () => {
    const b = voiceBooking;
    if (!b) return;
    if (!b.clientName.trim()) { toast("חסר שם לקוחה", "error"); return; }
    if (!b.service) { toast("נא לבחור שירות", "error"); return; }
    if (!b.date || !b.time) { toast("נא לבחור תאריך ושעה", "error"); return; }
    if (isBusy("voiceBook")) return;
    setBusyKey("voiceBook", true);
    try {
      // Resolve client: reuse an exact-name match, otherwise create a new one.
      let clientId = null;
      const low = b.clientName.trim().toLowerCase();
      const existing = clients.find(c => (c.name||"").trim().toLowerCase() === low);
      if (existing) {
        clientId = existing.id;
      } else {
        const {data:nc,error:ce} = await supabase.from("clients")
          .insert([{name:b.clientName.trim(),phone:"",skinType:"",notes:"",status:"active"}]).select();
        if (ce) { handleDbError(ce, "create client (voice)"); return; }
        if (nc?.[0]) { clientId = nc[0].id; setClients(prev=>[...prev, nc[0]]); }
      }
      const svc = activeServices.find(s => s.name === b.service);
      const hourNum = Number((b.time||"").split(":")[0]) || 0; // schema stores whole hours
      const appt = {
        date: b.date,
        hour: hourNum,
        name: b.clientName.trim(),
        service: b.service,
        duration: svc?.duration || 60,
        color: svc?.color || "#D9B98C",
        client_id: clientId,
        note: "",
        price: svc?.price || 0,
        confirmation_status: "pending",
        confirmation_sent: false,
      };
      const {data,error} = await supabase.from("appointments").insert([appt]).select();
      if (error) { handleDbError(error, "create appointment (voice)"); return; }
      if (data) setAppointments(prev=>[...prev, data[0]]);
      closeVoice();
      toast("התור נקבע ✦");
    } finally {
      setBusyKey("voiceBook", false);
    }
  };

  const startVoice = () => {
    const SR = (typeof window !== "undefined") && (window.SpeechRecognition || window.webkitSpeechRecognition);
    setVoiceIntent(null); setVoiceTranscript(""); setVoiceErr("");
    setShowVoice(true);
    if (!SR) { setVoiceStatus("unsupported"); return; }
    setVoiceStatus("listening");
    const rec = new SR();
    rec.lang = "he-IL";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const t = (e.results && e.results[0] && e.results[0][0] && e.results[0][0].transcript) || "";
      setVoiceTranscript(t);
      if (t) processVoice(t);
    };
    rec.onerror = (e) => {
      setVoiceErr(e.error === "not-allowed" || e.error === "service-not-allowed"
        ? "אין הרשאת מיקרופון. אפשרי גישה בדפדפן ונסי שוב."
        : "שגיאה בהאזנה. נסי שוב.");
      setVoiceStatus("error");
    };
    // If listening ended with no result, surface a gentle retry state.
    rec.onend = () => { setVoiceStatus(s => s === "listening" ? "error" : s); };
    recognitionRef.current = rec;
    try { rec.start(); } catch { setVoiceStatus("error"); setVoiceErr("לא ניתן להפעיל את המיקרופון"); }
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

  const handleSaveProtocol = async () => {
    if(!newProtocol.brand||!newProtocol.name){toast("נא למלא מותג ושם","error");return;}
    const {data,error}=await supabase.from("treatment_protocols").insert([newProtocol]).select();
    if(error){handleDbError(error, "save protocol"); return;}
    if(data){setProtocols(prev=>[data[0],...prev]);setShowProtocolModal(false);setNewProtocol(emptyProtocol);toast("הפרוטוקול נשמר");}
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

  // Load all before/after photos for a client (newest first)
  const loadClientPhotos = async (clientId) => {
    try {
      const { data } = await supabase
        .from("client_photos")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      setClientPhotos(data || []);
    } catch { setClientPhotos([]); }
  };

  // Upload a before/after photo pair for a client
  const uploadClientPhoto = async (beforeFile, afterFile, treatment, note, clientId) => {
    if (!beforeFile && !afterFile) { toast("בחרי לפחות תמונה אחת", "error"); return; }
    setPhotoUploading(true);
    try {
      let beforeUrl = null, afterUrl = null;
      if (beforeFile) {
        const { blob } = await compressImage(beforeFile, 1280, 0.82);
        const fn = `photos/${clientId}/before-${Date.now()}.jpg`;
        await supabase.storage.from("client-images").upload(fn, blob, { contentType: "image/jpeg" });
        beforeUrl = supabase.storage.from("client-images").getPublicUrl(fn).data.publicUrl;
      }
      if (afterFile) {
        const { blob } = await compressImage(afterFile, 1280, 0.82);
        const fn = `photos/${clientId}/after-${Date.now()}.jpg`;
        await supabase.storage.from("client-images").upload(fn, blob, { contentType: "image/jpeg" });
        afterUrl = supabase.storage.from("client-images").getPublicUrl(fn).data.publicUrl;
      }
      const { error } = await supabase.from("client_photos").insert([{
       tenant_id: settings.tenant_id,
        client_id: clientId,
        before_url: beforeUrl,
        after_url: afterUrl,
        treatment: treatment || null,
        note: note || null,
      }]);
      if (error) { handleDbError(error, "save client photo"); return; }
      toast("התמונות נשמרו");
      loadClientPhotos(clientId);
    } catch { toast("שגיאה בהעלאת התמונות", "error"); }
    finally { setPhotoUploading(false); }
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

  // Is a Facebook page connected for THIS tenant? Mirrors the campaigns route's
  // check (facebook_pages, is_active). RLS scopes the query to the tenant, so we
  // never see another business's page.
  const loadFbConnection = async () => {
    try {
      const { data } = await supabase
        .from("facebook_pages")
        .select("page_name")
        .eq("is_active", true)
        .limit(1);
      setFbPage(data && data.length > 0 ? data[0] : null);
    } catch { /* non-fatal — leave as not-connected */ }
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

  const generateReel = async () => {
    if (!reelTopic.trim()) { toast("כתבי נושא לרילס", "error"); return; }
    if (reelLoading) return;
    setReelLoading(true); setReelError(null); setReelData(null);
    try {
      const res = await fetch("/api/marketing/reel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: reelTopic.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.reel) {
        setReelData(data.reel);
      } else {
        setReelError(data.error || "יצירת הרילס נכשלה");
      }
    } catch (err) {
      setReelError(err.message);
    } finally {
      setReelLoading(false);
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
  };

  // Load the AI advisor conversation history (tenant resolved server-side).
  const loadAdvisor = async () => {
    try {
      const res = await fetch("/api/advisor");
      const data = await res.json();
      setAdvisorMessages(res.ok && Array.isArray(data.messages) ? data.messages : []);
    } catch { setAdvisorMessages([]); }
  };

  // Send a question to the AI advisor; optimistically show it, then the reply.
  const sendAdvisor = async () => {
    const q = advisorInput.trim();
    if (!q || advisorSending) return;
    setAdvisorSending(true);
    setAdvisorInput("");
    // Optimistic: show the user's question immediately.
    setAdvisorMessages(prev => [...(prev || []), { id: "tmp-" + Date.now(), role: "user", content: q }]);
    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      const data = await res.json();
      if (res.ok && data.reply) {
        setAdvisorMessages(prev => [...(prev || []), { id: "a-" + Date.now(), role: "assistant", content: data.reply }]);
      } else {
        toast(data.error || "היועץ לא הצליח לענות", "error");
      }
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setAdvisorSending(false);
    }
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

  // Render the styled post template (DOM node #post-design) to a 1080x1080 PNG
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

  if(loading) return (
    <div style={{minHeight:"100vh",background:"linear-gradient(180deg,#F2E9E1 0%,#FFFFFF 340px)",padding:"22px 18px",fontFamily:"'Heebo',sans-serif"}}>
      <style>{`@keyframes shimmer{0%{background-position:-360px 0}100%{background-position:360px 0}}.skel{background:linear-gradient(90deg,#F0E7EC 25%,#F8F1F4 50%,#F0E7EC 75%);background-size:720px 100%;animation:shimmer 1.3s infinite linear;border-radius:10px}`}</style>
      <div style={{maxWidth:1180,margin:"0 auto"}}>
        <div className="skel" style={{width:180,height:26,marginBottom:22}}/>
        <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:22}}>
          {[0,1,2,3].map(i=><div key={i} className="skel" style={{flex:"1 1 160px",height:90,borderRadius:18}}/>)}
        </div>
        <div className="skel" style={{width:140,height:20,marginBottom:14}}/>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {[0,1,2,3,4].map(i=><div key={i} className="skel" style={{width:"100%",height:54,borderRadius:14}}/>)}
        </div>
      </div>
    </div>
  );

  // Primary navigation – matches the mockup's right-hand sidebar.
  // Each item maps to an existing activeTab id, so no logic changes.
  const NAV_ITEMS = [
    {id:"dashboard",label:"דשבורד"},
    {id:"calendar", label:"יומן"},
    {id:"clients",  label:"לקוחות"},
    {id:"leads",    label:"לידים"},
    {id:"cashier",  label:"קופה"},
    {id:"tax",      label:"דוחות מס"},
    {id:"whatsapp", label:"הודעות"},
    {id:"campaigns",label:"שיווק"},
    {id:"community",label:"קהילה"},
    {id:"packages", label:"מנויים"},
    {id:"protocols",label:"פרוטוקולים"},
    {id:"advisor",  label:"יועץ AI"},
  ];
  const navIcon = (id) => {
    const p = { fill:"none", stroke:"currentColor", strokeWidth:1.6, strokeLinecap:"round", strokeLinejoin:"round" };
    const svg = (children) => <svg viewBox="0 0 24 24" width="19" height="19">{children}</svg>;
    switch(id){
      case "dashboard": return svg(<><rect x="3" y="3" width="7" height="9" rx="1.5" {...p}/><rect x="14" y="3" width="7" height="5" rx="1.5" {...p}/><rect x="14" y="12" width="7" height="9" rx="1.5" {...p}/><rect x="3" y="16" width="7" height="5" rx="1.5" {...p}/></>);
      case "calendar":  return svg(<><rect x="3" y="4.5" width="18" height="16" rx="2.5" {...p}/><path d="M3 9h18M8 2.5v4M16 2.5v4" {...p}/></>);
      case "clients":   return svg(<><circle cx="12" cy="8" r="3.4" {...p}/><path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" {...p}/></>);
      case "leads":     return svg(<><path d="M12 3l2.4 5 5.6.6-4.2 3.8 1.2 5.6L12 21l-5.2 3 1.2-5.6L3.8 14.6 9.6 8z" {...p}/></>);
      case "cashier":   return svg(<><rect x="3" y="6" width="18" height="13" rx="2.5" {...p}/><path d="M3 10h18M7 15h4" {...p}/></>);
      case "tax":       return svg(<><path d="M6 3h9l4 4v14a0 0 0 0 1 0 0H6a0 0 0 0 1 0 0z" {...p}/><path d="M14 3v4h4M9 12h6M9 16h6M9 8h2" {...p}/></>);
      case "whatsapp":  return svg(<><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.6-4A8 8 0 1 1 20 11.5z" {...p}/></>);
      case "campaigns": return svg(<><path d="M4 9v6h3l8 4V5L7 9z" {...p}/><path d="M18 9.5a3 3 0 0 1 0 5" {...p}/></>);
      case "community": return svg(<><circle cx="9" cy="8" r="3" {...p}/><path d="M3 19c0-3 2.7-5 6-5s6 2 6 5" {...p}/><path d="M16 6.2A3 3 0 0 1 18 12M21 19c0-2.3-1.4-4-3.5-4.7" {...p}/></>);
      case "packages":  return svg(<><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" {...p}/><path d="M4 7.5l8 4.5 8-4.5M12 12v9" {...p}/></>);
      case "protocols": return svg(<><rect x="5" y="3" width="14" height="18" rx="2.5" {...p}/><path d="M9 8h6M9 12h6M9 16h4" {...p}/></>);
      case "advisor":   return svg(<><path d="M21 11.5a8.5 8.5 0 0 1-12.2 7.6L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5z" {...p}/><path d="M12 7.5v.01M9.5 10.2a2.6 2.6 0 1 1 3.6 2.4c-.7.3-1.1.8-1.1 1.6" {...p}/></>);
      default: return svg(<circle cx="12" cy="12" r="8" {...p}/>);
    }
  };

  return (
 <div dir="rtl" style={{position:"relative",zIndex:0,fontFamily:"'Heebo',sans-serif",background:"#F7F5F2",minHeight:"100vh",display:"flex",flexDirection:"column",color:"#1C1C1C"}}>
 <FloralCorners idPrefix="app" fixed />
 <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Heebo:wght@300;400;500;600;700&display=swap');
        .serif{font-family:'Cormorant Garamond',serif}
        /* Keyboard focus indicator (only for keyboard nav, not mouse). The
           !important overrides the many inline outline:none declarations. */
        button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,[role="button"]:focus-visible,[tabindex]:focus-visible{outline:2px solid var(--pc)!important;outline-offset:2px;border-radius:10px}
        .slot:hover{background:#F2E9E1!important;cursor:pointer}
        .appt-card{transition:transform 0.15s}.appt-card:hover{transform:scale(1.02)}
        .client-row{transition:box-shadow 0.18s,transform 0.18s,border-color 0.18s}
        .client-row:hover{cursor:pointer;box-shadow:0 8px 24px rgba(28,28,28,0.07);border-color:#E0CFA8!important;transform:translateY(-1px)}
        .lead-row{transition:box-shadow 0.18s,transform 0.18s,border-color 0.18s}
        .stat-card{transition:all 0.25s;box-shadow:0 4px 18px rgba(28,28,28,0.04)}.stat-card:hover{transform:translateY(-3px);box-shadow:0 12px 28px rgba(212,175,55,0.13)}
        .soft-card{box-shadow:0 6px 22px rgba(28,28,28,0.05)}
        .nav-item{display:flex;align-items:center;gap:12px;width:100%;background:none;border:none;border-radius:14px;padding:11px 14px;font-size:13px;font-weight:500;color:#7A716A;cursor:pointer;font-family:inherit;text-align:right;transition:background 0.18s,color 0.18s;position:relative}
        .nav-item:hover{background:var(--pc-tint);color:#1C1C1C}
        .nav-item .nav-ico{width:19px;height:19px;flex-shrink:0;display:flex;align-items:center;justify-content:center;opacity:0.8}
        .nav-item.active{background:var(--pc-tint);color:#1C1C1C;font-weight:600}
        .nav-item.active .nav-ico{opacity:1;color:var(--pc)}
        .nav-item.active::before{content:"";position:absolute;right:0;top:50%;transform:translateY(-50%);width:3px;height:18px;border-radius:3px;background:var(--pc)}
        .nav-aside::-webkit-scrollbar,main::-webkit-scrollbar{width:7px}
        .nav-aside::-webkit-scrollbar-thumb,main::-webkit-scrollbar-thumb{background:rgba(180,170,160,0.3);border-radius:8px}
        .lead-row:hover{cursor:pointer;box-shadow:0 8px 24px rgba(28,28,28,0.07);border-color:#E0CFA8!important;transform:translateY(-1px)}
        .wa-btn{background:#25D366;color:#fff;border:none;border-radius:20px;padding:6px 11px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:4px;text-decoration:none}
        .wa-btn:hover{background:#1ea355}
        .call-btn{background:var(--pc);color:#fff;border:none;border-radius:20px;padding:6px 11px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:4px;text-decoration:none}
        .icon-btn{background:rgba(212,175,55,0.10);border:none;border-radius:50%;width:30px;height:30px;color:var(--pc);font-size:13px;cursor:pointer;font-family:inherit;transition:background 0.15s;display:inline-flex;align-items:center;justify-content:center}
        .icon-btn:hover{background:rgba(212,175,55,0.20)}
        .icon-btn:disabled{opacity:0.5;cursor:default}
        .primary-btn{border:none;border-radius:24px;font-weight:600;cursor:pointer;font-family:inherit;transition:opacity 0.15s,transform 0.1s}
        .primary-btn:active:not(:disabled){transform:scale(0.97)}
        .primary-btn:disabled{opacity:0.5;cursor:default}
        @keyframes toast-in{from{transform:translateY(-12px);opacity:0}to{transform:translateY(0);opacity:1}}
        .toast{animation:toast-in 0.22s ease-out}
        @keyframes shimmer{0%{background-position:-360px 0}100%{background-position:360px 0}}
        .skel{background:linear-gradient(90deg,#F0E7EC 25%,#F8F1F4 50%,#F0E7EC 75%);background-size:720px 100%;animation:shimmer 1.3s infinite linear;border-radius:10px}
        @keyframes fade-in-up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .fade-in{animation:fade-in-up 0.32s ease-out both}
        @keyframes pop-in{0%{opacity:0;transform:scale(0.96)}100%{opacity:1;transform:scale(1)}}
        .pop-in{animation:pop-in 0.22s ease-out both}
        @keyframes voice-pulse{0%{box-shadow:0 0 0 0 rgba(212,175,55,0.45)}70%{box-shadow:0 0 0 16px rgba(212,175,55,0)}100%{box-shadow:0 0 0 0 rgba(212,175,55,0)}}
        .voice-pulse{animation:voice-pulse 1.4s infinite}
        .empty-cta{transition:transform 0.12s,box-shadow 0.2s}.empty-cta:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(212,175,55,0.22)}
        .mobile-only{display:none}
        @media (max-width:680px){
          .desktop-only{display:none!important}
          .mobile-only{display:flex!important}
          .sidebar-aside{position:fixed!important;top:0;bottom:0;right:0;width:80%!important;max-width:280px;z-index:1500;transform:translateX(100%);transition:transform 0.25s}
          .sidebar-aside.open{transform:translateX(0)}
          .nav-aside{position:fixed!important;top:0;bottom:0;right:0;width:78%!important;max-width:270px;z-index:1500;transform:translateX(100%);transition:transform 0.25s}
          .nav-aside.open{transform:translateX(0)}
          .sidebar-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:1499}
          .header-search{max-width:none!important}
          .modal-card{width:94%!important;max-width:380px!important}
          .client-drawer,.lead-drawer{width:100%!important}
        }
        @media print{body *{visibility:hidden}.receipt-print,.receipt-print *{visibility:visible}.receipt-print{position:fixed;top:0;left:0;width:100%;padding:40px}
          /* Tax report: print only the report card, clean A4, centered. */
          #tax-report,#tax-report *{visibility:visible}
          #tax-report{position:fixed;top:0;left:0;right:0;margin:0 auto;width:100%;max-width:720px;box-shadow:none!important;border:none!important;padding:32px 28px}}
      `}</style>

      {/* TOASTS */}
      {toasts.length>0&&(
 <div aria-live="polite" aria-atomic="true" style={{position:"fixed",top:14,left:"50%",transform:"translateX(-50%)",zIndex:5000,display:"flex",flexDirection:"column",gap:7,alignItems:"center",pointerEvents:"none"}}>
          {toasts.map(t=>{
            const colors={success:{bg:"#1C1C1C",fg:"#fff",icon:"✓"},error:{bg:"#C62828",fg:"#fff",icon:"!"},info:{bg:pc,fg:"#fff",icon:"i"}};
            const c=colors[t.type]||colors.success;
            return(
 <div key={t.id} className="toast" role={t.type==="error"?"alert":"status"} style={{background:c.bg,color:c.fg,padding:"9px 16px",borderRadius:24,fontSize:12,fontWeight:600,boxShadow:"0 6px 20px rgba(0,0,0,0.18)",maxWidth:"90vw",direction:"rtl",pointerEvents:"auto",display:"flex",alignItems:"center",gap:8}}>
                <span style={{width:18,height:18,borderRadius:"50%",background:"rgba(255,255,255,0.22)",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11,flexShrink:0}}>{c.icon}</span>
                {t.msg}
                {t.action&&<button onClick={()=>{t.action.onClick();setToasts(prev=>prev.filter(x=>x.id!==t.id));}} style={{background:"rgba(255,255,255,0.2)",border:"none",color:c.fg,fontSize:11,fontWeight:700,padding:"4px 11px",borderRadius:16,cursor:"pointer",fontFamily:"inherit",marginRight:2,whiteSpace:"nowrap"}}>{t.action.label}</button>}
 </div>
            );
          })}
 </div>
      )}

      {/* CONFIRM DIALOG */}
      {confirmDialog&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:4000,padding:14}} onClick={()=>setConfirmDialog(null)}>
 <div onClick={e=>e.stopPropagation()} className="modal-card" style={{background:"#fff",borderRadius:20,padding:24,width:340,maxWidth:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.25)"}}>
 <h3 className="serif" style={{fontSize:19,fontWeight:600,color:"#1C1C1C",marginBottom:8}}>{confirmDialog.title}</h3>
 <p style={{fontSize:12.5,color:"#7A716A",lineHeight:1.5,marginBottom:18}}>{confirmDialog.message}</p>
 <div style={{display:"flex",gap:7}}>
 <button onClick={()=>setConfirmDialog(null)} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1.5px solid #E8DED6",borderRadius:24,background:"#fff",fontSize:12,color:"#7A716A"}}>{confirmDialog.cancelText}</button>
 <button onClick={()=>{const fn=confirmDialog.onConfirm;setConfirmDialog(null);if(fn)fn();}} className="primary-btn" style={{flex:2,padding:"11px 0",background:confirmDialog.danger?"#C62828":pcGrad,color:"#fff",fontSize:12}}>{confirmDialog.confirmText}</button>
 </div>
 </div>
 </div>
      )}

      {/* BEAUTY VOICE — floating mic button (accessible from every screen) */}
 <button onClick={()=>{ showVoice ? closeVoice() : startVoice(); }} aria-label="שליטה קולית — Beauty Voice" title="Beauty Voice"
        style={{position:"fixed",bottom:22,left:22,zIndex:3500,width:56,height:56,borderRadius:"50%",border:"none",cursor:"pointer",background:pcGrad,color:"#fff",boxShadow:`0 8px 22px ${pcShadow}`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit"}}>
 <svg viewBox="0 0 24 24" width="24" height="24" style={{fill:"none",stroke:"currentColor",strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round"}}><rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>
 </button>

      {/* BEAUTY VOICE — modal */}
      {showVoice&&(
 <div onClick={closeVoice} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:4200,padding:16}}>
 <div onClick={e=>e.stopPropagation()} className="modal-card pop-in" style={{background:"#fff",borderRadius:22,padding:24,width:430,maxWidth:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.25)",marginBottom:84}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
 <h3 className="serif" style={{fontSize:19,fontWeight:600,color:"#1C1C1C"}}>Beauty Voice ✦</h3>
 <button onClick={closeVoice} aria-label="סגירה" style={{background:"none",border:"none",fontSize:16,cursor:"pointer",color:"#7A716A"}}>✕</button>
 </div>

            {voiceStatus==="listening"&&(
 <div style={{textAlign:"center",padding:"16px 0"}}>
 <div className="voice-pulse" style={{width:66,height:66,borderRadius:"50%",background:pcTint,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",color:pc}}>
 <svg viewBox="0 0 24 24" width="28" height="28" style={{fill:"none",stroke:"currentColor",strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round"}}><rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>
 </div>
 <p style={{fontSize:14,fontWeight:600,color:"#1C1C1C"}}>🎙️ מקשיבה...</p>
 <p style={{fontSize:11.5,color:"#7A716A",marginTop:5,lineHeight:1.5}}>אמרי מה לעשות — למשל: "קבעי תור לרונית מחר בעשר וחצי לפילינג"</p>
 </div>
            )}

            {voiceStatus==="processing"&&(
 <div style={{textAlign:"center",padding:"18px 0"}}>
 <p style={{fontSize:12.5,color:"#7A716A",marginBottom:6}}>שמעתי: "{voiceTranscript}"</p>
 <p style={{fontSize:14,fontWeight:600,color:pc}}>מבינה את הבקשה…</p>
 </div>
            )}

            {voiceStatus==="result"&&voiceIntent&&(
 <div>
 <p style={{fontSize:11.5,color:"#7A716A",marginBottom:10}}>שמעתי: "{voiceIntent.raw||voiceTranscript}"</p>
                {voiceIntent.action==="book_appointment"?(
 <div style={{background:pcTint,border:`1px solid ${pc}`,borderRadius:14,padding:"14px 16px"}}>
 <p style={{fontSize:12,fontWeight:700,color:pc,marginBottom:8}}>הבנתי — קביעת תור:</p>
                    {[["לקוחה",voiceIntent.client_name],["תאריך",voiceIntent.date],["שעה",voiceIntent.time],["שירות",voiceIntent.service]].map(([l,v])=>(
 <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid rgba(212,175,55,0.16)"}}>
 <span style={{fontSize:11,color:"#7A716A"}}>{l}</span>
 <span style={{fontSize:12,fontWeight:600,color:"#1C1C1C"}}>{v||"— לא צוין —"}</span>
 </div>
                    ))}
 </div>
                ):(
 <p style={{fontSize:12.5,color:"#7A716A",lineHeight:1.6,textAlign:"center",padding:"8px 0"}}>לא זיהיתי פעולה נתמכת. כרגע נתמכת קביעת תור — נסי לומר "קבעי תור ל...".</p>
                )}
                {voiceIntent.clarification&&<p style={{fontSize:11,color:"#B07F2A",marginTop:10}}>ℹ️ {voiceIntent.clarification}</p>}
 <p style={{fontSize:10,color:"#A89AA2",marginTop:12,textAlign:"center"}}>שלב 2 — הצגת ההבנה בלבד. יצירת התור בפועל תיווסף בשלב הבא.</p>
 <div style={{display:"flex",gap:8,marginTop:14}}>
 <button onClick={startVoice} className="primary-btn" style={{flex:1,padding:"10px 0",border:"1px solid #E8DED6",background:"#fff",color:"#7A716A",fontSize:12}}>🎙️ נסי שוב</button>
 <button onClick={closeVoice} className="primary-btn" style={{flex:1,padding:"10px 0",background:pcGrad,color:"#fff",fontSize:12}}>סגירה</button>
 </div>
 </div>
            )}

            {voiceStatus==="confirm"&&voiceBooking&&(()=>{
              const nameLow=(voiceBooking.clientName||"").trim().toLowerCase();
              const existsClient=nameLow?clients.find(c=>(c.name||"").trim().toLowerCase()===nameLow):null;
              const isNew=voiceBooking.clientName.trim()&&!existsClient;
              const mm=(voiceBooking.time||"").split(":")[1];
              const ready=voiceBooking.clientName.trim()&&voiceBooking.service&&voiceBooking.date&&voiceBooking.time;
              return (
 <div>
 <p style={{fontSize:11.5,color:"#7A716A",marginBottom:12}}>שמעתי: "{voiceIntent?.raw||voiceTranscript}". בדקי ואשרי:</p>

                {/* client */}
 <div style={{marginBottom:10}}>
 <p style={{fontSize:9,color:"#7A716A",marginBottom:3}}>לקוחה</p>
 <input value={voiceBooking.clientName} onChange={e=>setVoiceBooking({...voiceBooking,clientName:e.target.value})} placeholder="שם הלקוחה" style={{width:"100%",border:"1px solid #E8DED6",borderRadius:10,padding:"9px 11px",fontSize:12.5,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}/>
                  {voiceBooking.clientName.trim()&&(isNew
                    ? <p style={{fontSize:10,color:"#B07F2A",marginTop:4}}>✦ לקוחה חדשה בשם "{voiceBooking.clientName.trim()}" תיווצר עם האישור</p>
                    : <p style={{fontSize:10,color:"#5C9460",marginTop:4}}>✓ לקוחה קיימת</p>)}
 </div>

                {/* service picker */}
 <div style={{marginBottom:10}}>
 <p style={{fontSize:9,color:"#7A716A",marginBottom:4}}>שירות {voiceBooking.service?"":"— בחרי:"}</p>
 <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {activeServices.map(s=>{
                      const sel=voiceBooking.service===s.name;
                      return <button key={s.id||s.name} onClick={()=>setVoiceBooking({...voiceBooking,service:s.name})} style={{padding:"6px 11px",borderRadius:16,fontSize:10.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:sel?`2px solid ${pc}`:"1px solid #E8DED6",background:sel?pcTint:"#fff",color:sel?pc:"#7A716A"}}>{s.name}</button>;
                    })}
 </div>
 </div>

                {/* date + time */}
 <div style={{display:"flex",gap:8,marginBottom:6}}>
 <div style={{flex:1}}><p style={{fontSize:9,color:"#7A716A",marginBottom:3}}>תאריך</p><input type="date" value={voiceBooking.date} onChange={e=>setVoiceBooking({...voiceBooking,date:e.target.value})} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:10,padding:"8px 10px",fontSize:12,fontFamily:"inherit",outline:"none",background:pcTint}}/></div>
 <div style={{flex:1}}><p style={{fontSize:9,color:"#7A716A",marginBottom:3}}>שעה</p><input type="time" value={voiceBooking.time} onChange={e=>setVoiceBooking({...voiceBooking,time:e.target.value})} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:10,padding:"8px 10px",fontSize:12,fontFamily:"inherit",outline:"none",background:pcTint}}/></div>
 </div>
                {mm&&mm!=="00"&&<p style={{fontSize:9.5,color:"#A89AA2",marginBottom:8}}>הערה: התור יישמר על השעה העגולה ({(voiceBooking.time||"").split(":")[0]}:00) — הסכימה הנוכחית תומכת בשעות שלמות.</p>}

 <div style={{display:"flex",gap:8,marginTop:8}}>
 <button onClick={closeVoice} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid #E8DED6",background:"#fff",color:"#7A716A",fontSize:12}}>ביטול</button>
 <button onClick={handleVoiceBook} disabled={!ready||isBusy("voiceBook")} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"#fff",fontSize:12}}>{isBusy("voiceBook")?"קובעת...":"✦ אישור וקביעת תור"}</button>
 </div>
 </div>
              );
            })()}

            {voiceStatus==="info"&&voiceInfo&&(
 <div>
 <p style={{fontSize:11.5,color:"#7A716A",marginBottom:12}}>שמעתי: "{voiceIntent?.raw||voiceTranscript}"</p>
                {voiceInfo.kind==="day"&&(
 <div>
 <h4 className="serif" style={{fontSize:17,fontWeight:600,color:"#1C1C1C",marginBottom:10}}>תורים ל-{(voiceInfo.date||"").split("-").reverse().join("/")}</h4>
                    {voiceInfo.items.length===0?(
 <p style={{fontSize:12.5,color:"#B8AFA0",textAlign:"center",padding:"16px 0"}}>אין תורים ביום הזה</p>
                    ):voiceInfo.items.map((it,i)=>(
 <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 12px",background:pcTint,borderRadius:12,marginBottom:6}}>
 <span className="serif" style={{fontSize:16,fontWeight:600,color:pc,width:52,flexShrink:0}}>{it.hour}:00</span>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:12.5,fontWeight:600,color:"#1C1C1C"}}>{it.name}</p>
 <p style={{fontSize:10.5,color:"#7A716A"}}>{it.service}</p>
 </div>
 </div>
                    ))}
 </div>
                )}
                {voiceInfo.kind==="revenue"&&(
 <div style={{textAlign:"center",background:pcTint,border:`1px solid ${pc}`,borderRadius:16,padding:"22px 18px"}}>
 <p style={{fontSize:12,color:"#7A716A",marginBottom:8}}>{voiceInfo.period==="today"?"הכנסות היום":"הכנסות החודש"}</p>
 <p className="serif" style={{fontSize:38,fontWeight:600,color:"#1C1C1C",lineHeight:1}}>₪{Math.round(voiceInfo.total).toLocaleString()}</p>
 <p style={{fontSize:11,color:pc,marginTop:8,fontWeight:500}}>{voiceInfo.count} עסקאות</p>
 </div>
                )}
 <button onClick={closeVoice} className="primary-btn" style={{width:"100%",marginTop:14,padding:"11px 0",background:pcGrad,color:"#fff",fontSize:12}}>סגירה</button>
 </div>
            )}

            {voiceStatus==="cancel"&&voiceCancel&&(
 <div>
 <p style={{fontSize:11.5,color:"#7A716A",marginBottom:12}}>שמעתי: "{voiceIntent?.raw||voiceTranscript}"</p>
                {!voiceCancel.selected?(
 <div>
 <p style={{fontSize:12.5,fontWeight:600,color:"#1C1C1C",marginBottom:10}}>נמצאו כמה תורים — בחרי איזה לבטל:</p>
                    {voiceCancel.matches.map(a=>(
 <button key={a.id} onClick={()=>setVoiceCancel({...voiceCancel,selected:a})} style={{display:"flex",alignItems:"center",gap:12,width:"100%",textAlign:"right",background:"#fff",border:"1px solid #E8DED6",borderRadius:12,padding:"10px 12px",marginBottom:6,cursor:"pointer",fontFamily:"inherit"}}>
 <span className="serif" style={{fontSize:15,fontWeight:600,color:pc,width:78,flexShrink:0}}>{(a.date||"").split("-").reverse().slice(0,2).join("/")} · {a.hour}:00</span>
 <span style={{flex:1,minWidth:0}}><span style={{fontSize:12.5,fontWeight:600,color:"#1C1C1C"}}>{a.name}</span> <span style={{fontSize:10.5,color:"#7A716A"}}>· {a.service}</span></span>
 </button>
                    ))}
 <button onClick={closeVoice} className="primary-btn" style={{width:"100%",marginTop:6,padding:"10px 0",border:"1px solid #E8DED6",background:"#fff",color:"#7A716A",fontSize:12}}>ביטול</button>
 </div>
                ):(
 <div>
 <div style={{background:"#FEECEC",border:"1px solid #F3C6C6",borderRadius:14,padding:"16px 16px",textAlign:"center",marginBottom:14}}>
 <p style={{fontSize:12.5,color:"#C62828",fontWeight:600,marginBottom:8}}>לבטל את התור?</p>
 <p style={{fontSize:14,fontWeight:600,color:"#1C1C1C"}}>{voiceCancel.selected.name}</p>
 <p style={{fontSize:12,color:"#7A716A",marginTop:3}}>{voiceCancel.selected.service} · {(voiceCancel.selected.date||"").split("-").reverse().join("/")} בשעה {voiceCancel.selected.hour}:00</p>
 </div>
 <div style={{display:"flex",gap:8}}>
 <button onClick={closeVoice} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid #E8DED6",background:"#fff",color:"#7A716A",fontSize:12}}>לא, השאירי</button>
 <button onClick={handleVoiceCancel} disabled={isBusy("voiceCancel")} className="primary-btn" style={{flex:2,padding:"11px 0",background:"#C62828",color:"#fff",fontSize:12}}>{isBusy("voiceCancel")?"מבטלת...":"כן, בטלי את התור"}</button>
 </div>
 </div>
                )}
 </div>
            )}

            {voiceStatus==="call"&&voiceCall&&(
 <div>
 <p style={{fontSize:11.5,color:"#7A716A",marginBottom:12}}>שמעתי: "{voiceIntent?.raw||voiceTranscript}"</p>
                {!voiceCall.selected?(
 <div>
 <p style={{fontSize:12.5,fontWeight:600,color:"#1C1C1C",marginBottom:10}}>נמצאו כמה לקוחות — בחרי למי לחייג:</p>
                    {voiceCall.matches.map(c=>(
 <button key={c.id} onClick={()=>setVoiceCall({...voiceCall,selected:c})} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,width:"100%",textAlign:"right",background:"#fff",border:"1px solid #E8DED6",borderRadius:12,padding:"10px 12px",marginBottom:6,cursor:"pointer",fontFamily:"inherit"}}>
 <span style={{fontSize:12.5,fontWeight:600,color:"#1C1C1C"}}>{c.name}</span>
 <span style={{fontSize:11,color:c.phone?"#7A716A":"#B8AFA0",direction:"ltr"}}>{c.phone||"אין מספר"}</span>
 </button>
                    ))}
 <button onClick={closeVoice} className="primary-btn" style={{width:"100%",marginTop:6,padding:"10px 0",border:"1px solid #E8DED6",background:"#fff",color:"#7A716A",fontSize:12}}>סגירה</button>
 </div>
                ):(
 <div>
 <div style={{textAlign:"center",background:pcTint,border:`1px solid ${pc}`,borderRadius:16,padding:"20px 16px",marginBottom:14}}>
 <p className="serif" style={{fontSize:20,fontWeight:600,color:"#1C1C1C"}}>{voiceCall.selected.name}</p>
                      {voiceCall.selected.phone
                        ? <p style={{fontSize:15,color:pc,marginTop:6,direction:"ltr",fontWeight:600}}>{voiceCall.selected.phone}</p>
                        : <p style={{fontSize:12.5,color:"#B07F2A",marginTop:8}}>אין מספר טלפון שמור ל{voiceCall.selected.name}</p>}
 </div>
 <div style={{display:"flex",gap:8}}>
 <button onClick={closeVoice} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid #E8DED6",background:"#fff",color:"#7A716A",fontSize:12}}>סגירה</button>
                      {voiceCall.selected.phone&&(
 <button onClick={()=>{ window.location.href = `tel:${(voiceCall.selected.phone||"").replace(/[^\d+]/g,"")}`; }} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"#fff",fontSize:12}}>📞 חייג</button>
                      )}
 </div>
 </div>
                )}
 </div>
            )}

            {voiceStatus==="receipt"&&voiceReceipt&&(()=>{
              const nameLow=(voiceReceipt.clientName||"").trim().toLowerCase();
              const existsClient=nameLow?clients.find(c=>(c.name||"").trim().toLowerCase()===nameLow):null;
              const isNew=voiceReceipt.clientName.trim()&&!existsClient;
              const ready=voiceReceipt.clientName.trim()&&Number(voiceReceipt.amount)>0;
              return (
 <div>
 <p style={{fontSize:11.5,color:"#7A716A",marginBottom:12}}>שמעתי: "{voiceIntent?.raw||voiceTranscript}". בדקי ואשרי הוצאת קבלה:</p>

 <div style={{marginBottom:10}}>
 <p style={{fontSize:9,color:"#7A716A",marginBottom:3}}>לקוחה</p>
 <input value={voiceReceipt.clientName} onChange={e=>setVoiceReceipt({...voiceReceipt,clientName:e.target.value})} placeholder="שם הלקוחה" style={{width:"100%",border:"1px solid #E8DED6",borderRadius:10,padding:"9px 11px",fontSize:12.5,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}/>
                  {voiceReceipt.clientName.trim()&&(isNew
                    ? <p style={{fontSize:10,color:"#B07F2A",marginTop:4}}>✦ לקוחה חדשה בשם "{voiceReceipt.clientName.trim()}" תיווצר עם האישור</p>
                    : <p style={{fontSize:10,color:"#5C9460",marginTop:4}}>✓ לקוחה קיימת</p>)}
 </div>

 <div style={{marginBottom:10}}>
 <p style={{fontSize:9,color:"#7A716A",marginBottom:3}}>סכום (₪)</p>
 <input type="number" value={voiceReceipt.amount} onChange={e=>setVoiceReceipt({...voiceReceipt,amount:e.target.value})} placeholder="0" style={{width:"100%",border:"1px solid #E8DED6",borderRadius:10,padding:"9px 11px",fontSize:13,fontFamily:"inherit",outline:"none",direction:"ltr",textAlign:"right",background:pcTint}}/>
 </div>

 <div style={{marginBottom:12}}>
 <p style={{fontSize:9,color:"#7A716A",marginBottom:4}}>אמצעי תשלום</p>
 <div style={{display:"flex",gap:6}}>
                    {["מזומן","אשראי","ביט"].map(pm=>{
                      const sel=voiceReceipt.payment===pm;
                      return <button key={pm} onClick={()=>setVoiceReceipt({...voiceReceipt,payment:pm})} style={{flex:1,padding:"8px 0",borderRadius:12,fontSize:11.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:sel?`2px solid ${pc}`:"1px solid #E8DED6",background:sel?pcTint:"#fff",color:sel?pc:"#7A716A"}}>{pm}</button>;
                    })}
 </div>
 </div>

 <div style={{display:"flex",gap:8}}>
 <button onClick={closeVoice} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid #E8DED6",background:"#fff",color:"#7A716A",fontSize:12}}>ביטול</button>
 <button onClick={handleVoiceReceipt} disabled={!ready||isBusy("voiceReceipt")} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"#fff",fontSize:12}}>{isBusy("voiceReceipt")?"מפיקה...":"✦ אישור והפקת קבלה"}</button>
 </div>
 </div>
              );
            })()}

            {voiceStatus==="error"&&(
 <div style={{textAlign:"center",padding:"14px 0"}}>
 <p style={{fontSize:13,color:"#C62828",marginBottom:12,lineHeight:1.5}}>{voiceErr||"לא נקלט דיבור. נסי שוב."}</p>
 <button onClick={startVoice} className="primary-btn" style={{padding:"10px 22px",background:pcGrad,color:"#fff",fontSize:12}}>🎙️ נסי שוב</button>
 </div>
            )}

            {voiceStatus==="unsupported"&&(
 <p style={{fontSize:12.5,color:"#7A716A",lineHeight:1.7,padding:"10px 0",textAlign:"center"}}>השליטה הקולית זמינה בדפדפני <b>Chrome</b> או <b>Edge</b> (מחשב או אנדרואיד). נסי לפתוח את המערכת באחד מהם.</p>
            )}
 </div>
 </div>
      )}

      {/* OMBRE PROMO BAR */}
      {/* HEADER */}
 <header style={{background:"rgba(255,255,255,0.86)",backdropFilter:"blur(10px)",borderBottom:"1px solid #E8DED6",padding:"0 22px",display:"flex",alignItems:"center",justifyContent:"space-between",height:74,flexShrink:0,gap:8,flexWrap:"nowrap"}}>
 <div style={{display:"flex",alignItems:"center",gap:11,flexShrink:0}}>
 <button className="mobile-only icon-btn" onClick={()=>setShowMobileSidebar(true)} style={{display:"none"}} aria-label="תפריט ניווט">☰</button>
 <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",justifyContent:"center",lineHeight:1}}>
 <span style={{display:"inline-flex",alignItems:"flex-start"}}>
 <span className="serif" style={{fontWeight:600,fontSize:30,letterSpacing:"6px",color:"#1C1C1C"}}>BloomOS</span>
 <span style={{fontSize:13,color:pc,marginRight:-2,marginTop:1,lineHeight:1}}>✦</span>
 </span>
 <span style={{fontSize:8,color:"#9A9088",letterSpacing:"4.5px",fontWeight:500,marginTop:5,paddingRight:1}}>BEAUTY BUSINESS OS</span>
 </div>
          {newLeadsCount>0&&<span onClick={()=>setActiveTab("leads")} style={{background:pcGrad,color:"#fff",fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:20,cursor:"pointer"}}>{newLeadsCount}</span>}
          {tomorrowCancelled>0&&<span className="desktop-only" style={{background:"#F44336",color:"#fff",fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:20}}>{tomorrowCancelled}</span>}
 </div>
 <div className="header-search" style={{position:"relative",flex:1,maxWidth:280,minWidth:80}}>
 <input value={globalSearch} onChange={e=>setGlobalSearch(e.target.value)} placeholder="חיפוש..."
            style={{width:"100%",border:"1px solid #E8DED6",borderRadius:24,padding:"7px 14px",fontSize:11.5,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint,color:"#1C1C1C"}}/>
          {globalResults.length>0&&(
 <div style={{position:"absolute",top:"100%",right:0,left:0,background:"#fff",borderRadius:14,boxShadow:"0 8px 24px rgba(212,175,55,0.15)",zIndex:999,overflow:"hidden",marginTop:6}}>
              {globalResults.map((r,i)=>(
 <div key={i} onClick={()=>{setGlobalSearch("");if(r.type==="client"){setSelectedClient(r.obj);setClientTab("info");}else if(r.type==="lead"){setSelectedLead(r.obj);setActiveTab("leads");}}}
                  style={{padding:"9px 14px",borderBottom:"1px solid #F2E9E1",cursor:"pointer",display:"flex",gap:8,alignItems:"center"}} className="client-row">
 <span style={{fontSize:12}}>{r.type==="client"?"":r.type==="lead"?"":""}</span>
 <div><p style={{fontSize:11.5,fontWeight:600,color:"#1C1C1C"}}>{r.label}</p><p style={{fontSize:9,color:"#7A716A"}}>{r.sub}</p></div>
 </div>
              ))}
 </div>
          )}
 </div>
 <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          {upcomingBirthdays[0]&&<span className="desktop-only" style={{fontSize:10,color:pc}}>{upcomingBirthdays[0].name}</span>}
 <span className="desktop-only" style={{fontSize:11.5,color:"#7A716A"}}>שלום, {settings.therapist_name} </span>
 <button onClick={()=>{setEditSettings({...settings});setShowSettings(true);}} className="icon-btn" title="הגדרות" aria-label="הגדרות">⚙</button>
 <button onClick={handleExportCSV} className="icon-btn" title="ייצוא CSV" aria-label="ייצוא לקוחות לקובץ CSV">↓</button>
 <button onClick={handleLogout} disabled={isBusy("logout")} className="icon-btn" title="התנתקות" aria-label="התנתקות מהמערכת">⏻</button>
 </div>
 </header>

 <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {showMobileSidebar&&<div className="sidebar-backdrop mobile-only" onClick={()=>setShowMobileSidebar(false)}/>}

        {/* NAVIGATION SIDEBAR (right, RTL) */}
 <aside className={`nav-aside${showMobileSidebar?" open":""}`} style={{order:0,width:212,background:"rgba(255,255,255,0.72)",borderLeft:"1px solid #E8DED6",padding:"16px 12px",display:"flex",flexDirection:"column",gap:3,flexShrink:0,overflowY:"auto"}}>
 <button className="mobile-only" onClick={()=>setShowMobileSidebar(false)} style={{display:"none",alignSelf:"flex-start",background:"none",border:"none",fontSize:16,cursor:"pointer",color:"#7A716A",marginBottom:4}}>✕</button>
          {NAV_ITEMS.map(item=>(
 <button key={item.id} onClick={()=>{setActiveTab(item.id);setShowMobileSidebar(false);}} className={`nav-item${activeTab===item.id?" active":""}`}>
 <span className="nav-ico">{navIcon(item.id)}</span>
 <span style={{flex:1}}>{item.label}</span>
              {item.id==="leads"&&newLeadsCount>0&&<span style={{background:pcGrad,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:20}}>{newLeadsCount}</span>}
 </button>
          ))}
 <button onClick={()=>{setEditSettings({...settings});setShowSettings(true);setShowMobileSidebar(false);}} className="nav-item" style={{marginTop:8}}>
 <span className="nav-ico"><svg viewBox="0 0 24 24" width="19" height="19"><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></span>
 <span style={{flex:1}}>הגדרות</span>
 </button>
 </aside>

        {/* TODAY / REMINDERS PANEL (left, RTL) */}
 <aside className="sidebar-aside desktop-only" style={{order:2,width:195,background:"rgba(255,255,255,0.6)",borderRight:"1px solid #E8DED6",padding:"14px 11px",display:"flex",flexDirection:"column",gap:11,flexShrink:0,overflowY:"auto"}}>
 <div>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
 <p className="serif" style={{fontSize:14,fontWeight:600,color:"#1C1C1C"}}>היום ({todayAppts.length})</p>
 <button className="mobile-only" onClick={()=>setShowMobileSidebar(false)} style={{display:"none",background:"none",border:"none",fontSize:14,cursor:"pointer",color:"#7A716A"}}>✕</button>
 </div>
            {todayAppts.length===0?<p style={{fontSize:10.5,color:"#B8AFA0"}}>אין תורים</p>
              :todayAppts.sort((a,b)=>a.hour-b.hour).map(a=>(
 <div key={a.id} style={{background:"linear-gradient(90deg,#F2E9E1,#FFFFFF)",borderRight:`3px solid ${getApptColor(a)}`,borderRadius:10,padding:"7px 9px",marginBottom:5}}>
 <p style={{fontSize:11,fontWeight:600,color:"#1C1C1C"}}>{a.name}</p>
 <p style={{fontSize:9,color:"#7A716A"}}>{workingHours[Number(a.hour)-settings.working_hours_start]||a.hour+":00"} · {a.service}</p>
                  {a.confirmation_status==="confirmed"&&<span style={{fontSize:8,color:"#7BAE7F",fontWeight:700}}>אישרה</span>}
                  {a.confirmation_status==="cancelled"&&<span style={{fontSize:8,color:"#F44336",fontWeight:700}}>ביטלה</span>}
 <button onClick={()=>handleOpenCashier(a)} style={{background:pcGrad,color:"#fff",border:"none",borderRadius:14,padding:"3px 9px",fontSize:8,cursor:"pointer",fontFamily:"inherit",marginTop:3,display:"block"}}>גבי</button>
 </div>
              ))}
 </div>

          {tomorrowAppts.length>0&&(
 <div>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
 <p className="serif" style={{fontSize:14,fontWeight:600,color:"#1C1C1C"}}>מחר ({tomorrowAppts.length})</p>
 <button onClick={handleSendAllConfirmations} style={{background:"rgba(212,175,55,0.12)",color:pc,border:"none",borderRadius:14,padding:"3px 8px",fontSize:8,cursor:"pointer",fontFamily:"inherit"}}>שליחה מרוכזת</button>
 </div>
 <div style={{background:pcTint,borderRadius:10,padding:"6px 9px",marginBottom:6,fontSize:9}}>
 <span style={{color:"#7BAE7F"}}>{tomorrowConfirmed} </span>
 <span style={{color:"#F44336"}}>{tomorrowCancelled} </span>
 <span style={{color:"#7A716A"}}>⏳ {tomorrowPending}</span>
 </div>
              {tomorrowAppts.map(a=>{
                const client=clients.find(c=>String(c.id)===String(a.client_id));
                const confColor=a.confirmation_status==="confirmed"?"#7BAE7F":a.confirmation_status==="cancelled"?"#F44336":"#7A716A";
                return(
 <div key={a.id} style={{background:"linear-gradient(90deg,#F2E9E1,#FFFFFF)",borderRight:`3px solid ${getApptColor(a)}`,borderRadius:10,padding:"6px 8px",marginBottom:5}}>
 <p style={{fontSize:11,fontWeight:600,color:"#1C1C1C"}}>{a.name}</p>
 <p style={{fontSize:9,color:"#7A716A"}}>{a.service}</p>
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
 <p className="serif" style={{fontSize:13,fontWeight:600,color:pc,marginBottom:5}}>תזכורות פניות</p>
              {leadsWithReminders.map(l=>(
 <div key={l.id} onClick={()=>{setSelectedLead(l);setActiveTab("leads");setShowMobileSidebar(false);}} style={{background:"#FFF3E0",borderRadius:10,padding:"5px 9px",marginBottom:3,cursor:"pointer"}}>
 <p style={{fontSize:10.5,fontWeight:600,color:"#1C1C1C"}}>{l.name}</p>
 <p style={{fontSize:8.5,color:"#7A716A"}}>{l.reminder_date}</p>
 </div>
              ))}
 </div>
          )}

          {coldClients.slice(0,3).length>0&&(
 <div>
 <p className="serif" style={{fontSize:13,fontWeight:600,color:"#7A716A",marginBottom:4}}>להתחדשות</p>
              {coldClients.slice(0,3).map(c=>(
 <div key={c.id} onClick={()=>{setSelectedClient(c);setClientTab("info");setShowMobileSidebar(false);}} style={{fontSize:9.5,color:pc,marginBottom:3,cursor:"pointer"}}>{c.name} ({getDaysSince(c.id)}י)</div>
              ))}
 </div>
          )}

 <button onClick={()=>{const svc=activeServices[0];setNewAppt({clientId:"",name:"",service:svc?.name||"",duration:svc?.duration||60,date:formatDate(new Date()),hour:settings.working_hours_start,price:svc?.price||0});setApptNote("");setShowModal(true);setShowMobileSidebar(false);}}
            style={{background:pcGrad,color:"#fff",border:"none",borderRadius:24,padding:"11px 10px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginTop:"auto",boxShadow:`0 6px 16px ${pcShadow}`}}>
            ✦ קביעת תור
 </button>
 </aside>

 <main style={{order:1,flex:1,overflow:"auto",padding:"28px 30px"}}>
 <div key={activeTab} className="fade-in">
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
 <h1 className="serif" style={{fontSize:38,fontWeight:600,color:"#1C1C1C",marginBottom:11,letterSpacing:"0.5px"}}>{greeting}, <span style={{background:pcGrad,WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent",fontStyle:"italic"}}>{settings.therapist_name}</span></h1>
 <p style={{fontSize:13.5,color:"#7A716A",fontWeight:300,maxWidth:480,margin:"0 auto"}}>
                    {todayAppts.length>0?`יום יפה מחכה לך — ${todayAppts.length} תורים בלוח`:"אין תורים היום — זמן מצוין להתארגן"}{upcomingBirthdays.length>0?`, ${upcomingBirthdays.length} ימי הולדת לחגוג השבוע`:""}{coldClients.length>0?`, ו-${coldClients.length} לקוחות מחכות להתחדשות`:""}.
 </p>
 <div style={{width:80,height:2,background:`linear-gradient(90deg,transparent,${pc},transparent)`,margin:"20px auto 0"}}/>
                  {bdToday.length>0&&(
 <div style={{marginTop:16,background:pcTint,borderRadius:14,padding:"9px 16px",fontSize:11.5,color:pc,display:"inline-block",fontWeight:500}}>
                      היום יום הולדת ל{bdToday.map(c=>c.name).join(", ")} — שווה לשלוח ברכה חמה
 </div>
                  )}
 </div>

                {/* STAT CARDS */}
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:18,marginBottom:40,maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
                  {stats.map((s,i)=>(
 <div key={i} className="stat-card" style={{background:"#fff",borderRadius:18,padding:"26px 24px",border:"1px solid #E8DED6",textAlign:"right"}}>
 <p style={{fontSize:11,color:"#7A716A",fontWeight:500,letterSpacing:"0.8px",marginBottom:10}}>{s.label}</p>
 <p className="serif" style={{fontSize:42,fontWeight:600,color:"#1C1C1C",lineHeight:1,letterSpacing:"0.5px"}}>{s.value}</p>
                      {s.sub&&<p style={{fontSize:10.5,color:pc,marginTop:10,fontWeight:500}}>{s.sub}</p>}
 </div>
                  ))}
 </div>

                {/* REVENUE CHART */}
 <div style={{background:"#fff",borderRadius:20,padding:"26px 28px",border:"1px solid #E8DED6",boxShadow:"0 6px 22px rgba(28,28,28,0.05)",marginBottom:24,maxWidth:1180,marginLeft:"auto",marginRight:"auto",position:"relative",overflow:"hidden"}}>
 
 <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20,justifyContent:"center"}}>
 <span style={{width:40,height:1,background:"linear-gradient(90deg,transparent,var(--pc))"}}/>
 <h3 className="serif" style={{fontSize:22,fontWeight:600,color:"#1C1C1C"}}>הכנסות 6 חודשים אחרונים</h3>
 <span style={{width:40,height:1,background:"linear-gradient(90deg,var(--pc),transparent)"}}/>
 </div>
 <div style={{display:"flex",alignItems:"flex-end",gap:10,height:150,paddingBottom:4}}>
                    {monthlyData.map((m,i)=>{
                      const h=Math.round((m.revenue/maxRev)*120);
                      const isCurrent=i===monthlyData.length-1;
                      return(
 <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
 <span style={{fontSize:9.5,fontWeight:600,color:isCurrent?pc:"#B0A8AE"}}>{m.revenue>0?`₪${m.revenue.toLocaleString()}`:""}</span>
 <div style={{width:"100%",maxWidth:46,height:Math.max(h,4),borderRadius:"10px 10px 4px 4px",background:isCurrent?`linear-gradient(180deg,${pc2} 0%,${pc} 100%)`:`linear-gradient(180deg,${lighten(pc,0.55)} 0%,${lighten(pc,0.35)} 100%)`,transition:"height 0.3s"}}/>
 <span style={{fontSize:10,color:isCurrent?"#1C1C1C":"#B0A8AE",fontWeight:isCurrent?600:500}}>{m.month}</span>
 </div>
                      );
                    })}
 </div>
 </div>

                {/* SECTION TITLE */}
 <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16,margin:"0 0 24px"}}>
 <span style={{width:50,height:1,background:"linear-gradient(90deg,transparent,var(--pc))"}}/>
 <h2 className="serif" style={{fontSize:24,fontWeight:600,color:"#1C1C1C"}}>היום שלך</h2>
 <span style={{width:50,height:1,background:"linear-gradient(90deg,var(--pc),transparent)"}}/>
 </div>

 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:18,maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{background:"#fff",borderRadius:20,padding:"26px 28px",border:"1px solid #E8DED6",boxShadow:"0 6px 22px rgba(28,28,28,0.05)",position:"relative",overflow:"hidden"}}>
 
 <h3 className="serif" style={{fontSize:21,fontWeight:600,color:"#1C1C1C",marginBottom:16}}>דורש תשומת לב</h3>
                    {(()=>{
                      const items=[];
                      if(newLeadsCount>0)items.push({icon:"",text:`${newLeadsCount} פניות חדשות ממתינות למענה`,tab:"leads"});
                      if(leadsWithReminders.length>0)items.push({icon:"",text:`${leadsWithReminders.length} תזכורות מעקב להיום`,tab:"leads"});
                      if(coldClients.length>0)items.push({icon:"✦",text:`${coldClients.length} לקוחות לא ביקרו 60+ ימים`,tab:"whatsapp"});
                      const tomorrowNotSent=tomorrowAppts.filter(a=>!a.confirmation_sent).length;
                      if(tomorrowNotSent>0)items.push({icon:"",text:`${tomorrowNotSent} תורי מחר ללא תזכורת שנשלחה`,tab:"whatsapp"});
                      if(items.length===0)return <p style={{fontSize:11.5,color:"#7A716A",padding:"8px 0"}}>הכל מטופל — אין משימות פתוחות </p>;
                      return items.map((it,i)=>(
 <div key={i} onClick={()=>setActiveTab(it.tab)} className="stat-card" style={{display:"flex",alignItems:"center",gap:11,padding:"12px 14px",background:"linear-gradient(90deg,#F2E9E1,#FFFFFF)",borderRadius:14,marginBottom:8,cursor:"pointer"}}>
 <span style={{fontSize:16}}>{it.icon}</span>
 <p style={{fontSize:12,color:"#1C1C1C",fontWeight:500,flex:1}}>{it.text}</p>
 <span style={{fontSize:12,color:pc}}>←</span>
 </div>
                      ));
                    })()}
 </div>

 <div style={{background:"#fff",borderRadius:20,padding:"26px 28px",border:"1px solid #E8DED6",boxShadow:"0 6px 22px rgba(28,28,28,0.05)",position:"relative",overflow:"hidden"}}>
 
 <h3 className="serif" style={{fontSize:21,fontWeight:600,color:"#1C1C1C",marginBottom:16}}>תורים להיום</h3>
                    {todayAppts.length===0?(
 <div style={{textAlign:"center",padding:"22px 14px"}}>
 <div style={{fontSize:26,marginBottom:8}}>☕</div>
 <p style={{fontSize:12.5,fontWeight:600,color:"#1C1C1C",marginBottom:4}}>אין תורים להיום</p>
 <p style={{fontSize:10.5,color:"#7A716A",marginBottom:14}}>יום פנוי — הזדמנות טובה לקבוע תור או להתארגן</p>
 <button className="empty-cta" onClick={()=>{const svc=activeServices[0];setNewAppt({clientId:"",name:"",service:svc?.name||"",duration:svc?.duration||60,date:formatDate(new Date()),hour:settings.working_hours_start,price:svc?.price||0});setApptNote("");setShowModal(true);}} style={{background:pcGrad,color:"#fff",border:"none",borderRadius:24,padding:"9px 18px",fontSize:11.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>✦ קביעת תור</button>
 </div>
                      ):todayAppts.sort((a,b)=>a.hour-b.hour).map((a,i,arr)=>(
 <div key={a.id} style={{display:"flex",alignItems:"center",gap:13,padding:"13px 0",borderBottom:i<arr.length-1?"1px solid #E8DED6":"none"}}>
 <span className="serif" style={{fontSize:18,fontWeight:600,color:pc,width:50,flexShrink:0}}>{a.hour}:00</span>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:13,fontWeight:600,color:"#1C1C1C"}}>{a.name}</p>
 <p style={{fontSize:10.5,color:"#7A716A",marginTop:1}}>{a.service}</p>
 </div>
 <span style={{fontSize:9.5,padding:"5px 13px",borderRadius:20,fontWeight:500,background:pcTint,color:pc}}>{a.confirmation_status==="confirmed"?"אושר":a.confirmation_status==="cancelled"?"בוטל":"ממתין"}</span>
 </div>
                      ))}
 </div>

 <div style={{background:"#fff",borderRadius:20,padding:"26px 28px",border:"1px solid #E8DED6",boxShadow:"0 6px 22px rgba(28,28,28,0.05)",position:"relative",overflow:"hidden"}}>
 
 <h3 className="serif" style={{fontSize:21,fontWeight:600,color:"#1C1C1C",marginBottom:16}}>ימי הולדת קרובים</h3>
                    {upcomingBirthdays.length===0?<p style={{fontSize:11.5,color:"#7A716A",padding:"8px 0"}}>אין ימי הולדת ב-30 הימים הקרובים</p>
                      :upcomingBirthdays.slice(0,5).map((c,i,arr)=>{
                        const b=new Date(c.birthday);const bd=new Date(now.getFullYear(),b.getMonth(),b.getDate());if(bd<now)bd.setFullYear(now.getFullYear()+1);
                        return(
 <div key={c.id} style={{display:"flex",alignItems:"center",gap:14,padding:"11px 0",borderBottom:i<arr.length-1?"1px solid #E8DED6":"none"}}>
 <div className="serif" style={{width:44,height:44,borderRadius:14,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:600,color:"#fff",background:`linear-gradient(135deg,${pc2} 0%,${pc} 100%)`,boxShadow:"0 5px 12px rgba(212,175,55,0.26)"}}>{b.getDate()}</div>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:12.5,fontWeight:600,color:"#1C1C1C"}}>{c.name}</p>
 <p style={{fontSize:10,color:"#7A716A",marginTop:1}}>{bd.getDate()}/{bd.getMonth()+1}</p>
 </div>
                            {c.phone&&<a href={waBirthday(c.phone,c.name,settings.business_name)} target="_blank" rel="noreferrer" style={{fontSize:9.5,padding:"6px 14px",borderRadius:20,fontWeight:500,background:pcTint,color:pc,textDecoration:"none"}}>ברכה</a>}
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
 <h2 className="serif" style={{fontSize:22,fontWeight:600,color:"#1C1C1C"}}>{formatDateHe(weekDates[0])} – {formatDateHe(weekDates[5])}</h2>
 <div style={{display:"flex",gap:5,alignItems:"center"}}>
 <div className="desktop-only" style={{display:"flex",gap:6,fontSize:9,color:"#7A716A",marginLeft:6}}>
 <span style={{color:"#7BAE7F",fontWeight:700}}>● אישרה</span>
 <span style={{color:"#F44336",fontWeight:700}}>● ביטלה</span>
 <span style={{color:"#7A716A"}}>● ממתין</span>
 </div>
 <button onClick={()=>{const d=new Date(weekStart);d.setDate(d.getDate()-6);setWeekStart(d);}} style={{background:"#fff",border:"1px solid #E8DED6",borderRadius:20,padding:"6px 12px",cursor:"pointer",fontSize:11,color:pc}}>←</button>
 <button onClick={()=>setWeekStart(new Date())} style={{background:pcTint,border:"1px solid #E8DED6",borderRadius:20,padding:"6px 12px",cursor:"pointer",fontSize:11,color:pc}}>היום</button>
 <button onClick={()=>{const d=new Date(weekStart);d.setDate(d.getDate()+6);setWeekStart(d);}} style={{background:"#fff",border:"1px solid #E8DED6",borderRadius:20,padding:"6px 12px",cursor:"pointer",fontSize:11,color:pc}}>→</button>
 </div>
 </div>
 <div style={{background:"#fff",borderRadius:18,overflow:"auto",border:"1px solid #E8DED6",maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{display:"grid",gridTemplateColumns:"50px repeat(6,minmax(70px,1fr))",borderBottom:"1px solid #E8DED6",background:"linear-gradient(90deg,#F2E9E1,#FFFFFF)",minWidth:480}}>
 <div/>
                {weekDates.map((d,i)=>{
                  const isToday=formatDate(d)===today;
                  const dayAppts=appointments.filter(a=>a.date===formatDate(d));
                  const hasCancel=dayAppts.some(a=>a.confirmation_status==="cancelled");
                  return(
 <div key={i} style={{padding:"9px 4px",textAlign:"center",borderRight:i<5?"1px solid #E8DED6":"none",background:hasCancel?"#FFF3F3":"transparent"}}>
 <p style={{fontSize:9,color:"#7A716A"}}>{DAYS_HE[d.getDay()]}</p>
 <p className="serif" style={{fontSize:16,fontWeight:600,color:isToday?pc:"#1C1C1C"}}>{d.getDate()}</p>
 <p style={{fontSize:7,color:"#B8AFA0"}}>{d.getMonth()+1}/{d.getFullYear().toString().slice(2)}</p>
                      {hasCancel&&<p style={{fontSize:7,color:"#F44336"}}>ביטול</p>}
 </div>
                  );
                })}
 </div>
              {workingHours.map((hour,hi)=>(
 <div key={hour} style={{display:"grid",gridTemplateColumns:"50px repeat(6,minmax(70px,1fr))",borderBottom:hi<workingHours.length-1?"1px solid #F7F0F3":"none",minHeight:54,minWidth:480}}>
 <div style={{padding:"4px 3px 0",fontSize:8,color:"#B8AFA0",textAlign:"center",borderLeft:"1px solid #E8DED6"}}>{hour}</div>
                  {weekDates.map((date,di)=>{
                    const appt=getAppt(date,settings.working_hours_start+hi);
                    const apptColor=appt?getApptColor(appt):null;
                    return(
 <div key={di} className={!appt?"slot":""} onClick={()=>handleSlotClick(date,settings.working_hours_start+hi)} style={{borderRight:di<5?"1px solid #F7F0F3":"none",position:"relative",padding:2,minHeight:54}}>
                        {appt&&(
 <div className="appt-card" onMouseEnter={()=>setHoveredAppt(appt.id)} onMouseLeave={()=>setHoveredAppt(null)}
                            style={{background:apptColor,borderRadius:10,padding:"4px 6px",height:"calc(100% - 2px)",position:"relative",border:appt.confirmation_status==="confirmed"?"2px solid #7BAE7F":appt.confirmation_status==="cancelled"?"2px solid #F44336":"none"}}>
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
 <h2 className="serif" style={{fontSize:22,fontWeight:600,color:"#1C1C1C"}}>לקוחות ({filteredClients.length})</h2>
 <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
 <button onClick={()=>{setImportText("");setShowImportModal(true);}} style={{background:"#fff",color:pc,border:"1px solid #E8DED6",borderRadius:24,padding:"9px 16px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>ייבוא לקוחות</button>
 <button onClick={()=>{setEditingClient(null);setNewClient(emptyClient);setShowClientModal(true);}} style={{background:pcGrad,color:"#fff",border:"none",borderRadius:24,padding:"9px 18px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:`0 6px 16px ${pcShadow}`}}>✦ מטופלת חדשה</button>
 </div>
 </div>
 <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
 <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="שם או טלפון..." style={{flex:1,minWidth:140,border:"1px solid #E8DED6",borderRadius:24,padding:"9px 14px",fontSize:11.5,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#fff"}}/>
 <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{border:"1px solid #E8DED6",borderRadius:24,padding:"9px 12px",fontSize:10.5,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#fff",color:"#7A716A"}}>
 <option value="all">כל הסטטוסים</option><option value="VIP">VIP</option><option value="hot">חמות</option><option value="active">✓ פעילות</option><option value="cold">להתחדשות</option>
 </select>
 <select value={filterSkin} onChange={e=>setFilterSkin(e.target.value)} style={{border:"1px solid #E8DED6",borderRadius:24,padding:"9px 12px",fontSize:10.5,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#fff",color:"#7A716A"}}>
 <option value="all">כל עור</option>{SKIN_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
 </select>
 </div>
            {filteredClients.length===0?(
 <div className="pop-in" style={{textAlign:"center",padding:"46px 20px",background:"rgba(255,255,255,0.6)",borderRadius:18,marginTop:6}}>
 <div style={{fontSize:34,marginBottom:10}}>{(searchQuery||filterStatus!=="all")?"🔍":"👩‍🦰"}</div>
 <p style={{fontSize:14,fontWeight:600,color:"#1C1C1C",marginBottom:5}}>{(searchQuery||filterStatus!=="all")?"לא נמצאו לקוחות":"עוד אין לקוחות"}</p>
 <p style={{fontSize:11.5,color:"#7A716A",maxWidth:340,margin:"0 auto 16px"}}>{(searchQuery||filterStatus!=="all")?"נסי לשנות את החיפוש או הסינון.":"הוסיפי את הלקוחה הראשונה, או ייבאי רשימה שלמה בבת אחת."}</p>
 {!(searchQuery||filterStatus!=="all")&&(
 <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
 <button className="empty-cta" onClick={()=>{setEditingClient(null);setNewClient(emptyClient);setShowClientModal(true);}} style={{background:pcGrad,color:"#fff",border:"none",borderRadius:24,padding:"10px 20px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>✦ מטופלת חדשה</button>
 <button className="empty-cta" onClick={()=>{setImportText("");setShowImportModal(true);}} style={{background:"#fff",color:pc,border:"1px solid #E8DED6",borderRadius:24,padding:"10px 20px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>ייבוא לקוחות</button>
 </div>
 )}
 </div>
 )
              :filteredClients.map(client=>{
                const appts=getClientAppts(client.id);
                // Most recent visit by actual date (then hour) - not by row id,
                // so a later-created past appointment can't masquerade as "last".
                const last=[...appts].sort((a,b)=>{const d=String(b.date||"").localeCompare(String(a.date||""));return d!==0?d:(Number(b.hour)||0)-(Number(a.hour)||0);})[0];
                const statusColor=STATUS_COLORS[client.status]||"#D9B98C";
                const days=getDaysSince(client.id);
                const total=getClientTotal(client.id);
                return(
 <div key={client.id} className="client-row" role="button" tabIndex={0} onKeyDown={onKbdActivate} aria-label={`פתיחת כרטיס הלקוחה ${client.name}`} onClick={()=>{setSelectedClient(client);setClientTab("info");}} style={{background:"#fff",borderRadius:16,padding:"12px 14px",border:"1px solid #E8DED6",display:"flex",alignItems:"center",gap:11,marginBottom:7}}>
 <div style={{width:40,height:40,borderRadius:"50%",background:client.images?.[0]?"transparent":statusColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:700,color:"#fff",flexShrink:0,overflow:"hidden"}}>
                      {client.images?.[0]?<img alt={client.name} src={client.images[0]} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:client.name[0]}
 </div>
 <div style={{flex:1,minWidth:0}}>
 <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2,flexWrap:"wrap"}}>
 <p style={{fontWeight:600,fontSize:13,color:"#1C1C1C"}}>{client.name}</p>
                        {client.status&&<span style={{fontSize:7,background:statusColor,color:"#fff",padding:"2px 7px",borderRadius:20,fontWeight:600}}>{STATUS_LABELS[client.status]}</span>}
                        {days>90&&<span style={{fontSize:7,background:"#FBF3E2",color:"#B07F2A",padding:"2px 7px",borderRadius:20,fontWeight:600}}>רדומה · {days}י</span>}
                        {total>0&&<span style={{fontSize:7,background:pcTint,color:pc,padding:"2px 7px",borderRadius:20,fontWeight:700}}>₪{total.toLocaleString()}</span>}
 </div>
 <p style={{fontSize:9,color:"#7A716A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{client.phone&&`${client.phone} · `}{appts.length} תורים{last&&` · ${last.service}`}</p>
 </div>
                    {client.phone&&<a href={waLink(client.phone)} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} className="wa-btn" style={{padding:"5px 8px",fontSize:9}}></a>}
 <span style={{fontSize:11,color:pc}}>←</span>
 </div>
                );
              })}
 </div>
 </>)}

          {/* LEADS */}
          {activeTab==="leads"&&(<>
 <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:7}}>
 <h2 className="serif" style={{fontSize:22,fontWeight:600,color:"#1C1C1C"}}>פניות ({leads.length})</h2>
 <button onClick={()=>{setEditingLead(null);setNewLead(emptyLead);setShowLeadModal(true);}} style={{background:pcGrad,color:"#fff",border:"none",borderRadius:24,padding:"9px 18px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:`0 6px 16px ${pcShadow}`}}>✦ פנייה חדשה</button>
 </div>
 <div style={{display:"flex",gap:6,marginBottom:12,overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
 <div onClick={()=>setLeadFilter("all")} className="stat-card" style={{background:leadFilter==="all"?pcGrad:"#fff",borderRadius:24,padding:"7px 14px",border:"1px solid #E8DED6",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
 <span style={{fontSize:10.5,fontWeight:600,color:leadFilter==="all"?"#fff":"#1C1C1C"}}>הכל ({leads.length})</span>
 </div>
              {Object.entries(LEAD_STATUSES).map(([key,s])=>(
 <div key={key} onClick={()=>setLeadFilter(leadFilter===key?"all":key)} className="stat-card" style={{background:leadFilter===key?s.bg:"#fff",borderRadius:24,padding:"7px 14px",border:`1px solid ${leadFilter===key?s.color:"#E8DED6"}`,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
 <span style={{fontSize:9.5,fontWeight:leadFilter===key?700:400,color:leadFilter===key?s.color:"#7A716A"}}>{s.label} ({leads.filter(l=>l.status===key).length})</span>
 </div>
              ))}
 </div>
 <input value={leadSearch} onChange={e=>setLeadSearch(e.target.value)} placeholder="חיפוש..." style={{width:"100%",border:"1px solid #E8DED6",borderRadius:24,padding:"9px 14px",fontSize:11.5,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#fff",marginBottom:10}}/>
            {filteredLeads.length===0?(
 <div className="pop-in" style={{textAlign:"center",padding:"46px 20px",background:"rgba(255,255,255,0.6)",borderRadius:18,marginTop:6}}>
 <div style={{fontSize:32,marginBottom:10}}>✨</div>
 <p style={{fontSize:14,fontWeight:600,color:"#1C1C1C",marginBottom:5}}>{leadSearch||leadFilter!=="all"?"לא נמצאו פניות":"עוד אין פניות"}</p>
 <p style={{fontSize:11.5,color:"#7A716A",maxWidth:320,margin:"0 auto 16px",lineHeight:1.6}}>{leadSearch||leadFilter!=="all"?"נסי לשנות את החיפוש או הסינון.":"פניות מהאתר ומפייסבוק יופיעו כאן. אפשר גם להוסיף פנייה ידנית."}</p>
 {!(leadSearch||leadFilter!=="all")&&<button className="empty-cta" onClick={()=>{setEditingLead(null);setNewLead(emptyLead);setShowLeadModal(true);}} style={{background:pcGrad,color:"#fff",border:"none",borderRadius:24,padding:"10px 20px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>✦ פנייה חדשה</button>}
 </div>
              ):filteredLeads.map(lead=>{
                const st=LEAD_STATUSES[lead.status]||LEAD_STATUSES.new;
                const hasReminder=lead.reminder_date&&lead.reminder_date<=tomorrow;
                return(
 <div key={lead.id} className="lead-row" role="button" tabIndex={0} onKeyDown={onKbdActivate} aria-label={`פתיחת פרטי הפנייה ${lead.name}`} onClick={()=>setSelectedLead(lead)} style={{background:"#fff",borderRadius:16,padding:"11px 14px",border:`1px solid ${hasReminder?"#FF9800":"#E8DED6"}`,display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
 <div style={{width:34,height:34,borderRadius:"50%",background:st.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}}>{SOURCE_ICONS[lead.source]||""}</div>
 <div style={{flex:1,minWidth:0}}>
 <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:1,flexWrap:"wrap"}}>
 <p style={{fontWeight:600,fontSize:12,color:"#1C1C1C"}}>{lead.name}</p>
 <span style={{fontSize:7,background:st.bg,color:st.color,padding:"2px 6px",borderRadius:20,fontWeight:600}}>{st.label}</span>
                        {hasReminder&&<span style={{fontSize:7,background:"#FFF3E0",color:"#FF9800",padding:"2px 6px",borderRadius:20}}></span>}
 </div>
 <p style={{fontSize:9,color:"#7A716A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{lead.phone&&`${lead.phone} · `}{SOURCE_ICONS[lead.source]} {lead.source}{lead.service_interest&&` · ${lead.service_interest}`}</p>
 </div>
                    {lead.phone&&<a href={waLink(lead.phone)} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} className="wa-btn" style={{padding:"4px 7px",fontSize:9}}></a>}
                    {lead.status!=="closed"&&lead.status!=="lost"&&<button onClick={e=>{e.stopPropagation();handleConvertLead(lead);}} style={{background:"#7BAE7F",color:"#fff",border:"none",borderRadius:20,padding:"4px 9px",fontSize:9,cursor:"pointer",fontFamily:"inherit",fontWeight:600,flexShrink:0}}>המר ✓</button>}
 </div>
                );
              })}
 </div>
 </>)}

          {/* CASHIER */}
          {activeTab==="cashier"&&(<>
 <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:7}}>
 <h2 className="serif" style={{fontSize:22,fontWeight:600,color:"#1C1C1C"}}>תשלומים וקבלות</h2>
 <div style={{display:"flex",gap:6}}>
 <button onClick={()=>handleOpenCashier(null)} style={{background:pcGrad,color:"#fff",border:"none",borderRadius:24,padding:"9px 18px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:`0 6px 16px ${pcShadow}`}}>✦ תשלום חדש</button>
 <button onClick={handleExportCSV} style={{background:"#fff",color:pc,border:"1px solid #E8DED6",borderRadius:24,padding:"9px 18px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>ייצוא Excel</button>
 </div>
 </div>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10,marginBottom:16}}>
 <div style={{background:"linear-gradient(180deg,#FFFFFF,#FFFFFF)",borderRadius:16,padding:"14px 16px",border:"1px solid #E8DED6"}}>
 <p style={{fontSize:9,color:"#7A716A"}}>הכנסות החודש</p>
 <p className="serif" style={{fontSize:22,fontWeight:600,color:pc}}>₪{thisMonthRevenue.toLocaleString()}</p>
 </div>
              {paymentBreakdown.map(p=>(
 <div key={p.key} style={{background:"#fff",borderRadius:16,padding:"14px 16px",border:"1px solid #E8DED6"}}>
 <p style={{fontSize:9,color:"#7A716A"}}>{p.icon} {p.key}</p>
 <p className="serif" style={{fontSize:19,fontWeight:600,color:"#1C1C1C"}}>₪{p.total.toLocaleString()}</p>
 <p style={{fontSize:7,color:"#7A716A"}}>{p.count} עסקאות</p>
 </div>
              ))}
 </div>

            {todayAppts.length>0&&(
 <div style={{background:"#fff",borderRadius:18,padding:16,border:"1px solid #E8DED6",marginBottom:14}}>
 <h3 className="serif" style={{fontSize:16,fontWeight:600,color:"#1C1C1C",marginBottom:12}}>תורים היום — תשלום מהיר</h3>
                {todayAppts.map(a=>{
                  const client=clients.find(c=>String(c.id)===String(a.client_id));
                  const paid=receipts.some(r=>String(r.appointment_id)===String(a.id));
                  return(
 <div key={a.id} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 11px",background:paid?"#F3FFF6":pcTint,borderRadius:12,marginBottom:6,border:`1px solid ${paid?"#B5EAD7":"#E8DED6"}`,flexWrap:"wrap"}}>
 <div style={{flex:1,minWidth:120}}>
 <p style={{fontSize:11,fontWeight:600,color:"#1C1C1C"}}>{a.name}</p>
 <p style={{fontSize:9,color:"#7A716A"}}>{a.service} · ₪{a.price}</p>
 </div>
                      {paid?<span style={{fontSize:10,color:"#7BAE7F",fontWeight:700}}>שולם</span>
                        :<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                          {client?.phone&&PAYMENT_METHODS.slice(1).map(pm=>(
 <a key={pm.key} href={waPayment(client.phone,a.name,a.price,a.service,pm.key,settings.business_phone)} target="_blank" rel="noreferrer"
                              style={{background:pm.color,color:"#fff",border:"none",borderRadius:14,padding:"4px 8px",fontSize:8,cursor:"pointer",textDecoration:"none",fontWeight:600}}>{pm.icon}</a>
                          ))}
 <button onClick={()=>handleOpenCashier(a)} style={{background:pcGrad,color:"#fff",border:"none",borderRadius:14,padding:"4px 10px",fontSize:9,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}></button>
 </div>
                      }
 </div>
                  );
                })}
 </div>
            )}

 <div style={{background:"#fff",borderRadius:18,padding:16,border:"1px solid #E8DED6"}}>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:5}}>
 <h3 className="serif" style={{fontSize:16,fontWeight:600,color:"#1C1C1C"}}>קבלות</h3>
 <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {["all",...PAYMENT_METHODS.map(p=>p.key)].map(m=>(
 <button key={m} onClick={()=>setReceiptFilter(m)} style={{background:receiptFilter===m?pcGrad:pcTint,color:receiptFilter===m?"#fff":"#7A716A",border:"1px solid #E8DED6",borderRadius:20,padding:"3px 9px",fontSize:8,cursor:"pointer",fontFamily:"inherit"}}>
                      {m==="all"?"הכל":m}
 </button>
                  ))}
 </div>
 </div>
              {filteredReceipts.length===0?(
 <div className="pop-in" style={{textAlign:"center",padding:"40px 20px",background:"rgba(255,255,255,0.6)",borderRadius:18,marginTop:6}}>
 <div style={{fontSize:32,marginBottom:10}}>🧾</div>
 <p style={{fontSize:14,fontWeight:600,color:"#1C1C1C",marginBottom:5}}>{receiptFilter!=="all"?"אין קבלות בסינון הזה":"עוד אין קבלות"}</p>
 <p style={{fontSize:11.5,color:"#7A716A",maxWidth:320,margin:"0 auto 16px",lineHeight:1.6}}>{receiptFilter!=="all"?"נסי לשנות את אופן התשלום בסינון.":"כל תשלום שתגבי יופיע כאן. אפשר לפתוח תשלום חדש עכשיו."}</p>
 {receiptFilter==="all"&&<button className="empty-cta" onClick={()=>handleOpenCashier(null)} style={{background:pcGrad,color:"#fff",border:"none",borderRadius:24,padding:"10px 20px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>✦ תשלום חדש</button>}
 </div>
              ):filteredReceipts.sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||"")).slice(0,20).map(r=>(
 <div key={r.id} onClick={()=>setShowReceipt(r)} role="button" tabIndex={0} onKeyDown={onKbdActivate} aria-label={`פתיחת קבלה — ${r.client_name||"לקוחה"}`} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 11px",background:pcTint,borderRadius:12,marginBottom:5,cursor:"pointer"}} className="client-row">
 <div style={{width:30,height:30,borderRadius:"50%",background:PAYMENT_METHODS.find(p=>p.key===r.payment_method)?.color||"#D9B98C",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0}}>
                      {PAYMENT_METHODS.find(p=>p.key===r.payment_method)?.icon||""}
 </div>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:11,fontWeight:600,color:"#1C1C1C"}}>{r.client_name}</p>
 <p style={{fontSize:8,color:"#7A716A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.service} · {r.payment_method} · {r.created_at?.slice(0,10)}</p>
 </div>
 <p className="serif" style={{fontSize:14,fontWeight:600,color:pc}}>₪{r.amount}</p>
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
              {key:"birthdays",icon:"",title:"ברכות יום הולדת",color:pc,bg:"#F7F1E6",targets:birthdayTargets,empty:"אין ימי הולדת ב-30 הימים הקרובים"},
              {key:"cold",icon:"",title:"מטופלות להתחדשות (60+ יום)",color:"#5580C4",bg:"#EBF3FF",targets:coldTargets,empty:"כל המטופלות פעילות! "},
              {key:"review",icon:"",title:"בקשת ביקורת (השבוע האחרון)",color:"#9C27B0",bg:"#F3E5F5",targets:reviewTargets,empty:"אין ביקורים בשבוע האחרון"},
            ];

            return(<>
 <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <h2 className="serif" style={{fontSize:22,fontWeight:600,color:"#1C1C1C",marginBottom:4}}>מרכז הודעות</h2>
 <p style={{fontSize:11,color:"#7A716A",marginBottom:16}}>שליחת הודעות מוכנות ללקוחות — בלחיצה אחת</p>

 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:12,marginBottom:16}}>
                {groups.map(g=>{
                  const withPhone=g.targets.filter(t=>t.phone);
                  return(
 <div key={g.key} style={{background:"#fff",borderRadius:18,border:`1px solid #E8DED6`,overflow:"hidden"}}>
 <div style={{background:g.bg,padding:"12px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
 <div style={{display:"flex",alignItems:"center",gap:8}}>
 <span style={{fontSize:16}}>{g.icon}</span>
 <div>
 <p style={{fontSize:11.5,fontWeight:700,color:"#1C1C1C"}}>{g.title}</p>
 <p style={{fontSize:9,color:g.color,fontWeight:600}}>{withPhone.length} נמענים</p>
 </div>
 </div>
                        {withPhone.length>0&&(
 <button onClick={()=>waSendGroup(g.targets)} style={{background:"#25D366",color:"#fff",border:"none",borderRadius:20,padding:"7px 12px",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>שליחה מרוכזת</button>
                        )}
 </div>
 <div style={{padding:"10px 12px",maxHeight:200,overflowY:"auto"}}>
                        {g.targets.length===0?<p style={{fontSize:10,color:"#B8AFA0",padding:"6px 0"}}>{g.empty}</p>
                          :g.targets.map((t,i)=>(
 <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 4px",borderBottom:i<g.targets.length-1?"1px solid #F7F0F3":"none"}}>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:10,fontWeight:600,color:"#1C1C1C",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                  {waSentToday[t.clientId]&&<span style={{color:"#7BAE7F"}}>✓ </span>}{t.name}
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

 <div style={{background:"#fff",borderRadius:18,border:"1px solid #E8DED6",padding:16,marginBottom:14}}>
 <h3 className="serif" style={{fontSize:16,fontWeight:600,color:"#1C1C1C",marginBottom:12}}>שליחת הודעה לקבוצה</h3>
 <p style={{fontSize:9,color:"#7A716A",marginBottom:6}}>בחרי קהל יעד</p>
 <div style={{display:"flex",gap:4,marginBottom:12,flexWrap:"wrap"}}>
                  {[{k:"all",l:"כל המטופלות"},{k:"vip",l:"VIP"},{k:"active",l:"✓ פעילות"},{k:"cold",l:"להתחדשות"}].map(a=>(
 <button key={a.k} onClick={()=>setWaBroadcastAudience(a.k)} style={{padding:"6px 12px",border:"1px solid",borderColor:waBroadcastAudience===a.k?pc:"#E8DED6",borderRadius:20,background:waBroadcastAudience===a.k?pcGrad:pcTint,color:waBroadcastAudience===a.k?"#fff":"#7A716A",fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:waBroadcastAudience===a.k?700:400}}>{a.l}</button>
                  ))}
 </div>
 <textarea value={waBroadcastMsg} onChange={e=>setWaBroadcastMsg(e.target.value)} rows={3}
                  placeholder="כתבי כאן את ההודעה... למשל: שלום! החודש מבצע מיוחד — 20% הנחה על טיפולי פנים "
                  style={{width:"100%",border:"1px solid #E8DED6",borderRadius:14,padding:"10px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint,resize:"none",marginBottom:8}}/>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
 <p style={{fontSize:10,color:"#7A716A"}}>{audienceClients.length} לקוחות עם טלפון בקבוצה זו</p>
 <button onClick={()=>{
                    if(!waBroadcastMsg.trim()){toast("נא לכתוב הודעה","error");return;}
                    waSendGroup(audienceClients.map(c=>({clientId:c.id,name:c.name,phone:c.phone,message:`שלום ${c.name}! ${waBroadcastMsg}`})));
                  }} style={{background:"#25D366",color:"#fff",border:"none",borderRadius:24,padding:"9px 16px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>שלחי לקבוצה</button>
 </div>
 </div>

 <div style={{background:"#fff",borderRadius:18,border:"1px solid #E8DED6",padding:16}}>
 <h3 className="serif" style={{fontSize:16,fontWeight:600,color:"#1C1C1C",marginBottom:12}}>הודעה אישית למטופלת</h3>
 <div style={{position:"relative",marginBottom:8}}>
 <input value={waFreeSearch} onChange={e=>{setWaFreeSearch(e.target.value);if(!e.target.value)setWaFreeClient(null);}}
                    placeholder="חיפוש לקוחה לפי שם או טלפון..."
                    style={{width:"100%",border:`1px solid ${waFreeClient?"#7BAE7F":"#E8DED6"}`,borderRadius:14,padding:"10px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:waFreeClient?"#F3FFF6":pcTint}}/>
                  {waFreeClient&&<span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:13}}>✓</span>}
                  {waFreeSearch.length>1&&!waFreeClient&&(
 <div style={{position:"absolute",top:"100%",right:0,left:0,background:"#fff",borderRadius:14,boxShadow:"0 8px 24px rgba(212,175,55,0.12)",zIndex:99,overflow:"hidden",marginTop:3,maxHeight:180,overflowY:"auto"}}>
                      {clients.filter(c=>c.name?.includes(waFreeSearch)||c.phone?.includes(waFreeSearch)).slice(0,6).map(c=>(
 <div key={c.id} onClick={()=>{setWaFreeClient(c);setWaFreeSearch(c.name);}} className="client-row" style={{padding:"9px 12px",borderBottom:"1px solid #F2E9E1",cursor:"pointer"}}>
 <p style={{fontSize:11,fontWeight:600,color:"#1C1C1C"}}>{c.name}</p>
 <p style={{fontSize:9,color:"#7A716A"}}>{c.phone||"אין טלפון"}</p>
 </div>
                      ))}
 </div>
                  )}
 </div>
 <textarea value={waFreeMsg} onChange={e=>setWaFreeMsg(e.target.value)} rows={3}
                  placeholder="כתבי כאן את ההודעה..."
                  style={{width:"100%",border:"1px solid #E8DED6",borderRadius:14,padding:"10px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint,resize:"none",marginBottom:8}}/>
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
 <h2 className="serif" style={{fontSize:22,fontWeight:600,color:"#1C1C1C",marginBottom:16}}>שיווק</h2>

 <div style={{display:"flex",gap:6,marginBottom:18}}>
 <button onClick={()=>setMarketingView("campaigns")} className="primary-btn" style={{padding:"8px 18px",fontSize:12,background:marketingView==="campaigns"?pcGrad:"#fff",color:marketingView==="campaigns"?"#fff":"#7A716A",border:marketingView==="campaigns"?"none":"1px solid #E8DED6"}}>קמפיינים בפייסבוק</button>
 <button onClick={()=>{setMarketingView("ai");if(savedCampaigns===null)loadSavedCampaigns();}} className="primary-btn" style={{padding:"8px 18px",fontSize:12,background:marketingView==="ai"?pcGrad:"#fff",color:marketingView==="ai"?"#fff":"#7A716A",border:marketingView==="ai"?"none":"1px solid #E8DED6"}}>תוכן AI</button>
 </div>

 {marketingView==="campaigns"&&(<>
 <div style={{background:"#fff",borderRadius:18,padding:16,border:"1px solid #E8DED6",marginBottom:16}}>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
 <h3 className="serif" style={{fontSize:17,fontWeight:600,color:"#1C1C1C"}}>קמפיינים בפייסבוק ואינסטגרם</h3>
 <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
 {fbPage?(
 <span title={fbPage.page_name} style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:10,fontWeight:600,color:"#388E3C",background:"#E8F5E9",borderRadius:20,padding:"6px 12px",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>מחובר ✓ · {fbPage.page_name}</span>
 ):(
 <button onClick={()=>{window.location.href="/api/facebook/oauth/start";}} className="primary-btn" style={{padding:"7px 14px",background:"#1877F2",color:"#fff",fontSize:11}}>התחבר לפייסבוק</button>
 )}
 <select value={fbDatePreset} onChange={e=>{setFbDatePreset(e.target.value);loadFbCampaigns(e.target.value);}} style={{border:"1px solid #E8DED6",borderRadius:20,padding:"6px 10px",fontSize:10,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint,color:"#7A716A"}}>
 <option value="today">היום</option>
 <option value="last_7d">7 ימים</option>
 <option value="last_30d">30 ימים</option>
 <option value="last_90d">90 ימים</option>
 </select>
 <button onClick={()=>loadFbCampaigns()} disabled={fbLoading} className="primary-btn" style={{padding:"7px 14px",background:pcGrad,color:"#fff",fontSize:11}}>{fbLoading?"טוען...":fbCampaigns===null?"טעני קמפיינים":"רענני"}</button>
 </div>
 </div>

 {fbCampaigns===null&&!fbLoading&&!fbError&&(
 <p style={{fontSize:11,color:"#7A716A",padding:"10px 0"}}>לחצי "טעני קמפיינים" כדי לראות את ביצועי המודעות שלך בפייסבוק ואינסטגרם — הוצאה, לידים, ומחיר לליד.</p>
 )}

 {fbError&&(
 <div style={{background:"#FFFAF7",border:"1px solid #FFDAC1",borderRadius:12,padding:"11px 14px"}}>
 <p style={{fontSize:11,color:pc,fontWeight:600,marginBottom:3}}>לא ניתן לטעון כרגע</p>
 <p style={{fontSize:10,color:"#7A716A"}}>{fbError}</p>
 </div>
 )}

 {fbTotals&&fbCampaigns&&fbCampaigns.length>0&&(
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:10,marginBottom:14}}>
 <div style={{background:"linear-gradient(180deg,#FFFFFF,#FFFFFF)",borderRadius:14,padding:"12px 14px",border:"1px solid #E8DED6"}}>
 <p style={{fontSize:9,color:"#7A716A"}}>סה״כ הוצאה</p>
 <p className="serif" style={{fontSize:20,fontWeight:600,color:pc}}>₪{Math.round(fbTotals.spend).toLocaleString()}</p>
 </div>
 <div style={{background:"linear-gradient(180deg,#FFFFFF,#FFFFFF)",borderRadius:14,padding:"12px 14px",border:"1px solid #E8DED6"}}>
 <p style={{fontSize:9,color:"#7A716A"}}>לידים</p>
 <p className="serif" style={{fontSize:20,fontWeight:600,color:"#1C1C1C"}}>{fbTotals.leads}</p>
 </div>
 <div style={{background:"linear-gradient(180deg,#FFFFFF,#FFFFFF)",borderRadius:14,padding:"12px 14px",border:"1px solid #E8DED6"}}>
 <p style={{fontSize:9,color:"#7A716A"}}>מחיר לליד</p>
 <p className="serif" style={{fontSize:20,fontWeight:600,color:pc}}>{fbTotals.cpl?`₪${fbTotals.cpl}`:"—"}</p>
 </div>
 <div style={{background:"linear-gradient(180deg,#FFFFFF,#FFFFFF)",borderRadius:14,padding:"12px 14px",border:"1px solid #E8DED6"}}>
 <p style={{fontSize:9,color:"#7A716A"}}>חשיפות</p>
 <p className="serif" style={{fontSize:20,fontWeight:600,color:"#1C1C1C"}}>{fbTotals.impressions.toLocaleString()}</p>
 </div>
 </div>
 )}

 {fbCampaigns&&fbCampaigns.length>0&&fbCampaigns.map(c=>(
 <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 12px",background:pcTint,borderRadius:12,marginBottom:6,flexWrap:"wrap"}}>
 <div style={{flex:1,minWidth:140}}>
 <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
 <p style={{fontSize:12,fontWeight:600,color:"#1C1C1C"}}>{c.name}</p>
 <span style={{fontSize:7,padding:"2px 7px",borderRadius:20,fontWeight:600,background:c.status==="ACTIVE"?"#E8F5E9":"#F0E7EC",color:c.status==="ACTIVE"?"#388E3C":"#7A716A"}}>{c.status==="ACTIVE"?"פעיל":"מושהה"}</span>
 </div>
 <p style={{fontSize:9,color:"#7A716A",marginTop:2}}>{c.impressions.toLocaleString()} חשיפות · {c.clicks} קליקים</p>
 </div>
 <div style={{textAlign:"center",minWidth:60}}>
 <p style={{fontSize:8,color:"#7A716A"}}>הוצאה</p>
 <p className="serif" style={{fontSize:14,fontWeight:600,color:pc}}>₪{Math.round(c.spend).toLocaleString()}</p>
 </div>
 <div style={{textAlign:"center",minWidth:45}}>
 <p style={{fontSize:8,color:"#7A716A"}}>לידים</p>
 <p className="serif" style={{fontSize:14,fontWeight:600,color:"#1C1C1C"}}>{c.leads}</p>
 </div>
 <div style={{textAlign:"center",minWidth:55}}>
 <p style={{fontSize:8,color:"#7A716A"}}>לליד</p>
 <p className="serif" style={{fontSize:14,fontWeight:600,color:pc}}>{c.cpl?`₪${c.cpl}`:"—"}</p>
 </div>
 </div>
 ))}

 {fbCampaigns&&fbCampaigns.length===0&&!fbError&&(
 <p style={{fontSize:11,color:"#7A716A",padding:"8px 0"}}>לא נמצאו קמפיינים בטווח הזמן הזה.</p>
 )}
 </div>

 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10,marginBottom:16}}>
              {[
                {label:"סה״כ לידים",value:leads.length,icon:""},
                {label:"הומרו",value:convertedLeads.length,icon:"✓"},
                {label:"המרה",value:`${conversionRate}%`,icon:""},
                {label:"הכנסות מלידים",value:`₪${campaignStats.reduce((s,c)=>s+c.revenue,0).toLocaleString()}`,icon:""},
              ].map((s,i)=>(
 <div key={i} className="stat-card" style={{background:"linear-gradient(180deg,#FFFFFF,#FFFFFF)",borderRadius:16,padding:"14px 14px",border:`1px solid #E8DED6`}}>
 <div style={{fontSize:15,marginBottom:3}}>{s.icon}</div>
 <p style={{fontSize:9,color:"#7A716A",marginBottom:2}}>{s.label}</p>
 <p className="serif" style={{fontSize:19,fontWeight:600,color:pc}}>{s.value}</p>
 </div>
              ))}
 </div>
 <div style={{background:"#fff",borderRadius:18,padding:16,border:"1px solid #E8DED6",marginBottom:14}}>
 <h3 className="serif" style={{fontSize:16,fontWeight:600,color:"#1C1C1C",marginBottom:14}}>ביצועים לפי מקור</h3>
              {campaignStats.length===0?<p style={{color:"#B8AFA0",fontSize:11}}>אין נתונים עדיין</p>
                :campaignStats.map((s,i)=>(
 <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px",background:i%2===0?pcTint:"#fff",borderRadius:12,marginBottom:4}}>
 <span style={{fontSize:16,flexShrink:0}}>{s.icon}</span>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:11.5,fontWeight:700,color:"#1C1C1C"}}>{s.source}</p>
 <div style={{display:"flex",gap:7,marginTop:1,flexWrap:"wrap"}}>
 <span style={{fontSize:8,color:"#7A716A"}}>{s.total} לידים</span>
 <span style={{fontSize:8,color:"#7BAE7F"}}>{s.converted} הומרו</span>
 <span style={{fontSize:8,color:pc,fontWeight:700}}>{s.rate}%</span>
 </div>
 <div style={{background:"#F0E7EC",borderRadius:4,height:4,marginTop:3}}>
 <div style={{background:pcGrad,borderRadius:4,height:4,width:`${s.rate}%`}}/>
 </div>
 </div>
 <p className="serif" style={{fontSize:14,fontWeight:600,color:pc}}>₪{s.revenue.toLocaleString()}</p>
 </div>
                ))}
 </div>
 </>)}

 {marketingView==="ai"&&(<>
 <div style={{textAlign:"center",marginBottom:18}}>
 <h2 className="serif" style={{fontSize:26,fontWeight:600,color:"#1C1C1C",marginBottom:6}}>תוכן AI</h2>
 <p style={{fontSize:12.5,color:"#7A716A"}}>פוסטים מוכנים, קמפיינים שמורים, ורילסים — הכל במקום אחד</p>
 </div>

 <div style={{display:"flex",gap:6,justifyContent:"center",marginBottom:22,flexWrap:"wrap"}}>
 <button onClick={()=>setAiPostsView("create")} className="primary-btn" style={{padding:"8px 20px",fontSize:12,background:aiPostsView==="create"?pcGrad:"#fff",color:aiPostsView==="create"?"#fff":"#7A716A",border:aiPostsView==="create"?"none":"1px solid #E8DED6"}}>יצירת פוסטים</button>
 <button onClick={()=>{setAiPostsView("saved");loadSavedCampaigns();}} className="primary-btn" style={{padding:"8px 20px",fontSize:12,background:aiPostsView==="saved"?pcGrad:"#fff",color:aiPostsView==="saved"?"#fff":"#7A716A",border:aiPostsView==="saved"?"none":"1px solid #E8DED6"}}>הקמפיינים שלי{savedCampaigns&&savedCampaigns.length>0?` (${savedCampaigns.length})`:""}</button>
 <button onClick={()=>setAiPostsView("reels")} className="primary-btn" style={{padding:"8px 20px",fontSize:12,background:aiPostsView==="reels"?pcGrad:"#fff",color:aiPostsView==="reels"?"#fff":"#7A716A",border:aiPostsView==="reels"?"none":"1px solid #E8DED6"}}>🎬 רילסים</button>
 </div>

 {aiPostsView==="create"&&(<>
 <div style={{background:"#fff",borderRadius:20,padding:"22px 24px",border:"1px solid #E8DED6",marginBottom:18,position:"relative",overflow:"hidden"}}>
 
 <p style={{fontSize:11,color:"#7A716A",fontWeight:600,marginBottom:8}}>מה תרצי לפרסם?</p>
 <textarea value={postGoal} onChange={e=>setPostGoal(e.target.value)} rows={3}
 placeholder="לדוגמה: מבצע על טיפולי פנים לחודש הקרוב / להחזיר לקוחות שלא הגיעו מזמן"
 style={{width:"100%",border:"1px solid #E8DED6",borderRadius:14,padding:"12px 14px",fontSize:13,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint,resize:"none",marginBottom:12}}/>
 <button onClick={generatePosts} disabled={postLoading} className="primary-btn" style={{width:"100%",padding:"13px 0",background:pcGrad,color:"#fff",fontSize:14}}>
 {postLoading?"יוצרת פוסטים... ✦":"✦ צרי לי 5 פוסטים"}
 </button>
 </div>

 {postError&&(
 <div style={{background:"#FFFAF7",border:"1px solid #FFDAC1",borderRadius:14,padding:"12px 16px",marginBottom:16}}>
 <p style={{fontSize:11.5,color:pc,fontWeight:600}}>{postError}</p>
 </div>
 )}

 {postLoading&&(
 <div style={{textAlign:"center",padding:"30px 0"}}>
 <p style={{fontSize:13,color:pc,fontWeight:500}}>ה-AI בונה אסטרטגיה וכותב 5 וריאציות... רגע אחד ✦</p>
 </div>
 )}

 {postStrategy&&!postLoading&&(
 <div style={{background:pcTint,borderRadius:18,padding:"18px 22px",marginBottom:18}}>
 <p style={{fontSize:11,color:pc,fontWeight:700,marginBottom:6}}>האסטרטגיה של ה-AI</p>
 <p style={{fontSize:12.5,color:"#3A2A30",lineHeight:1.6,marginBottom:8}}>{postStrategy.strategy}</p>
 {postStrategy.keyPoints&&postStrategy.keyPoints.length>0&&(
 <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
 {postStrategy.keyPoints.map((kp,i)=>(
 <span key={i} style={{fontSize:9.5,background:"rgba(255,255,255,0.7)",color:pc,padding:"3px 10px",borderRadius:20,fontWeight:500}}>{kp}</span>
 ))}
 </div>
 )}
 </div>
 )}

 {postVariations&&postVariations.length>0&&postVariations.map((v,i)=>(
 <div key={i} style={{background:"#fff",borderRadius:18,border:"1px solid #E8DED6",marginBottom:14,overflow:"hidden"}}>
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
 <span className="serif" style={{fontSize:22,fontWeight:600,color:pc}}>{i+1}</span>
 <span style={{fontSize:9,background:"#F7F1E6",color:pc,padding:"3px 10px",borderRadius:20,fontWeight:600}}>{({emotional:"רגשי",educational:"חינוכי",urgency:"דחיפות",social_proof:"המלצות",engaging_question:"שאלה מעוררת"})[v.variationType]||v.variationType}</span>
 </div>
 <button onClick={()=>copyPost(v)} className="primary-btn" style={{padding:"6px 14px",background:pcGrad,color:"#fff",fontSize:10}}>העתיקי</button>
 </div>
 {v.title&&<p className="serif" style={{fontSize:16,fontWeight:600,color:"#1C1C1C",marginBottom:6}}>{v.title}</p>}
 <p style={{fontSize:13,color:"#3A2A30",lineHeight:1.65,whiteSpace:"pre-wrap",marginBottom:10}}>{v.body}</p>
 {v.callToAction&&<p style={{fontSize:12.5,color:pc,fontWeight:600,marginBottom:8}}>{v.callToAction}</p>}
 {v.hashtags&&v.hashtags.length>0&&(
 <p style={{fontSize:11,color:"#7A716A"}}>{v.hashtags.join(" ")}</p>
 )}
 <div style={{display:"flex",gap:6,marginTop:12,flexWrap:"wrap"}}>
 <button onClick={()=>shareToFacebook(v)} style={{flex:"1 1 auto",padding:"8px 12px",background:"#1877F2",color:"#fff",border:"none",borderRadius:10,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>שיתוף לפייסבוק</button>
 <button onClick={()=>copyPost(v)} style={{flex:"1 1 auto",padding:"8px 12px",background:"#fff",color:pc,border:"1px solid #E8DED6",borderRadius:10,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>העתקת טקסט</button>
 <button onClick={()=>setDesignPost(v)} style={{flex:"1 1 auto",padding:"8px 12px",background:pcGrad,color:"#fff",border:"none",borderRadius:10,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>🎨 עצבי כתמונה</button>
 {v.image&&v.image.url&&<button onClick={()=>downloadImage(v.image.url,v.variationNumber)} style={{flex:"1 1 auto",padding:"8px 12px",background:"#fff",color:pc,border:"1px solid #E8DED6",borderRadius:10,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>הורדת תמונה</button>}
 </div>
 <p style={{fontSize:9,color:"#B8AFA0",marginTop:6}}>לאינסטגרם: הורידי את התמונה והדביקי את הטקסט</p>
 </div>
 </div>
 ))}

 {postVariations&&postVariations.length===0&&!postError&&(
 <p style={{fontSize:12,color:"#7A716A",textAlign:"center",padding:"20px 0"}}>לא נוצרו פוסטים. נסי שוב עם תיאור אחר.</p>
 )}

 {postVariations&&postVariations.length>0&&(
 <button onClick={saveCampaign} disabled={savingCampaign} className="primary-btn" style={{width:"100%",padding:"12px 0",background:"#fff",color:pc,border:`1.5px solid ${pc}`,fontSize:13,marginBottom:8}}>
 {savingCampaign?"שומרת...":"✦ שמרי את הקמפיין הזה"}
 </button>
 )}

 <div style={{background:"#fff",borderRadius:20,padding:"22px 24px",border:"1px solid #E8DED6",marginTop:24,position:"relative",overflow:"hidden"}}>
 
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,flexWrap:"wrap",gap:8}}>
 <h3 className="serif" style={{fontSize:18,fontWeight:600,color:"#1C1C1C"}}>קבוצות פייסבוק לפרסום</h3>
 <button onClick={loadGroups} disabled={groupsLoading} className="primary-btn" style={{padding:"7px 14px",background:pcGrad,color:"#fff",fontSize:11}}>{groupsLoading?"מחפשת...":groups===null?"הציעי לי קבוצות":"רענני"}</button>
 </div>
 <p style={{fontSize:11,color:"#7A716A",marginBottom:groups?14:0}}>קבוצות שכדאי לחפש ולהצטרף אליהן כדי לפרסם בהן</p>
 {groupsError&&<p style={{fontSize:11,color:pc,fontWeight:600,marginTop:10}}>{groupsError}</p>}
 {groups&&groups.length>0&&groups.map((g,i)=>(
 <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"11px 0",borderBottom:i<groups.length-1?"1px solid #F7F0F3":"none"}}>
 <div style={{flex:1,minWidth:0}}>
 <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:2}}>
 <p style={{fontSize:12.5,fontWeight:600,color:"#1C1C1C"}}>{g.name}</p>
 <span style={{fontSize:8.5,background:"#F7F1E6",color:pc,padding:"2px 8px",borderRadius:20,fontWeight:500}}>{g.category}</span>
 </div>
 <p style={{fontSize:10.5,color:"#7A716A",lineHeight:1.5}}>{g.reasoning}</p>
 </div>
 <a href={`https://www.facebook.com/search/groups/?q=${encodeURIComponent(g.name)}`} target="_blank" rel="noreferrer" className="wa-btn" style={{background:"#5580C4",padding:"5px 10px",fontSize:9,whiteSpace:"nowrap"}}>חפשי</a>
 </div>
 ))}
 </div>
 </>)}

 {aiPostsView==="saved"&&(<>
 {savedCampaigns===null&&<p style={{fontSize:12,color:"#7A716A",textAlign:"center",padding:"30px 0"}}>טוען...</p>}
 {savedCampaigns&&savedCampaigns.length===0&&(
 <div style={{background:"#fff",borderRadius:18,padding:"40px 20px",textAlign:"center",border:"1px solid #E8DED6"}}>
 <p style={{fontSize:13,color:"#7A716A",marginBottom:6}}>עדיין לא שמרת קמפיינים</p>
 <p style={{fontSize:11,color:"#B8AFA0"}}>צרי פוסטים בלשונית "יצירת פוסטים" ולחצי "שמרי את הקמפיין"</p>
 </div>
 )}
 {savedCampaigns&&savedCampaigns.length>0&&savedCampaigns.map(c=>(
 <div key={c.id} style={{background:"#fff",borderRadius:18,border:"1px solid #E8DED6",marginBottom:14,overflow:"hidden"}}>
 <div style={{background:pcTint,padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
 <div style={{flex:1,minWidth:0}}>
 <p className="serif" style={{fontSize:16,fontWeight:600,color:"#1C1C1C"}}>{c.name||c.goal}</p>
 <p style={{fontSize:10,color:"#7A716A",marginTop:2}}>{c.created_at?new Date(c.created_at).toLocaleDateString("he-IL"):""} · {(c.posts||[]).length} פוסטים</p>
 </div>
 <button onClick={()=>deleteCampaign(c.id)} className="primary-btn" style={{padding:"5px 12px",background:"#fff",color:"#C62828",border:"1px solid #F5D0D0",fontSize:10}}>מחקי</button>
 </div>
 <div style={{padding:"14px 18px"}}>
 {c.ai_strategy&&<p style={{fontSize:11.5,color:"#7A716A",lineHeight:1.6,marginBottom:12}}>{c.ai_strategy}</p>}
 {(c.posts||[]).map((p,i)=>(
 <div key={i} style={{borderTop:i>0?"1px solid #F7F0F3":"none",padding:"10px 0"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4,gap:6}}>
 {p.title&&<p style={{fontSize:13,fontWeight:600,color:"#1C1C1C"}}>{p.title}</p>}
 <button onClick={()=>copyPost({body:p.body,callToAction:p.call_to_action,hashtags:p.hashtags})} className="primary-btn" style={{padding:"4px 10px",background:pcGrad,color:"#fff",fontSize:9,flexShrink:0}}>העתיקי</button>
 </div>
 <p style={{fontSize:12,color:"#3A2A30",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{p.body}</p>
 {p.call_to_action&&<p style={{fontSize:11.5,color:pc,fontWeight:600,marginTop:4}}>{p.call_to_action}</p>}
 {p.hashtags&&p.hashtags.length>0&&<p style={{fontSize:10,color:"#7A716A",marginTop:4}}>{p.hashtags.join(" ")}</p>}
 </div>
 ))}
 </div>
 </div>
 ))}
 </>)}

 {aiPostsView==="reels"&&(<>
 <div style={{background:"#fff",borderRadius:20,padding:"22px 24px",border:"1px solid #E8DED6",marginBottom:18,position:"relative",overflow:"hidden"}}>
 
 <p style={{fontSize:11,color:"#7A716A",fontWeight:600,marginBottom:8}}>על מה הרילס?</p>
 <textarea value={reelTopic} onChange={e=>setReelTopic(e.target.value)} rows={3}
 placeholder="לדוגמה: טיפול פנים לכלות / 3 טיפים לעור זוהר / למה כדאי לעשות פילינג באביב"
 style={{width:"100%",border:"1px solid #E8DED6",borderRadius:14,padding:"12px 14px",fontSize:13,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint,resize:"none",marginBottom:12}}/>
 <button onClick={generateReel} disabled={reelLoading} className="primary-btn" style={{width:"100%",padding:"13px 0",background:pcGrad,color:"#fff",fontSize:14}}>
 {reelLoading?"יוצרת רילס... 🎬":"🎬 צרי לי רילס"}
 </button>
 </div>

 {reelError&&(
 <div style={{background:"#FFFAF7",border:"1px solid #FFDAC1",borderRadius:14,padding:"12px 16px",marginBottom:16}}>
 <p style={{fontSize:11.5,color:pc,fontWeight:600}}>{reelError}</p>
 </div>
 )}

 {reelLoading&&(
 <div style={{textAlign:"center",padding:"30px 0"}}>
 <p style={{fontSize:13,color:pc,fontWeight:500}}>ה-AI כותב לך תסריט, הוראות צילום והכל... רגע אחד 🎬</p>
 </div>
 )}

 {reelData&&!reelLoading&&(<div className="fade-in">
 <div style={{background:pcGrad,borderRadius:18,padding:"20px 22px",marginBottom:14,color:"#fff",textAlign:"center"}}>
 <p style={{fontSize:10,opacity:0.85,fontWeight:600,marginBottom:4}}>כותרת לכריכה</p>
 <p className="serif" style={{fontSize:24,fontWeight:700,marginBottom:8}}>{reelData.cover_title}</p>
 <p style={{fontSize:12,opacity:0.95}}>{reelData.hook}</p>
 </div>

 <button onClick={()=>{
   const lines=[];
   if(reelData.cover_title)lines.push("כותרת: "+reelData.cover_title);
   if(reelData.hook)lines.push("פתיחה: "+reelData.hook);
   lines.push("");
   (reelData.scenes||[]).forEach((sc,i)=>{
     lines.push("סצנה "+(sc.scene_number||i+1)+(sc.seconds?" ("+sc.seconds+" שניות)":""));
     if(sc.spoken)lines.push("🗣️ "+sc.spoken);
     if(sc.on_screen_text)lines.push("📱 "+sc.on_screen_text);
     if(sc.filming)lines.push("🎥 "+sc.filming);
     lines.push("");
   });
   if(reelData.call_to_action)lines.push("📣 "+reelData.call_to_action);
   if(reelData.caption)lines.push("","תיאור: "+reelData.caption);
   if(reelData.hashtags&&reelData.hashtags.length>0)lines.push(reelData.hashtags.join(" "));
   if(reelData.music_vibe)lines.push("","🎵 "+reelData.music_vibe);
   navigator.clipboard.writeText(lines.join("\n")).then(()=>toast("הרילס המלא הועתק")).catch(()=>toast("לא ניתן להעתיק","error"));
 }} className="primary-btn" style={{width:"100%",padding:"11px 0",background:"#fff",color:pc,border:`1.5px solid ${pc}`,fontSize:12.5,marginBottom:14}}>📋 העתיקי את כל הרילס</button>

 {reelData.scenes&&reelData.scenes.length>0&&reelData.scenes.map((sc,i)=>(
 <div key={i} style={{background:"#fff",borderRadius:16,border:"1px solid #E8DED6",padding:"16px 18px",marginBottom:10,position:"relative",overflow:"hidden"}}>
 <div style={{position:"absolute",top:0,right:0,width:4,bottom:0,background:pcGrad}}/>
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
 <span className="serif" style={{fontSize:20,fontWeight:700,color:pc}}>{sc.scene_number||i+1}</span>
 <span style={{fontSize:9,background:pcTint,color:pc,padding:"3px 10px",borderRadius:20,fontWeight:600}}>סצנה{sc.seconds?` · ${sc.seconds} שניות`:""}</span>
 </div>
 <p style={{fontSize:10,color:"#7A716A",fontWeight:600,marginBottom:2}}>🗣️ מה אומרים</p>
 <p style={{fontSize:13,color:"#3A2A30",lineHeight:1.6,marginBottom:8}}>{sc.spoken}</p>
 {sc.on_screen_text&&(<><p style={{fontSize:10,color:"#7A716A",fontWeight:600,marginBottom:2}}>📱 טקסט על המסך</p><p style={{fontSize:12,color:"#3A2A30",lineHeight:1.5,marginBottom:8}}>{sc.on_screen_text}</p></>)}
 {sc.filming&&(<><p style={{fontSize:10,color:"#7A716A",fontWeight:600,marginBottom:2}}>🎥 איך לצלם</p><p style={{fontSize:12,color:"#7A716A",lineHeight:1.5}}>{sc.filming}</p></>)}
 </div>
 ))}

 {reelData.call_to_action&&(<div style={{background:pcTint,borderRadius:14,padding:"14px 18px",marginBottom:10}}><p style={{fontSize:10,color:"#7A716A",fontWeight:600,marginBottom:3}}>📣 קריאה לפעולה (בסוף הרילס)</p><p style={{fontSize:13,color:pc,fontWeight:600}}>{reelData.call_to_action}</p></div>)}

 {reelData.caption&&(<div style={{background:"#fff",borderRadius:14,border:"1px solid #E8DED6",padding:"14px 18px",marginBottom:10}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}><p style={{fontSize:10,color:"#7A716A",fontWeight:600}}>✍️ תיאור לפוסט</p><button onClick={()=>{navigator.clipboard.writeText(`${reelData.caption}\n\n${(reelData.hashtags||[]).join(" ")}`);toast("התיאור הועתק");}} className="primary-btn" style={{padding:"4px 12px",background:pcGrad,color:"#fff",fontSize:9}}>העתיקי</button></div><p style={{fontSize:12.5,color:"#3A2A30",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{reelData.caption}</p>{reelData.hashtags&&reelData.hashtags.length>0&&<p style={{fontSize:11,color:"#7A716A",marginTop:8}}>{reelData.hashtags.join(" ")}</p>}</div>)}

 {reelData.music_vibe&&(<div style={{background:"#fff",borderRadius:14,border:"1px solid #E8DED6",padding:"12px 18px",marginBottom:10}}><p style={{fontSize:10,color:"#7A716A",fontWeight:600,marginBottom:2}}>🎵 סגנון מוזיקה מומלץ</p><p style={{fontSize:12.5,color:"#3A2A30"}}>{reelData.music_vibe}</p></div>)}
 </div>)}
 </>)}
 </>)}
 </div>
 </>)}

          {/* TAX REPORTS */}
          {activeTab==="tax"&&(()=>{
            const status = settings.business_tax_status || "exempt";
            const statusLabel = status==="exempt"?"עוסק פטור":status==="licensed"?"עוסק מורשה":"חברה בע\"מ";
            const years = Array.from({length:4},(_,i)=>(new Date().getFullYear())-i);
            const inYear = receipts.filter(r=>r.created_at && new Date(r.created_at).getFullYear()===taxYear);
            let periodReceipts, rangeLabel;
            if(status==="exempt"){
              periodReceipts=inYear; rangeLabel=`שנת ${taxYear}`;
            } else if(taxPeriodMode==="monthly"){
              periodReceipts=inYear.filter(r=>new Date(r.created_at).getMonth()===taxPeriodIdx);
              rangeLabel=`${MONTHS_HE[taxPeriodIdx]} ${taxYear}`;
            } else {
              periodReceipts=inYear.filter(r=>Math.floor(new Date(r.created_at).getMonth()/2)===taxPeriodIdx);
              rangeLabel=`${MONTHS_HE[taxPeriodIdx*2]}–${MONTHS_HE[taxPeriodIdx*2+1]} ${taxYear}`;
            }
            const gross=periodReceipts.reduce((s,r)=>s+(Number(r.amount)||0),0);
            const net=gross/(1+VAT_RATE);
            const vatDue=gross*VAT_RATE/(1+VAT_RATE);
            const count=periodReceipts.length;
            // Expenses filtered to the SAME period (by expense_date) — used for the
            // list below and for input VAT (step C). expense_date is "YYYY-MM-DD".
            const exYear=(e)=>Number((e.expense_date||"").slice(0,4));
            const exMonth=(e)=>Number((e.expense_date||"").slice(5,7))-1;
            const periodExpenses = status==="exempt" ? []
              : taxPeriodMode==="monthly"
                ? expenses.filter(e=>exYear(e)===taxYear && exMonth(e)===taxPeriodIdx)
                : expenses.filter(e=>exYear(e)===taxYear && Math.floor(exMonth(e)/2)===taxPeriodIdx);
            const expensesTotal = periodExpenses.reduce((s,e)=>s+(Number(e.amount)||0),0);
            // Input VAT extracted from expenses (same formula as output VAT).
            const inputVat = expensesTotal*VAT_RATE/(1+VAT_RATE);
            const finalVat = vatDue - inputVat;      // output VAT minus input VAT
            const isRefund = finalVat < 0;           // negative => refund from the authority
            const nis=(x)=>`₪${Math.round(x).toLocaleString()}`;
            const Stat=({label,value,big,gold})=>(
 <div style={{flex:1,minWidth:120,background:gold?pcTint:"#FBF8F4",border:`1px solid ${gold?pc:"#E8DED6"}`,borderRadius:14,padding:"16px 14px",textAlign:"center"}}>
 <p style={{fontSize:10,color:"#7A716A",marginBottom:7,letterSpacing:"0.4px"}}>{label}</p>
 <p className="serif" style={{fontSize:big?30:22,fontWeight:600,color:gold?pc:"#1C1C1C",lineHeight:1}}>{value}</p>
 </div>
            );
            return (
 <div style={{maxWidth:720,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:6,justifyContent:"center"}}>
 <span style={{width:38,height:1,background:`linear-gradient(90deg,transparent,${pc})`}}/>
 <h2 className="serif" style={{fontSize:24,fontWeight:600,color:"#1C1C1C"}}>דוחות מס</h2>
 <span style={{width:38,height:1,background:`linear-gradient(90deg,${pc},transparent)`}}/>
 </div>
 <p style={{textAlign:"center",fontSize:11.5,color:"#7A716A",marginBottom:16}}>סטטוס העסק: <b style={{color:pc}}>{statusLabel}</b> · ניתן לשנות בהגדרות</p>

                {/* CONTROLS */}
 <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center",marginBottom:14}}>
 <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {years.map(y=>(
 <button key={y} onClick={()=>setTaxYear(y)} style={{padding:"7px 14px",borderRadius:20,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:taxYear===y?`2px solid ${pc}`:"1px solid #E8DED6",background:taxYear===y?pcTint:"#fff",color:taxYear===y?pc:"#7A716A"}}>{y}</button>
                    ))}
 </div>
 </div>
                {status!=="exempt"&&(
 <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center",alignItems:"center",marginBottom:16}}>
 <div style={{display:"flex",gap:5,background:"#FBF8F4",border:"1px solid #E8DED6",borderRadius:20,padding:3}}>
 <button onClick={()=>{setTaxPeriodMode("bimonthly");setTaxPeriodIdx(Math.floor(new Date().getMonth()/2));}} style={{padding:"6px 12px",borderRadius:18,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:"none",background:taxPeriodMode==="bimonthly"?pcGrad:"transparent",color:taxPeriodMode==="bimonthly"?"#fff":"#7A716A"}}>דו-חודשי</button>
 <button onClick={()=>{setTaxPeriodMode("monthly");setTaxPeriodIdx(new Date().getMonth());}} style={{padding:"6px 12px",borderRadius:18,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:"none",background:taxPeriodMode==="monthly"?pcGrad:"transparent",color:taxPeriodMode==="monthly"?"#fff":"#7A716A"}}>חודשי</button>
 </div>
 <select value={taxPeriodIdx} onChange={e=>setTaxPeriodIdx(Number(e.target.value))} style={{border:"1px solid #E8DED6",borderRadius:20,padding:"7px 12px",fontSize:11.5,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#fff",color:"#1C1C1C"}}>
                      {taxPeriodMode==="monthly"
                        ? MONTHS_HE.map((m,i)=><option key={i} value={i}>{m}</option>)
                        : Array.from({length:6},(_,i)=><option key={i} value={i}>{MONTHS_HE[i*2]}–{MONTHS_HE[i*2+1]}</option>)}
 </select>
 </div>
                )}

                {/* PRINT / PDF */}
 <div style={{display:"flex",justifyContent:"center",marginBottom:14}}>
 <button onClick={()=>window.print()} className="primary-btn" style={{background:pcGrad,color:"#fff",padding:"10px 22px",fontSize:12.5,display:"inline-flex",alignItems:"center",gap:8}}>
 <svg viewBox="0 0 24 24" width="16" height="16" style={{fill:"none",stroke:"currentColor",strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round"}}><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/></svg>
                    הורד PDF / הדפס
 </button>
 </div>

                {/* REPORT CARD */}
 <div id="tax-report" style={{background:"#fff",borderRadius:20,border:"1px solid #E8DED6",boxShadow:"0 6px 22px rgba(28,28,28,0.05)",padding:"26px 24px"}}>
 <div style={{textAlign:"center",marginBottom:18}}>
 <p className="serif" style={{fontSize:19,fontWeight:600,color:"#1C1C1C"}}>{settings.business_name||"העסק"} — {statusLabel}</p>
 <p style={{fontSize:12,color:"#7A716A",marginTop:3}}>תקופת הדיווח: {rangeLabel}</p>
 </div>
                  {status==="exempt"?(
 <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                      <Stat label={"מחזור שנתי (ללא מע\"מ)"} value={nis(gross)} big gold/>
 <Stat label="מספר עסקאות" value={count}/>
 </div>
                  ):(
 <>
 <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:12}}>
 <Stat label={"מחזור ברוטו (כולל מע\"מ)"} value={nis(gross)}/>
 <Stat label={"מחזור נטו (לפני מע\"מ)"} value={nis(net)}/>
 <Stat label="מספר עסקאות" value={count}/>
 </div>
 <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                        <Stat label={`מס עסקאות (מע\"מ ${Math.round(VAT_RATE*100)}%)`} value={nis(vatDue)}/>
 <Stat label="מס תשומות (על הוצאות)" value={nis(inputVat)}/>
 <Stat label={isRefund?"החזר מע\"מ":"מע\"מ סופי לתשלום"} value={nis(Math.abs(finalVat))} big gold/>
 </div>
 <p style={{fontSize:10.5,color:"#A89AA2",marginTop:14,lineHeight:1.6,textAlign:"center"}}>{`מע"מ סופי = מס עסקאות (מהמכירות) פחות מס תשומות (חילוץ ה-${Math.round(VAT_RATE*100)}% מסך ההוצאות שנרשמו לתקופה). ${isRefund?"התוצאה שלילית — כלומר מגיע לך החזר מע\"מ מהרשויות.":"זהו הסכום לתשלום לרשויות בגין התקופה."}`}</p>
 </>
                  )}

                  {/* LEGAL DISCLAIMER */}
 <div style={{marginTop:20,padding:"12px 14px",background:"#FBF3E2",border:"1px solid #EAD9B0",borderRadius:12}}>
 <p style={{fontSize:10.5,color:"#8A6D2F",lineHeight:1.6,textAlign:"center"}}>⚠️ {TAX_DISCLAIMER}</p>
 </div>
 </div>

                {/* EXPENSES (licensed/company only) — outside #tax-report so it stays out of the PDF */}
                {status!=="exempt"&&(
 <div style={{marginTop:22}}>
 <h3 className="serif" style={{fontSize:18,fontWeight:600,color:"#1C1C1C",marginBottom:4}}>הוצאות העסק — {rangeLabel}</h3>
 <p style={{fontSize:10.5,color:"#7A716A",marginBottom:12}}>הוצאות (כולל מע"מ) משמשות לחישוב מס התשומות. ההוצאות מסוננות לתקופת הדוח שנבחרה למעלה.</p>

                    {/* ADD FORM */}
 <div style={{background:"#fff",borderRadius:16,border:"1px solid #E8DED6",boxShadow:"0 4px 18px rgba(28,28,28,0.04)",padding:"14px 16px",marginBottom:12}}>
 <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
 <div style={{flex:"1 1 110px"}}><p style={{fontSize:9,color:"#7A716A",marginBottom:3}}>סכום (כולל מע"מ)</p><input type="number" value={newExpense.amount} onChange={e=>setNewExpense({...newExpense,amount:e.target.value})} placeholder="0" style={{width:"100%",border:"1px solid #E8DED6",borderRadius:10,padding:"8px 10px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"ltr",textAlign:"right",background:pcTint}}/></div>
 <div style={{flex:"1 1 130px"}}><p style={{fontSize:9,color:"#7A716A",marginBottom:3}}>תאריך</p><input type="date" value={newExpense.expense_date} onChange={e=>setNewExpense({...newExpense,expense_date:e.target.value})} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:10,padding:"8px 10px",fontSize:12,fontFamily:"inherit",outline:"none",background:pcTint}}/></div>
 <div style={{flex:"2 1 160px"}}><p style={{fontSize:9,color:"#7A716A",marginBottom:3}}>תיאור</p><input value={newExpense.description} onChange={e=>setNewExpense({...newExpense,description:e.target.value})} placeholder="למשל: חומרים מספק" style={{width:"100%",border:"1px solid #E8DED6",borderRadius:10,padding:"8px 10px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}/></div>
 </div>
 <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
 <span style={{fontSize:9,color:"#7A716A"}}>קטגוריה:</span>
                        {EXPENSE_CATEGORIES.map(cat=>{
                          const sel=newExpense.category===cat.k;
                          return <button key={cat.k} onClick={()=>setNewExpense({...newExpense,category:cat.k})} style={{padding:"5px 11px",borderRadius:16,fontSize:10.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:sel?`2px solid ${pc}`:"1px solid #E8DED6",background:sel?pcTint:"#fff",color:sel?pc:"#7A716A"}}>{cat.l}</button>;
                        })}
 <button onClick={handleAddExpense} disabled={isBusy("addExpense")} className="primary-btn" style={{marginRight:"auto",background:pcGrad,color:"#fff",padding:"8px 18px",fontSize:12}}>{isBusy("addExpense")?"מוסיף...":"✦ הוסף הוצאה"}</button>
 </div>
 </div>

                    {/* LIST */}
                    {periodExpenses.length===0?(
 <p style={{fontSize:11,color:"#B8AFA0",textAlign:"center",padding:"14px 0"}}>אין הוצאות בתקופה זו</p>
                    ):(<>
                      {[...periodExpenses].sort((a,b)=>String(b.expense_date||"").localeCompare(String(a.expense_date||""))).map(exp=>{
                        const catL=EXPENSE_CATEGORIES.find(c=>c.k===exp.category)?.l||"אחר";
                        return (
 <div key={exp.id} style={{display:"flex",alignItems:"center",gap:10,background:"#fff",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",marginBottom:6}}>
 <span style={{fontSize:10,color:"#7A716A",width:74,flexShrink:0}}>{exp.expense_date}</span>
 <span style={{fontSize:8,background:pcTint,color:pc,padding:"2px 8px",borderRadius:20,fontWeight:600,flexShrink:0}}>{catL}</span>
 <span style={{flex:1,minWidth:0,fontSize:11.5,color:"#1C1C1C",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{exp.description||"—"}</span>
 <span className="serif" style={{fontSize:14,fontWeight:600,color:"#1C1C1C",flexShrink:0}}>{nis(Number(exp.amount)||0)}</span>
 <button onClick={()=>handleDeleteExpense(exp)} aria-label="מחיקת הוצאה" style={{background:"none",border:"none",color:"#C0857F",fontSize:13,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>✕</button>
 </div>
                        );
                      })}
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",marginTop:4,background:pcTint,borderRadius:12}}>
 <span style={{fontSize:11.5,fontWeight:600,color:"#7A716A"}}>סך הוצאות בתקופה ({periodExpenses.length})</span>
 <span className="serif" style={{fontSize:18,fontWeight:600,color:pc}}>{nis(expensesTotal)}</span>
 </div>
                    </>)}
 </div>
                )}
 </div>
            );
          })()}

          {/* AI BUSINESS ADVISOR */}
          {activeTab==="advisor"&&(
 <div style={{maxWidth:840,marginLeft:"auto",marginRight:"auto",display:"flex",flexDirection:"column",height:"100%"}}>
 <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:6}}>
 <span style={{width:38,height:1,background:`linear-gradient(90deg,transparent,${pc})`}}/>
 <h2 className="serif" style={{fontSize:24,fontWeight:600,color:"#1C1C1C"}}>יועץ עסקי AI</h2>
 <span style={{width:38,height:1,background:`linear-gradient(90deg,${pc},transparent)`}}/>
 </div>
 <p style={{textAlign:"center",fontSize:11.5,color:"#7A716A",marginBottom:16}}>יועצת אישית שמכירה את הנתונים של {settings.business_name||"העסק שלך"} — שאלי כל שאלה עסקית</p>

 <div id="advisor-scroll" style={{flex:1,overflowY:"auto",background:"#fff",borderRadius:20,border:"1px solid #E8DED6",boxShadow:"0 6px 22px rgba(28,28,28,0.05)",padding:"18px 18px",display:"flex",flexDirection:"column",gap:12,minHeight:300}}>
              {advisorMessages===null?(
 <p style={{textAlign:"center",color:"#B8AFA0",fontSize:11.5,margin:"auto"}}>טוען…</p>
              ):advisorMessages.length===0?(
 <div className="pop-in" style={{margin:"auto",textAlign:"center",padding:"20px",maxWidth:460}}>
 <div style={{fontSize:34,marginBottom:10}}>✦</div>
 <p style={{fontSize:15,fontWeight:600,color:"#1C1C1C",marginBottom:6}}>איך אפשר לעזור לעסק שלך היום?</p>
 <p style={{fontSize:11.5,color:"#7A716A",lineHeight:1.6,marginBottom:16}}>היועצת רואה את הנתונים האמיתיים שלך — לקוחות, הכנסות, שירותים ולידים — ונותנת פתרונות ותוכניות עבודה. נסי אחת מהשאלות:</p>
 <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center"}}>
                    {["איך אחזיר לקוחות רדומות?","איך אעלה את ההכנסות החודש?","מה כדאי לתמחר מחדש?","רעיון לקמפיין לחודש חלש"].map(q=>(
 <button key={q} className="empty-cta" onClick={()=>setAdvisorInput(q)} style={{background:pcTint,color:pc,border:"1px solid #E8DED6",borderRadius:20,padding:"8px 14px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{q}</button>
                    ))}
 </div>
 </div>
              ):advisorMessages.map(m=>(
 <div key={m.id} style={{alignSelf:m.role==="user"?"flex-start":"flex-end",maxWidth:"82%",background:m.role==="user"?pcGrad:"#FBF8F4",color:m.role==="user"?"#fff":"#1C1C1C",border:m.role==="user"?"none":"1px solid #E8DED6",borderRadius:m.role==="user"?"16px 16px 16px 4px":"16px 16px 4px 16px",padding:"11px 14px",fontSize:12.5,lineHeight:1.65,whiteSpace:"pre-wrap"}}>
                    {m.content}
 </div>
              ))}
              {advisorSending&&(
 <div style={{alignSelf:"flex-end",background:"#FBF8F4",border:"1px solid #E8DED6",borderRadius:"16px 16px 4px 16px",padding:"11px 16px",fontSize:12,color:"#7A716A"}}>היועצת חושבת…</div>
              )}
 </div>

 <div style={{display:"flex",gap:8,alignItems:"flex-end",marginTop:12}}>
 <textarea value={advisorInput} onChange={e=>setAdvisorInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendAdvisor();}}} placeholder="כתבי שאלה עסקית… (Enter לשליחה)" rows={1} style={{flex:1,border:"1px solid #E8DED6",borderRadius:16,padding:"12px 14px",fontSize:12.5,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#fff",resize:"none",maxHeight:120}}/>
 <button onClick={sendAdvisor} disabled={advisorSending||!advisorInput.trim()} className="primary-btn" style={{background:pcGrad,color:"#fff",padding:"12px 20px",fontSize:12.5}}>{advisorSending?"…":"שליחה"}</button>
 </div>
 </div>
          )}

          {/* COMMUNITY */}
          {activeTab==="community"&&(<>
 <div style={{maxWidth:760,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,flexWrap:"wrap",gap:8}}>
 <div>
 <h2 className="serif" style={{fontSize:21,fontWeight:600,color:"#1C1C1C"}}>מרחב הלקוחות</h2>
 <p style={{fontSize:11.5,color:"#7A716A",marginTop:2}}>פרסמי עדכונים, מבצעים וטיפים — הלקוחות שלך רואות הכל במקום אחד.</p>
 </div>
 <div style={{display:"flex",gap:7}}>
 <button onClick={()=>copyPublicLink("community")} style={{padding:"9px 14px",background:"#fff",color:pc,border:"1px solid #E8DED6",borderRadius:11,fontSize:11.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>העתקת קישור לקהילה</button>
 <button onClick={()=>{setNewPost({title:"",body:"",post_type:"update",cta_label:"",image_url:""});setShowPostModal(true);}} className="primary-btn" style={{padding:"9px 16px",background:pcGrad,color:"#fff",fontSize:11.5}}>+ פוסט חדש</button>
 </div>
 </div>

 {communityLoading?(
 <div style={{display:"flex",flexDirection:"column",gap:13,marginTop:14}}>
 {[0,1].map(i=><div key={i} style={{background:"#fff",borderRadius:16,overflow:"hidden",border:"1px solid #E8DED6"}}><div className="skel" style={{width:"100%",height:150,borderRadius:0}}/><div style={{padding:"14px 16px"}}><div className="skel" style={{width:90,height:14,marginBottom:9}}/><div className="skel" style={{width:"60%",height:16,marginBottom:7}}/><div className="skel" style={{width:"100%",height:12,marginBottom:5}}/><div className="skel" style={{width:"80%",height:12}}/></div></div>)}
 </div>
 )
 :communityPosts.length===0?(
 <div style={{textAlign:"center",padding:"48px 20px",background:"rgba(255,255,255,0.6)",borderRadius:18,marginTop:14}}>
 <div style={{fontSize:34,marginBottom:10}}>💜</div>
 <p style={{fontSize:14,fontWeight:600,color:"#1C1C1C",marginBottom:5}}>עוד אין פוסטים</p>
 <p style={{fontSize:11.5,color:"#7A716A",maxWidth:360,margin:"0 auto"}}>פרסמי את הפוסט הראשון — מבצע, טיפ, או עדכון — והלקוחות שלך יראו אותו במרחב הלקוחות.</p>
 </div>
 ):(
 <div style={{display:"flex",flexDirection:"column",gap:13,marginTop:14}}>
 {communityPosts.map(p=>(
 <div key={p.id} style={{background:"#fff",borderRadius:16,overflow:"hidden",border:"1px solid #E8DED6"}}>
 {p.image_url&&<img alt="" src={p.image_url} style={{width:"100%",maxHeight:280,objectFit:"cover",objectPosition:"center",display:"block"}}/>}
 <div style={{padding:"14px 16px"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
 <span style={{fontSize:9.5,fontWeight:700,color:"#fff",background:p.post_type==="offer"?pc:p.post_type==="tip"?"#7BA88E":"#A89BB0",padding:"3px 9px",borderRadius:20}}>{p.post_type==="offer"?"מבצע":p.post_type==="tip"?"טיפ":"עדכון"}</span>
 <span style={{fontSize:9,color:"#B8AFA0"}}>{new Date(p.created_at).toLocaleDateString("he-IL")}</span>
 </div>
 {p.title&&<p style={{fontSize:14.5,fontWeight:700,color:"#1C1C1C",marginBottom:4}}>{p.title}</p>}
 {p.body&&<p style={{fontSize:12.5,color:"#4A3A42",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{p.body}</p>}
 {p.cta_label&&<div style={{marginTop:10}}><span style={{display:"inline-block",padding:"7px 16px",background:pcGrad,color:"#fff",fontSize:11,fontWeight:600,borderRadius:20}}>{p.cta_label}</span></div>}
 <div style={{display:"flex",justifyContent:"flex-start",marginTop:10}}>
 <button onClick={()=>deleteCommunityPost(p.id)} style={{background:"none",border:"none",color:"#B8AFA0",fontSize:10.5,cursor:"pointer",fontFamily:"inherit"}}>מחיקה</button>
 </div>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 </>)}

          {/* PROTOCOLS */}
          {activeTab==="protocols"&&(<>
            <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:7}}>
                <div>
                  <h2 className="serif" style={{fontSize:22,fontWeight:600,color:"#1C1C1C"}}>פרוטוקולי טיפול</h2>
                  <p style={{fontSize:11.5,color:"#7A716A",marginTop:2}}>ספריית הטיפולים שלך לפי מותג ובעיה.</p>
                </div>
                <button onClick={()=>{setNewProtocol(emptyProtocol);setShowProtocolModal(true);}} className="primary-btn" style={{padding:"9px 16px",background:pcGrad,color:"#fff",fontSize:12}}>+ פרוטוקול חדש</button>
              </div>
              {protocolsLoading?(
                <div style={{display:"flex",flexDirection:"column",gap:10}}>{[0,1,2].map(i=><div key={i} className="skel" style={{width:"100%",height:74,borderRadius:14}}/>)}</div>
              ):protocols.length===0?(
                <div style={{textAlign:"center",padding:"48px 20px",background:"rgba(255,255,255,0.6)",borderRadius:18}}>
                  <div style={{fontSize:34,marginBottom:10}}>📋</div>
                  <p style={{fontSize:14,fontWeight:600,color:"#1C1C1C",marginBottom:5}}>עוד אין פרוטוקולים</p>
                  <p style={{fontSize:11.5,color:"#7A716A"}}>צרי פרוטוקול ראשון כדי לבנות את ספריית הטיפולים שלך.</p>
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {protocols.map(pr=>(
                    <div key={pr.id} style={{background:"#fff",borderRadius:14,padding:"13px 15px",border:"1px solid #E8DED6"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
                        <div>
                          <span style={{fontSize:9.5,fontWeight:700,color:pc,background:pcTint,padding:"3px 9px",borderRadius:20}}>{pr.brand}</span>
                          <h3 style={{fontSize:14,fontWeight:700,color:"#1C1C1C",marginTop:6}}>{pr.name}</h3>
                          {pr.concern&&<p style={{fontSize:11,color:"#7A716A",marginTop:2}}>{pr.concern}</p>}
                        </div>
                        <div style={{textAlign:"left",fontSize:10,color:"#7A716A"}}>
                          {pr.sessions_count?<div>{pr.sessions_count} מפגשים</div>:null}
                          {pr.price?<div style={{fontWeight:700,color:"#1C1C1C"}}>₪{pr.price}</div>:null}
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
 <h2 className="serif" style={{fontSize:22,fontWeight:600,color:"#1C1C1C"}}>מנויי טיפולים</h2>
 <div style={{display:"flex",gap:6}}>
 <button onClick={()=>setShowPackageModal(true)} style={{background:pcGrad,color:"#fff",border:"none",borderRadius:24,padding:"9px 16px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:`0 6px 16px ${pcShadow}`}}>+ חבילה חדשה</button>
 <button onClick={()=>setShowWaitlistModal(true)} style={{background:"#fff",color:pc,border:"1px solid #E8DED6",borderRadius:24,padding:"9px 16px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>רשימת המתנה</button>
 </div>
 </div>

 <div style={{background:"#fff",borderRadius:18,padding:16,border:"1px solid #E8DED6",marginBottom:14}}>
 <h3 className="serif" style={{fontSize:16,fontWeight:600,color:"#1C1C1C",marginBottom:12}}>חבילות פעילות ({packages.filter(p=>p.active).length})</h3>
              {packages.filter(p=>p.active).length===0?<p style={{color:"#B8AFA0",fontSize:11}}>אין חבילות פעילות</p>
                :packages.filter(p=>p.active).map(pkg=>(
 <div key={pkg.id} style={{background:pcTint,borderRadius:14,padding:"12px 14px",marginBottom:8,border:"1px solid #E8DED6"}}>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:7,flexWrap:"wrap",gap:5}}>
 <div>
 <p style={{fontSize:12,fontWeight:700,color:"#1C1C1C"}}>{pkg.client_name}</p>
 <p style={{fontSize:10,color:"#7A716A"}}>{pkg.service} · ₪{pkg.price}</p>
 </div>
 <button onClick={()=>handleUsePackageSession(pkg)} style={{background:pcGrad,color:"#fff",border:"none",borderRadius:20,padding:"5px 11px",fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
                        ✓ השתמשי
 </button>
 </div>
 <div style={{display:"flex",gap:3,marginBottom:4}}>
                      {Array.from({length:Number(pkg.total_sessions)},(_,i)=>(
 <div key={i} style={{flex:1,height:8,borderRadius:4,background:i<Number(pkg.used_sessions)?pcGrad:"#F0E7EC"}}/>
                      ))}
 </div>
 <p style={{fontSize:9,color:"#7A716A"}}>{pkg.used_sessions}/{pkg.total_sessions} טיפולים · נותרו {Number(pkg.total_sessions)-Number(pkg.used_sessions)}</p>
 </div>
                ))}
 </div>

 <div style={{background:"#fff",borderRadius:18,padding:16,border:"1px solid #E8DED6"}}>
 <h3 className="serif" style={{fontSize:16,fontWeight:600,color:"#1C1C1C",marginBottom:12}}>רשימת המתנה ({waitlist.filter(w=>w.status==="waiting").length})</h3>
              {waitlist.filter(w=>w.status==="waiting").length===0?<p style={{color:"#B8AFA0",fontSize:11}}>אין ממתינות</p>
                :waitlist.filter(w=>w.status==="waiting").map(w=>(
 <div key={w.id} style={{background:pcTint,borderRadius:14,padding:"10px 14px",marginBottom:6,border:`1px solid #E8DED6`,display:"flex",alignItems:"center",gap:8}}>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:11,fontWeight:600,color:"#1C1C1C"}}>{w.client_name}</p>
 <p style={{fontSize:9,color:"#7A716A"}}>{w.service}{w.preferred_date&&` · ${w.preferred_date}`}</p>
 </div>
                    {w.phone&&<a href={waLink(w.phone)} target="_blank" rel="noreferrer" className="wa-btn" style={{padding:"4px 8px",fontSize:9}}></a>}
 </div>
                ))}
 </div>
 </div>
 </>)}
 </div>
 </main>
 </div>

      {/* APPT MODAL */}
      {showModal&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:14}} onClick={()=>setShowModal(false)}>
 <div onClick={e=>e.stopPropagation()} className="modal-card" style={{background:"#fff",borderRadius:22,padding:24,width:360,maxWidth:"100%",maxHeight:"90vh",overflowY:"auto"}}>
 <h3 className="serif" style={{fontSize:20,fontWeight:600,color:"#1C1C1C",marginBottom:14}}>קביעת תור חדש</h3>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {clients.length>0&&<select value={newAppt.clientId} onChange={e=>handleClientSelect(e.target.value)} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}><option value="">— בחרי לקוחה קיימת —</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}{c.phone?` · ${c.phone}`:""}</option>)}</select>}
 <input value={newAppt.name} onChange={e=>setNewAppt({...newAppt,name:e.target.value,clientId:""})} placeholder="או הזיני שם מטופלת חדשה" style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}/>
 <div style={{display:"flex",gap:6}}>
 <div style={{flex:1}}><p style={{fontSize:9,color:"#7A716A",marginBottom:3}}>תאריך</p><input type="date" value={newAppt.date} onChange={e=>setNewAppt({...newAppt,date:e.target.value})} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none",background:pcTint}}/></div>
 <div style={{flex:1}}><p style={{fontSize:9,color:"#7A716A",marginBottom:3}}>שעה</p><select value={newAppt.hour} onChange={e=>setNewAppt({...newAppt,hour:Number(e.target.value)})} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}>{workingHours.map((h,i)=><option key={h} value={settings.working_hours_start+i}>{h}</option>)}</select></div>
 </div>
 <select value={newAppt.service} onChange={e=>handleServiceSelect(e.target.value)} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}>
 <option value="">— בחרי שירות —</option>{activeServices.map(s=><option key={s.name} value={s.name}>{s.name} — ₪{s.price} ({s.duration}′)</option>)}
 </select>
 <div style={{display:"flex",gap:4}}>{[30,45,60,90].map(d=><button key={d} onClick={()=>setNewAppt({...newAppt,duration:d})} style={{flex:1,padding:"7px 0",border:"1px solid",borderColor:newAppt.duration===d?pc:"#E8DED6",borderRadius:12,background:newAppt.duration===d?pcGrad:pcTint,color:newAppt.duration===d?"#fff":"#7A716A",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{d}′</button>)}</div>
 <input type="number" value={newAppt.price||""} onChange={e=>setNewAppt({...newAppt,price:e.target.value})} placeholder="₪ מחיר" style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",background:pcTint,textAlign:"right"}}/>
 <textarea value={apptNote} onChange={e=>setApptNote(e.target.value)} placeholder="הערה" rows={2} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint,resize:"none"}}/>
 </div>
 <div style={{display:"flex",gap:6,marginTop:16}}>
 <button onClick={()=>setShowModal(false)} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid #E8DED6",background:"#fff",fontSize:12,color:"#7A716A"}}>ביטול</button>
 <button onClick={handleSave} disabled={isBusy("saveAppt")} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"#fff",fontSize:12}}>{isBusy("saveAppt")?"שומר...":"שמירה ✓"}</button>
 </div>
 </div>
 </div>
      )}

      {/* IMPORT CONTACTS MODAL */}
      {showImportModal&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:14}} onClick={()=>setShowImportModal(false)}>
 <div onClick={e=>e.stopPropagation()} className="modal-card" style={{background:"#fff",borderRadius:22,padding:24,width:420,maxWidth:"100%",maxHeight:"90vh",overflowY:"auto"}}>
 <p className="serif" style={{fontSize:18,fontWeight:600,color:"#1C1C1C",marginBottom:6}}>ייבוא לקוחות</p>
 <p style={{fontSize:11.5,color:"#7A716A",marginBottom:14,lineHeight:1.6}}>הוסיפי כמה לקוחות בבת אחת. כתבי כל לקוחה בשורה נפרדת, בפורמט: שם, טלפון</p>

 <button onClick={pickFromContacts} style={{width:"100%",padding:"11px 0",background:"#fff",color:pc,border:"1px dashed #E8DED6",borderRadius:12,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginBottom:6}}>📇 בחירה מאנשי הקשר בטלפון</button>
 <p style={{fontSize:9,color:"#B8AFA0",marginBottom:14,textAlign:"center"}}>(עובד בעיקר בטלפונים אנדרואיד. באייפון/מחשב — השתמשי בהדבקה למטה)</p>

 <p style={{fontSize:10,color:"#7A716A",marginBottom:5}}>או הדביקי כאן (שורה לכל לקוחה):</p>
 <textarea value={importText} onChange={e=>setImportText(e.target.value)} rows={7} placeholder={"דנה כהן, 0541234567\nמיכל לוי, 0529876543"} style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1px solid #E8D5DD",fontSize:12.5,fontFamily:"inherit",marginBottom:8,boxSizing:"border-box",resize:"vertical",direction:"rtl"}}/>

 {importText.trim()&&<p style={{fontSize:10.5,color:"#7BA88E",marginBottom:12}}>זוהו {parseImportText(importText).length} לקוחות</p>}

 <div style={{display:"flex",gap:8}}>
 <button onClick={importContacts} disabled={importing} className="primary-btn" style={{flex:2,padding:"12px 0",background:pcGrad,color:"#fff",fontSize:13,opacity:importing?0.6:1}}>{importing?"מוסיף...":"הוספת הלקוחות"}</button>
 <button onClick={()=>setShowImportModal(false)} style={{flex:1,padding:"12px 0",background:"#fff",color:"#7A716A",border:"1px solid #E8D5DD",borderRadius:12,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>ביטול</button>
 </div>
 </div>
 </div>
      )}

      {/* CLIENT MODAL */}
      {showClientModal&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:14}} onClick={()=>setShowClientModal(false)}>
 <div onClick={e=>e.stopPropagation()} className="modal-card" style={{background:"#fff",borderRadius:22,padding:24,width:380,maxWidth:"100%",maxHeight:"90vh",overflowY:"auto"}}>
 <h3 className="serif" style={{fontSize:20,fontWeight:600,color:"#1C1C1C",marginBottom:14}}>{editingClient?"עריכת מטופלת":"מטופלת חדשה"}</h3>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
 <input value={newClient.name} onChange={e=>setNewClient({...newClient,name:e.target.value})} placeholder="שם מלא *" style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}/>
 <input value={newClient.phone} onChange={e=>setNewClient({...newClient,phone:e.target.value})} placeholder="טלפון" style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}/>
 <input type="date" value={newClient.birthday} onChange={e=>setNewClient({...newClient,birthday:e.target.value})} placeholder="תאריך לידה" style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",background:pcTint}}/>
 <select value={newClient.skinType} onChange={e=>setNewClient({...newClient,skinType:e.target.value})} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}><option value="">סוג עור</option>{SKIN_TYPES.map(t=><option key={t}>{t}</option>)}</select>
 <textarea value={newClient.allergies} onChange={e=>setNewClient({...newClient,allergies:e.target.value})} placeholder="אלרגיות" rows={2} style={{width:"100%",border:"1px solid #FFDAC1",borderRadius:12,padding:"9px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FFFAF7",resize:"none"}}/>
 <textarea value={newClient.medical} onChange={e=>setNewClient({...newClient,medical:e.target.value})} placeholder="מצבים רפואיים" rows={2} style={{width:"100%",border:"1px solid #A7C4F4",borderRadius:12,padding:"9px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#F7FAFF",resize:"none"}}/>
 <textarea value={newClient.notes} onChange={e=>setNewClient({...newClient,notes:e.target.value})} placeholder="הערות" rows={2} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint,resize:"none"}}/>
 <div><p style={{fontSize:9,color:"#7A716A",marginBottom:4}}>סטטוס</p><div style={{display:"flex",gap:4}}>{Object.entries(STATUS_LABELS).map(([key,label])=><button key={key} onClick={()=>setNewClient({...newClient,status:key})} style={{flex:1,padding:"7px 2px",border:"1px solid",borderColor:newClient.status===key?pc:"#E8DED6",borderRadius:12,background:newClient.status===key?STATUS_COLORS[key]:pcTint,color:newClient.status===key?"#fff":"#7A716A",fontSize:9,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{label}</button>)}</div></div>
 </div>
 <div style={{display:"flex",gap:6,marginTop:16}}>
 <button onClick={()=>setShowClientModal(false)} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid #E8DED6",background:"#fff",fontSize:12,color:"#7A716A"}}>ביטול</button>
 <button onClick={handleSaveClient} disabled={isBusy("saveClient")} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"#fff",fontSize:12}}>{isBusy("saveClient")?"שומר...":"שמירה ✓"}</button>
 </div>
 </div>
 </div>
      )}

      {/* LEAD MODAL */}
      {showLeadModal&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:14}} onClick={()=>setShowLeadModal(false)}>
 <div onClick={e=>e.stopPropagation()} className="modal-card" style={{background:"#fff",borderRadius:22,padding:24,width:370,maxWidth:"100%",maxHeight:"90vh",overflowY:"auto"}}>
 <h3 className="serif" style={{fontSize:20,fontWeight:600,color:"#1C1C1C",marginBottom:14}}>{editingLead?"עריכת פנייה":"פנייה חדשה"}</h3>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
 <input value={newLead.name} onChange={e=>setNewLead({...newLead,name:e.target.value})} placeholder="שם *" style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}/>
 <input value={newLead.phone} onChange={e=>setNewLead({...newLead,phone:e.target.value})} placeholder="טלפון" style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}/>
 <div><p style={{fontSize:9,color:"#7A716A",marginBottom:3}}>מקור</p><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{LEAD_SOURCES.map(s=><button key={s} onClick={()=>setNewLead({...newLead,source:s})} style={{padding:"6px 9px",border:"1px solid",borderColor:newLead.source===s?pc:"#E8DED6",borderRadius:20,background:newLead.source===s?pcGrad:pcTint,color:newLead.source===s?"#fff":"#7A716A",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>{SOURCE_ICONS[s]} {s}</button>)}</div></div>
 <select value={newLead.service_interest} onChange={e=>setNewLead({...newLead,service_interest:e.target.value})} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}><option value="">תחום עניין</option>{activeServices.map(s=><option key={s.name}>{s.name}</option>)}</select>
 <div><p style={{fontSize:9,color:"#7A716A",marginBottom:3}}>סטטוס</p><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{Object.entries(LEAD_STATUSES).map(([key,s])=><button key={key} onClick={()=>setNewLead({...newLead,status:key})} style={{padding:"6px 9px",border:"1px solid",borderColor:newLead.status===key?s.color:"#E8DED6",borderRadius:20,background:newLead.status===key?s.bg:pcTint,color:newLead.status===key?s.color:"#7A716A",fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:newLead.status===key?700:400}}>{s.label}</button>)}</div></div>
 <div><p style={{fontSize:9,color:"#7A716A",marginBottom:3}}>תזכורת מעקב</p><input type="date" value={newLead.reminder_date} onChange={e=>setNewLead({...newLead,reminder_date:e.target.value})} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",background:pcTint}}/></div>
 <textarea value={newLead.notes} onChange={e=>setNewLead({...newLead,notes:e.target.value})} placeholder="הערות" rows={2} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint,resize:"none"}}/>
 </div>
 <div style={{display:"flex",gap:6,marginTop:16}}>
 <button onClick={()=>setShowLeadModal(false)} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid #E8DED6",background:"#fff",fontSize:12,color:"#7A716A"}}>ביטול</button>
 <button onClick={handleSaveLead} disabled={isBusy("saveLead")} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"#fff",fontSize:12}}>{isBusy("saveLead")?"שומר...":"שמירה ✓"}</button>
 </div>
 </div>
 </div>
      )}

      {/* CASHIER MODAL */}
      {showCashier&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:14}} onClick={()=>setShowCashier(false)}>
 <div onClick={e=>e.stopPropagation()} className="modal-card" style={{background:"#fff",borderRadius:22,padding:24,width:420,maxWidth:"100%",maxHeight:"92vh",overflowY:"auto"}}>
 <h3 className="serif" style={{fontSize:20,fontWeight:600,color:"#1C1C1C",marginBottom:14}}>קופה — תשלום חדש</h3>
 <div style={{position:"relative",marginBottom:10}}>
 <input value={cashierSearch} onChange={e=>{setCashierSearch(e.target.value);if(!e.target.value)setCashierClient(null);}} placeholder="חיפוש לקוחה..." style={{width:"100%",border:`1px solid ${cashierClient?"#7BAE7F":"#E8DED6"}`,borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:cashierClient?"#F3FFF6":pcTint}}/>
              {cashierSearch.length>1&&!cashierClient&&(
 <div style={{position:"absolute",top:"100%",right:0,left:0,background:"#fff",borderRadius:12,boxShadow:"0 8px 24px rgba(212,175,55,0.12)",zIndex:99,overflow:"hidden",marginTop:3,maxHeight:160,overflowY:"auto"}}>
                  {clients.filter(c=>c.name?.includes(cashierSearch)||c.phone?.includes(cashierSearch)).slice(0,6).map(c=>(
 <div key={c.id} onClick={()=>{setCashierClient(c);setCashierSearch(c.name);}} className="client-row" style={{padding:"9px 12px",borderBottom:"1px solid #F2E9E1",cursor:"pointer"}}>
 <p style={{fontSize:11,fontWeight:600,color:"#1C1C1C"}}>{c.name}</p><p style={{fontSize:9,color:"#7A716A"}}>{c.phone||"אין טלפון"}</p>
 </div>
                  ))}
 </div>
              )}
 </div>
 <div style={{marginBottom:10}}>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
 <p style={{fontSize:10,color:"#7A716A",fontWeight:600}}>פריטים</p>
 <select onChange={e=>{const svc=activeServices.find(s=>s.name===e.target.value);if(svc){setCashierItems(prev=>[...prev,{id:Date.now(),name:svc.name,price:svc.price,qty:1,color:svc.color}]);}e.target.value="";}} style={{border:"1px solid #E8DED6",borderRadius:10,padding:"5px 9px",fontSize:10,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint,color:pc}}><option value="">+ הוסיפי שירות</option>{activeServices.map(s=><option key={s.name} value={s.name}>{s.name} — ₪{s.price}</option>)}</select>
 </div>
              {cashierItems.length===0?<p style={{fontSize:10,color:"#B8AFA0",padding:"8px 0"}}>לא נבחרו פריטים</p>
                :cashierItems.map(item=>(
 <div key={item.id} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 9px",background:pcTint,borderRadius:10,marginBottom:4}}>
 <span style={{width:8,height:8,borderRadius:"50%",background:item.color||"#D9B98C",flexShrink:0}}/>
 <p style={{flex:1,fontSize:11,fontWeight:600,color:"#1C1C1C"}}>{item.name}</p>
 <button onClick={()=>setCashierItems(prev=>prev.map(i=>i.id===item.id?{...i,qty:Math.max(1,i.qty-1)}:i))} className="icon-btn" style={{width:22,height:22,fontSize:11}}>−</button>
 <span style={{fontSize:11,minWidth:16,textAlign:"center"}}>{item.qty}</span>
 <button onClick={()=>setCashierItems(prev=>prev.map(i=>i.id===item.id?{...i,qty:i.qty+1}:i))} className="icon-btn" style={{width:22,height:22,fontSize:11}}>+</button>
 <input type="number" value={item.price} onChange={e=>setCashierItems(prev=>prev.map(i=>i.id===item.id?{...i,price:Number(e.target.value)}:i))} style={{width:54,border:"1px solid #E8DED6",borderRadius:8,padding:"4px 6px",fontSize:10,fontFamily:"inherit",outline:"none",textAlign:"center",background:"#fff"}}/>
 <button onClick={()=>setCashierItems(prev=>prev.filter(i=>i.id!==item.id))} style={{background:"none",border:"none",color:"#F44336",fontSize:13,cursor:"pointer"}}>✕</button>
 </div>
                ))}
 </div>
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
 <p style={{fontSize:11,color:"#7A716A",flex:1}}>הנחה (₪)</p>
 <input type="number" value={cashierDiscount||""} onChange={e=>setCashierDiscount(e.target.value)} placeholder="0" style={{width:80,border:"1px solid #E8DED6",borderRadius:10,padding:"7px 10px",fontSize:11,fontFamily:"inherit",outline:"none",textAlign:"center",background:pcTint}}/>
 </div>
 <p style={{fontSize:10,color:"#7A716A",fontWeight:600,marginBottom:5}}>אמצעי תשלום</p>
 <div style={{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"}}>
              {PAYMENT_METHODS.map(pm=>(
 <button key={pm.key} onClick={()=>setPaymentMethod(pm.key)} style={{flex:"1 0 28%",padding:"9px 4px",border:"1px solid",borderColor:paymentMethod===pm.key?pm.color:"#E8DED6",borderRadius:12,background:paymentMethod===pm.key?pm.color:pcTint,color:paymentMethod===pm.key?"#fff":"#7A716A",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{pm.icon} {pm.key}</button>
              ))}
 </div>
            {["ביט","פייבוקס","העברה"].includes(paymentMethod)&&cashierClient?.phone&&(
 <div style={{background:"#F3E5F5",borderRadius:12,padding:"10px 12px",marginBottom:10}}>
 <p style={{fontSize:10,color:"#7B1FA2",fontWeight:600,marginBottom:6}}>שלחי בקשת תשלום ב-{paymentMethod}</p>
 <a href={waPayment(cashierClient.phone,cashierClient.name,cashierTotal,cashierItems.map(i=>i.name).join(", "),paymentMethod,settings.business_phone)} target="_blank" rel="noreferrer"
                  className="wa-btn" style={{display:"inline-flex",padding:"7px 12px",fontSize:10}}>שלחי בקשת תשלום</a>
 </div>
            )}
 <textarea value={cashierNote} onChange={e=>setCashierNote(e.target.value)} placeholder="הערה לקבלה" rows={2} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint,resize:"none",marginBottom:10}}/>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",background:pcTint,borderRadius:14,marginBottom:14}}>
 <span style={{fontSize:12,color:"#7A716A",fontWeight:600}}>סה״כ לתשלום</span>
 <span className="serif" style={{fontSize:26,fontWeight:700,color:pc}}>₪{cashierTotal.toLocaleString()}</span>
 </div>
            {paymentMethod==="אשראי"&&(
              <button onClick={handleCreditPayment} disabled={isBusy("creditPayment")} className="primary-btn" style={{width:"100%",padding:"13px 0",background:`linear-gradient(90deg,${pc},${pc2})`,color:"#fff",fontSize:13,marginBottom:8}}>{isBusy("creditPayment")?"פותח תשלום...":"💳 גבי באשראי דרך Grow"}</button>
            )}
 <div style={{display:"flex",gap:6}}>
 <button onClick={()=>setShowCashier(false)} className="primary-btn" style={{flex:1,padding:"12px 0",border:"1px solid #E8DED6",background:"#fff",fontSize:12,color:"#7A716A"}}>ביטול</button>
 <button onClick={handleSaveReceipt} disabled={isBusy("saveReceipt")} className="primary-btn" style={{flex:2,padding:"12px 0",background:pcGrad,color:"#fff",fontSize:13}}>{isBusy("saveReceipt")?"שומר...":"צרי קבלה ידנית ✓"}</button>
 </div>
 </div>
 </div>
      )}

      {/* RECEIPT MODAL */}
      {showReceipt&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1100,padding:14}} onClick={()=>setShowReceipt(null)}>
 <div onClick={e=>e.stopPropagation()} className="modal-card" style={{background:"#fff",borderRadius:22,padding:0,width:360,maxWidth:"100%",maxHeight:"92vh",overflowY:"auto",overflow:"hidden"}}>
 <div className="receipt-print" style={{padding:24}}>
 <div style={{textAlign:"center",borderBottom:"2px dashed #E8DED6",paddingBottom:14,marginBottom:14}}>
 <p className="serif" style={{fontSize:22,fontWeight:600,color:"#1C1C1C"}}>{settings.business_name}</p>
 <p style={{fontSize:10,color:"#7A716A",marginTop:2}}>קבלה</p>
                {settings.business_phone&&<p style={{fontSize:9,color:"#A89AA2"}}>{settings.business_phone}</p>}
 </div>
 <div style={{fontSize:11,color:"#1C1C1C",lineHeight:1.9}}>
 <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"#7A716A"}}>לקוחה:</span><span style={{fontWeight:600}}>{showReceipt.client_name}</span></div>
 <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"#7A716A"}}>תאריך:</span><span>{showReceipt.created_at?.slice(0,10)}</span></div>
 <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"#7A716A"}}>שירות:</span><span style={{fontWeight:600}}>{showReceipt.service}</span></div>
 <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"#7A716A"}}>אמצעי תשלום:</span><span>{showReceipt.payment_method}</span></div>
                {showReceipt.discount>0&&<div style={{display:"flex",justifyContent:"space-between",color:pc}}><span>הנחה:</span><span>−₪{showReceipt.discount}</span></div>}
                {showReceipt.note&&<div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"#7A716A"}}>הערה:</span><span>{showReceipt.note}</span></div>}
 </div>
 <div style={{borderTop:"2px dashed #E8DED6",marginTop:14,paddingTop:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
 <span style={{fontSize:13,fontWeight:600,color:"#7A716A"}}>סה״כ:</span>
 <span className="serif" style={{fontSize:26,fontWeight:700,color:pc}}>₪{showReceipt.amount}</span>
 </div>
 <p style={{textAlign:"center",fontSize:9,color:"#B8AFA0",marginTop:14}}>תודה ונתראה בקרוב ✦</p>
 </div>
 <div style={{display:"flex",gap:6,padding:"0 24px 24px"}}>
 <button onClick={()=>window.print()} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid #E8DED6",background:"#fff",fontSize:11,color:"#7A716A"}}>הדפסה</button>
              {(()=>{const cl=clients.find(c=>String(c.id)===String(showReceipt.client_id));return cl?.phone?(
 <button onClick={async()=>{if(isBusy("sendReceipt"))return;setBusyKey("sendReceipt",true);try{await sendReceiptToClient(showReceipt);}finally{setBusyKey("sendReceipt",false);}}} disabled={isBusy("sendReceipt")} className="primary-btn" style={{flex:1,padding:"11px 0",background:"#25D366",color:"#fff",fontSize:11,border:"none"}}>{isBusy("sendReceipt")?"שולח...":"שליחה ללקוחה"}</button>
              ):null;})()}
 <button onClick={()=>setShowReceipt(null)} className="primary-btn" style={{flex:1,padding:"11px 0",background:pcGrad,color:"#fff",fontSize:11}}>סגירה</button>
 </div>
 </div>
 </div>
      )}

      {/* PACKAGE MODAL */}
      {showPackageModal&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:14}} onClick={()=>setShowPackageModal(false)}>
 <div onClick={e=>e.stopPropagation()} className="modal-card" style={{background:"#fff",borderRadius:22,padding:24,width:340,maxWidth:"100%"}}>
 <h3 className="serif" style={{fontSize:20,fontWeight:600,color:"#1C1C1C",marginBottom:14}}>חבילת טיפולים חדשה</h3>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
 <select value={newPackage.client_id} onChange={e=>{const c=clients.find(cl=>String(cl.id)===e.target.value);setNewPackage({...newPackage,client_id:e.target.value,client_name:c?.name||""});}} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}><option value="">— בחרי לקוחה —</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
 <select value={newPackage.service} onChange={e=>setNewPackage({...newPackage,service:e.target.value})} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}><option value="">— בחרי שירות —</option>{activeServices.map(s=><option key={s.name}>{s.name}</option>)}</select>
 <div style={{display:"flex",gap:6}}>
 <div style={{flex:1}}><p style={{fontSize:9,color:"#7A716A",marginBottom:3}}>מספר טיפולים</p><input type="number" value={newPackage.total_sessions} onChange={e=>setNewPackage({...newPackage,total_sessions:Number(e.target.value)})} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none",textAlign:"center",background:pcTint}}/></div>
 <div style={{flex:1}}><p style={{fontSize:9,color:"#7A716A",marginBottom:3}}>מחיר חבילה ₪</p><input type="number" value={newPackage.price} onChange={e=>setNewPackage({...newPackage,price:Number(e.target.value)})} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none",textAlign:"center",background:pcTint}}/></div>
 </div>
 </div>
 <div style={{display:"flex",gap:6,marginTop:16}}>
 <button onClick={()=>setShowPackageModal(false)} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid #E8DED6",background:"#fff",fontSize:12,color:"#7A716A"}}>ביטול</button>
 <button onClick={handleSavePackage} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"#fff",fontSize:12}}>שמירה ✓</button>
 </div>
 </div>
 </div>
      )}

      {/* POST DESIGN MODAL */}
      {designPost&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1100,padding:14,overflowY:"auto"}} onClick={()=>setDesignPost(null)}>
          <div onClick={e=>e.stopPropagation()} style={{maxWidth:420,width:"100%"}}>
            <div id="post-design" style={{width:380,height:380,marginLeft:"auto",marginRight:"auto",background:designBg?"#000":pcGrad,borderRadius:0,padding:34,display:"flex",flexDirection:"column",justifyContent:"center",position:"relative",overflow:"hidden"}}>
              {designBg&&<img alt="" src={designBg} crossOrigin="anonymous" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>}
              {designBg&&<div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,rgba(0,0,0,0.25),rgba(0,0,0,0.55))"}}/>}
              <div style={{position:"absolute",top:18,right:22,fontSize:11,color:"rgba(255,255,255,0.85)",fontWeight:600,letterSpacing:"1px"}}>{settings.business_name||""}</div>
              {designPost.title&&<div className="serif" style={{fontSize:26,fontWeight:700,color:"#fff",lineHeight:1.25,marginBottom:14,textShadow:"0 1px 6px rgba(0,0,0,0.18)"}}>{designPost.title}</div>}
              <div style={{fontSize:14,color:"#fff",lineHeight:1.6,whiteSpace:"pre-wrap",textShadow:"0 1px 4px rgba(0,0,0,0.15)",maxHeight:170,overflow:"hidden"}}>{designPost.body}</div>
              {designPost.callToAction&&<div style={{marginTop:16,display:"inline-block",alignSelf:"flex-start",background:"#fff",color:"#3A2A30",fontSize:12.5,fontWeight:700,padding:"8px 18px",borderRadius:30}}>{designPost.callToAction}</div>}
            </div>
            <div style={{display:"flex",gap:8,marginTop:10,maxWidth:380,marginLeft:"auto",marginRight:"auto"}}>
              <label style={{flex:1,padding:"10px 0",background:"rgba(255,255,255,0.92)",color:"#3A2A30",borderRadius:12,fontSize:11.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit",textAlign:"center"}}>
                📷 העלאת תמונת רקע
                <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files&&e.target.files[0];if(f){const r=new FileReader();r.onload=()=>setDesignBg(r.result);r.readAsDataURL(f);}}}/>
              </label>
              {designBg&&<button onClick={()=>setDesignBg(null)} style={{flex:"0 0 auto",padding:"10px 14px",background:"rgba(255,255,255,0.92)",color:"#D96A6A",border:"none",borderRadius:12,fontSize:11.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>הסרה</button>}
            </div>
            <div style={{display:"flex",gap:8,marginTop:8,maxWidth:380,marginLeft:"auto",marginRight:"auto"}}>
              <button onClick={()=>{setDesignPost(null);setDesignBg(null);}} style={{flex:1,padding:"12px 0",background:"#fff",color:"#7A716A",border:"none",borderRadius:12,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>סגירה</button>
              <button onClick={downloadPostImage} disabled={designing} style={{flex:2,padding:"12px 0",background:"#1C1C1C",color:"#fff",border:"none",borderRadius:12,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",opacity:designing?0.6:1}}>{designing?"מייצר...":"⬇ הורדת תמונה"}</button>
            </div>
          </div>
        </div>
      )}

      {/* PROTOCOL MODAL */}
      {showProtocolModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:14}} onClick={()=>setShowProtocolModal(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:18,padding:20,width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto"}}>
            <h3 className="serif" style={{fontSize:18,fontWeight:600,color:"#1C1C1C",marginBottom:14}}>פרוטוקול חדש</h3>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <input value={newProtocol.brand} onChange={e=>setNewProtocol({...newProtocol,brand:e.target.value})} placeholder="מותג *" style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}/>
              <input value={newProtocol.name} onChange={e=>setNewProtocol({...newProtocol,name:e.target.value})} placeholder="שם הפרוטוקול *" style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}/>
              <input value={newProtocol.concern} onChange={e=>setNewProtocol({...newProtocol,concern:e.target.value})} placeholder="בעיה שהפרוטוקול פותר (אקנה, אנטי-אייג׳ינג...)" style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}/>
              <input value={newProtocol.frequency} onChange={e=>setNewProtocol({...newProtocol,frequency:e.target.value})} placeholder="תדירות (למשל: אחת לשבועיים)" style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}/>
              <div style={{display:"flex",gap:8}}>
                <div style={{flex:1}}><p style={{fontSize:9,color:"#7A716A",marginBottom:3}}>מספר מפגשים</p><input type="number" value={newProtocol.sessions_count} onChange={e=>setNewProtocol({...newProtocol,sessions_count:Number(e.target.value)})} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none",textAlign:"center",background:pcTint}}/></div>
                <div style={{flex:1}}><p style={{fontSize:9,color:"#7A716A",marginBottom:3}}>זמן (דקות)</p><input type="number" value={newProtocol.duration_minutes} onChange={e=>setNewProtocol({...newProtocol,duration_minutes:Number(e.target.value)})} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none",textAlign:"center",background:pcTint}}/></div>
                <div style={{flex:1}}><p style={{fontSize:9,color:"#7A716A",marginBottom:3}}>מחיר ₪</p><input type="number" value={newProtocol.price} onChange={e=>setNewProtocol({...newProtocol,price:Number(e.target.value)})} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none",textAlign:"center",background:pcTint}}/></div>
              </div>
              <textarea value={newProtocol.notes} onChange={e=>setNewProtocol({...newProtocol,notes:e.target.value})} placeholder="הערות / התוויות נגד" rows={2} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint,resize:"none"}}/>
              <div style={{display:"flex",gap:8,marginTop:4}}>
                <button onClick={()=>setShowProtocolModal(false)} style={{flex:1,padding:"11px 0",background:"#fff",color:"#7A716A",border:"1px solid #E8DED6",borderRadius:12,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>ביטול</button>
                <button onClick={handleSaveProtocol} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"#fff",fontSize:12}}>שמירה ✓</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WAITLIST MODAL */}
      {showWaitlistModal&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:14}} onClick={()=>setShowWaitlistModal(false)}>
 <div onClick={e=>e.stopPropagation()} className="modal-card" style={{background:"#fff",borderRadius:22,padding:24,width:340,maxWidth:"100%"}}>
 <h3 className="serif" style={{fontSize:20,fontWeight:600,color:"#1C1C1C",marginBottom:14}}>הוספה לרשימת המתנה</h3>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
 <select value={newWaitlist.client_id} onChange={e=>{const c=clients.find(cl=>String(cl.id)===e.target.value);setNewWaitlist({...newWaitlist,client_id:e.target.value,client_name:c?.name||"",phone:c?.phone||""});}} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}><option value="">— בחרי לקוחה —</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
 <select value={newWaitlist.service} onChange={e=>setNewWaitlist({...newWaitlist,service:e.target.value})} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}><option value="">— בחרי שירות —</option>{activeServices.map(s=><option key={s.name}>{s.name}</option>)}</select>
 <input type="date" value={newWaitlist.preferred_date} onChange={e=>setNewWaitlist({...newWaitlist,preferred_date:e.target.value})} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",background:pcTint}}/>
 <textarea value={newWaitlist.notes} onChange={e=>setNewWaitlist({...newWaitlist,notes:e.target.value})} placeholder="הערות" rows={2} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint,resize:"none"}}/>
 </div>
 <div style={{display:"flex",gap:6,marginTop:16}}>
 <button onClick={()=>setShowWaitlistModal(false)} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid #E8DED6",background:"#fff",fontSize:12,color:"#7A716A"}}>ביטול</button>
 <button onClick={handleSaveWaitlist} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"#fff",fontSize:12}}>שמירה ✓</button>
 </div>
 </div>
 </div>
      )}

      {/* COMMUNITY POST MODAL */}
      {showPostModal&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1300,padding:14}} onClick={()=>setShowPostModal(false)}>
 <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:20,maxWidth:460,width:"100%",maxHeight:"90vh",overflowY:"auto",padding:"22px"}}>
 <p className="serif" style={{fontSize:18,fontWeight:600,color:"#1C1C1C",marginBottom:14}}>פוסט חדש למרחב הלקוחות</p>

 <p style={{fontSize:10,color:"#7A716A",marginBottom:5}}>סוג הפוסט</p>
 <div style={{display:"flex",gap:6,marginBottom:13}}>
 {[{k:"update",l:"עדכון"},{k:"offer",l:"מבצע"},{k:"tip",l:"טיפ"}].map(t=>(
 <button key={t.k} onClick={()=>setNewPost({...newPost,post_type:t.k})} style={{flex:1,padding:"8px 0",borderRadius:10,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:newPost.post_type===t.k?`2px solid ${pc}`:"1px solid #E8DED6",background:newPost.post_type===t.k?pcTint:"#fff",color:pc}}>{t.l}</button>
 ))}
 </div>

 <p style={{fontSize:10,color:"#7A716A",marginBottom:5}}>כותרת (לא חובה)</p>
 <input value={newPost.title} onChange={e=>setNewPost({...newPost,title:e.target.value})} placeholder="לדוגמה: מבצע אביב על טיפולי פנים" style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1px solid #E8D5DD",fontSize:12.5,fontFamily:"inherit",marginBottom:12,boxSizing:"border-box"}}/>

 <p style={{fontSize:10,color:"#7A716A",marginBottom:5}}>תוכן</p>
 <textarea value={newPost.body} onChange={e=>setNewPost({...newPost,body:e.target.value})} rows={4} placeholder="כתבי כאן את העדכון, המבצע או הטיפ..." style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1px solid #E8D5DD",fontSize:12.5,fontFamily:"inherit",marginBottom:12,boxSizing:"border-box",resize:"vertical"}}/>

 <p style={{fontSize:10,color:"#7A716A",marginBottom:5}}>טקסט לכפתור (לא חובה)</p>
 <input value={newPost.cta_label} onChange={e=>setNewPost({...newPost,cta_label:e.target.value})} placeholder="לדוגמה: לפרטים בוואטסאפ" style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1px solid #E8D5DD",fontSize:12.5,fontFamily:"inherit",marginBottom:12,boxSizing:"border-box"}}/>

 <p style={{fontSize:10,color:"#7A716A",marginBottom:5}}>תמונה (לא חובה)</p>
 {newPost.image_url&&<img alt="" src={newPost.image_url} style={{width:"100%",maxHeight:160,objectFit:"cover",borderRadius:10,marginBottom:8}}/>}
 <label style={{display:"block",padding:"9px 0",textAlign:"center",borderRadius:10,border:"1px dashed #E8DED6",fontSize:11.5,color:pc,cursor:"pointer",marginBottom:16,fontWeight:600}}>
 {postImageUploading?"מעלה...":newPost.image_url?"החלפת תמונה":"+ הוספת תמונה"}
 <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files&&e.target.files[0];if(f)uploadPostImage(f);}}/>
 </label>

 <div style={{display:"flex",gap:8}}>
 <button onClick={saveCommunityPost} disabled={savingPost} className="primary-btn" style={{flex:1,padding:"12px 0",background:pcGrad,color:"#fff",fontSize:13,opacity:savingPost?0.6:1}}>{savingPost?"מפרסם...":"פרסום"}</button>
 <button onClick={()=>setShowPostModal(false)} style={{padding:"12px 18px",background:"#fff",color:"#7A716A",border:"1px solid #E8D5DD",borderRadius:12,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>ביטול</button>
 </div>
 </div>
 </div>
      )}

      {/* SETTINGS MODAL */}
      {showSettings&&editSettings&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:14}} onClick={()=>{setShowSettings(false);setEditSettings(null);}}>
 <div onClick={e=>e.stopPropagation()} className="modal-card" style={{background:"#fff",borderRadius:22,padding:0,width:440,maxWidth:"100%",maxHeight:"92vh",overflow:"hidden",display:"flex",flexDirection:"column"}}>
 <div style={{padding:"20px 24px 0"}}>
 <h3 className="serif" style={{fontSize:20,fontWeight:600,color:"#1C1C1C",marginBottom:14}}>⚙ הגדרות</h3>
 <div style={{display:"flex",gap:4,borderBottom:"1px solid #E8DED6"}}>
                {[{k:"general",l:"כללי"},{k:"services",l:"שירותים"},{k:"hours",l:"שעות"},{k:"payment",l:"תשלום"}].map(t=>(
 <button key={t.k} onClick={()=>setSettingsTab(t.k)} style={{background:"none",border:"none",padding:"9px 12px",fontSize:11.5,fontWeight:settingsTab===t.k?600:400,color:settingsTab===t.k?"#1C1C1C":"#7A716A",borderBottom:settingsTab===t.k?`2.5px solid ${pc}`:"2.5px solid transparent",cursor:"pointer",fontFamily:"inherit"}}>{t.l}</button>
                ))}
 </div>
 </div>
 <div style={{padding:"16px 24px",overflowY:"auto",flex:1}}>
              {settingsTab==="general"&&(
 <div style={{display:"flex",flexDirection:"column",gap:9}}>
 <div><p style={{fontSize:9,color:"#7A716A",marginBottom:3}}>שם העסק</p><input value={editSettings.business_name||""} onChange={e=>setEditSettings({...editSettings,business_name:e.target.value})} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}/></div>
 <div><p style={{fontSize:9,color:"#7A716A",marginBottom:3}}>שם המטפלת</p><input value={editSettings.therapist_name||""} onChange={e=>setEditSettings({...editSettings,therapist_name:e.target.value})} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}/></div>
 <div><p style={{fontSize:9,color:"#7A716A",marginBottom:3}}>צבע ראשי</p><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{["#D98BA0","#C9A24B","#C68A5E","#B0764E","#A67C52","#8C6239","#CBA15E","#E0C068","#BC6B3F","#1C1C1C"].map(col=><button key={col} onClick={()=>setEditSettings({...editSettings,primary_color:col})} style={{width:34,height:34,borderRadius:"50%",background:col,border:editSettings.primary_color===col?"3px solid #1C1C1C":"2px solid #E8DED6",cursor:"pointer"}}/>)}</div></div>
 <div><p style={{fontSize:9,color:"#7A716A",marginBottom:3}}>לינק ביקורת (Google)</p><input value={editSettings.review_url||""} onChange={e=>setEditSettings({...editSettings,review_url:e.target.value})} placeholder="https://g.page/r/..." style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"ltr",textAlign:"left",background:pcTint}}/><p style={{fontSize:9,color:"#A89AA2",marginTop:4,lineHeight:1.5}}>יצורף אוטומטית להודעת בקשת הביקורת שנשלחת ללקוחה יומיים אחרי הטיפול</p></div>
 <div><p style={{fontSize:9,color:"#7A716A",marginBottom:4}}>סטטוס עוסק (לדוחות מס)</p>
 <div style={{display:"flex",gap:6}}>
                  {[{k:"exempt",l:"עוסק פטור"},{k:"licensed",l:"עוסק מורשה"},{k:"company",l:"חברה בע\"מ"}].map(o=>{
                    const sel=(editSettings.business_tax_status||"exempt")===o.k;
                    return <button key={o.k} onClick={()=>setEditSettings({...editSettings,business_tax_status:o.k})} style={{flex:1,padding:"9px 4px",borderRadius:10,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:sel?`2px solid ${pc}`:"1px solid #E8DED6",background:sel?pcTint:"#fff",color:sel?pc:"#7A716A"}}>{o.l}</button>;
                  })}
 </div>
 <p style={{fontSize:9,color:"#A89AA2",marginTop:4,lineHeight:1.5}}>קובע איך מחושב דוח המס שלך במסך "דוחות מס"</p></div>
 <div style={{borderTop:"1px solid #E8DED6",paddingTop:12,marginTop:4}}>
 <p style={{fontSize:10,color:"#7A716A",marginBottom:8,fontWeight:600}}>בוט הוואטסאפ החכם</p>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
 <span style={{fontSize:12,color:"#1C1C1C"}}>הבוט פעיל</span>
 {(()=>{const botOn=!(editSettings.bot_active===false||editSettings.bot_active==="false");return(
 <button onClick={()=>setEditSettings({...editSettings,bot_active:!botOn})} style={{width:46,height:26,borderRadius:13,border:"none",cursor:"pointer",background:botOn?pc:"#D8CEd3",position:"relative",transition:"background .2s"}}>
 <span style={{position:"absolute",top:3,left:botOn?23:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
 </button>
 );})()}
 </div>
 {!(editSettings.bot_active===false||editSettings.bot_active==="false")&&(
 <div>
 <p style={{fontSize:10,color:"#7A716A",marginBottom:6}}>מתי הבוט יענה?</p>
 <div style={{display:"flex",gap:6}}>
 <button onClick={()=>setEditSettings({...editSettings,bot_mode:"always"})} style={{flex:1,padding:"9px 0",borderRadius:10,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:(editSettings.bot_mode||"always")==="always"?`2px solid ${pc}`:"1px solid #E8DED6",background:(editSettings.bot_mode||"always")==="always"?pcTint:"#fff",color:pc}}>תמיד</button>
 <button onClick={()=>setEditSettings({...editSettings,bot_mode:"after_hours"})} style={{flex:1,padding:"9px 0",borderRadius:10,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:editSettings.bot_mode==="after_hours"?`2px solid ${pc}`:"1px solid #E8DED6",background:editSettings.bot_mode==="after_hours"?pcTint:"#fff",color:pc}}>רק מחוץ לשעות העבודה</button>
 </div>
 <p style={{fontSize:9,color:"#B8AFA0",marginTop:6}}>{editSettings.bot_mode==="after_hours"?"הבוט יענה רק כשאת לא בשעות/ימי העבודה — בשאר הזמן את עונה בעצמך.":"הבוט יענה לכל הודעה נכנסת, בכל שעה."}</p>
 </div>
 )}
 </div>
 <div style={{borderTop:"1px solid #E8DED6",paddingTop:12,marginTop:4}}>
 <p style={{fontSize:10,color:"#7A716A",marginBottom:8,fontWeight:600}}>קבלות</p>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
 <span style={{fontSize:12,color:"#1C1C1C"}}>שליחת קבלה אוטומטית ללקוחה בוואטסאפ</span>
 {(()=>{const on=(editSettings.send_receipt_auto===true||editSettings.send_receipt_auto==="true");return(
 <button onClick={()=>setEditSettings({...editSettings,send_receipt_auto:!on})} style={{width:46,height:26,borderRadius:13,border:"none",cursor:"pointer",background:on?pc:"#D8CEd3",position:"relative",transition:"background .2s",flexShrink:0}}>
 <span style={{position:"absolute",top:3,left:on?23:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
 </button>
 );})()}
 </div>
 <p style={{fontSize:9,color:"#B8AFA0",marginTop:6,lineHeight:1.5}}>כשמופעל — הקבלה נשלחת אוטומטית ללקוחה מיד לאחר יצירתה (רק אם יש לה מספר טלפון). כשכבוי — נשלחת רק בלחיצה ידנית.</p>
 </div>
 <div style={{borderTop:"1px solid #E8DED6",paddingTop:12,marginTop:4}}>
 <p style={{fontSize:10,color:"#7A716A",marginBottom:8,fontWeight:600}}>קישורים ללקוחות (לשליחה בוואטסאפ / ביו)</p>
 <button onClick={()=>copyPublicLink("scan")} style={{width:"100%",padding:"10px 0",background:pcGrad,color:"#fff",border:"none",borderRadius:12,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginBottom:7}}>✦ העתקת קישור לסורק העור</button>
 <button onClick={()=>copyPublicLink("book")} style={{width:"100%",padding:"10px 0",background:"#fff",color:pc,border:"1px solid #E8DED6",borderRadius:12,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>📅 העתקת קישור לקביעת תור</button>
 </div>
 </div>
              )}
              {settingsTab==="services"&&(
 <div>
                  {services.map((svc,idx)=>(
 <div key={idx} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",background:pcTint,borderRadius:12,marginBottom:5}}>
 <span style={{width:10,height:10,borderRadius:"50%",background:svc.color||"#D9B98C",flexShrink:0}}/>
 <input value={svc.name} onChange={e=>setServices(prev=>prev.map((s,i)=>i===idx?{...s,name:e.target.value}:s))} style={{flex:1,minWidth:0,border:"none",background:"transparent",fontSize:11,fontFamily:"inherit",outline:"none",fontWeight:600,color:"#1C1C1C"}}/>
 <input type="number" value={svc.price} onChange={e=>setServices(prev=>prev.map((s,i)=>i===idx?{...s,price:Number(e.target.value)}:s))} style={{width:54,border:"1px solid #E8DED6",borderRadius:8,padding:"4px 6px",fontSize:10,fontFamily:"inherit",outline:"none",textAlign:"center",background:"#fff"}}/>
 <input type="number" value={svc.duration} onChange={e=>setServices(prev=>prev.map((s,i)=>i===idx?{...s,duration:Number(e.target.value)}:s))} style={{width:44,border:"1px solid #E8DED6",borderRadius:8,padding:"4px 6px",fontSize:10,fontFamily:"inherit",outline:"none",textAlign:"center",background:"#fff"}}/>
 <button onClick={()=>handleSaveService(svc,idx)} className="icon-btn" style={{width:26,height:26,fontSize:11}}>✓</button>
 </div>
                  ))}
                  {showNewService?(
 <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",background:"#F7F1E6",borderRadius:12,marginTop:6}}>
 <input value={newService.name} onChange={e=>setNewService({...newService,name:e.target.value})} placeholder="שם שירות" style={{flex:1,minWidth:0,border:"1px solid #E8DED6",borderRadius:8,padding:"4px 8px",fontSize:11,fontFamily:"inherit",outline:"none",background:"#fff"}}/>
 <input type="number" value={newService.price} onChange={e=>setNewService({...newService,price:Number(e.target.value)})} placeholder="₪" style={{width:54,border:"1px solid #E8DED6",borderRadius:8,padding:"4px 6px",fontSize:10,fontFamily:"inherit",outline:"none",textAlign:"center",background:"#fff"}}/>
 <button onClick={handleAddService} className="icon-btn" style={{width:26,height:26,fontSize:11}}>✓</button>
 </div>
                  ):<button onClick={()=>setShowNewService(true)} style={{background:pcTint,border:`1px dashed ${pc}`,borderRadius:12,padding:"8px 0",width:"100%",fontSize:11,color:pc,cursor:"pointer",fontFamily:"inherit",marginTop:6}}>+ הוסיפי שירות</button>}
 </div>
              )}
              {settingsTab==="hours"&&(
 <div style={{display:"flex",flexDirection:"column",gap:9}}>
 <div style={{display:"flex",gap:6}}>
 <div style={{flex:1}}><p style={{fontSize:9,color:"#7A716A",marginBottom:3}}>שעת פתיחה</p><select value={editSettings.working_hours_start} onChange={e=>setEditSettings({...editSettings,working_hours_start:Number(e.target.value)})} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}>{HOURS_ALL.map((h,i)=><option key={h} value={7+i}>{h}</option>)}</select></div>
 <div style={{flex:1}}><p style={{fontSize:9,color:"#7A716A",marginBottom:3}}>שעת סגירה</p><select value={editSettings.working_hours_end} onChange={e=>setEditSettings({...editSettings,working_hours_end:Number(e.target.value)})} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}>{HOURS_ALL.map((h,i)=><option key={h} value={7+i}>{h}</option>)}</select></div>
 </div>
 </div>
              )}
              {settingsTab==="payment"&&(
 <div style={{display:"flex",flexDirection:"column",gap:9}}>
 <div><p style={{fontSize:9,color:"#7A716A",marginBottom:3}}>טלפון לביט / בקשות תשלום</p><input value={editSettings.business_phone||""} onChange={e=>setEditSettings({...editSettings,business_phone:e.target.value})} placeholder="050-0000000" style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}/></div>
 <p style={{fontSize:10,color:"#A89AA2",lineHeight:1.5}}>המספר הזה ישמש לבקשות תשלום ב-ביט שנשלחות ללקוחות </p>
 </div>
              )}
 </div>
 <div style={{display:"flex",gap:6,padding:"14px 24px",borderTop:"1px solid #E8DED6"}}>
 <button onClick={()=>{setShowSettings(false);setEditSettings(null);}} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid #E8DED6",background:"#fff",fontSize:12,color:"#7A716A"}}>סגירה</button>
 <button onClick={handleSaveSettings} disabled={isBusy("saveSettings")} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"#fff",fontSize:12}}>{isBusy("saveSettings")?"שומר...":"שמירה ✓"}</button>
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
              const statusColor=STATUS_COLORS[c.status]||"#D9B98C";
              return(<>
 <div style={{background:`linear-gradient(135deg,${pc2} 0%,${pc} 100%)`,padding:"22px 22px 18px",color:"#fff",position:"relative"}}>
 <button onClick={()=>setSelectedClient(null)} style={{position:"absolute",top:14,left:14,background:"rgba(255,255,255,0.25)",border:"none",borderRadius:"50%",width:30,height:30,color:"#fff",fontSize:14,cursor:"pointer"}}>✕</button>
 <div style={{display:"flex",alignItems:"center",gap:14}}>
 <div style={{width:60,height:60,borderRadius:"50%",background:c.images?.[0]?"transparent":"rgba(255,255,255,0.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,fontWeight:700,overflow:"hidden",flexShrink:0}}>{c.images?.[0]?<img alt={c.name} src={c.images[0]} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:c.name[0]}</div>
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
                    {c.phone&&<a href={waLink(c.phone)} target="_blank" rel="noreferrer" style={{flex:1,background:"#fff",color:pc,borderRadius:20,padding:"8px 0",fontSize:11,fontWeight:700,textAlign:"center",textDecoration:"none"}}>וואטסאפ</a>}
 <button onClick={()=>openEditClient(c)} style={{flex:1,background:"rgba(255,255,255,0.25)",color:"#fff",border:"none",borderRadius:20,padding:"8px 0",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✎ עריכה</button>
 </div>
 <label style={{display:"block",marginTop:8,background:"rgba(255,255,255,0.95)",color:pc,borderRadius:20,padding:"9px 0",fontSize:11,fontWeight:700,textAlign:"center",cursor:"pointer"}}>
 {scanLoading?"סורקת...":"✦ סריקת עור AI"}
 <input type="file" accept="image/*" capture="user" disabled={scanLoading} onChange={e=>{const f=e.target.files?.[0]; if(f) scanClientSkin(c,f); e.target.value="";}} style={{display:"none"}}/>
 </label>
 </div>

                {(()=>{
                  const insights=[];
                  if(days>90)insights.push({icon:"",text:`לא ביקרה ${days} ימים — שווה הודעת התחדשות`,color:"#5580C4"});
                  if(c.allergies)insights.push({icon:"",text:`אלרגיות: ${c.allergies}`,color:"#FF9800"});
                  if(c.medical)insights.push({icon:"",text:`רפואי: ${c.medical}`,color:"#5580C4"});
                  if(total>2000)insights.push({icon:"",text:`לקוחה מובילה — ₪${total.toLocaleString()} סה״כ`,color:pc});
                  if(cPackages.length>0)insights.push({icon:"",text:`${cPackages.length} חבילות פעילות`,color:"#7B1FA2"});
                  if(insights.length===0)return null;
                  return(
 <div style={{padding:"14px 22px 0"}}>
                      {insights.map((ins,i)=>(
 <div key={i} style={{display:"flex",alignItems:"center",gap:9,padding:"9px 12px",background:pcTint,borderRadius:12,marginBottom:6,borderRight:`3px solid ${ins.color}`}}>
 <span style={{fontSize:14}}>{ins.icon}</span>
 <p style={{fontSize:10.5,color:"#1C1C1C",fontWeight:500}}>{ins.text}</p>
 </div>
                      ))}
 </div>
                  );
                })()}

 <div style={{display:"flex",gap:3,padding:"14px 22px 0",borderBottom:"1px solid #E8DED6",overflowX:"auto"}}>
                  {[{k:"info",l:"פרטים"},{k:"history",l:`היסטוריה (${appts.length})`},{k:"scans",l:`סריקות עור (${clientScans.length})`},{k:"receipts",l:`קבלות (${cReceipts.length})`},{k:"packages",l:`חבילות (${cPackages.length})`},{k:"forms",l:`טפסים (${cForms.length})`},{k:"beforeafter",l:`לפני/אחרי (${clientPhotos.length})`},{k:"images",l:`תמונות (${c.images?.length||0})`}].map(t=>(
 <button key={t.k} onClick={()=>setClientTab(t.k)} style={{background:"none",border:"none",padding:"8px 9px",fontSize:10.5,fontWeight:clientTab===t.k?600:400,color:clientTab===t.k?"#1C1C1C":"#7A716A",borderBottom:clientTab===t.k?`2.5px solid ${pc}`:"2.5px solid transparent",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{t.l}</button>
                  ))}
 </div>

 <div style={{padding:"16px 22px"}}>
                  {clientTab==="info"&&(
 <div style={{display:"flex",flexDirection:"column",gap:9,fontSize:11.5}}>
                      {c.birthday&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F7F0F3"}}><span style={{color:"#7A716A"}}>יום הולדת</span><span style={{fontWeight:600}}>{c.birthday}</span></div>}
                      {c.skinType&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F7F0F3"}}><span style={{color:"#7A716A"}}>סוג עור</span><span style={{fontWeight:600}}>{c.skinType}</span></div>}
                      {c.allergies&&<div style={{padding:"8px 10px",background:"#FFFAF7",borderRadius:10,border:"1px solid #FFDAC1"}}><p style={{color:"#FF9800",fontWeight:700,fontSize:9,marginBottom:2}}>אלרגיות</p><p>{c.allergies}</p></div>}
                      {c.medical&&<div style={{padding:"8px 10px",background:"#F7FAFF",borderRadius:10,border:"1px solid #A7C4F4"}}><p style={{color:"#5580C4",fontWeight:700,fontSize:9,marginBottom:2}}>רפואי</p><p>{c.medical}</p></div>}
                      {c.notes&&<div style={{padding:"8px 10px",background:pcTint,borderRadius:10}}><p style={{color:"#7A716A",fontWeight:700,fontSize:9,marginBottom:2}}>הערות</p><p>{c.notes}</p></div>}
 </div>
                  )}
                  {clientTab==="history"&&(
                    appts.length===0?<p style={{fontSize:11,color:"#B8AFA0"}}>אין היסטוריית תורים</p>
                    :appts.map(a=>(
 <div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:"1px solid #F7F0F3"}}>
 <span style={{width:8,height:8,borderRadius:"50%",background:a.color||"#D9B98C",flexShrink:0}}/>
 <div style={{flex:1}}><p style={{fontSize:11,fontWeight:600,color:"#1C1C1C"}}>{a.service}</p><p style={{fontSize:9,color:"#7A716A"}}>{a.date} · {a.hour}:00{a.price?` · ₪${a.price}`:""}</p></div>
                        {a.confirmation_status==="confirmed"&&<span style={{fontSize:8,color:"#7BAE7F"}}>✓</span>}
 </div>
                    ))
                  )}
                  {clientTab==="scans"&&(
                    scansLoading?<p style={{fontSize:11,color:"#B8AFA0"}}>טוען סריקות...</p>
                    :clientScans.length===0?<p style={{fontSize:11,color:"#B8AFA0"}}>אין סריקות עדיין. לחצי על "סריקת עור AI" למעלה.</p>
                    :clientScans.map(s=>(
 <div key={s.id} onClick={()=>setViewScan(s)} style={{display:"flex",alignItems:"center",gap:11,padding:"10px 0",borderBottom:"1px solid #F7F0F3",cursor:"pointer"}}>
 {s.image_url?<img alt="" src={s.image_url} style={{width:46,height:46,borderRadius:10,objectFit:"cover",flexShrink:0}}/>:<div style={{width:46,height:46,borderRadius:10,background:pcTint,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:18}}>✦</div>}
 <div style={{flex:1}}>
 <p style={{fontSize:11.5,fontWeight:600,color:"#1C1C1C"}}>{s.skin_type||"סריקת עור"}</p>
 <p style={{fontSize:9,color:"#7A716A"}}>{new Date(s.created_at).toLocaleDateString("he-IL")}{s.report?.clinical_treatment?` · ${s.report.clinical_treatment}`:""}</p>
 </div>
 <div style={{width:34,height:34,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",border:`3px solid ${s.score>=75?"#388E3C":s.score>=50?"#E8920C":pc}`,flexShrink:0}}><span style={{fontSize:12,fontWeight:800,color:s.score>=75?"#388E3C":s.score>=50?"#E8920C":pc}}>{s.score}</span></div>
 </div>
                    ))
                  )}
                  {clientTab==="receipts"&&(
                    cReceipts.length===0?<p style={{fontSize:11,color:"#B8AFA0"}}>אין קבלות</p>
                    :cReceipts.map(r=>(
 <div key={r.id} onClick={()=>setShowReceipt(r)} role="button" tabIndex={0} onKeyDown={onKbdActivate} aria-label={`פתיחת קבלה — ${r.client_name||"לקוחה"}`} className="client-row" style={{display:"flex",alignItems:"center",gap:9,padding:"9px 10px",background:pcTint,borderRadius:10,marginBottom:5,cursor:"pointer"}}>
 <span style={{fontSize:13}}>{PAYMENT_METHODS.find(p=>p.key===r.payment_method)?.icon||""}</span>
 <div style={{flex:1}}><p style={{fontSize:10.5,fontWeight:600,color:"#1C1C1C"}}>{r.service}</p><p style={{fontSize:8.5,color:"#7A716A"}}>{r.created_at?.slice(0,10)} · {r.payment_method}</p></div>
 <span className="serif" style={{fontSize:13,fontWeight:600,color:pc}}>₪{r.amount}</span>
 </div>
                    ))
                  )}
                  {clientTab==="packages"&&(
                    cPackages.length===0?<p style={{fontSize:11,color:"#B8AFA0"}}>אין חבילות פעילות</p>
                    :cPackages.map(pkg=>(
 <div key={pkg.id} style={{background:pcTint,borderRadius:12,padding:"11px 12px",marginBottom:7}}>
 <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><p style={{fontSize:11,fontWeight:700,color:"#1C1C1C"}}>{pkg.service}</p><button onClick={()=>handleUsePackageSession(pkg)} style={{background:pcGrad,color:"#fff",border:"none",borderRadius:14,padding:"3px 9px",fontSize:9,cursor:"pointer",fontFamily:"inherit"}}>✓ השתמשי</button></div>
 <div style={{display:"flex",gap:2}}>{Array.from({length:Number(pkg.total_sessions)},(_,i)=><div key={i} style={{flex:1,height:6,borderRadius:3,background:i<Number(pkg.used_sessions)?pc:"#F0E7EC"}}/>)}</div>
 <p style={{fontSize:8.5,color:"#7A716A",marginTop:3}}>{pkg.used_sessions}/{pkg.total_sessions}</p>
 </div>
                    ))
                  )}
                  {clientTab==="forms"&&(
 <div>
 <p style={{fontSize:9,color:"#7A716A",marginBottom:6}}>שלחי טופס לחתימה דיגיטלית</p>
 <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:12}}>
                        {FORM_TYPES.map(ft=>(
 <button key={ft.key} onClick={()=>handleSendForm(c,ft.key)} style={{background:pcTint,border:"1px solid #E8DED6",borderRadius:10,padding:"8px 11px",fontSize:10.5,color:"#1C1C1C",cursor:"pointer",fontFamily:"inherit",textAlign:"right"}}>{ft.label}</button>
                        ))}
 </div>
                      {cForms.length>0&&<>
 <p style={{fontSize:9,color:"#7A716A",marginBottom:5}}>טפסים קיימים</p>
                        {cForms.map(f=>(
 <div key={f.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:f.status==="signed"?"#F3FFF6":"#FFFAF7",borderRadius:10,marginBottom:4}}>
 <span style={{fontSize:12}}>{f.status==="signed"?"✓":"⏳"}</span>
 <p style={{flex:1,fontSize:10,color:"#1C1C1C"}}>{FORM_TYPES.find(ft=>ft.key===f.form_type)?.label||f.form_type}</p>
 <span style={{fontSize:8,color:f.status==="signed"?"#7BAE7F":"#FF9800"}}>{f.status==="signed"?"נחתם":"ממתין"}</span>
 </div>
                        ))}
 </>}
 </div>
                  )}
                {clientTab==="beforeafter"&&(
 <div>
 {(()=>{
 let beforeFile=null, afterFile=null, taVal="", noteVal="";
 return(
 <div style={{background:pcTint,borderRadius:12,padding:"12px",marginBottom:14}}>
 <p style={{fontSize:10,color:"#7A716A",fontWeight:600,marginBottom:8}}>הוספת תמונות לפני/אחרי</p>
 <div style={{display:"flex",gap:8,marginBottom:8}}>
 <label style={{flex:1,padding:"22px 0",background:"#fff",border:`1px dashed ${pc}`,borderRadius:10,textAlign:"center",fontSize:10.5,color:pc,cursor:"pointer"}} id="ba-before-lbl">
 לפני
 <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{beforeFile=e.target.files?.[0]||null;const l=document.getElementById("ba-before-lbl");if(l&&beforeFile)l.style.borderStyle="solid";}}/>
 </label>
 <label style={{flex:1,padding:"22px 0",background:"#fff",border:`1px dashed ${pc}`,borderRadius:10,textAlign:"center",fontSize:10.5,color:pc,cursor:"pointer"}} id="ba-after-lbl">
 אחרי
 <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{afterFile=e.target.files?.[0]||null;const l=document.getElementById("ba-after-lbl");if(l&&afterFile)l.style.borderStyle="solid";}}/>
 </label>
 </div>
 <input placeholder="שם הטיפול (לא חובה)" onChange={e=>{taVal=e.target.value;}} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:10,padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#fff",marginBottom:6,boxSizing:"border-box"}}/>
 <input placeholder="הערה (לא חובה)" onChange={e=>{noteVal=e.target.value;}} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:10,padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#fff",marginBottom:8,boxSizing:"border-box"}}/>
 <button disabled={photoUploading} onClick={()=>uploadClientPhoto(beforeFile,afterFile,taVal,noteVal,c.id)} className="primary-btn" style={{width:"100%",padding:"10px 0",background:pcGrad,color:"#fff",fontSize:12}}>{photoUploading?"מעלה...":"שמירת התמונות"}</button>
 </div>
 );
 })()}
 {clientPhotos.length===0?<p style={{fontSize:10,color:"#B8AFA0",textAlign:"center",marginTop:8}}>אין תמונות לפני/אחרי עדיין</p>
 :clientPhotos.map(ph=>(
 <div key={ph.id} style={{background:"#fff",border:"1px solid #E8DED6",borderRadius:12,padding:"10px",marginBottom:8}}>
 {(ph.treatment||ph.note)&&<p style={{fontSize:10.5,fontWeight:600,color:"#1C1C1C",marginBottom:6}}>{ph.treatment}{ph.treatment&&ph.note?" · ":""}<span style={{fontWeight:400,color:"#7A716A"}}>{ph.note}</span></p>}
 <div style={{display:"flex",gap:6}}>
 <div style={{flex:1,textAlign:"center"}}>
 <p style={{fontSize:8.5,color:"#7A716A",marginBottom:3}}>לפני</p>
 {ph.before_url?<img alt="תמונת לפני הטיפול" src={ph.before_url} style={{width:"100%",borderRadius:8,display:"block"}}/>:<div style={{padding:"24px 0",background:pcTint,borderRadius:8,fontSize:9,color:"#B8AFA0"}}>—</div>}
 </div>
 <div style={{flex:1,textAlign:"center"}}>
 <p style={{fontSize:8.5,color:"#7A716A",marginBottom:3}}>אחרי</p>
 {ph.after_url?<img alt="תמונת אחרי הטיפול" src={ph.after_url} style={{width:"100%",borderRadius:8,display:"block"}}/>:<div style={{padding:"24px 0",background:pcTint,borderRadius:8,fontSize:9,color:"#B8AFA0"}}>—</div>}
 </div>
 </div>
 <p style={{fontSize:8,color:"#B8AFA0",marginTop:5,textAlign:"left"}}>{new Date(ph.created_at).toLocaleDateString("he-IL")}</p>
 </div>
 ))}
 </div>
                  )}
                  {clientTab==="images"&&(
 <div>
 <label style={{display:"block",background:pcTint,border:`1px dashed ${pc}`,borderRadius:12,padding:"14px 0",textAlign:"center",fontSize:11,color:pc,cursor:"pointer",marginBottom:10}}> {uploading?"מעלה...":"העלי תמונה"}
 <input type="file" accept="image/*" onChange={e=>handleUploadImage(e,c)} style={{display:"none"}} disabled={uploading}/>
 </label>
 <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                        {(c.images||[]).map((img,i)=>(
 <div key={i} style={{position:"relative",paddingBottom:"100%",borderRadius:10,overflow:"hidden",background:pcTint}}>
 <img alt="" src={img} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>
 <button onClick={()=>handleDeleteImage(c,img)} style={{position:"absolute",top:3,left:3,background:"rgba(0,0,0,0.45)",border:"none",borderRadius:"50%",width:20,height:20,color:"#fff",fontSize:9,cursor:"pointer"}}>✕</button>
 </div>
                        ))}
 </div>
                      {(!c.images||c.images.length===0)&&<p style={{fontSize:10,color:"#B8AFA0",textAlign:"center",marginTop:8}}>אין תמונות עדיין</p>}
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
 {viewScan?.image_url&&<img alt="תמונת סריקת עור" src={viewScan.image_url} style={{width:"100%",maxHeight:200,objectFit:"cover",borderRadius:14,marginBottom:14}}/>}
 <div style={{textAlign:"center",marginBottom:14}}>
 <div style={{width:90,height:90,borderRadius:"50%",margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"center",border:`6px solid ${SR.score>=75?"#388E3C":SR.score>=50?"#E8920C":pc}`}}>
 <span style={{fontSize:30,fontWeight:800,color:SR.score>=75?"#388E3C":SR.score>=50?"#E8920C":pc}}>{SR.score}</span>
 </div>
 <p className="serif" style={{fontSize:16,fontWeight:600,color:"#1C1C1C",marginTop:10}}>{SR.skin_type}</p>
 </div>
 {SR.summary&&<p style={{fontSize:12.5,color:"#3A2A30",lineHeight:1.6,textAlign:"center",marginBottom:14}}>{SR.summary}</p>}
 {SR.concerns?.length>0&&(
 <div style={{marginBottom:12}}>
 <p style={{fontSize:12,fontWeight:700,color:"#1C1C1C",marginBottom:6}}>ממצאים</p>
 {SR.concerns.map((c,i)=>(<p key={i} style={{fontSize:11.5,color:"#7A716A",marginBottom:3}}>• {c}</p>))}
 </div>
 )}
 {SR.clinical_treatment&&(
 <div style={{background:pcTint,borderRadius:14,padding:"12px 16px",marginBottom:12}}>
 <p style={{fontSize:10,color:"#7A716A",marginBottom:2}}>טיפול מומלץ</p>
 <p style={{fontSize:14,fontWeight:700,color:pc}}>{SR.clinical_treatment}</p>
 {SR.matched_service&&<p style={{fontSize:11,color:"#7A716A",marginTop:2}}>אצלך: {SR.matched_service}</p>}
 </div>
 )}
 {SR.clinic_plan&&(
 <div style={{background:"#fff",borderRadius:14,padding:"12px 16px",marginBottom:12,border:"1.5px solid #E8DED6"}}>
 <p style={{fontSize:12,fontWeight:700,color:pc,marginBottom:6}}>✦ תכנית טיפול בקליניקה</p>
 {SR.clinic_plan.treatment_type&&<p style={{fontSize:11.5,color:"#1C1C1C",fontWeight:600,marginBottom:3}}>{SR.clinic_plan.treatment_type}</p>}
 {SR.clinic_plan.sessions&&<p style={{fontSize:11,color:"#7A716A",marginBottom:6}}>{SR.clinic_plan.sessions}</p>}
 {SR.clinic_plan.steps?.length>0&&SR.clinic_plan.steps.map((s,i)=>(<p key={i} style={{fontSize:11,color:"#4A3A52",lineHeight:1.5,marginBottom:2}}>• {s}</p>))}
 {SR.clinic_plan.expected_results&&<p style={{fontSize:10.5,color:"#388E3C",marginTop:6}}>תוצאה צפויה: {SR.clinic_plan.expected_results}</p>}
 </div>
 )}
 {SR.home_plan&&(
 <div style={{background:pcTint,borderRadius:14,padding:"12px 16px",marginBottom:12}}>
 <p style={{fontSize:12,fontWeight:700,color:pc,marginBottom:6}}>✦ תכנית טיפוח לבית</p>
 {SR.home_plan.summary&&<p style={{fontSize:11,color:"#4A3A52",lineHeight:1.5,marginBottom:6}}>{SR.home_plan.summary}</p>}
 {SR.home_plan.products?.length>0&&SR.home_plan.products.map((p,i)=>(<p key={i} style={{fontSize:11,color:"#4A3A52",lineHeight:1.5,marginBottom:2}}>• {p}</p>))}
 {SR.home_plan.tips?.length>0&&SR.home_plan.tips.map((t,i)=>(<p key={i} style={{fontSize:10.5,color:"#7A716A",lineHeight:1.5,marginTop:i===0?6:2}}>טיפ: {t}</p>))}
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
 <button onClick={closeModal} className="primary-btn" style={{width:"100%",padding:"12px 0",background:pcGrad,color:"#fff",fontSize:13}}>סגירה ✓</button>
 {!viewScan&&<p style={{fontSize:9.5,color:"#B8AFA0",textAlign:"center",marginTop:8}}>הסריקה נשמרה לכרטיס הלקוחה</p>}
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
 <div style={{background:`linear-gradient(135deg,${pc2} 0%,${pc} 100%)`,padding:"22px 22px 18px",color:"#fff",position:"relative"}}>
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
                    {l.phone&&<a href={waLink(l.phone)} target="_blank" rel="noreferrer" style={{flex:1,background:"#fff",color:pc,borderRadius:20,padding:"8px 0",fontSize:11,fontWeight:700,textAlign:"center",textDecoration:"none"}}>וואטסאפ</a>}
 <button onClick={()=>openEditLead(l)} style={{flex:1,background:"rgba(255,255,255,0.25)",color:"#fff",border:"none",borderRadius:20,padding:"8px 0",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✎ עריכה</button>
 </div>
 </div>
 <div style={{padding:"16px 22px"}}>
 <p style={{fontSize:9,color:"#7A716A",marginBottom:5,fontWeight:600}}>סטטוס</p>
 <div style={{display:"flex",gap:3,flexWrap:"wrap",marginBottom:16}}>
                    {Object.entries(LEAD_STATUSES).map(([key,s])=>(
 <button key={key} onClick={()=>handleUpdateLeadStatus(l,key)} style={{padding:"6px 10px",border:"1px solid",borderColor:l.status===key?s.color:"#E8DED6",borderRadius:20,background:l.status===key?s.bg:pcTint,color:l.status===key?s.color:"#7A716A",fontSize:9.5,cursor:"pointer",fontFamily:"inherit",fontWeight:l.status===key?700:400}}>{s.label}</button>
                    ))}
 </div>
                  {l.service_interest&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F7F0F3",fontSize:11.5}}><span style={{color:"#7A716A"}}>תחום עניין</span><span style={{fontWeight:600}}>{l.service_interest}</span></div>}
                  {l.created_at&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F7F0F3",fontSize:11.5}}><span style={{color:"#7A716A"}}>נוצר</span><span>{l.created_at.slice(0,10)}</span></div>}
 <div style={{marginTop:12}}>
 <p style={{fontSize:9,color:"#7A716A",marginBottom:4,fontWeight:600}}>תזכורת מעקב</p>
 <input type="date" value={l.reminder_date||""} onChange={e=>handleSetReminder(l,e.target.value)} style={{width:"100%",border:"1px solid #E8DED6",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",background:pcTint}}/>
 </div>
                  {l.notes&&<div style={{marginTop:12,padding:"9px 11px",background:pcTint,borderRadius:10}}><p style={{color:"#7A716A",fontWeight:700,fontSize:9,marginBottom:2}}>הערות</p><p style={{fontSize:11}}>{l.notes}</p></div>}
                  {l.status!=="closed"&&l.status!=="lost"&&(
 <button onClick={()=>handleConvertLead(l)} style={{width:"100%",marginTop:16,background:"#7BAE7F",color:"#fff",border:"none",borderRadius:24,padding:"12px 0",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✓ המירי ללקוחה רשומה</button>
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
