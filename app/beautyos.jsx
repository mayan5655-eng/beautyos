"use client";
import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const DEFAULT_SERVICES = [
  {name:"טיפול פנים",price:250,duration:60,color:"#F4A7B9",active:true},
  {name:"הסרת שיער",price:180,duration:45,color:"#A7C4F4",active:true},
  {name:"עיצוב גבות",price:80,duration:30,color:"#B5EAD7",active:true},
  {name:"מניקור",price:120,duration:45,color:"#FFDAC1",active:true},
  {name:"פדיקור",price:150,duration:60,color:"#E2CFEA",active:true},
  {name:"לק ג'ל",price:160,duration:60,color:"#FFF1BA",active:true},
  {name:"בוטוקס",price:800,duration:45,color:"#F9C6D0",active:true},
  {name:"פילינג",price:350,duration:60,color:"#C6EEF9",active:true},
  {name:"טיפול פלזמה",price:600,duration:60,color:"#E8D5F5",active:true},
  {name:"מכשור מתקדם",price:400,duration:60,color:"#D5F5E3",active:true},
];

const HOURS_ALL = ["07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"];
const DAYS_HE = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
const MONTHS_HE = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const SKIN_TYPES = ["יבש","שמן","מעורב","רגיש","נורמלי","אסתתי"];
const STATUS_COLORS = {"VIP":"#FFF1BA","active":"#B5EAD7","cold":"#A7C4F4","hot":"#F4A7B9"};
const STATUS_LABELS = {"VIP":"⭐ VIP","active":"✓ פעילה","cold":"❄️ קרה","hot":"🔥 חמה"};
const FORM_TYPES = [
  {key:"general",label:"📋 הצהרת בריאות כללית"},
  {key:"plasma",label:"⚡ טיפול פלזמה"},
  {key:"device",label:"🔬 מכשור מתקדם"},
  {key:"laser",label:"✨ הסרת שיער בלייזר"},
  {key:"peel",label:"🌿 פילינג כימי"},
];
const LEAD_SOURCES = ["פייסבוק","אינסטגרם","גוגל","טיקטוק","המלצה","הליכה ברחוב","אחר"];
const LEAD_STATUSES = {
  "new":       {label:"🆕 חדש",         color:"#5580C4",bg:"#EBF3FF"},
  "contacted": {label:"📞 יצרתי קשר",  color:"#F57C00",bg:"#FFF3E0"},
  "scheduled": {label:"📅 נקבע תור",   color:"#388E3C",bg:"#E8F5E9"},
  "closed":    {label:"✅ נסגר",        color:"#7B1FA2",bg:"#F3E5F5"},
  "lost":      {label:"❌ לא רלוונטי", color:"#C62828",bg:"#FEEBEE"},
};
const SOURCE_ICONS = {"פייסבוק":"📘","אינסטגרם":"📸","גוגל":"🔍","טיקטוק":"🎵","המלצה":"🤝","הליכה ברחוב":"🚶","אחר":"📌"};

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

const emptyClient = {name:"",phone:"",birthday:"",skinType:"",allergies:"",medical:"",notes:"",status:"active"};
const emptyLead   = {name:"",phone:"",source:"פייסבוק",service_interest:"",status:"new",notes:"",reminder_date:""};

