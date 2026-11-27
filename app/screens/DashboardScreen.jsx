"use client";
// app/screens/DashboardScreen.jsx — {!tillOnly&&activeTab==="dashboard" && ...} of the owner's app.
//
// Moved out of app/beautyos.jsx by scripts/extract-screen.mjs, byte for byte: nothing between the two markers below was
// rewritten. Everything it reads from the app arrives in one `ctx` object, whose names scripts/check-screens.mjs holds
// equal to what beautyos.jsx passes. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back
// in its place, so the tests that protect these words still read them where they always were.
//
// To change this screen: edit it here. To give it something new from the app: add the name to the destructuring below
// AND to the ctx={{...}} of <DashboardScreen> in app/beautyos.jsx (the check fails until both sides agree).
import { parseDb } from "@/lib/dbTime";
import { APP_URL } from "@/lib/appUrl";
import { displayName } from "@/lib/personName";
import { supabase } from "../supabase";
import { nextOpenDay } from "@/lib/businessHours";
import { contactAgoHe } from "@/lib/leads/contact";
import { lighten } from "@/lib/theme";
import { FLOWER_128, FLOWER_256, ICON_QUESTION } from "@/lib/brand";
import BrandImage from "@/app/BrandImage";
import FirstBookingCard from "../FirstBookingCard";
import { UpgradesEntry } from "../UpgradesStore";
import EmptyState from "../EmptyState";
import Spinner from "../Spinner";
import Icon from "../Icon";
import { startMinute, endMinute } from "@/lib/apptTime";
import { DISMISS_KEY as SUGGEST_DISMISS_KEY } from "@/lib/automationSuggest.js";
import { isPersonal } from "@/lib/calendarKind";
import { NO_SHOW } from "@/lib/reliability";
import { buildClosingList, ALL_CLEAR_HE } from "@/lib/closingList";
import { buildNextClientBrief, untilHe } from "@/lib/nextClient";
import GoalsCard from "../GoalsCard";
import { lowStockAttention } from "@/lib/products";
import FeeQuestions from "../FeeQuestions";
import { IntakeQueueSync } from "../IntakeBadge";
import MyDayCard from "../MyDayCard";
import { apptStatus } from "@/lib/apptStatus";
import { resolveGoals } from "@/lib/goals";
import { countHe } from "@/lib/hebrewCount";
import { withSource } from "@/lib/bookingSource";
import { monthlyPageOn } from "@/lib/monthlyFull";
import { tr, trv, uiDir } from "@/lib/i18n/tr";