export default function BeautyOS() {
  const [appointments, setAppointments] = useState([]);
  const [clients,      setClients]      = useState([]);
  const [forms,        setForms]        = useState([]);
  const [leads,        setLeads]        = useState([]);
  const [services,     setServices]     = useState(DEFAULT_SERVICES);
  const [settings,     setSettings]     = useState({
    business_name:"BeautyOS", therapist_name:"רונית",
    primary_color:"#D4945A", working_hours_start:8, working_hours_end:19
  });
  const [weekStart,        setWeekStart]        = useState(new Date());
  const [showModal,        setShowModal]        = useState(false);
  const [showClientModal,  setShowClientModal]  = useState(false);
  const [showLeadModal,    setShowLeadModal]    = useState(false);
  const [showSettings,     setShowSettings]     = useState(false);
  const [editingClient,    setEditingClient]    = useState(null);
  const [editingLead,      setEditingLead]      = useState(null);
  const [selectedClient,   setSelectedClient]   = useState(null);
  const [selectedLead,     setSelectedLead]     = useState(null);
  const [activeTab,        setActiveTab]        = useState("dashboard");
  const [clientTab,        setClientTab]        = useState("info");
  const [settingsTab,      setSettingsTab]      = useState("general");
  const [leadFilter,       setLeadFilter]       = useState("all");
  const [leadSearch,       setLeadSearch]       = useState("");
  const [leadSourceFilter, setLeadSourceFilter] = useState("all");
  const [hoveredAppt,      setHoveredAppt]      = useState(null);
  const [loading,          setLoading]          = useState(true);
  const [uploading,        setUploading]        = useState(false);
  const [searchQuery,      setSearchQuery]      = useState("");
  const [filterStatus,     setFilterStatus]     = useState("all");
  const [filterSkin,       setFilterSkin]       = useState("all");
  const [newAppt,  setNewAppt]  = useState({clientId:"",name:"",service:"",duration:60,date:formatDate(new Date()),hour:9,price:0});
  const [newClient,setNewClient]= useState(emptyClient);
  const [newLead,  setNewLead]  = useState(emptyLead);
  const [apptNote, setApptNote] = useState("");
  const [editSettings, setEditSettings] = useState(null);
  const [newService, setNewService] = useState({name:"",price:0,duration:60,color:"#F4A7B9",active:true});
  const [showNewService, setShowNewService] = useState(false);

  const weekDates = getWeekDates(weekStart);
  const now       = new Date();
  const today     = formatDate(now);
  const tomorrow  = formatDate(new Date(now.getTime()+86400000));
  const thisMonth = now.getMonth();
  const thisYear  = now.getFullYear();
  const lastMonth = thisMonth===0?11:thisMonth-1;
  const lastMonthYear = thisMonth===0?thisYear-1:thisYear;
  const pc = settings.primary_color || "#D4945A";

  const activeServices = services.filter(s=>s.active!==false);
  const workingHours = HOURS_ALL.slice(
    Math.max(settings.working_hours_start - 7, 0),
    Math.min(settings.working_hours_end   - 7, HOURS_ALL.length)
  );

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    const [a,c,f,l,sv,st] = await Promise.all([
      supabase.from("appointments").select("*"),
      supabase.from("clients").select("*"),
      supabase.from("forms").select("*"),
      supabase.from("leads").select("*"),
      supabase.from("service_prices").select("*"),
      supabase.from("settings").select("*"),
    ]);
    if(a.data)  setAppointments(a.data);
    if(c.data)  setClients(c.data);
    if(f.data)  setForms(f.data);
    if(l.data)  setLeads(l.data);
    if(sv.data && sv.data.length>0) setServices(sv.data);
    if(st.data && st.data.length>0) setSettings(st.data[0]);
    setLoading(false);
  };

  // ===== DASHBOARD =====
  const thisMonthAppts   = appointments.filter(a=>{if(!a.date)return false;const d=new Date(a.date);return d.getMonth()===thisMonth&&d.getFullYear()===thisYear;});
  const lastMonthAppts   = appointments.filter(a=>{if(!a.date)return false;const d=new Date(a.date);return d.getMonth()===lastMonth&&d.getFullYear()===lastMonthYear;});
  const thisMonthRevenue = thisMonthAppts.reduce((s,a)=>s+(Number(a.price)||0),0);
  const lastMonthRevenue = lastMonthAppts.reduce((s,a)=>s+(Number(a.price)||0),0);
  const todayAppts    = appointments.filter(a=>a.date===today);
  const tomorrowAppts = appointments.filter(a=>a.date===tomorrow);
  const weekAppts     = appointments.filter(a=>{
    if(!a.date)return false;
    const d=new Date(a.date),ws=new Date(weekStart),we=new Date(weekStart);
    we.setDate(we.getDate()+5);return d>=ws&&d<=we;
  });

  const getLastAppt  = (cid) => appointments.filter(a=>String(a.client_id)===String(cid)).sort((a,b)=>(b.date||"").localeCompare(a.date||""))[0];
  const getDaysSince = (cid) => {const l=getLastAppt(cid);if(!l?.date)return 999;return Math.floor((now-new Date(l.date))/(1000*60*60*24));};
  const activeClients= clients.filter(c=>getDaysSince(c.id)<=60);
  const coldClients  = clients.filter(c=>getDaysSince(c.id)>60);

  const serviceStats = activeServices.map(s=>({
    name:s.name,color:s.color,
    count:appointments.filter(a=>a.service===s.name).length,
    revenue:appointments.filter(a=>a.service===s.name).reduce((sum,a)=>sum+(Number(a.price)||0),0),
  })).sort((a,b)=>b.count-a.count);
  const topService = serviceStats[0];
  const maxCount   = Math.max(...serviceStats.map(s=>s.count),1);

  const monthlyData = Array.from({length:6},(_,i)=>{
    const d=new Date(now);d.setMonth(now.getMonth()-(5-i));
    const m=d.getMonth(),y=d.getFullYear();
    const appts=appointments.filter(a=>{if(!a.date)return false;const ad=new Date(a.date);return ad.getMonth()===m&&ad.getFullYear()===y;});
    return {month:MONTHS_HE[m].slice(0,3),count:appts.length,revenue:appts.reduce((s,a)=>s+(Number(a.price)||0),0)};
  });
  const maxBar = Math.max(...monthlyData.map(d=>d.count),1);

  const upcomingBirthdays = clients.filter(c=>{
    if(!c.birthday)return false;
    try{const b=new Date(c.birthday);const bd=new Date(now.getFullYear(),b.getMonth(),b.getDate());if(bd<now)bd.setFullYear(now.getFullYear()+1);return Math.floor((bd-now)/(1000*60*60*24))<=30&&Math.floor((bd-now)/(1000*60*60*24))>=0;}catch{return false;}
  }).sort((a,b)=>{
    const days=(c)=>{const bx=new Date(c.birthday);const bd=new Date(now.getFullYear(),bx.getMonth(),bx.getDate());if(bd<now)bd.setFullYear(now.getFullYear()+1);return Math.floor((bd-now)/(1000*60*60*24));};
    return days(a)-days(b);
  });

  // ===== LEADS =====
  const newLeadsCount       = leads.filter(l=>l.status==="new").length;
  const thisMonthLeads      = leads.filter(l=>{if(!l.created_at)return false;const d=new Date(l.created_at);return d.getMonth()===thisMonth&&d.getFullYear()===thisYear;});
  const convertedLeads      = leads.filter(l=>l.status==="closed");
  const conversionRate      = leads.length>0?Math.round((convertedLeads.length/leads.length)*100):0;
  const leadsWithReminders  = leads.filter(l=>l.reminder_date&&l.reminder_date<=tomorrow&&l.status!=="closed"&&l.status!=="lost");

  const sourceStats = LEAD_SOURCES.map(s=>({
    source:s,icon:SOURCE_ICONS[s],
    total:leads.filter(l=>l.source===s).length,
    converted:leads.filter(l=>l.source===s&&l.status==="closed").length,
  })).filter(s=>s.total>0).sort((a,b)=>b.total-a.total);

  const filteredLeads = leads.filter(l=>{
    const matchSearch = !leadSearch||l.name?.includes(leadSearch)||l.phone?.includes(leadSearch);
    const matchFilter = leadFilter==="all"||l.status===leadFilter;
    const matchSource = leadSourceFilter==="all"||l.source===leadSourceFilter;
    return matchSearch&&matchFilter&&matchSource;
  }).sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||""));

  const filteredClients = clients.filter(c=>{
    const matchSearch = !searchQuery||c.name?.includes(searchQuery)||c.phone?.includes(searchQuery);
    const matchStatus = filterStatus==="all"||c.status===filterStatus||(filterStatus==="cold"&&getDaysSince(c.id)>60)||(filterStatus==="active"&&getDaysSince(c.id)<=60);
    const matchSkin   = filterSkin==="all"||c.skinType===filterSkin;
    return matchSearch&&matchStatus&&matchSkin;
  });

  const getAppt = (date,hour) => appointments.find(a=>a.date===formatDate(date)&&Number(a.hour)===Number(hour));

  // ===== HANDLERS =====
  const handleSlotClick = (date,hour) => {
    if(getAppt(date,hour))return;
    const svc = activeServices[0];
    setNewAppt({clientId:"",name:"",service:svc?.name||"",duration:svc?.duration||60,date:formatDate(date),hour,price:svc?.price||0});
    setApptNote("");setShowModal(true);
  };

  const handleClientSelect = (clientId) => {
    const c=clients.find(c=>String(c.id)===String(clientId));
    setNewAppt(prev=>({...prev,clientId,name:c?c.name:""}));
  };

  const handleServiceSelect = (svcName) => {
    const svc = activeServices.find(s=>s.name===svcName);
    setNewAppt(prev=>({...prev,service:svcName,duration:svc?.duration||60,price:svc?.price||0}));
  };

  const handleSave = async () => {
    if(!newAppt.name.trim()){alert("נא להזין שם לקוחה");return;}
    let clientId=newAppt.clientId;
    if(!clientId){
      const {data:nc,error:ce}=await supabase.from("clients").insert([{name:newAppt.name,phone:"",skinType:"",notes:"",status:"active"}]).select();
      if(ce){alert("שגיאה: "+ce.message);return;}
      if(nc?.[0]){clientId=nc[0].id;setClients(prev=>[...prev,nc[0]]);}
    }
    const svcColor = activeServices.find(s=>s.name===newAppt.service)?.color||"#F4A7B9";
    const appt={date:newAppt.date,hour:Number(newAppt.hour),name:newAppt.name,service:newAppt.service,duration:Number(newAppt.duration),color:svcColor,client_id:clientId,note:apptNote,price:Number(newAppt.price)||0};
    const {data,error}=await supabase.from("appointments").insert([appt]).select();
    if(error){alert("שגיאה: "+error.message);return;}
    if(data)setAppointments(prev=>[...prev,data[0]]);
    setShowModal(false);setApptNote("");
  };

  const handleDelete = async (id) => {
    await supabase.from("appointments").delete().eq("id",id);
    setAppointments(prev=>prev.filter(a=>a.id!==id));
    setHoveredAppt(null);
  };

  const handleSaveClient = async () => {
    if(!newClient.name.trim()){alert("נא להזין שם");return;}
    if(editingClient){
      const {data,error}=await supabase.from("clients").update(newClient).eq("id",editingClient.id).select();
      if(error){alert("שגיאה: "+error.message);return;}
      if(data){setClients(prev=>prev.map(c=>c.id===editingClient.id?data[0]:c));setSelectedClient(data[0]);}
    }else{
      const {data,error}=await supabase.from("clients").insert([newClient]).select();
      if(error){alert("שגיאה: "+error.message);return;}
      if(data)setClients(prev=>[...prev,data[0]]);
    }
    setShowClientModal(false);setEditingClient(null);setNewClient(emptyClient);
  };

  const handleSaveLead = async () => {
    if(!newLead.name.trim()){alert("נא להזין שם");return;}
    if(editingLead){
      const {data,error}=await supabase.from("leads").update(newLead).eq("id",editingLead.id).select();
      if(error){alert("שגיאה: "+error.message);return;}
      if(data){setLeads(prev=>prev.map(l=>l.id===editingLead.id?data[0]:l));setSelectedLead(data[0]);}
    }else{
      const {data,error}=await supabase.from("leads").insert([newLead]).select();
      if(error){alert("שגיאה: "+error.message);return;}
      if(data)setLeads(prev=>[...prev,data[0]]);
    }
    setShowLeadModal(false);setEditingLead(null);setNewLead(emptyLead);
  };

  const handleUpdateLeadStatus = async (lead,status) => {
    const {data,error}=await supabase.from("leads").update({status}).eq("id",lead.id).select();
    if(error){alert("שגיאה: "+error.message);return;}
    if(data){setLeads(prev=>prev.map(l=>l.id===lead.id?data[0]:l));setSelectedLead(data[0]);}
  };

  const handleConvertLead = async (lead) => {
    const {data:cd,error:ce}=await supabase.from("clients").insert([{
      name:lead.name,phone:lead.phone||"",skinType:"",
      notes:`הומר מליד — מקור: ${lead.source}${lead.service_interest?"\nתחום עניין: "+lead.service_interest:""}${lead.notes?"\n"+lead.notes:""}`,
      status:"active"
    }]).select();
    if(ce){alert("שגיאה: "+ce.message);return;}
    const {data:ld}=await supabase.from("leads").update({status:"closed",converted_at:new Date().toISOString(),client_id:cd[0].id}).eq("id",lead.id).select();
    setClients(prev=>[...prev,cd[0]]);
    if(ld)setLeads(prev=>prev.map(l=>l.id===lead.id?ld[0]:l));
    setSelectedLead(null);
    alert(`✅ ${lead.name} הומרה ללקוחה!`);
  };

  const handleSetReminder = async (lead,date) => {
    const {data,error}=await supabase.from("leads").update({reminder_date:date}).eq("id",lead.id).select();
    if(error){alert("שגיאה: "+error.message);return;}
    if(data){setLeads(prev=>prev.map(l=>l.id===lead.id?data[0]:l));setSelectedLead(data[0]);}
  };

  const handleUploadImage = async (e,client) => {
    const file=e.target.files[0];if(!file)return;
    setUploading(true);
    const fileName=`${client.id}/${Date.now()}_${file.name}`;
    const {error:ue}=await supabase.storage.from("client-images").upload(fileName,file);
    if(ue){alert("שגיאה: "+ue.message);setUploading(false);return;}
    const {data:urlData}=supabase.storage.from("client-images").getPublicUrl(fileName);
    const newImages=[...(client.images||[]),urlData.publicUrl];
    const {data,error}=await supabase.from("clients").update({images:newImages}).eq("id",client.id).select();
    if(error){alert("שגיאה: "+error.message);setUploading(false);return;}
    if(data){setClients(prev=>prev.map(c=>c.id===client.id?data[0]:c));setSelectedClient(data[0]);}
    setUploading(false);
  };

  const handleDeleteImage = async (client,imageUrl) => {
    const newImages=(client.images||[]).filter(img=>img!==imageUrl);
    const {data,error}=await supabase.from("clients").update({images:newImages}).eq("id",client.id).select();
    if(error){alert("שגיאה: "+error.message);return;}
    if(data){setClients(prev=>prev.map(c=>c.id===client.id?data[0]:c));setSelectedClient(data[0]);}
  };

  const handleSendForm = async (client,formType) => {
    const {data,error}=await supabase.from("forms").insert([{client_id:client.id,client_name:client.name,form_type:formType,status:"pending"}]).select();
    if(error){alert("שגיאה: "+error.message);return;}
    setForms(prev=>[...prev,data[0]]);
    const link=`${window.location.origin}/form?id=${data[0].id}`;
    navigator.clipboard.writeText(link).catch(()=>{});
    alert(`הקישור הועתק!\nשלחי ללקוחה:\n${link}`);
  };

  const handleSaveSettings = async () => {
    if(settings.id){
      const {data,error}=await supabase.from("settings").update(editSettings).eq("id",settings.id).select();
      if(error){alert("שגיאה: "+error.message);return;}
      if(data)setSettings(data[0]);
    }else{
      const {data,error}=await supabase.from("settings").insert([editSettings]).select();
      if(error){alert("שגיאה: "+error.message);return;}
      if(data)setSettings(data[0]);
    }
    setEditSettings(null);
    alert("✅ ההגדרות נשמרו!");
  };

  const handleSaveService = async (svc, idx) => {
    if(svc.id){
      const {data,error}=await supabase.from("service_prices").update(svc).eq("id",svc.id).select();
      if(error){alert("שגיאה: "+error.message);return;}
      if(data)setServices(prev=>prev.map((s,i)=>i===idx?data[0]:s));
    }else{
      const {data,error}=await supabase.from("service_prices").insert([svc]).select();
      if(error){alert("שגיאה: "+error.message);return;}
      if(data)setServices(prev=>[...prev,data[0]]);
    }
  };

  const handleAddService = async () => {
    if(!newService.name.trim()){alert("נא להזין שם שירות");return;}
    const {data,error}=await supabase.from("service_prices").insert([newService]).select();
    if(error){alert("שגיאה: "+error.message);return;}
    if(data){setServices(prev=>[...prev,data[0]]);setNewService({name:"",price:0,duration:60,color:"#F4A7B9",active:true});setShowNewService(false);}
  };

  const handleExportCSV = () => {
    const rows = [["שם","טלפון","שירות","תאריך","שעה","מחיר","הערה"]];
    appointments.forEach(a=>{
      rows.push([a.name,clients.find(c=>String(c.id)===String(a.client_id))?.phone||"",a.service,a.date,a.hour,a.price||0,a.note||""]);
    });
    const csv = rows.map(r=>r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url;a.download=`beautyos_export_${today}.csv`;a.click();
    URL.revokeObjectURL(url);
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

  const getClientAppts = (cid) => appointments.filter(a=>String(a.client_id)===String(cid));
  const getClientForms = (cid) => forms.filter(f=>String(f.client_id)===String(cid));

  if(loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontSize:18,fontFamily:"Heebo"}}>💎 טוען {settings.business_name}...</div>;

  // ===== RENDER =====
  return (
    <div dir="rtl" style={{fontFamily:"'Heebo','Assistant',sans-serif",background:"#FAF7F5",minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      <style>{`
        .slot:hover{background:#F0EAE6!important;cursor:pointer}
        .appt-card{transition:transform 0.15s}
        .appt-card:hover{transform:scale(1.02)}
        .client-row:hover{background:#FAF7F5!important;cursor:pointer}
        .stat-card{transition:all 0.2s}
        .stat-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,0.08)}
        .lead-row:hover{background:#FAF7F5!important;cursor:pointer}
        .wa-btn{background:#25D366;color:#fff;border:none;border-radius:8px;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:5px;text-decoration:none}
        .wa-btn:hover{background:#1ea355}
        .call-btn{background:#5580C4;color:#fff;border:none;border-radius:8px;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:5px;text-decoration:none}
      `}</style>

      {/* ===== HEADER ===== */}
      <header style={{background:"#2C1A1A",color:"#FAF7F5",padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",height:58,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>💎</span>
          <span style={{fontWeight:800,fontSize:17}}>{settings.business_name}</span>
          <span style={{background:pc,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:20}}>CRM</span>
          {newLeadsCount>0&&<span onClick={()=>setActiveTab("leads")} style={{background:"#F44336",color:"#fff",fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:20,cursor:"pointer"}}>🆕 {newLeadsCount}</span>}
          {leadsWithReminders.length>0&&<span onClick={()=>setActiveTab("leads")} style={{background:"#FF9800",color:"#fff",fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:20,cursor:"pointer"}}>🔔 {leadsWithReminders.length}</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {upcomingBirthdays[0]&&<span style={{fontSize:11,color:"#FFF1BA"}}>🎂 {upcomingBirthdays[0].name}</span>}
          <span style={{fontSize:12,color:"#C4A882"}}>שלום, {settings.therapist_name} 👋</span>
          <button onClick={()=>{setEditSettings({...settings});setShowSettings(true);}} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:7,padding:"5px 9px",color:"#fff",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>⚙️</button>
          <button onClick={handleExportCSV} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:7,padding:"5px 9px",color:"#fff",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>📊 ייצוא</button>
        </div>
      </header>

      {/* ===== TABS ===== */}
      <div style={{background:"#fff",borderBottom:"1px solid #EEE8E2",display:"flex",padding:"0 14px",overflowX:"auto",flexShrink:0}}>
        {[
          {id:"dashboard",label:"📊 דשבורד"},
          {id:"calendar", label:"📅 יומן"},
          {id:"clients",  label:"👤 לקוחות"},
          {id:"leads",    label:`🎯 לידים${newLeadsCount>0?` (${newLeadsCount})`:""}`},
        ].map(tab=>(
          <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{background:"none",border:"none",padding:"11px 16px",fontSize:13,fontWeight:activeTab===tab.id?700:400,color:activeTab===tab.id?"#2C1A1A":"#888",borderBottom:activeTab===tab.id?`2.5px solid ${pc}`:"2.5px solid transparent",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{tab.label}</button>
        ))}
      </div>

      <div style={{display:"flex",flex:1,overflow:"hidden"}}>

        {/* ===== SIDEBAR ===== */}
        <aside style={{width:196,background:"#fff",borderLeft:"1px solid #EEE8E2",padding:"13px 11px",display:"flex",flexDirection:"column",gap:11,flexShrink:0,overflowY:"auto"}}>
          <div>
            <p style={{fontSize:10,fontWeight:700,color:"#999",marginBottom:6}}>היום ({todayAppts.length})</p>
            {todayAppts.length===0?<p style={{fontSize:11,color:"#BBB"}}>אין תורים</p>
              :todayAppts.sort((a,b)=>a.hour-b.hour).map(a=>(
                <div key={a.id} style={{background:a.color+"33",borderRight:`3px solid ${a.color}`,borderRadius:7,padding:"5px 7px",marginBottom:4}}>
                  <p style={{fontSize:11,fontWeight:600,color:"#2C1A1A"}}>{a.name}</p>
                  <p style={{fontSize:9,color:"#888"}}>{workingHours[Number(a.hour)-settings.working_hours_start]||a.hour+":00"} · {a.service}</p>
                  {a.price>0&&<p style={{fontSize:9,color:pc,fontWeight:600}}>₪{a.price}</p>}
                </div>
              ))}
          </div>
          {tomorrowAppts.length>0&&(
            <div>
              <p style={{fontSize:10,fontWeight:700,color:"#999",marginBottom:5}}>מחר ({tomorrowAppts.length})</p>
              {tomorrowAppts.slice(0,3).map(a=>(
                <div key={a.id} style={{background:"#FAF7F5",borderRight:"2px solid #EEE8E2",borderRadius:7,padding:"5px 7px",marginBottom:3}}>
                  <p style={{fontSize:11,fontWeight:600,color:"#2C1A1A"}}>{a.name}</p>
                  <p style={{fontSize:9,color:"#888"}}>{a.service}</p>
                </div>
              ))}
            </div>
          )}
          {leadsWithReminders.length>0&&(
            <div>
              <p style={{fontSize:10,fontWeight:700,color:"#FF9800",marginBottom:5}}>🔔 תזכורות לידים</p>
              {leadsWithReminders.map(l=>(
                <div key={l.id} onClick={()=>{setSelectedLead(l);setActiveTab("leads");}} style={{background:"#FFF3E0",borderRight:"2px solid #FF9800",borderRadius:7,padding:"5px 7px",marginBottom:3,cursor:"pointer"}}>
                  <p style={{fontSize:11,fontWeight:600,color:"#2C1A1A"}}>{l.name}</p>
                  <p style={{fontSize:9,color:"#888"}}>{l.reminder_date}</p>
                </div>
              ))}
            </div>
          )}
          {coldClients.slice(0,3).length>0&&(
            <div>
              <p style={{fontSize:10,fontWeight:700,color:"#999",marginBottom:4}}>❄️ לא חזרו</p>
              {coldClients.slice(0,3).map(c=>(
                <div key={c.id} onClick={()=>{setSelectedClient(c);setClientTab("info");}} style={{fontSize:10,color:"#5580C4",marginBottom:3,cursor:"pointer"}}>{c.name} ({getDaysSince(c.id)}י)</div>
              ))}
            </div>
          )}
          <button onClick={()=>{const svc=activeServices[0];setNewAppt({clientId:"",name:"",service:svc?.name||"",duration:svc?.duration||60,date:formatDate(new Date()),hour:settings.working_hours_start,price:svc?.price||0});setApptNote("");setShowModal(true);}}
            style={{background:"#2C1A1A",color:"#fff",border:"none",borderRadius:9,padding:"9px 11px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginTop:"auto"}}>
            + תור חדש
          </button>
        </aside>

        {/* ===== MAIN ===== */}
        <main style={{flex:1,overflow:"auto",padding:"16px 14px"}}>

          {/* ===== DASHBOARD ===== */}
          {activeTab==="dashboard"&&(<>
            <h2 style={{fontSize:15,fontWeight:800,color:"#2C1A1A",marginBottom:14}}>{MONTHS_HE[thisMonth]} {thisYear} — סקירה כללית</h2>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(128px,1fr))",gap:9,marginBottom:16}}>
              {[
                {label:"הכנסות החודש",value:`₪${thisMonthRevenue.toLocaleString()}`,sub:lastMonthRevenue>0?(thisMonthRevenue>=lastMonthRevenue?`↑ +₪${(thisMonthRevenue-lastMonthRevenue).toLocaleString()}`:`↓ -₪${(lastMonthRevenue-thisMonthRevenue).toLocaleString()}`):"",color:pc,bg:"#FFF8F3",icon:"💰"},
                {label:"תורים השבוע",value:weekAppts.length,sub:`${todayAppts.length} היום`,color:"#5580C4",bg:"#F3F6FF",icon:"📅"},
                {label:"לקוחות פעילות",value:activeClients.length,sub:`${coldClients.length} לא חזרו`,color:"#4CAF50",bg:"#F3FFF6",icon:"👥"},
                {label:"טיפול מוביל",value:topService?.count>0?topService.name.split(" ")[0]:"—",sub:topService?.count>0?`${topService.count} פעמים`:"",color:"#9C27B0",bg:"#FAF3FF",icon:"🏆"},
                {label:"לידים החודש",value:thisMonthLeads.length,sub:`${conversionRate}% המרה`,color:"#F44336",bg:"#FFF3F3",icon:"🎯"},
                {label:"טפסים חתומים",value:forms.filter(f=>f.status==="signed").length,sub:`${forms.filter(f=>f.status==="pending").length} ממתינים`,color:"#607D8B",bg:"#F3F6F8",icon:"📋"},
              ].map((s,i)=>(
                <div key={i} className="stat-card" style={{background:s.bg,borderRadius:11,padding:"13px 11px",border:`1px solid ${s.color}22`}}>
                  <div style={{fontSize:17,marginBottom:4}}>{s.icon}</div>
                  <p style={{fontSize:9,color:"#888",marginBottom:1}}>{s.label}</p>
                  <p style={{fontSize:18,fontWeight:800,color:s.color,lineHeight:1.1}}>{s.value}</p>
                  {s.sub&&<p style={{fontSize:9,color:"#888",marginTop:2}}>{s.sub}</p>}
                </div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1.5fr 1fr",gap:11,marginBottom:11}}>
              <div style={{background:"#fff",borderRadius:11,padding:16,border:"1px solid #EEE8E2"}}>
                <h3 style={{fontSize:12,fontWeight:700,color:"#2C1A1A",marginBottom:13}}>📈 תורים ב-6 חודשים אחרונים</h3>
                <div style={{display:"flex",alignItems:"flex-end",gap:6,height:95,marginBottom:5}}>
                  {monthlyData.map((d,i)=>(
                    <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                      <p style={{fontSize:8,color:"#888",fontWeight:600}}>{d.count||""}</p>
                      <div style={{width:"100%",background:i===5?pc:"#EEE8E2",borderRadius:"4px 4px 0 0",height:`${Math.max((d.count/maxBar)*85,2)}px`}}/>
                      <p style={{fontSize:8,color:i===5?pc:"#888",fontWeight:i===5?700:400}}>{d.month}</p>
                    </div>
                  ))}
                </div>
                <div style={{borderTop:"1px solid #EEE8E2",paddingTop:7,display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:10,color:"#888"}}>{thisMonthAppts.length} תורים</span>
                  <span style={{fontSize:10,color:pc,fontWeight:700}}>₪{thisMonthRevenue.toLocaleString()}</span>
                </div>
              </div>
              <div style={{background:"#fff",borderRadius:11,padding:16,border:"1px solid #EEE8E2"}}>
                <h3 style={{fontSize:12,fontWeight:700,color:"#2C1A1A",marginBottom:11}}>🏆 טיפולים נפוצים</h3>
                {serviceStats.filter(s=>s.count>0).slice(0,5).map((s,i)=>(
                  <div key={i} style={{marginBottom:7}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                      <span style={{fontSize:10,color:"#2C1A1A"}}>{s.name}</span>
                      <span style={{fontSize:10,fontWeight:700}}>{s.count}</span>
                    </div>
                    <div style={{background:"#EEE8E2",borderRadius:5,height:4}}>
                      <div style={{background:s.color,borderRadius:5,height:4,width:`${(s.count/maxCount)*100}%`}}/>
                    </div>
                  </div>
                ))}
                {serviceStats.filter(s=>s.count>0).length===0&&<p style={{color:"#BBB",fontSize:11}}>אין נתונים</p>}
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:11}}>
              <div style={{background:"#fff",borderRadius:11,padding:16,border:"1px solid #EEE8E2"}}>
                <h3 style={{fontSize:12,fontWeight:700,color:"#2C1A1A",marginBottom:11}}>🔔 תזכורות</h3>
                {tomorrowAppts.length>0&&(
                  <div style={{background:"#F3F6FF",borderRadius:8,padding:"7px 9px",marginBottom:7}}>
                    <p style={{fontSize:10,fontWeight:700,color:"#5580C4",marginBottom:2}}>📅 מחר — {tomorrowAppts.length} תורים</p>
                    {tomorrowAppts.slice(0,2).map(a=><p key={a.id} style={{fontSize:9,color:"#555"}}>{a.name}</p>)}
                  </div>
                )}
                {leadsWithReminders.map(l=>(
                  <div key={l.id} onClick={()=>{setSelectedLead(l);setActiveTab("leads");}} style={{background:"#FFF3E0",borderRadius:8,padding:"7px 9px",marginBottom:5,cursor:"pointer"}}>
                    <p style={{fontSize:10,fontWeight:700,color:"#FF9800"}}>🎯 {l.name}</p>
                    <p style={{fontSize:9,color:"#888"}}>{l.reminder_date}</p>
                  </div>
                ))}
                {tomorrowAppts.length===0&&leadsWithReminders.length===0&&<p style={{fontSize:10,color:"#BBB"}}>אין תזכורות</p>}
              </div>
              <div style={{background:"#fff",borderRadius:11,padding:16,border:"1px solid #EEE8E2"}}>
                <h3 style={{fontSize:12,fontWeight:700,color:"#2C1A1A",marginBottom:11}}>🎂 ימי הולדת קרובים</h3>
                {upcomingBirthdays.length===0?<p style={{fontSize:10,color:"#BBB"}}>אין ב-30 הימים הקרובים</p>
                  :upcomingBirthdays.slice(0,4).map(c=>{
                    const b=new Date(c.birthday);const bd=new Date(now.getFullYear(),b.getMonth(),b.getDate());if(bd<now)bd.setFullYear(now.getFullYear()+1);const days=Math.floor((bd-now)/(1000*60*60*24));
                    return(
                      <div key={c.id} onClick={()=>{setSelectedClient(c);setClientTab("info");}} className="client-row" style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,cursor:"pointer",padding:"3px 4px",borderRadius:5}}>
                        <span style={{fontSize:13}}>🎂</span>
                        <div><p style={{fontSize:11,fontWeight:600,color:"#2C1A1A"}}>{c.name}</p><p style={{fontSize:9,color:"#888"}}>{days===0?"היום! 🎉":days===1?"מחר":`${days} ימים`}</p></div>
                      </div>
                    );
                  })}
              </div>
              <div style={{background:"#fff",borderRadius:11,padding:16,border:"1px solid #EEE8E2"}}>
                <h3 style={{fontSize:12,fontWeight:700,color:"#2C1A1A",marginBottom:11}}>❄️ לא חזרו ({coldClients.length})</h3>
                {coldClients.length===0?<p style={{fontSize:10,color:"#4CAF50",fontWeight:600}}>כולן פעילות! 🎉</p>
                  :coldClients.slice(0,4).map(c=>(
                    <div key={c.id} onClick={()=>{setSelectedClient(c);setClientTab("info");}} className="client-row" style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,cursor:"pointer",padding:"3px 4px",borderRadius:5}}>
                      <div style={{width:24,height:24,borderRadius:"50%",background:"#A7C4F444",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,flexShrink:0}}>{c.name[0]}</div>
                      <div><p style={{fontSize:11,fontWeight:600,color:"#2C1A1A"}}>{c.name}</p><p style={{fontSize:9,color:"#888"}}>{getDaysSince(c.id)} ימים</p></div>
                    </div>
                  ))}
              </div>
            </div>
          </>)}

          {/* ===== CALENDAR ===== */}
          {activeTab==="calendar"&&(<>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <h2 style={{fontSize:15,fontWeight:800,color:"#2C1A1A"}}>{formatDateHe(weekDates[0])} – {formatDateHe(weekDates[5])}</h2>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>{const d=new Date(weekStart);d.setDate(d.getDate()-6);setWeekStart(d);}} style={{background:"#fff",border:"1px solid #EEE8E2",borderRadius:7,padding:"5px 10px",cursor:"pointer",fontSize:12}}>← קודם</button>
                <button onClick={()=>setWeekStart(new Date())} style={{background:"#FAF7F5",border:"1px solid #EEE8E2",borderRadius:7,padding:"5px 10px",cursor:"pointer",fontSize:12}}>היום</button>
                <button onClick={()=>{const d=new Date(weekStart);d.setDate(d.getDate()+6);setWeekStart(d);}} style={{background:"#fff",border:"1px solid #EEE8E2",borderRadius:7,padding:"5px 10px",cursor:"pointer",fontSize:12}}>הבא →</button>
              </div>
            </div>
            <div style={{background:"#fff",borderRadius:11,overflow:"hidden",border:"1px solid #EEE8E2"}}>
              <div style={{display:"grid",gridTemplateColumns:"52px repeat(6,1fr)",borderBottom:"1px solid #EEE8E2",background:"#FAF7F5"}}>
                <div/>
                {weekDates.map((d,i)=>{
                  const isToday=formatDate(d)===today;
                  return(
                    <div key={i} style={{padding:"8px 5px",textAlign:"center",borderRight:i<5?"1px solid #EEE8E2":"none"}}>
                      <p style={{fontSize:9,color:"#999"}}>{DAYS_HE[d.getDay()]}</p>
                      <p style={{fontSize:15,fontWeight:800,color:isToday?pc:"#2C1A1A"}}>{d.getDate()}</p>
                      <p style={{fontSize:8,color:"#BBB"}}>{d.getMonth()+1}/{d.getFullYear().toString().slice(2)}</p>
                    </div>
                  );
                })}
              </div>
              {workingHours.map((hour,hi)=>(
                <div key={hour} style={{display:"grid",gridTemplateColumns:"52px repeat(6,1fr)",borderBottom:hi<workingHours.length-1?"1px solid #F0EAE6":"none",minHeight:56}}>
                  <div style={{padding:"5px 4px 0",fontSize:9,color:"#BBB",textAlign:"center",borderLeft:"1px solid #EEE8E2"}}>{hour}</div>
                  {weekDates.map((date,di)=>{
                    const appt=getAppt(date,settings.working_hours_start+hi);
                    return(
                      <div key={di} className={!appt?"slot":""} onClick={()=>handleSlotClick(date,settings.working_hours_start+hi)} style={{borderRight:di<5?"1px solid #F0EAE6":"none",position:"relative",padding:2,minHeight:56}}>
                        {appt&&(
                          <div className="appt-card" onMouseEnter={()=>setHoveredAppt(appt.id)} onMouseLeave={()=>setHoveredAppt(null)} style={{background:appt.color,borderRadius:6,padding:"4px 6px",height:"calc(100% - 2px)",position:"relative"}}>
                            <p style={{fontSize:10,fontWeight:700,color:"#2C1A1A"}}>{appt.name}</p>
                            <p style={{fontSize:8,color:"#555"}}>{appt.service}</p>
                            {appt.price>0&&<p style={{fontSize:8,color:"#555",fontWeight:700}}>₪{appt.price}</p>}
                            {appt.client_id&&<button onClick={e=>{e.stopPropagation();setSelectedClient(clients.find(c=>String(c.id)===String(appt.client_id)));setClientTab("info");}} style={{position:"absolute",bottom:2,right:2,background:"rgba(255,255,255,0.7)",border:"none",borderRadius:3,padding:"1px 3px",fontSize:7,cursor:"pointer"}}>👤</button>}
                            {hoveredAppt===appt.id&&<button onClick={e=>{e.stopPropagation();handleDelete(appt.id);}} style={{position:"absolute",top:2,left:2,background:"rgba(0,0,0,0.15)",border:"none",borderRadius:3,width:14,height:14,fontSize:8,cursor:"pointer"}}>✕</button>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </>)}

          {/* ===== CLIENTS ===== */}
          {activeTab==="clients"&&(<>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:11}}>
              <h2 style={{fontSize:15,fontWeight:800,color:"#2C1A1A"}}>לקוחות ({filteredClients.length})</h2>
              <button onClick={()=>{setEditingClient(null);setNewClient(emptyClient);setShowClientModal(true);}} style={{background:"#2C1A1A",color:"#fff",border:"none",borderRadius:8,padding:"6px 13px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>+ לקוחה חדשה</button>
            </div>
            <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
              <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="🔍 שם או טלפון..." style={{flex:1,minWidth:120,border:"1.5px solid #EEE8E2",borderRadius:8,padding:"7px 10px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#fff"}}/>
              <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{border:"1.5px solid #EEE8E2",borderRadius:8,padding:"7px 8px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#fff"}}>
                <option value="all">כל הסטטוסים</option>
                <option value="VIP">⭐ VIP</option><option value="hot">🔥 חמות</option>
                <option value="active">✓ פעילות</option><option value="cold">❄️ לא חזרו</option>
              </select>
              <select value={filterSkin} onChange={e=>setFilterSkin(e.target.value)} style={{border:"1.5px solid #EEE8E2",borderRadius:8,padding:"7px 8px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#fff"}}>
                <option value="all">כל סוגי עור</option>
                {SKIN_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {filteredClients.length===0?<p style={{color:"#BBB",fontSize:12}}>לא נמצאו לקוחות</p>
              :filteredClients.map(client=>{
                const appts=getClientAppts(client.id);
                const last=appts.sort((a,b)=>b.id-a.id)[0];
                const statusColor=STATUS_COLORS[client.status]||"#EEE8E2";
                const days=getDaysSince(client.id);
                return(
                  <div key={client.id} className="client-row" onClick={()=>{setSelectedClient(client);setClientTab("info");}} style={{background:"#fff",borderRadius:10,padding:"11px 14px",border:"1px solid #EEE8E2",display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                    <div style={{width:38,height:38,borderRadius:"50%",background:client.images?.[0]?"transparent":statusColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:700,flexShrink:0,overflow:"hidden"}}>
                      {client.images?.[0]?<img src={client.images[0]} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:client.name[0]}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:2,flexWrap:"wrap"}}>
                        <p style={{fontWeight:700,fontSize:13,color:"#2C1A1A"}}>{client.name}</p>
                        {client.status&&<span style={{fontSize:8,background:statusColor,padding:"1px 5px",borderRadius:20,fontWeight:600}}>{STATUS_LABELS[client.status]}</span>}
                        {days>90&&<span style={{fontSize:8,background:"#FEEBEE",color:"#C62828",padding:"1px 5px",borderRadius:20}}>❄️ {days}י</span>}
                      </div>
                      <p style={{fontSize:10,color:"#888"}}>{client.phone&&`📞 ${client.phone} · `}{appts.length} תורים{last&&` · ${last.service}`}</p>
                    </div>
                    {client.phone&&(
                      <a href={waLink(client.phone)} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} className="wa-btn" style={{padding:"5px 8px",fontSize:11}}>
                        📱
                      </a>
                    )}
                    <span style={{fontSize:10,color:"#C4A882"}}>←</span>
                  </div>
                );
              })}
          </>)}

          {/* ===== LEADS ===== */}
          {activeTab==="leads"&&(<>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:11}}>
              <h2 style={{fontSize:15,fontWeight:800,color:"#2C1A1A"}}>🎯 לידים ({leads.length})</h2>
              <button onClick={()=>{setEditingLead(null);setNewLead(emptyLead);setShowLeadModal(true);}} style={{background:"#2C1A1A",color:"#fff",border:"none",borderRadius:8,padding:"6px 13px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>+ ליד חדש</button>
            </div>
            <div style={{display:"flex",gap:7,marginBottom:12,overflowX:"auto"}}>
              <div onClick={()=>setLeadFilter("all")} className="stat-card" style={{background:leadFilter==="all"?"#2C1A1A":"#fff",borderRadius:8,padding:"6px 12px",border:"1.5px solid #EEE8E2",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
                <span style={{fontSize:11,fontWeight:700,color:leadFilter==="all"?"#fff":"#2C1A1A"}}>הכל ({leads.length})</span>
              </div>
              {Object.entries(LEAD_STATUSES).map(([key,s])=>(
                <div key={key} onClick={()=>setLeadFilter(leadFilter===key?"all":key)} className="stat-card"
                  style={{background:leadFilter===key?s.bg:"#fff",borderRadius:8,padding:"6px 12px",border:`1.5px solid ${leadFilter===key?s.color:"#EEE8E2"}`,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
                  <span style={{fontSize:10,fontWeight:leadFilter===key?700:400,color:leadFilter===key?s.color:"#555"}}>{s.label} ({leads.filter(l=>l.status===key).length})</span>
                </div>
              ))}
            </div>
            {sourceStats.length>0&&(
              <div style={{background:"#fff",borderRadius:10,padding:"11px 14px",marginBottom:11,border:"1px solid #EEE8E2"}}>
                <p style={{fontSize:10,fontWeight:700,color:"#999",marginBottom:7}}>מקורות · המרה: {conversionRate}%</p>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {sourceStats.map(s=>(
                    <button key={s.source} onClick={()=>setLeadSourceFilter(leadSourceFilter===s.source?"all":s.source)}
                      style={{background:leadSourceFilter===s.source?"#2C1A1A":"#FAF7F5",color:leadSourceFilter===s.source?"#fff":"#2C1A1A",border:"1px solid #EEE8E2",borderRadius:20,padding:"3px 9px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>
                      {s.icon} {s.source} {s.total} {s.converted>0&&`✓${s.converted}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <input value={leadSearch} onChange={e=>setLeadSearch(e.target.value)} placeholder="🔍 חיפוש..." style={{width:"100%",border:"1.5px solid #EEE8E2",borderRadius:8,padding:"7px 11px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#fff",marginBottom:9}}/>
            {filteredLeads.length===0?<p style={{color:"#BBB",fontSize:12}}>לא נמצאו לידים</p>
              :filteredLeads.map(lead=>{
                const st=LEAD_STATUSES[lead.status]||LEAD_STATUSES.new;
                const hasReminder=lead.reminder_date&&lead.reminder_date<=tomorrow;
                return(
                  <div key={lead.id} className="lead-row" onClick={()=>setSelectedLead(lead)}
                    style={{background:"#fff",borderRadius:10,padding:"10px 14px",border:`1.5px solid ${hasReminder?"#FF9800":"#EEE8E2"}`,display:"flex",alignItems:"center",gap:9,marginBottom:5}}>
                    <div style={{width:34,height:34,borderRadius:"50%",background:st.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0,border:`1px solid ${st.color}44`}}>
                      {SOURCE_ICONS[lead.source]||"📌"}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:2}}>
                        <p style={{fontWeight:700,fontSize:12,color:"#2C1A1A"}}>{lead.name}</p>
                        <span style={{fontSize:8,background:st.bg,color:st.color,padding:"1px 5px",borderRadius:20,fontWeight:600}}>{st.label}</span>
                        {hasReminder&&<span style={{fontSize:8,background:"#FFF3E0",color:"#FF9800",padding:"1px 5px",borderRadius:20}}>🔔</span>}
                      </div>
                      <p style={{fontSize:10,color:"#888"}}>{lead.phone&&`📞 ${lead.phone} · `}{SOURCE_ICONS[lead.source]} {lead.source}{lead.service_interest&&` · ${lead.service_interest}`}</p>
                    </div>
                    {lead.phone&&(
                      <a href={waLink(lead.phone)} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} className="wa-btn" style={{padding:"4px 7px",fontSize:11}}>
                        📱
                      </a>
                    )}
                    {lead.status!=="closed"&&lead.status!=="lost"&&(
                      <button onClick={e=>{e.stopPropagation();handleConvertLead(lead);}} style={{background:"#4CAF50",color:"#fff",border:"none",borderRadius:6,padding:"4px 7px",fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:600,flexShrink:0}}>המר ✓</button>
                    )}
                  </div>
                );
              })}
          </>)}
        </main>
      </div>

      {/* ===== מודל תור ===== */}
      {showModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={()=>setShowModal(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:24,width:350,maxHeight:"90vh",overflowY:"auto"}}>
            <h3 style={{fontSize:15,fontWeight:800,color:"#2C1A1A",marginBottom:11}}>קביעת תור חדש</h3>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {clients.length>0&&<select value={newAppt.clientId} onChange={e=>handleClientSelect(e.target.value)} style={{width:"100%",border:"1.5px solid #EEE8E2",borderRadius:8,padding:"8px 10px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FAF7F5"}}><option value="">— בחרי לקוחה קיימת —</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}{c.phone?` · ${c.phone}`:""}</option>)}</select>}
              <input value={newAppt.name} onChange={e=>setNewAppt({...newAppt,name:e.target.value,clientId:""})} placeholder="או הזיני שם לקוחה חדשה" style={{width:"100%",border:"1.5px solid #EEE8E2",borderRadius:8,padding:"8px 10px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FAF7F5"}}/>
              <div style={{display:"flex",gap:6}}>
                <div style={{flex:1}}><p style={{fontSize:9,color:"#888",marginBottom:2}}>תאריך</p><input type="date" value={newAppt.date} onChange={e=>setNewAppt({...newAppt,date:e.target.value})} style={{width:"100%",border:"1.5px solid #EEE8E2",borderRadius:8,padding:"7px 7px",fontSize:11,fontFamily:"inherit",outline:"none",background:"#FAF7F5"}}/></div>
                <div style={{flex:1}}><p style={{fontSize:9,color:"#888",marginBottom:2}}>שעה</p><select value={newAppt.hour} onChange={e=>setNewAppt({...newAppt,hour:Number(e.target.value)})} style={{width:"100%",border:"1.5px solid #EEE8E2",borderRadius:8,padding:"7px 7px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FAF7F5"}}>{workingHours.map((h,i)=><option key={h} value={settings.working_hours_start+i}>{h}</option>)}</select></div>
              </div>
              <select value={newAppt.service} onChange={e=>handleServiceSelect(e.target.value)} style={{width:"100%",border:"1.5px solid #EEE8E2",borderRadius:8,padding:"8px 10px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FAF7F5"}}>
                <option value="">— בחרי שירות —</option>
                {activeServices.map(s=><option key={s.name} value={s.name}>{s.name} — ₪{s.price} ({s.duration}′)</option>)}
              </select>
              <div style={{display:"flex",gap:5}}>{[30,45,60,90].map(d=><button key={d} onClick={()=>setNewAppt({...newAppt,duration:d})} style={{flex:1,padding:"6px 0",border:"1.5px solid",borderColor:newAppt.duration===d?"#2C1A1A":"#EEE8E2",borderRadius:7,background:newAppt.duration===d?"#2C1A1A":"#FAF7F5",color:newAppt.duration===d?"#fff":"#555",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{d}′</button>)}</div>
              <input type="number" value={newAppt.price||""} onChange={e=>setNewAppt({...newAppt,price:e.target.value})} placeholder="₪ מחיר" style={{width:"100%",border:"1.5px solid #EEE8E2",borderRadius:8,padding:"8px 10px",fontSize:12,fontFamily:"inherit",outline:"none",background:"#FAF7F5",textAlign:"right"}}/>
              <textarea value={apptNote} onChange={e=>setApptNote(e.target.value)} placeholder="📝 הערה" rows={2} style={{width:"100%",border:"1.5px solid #EEE8E2",borderRadius:8,padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FAF7F5",resize:"none"}}/>
            </div>
            <div style={{display:"flex",gap:6,marginTop:16}}>
              <button onClick={()=>setShowModal(false)} style={{flex:1,padding:"9px 0",border:"1.5px solid #EEE8E2",borderRadius:8,background:"none",fontSize:12,cursor:"pointer",fontFamily:"inherit",color:"#888"}}>ביטול</button>
              <button onClick={handleSave} style={{flex:2,padding:"9px 0",border:"none",borderRadius:8,background:pc,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>שמירה ✓</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== מודל לקוחה ===== */}
      {showClientModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={()=>setShowClientModal(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:24,width:370,maxHeight:"90vh",overflowY:"auto"}}>
            <h3 style={{fontSize:15,fontWeight:800,color:"#2C1A1A",marginBottom:11}}>{editingClient?"עריכת לקוחה":"לקוחה חדשה"}</h3>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <input value={newClient.name} onChange={e=>setNewClient({...newClient,name:e.target.value})} placeholder="שם מלא *" style={{width:"100%",border:"1.5px solid #EEE8E2",borderRadius:8,padding:"8px 10px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FAF7F5"}}/>
              <input value={newClient.phone} onChange={e=>setNewClient({...newClient,phone:e.target.value})} placeholder="טלפון" style={{width:"100%",border:"1.5px solid #EEE8E2",borderRadius:8,padding:"8px 10px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FAF7F5"}}/>
              <input value={newClient.birthday} onChange={e=>setNewClient({...newClient,birthday:e.target.value})} placeholder="תאריך לידה (YYYY-MM-DD)" style={{width:"100%",border:"1.5px solid #EEE8E2",borderRadius:8,padding:"8px 10px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FAF7F5"}}/>
              <select value={newClient.skinType} onChange={e=>setNewClient({...newClient,skinType:e.target.value})} style={{width:"100%",border:"1.5px solid #EEE8E2",borderRadius:8,padding:"8px 10px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FAF7F5"}}><option value="">סוג עור</option>{SKIN_TYPES.map(t=><option key={t}>{t}</option>)}</select>
              <textarea value={newClient.allergies} onChange={e=>setNewClient({...newClient,allergies:e.target.value})} placeholder="⚠️ אלרגיות" rows={2} style={{width:"100%",border:"1.5px solid #FFDAC1",borderRadius:8,padding:"8px 10px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FFFAF7",resize:"none"}}/>
              <textarea value={newClient.medical} onChange={e=>setNewClient({...newClient,medical:e.target.value})} placeholder="🏥 מצבים רפואיים" rows={2} style={{width:"100%",border:"1.5px solid #A7C4F4",borderRadius:8,padding:"8px 10px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#F7FAFF",resize:"none"}}/>
              <textarea value={newClient.notes} onChange={e=>setNewClient({...newClient,notes:e.target.value})} placeholder="📝 הערות" rows={2} style={{width:"100%",border:"1.5px solid #EEE8E2",borderRadius:8,padding:"8px 10px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FAF7F5",resize:"none"}}/>
              <div><p style={{fontSize:9,color:"#888",marginBottom:4}}>סטטוס</p><div style={{display:"flex",gap:4}}>{Object.entries(STATUS_LABELS).map(([key,label])=><button key={key} onClick={()=>setNewClient({...newClient,status:key})} style={{flex:1,padding:"5px 2px",border:"1.5px solid",borderColor:newClient.status===key?"#2C1A1A":"#EEE8E2",borderRadius:7,background:newClient.status===key?STATUS_COLORS[key]:"#FAF7F5",fontSize:9,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{label}</button>)}</div></div>
            </div>
            <div style={{display:"flex",gap:6,marginTop:16}}>
              <button onClick={()=>setShowClientModal(false)} style={{flex:1,padding:"9px 0",border:"1.5px solid #EEE8E2",borderRadius:8,background:"none",fontSize:12,cursor:"pointer",fontFamily:"inherit",color:"#888"}}>ביטול</button>
              <button onClick={handleSaveClient} style={{flex:2,padding:"9px 0",border:"none",borderRadius:8,background:pc,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>שמירה ✓</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== מודל ליד ===== */}
      {showLeadModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={()=>setShowLeadModal(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:24,width:360,maxHeight:"90vh",overflowY:"auto"}}>
            <h3 style={{fontSize:15,fontWeight:800,color:"#2C1A1A",marginBottom:11}}>{editingLead?"עריכת ליד":"ליד חדש"}</h3>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <input value={newLead.name} onChange={e=>setNewLead({...newLead,name:e.target.value})} placeholder="שם *" style={{width:"100%",border:"1.5px solid #EEE8E2",borderRadius:8,padding:"8px 10px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FAF7F5"}}/>
              <input value={newLead.phone} onChange={e=>setNewLead({...newLead,phone:e.target.value})} placeholder="טלפון" style={{width:"100%",border:"1.5px solid #EEE8E2",borderRadius:8,padding:"8px 10px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FAF7F5"}}/>
              <div><p style={{fontSize:9,color:"#888",marginBottom:4}}>מקור</p><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{LEAD_SOURCES.map(s=><button key={s} onClick={()=>setNewLead({...newLead,source:s})} style={{padding:"4px 8px",border:"1.5px solid",borderColor:newLead.source===s?"#2C1A1A":"#EEE8E2",borderRadius:20,background:newLead.source===s?"#2C1A1A":"#FAF7F5",color:newLead.source===s?"#fff":"#555",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>{SOURCE_ICONS[s]} {s}</button>)}</div></div>
              <select value={newLead.service_interest} onChange={e=>setNewLead({...newLead,service_interest:e.target.value})} style={{width:"100%",border:"1.5px solid #EEE8E2",borderRadius:8,padding:"8px 10px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FAF7F5"}}><option value="">תחום עניין</option>{activeServices.map(s=><option key={s.name}>{s.name}</option>)}</select>
              <div><p style={{fontSize:9,color:"#888",marginBottom:4}}>סטטוס</p><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{Object.entries(LEAD_STATUSES).map(([key,s])=><button key={key} onClick={()=>setNewLead({...newLead,status:key})} style={{padding:"4px 8px",border:"1.5px solid",borderColor:newLead.status===key?s.color:"#EEE8E2",borderRadius:20,background:newLead.status===key?s.bg:"#FAF7F5",color:newLead.status===key?s.color:"#555",fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:newLead.status===key?700:400}}>{s.label}</button>)}</div></div>
              <div><p style={{fontSize:9,color:"#888",marginBottom:3}}>🔔 תזכורת</p><input type="date" value={newLead.reminder_date} onChange={e=>setNewLead({...newLead,reminder_date:e.target.value})} style={{width:"100%",border:"1.5px solid #EEE8E2",borderRadius:8,padding:"8px 10px",fontSize:12,fontFamily:"inherit",outline:"none",background:"#FAF7F5"}}/></div>
              <textarea value={newLead.notes} onChange={e=>setNewLead({...newLead,notes:e.target.value})} placeholder="📝 הערות" rows={3} style={{width:"100%",border:"1.5px solid #EEE8E2",borderRadius:8,padding:"8px 10px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FAF7F5",resize:"none"}}/>
            </div>
            <div style={{display:"flex",gap:6,marginTop:16}}>
              <button onClick={()=>setShowLeadModal(false)} style={{flex:1,padding:"9px 0",border:"1.5px solid #EEE8E2",borderRadius:8,background:"none",fontSize:12,cursor:"pointer",fontFamily:"inherit",color:"#888"}}>ביטול</button>
              <button onClick={handleSaveLead} style={{flex:2,padding:"9px 0",border:"none",borderRadius:8,background:pc,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>שמירה ✓</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== הגדרות ===== */}
      {showSettings&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:2000}} onClick={()=>setShowSettings(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"16px 16px 0 0",padding:24,width:"100%",maxWidth:500,maxHeight:"85vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h3 style={{fontSize:16,fontWeight:800,color:"#2C1A1A"}}>⚙️ הגדרות</h3>
              <button onClick={()=>setShowSettings(false)} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:"#888"}}>✕</button>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:16,borderBottom:"1px solid #EEE8E2",paddingBottom:12}}>
              {[{id:"general",label:"כללי"},{id:"services",label:"שירותים ומחירים"},{id:"hours",label:"שעות פעילות"}].map(t=>(
                <button key={t.id} onClick={()=>setSettingsTab(t.id)} style={{background:settingsTab===t.id?pc:"#FAF7F5",color:settingsTab===t.id?"#fff":"#555",border:"none",borderRadius:20,padding:"6px 12px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{t.label}</button>
              ))}
            </div>

            {settingsTab==="general"&&editSettings&&(<>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div><p style={{fontSize:11,color:"#888",marginBottom:3}}>שם העסק</p><input value={editSettings.business_name||""} onChange={e=>setEditSettings({...editSettings,business_name:e.target.value})} style={{width:"100%",border:"1.5px solid #EEE8E2",borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FAF7F5"}}/></div>
                <div><p style={{fontSize:11,color:"#888",marginBottom:3}}>שם המטפלת</p><input value={editSettings.therapist_name||""} onChange={e=>setEditSettings({...editSettings,therapist_name:e.target.value})} style={{width:"100%",border:"1.5px solid #EEE8E2",borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FAF7F5"}}/></div>
                <div>
                  <p style={{fontSize:11,color:"#888",marginBottom:6}}>צבע נושא</p>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {["#D4945A","#E91E8C","#9C27B0","#2196F3","#4CAF50","#FF5722","#607D8B","#2C1A1A"].map(color=>(
                      <div key={color} onClick={()=>setEditSettings({...editSettings,primary_color:color})}
                        style={{width:32,height:32,borderRadius:"50%",background:color,cursor:"pointer",border:editSettings.primary_color===color?"3px solid #2C1A1A":"3px solid transparent"}}/>
                    ))}
                  </div>
                </div>
              </div>
              <button onClick={handleSaveSettings} style={{width:"100%",marginTop:16,padding:"11px",border:"none",borderRadius:9,background:pc,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>שמירה ✓</button>
            </>)}

            {settingsTab==="hours"&&editSettings&&(<>
              <div style={{display:"flex",gap:10}}>
                <div style={{flex:1}}>
                  <p style={{fontSize:11,color:"#888",marginBottom:3}}>התחלה</p>
                  <select value={editSettings.working_hours_start} onChange={e=>setEditSettings({...editSettings,working_hours_start:Number(e.target.value)})} style={{width:"100%",border:"1.5px solid #EEE8E2",borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",outline:"none",background:"#FAF7F5"}}>
                    {HOURS_ALL.map((h,i)=><option key={h} value={7+i}>{h}</option>)}
                  </select>
                </div>
                <div style={{flex:1}}>
                  <p style={{fontSize:11,color:"#888",marginBottom:3}}>סיום</p>
                  <select value={editSettings.working_hours_end} onChange={e=>setEditSettings({...editSettings,working_hours_end:Number(e.target.value)})} style={{width:"100%",border:"1.5px solid #EEE8E2",borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",outline:"none",background:"#FAF7F5"}}>
                    {HOURS_ALL.map((h,i)=><option key={h} value={7+i}>{h}</option>)}
                  </select>
                </div>
              </div>
              <button onClick={handleSaveSettings} style={{width:"100%",marginTop:16,padding:"11px",border:"none",borderRadius:9,background:pc,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>שמירה ✓</button>
            </>)}

            {settingsTab==="services"&&(<>
              {services.map((svc,idx)=>(
                <div key={idx} style={{background:"#FAF7F5",borderRadius:10,padding:"10px 12px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:14,height:14,borderRadius:"50%",background:svc.color,flexShrink:0}}/>
                  <div style={{flex:1}}>
                    <p style={{fontSize:12,fontWeight:600,color:"#2C1A1A"}}>{svc.name}</p>
                    <p style={{fontSize:10,color:"#888"}}>₪{svc.price} · {svc.duration}′</p>
                  </div>
                  <input type="number" value={svc.price} onChange={e=>{const updated=[...services];updated[idx]={...updated[idx],price:Number(e.target.value)};setServices(updated);}} style={{width:70,border:"1.5px solid #EEE8E2",borderRadius:7,padding:"4px 6px",fontSize:12,outline:"none",textAlign:"right"}}/>
                  <button onClick={()=>handleSaveService(svc,idx)} style={{background:pc,color:"#fff",border:"none",borderRadius:6,padding:"4px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>💾</button>
                </div>
              ))}
              {showNewService?(
                <div style={{background:"#F3F6FF",borderRadius:10,padding:"12px",marginTop:8}}>
                  <input value={newService.name} onChange={e=>setNewService({...newService,name:e.target.value})} placeholder="שם שירות" style={{width:"100%",border:"1.5px solid #EEE8E2",borderRadius:7,padding:"7px 9px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#fff",marginBottom:6}}/>
                  <div style={{display:"flex",gap:6}}>
                    <input type="number" value={newService.price} onChange={e=>setNewService({...newService,price:Number(e.target.value)})} placeholder="מחיר ₪" style={{flex:1,border:"1.5px solid #EEE8E2",borderRadius:7,padding:"7px 9px",fontSize:12,fontFamily:"inherit",outline:"none",background:"#fff"}}/>
                    <input type="number" value={newService.duration} onChange={e=>setNewService({...newService,duration:Number(e.target.value)})} placeholder="דקות" style={{flex:1,border:"1.5px solid #EEE8E2",borderRadius:7,padding:"7px 9px",fontSize:12,fontFamily:"inherit",outline:"none",background:"#fff"}}/>
                  </div>
                  <div style={{display:"flex",gap:6,marginTop:8}}>
                    <button onClick={()=>setShowNewService(false)} style={{flex:1,padding:"7px",border:"1px solid #EEE8E2",borderRadius:7,background:"none",fontSize:11,cursor:"pointer",fontFamily:"inherit",color:"#888"}}>ביטול</button>
                    <button onClick={handleAddService} style={{flex:2,padding:"7px",border:"none",borderRadius:7,background:pc,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>הוסיפי</button>
                  </div>
                </div>
              ):(
                <button onClick={()=>setShowNewService(true)} style={{width:"100%",marginTop:8,padding:"9px",border:"1.5px dashed #EEE8E2",borderRadius:9,background:"none",fontSize:12,cursor:"pointer",fontFamily:"inherit",color:"#888"}}>+ הוספת שירות חדש</button>
              )}
            </>)}
          </div>
        </div>
      )}

      {/* ===== פרופיל לקוחה ===== */}
      {selectedClient&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"flex-start",justifyContent:"flex-start",zIndex:1000}} onClick={()=>setSelectedClient(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",width:360,height:"100%",display:"flex",flexDirection:"column",boxShadow:"4px 0 24px rgba(0,0,0,0.12)"}}>
            <div style={{padding:"18px 18px 0",background:`linear-gradient(135deg,${STATUS_COLORS[selectedClient.status]||"#F4A7B9"}88,#fff)`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:11}}>
                <div style={{display:"flex",alignItems:"center",gap:9}}>
                  <div style={{width:48,height:48,borderRadius:"50%",background:STATUS_COLORS[selectedClient.status]||"#F4A7B9",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:700,overflow:"hidden",flexShrink:0}}>
                    {selectedClient.images?.[0]?<img src={selectedClient.images[0]} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:selectedClient.name[0]}
                  </div>
                  <div>
                    <p style={{fontWeight:800,fontSize:16,color:"#2C1A1A"}}>{selectedClient.name}</p>
                    <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                      <span style={{fontSize:9,background:STATUS_COLORS[selectedClient.status]||"#EEE8E2",padding:"1px 6px",borderRadius:20,fontWeight:600}}>{STATUS_LABELS[selectedClient.status]||""}</span>
                      {getDaysSince(selectedClient.id)>60&&<span style={{fontSize:9,background:"#FEEBEE",color:"#C62828",padding:"1px 6px",borderRadius:20}}>❄️ {getDaysSince(selectedClient.id)}י</span>}
                    </div>
                  </div>
                </div>
                <div style={{display:"flex",gap:5}}>
                  <button onClick={()=>{setEditingClient(selectedClient);setNewClient({name:selectedClient.name||"",phone:selectedClient.phone||"",birthday:selectedClient.birthday||"",skinType:selectedClient.skinType||"",allergies:selectedClient.allergies||"",medical:selectedClient.medical||"",notes:selectedClient.notes||"",status:selectedClient.status||"active"});setShowClientModal(true);}} style={{background:"#2C1A1A",color:"#fff",border:"none",borderRadius:7,padding:"4px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>✏️</button>
                  <button onClick={()=>setSelectedClient(null)} style={{background:"none",border:"none",fontSize:17,cursor:"pointer",color:"#888"}}>✕</button>
                </div>
              </div>

              {/* פרטי קשר + כפתורי WhatsApp */}
              <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center",flexWrap:"wrap"}}>
                {selectedClient.phone&&<span style={{fontSize:11,color:"#888"}}>📞 {selectedClient.phone}</span>}
                {selectedClient.birthday&&<span style={{fontSize:11,color:"#888"}}>🎂 {selectedClient.birthday}</span>}
                {selectedClient.phone&&(
                  <a href={waLink(selectedClient.phone)} target="_blank" rel="noreferrer" className="wa-btn">
                    📱 WhatsApp
                  </a>
                )}
                {selectedClient.phone&&(
                  <a href={`tel:${selectedClient.phone}`} className="call-btn">
                    📞 התקשרי
                  </a>
                )}
              </div>

              <div style={{fontSize:10,color:"#888",marginBottom:11}}>
                📋 {getClientAppts(selectedClient.id).length} תורים · 💰 ₪{getClientAppts(selectedClient.id).reduce((s,a)=>s+(Number(a.price)||0),0).toLocaleString()}
              </div>

              <div style={{display:"flex",overflowX:"auto",borderBottom:"1px solid #EEE8E2"}}>
                {[{id:"info",label:"פרטים"},{id:"images",label:"📷"},{id:"before_after",label:"לפני/אחרי"},{id:"forms",label:"📋"},{id:"history",label:"היסטוריה"}].map(t=>(
                  <button key={t.id} onClick={()=>setClientTab(t.id)} style={{background:"none",border:"none",padding:"8px 10px",fontSize:11,fontWeight:clientTab===t.id?700:400,color:clientTab===t.id?"#2C1A1A":"#888",borderBottom:clientTab===t.id?`2px solid ${pc}`:"2px solid transparent",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{t.label}</button>
                ))}
              </div>
            </div>

            <div style={{flex:1,overflowY:"auto",padding:16}}>
              {clientTab==="info"&&(<>
                {selectedClient.skinType&&<div style={{background:"#FAF7F5",borderRadius:9,padding:"9px 12px",marginBottom:8}}><p style={{fontSize:9,fontWeight:700,color:"#999",marginBottom:2}}>סוג עור</p><p style={{fontSize:12,color:"#2C1A1A"}}>{selectedClient.skinType}</p></div>}
                {selectedClient.allergies&&<div style={{background:"#FFF5F0",border:"1px solid #FFDAC1",borderRadius:9,padding:"9px 12px",marginBottom:8}}><p style={{fontSize:9,fontWeight:700,color:"#D4945A",marginBottom:2}}>⚠️ אלרגיות</p><p style={{fontSize:11,color:"#2C1A1A"}}>{selectedClient.allergies}</p></div>}
                {selectedClient.medical&&<div style={{background:"#F0F5FF",border:"1px solid #A7C4F4",borderRadius:9,padding:"9px 12px",marginBottom:8}}><p style={{fontSize:9,fontWeight:700,color:"#5580C4",marginBottom:2}}>🏥 מצבים רפואיים</p><p style={{fontSize:11,color:"#2C1A1A"}}>{selectedClient.medical}</p></div>}
                {selectedClient.notes&&<div style={{background:"#FFF1BA",borderRadius:9,padding:"9px 12px",marginBottom:8}}><p style={{fontSize:9,fontWeight:700,color:"#999",marginBottom:2}}>📝 הערות</p><p style={{fontSize:11,color:"#2C1A1A"}}>{selectedClient.notes}</p></div>}
                {!selectedClient.skinType&&!selectedClient.allergies&&!selectedClient.medical&&!selectedClient.notes&&<p style={{color:"#BBB",fontSize:11,textAlign:"center",marginTop:24}}>לחצי ✏️ להוספת פרטים</p>}
              </>)}

              {clientTab==="images"&&(<>
                <label style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,background:"#2C1A1A",color:"#fff",borderRadius:9,padding:"8px",fontSize:11,fontWeight:600,cursor:"pointer",marginBottom:11,opacity:uploading?0.6:1}}>
                  {uploading?"מעלה...":"📷 העלי תמונה"}
                  <input type="file" accept="image/*" onChange={e=>handleUploadImage(e,selectedClient)} style={{display:"none"}} disabled={uploading}/>
                </label>
                {(!selectedClient.images||selectedClient.images.length===0)?<p style={{color:"#BBB",fontSize:11,textAlign:"center",marginTop:20}}>אין תמונות</p>
                  :<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
                    {selectedClient.images.map((img,i)=>(
                      <div key={i} style={{position:"relative",borderRadius:9,overflow:"hidden",aspectRatio:"1"}}>
                        <img src={img} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                        <button onClick={()=>handleDeleteImage(selectedClient,img)} style={{position:"absolute",top:3,left:3,background:"rgba(0,0,0,0.5)",color:"#fff",border:"none",borderRadius:"50%",width:20,height:20,fontSize:10,cursor:"pointer"}}>✕</button>
                      </div>
                    ))}
                  </div>}
              </>)}

              {clientTab==="before_after"&&(<>
                <p style={{fontSize:10,fontWeight:700,color:"#999",marginBottom:9}}>📸 לפני / אחרי טיפול</p>
                <label style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,background:"#2C1A1A",color:"#fff",borderRadius:9,padding:"8px",fontSize:11,fontWeight:600,cursor:"pointer",marginBottom:11,opacity:uploading?0.6:1}}>
                  {uploading?"מעלה...":"📷 העלי תמונה לפני/אחרי"}
                  <input type="file" accept="image/*" onChange={e=>handleUploadImage(e,selectedClient)} style={{display:"none"}} disabled={uploading}/>
                </label>
                {(!selectedClient.images||selectedClient.images.length===0)?<p style={{color:"#BBB",fontSize:11,textAlign:"center",marginTop:20}}>אין תמונות לפני/אחרי</p>
                  :<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
                    {selectedClient.images.map((img,i)=>(
                      <div key={i} style={{borderRadius:9,overflow:"hidden",position:"relative"}}>
                        <img src={img} style={{width:"100%",aspectRatio:"1",objectFit:"cover"}}/>
                        <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,0.5)",color:"#fff",fontSize:9,textAlign:"center",padding:"2px"}}>{i%2===0?"לפני":"אחרי"}</div>
                        <button onClick={()=>handleDeleteImage(selectedClient,img)} style={{position:"absolute",top:3,left:3,background:"rgba(0,0,0,0.5)",color:"#fff",border:"none",borderRadius:"50%",width:18,height:18,fontSize:9,cursor:"pointer"}}>✕</button>
                      </div>
                    ))}
                  </div>}
              </>)}

              {clientTab==="forms"&&(<>
                <p style={{fontSize:10,fontWeight:700,color:"#999",marginBottom:6}}>שליחת טופס הצהרת בריאות</p>
                {FORM_TYPES.map(form=>(
                  <button key={form.key} onClick={()=>handleSendForm(selectedClient,form.key)} style={{width:"100%",background:"#fff",border:"1.5px solid #EEE8E2",borderRadius:9,padding:"9px 12px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginBottom:5,textAlign:"right",color:"#2C1A1A",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span>{form.label}</span><span style={{fontSize:10,color:"#C4A882"}}>העתק ←</span>
                  </button>
                ))}
                <div style={{marginTop:13}}>
                  <p style={{fontSize:10,fontWeight:700,color:"#999",marginBottom:6}}>טפסים שנשלחו</p>
                  {getClientForms(selectedClient.id).length===0?<p style={{fontSize:11,color:"#BBB"}}>לא נשלחו</p>
                    :getClientForms(selectedClient.id).sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||"")).map(f=>(
                      <div key={f.id} style={{background:f.status==="signed"?"#B5EAD744":"#FFF1BA44",border:`1px solid ${f.status==="signed"?"#B5EAD7":"#FFF1BA"}`,borderRadius:7,padding:"7px 10px",marginBottom:5,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div><p style={{fontSize:11,fontWeight:600,color:"#2C1A1A"}}>{FORM_TYPES.find(t=>t.key===f.form_type)?.label||f.form_type}</p><p style={{fontSize:9,color:"#888"}}>{f.created_at?.slice(0,10)}</p></div>
                        <span style={{fontSize:10,fontWeight:700,color:f.status==="signed"?"#4CAF50":"#D4945A"}}>{f.status==="signed"?"✅":"⏳"}</span>
                      </div>
                    ))}
                </div>
              </>)}

              {clientTab==="history"&&(<>
                <p style={{fontSize:10,fontWeight:700,color:"#999",marginBottom:8}}>{getClientAppts(selectedClient.id).length} טיפולים · ₪{getClientAppts(selectedClient.id).reduce((s,a)=>s+(Number(a.price)||0),0).toLocaleString()}</p>
                {getClientAppts(selectedClient.id).length===0?<p style={{fontSize:11,color:"#BBB"}}>אין תורים</p>
                  :getClientAppts(selectedClient.id).sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(appt=>(
                    <div key={appt.id} style={{background:appt.color+"44",borderRight:`3px solid ${appt.color}`,borderRadius:7,padding:"8px 10px",marginBottom:6}}>
                      <div style={{display:"flex",justifyContent:"space-between"}}><p style={{fontSize:11,fontWeight:600,color:"#2C1A1A"}}>{appt.service}</p>{appt.price>0&&<p style={{fontSize:11,fontWeight:700,color:pc}}>₪{appt.price}</p>}</div>
                      <p style={{fontSize:9,color:"#888"}}>{appt.date} · {appt.hour}:00 · {appt.duration} דקות</p>
                      {appt.note&&<p style={{fontSize:9,color:"#777",marginTop:2}}>📝 {appt.note}</p>}
                    </div>
                  ))}
              </>)}
            </div>

            <div style={{padding:12,borderTop:"1px solid #EEE8E2"}}>
              <button onClick={()=>{setSelectedClient(null);const svc=activeServices[0];setNewAppt({clientId:selectedClient.id,name:selectedClient.name,service:svc?.name||"",duration:svc?.duration||60,date:formatDate(new Date()),hour:settings.working_hours_start,price:svc?.price||0});setApptNote("");setShowModal(true);}}
                style={{width:"100%",background:"#2C1A1A",color:"#fff",border:"none",borderRadius:9,padding:"10px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                + קבעי תור ללקוחה זו
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== פרופיל ליד ===== */}
      {selectedLead&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"flex-start",justifyContent:"flex-start",zIndex:1000}} onClick={()=>setSelectedLead(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",width:330,height:"100%",display:"flex",flexDirection:"column",boxShadow:"4px 0 24px rgba(0,0,0,0.12)"}}>
            <div style={{padding:"16px 16px 12px",background:LEAD_STATUSES[selectedLead.status]?.bg||"#EBF3FF"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:9}}>
                <div>
                  <p style={{fontWeight:800,fontSize:15,color:"#2C1A1A"}}>{selectedLead.name}</p>
                  <span style={{fontSize:9,background:LEAD_STATUSES[selectedLead.status]?.bg,color:LEAD_STATUSES[selectedLead.status]?.color,padding:"2px 7px",borderRadius:20,fontWeight:700,border:`1px solid ${LEAD_STATUSES[selectedLead.status]?.color}`}}>{LEAD_STATUSES[selectedLead.status]?.label}</span>
                </div>
                <div style={{display:"flex",gap:4}}>
                  <button onClick={()=>openEditLead(selectedLead)} style={{background:"#2C1A1A",color:"#fff",border:"none",borderRadius:6,padding:"4px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>✏️</button>
                  <button onClick={()=>setSelectedLead(null)} style={{background:"none",border:"none",fontSize:16,cursor:"pointer",color:"#888"}}>✕</button>
                </div>
              </div>

              {/* פרטי קשר + כפתורי WhatsApp */}
              <div style={{display:"flex",gap:7,flexWrap:"wrap",alignItems:"center",marginBottom:8}}>
                {selectedLead.phone&&<span style={{fontSize:10,color:"#666"}}>📞 {selectedLead.phone}</span>}
                <span style={{fontSize:10,color:"#666"}}>{SOURCE_ICONS[selectedLead.source]} {selectedLead.source}</span>
                {selectedLead.service_interest&&<span style={{fontSize:10,color:"#666"}}>💅 {selectedLead.service_interest}</span>}
              </div>
              <div style={{display:"flex",gap:7,marginBottom:4}}>
                {selectedLead.phone&&(
                  <a href={waLink(selectedLead.phone)} target="_blank" rel="noreferrer" className="wa-btn">
                    📱 WhatsApp
                  </a>
                )}
                {selectedLead.phone&&(
                  <a href={`tel:${selectedLead.phone}`} className="call-btn">
                    📞 התקשרי
                  </a>
                )}
              </div>
            </div>

            <div style={{flex:1,overflowY:"auto",padding:16}}>
              <p style={{fontSize:10,fontWeight:700,color:"#999",marginBottom:6}}>עדכון סטטוס</p>
              <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:13}}>
                {Object.entries(LEAD_STATUSES).map(([key,s])=>(
                  <button key={key} onClick={()=>handleUpdateLeadStatus(selectedLead,key)}
                    style={{padding:"7px 11px",border:"1.5px solid",borderColor:selectedLead.status===key?s.color:"#EEE8E2",borderRadius:8,background:selectedLead.status===key?s.bg:"#fff",color:selectedLead.status===key?s.color:"#555",fontSize:11,fontWeight:selectedLead.status===key?700:400,cursor:"pointer",fontFamily:"inherit",textAlign:"right"}}>
                    {s.label} {selectedLead.status===key?"✓":""}
                  </button>
                ))}
              </div>

              <p style={{fontSize:10,fontWeight:700,color:"#999",marginBottom:4}}>🔔 תזכורת</p>
              <div style={{display:"flex",gap:6,marginBottom:13}}>
                <input type="date" defaultValue={selectedLead.reminder_date||""} onChange={e=>handleSetReminder(selectedLead,e.target.value)}
                  style={{flex:1,border:"1.5px solid #EEE8E2",borderRadius:8,padding:"7px 8px",fontSize:11,fontFamily:"inherit",outline:"none",background:"#FAF7F5"}}/>
                {selectedLead.reminder_date&&<button onClick={()=>handleSetReminder(selectedLead,"")} style={{background:"none",border:"1px solid #EEE8E2",borderRadius:7,padding:"7px 8px",fontSize:10,cursor:"pointer",color:"#888"}}>נקה</button>}
              </div>

              {selectedLead.notes&&(
                <div style={{background:"#FFF1BA",borderRadius:9,padding:"9px 12px",marginBottom:13}}>
                  <p style={{fontSize:9,fontWeight:700,color:"#999",marginBottom:2}}>📝 הערות</p>
                  <p style={{fontSize:11,color:"#2C1A1A"}}>{selectedLead.notes}</p>
                </div>
              )}
            </div>

            {selectedLead.status!=="closed"&&selectedLead.status!=="lost"&&(
              <div style={{padding:12,borderTop:"1px solid #EEE8E2"}}>
                <button onClick={()=>handleConvertLead(selectedLead)}
                  style={{width:"100%",background:"#4CAF50",color:"#fff",border:"none",borderRadius:9,padding:"10px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  ✅ המרי ללקוחה
                </button>
              </div>
            )}
            {selectedLead.status==="closed"&&(
              <div style={{padding:12,borderTop:"1px solid #EEE8E2",textAlign:"center"}}>
                <p style={{fontSize:11,color:"#4CAF50",fontWeight:700}}>✅ הליד הומר ללקוחה בהצלחה</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