export default function DashboardScreen({ ctx }) {
  const {
    activeServices, answerQuestion, appointments, approveSkinFollowup, attentionOnToday, AutomationSuggestCard,
    businessQuiet, clientAppts, clients, coldClients, copyPublicLink, deferred, emptyClient, entrySubtitle,
    entryTime, fbShowing, fbSteps, fbView, feeCharged, formatDate, getDaysSince, guardWrite, handleApptClick,
    handleOpenCashier, handleSendConfirmation, herAccent, historyReady, isBusy, leads, leadsWithReminders,
    liveRcpts, MarketingToday, MonthlyReportCard, monthlyReportData, monthTotals, MonthValueCard, myDayModel,
    myDayOn, mySlug, newLeadsCount, now, onKbdActivate, openImportFor, openNewAppt, openSettings, ownerNotifs,
    pc, pcDeep, pcGrad, pcTint, pendingQuestion, productsApi, questionStats, queueApproved, queueDismissed,
    refreshWaQueue, renderSetupBody, router, saveAutomationsKey, services, setActiveTab, setAiPostsView,
    setApptNote, setCalDay, setCalView, setEditingAppointmentId, setEditingClient, setFbCelebrate, setNewAppt,
    setNewClient, setOwnerNotifs, setPhotoPost, setQueueDismissed, setSelectedLead, setSettingsGroup,
    setShowClientModal, setShowLapsed, setShowModal, setShowSetup, setShowWaQueue, setSkinEdits, setSkinOpen,
    setTillTab, settings, setupDone, setupOnToday, setupTotal, setWaView, shareBookingWhatsApp, skinEdits,
    skinOpen, skinQueue, skinQueueError, skinQueueLoading, thisMonthAppts, toast, today, todayAppts,
    todayEntries, todayTotals, tomorrowAppts, upcomingBirthdays, waMessages, whatsappPending, winbackDays,
  } = ctx;
  return (
    /* @screen-body */<div className="today-stack" style={{display:"flex",flexDirection:"column"}}>
            {/* 2026-10-20 design pass: what she needs at 9am first. Cards keep their place in the source (and in every
                test that reads it); the ORDER below is visual only: greeting, today's revenue, the next client, today's
                appointments with "needs attention", then the question, setup, marketing and the rest. Children without
                an order (fees, goals, marketing) take .today-stack>* below = 8. */}
            {/* TARGET MOCKUP (design/target-today.html, handed over by the
                user) is the literal spec for everything from here through
                the appointment rows below - values copied from its CSS, not
                re-derived from the earlier prose brief. Where this file and
                that mockup disagree, the mockup wins, with ONE audited exception: the mockup's light
                green #8CA096 for small text measured 2.3:1 on cream, so it is var(--brand-muted)
                (#656A56, 4.7:1) here. The mockup's muted-ink values (a slightly green-tinted
                reading of "muted") are used as green-tinted literals rather than
                var(--ink-3)/var(--ink-2) - those shared tokens stay neutral,
                since tenant-facing pages read them too (Stage 2's rule);
                this is a Kalmea-chrome-only green reserved for this screen. */}
 <div style={{order:1,display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,paddingInline:17}}>
 <b style={{fontFamily:"var(--font-frank),'Frank Ruhl Libre',serif",fontWeight:700,fontSize:21,color:"var(--ink)"}}>{now.getHours()<12?tr("בוקר טוב"):now.getHours()<17?tr("צהריים טובים"):now.getHours()<21?tr("ערב טוב"):tr("לילה טוב")}</b>
 <BrandImage width={30} height={30} aria-hidden alt="" src={FLOWER_256} style={{width:30,height:30,objectFit:"contain",display:"block"}}/>
 </div>
 {/* 3 צעדים לתור הראשון: first thing under the greeting for a new business, until it is done (lib/firstBooking.js). */}
 <FirstBookingCard view={fbView} steps={fbSteps} name={displayName(settings.therapist_name)} style={{order:1}}
              onAddServices={()=>openSettings("services","newService")}
              onImportClients={()=>openImportFor("clients")}
              onNewClient={()=>{setEditingClient(null);setNewClient(emptyClient);setShowClientModal(true);}}
              onShareWhatsApp={shareBookingWhatsApp}
              onCopyLink={()=>copyPublicLink("book")}
              onClose={()=>setFbCelebrate(false)}/>
 {myDayOn&&<MyDayCard model={myDayModel} loading={deferred.leads==="loading"||deferred.history==="loading"} brandNew={historyReady&&deferred.leads==="ok"&&clients.length===0&&appointments.length===0&&leads.length===0} noHistory={historyReady&&appointments.length===0}
              pc={pc} pcTint={pcTint} style={{order:1}}
              onRemind={handleSendConfirmation} onPay={handleOpenCashier} onNewAppt={openNewAppt} onOpen={handleApptClick}/>}
 {/* Two opt-in automations, offered once with the exact client message (lib/automationSuggest.js). "להפעיל" stores her own switch as true;
     "לא עכשיו" hides the question for good. Nothing turns on and nothing is sent without her tap. */}
 <AutomationSuggestCard settings={settings} services={services} style={{order:1}}
              onEnable={async (key)=>{ const ok = await saveAutomationsKey(key, true); if (ok) toast(key==="waitlist_offers"?tr("הופעל: תורים שהתפנו יוצעו לרשימת ההמתנה"):tr("הופעל: תזכורת לטיפול הבא")); }}
              onDismiss={(key)=>{ const a=(settings.automations&&typeof settings.automations==="object")?settings.automations:{}; const cur=(a[SUGGEST_DISMISS_KEY]&&typeof a[SUGGEST_DISMISS_KEY]==="object")?a[SUGGEST_DISMISS_KEY]:{}; saveAutomationsKey(SUGGEST_DISMISS_KEY,{...cur,[key]:true}); }}/>
            {/* REVENUE HERO - visual pass (2026-10), היום first. The number
                itself is not new data: todayTotals is the exact computation
                the Insights tab's own "היום" card already uses (lib/till's
                totalsOf(receiptsOnDay(...))), just led with here instead of
                buried under the greeting. Frank Ruhl Libre explicitly, not
                className="serif"'s stack - Cormorant Garamond (first in that
                stack) covers Latin digits itself, so a Hebrew-fallback alone
                would not reliably reach Frank Ruhl for a number. */}
 {/* Not while the 3-step card is on, and not before today's first payment (UX pass 2026-11-08): a big ₪0 says nothing.
     Order (UX pass): greeting, My Day, the freed-slot question, the next client, then this revenue line, then the rest. */}
 {fbView!=="active"&&todayTotals.count>0&&<div className="glass-card card-boxed" style={{order:3,padding:"16px 17px",marginBottom:12,maxWidth:1180,marginInline:"auto"}}>
 <p style={{fontSize:12.5,color:"var(--brand-muted)"}}>{tr("הכנסות היום")}</p>
 <p style={{fontFamily:"var(--font-frank),'Frank Ruhl Libre',serif",fontWeight:900,fontSize:38,letterSpacing:"-0.02em",color:"var(--ink)",lineHeight:1.05,marginTop:1}}>₪{todayTotals.total.toLocaleString()}</p>
              {todayTotals.byMethod.length>0&&(
 <p style={{fontSize:13,color:"var(--brand-muted)",marginTop:3}}>
                  {todayTotals.byMethod.map(m=>`${m.method} ${m.total.toLocaleString()}`).join(" · ")}
                  {todayTotals.tips>0&&tr(" · טיפים {0}", [todayTotals.tips.toLocaleString()])}
 </p>
              )}
 </div>}
 <FeeQuestions variant="home" pc={pc} pcTint={pcTint} toast={toast} onCharged={feeCharged}/>
 <IntakeQueueSync onQueued={refreshWaQueue}/>
 <button type="button" onClick={()=>{if(guardWrite())return;setPhotoPost({clientName:""});}} data-testid="photo-to-post-open" className="glass-card card-boxed" style={{order:3,display:"flex",alignItems:"center",gap:12,width:"100%",maxWidth:1180,marginInline:"auto",marginBottom:12,padding:"14px 17px",textAlign:"right",cursor:"pointer",fontFamily:"inherit",border:"1px solid var(--line)"}}>
 <span aria-hidden style={{width:40,height:40,borderRadius:"50%",background:"var(--ink)",color:"var(--surface)",display:"flex",alignItems:"center",justifyContent:"center",flex:"none"}}><Icon name="camera" size={18}/></span>
 <span style={{flex:1}}>
 <span style={{display:"block",fontSize:"var(--t-md)",fontWeight:700,color:"var(--ink)"}}>{tr("צילום אחרי טיפול")}</span>
 <span style={{display:"block",fontSize:12.5,color:"var(--brand-muted)",marginTop:2}}>{tr("תמונה אחת ← פוסט וסטורי. כמה תמונות וסרטונים ← רילס")}</span>
 </span>
 </button>
 <UpgradesEntry variant="home" style={{order:3}}/>
 <GoalsCard goals={resolveGoals(settings?.automations)} revenue={monthTotals.total} bookings={thisMonthAppts.filter(a=>a.confirmation_status!=="cancelled").length} hasActivity={monthTotals.total>0||thisMonthAppts.length>0} now={now} accent={pc} onSetGoals={()=>{setSettingsGroup("business");openSettings();}}/>
 {/* order 5: right after today's appointments and "needs attention" (.today-stack). */}
 {fbView!=="active"&&<MonthlyReportCard report={monthlyReportData} needsStatus={!settings?.business_tax_status} onChooseStatus={()=>openSettings("general")} accent={herAccent} businessName={settings?.business_name} toast={toast} onOpenIncome={()=>setActiveTab("tax")} fullHref={monthlyPageOn(settings)?"/dashboard/monthly":null} style={{order:5}}/>}
 <MonthValueCard appointments={appointments} receipts={liveRcpts} clients={clients} ready={historyReady} style={{order:5}}/>
 {fbView!=="active"&&<MarketingToday settings={settings} appointments={appointments} clients={clients} services={activeServices} today={today} historyReady={historyReady}
            coldCount={coldClients.length} winbackDays={winbackDays}
            pageUrl={settings?.tenant_id?withSource(`${(typeof window!=="undefined"&&window.location.origin)||APP_URL}${mySlug?`/${encodeURIComponent(mySlug)}`:`/book?t=${settings.tenant_id}`}`,"post"):""}
            pc={pc} pcTint={pcTint} toast={toast}
            onOpenWinback={()=>setShowLapsed(true)}
            onOpenContent={()=>{setActiveTab("campaigns");setAiPostsView("studio");}}/>}
            {/* THE ONE QUESTION - at most one, above everything. Today's only
                kind: a cancellation opened a slot; offer it over WhatsApp?
                The footer is the yes-rate, measured from day one. */}
            {pendingQuestion&&!businessQuiet.quietNow&&(pendingQuestion.kind==="gap_fill"||pendingQuestion.kind==="comeback")&&(()=>{
              const p=pendingQuestion.payload||{};
              const d=new Date(`${p.date}T00:00:00`);
              const dayName=isNaN(d)?p.date:["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"][d.getDay()];
              const mins=Number(p.startMinute)||0;
              const hhmm=`${String(Math.floor(mins/60)).padStart(2,"0")}:${String(mins%60).padStart(2,"0")}`;
              const answered=(questionStats?.yes||0)+(questionStats?.no||0);
              const isComeback=pendingQuestion.kind==="comeback";
              const questionText=isComeback
                ? `חזרת מהפסקה ✦ לשלוח הודעת "חזרנו לפעילות" בוואטסאפ ללקוחות שלא הספיקו לחזור?`
                : `התפנה תור, יום ${dayName} ${hhmm}${p.service?`, ${p.service}`:""}. להציע אותו בוואטסאפ ללקוחות מתאימות?`;
              return (
 <div className="glass-card card-boxed card-boxed-rose" style={{order:2,position:"relative",overflow:"hidden",padding:"16px 17px",marginBottom:12,maxWidth:1180,marginInline:"auto",border:"1px solid rgba(233,169,161,.65)"}}>
                  {/* Ad-aligned pass: the new question line-icon is this
                      card's real header mark now, in place of the old faint
                      13%-opacity corner flower - large enough to actually
                      notice, per the icon set's "beside a section title"
                      role, rather than a background watermark. */}
 <div style={{position:"relative",display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
 <BrandImage width={48} height={48} aria-hidden alt="" src={ICON_QUESTION} style={{width:48,height:48,objectFit:"contain",flexShrink:0}}/>
 <p style={{fontFamily:"var(--font-hand),cursive",fontSize:21,color:"#C07A72",margin:0}}>{tr("שאלה אחת")}</p>
 </div>
 <p style={{position:"relative",fontSize:15,lineHeight:1.5,color:"var(--ink)",marginBottom:12}}>{questionText}</p>
 <div style={{position:"relative",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
 <button onClick={()=>answerQuestion(pendingQuestion,true)} disabled={isBusy("ownerQuestion")} style={{display:"inline-block",fontSize:13.5,fontWeight:700,padding:"8px 17px",borderRadius:999,background:"#1F3A30",color:"#FBF8F1",border:"none",cursor:"pointer",fontFamily:"inherit",opacity:isBusy("ownerQuestion")?0.6:1}}>{tr("כן, שלחי")}</button>
 <button onClick={()=>answerQuestion(pendingQuestion,false)} disabled={isBusy("ownerQuestion")} style={{display:"inline-block",fontSize:13.5,fontWeight:400,padding:"8px 17px",borderRadius:999,background:"transparent",color:"var(--brand-muted)",border:"1px solid rgba(31,58,48,.14)",cursor:"pointer",fontFamily:"inherit"}}>{tr("לא הפעם")}</button>
 <div style={{flex:1}}/>
 {answered>0&&<p style={{fontSize:"var(--t-xs)",color:"var(--brand-muted)"}}>{tr("ענית כן על")} {questionStats.yes} {tr("מתוך")} {answered}</p>}
 </div>
 </div>
              );
            })()}
            {/* "Add your services" is only the right first action when she
                genuinely has none - the audit found this showing (and
                claiming the booking page is empty) for a tenant who'd
                already completed that step, because the condition never
                checked services at all. Once she has services, the rest of
                this screen (today's appointments, needs-attention) already
                carries an empty day fine on its own. */}
            {!fbShowing&&historyReady&&deferred.leads==="ok"&&clients.length===0&&appointments.length===0&&leads.length===0&&services.length===0&&(
              <div style={{order:3}}><EmptyState icon="home" moment accent={pc} accentTint={pcTint}
                title={<><span className="brand-rose-word">{tr("ברוכה הבאה")}</span>{displayName(settings.therapist_name)?", "+displayName(settings.therapist_name):""}</>}
                body={tr("המסך הזה יתמלא מעצמו ברגע שיהיה מה להראות. הדבר הראשון שכדאי לעשות הוא להוסיף את הטיפולים והמחירים. בלעדיהם אי אפשר לקבוע תור ועמוד ההזמנות שלך ריק.")}
                actions={[
                  {label:tr("הטיפולים והמחירים שלי"),onClick:()=>openSettings("services")},
                  {label:tr("ייבוא לקוחות קיימות"),onClick:()=>openImportFor("clients")},
                  {label:tr("רשימת ההגדרות"),onClick:()=>setShowSetup(true)},
                ]}/></div>
            )}
            {!fbShowing&&historyReady&&deferred.leads==="ok"&&clients.length===0&&appointments.length===0&&leads.length===0&&services.length>0&&(
              <div style={{order:3}}><EmptyState icon="home" moment accent={pc} accentTint={pcTint}
                title={<><span className="brand-rose-word">{tr("ברוכה הבאה")}</span>{displayName(settings.therapist_name)?", "+displayName(settings.therapist_name):""}</>}
                body={tr("ההגדרות מוכנות. הדבר הראשון שכדאי לעשות עכשיו הוא להביא את הלקוחה הראשונה שלך: הוסיפי אותה ידנית, או שלחי לה את קישור ההזמנות שלך.")}
                actions={[
                  {label:tr("לקוחה חדשה"),onClick:()=>{setEditingClient(null);setNewClient(emptyClient);setShowClientModal(true);}},
                  {label:tr("העתקת קישור ההזמנות"),onClick:()=>copyPublicLink("book")},
                  {label:tr("ייבוא לקוחות קיימות"),onClick:()=>openImportFor("clients")},
                ]}/></div>
            )}
            {(()=>{
              const hour=now.getHours();
              const greeting=hour<12?"בוקר טוב":hour<17?"צהריים טובים":hour<21?"ערב טוב":"לילה טוב";
              // Warm, adaptive one-liner from today's existing data — no new sources.
              // Priority: full day → new leads → a lighter day → calm/empty.
              const warmMsg = todayAppts.length>=5
                ? `יום מלא היום, ${todayAppts.length} תורים. את מוכנה 💪`
                : newLeadsCount>0
                ? `${newLeadsCount} ${newLeadsCount===1?"פנייה חדשה מחכה":"פניות חדשות מחכות"} לך 🌸`
                : todayAppts.length>0
                ? `${todayAppts.length} ${todayAppts.length===1?"תור היום":"תורים היום"}, שיהיה יום נהדר ✨`
                : `${hour<12?"בוקר רגוע":hour<17?"צהריים רגועים":hour<21?"ערב רגוע":"לילה רגוע"} ☕ יום טוב לפנות ללקוחות ותיקות`;
              const bdToday=upcomingBirthdays.filter(c=>{const b=new Date(c.birthday);const bd=new Date(now.getFullYear(),b.getMonth(),b.getDate());if(bd<now)bd.setFullYear(now.getFullYear()+1);return Math.floor((bd-now)/(1000*60*60*24))===0;});
              // Revenue stats + chart moved to the "תובנות" (insights) tab.
              // openNewAppt is now component-scoped, above (lifted out of
              // this closure - see its own comment for why).
              const quickActions=[
                {label:tr("תור חדש"),hint:tr("קביעת פגישה"),icon:"✦",onClick:openNewAppt},
                {label:tr("קופה"),hint:tr("רישום תשלום"),icon:"₪",onClick:()=>handleOpenCashier(null)},
                {label:tr("לקוחה חדשה"),hint:tr("הוספה לרשימת הלקוחות"),icon:"♥",onClick:()=>{setEditingClient(null);setNewClient(emptyClient);setShowClientModal(true);}},
                {label:tr("הודעות"),hint:tr("וואטסאפ ללקוחות"),icon:"✆",onClick:()=>setActiveTab("whatsapp")},
              ];
              return(<>
                {/* TIER 1a's old greeting-bar card (pill + name + warm
                    message + 2 quick-action buttons) is retired as of the
                    target-today.html visual pass - replaced by the plain
                    top-bar rendered above (greeting word + flower mark).
                    quickActions/openNewAppt/warmMsg/bdToday above still
                    compute (bdToday feeds the birthday item in "דורש תשומת
                    לב" below; openNewAppt is still used by the empty-today
                    button; quickActions and warmMsg are now unused - kept
                    rather than deleted since this whole section, along with
                    setup-checklist/next-client/closing-list/needs-attention
                    below, is the open question from the last round: trim to
                    match the mockup's minimal structure, or keep and restyle?
                    Not decided yet, so nothing here is deleted outright. */}

                {/* SETUP CHECKLIST — prominent on the dashboard ONLY while incomplete.
                    Once every item is done it disappears from here and lives compactly
                    inside Settings (+ the always-on header ☑ button / modal). */}
                {setupOnToday && (
 <div className="glass-card card-boxed card-boxed-accent" style={{order:7,maxWidth:1180,margin:"0 auto 12px",padding:"16px 17px",borderInlineStart:`3px solid ${pc}`}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:6}}>
 <h3 className="serif" style={{fontSize:"var(--t-lg)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>{tr("הגדרת המערכת")}</h3>
 <span style={{fontSize:"var(--t-xs)",color:pcDeep,fontWeight:700}}>{setupDone}/{setupTotal}</span>
 </div>
                  {renderSetupBody()}
 </div>
                )}

                {/* ── THE NEXT CLIENT (only in the 45 minutes before she arrives) ── */}
                {(()=>{
                  const brief=buildNextClientBrief({appointments:clientAppts,clients,now,startMinute,endMinute});
                  if(!brief) return null;
                  const {appt,client,minutesUntil,lastVisit,allergies,note,isNew}=brief;
                  return(
 <div className="glass-card card-boxed card-boxed-accent" style={{order:2,maxWidth:1180,margin:"0 auto 12px",padding:"16px 20px",borderInlineStart:"4px solid var(--pc)"}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,margin:"0 0 2px"}}>{untilHe(minutesUntil)}</p>
 <p className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:"var(--ink)",margin:"0 0 8px"}}>{appt.name}{appt.service?" · "+appt.service:""}</p>
 <div style={{display:"flex",flexDirection:"column",gap:4}}>
                        {isNew&&<p style={{fontSize:"var(--t-md)",color:"var(--ink-2)",margin:0}}>{tr("ביקור ראשון שלה אצלך.")}</p>}
                        {lastVisit&&<p style={{fontSize:"var(--t-md)",color:"var(--ink-2)",margin:0}}>{tr("פעם שעברה")}{lastVisit.service?": "+lastVisit.service:""}, {lastVisit.ago}.</p>}
                        {allergies&&<p style={{fontSize:"var(--t-md)",color:"var(--ink)",margin:0,background:"rgba(240,180,41,0.16)",borderRadius:"var(--r-xs)",padding:"4px 10px",alignSelf:"flex-start"}}>{tr("אלרגיות:")} {allergies}</p>}
                        {note&&<p style={{fontSize:"var(--t-md)",color:"var(--ink)",margin:0}}>{trv(note)}</p>}
                        {client&&!allergies&&!note&&!isNew&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",margin:0}}>{tr("אין הערות עליה. אפשר להוסיף בכרטיס שלה.")}</p>}
 </div>
 </div>
                  );
                })()}

                {/* ── BEFORE YOU GO HOME: at most three lines, or the sentence that lets her go ── */}
                {(()=>{
                  const nowMin=now.getHours()*60+now.getMinutes();
                  const todayLive=todayAppts.filter(a=>a.confirmation_status!=="cancelled");
                  const allEnded=todayLive.length>0&&todayLive.every(a=>{const e=endMinute(a);return e!==null&&e<=nowMin;});
                  // The evening, or the moment the last client has left.
                  if(myDayOn||!(now.getHours()>=17||allEnded)) return null;
                  const {items,allClear}=buildClosingList({appointments:clientAppts,receipts:liveRcpts,now,endMinute});
                  return(
 <div className="glass-card card-boxed" style={{order:9,maxWidth:1180,margin:"0 auto 12px",padding:"16px 20px"}}>
 <p className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:"var(--ink)",margin:"0 0 8px"}}>{tr("לפני שהולכים הביתה")}</p>
                      {allClear?(
 <p style={{fontSize:"var(--t-md)",color:"var(--ink-2)",margin:0}}>{ALL_CLEAR_HE}</p>
                      ):(
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
                          {items.map(it=>(
 <div key={it.key} style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
 <p style={{fontSize:"var(--t-md)",color:"var(--ink)",margin:0,flex:"1 1 220px"}}>{trv(it.text)}</p>
                              {it.appt&&<button onClick={()=>handleOpenCashier(it.appt)} className="primary-btn" style={{padding:"7px 14px",fontSize:"var(--t-sm)"}}>{tr("לרשום תשלום")}</button>}
 </div>
                          ))}
 </div>
                      )}
 </div>
                  );
                })()}

                {/* ── TIER 1b: FOCAL — Today (primary) + Needs attention ── */}
 <div style={{order:4,maxWidth:1180,margin:"0 auto",display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-start"}}>

 {/* TODAY — the focal point: widest, most prominent */}
 {!myDayOn&&<div className="fm-in glass-card card-boxed" style={{padding:"16px 17px",flex:"2 1 380px",minWidth:0}}>
                    {/* The mockup replaces this card's old icon+heading+count
                        header with just the divider below - the divider
                        itself is the "new section" signal, no label needed. */}
 <div style={{display:"flex",alignItems:"center",gap:9,margin:"0 2px 16px"}}>
 <span style={{flex:1,height:1,background:"rgba(192,122,114,.4)"}}/>
 <BrandImage width={22} height={22} aria-hidden alt="" src={FLOWER_128} style={{width:22,height:22,objectFit:"contain",opacity:0.85}}/>
 <span style={{flex:1,height:1,background:"rgba(192,122,114,.4)"}}/>
 </div>
                    {(()=>{
                      // The mockup's 4th example row ("התפנה / ממתין
                      // להחלטה שלך") isn't a real appointment - it is THIS
                      // pending question, shown a second time as a synthetic
                      // row in its own place on the timeline, not just as the
                      // card above. Only for a same-day gap_fill (a comeback
                      // question has no slot to place on the clock), and only
                      // once the slot-still-free check above has let it
                      // through to pendingQuestion at all.
                      const p=pendingQuestion?.payload;
                      const gapFill=(pendingQuestion&&!businessQuiet.quietNow&&pendingQuestion.kind==="gap_fill"&&p?.date===today)
                        ?{__gapFill:true,id:`gap-fill-${pendingQuestion.id}`,startMinute:Number(p.startMinute)||0}
                        :null;
                      const rows=gapFill?[...todayEntries,gapFill]:todayEntries;
                      if(rows.length===0) return (
 <div style={{textAlign:"center",padding:"20px 14px"}}>
 <div style={{width:52,height:52,borderRadius:"var(--r-md)",margin:"0 auto 12px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-2xl)",background:"var(--pc-tint)"}}>☕</div>
 <p style={{fontSize:"var(--t-md)",fontWeight:600,color:"var(--ink)",marginBottom:4}}>{tr("אין תורים להיום")}</p>
 <p style={{fontSize:"var(--t-md)",color:"var(--ink-3)",marginBottom:16,lineHeight:1.5}}>{tr("יום פנוי. הזדמנות טובה לקבוע תור או להתארגן")}</p>
 <button className="empty-cta" onClick={openNewAppt} style={{background:pcGrad,color:"var(--pc-contrast)",border:"none",borderRadius:"var(--r-xl)",padding:"10px 20px",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:"var(--shadow-accent)"}}>{tr("✦ קביעת תור")}</button>
 </div>
                      );
                      return rows.slice().sort((a,b)=>(a.__gapFill?a.startMinute:startMinute(a)??0)-(b.__gapFill?b.startMinute:startMinute(b)??0)).map((a)=>{
                        if(a.__gapFill){
                          const hh=String(Math.floor(a.startMinute/60)).padStart(2,"0");
                          const mm=String(a.startMinute%60).padStart(2,"0");
                          return(
 <div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 3px"}}>
 <span aria-hidden style={{width:7,height:7,borderRadius:"50%",background:"transparent",border:"1px solid #C07A72",flexShrink:0}}/>
 <span style={{fontSize:13,fontWeight:700,color:"var(--brand-muted)",flexShrink:0,width:40}}>{hh}:{mm}</span>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:15,color:"#C07A72"}}>{tr("התפנה")}</p>
 <p style={{fontSize:12.5,color:"var(--brand-muted)",marginTop:1}}>{tr("ממתין להחלטה שלך")}</p>
 </div>
 </div>
                          );
                        }
                        // "ממתין" on her own time would be a lie about a
                        // confirmation nobody is waiting for.
                        const st={l:apptStatus(a,{personal:isPersonal(a)}).label};
                        // Quiet rows, matching design/target-today.html's .ap
                        // exactly: a filled sage dot is the default (confirmed/
                        // pending/personal - the expected, common states); an
                        // open rose-ring dot plus rose name text is the
                        // mockup's "needs your attention" treatment, reused
                        // here for cancelled/no-show for the same reason -
                        // these are the real app's equivalent of "this one is
                        // not like the others".
                        const open=a.confirmation_status==="cancelled"||a.confirmation_status===NO_SHOW;
                        const sub=open?`${entrySubtitle(a)} · ${st.l}`:entrySubtitle(a);
                        return(
 <div key={a.id} role="button" tabIndex={0} onClick={()=>handleApptClick(a)} onKeyDown={onKbdActivate} data-testid="today-row-open" style={{display:"flex",alignItems:"center",gap:10,padding:"9px 3px",minHeight:44,cursor:"pointer",opacity:a.confirmation_status==="cancelled"?0.55:1}}>
                            {open?(
 <span aria-hidden style={{width:7,height:7,borderRadius:"50%",background:"transparent",border:"1px solid #C07A72",flexShrink:0}}/>
                            ):(
 <span aria-hidden style={{width:7,height:7,borderRadius:"50%",background:"#DCE4D5",flexShrink:0}}/>
                            )}
 <span style={{fontSize:13,fontWeight:700,color:"var(--brand-muted)",flexShrink:0,width:40}}>{entryTime(a)}</span>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:15,color:open?"#C07A72":"var(--ink)"}}>{isPersonal(a)?"🔒 ":""}{a.name}</p>
 <p style={{fontSize:12.5,color:"var(--brand-muted)",marginTop:1}}>{trv(sub)}</p>
 </div>
 </div>
                        );
                      });
                    })()}
 </div>}

 {/* NEEDS ATTENTION — secondary (today's birthdays folded in as an action). Not while the 3-step card is on Today: on an empty account it only said "הכל מטופל" (lib/firstBooking.js showAttentionOnToday). */}
 {attentionOnToday&&<div className="fm-in glass-card card-boxed" data-testid="needs-attention" style={{animationDelay:"0.06s",padding:"24px 26px",flex:"1 1 280px",minWidth:0}}>
 <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
 <span style={{width:34,height:34,borderRadius:"var(--r-sm)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-lg)",background:"rgba(242,184,75,0.14)",color:"var(--warning)"}}>✷</span>
 <h3 className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>{tr("דורש תשומת לב")}</h3>
 </div>
                    {(()=>{
                      // Unified approval queue: individual pending actions collected from
                      // existing signals (leads, cold clients, birthdays, tomorrow reminders).
                      // Each item carries its own primary action; nothing is sent — actions
                      // open an editable surface (booking modal / lead drawer) or navigate.
                      const q=[];
                      // UX pass 2026-11-08 (audit item 2): no item twice on Today. When "היום שלי" already lists every
                      // person an item is about (its "מחכה לך" rows), the item here steps aside.
                      const onMyDay=new Set(myDayOn?(myDayModel?.needs||[]).map(it=>String(it.appt?.id??it.lead?.id??"")):[]);
                      const allOnMyDay=(rows)=>myDayOn&&rows.length>0&&rows.every(r=>onMyDay.has(String(r.id)));
                      leadsWithReminders.forEach(l=>q.push({key:`lead:${l.id}`,icon:"◴",accent:"var(--danger)",source:"פניות",what:tr("מעקב אחר פנייה"),who:l.name,why:tr("תזכורת מעקב להיום{0}", [l.service_interest?` · ${l.service_interest}`:""]),primaryLabel:"פתחי פנייה",run:()=>{setSelectedLead(l);setActiveTab("leads");}}));
                      // Lapsed clients, capped at three.
                      //
                      // This used to be `coldClients.forEach`, one card each,
                      // with no limit. On a real book that is 40 or 80 cards,
                      // and every one of them pushes the things that are
                      // actually time-critical - a lead reminder due today,
                      // tomorrow's confirmations, a birthday - off the bottom
                      // of the screen. A queue that always has eighty items in
                      // it is not a queue, and she stops reading it.
                      //
                      // Longest-absent first, because that is the order in
                      // which they stop coming back at all, and the rest
                      // collapse into one line that opens the triage list.
                      const coldSorted = [...coldClients].sort((a,b)=>getDaysSince(b.id)-getDaysSince(a.id));
                      coldSorted.slice(0,3).forEach(c=>q.push({key:`rebook:${c.id}`,icon:"✦",accent:"var(--warning)",source:"לקוחות",what:tr("הצעת תור חוזר"),who:c.name,why:tr("לא ביקרה {0} יום", [getDaysSince(c.id)]),primaryLabel:"קבעי תור",run:()=>{const svc=activeServices[0];setEditingAppointmentId(null);setNewAppt({clientId:c.id,name:c.name,service:svc?.name||"",duration:svc?.duration||60,date:formatDate(nextOpenDay(settings)),hour:settings.working_hours_start,price:svc?.price||0});setApptNote("");setShowModal(true);}}));
                      if(coldSorted.length>3)q.push({key:"cold-rest",icon:"✦",accent:"var(--warning)",source:"לקוחות",what:tr("עוד לקוחות שמזמן לא הגיעו"),who:`${coldSorted.length-3} לקוחות נוספות`,why:tr("אפשר לעבור עליהן ולשלוח הודעה למי ששווה"),primaryLabel:"פתחי את הרשימה",run:()=>setShowLapsed(true)});
                      if(newLeadsCount>0&&!allOnMyDay(leads.filter(l=>l.status==="no_answer"||l.status==="new")))q.push({key:"newleads",icon:"✉",accent:"var(--pc)",source:"פניות",what:tr("מענה לפניות חדשות"),who:`${newLeadsCount} פניות חדשות`,why:tr("ממתינות למענה ראשוני"),primaryLabel:"פתחי פניות",run:()=>setActiveTab("leads")});
                      bdToday.forEach(c=>q.push({key:`bday:${c.id}`,icon:"🎀",accent:"var(--danger)",source:"לקוחות",what:tr("ברכת יום הולדת"),who:c.name,why:tr("יום הולדת היום"),primaryLabel:"פתחי הודעות",run:()=>setActiveTab("whatsapp")}));
                      const tomorrowNotSent=tomorrowAppts.filter(a=>!a.confirmation_sent&&a.confirmation_status!=="cancelled"&&a.confirmation_status!==NO_SHOW);
                      if(tomorrowNotSent.length>0&&!allOnMyDay(tomorrowNotSent))q.push({key:"tomorrow",icon:"✆",accent:"var(--success)",source:"יומן",what:tr("תזכורות לתורי מחר"),who:countHe(tomorrowNotSent.length,"תור אחד","תורים"),why:tr("טרם נשלחה תזכורת"),primaryLabel:whatsappPending.length>0?"פתיחת הרשימה":"פתחי מרכז הודעות",run:()=>{if(whatsappPending.length>0){refreshWaQueue();setShowWaQueue(true);}else setActiveTab("whatsapp");}});
                      // Skin Follow-up suggestions from the existing route (empty when Off/paused).
                      (skinQueue||[]).forEach(s=>{ if(s&&s.clientId!=null) q.push({key:`skin:${s.clientId}`,isSkin:true,icon:"🧴",accent:"var(--pc-deep)",source:"מעקב עור",what:tr("הצעת מעקב עור"),who:s.name||"לקוחה",why:s.reasonText||"",message:s.message||"",hasPhone:!!s.hasPhone,clientId:s.clientId}); });
                      // Automated sends that FAILED in the last day, from the same log the
                      // WhatsApp tab shows. This is the in-app half of the failure report:
                      // the cron also WhatsApps her (lib/reminders/failureReport.js), but
                      // that push rides the same channel that just failed, so the card is
                      // the one that always shows. Manual sends are excluded - their result
                      // was shown to her in the modal that sent them. The key carries the
                      // newest failure's timestamp, so dismissing hides this batch and a
                      // new failure brings the card back.
                      {
                        const AUTO_TYPES=new Set(["reminder","booking_confirm","cancel_notice","slot_offer","comeback","receipt","auto_winback","auto_package_done","auto_review","auto_birthday","auto_greeting_birthday","auto_greeting_anniversary","auto_greeting_holiday","auto_rebook","auto_package_expiring","reminder_failure"]);
                        const dayAgo=Date.now()-24*60*60*1000;
                        const failedAuto=(waMessages||[]).filter(m=>m&&m.status==="failed"&&AUTO_TYPES.has(m.message_type)&&parseDb(m.created_at).getTime()>dayAgo);
                        if(failedAuto.length>0){
                          const names=[...new Set(failedAuto.map(m=>m.recipient_name).filter(Boolean))];
                          const shown=names.slice(0,4).join(", ")+(names.length>4?` ועוד ${names.length-4}`:"");
                          q.push({key:`failed-auto:${failedAuto[0].created_at}`,icon:"⚠",accent:"var(--danger)",source:"וואטסאפ",what:tr("הודעות אוטומטיות שלא נשלחו"),who:failedAuto.length===1?"הודעה אחת ב-24 השעות האחרונות":`${failedAuto.length} הודעות ב-24 השעות האחרונות`,why:shown?tr("אל: {0}", [shown]):"",primaryLabel:"פתחי את יומן ההודעות",run:()=>{setWaView("log");setActiveTab("whatsapp");}});
                        }
                      }
                      // ── Manual WhatsApp queue ───────────────────────────
                      // Everything the open-launch WhatsApp redesign queues
                      // instead of auto-sending (utility types when the admin
                      // toggle is off or the central number fell back, plus
                      // every outreach type always): one grouped item, not
                      // one row per message, same "batch where it makes
                      // sense" rule as the cold-clients cap above. Opens
                      // showWaQueue, a dedicated sheet (near the composeSend
                      // sheet) listing each with its own wa.me tap.
                      if(whatsappPending.length>0){
                        // The oldest item's wait time, so the grouped line
                        // itself carries the visible age marker - she
                        // shouldn't have to open the list to see urgency.
                        const oldestTs=Math.min(...whatsappPending.map(m=>parseDb(m.created_at).getTime()).filter(Number.isFinite));
                        const oldestMins=Number.isFinite(oldestTs)?Math.floor((Date.now()-oldestTs)/60000):null;
                        const ageWhy=oldestMins===null?"":oldestMins<60?`הראשונה ממתינה ${oldestMins} דק׳`:oldestMins<24*60?`הראשונה ממתינה ${Math.floor(oldestMins/60)} שע׳`:`הראשונה ממתינה ${contactAgoHe(new Date(oldestTs).toISOString())}`;
                        q.push({key:"wa-pending",icon:"✆",accent:"var(--success)",source:"וואטסאפ",what:tr("הודעות מוכנות לשליחה"),who:whatsappPending.length===1?"הודעה אחת":`${whatsappPending.length} הודעות`,why:ageWhy||tr("כל אחת שלוחה בלחיצה אחת מהוואטסאפ שלך"),primaryLabel:"פתיחת הרשימה",run:()=>setShowWaQueue(true)});
                      }
                      // ── Owner notifications (new booking / cancellation /
                      // hot skin-scan lead) ── replaces WhatsApp-to-herself;
                      // capped at 3 + a rest-line, same shape as cold clients.
                      // Tapping opens the appointment itself when there is
                      // one (new_booking, cancellation both carry
                      // appointment_id) - looked up in the appointments
                      // already loaded in memory, no extra query needed.
                      // Falls back to a plain "mark read" for the two kinds
                      // with no single appointment (skin_hot_lead,
                      // evening_summary) or if the row was since deleted.
                      // ── Low stock (lib/products.ts): one grouped line while anything is at or below its threshold. Its in-app
                      // notifications (kind low_stock) are this same fact, so they are not listed again and are marked read here.
                      {
                        const ls=productsApi.visible&&productsApi.status==="ready"?lowStockAttention(productsApi.products):null;
                        if(ls)q.push({key:ls.key,icon:"🧴",accent:"var(--warning)",source:"מלאי",what:tr("מלאי נמוך"),who:ls.count===1?"מוצר אחד":`${ls.count} מוצרים`,why:ls.names,primaryLabel:"למוצרים ומלאי",run:()=>{const ids=ownerNotifs.filter(n=>n.kind==="low_stock").map(n=>n.id);if(ids.length){supabase.from("owner_notifications").update({read_at:new Date().toISOString()}).in("id",ids).then(()=>{});setOwnerNotifs(prev=>prev.filter(n=>n.kind!=="low_stock"));}setActiveTab("cashier");}});
                      }
                      const listedNotifs=ownerNotifs.filter(n=>n.kind!=="low_stock");
                      listedNotifs.slice(0,3).forEach(n=>q.push({key:`ownernotif:${n.id}`,icon:n.kind==="cancellation"?"✕":n.kind==="skin_hot_lead"?"🧴":n.kind==="reminders_ready"?"✆":"✦",accent:n.kind==="cancellation"?"var(--danger)":"var(--success)",source:"התראה",what:n.title,who:"",why:n.body,primaryLabel:n.kind==="reminders_ready"?"לשליחת התזכורות":n.kind==="weekly_report"?"לסיכום המלא":n.kind==="monthly_report"?"לדוח החודשי":n.kind==="visit_feedback"?"לקריאה":n.kind==="membership"?"למנויים":n.appointment_id?"פתיחת התור":"סימון כנקרא",run:()=>{
                        supabase.from("owner_notifications").update({read_at:new Date().toISOString()}).eq("id",n.id).then(()=>{});
                        setOwnerNotifs(prev=>prev.filter(x=>x.id!==n.id));
                        if(n.kind==="reminders_ready"){refreshWaQueue();setShowWaQueue(true);return;}
                        if(n.kind==="weekly_report"){router.push("/dashboard/digest");return;}
                        if(n.kind==="monthly_report"){router.push("/dashboard/monthly");return;}
                        if(n.kind==="visit_feedback"){router.push("/dashboard/feedback");return;}
                        if(n.kind==="membership"){setActiveTab("cashier");setTillTab("memberships");return;}
                        if(n.appointment_id){
                          const appt=appointments.find(a=>String(a.id)===String(n.appointment_id));
                          if(appt){setActiveTab("calendar");setCalView("day");setCalDay(new Date(appt.date+"T00:00:00"));}
                          else toast(tr("התור הזה כבר לא קיים"));
                        }
                      }}));
                      if(listedNotifs.length>3)q.push({key:"ownernotif-rest",icon:"✦",accent:"var(--success)",source:"התראה",what:tr("עוד התראות"),who:`${listedNotifs.length-3} נוספות`,why:"",primaryLabel:"סימון הכל כנקרא",run:()=>{const ids=ownerNotifs.map(n=>n.id);supabase.from("owner_notifications").update({read_at:new Date().toISOString()}).in("id",ids).then(()=>{});setOwnerNotifs([]);}});
                      // Dedup by key (stable per client/entity) + drop dismissed AND mocked-approved.
                      const seen=new Set();
                      const visible=q.filter(it=>{if(seen.has(it.key))return false;seen.add(it.key);return !queueDismissed.has(it.key)&&!queueApproved.has(it.key);});
                      const paused=settings?.automations?.paused===true;
                      if(visible.length===0&&!skinQueueLoading&&!skinQueueError&&(!historyReady||deferred.leads!=="ok"))return(
 <div style={{textAlign:"center",padding:"18px 10px"}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",fontWeight:600}}>{(deferred.history==="error"||deferred.leads==="error")?tr("לא הצלחנו לטעון את כל הפניות וההיסטוריה, אז הרשימה הזו חלקית."):tr("בודקות מה מחכה לך. הרשימה תתמלא בעוד רגע.")}</p>
 </div>);
                      if(visible.length===0&&!skinQueueLoading&&!skinQueueError)return(
 <div style={{textAlign:"center",padding:"18px 10px"}}>
 <div style={{width:46,height:46,borderRadius:"var(--r-md)",margin:"0 auto 10px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-xl)",background:"rgba(70,179,123,0.12)",color:"var(--success)"}}>✓</div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",fontWeight:600}}>{tr("הכל מטופל")}</p>
 <p style={{fontSize:"var(--t-md)",color:"var(--ink-3)",marginTop:3}}>{tr("אין פעולות שממתינות לך כרגע")}</p>
 </div>);
                      return(<>
                        {paused&&<p style={{fontSize:"var(--t-sm)",color:"var(--warning)",fontWeight:700,background:"rgba(242,184,75,0.12)",borderRadius:"var(--r-sm)",padding:"6px 10px",marginBottom:8}}><Icon name="pause" size={13}/> {tr("האוטומציות מושהות, פעולות ידניות עדיין זמינות.")}</p>}
                        {skinQueueLoading&&skinQueue===null&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",padding:"2px 2px 8px"}}><Spinner inline label={tr("טוענת הצעות מעקב עור")}/></p>}
                        {skinQueueError&&<p style={{fontSize:"var(--t-sm)",color:"var(--danger)",fontWeight:600,background:"rgba(224,91,111,0.08)",borderRadius:"var(--r-sm)",padding:"6px 10px",marginBottom:8}}>{skinQueueError}</p>}
                        {visible.map(it=>(
 <div key={it.key} style={{border:"1px solid var(--line)",background:"var(--surface-2)",borderRadius:"var(--r-md)",padding:"11px 13px",marginBottom:8}}>
 <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
 <span style={{width:30,height:30,borderRadius:"var(--r-xs)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-md)",color:it.accent,background:lighten(it.accent,0.85)}}>{it.icon}</span>
 <div style={{flex:1,minWidth:0}}>
 <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--ink)"}}>{trv(it.what)}</p>
 <span style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--ink-3)",background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"var(--r-lg)",padding:"1px 7px"}}>{it.source}</span>
 <span style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--warning)",background:"rgba(242,184,75,0.15)",borderRadius:"var(--r-lg)",padding:"1px 7px"}}>{tr("ממתין")}</span>
 </div>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink)",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.who}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:1}}>{trv(it.why)}</p>
                                {it.isSkin&&!it.hasPhone&&<p style={{fontSize:"var(--t-sm)",color:"var(--danger)",fontWeight:600,marginTop:3}}>{tr("⚠ אין מספר טלפון ללקוחה. אפשר להוסיף אותו בכרטיס שלה")}</p>}
                                {it.isSkin&&(
 <div style={{marginTop:6}}>
 <button onClick={()=>setSkinOpen(prev=>{const n=new Set(prev);if(n.has(it.key))n.delete(it.key);else n.add(it.key);return n;})} style={{background:"none",border:"none",color:pc,fontSize:"var(--t-sm)",fontWeight:700,cursor:"pointer",fontFamily:"inherit",padding:0}}>{skinOpen.has(it.key)?tr("▲ הסתר הודעה"):tr("▼ צפייה ועריכה בהודעה")}</button>
                                    {skinOpen.has(it.key)&&(
 <textarea value={skinEdits[it.key]??it.message} onChange={e=>setSkinEdits(prev=>({...prev,[it.key]:e.target.value}))} rows={3} dir="rtl" style={{width:"100%",marginTop:6,border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"8px 10px",fontSize:"var(--t-xs)",fontFamily:"inherit",direction:uiDir(),background:"var(--surface)",resize:"vertical",color:"var(--ink)"}}/>
                                    )}
 </div>
                                )}
 <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
                                  {it.isSkin?(
 <button onClick={()=>approveSkinFollowup(it)} disabled={!it.hasPhone} className="primary-btn" style={{background:it.hasPhone?pcGrad:"var(--line-2)",color:"var(--pc-contrast)",fontSize:"var(--t-md)",padding:"7px 15px",opacity:it.hasPhone?1:0.65,cursor:it.hasPhone?"pointer":"not-allowed"}}>{tr("שליחה בוואטסאפ ✓")}</button>
                                  ):(
 <button onClick={it.run} className="primary-btn" style={{background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-md)",padding:"7px 15px"}}>{it.primaryLabel}</button>
                                  )}
 <button onClick={()=>setQueueDismissed(prev=>{const n=new Set(prev);n.add(it.key);return n;})} style={{background:"var(--surface)",border:"1px solid var(--line-2)",borderRadius:"var(--r-lg)",fontSize:"var(--t-md)",padding:"7px 12px",color:"var(--ink-2)",cursor:"pointer",fontFamily:"inherit"}}>{tr("הסתרה")}</button>
 </div>
 </div>
 </div>
 </div>
                        ))}
                      </>);
                    })()}
 </div>}
 </div>

 </>);
            })()}
 </div>/* @screen-end */
  );
}
