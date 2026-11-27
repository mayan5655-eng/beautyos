"use client";
// app/screens/SettingsScreen.jsx — {showSettings&&editSettings && ...} of the owner's app.
//
// Moved out of app/beautyos.jsx by scripts/extract-screen.mjs, byte for byte: nothing between the two markers below was
// rewritten. Everything it reads from the app arrives in one `ctx` object, whose names scripts/check-screens.mjs holds
// equal to what beautyos.jsx passes. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back
// in its place, so the tests that protect these words still read them where they always were.
//
// To change this screen: edit it here. To give it something new from the app: add the name to the destructuring below
// AND to the ctx={{...}} of <SettingsScreen> in app/beautyos.jsx (the check fails until both sides agree).
import { parseDb } from "@/lib/dbTime";
import { SETTINGS_SWATCHES, swatchLabel } from "@/lib/brandSwatches";
import { normalizeBusinessHours, legacyHoursFromMap } from "@/lib/businessHours";
import { LEAD_STATUS_KEYS, LEAD_STATUS_LABELS } from "@/lib/leads/statuses";
import { DEFAULT_LEAD_TEMPLATES } from "@/lib/leads/templates";
import { FLOWER_64, ROSE_DIVIDER, ICON_QUESTION, ICON_HEART } from "@/lib/brand";
import BrandImage from "@/app/BrandImage";
import { UpgradeChip, UpgradesEntry } from "../UpgradesStore";
import { isDemoTenantId } from "@/lib/demoTenants";
import Sheet from "../Sheet";
import Spinner from "../Spinner";
import Icon from "../Icon";
import { eveningSummaryOn, withEveningSummary } from "@/lib/eveningSummarySetting";
import { businessBufferDefault, cleanBufferMinutes, BUFFER_OPTIONS, SERVICE_BUFFER_LABEL_HE } from "@/lib/serviceBuffer";
import { suggestedRebookDays, cleanRebookDays, typedRebookDays, rebookVisible } from "@/lib/reminders/rebookPlan.js";
import LoyaltySettings from "../LoyaltySettings";
import { defaultHowIWork, defaultHeroHeadline, defaultValueProps } from "@/lib/branding";
import { STUCK_HE } from "@/lib/errorCopy";
import { LUNCH_DEFAULT } from "@/lib/lunchBreak";
import { serviceImage } from "@/lib/defaultImages";
import { slugError } from "@/lib/slug";
import { latinSlugFromName } from "@/lib/latinSlug";
import { resolveLeadSources } from "@/lib/leadSources";
import ServiceDepositToggle from "../ServiceDepositToggle";
import ServiceIntakeToggle from "../ServiceIntakeToggle";
import { intakeColumnReady } from "@/lib/intakeGate";
import { birthdayOfferOf } from "@/lib/birthdayOffer";
import { isTabVisible, settingsToggleTabs, SWITCHABLE_LABELS, skinScanVisible, SKIN_SCAN_LABEL } from "@/lib/featureFlags";
import { VIEW_MODE_KEY, VIEW_MODES, VIEW_MODE_LABELS, viewModeOf, viewAllowsSettingsGroup } from "@/lib/viewMode";
import { reviewTimingOf, looksLikeGoogleLink, GOOGLE_LINK_HELP, GOOGLE_LINK_INVALID_HE } from "@/lib/reviewRequests";
import { giftVouchersVisible } from "@/lib/giftVouchers";
import { businessFieldsOf, BUSINESS_FIELDS } from "@/lib/businessFields";
import { copyText } from "@/lib/copyText";
import { LANGS, LANG_LABELS, langOfSettings } from "@/lib/i18n/core";
import { tr, trv, uiDir } from "@/lib/i18n/tr";

export default function SettingsScreen({ ctx }) {
  const {
    activeServices, askConfirm, authEmail, AutoToggleRow, BillingCard, BookingButtonsCard, brandUploading,
    BusinessReferralCard, CalendarFeedCard, clientReviews, clientReviewsError, CLOSE_HOURS, closeSettings,
    copyPublicLink, DAYS_HE, downloadScanQr, editServices, editSettings, fbPageBusy, fbPages, FieldPicker,
    GiftVoucherSettings, GoalsEditor, GreetingsPanel, GrowCard, handleAddService, handleAddTemplateServices,
    handleChangePassword, handleDeleteService, handleLogout, HOURS_ALL, hourSelectStyle, ImportFromSystem, inG,
    isBusy, LEAD_STATUS_COLORS, leadKeyBusy, leadKeyConfigured, leadKeyJustGenerated, LeadSourcesEditor,
    legalAccount, legalKeyId, legalMsg, legalSecret, loadAll, loadScanLink, mySlug, newService, openImportHub,
    origin, panelDirty, patchDraftService, PaymentsSettings, pc, pcDeep, pcGrad, pcTint, productsApi,
    ProductSettings, PushSubscribeButton, pwConfirm, pwCurrent, pwNew, RebookSetting, renderImportChooser,
    ResultsManager, saveAutomationsKey, saveSettingsPanel, saveSlug, scanLink, scanLinkError, scanQr, scanQuota,
    services, ServiceTemplatePicker, setBusyKey, setEditSettings, setLeadKeyBusy, setLeadKeyConfigured,
    setLeadKeyJustGenerated, setLegalAccount, setLegalKeyId, setLegalMsg, setLegalSecret, setNewService,
    setPwConfirm, setPwCurrent, setPwNew, setSettingsGroup, setShowNewService, setShowSetup,
    setShowTemplatePicker, setSlugDraft, setSlugNote, setTemplatePicks, settings, settingsGroup, setupDone,
    setupTotal, showNewService, showTemplatePicker, slugBusy, slugDraft, slugNote, taxStatusUnconfirmed, team,
    TeamSettings, templatePicks, tillOnly, toast, Toggle, toggleDraftServiceActive, toggleFbPage,
    toggleReviewHidden, undeleteDraftService, uploadBrandAsset, uploadClinicPhoto, uploadGalleryImage,
    uploadServicePhoto, VisitFeedbackPanel, WaAutoMessagesSetting, waCentralConnected, WaitlistOfferSetting,
  } = ctx;
  return (
    /* @screen-body */<Sheet open onClose={()=>closeSettings()} width={440} zIndex={1000} flush className="sheet-column pop-in" ariaLabel={tr("הגדרות")}>
 <div style={{padding:"20px 24px 0"}}>
 <h3 className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",marginBottom:14}}><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" style={{fill:"none",stroke:"currentColor",strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round",verticalAlign:"-2px"}}><circle cx="12" cy="12" r="3.2"/><path d="M12 2.6v2.6M12 18.8v2.6M21.4 12h-2.6M5.2 12H2.6M18.6 5.4l-1.9 1.9M7.3 16.7l-1.9 1.9M18.6 18.6l-1.9-1.9M7.3 7.3L5.4 5.4"/></svg> {tr("הגדרות")}</h3>
 {/* Compact setup-checklist entry — the checklist's home once it leaves the dashboard */}
 <button onClick={()=>setShowSetup(true)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",background:pcTint,border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"10px 12px",marginBottom:14,cursor:"pointer",fontFamily:"inherit",textAlign:"right"}}>
 <span style={{fontSize:"var(--t-lg)",color:setupDone===setupTotal?"var(--success)":pc,flexShrink:0}}>{setupDone===setupTotal?"✓":"☑"}</span>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)"}}>{tr("הגדרת המערכת")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>{setupDone===setupTotal?tr("הכל מוכן. אפשר לעדכן בכל עת"):tr("רשימת ההגדרות להשלמה")}</p>
 </div>
 <span style={{fontSize:"var(--t-xs)",color:pcDeep,fontWeight:700,flexShrink:0}}>{setupDone===setupTotal?"✨":`${setupDone}/${setupTotal}`}</span>
 </button>
 <UpgradesEntry variant="settings"/>
 <div style={{display:"flex",gap:2,borderBottom:"1px solid var(--line)",flexWrap:"wrap"}}>
                {[{k:"business",l:tr("העסק שלי")},{k:"page",l:tr("הדף שלי")},{k:"booking",l:tr("יומן ושירותים")},{k:"payments",l:tr("תשלומים")},{k:"messages",l:tr("הודעות")},{k:"clients",l:tr("לקוחות ופניות")},{k:"connections",l:tr("חיבורים")},{k:"advanced",l:tr("מתקדם")}].map(t=>(viewAllowsSettingsGroup(settings,t.k)&&
 <button key={t.k} onClick={()=>setSettingsGroup(t.k)} style={{background:"none",border:"none",padding:"10px 12px",fontSize:"var(--t-sm)",fontWeight:settingsGroup===t.k?700:500,color:settingsGroup===t.k?pcDeep:"var(--ink-3)",borderBottom:settingsGroup===t.k?`2.5px solid ${pc}`:"2.5px solid transparent",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",transition:"color 0.2s"}}>{trv(t.l)}</button>
                ))}
 </div>
 </div>
 <div style={{padding:"16px 24px",overflowY:"auto",flex:1}}>
              {inG("business","clients","connections","advanced")&&(
 <div style={{display:"flex",flexDirection:"column",gap:9}}>
 {inG("business")&&(<BillingCard pc={pc} pcTint={pcTint} toast={toast} isDemo={isDemoTenantId(settings?.tenant_id)}/>)}
 {inG("business")&&(<BusinessReferralCard pc={pc} pcTint={pcTint} toast={toast} isDemo={isDemoTenantId(settings?.tenant_id)}/>)}
 {inG("connections")&&(<>
 <div style={{border:"1px solid var(--line-2)",borderRadius:"var(--r-md)",padding:"14px",background:"var(--surface-2)",display:"flex",flexDirection:"column",gap:8}}>
 <p style={{fontSize:"var(--t-md)",fontWeight:700,color:"var(--ink)",margin:0}}>{tr("פייסבוק ואינסטגרם")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",lineHeight:1.6,margin:0}}>{tr("פניות ממודעות הפניות שלך מגיעות לבד לרשימת הפניות. כאן רואים אילו דפים מחוברים, ואפשר להפסיק קבלת לידים מדף מסוים בלי למחוק כלום.")}</p>
 {fbPages===null?<Spinner inline label={tr("בודקת חיבור")}/>:fbPages.length===0?(
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",margin:0}}>{tr("עוד לא חיברת דף פייסבוק.")}</p>
 ):fbPages.map(p=>(
 <div key={p.page_id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",background:"var(--surface)"}}>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--ink)",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.page_name}</p>
 <p style={{fontSize:"var(--t-xs)",color:p.is_active?"var(--success)":"var(--ink-3)",margin:0}}>{p.is_active?tr("✓ פניות מהדף מגיעות אלייך"):tr("קבלת פניות מהדף מופסקת")}</p>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",margin:0}}>{p.instagram_business_id?tr("חשבון אינסטגרם עסקי מקושר לדף"):tr("אין חשבון אינסטגרם עסקי מקושר לדף")}</p>
 </div>
 <button disabled={fbPageBusy===p.page_id} onClick={()=>toggleFbPage(p.page_id,!p.is_active)} className="primary-btn" style={{padding:"7px 12px",background:"var(--surface)",color:pcDeep,border:"1px solid var(--line-2)",fontSize:"var(--t-xs)",whiteSpace:"nowrap"}}>{fbPageBusy===p.page_id?<Spinner inline label={tr("רגע")}/>:p.is_active?tr("הפסקת פניות"):tr("הפעלה מחדש")}</button>
 </div>
 ))}
 {fbPages&&fbPages.length>0&&<p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",lineHeight:1.6,margin:0}}>{tr("חיבור מחדש מרענן את ההרשאות (למשל כדי לראות נתוני קמפיינים) ומאפשר להוסיף דף נוסף. הדפים שכבר מחוברים נשארים.")}</p>}
 <button data-testid="fb-reconnect" onClick={()=>{window.location.href="/api/facebook/oauth/start";}} className="primary-btn" style={{padding:"9px 14px",background:"#1877F2",color:"#fff",fontSize:"var(--t-sm)",alignSelf:"flex-start"}}>{fbPages&&fbPages.length>0?tr("התחברי מחדש לפייסבוק"):tr("התחברי לפייסבוק")}</button>
 </div>
 {/* Automatic WhatsApp sending is not live yet (the central number is not connected): the box appears only once it is (owner,
     2026-11-03). Messages meanwhile wait in "הודעות מוכנות לשליחה", which the messages group explains. */}
 {waCentralConnected===true&&(
 <div style={{border:"1px solid var(--line-2)",borderRadius:"var(--r-md)",padding:"14px",background:"var(--surface-2)"}}>
 <p style={{fontSize:"var(--t-md)",fontWeight:700,color:"var(--ink)",margin:"0 0 4px"}}>{tr("וואטסאפ")}</p>
 <p style={{fontSize:"var(--t-sm)",lineHeight:1.6,margin:0,color:waCentralConnected===true?"var(--success)":waCentralConnected===false?"var(--warning)":"var(--ink-3)"}}>{waCentralConnected===true?tr("✓ המספר המרכזי מחובר: תזכורות ואישורים יוצאים אוטומטית."):waCentralConnected===false?tr("בשלב הזה ההודעות לא יוצאות לבד: הן מחכות לך ב\"הודעות מוכנות לשליחה\", לחיצה אחת לכל הודעה."):tr("בודקת את מצב החיבור...")}</p>
 </div>
 )}
 </>)}
 {inG("business")&&(<>
 <div><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>{tr("שם העסק")}</p><input value={editSettings.business_name||""} onChange={e=>setEditSettings({...editSettings,business_name:e.target.value})} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface-2)"}}/></div>
 </>)}
 {inG("business")&&(<>
 <div><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>{tr("שם המטפלת")}</p><input value={editSettings.therapist_name||""} onChange={e=>setEditSettings({...editSettings,therapist_name:e.target.value})} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface-2)"}}/></div>
 </>)}
 {/* מה מוצג לי במערכת (lib/viewMode.ts): a view preference only. Takes effect on save; nothing is deleted or switched off. */}
 {inG("business")&&(
 <div data-testid="view-mode-setting"><p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:4}}>{tr("מה מוצג לי במערכת")}</p>
 <div role="radiogroup" aria-label={tr("מה מוצג לי במערכת")} style={{display:"flex",gap:6}}>
                  {VIEW_MODES.map(k=>{
                    const sel=viewModeOf(editSettings)===k;
                    return <button key={k} type="button" role="radio" aria-checked={sel} data-testid={`view-mode-${k}`} onClick={()=>setEditSettings(prev=>({...prev,automations:{...((prev.automations&&typeof prev.automations==="object")?prev.automations:{}),[VIEW_MODE_KEY]:k}}))} style={{flex:1,padding:"9px 6px",minHeight:44,borderRadius:"var(--r-sm)",fontSize:"var(--t-xs)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:sel?`1.5px solid ${pc}`:"1px solid var(--line-2)",background:sel?"var(--pc-tint)":"var(--surface)",color:sel?pcDeep:"var(--ink-2)"}}>{trv(VIEW_MODE_LABELS[k])}</button>;
                  })}
 </div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:4,lineHeight:1.5}}>{viewModeOf(editSettings)==="till_only"?tr("רק הקופה, הלקוחות, כרטיסיית הניקובים וההכנסות שלך. היומן, ההודעות והשיווק מוסתרים מהתפריט, לא נמחק כלום, ודף ההזמנות שלך ממשיך לעבוד. אפשר לחזור להכל בכל רגע."):tr("כל המסכים מוצגים: יומן, קופה, לקוחות, הודעות ושיווק.")}</p></div>
 )}
 {/* שפה (lib/i18n): the business's language. It is the language of her whole system, of her booking page and every page her
     clients open, and the language the health declaration opens in (the client can still switch the form on her side).
     Stored in branding.language, which the public pages already read: no migration. Takes effect on save. */}
 {inG("business")&&(
 <div data-testid="language-setting"><p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:4}}>{tr("שפת המערכת")}</p>
 <div role="radiogroup" aria-label={tr("שפת המערכת")} style={{display:"flex",gap:6}}>
                  {LANGS.map(l=>{
                    const sel=langOfSettings(editSettings)===l;
                    return <button key={l} type="button" role="radio" aria-checked={sel} lang={l} data-testid={`language-${l}`} onClick={()=>setEditSettings(prev=>({...prev,branding:{...((prev?.branding&&typeof prev.branding==="object")?prev.branding:{}),language:l}}))} style={{flex:1,minHeight:44,padding:"9px 4px",borderRadius:"var(--r-sm)",fontSize:"var(--t-sm)",fontWeight:sel?700:600,border:sel?"1.5px solid var(--ink)":"1px solid var(--line-2)",background:sel?"var(--pc-tint)":"var(--surface)",color:"var(--ink)",cursor:"pointer",fontFamily:"inherit"}}>{LANG_LABELS[l]}</button>;
                  })}
 </div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:4,lineHeight:1.5}}>{tr("כל המערכת שלך, עמוד קביעת התורים וכל העמודים שהלקוחות שלך פותחות יוצגו בשפה הזו. הצהרת הבריאות נפתחת בה, והלקוחה יכולה להחליף שפה בטופס עצמו. ההודעות האוטומטיות בוואטסאפ נשלחות בעברית.")}</p>
 </div>
 )}
 {inG("advanced")&&(
 <button type="button" data-testid="settings-logout" onClick={handleLogout} disabled={isBusy("logout")} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",minHeight:44,background:"var(--surface)",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"0 12px",fontSize:"var(--t-sm)",fontWeight:700,color:"var(--ink)",cursor:"pointer",fontFamily:"inherit"}}><span>{tr("התנתקות")}{authEmail?` (${authEmail})`:""}</span><span aria-hidden>⏻︎</span></button>
 )}
 {inG("advanced")&&(<>
 <div><p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:5}}>{tr("צבע מותג")}</p><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{SETTINGS_SWATCHES.map(col=><button key={col} type="button" aria-label={swatchLabel(col)} title={swatchLabel(col)} aria-pressed={editSettings.primary_color===col} onClick={()=>setEditSettings({...editSettings,primary_color:col})} style={{width:34,height:34,borderRadius:"50%",background:col,border:editSettings.primary_color===col?"3px solid var(--ink)":"2px solid var(--line-2)",cursor:"pointer",boxShadow:editSettings.primary_color===col?"var(--shadow-sm)":"none",transition:"transform 0.12s"}}/>)}</div></div>
 </>)}
 {inG("clients")&&(
 <LoyaltySettings settings={editSettings} serviceNames={(editServices||services).filter(sv=>sv.active!==false).map(sv=>String(sv.name||"").trim()).filter(Boolean)} pc={pc} pcTint={pcTint}
   onChange={(next)=>setEditSettings(prev=>({...prev,automations:{...((prev.automations&&typeof prev.automations==="object")?prev.automations:{}),loyalty:next}}))}/>
 )}
 {inG("clients")&&(<>
 <div><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>{tr("לינק ביקורת (Google)")}</p><input value={editSettings.review_url||""} onChange={e=>setEditSettings({...editSettings,review_url:e.target.value})} placeholder="https://g.page/r/..." style={{width:"100%",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:"ltr",textAlign:"left",background:pcTint}}/><p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:4,lineHeight:1.5}}>{tr("אחרי טיפול הלקוחה נשאלת \"איך היה?\". מי שנהנתה מקבלת את הקישור הזה לביקורת בגוגל, ומי שמשהו הפריע לה יכולה לכתוב לך בפרטיות (וגם לה מוצע הקישור לגוגל).")}</p>
 {String(editSettings.review_url||"").trim()&&!looksLikeGoogleLink(editSettings.review_url)&&<p style={{fontSize:"var(--t-xs)",color:"var(--warning)",marginTop:4,lineHeight:1.5}}>{GOOGLE_LINK_INVALID_HE}</p>}
 <details data-testid="google-link-help" style={{marginTop:6}}><summary style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",fontWeight:700,cursor:"pointer",minHeight:32,display:"flex",alignItems:"center"}}>{tr("איך מוצאים את הקישור?")}</summary>
 <ol style={{margin:"6px 0 0",paddingInlineStart:20,fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.7}}>{GOOGLE_LINK_HELP.map((t,i)=><li key={i}>{t}</li>)}</ol></details></div>
 </>)}
 {inG("business")&&(<>
 <div><p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:4}}>{tr("סטטוס עוסק (חובה לבחור)")}</p>
 <div style={{display:"flex",gap:6}}>
                  {[{k:"exempt",l:tr("עוסק פטור")},{k:"licensed",l:tr("עוסק מורשה")},{k:"company",l:tr("חברה בע\"מ")}].map(o=>{
                    // No default: an unset status is shown as unset (below), never as "עוסק פטור".
                    const sel=editSettings.business_tax_status===o.k;
                    return <button key={o.k} onClick={()=>setEditSettings({...editSettings,business_tax_status:o.k,business_tax_status_set_at:new Date().toISOString()})} style={{flex:1,padding:"9px 4px",borderRadius:"var(--r-sm)",fontSize:"var(--t-xs)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:sel?`1.5px solid ${pc}`:"1px solid var(--line-2)",background:sel?"var(--pc-tint)":"var(--surface)",color:sel?pcDeep:"var(--ink-2)"}}>{trv(o.l)}</button>;
                  })}
 </div>
 {!editSettings.business_tax_status&&<p style={{fontSize:"var(--t-sm)",color:"var(--danger)",fontWeight:700,marginTop:6,lineHeight:1.5}}>{tr("עוד לא בחרת. בלי זה לא נפיק קבלה או חשבונית חוקית, וסיכום ההכנסות לא יחושב.")}</p>}
 {/* The live column defaults to 'exempt' (add_business_tax_status_set_at.sql): until she taps a type, it may be the default, not her answer. */}
 {!!editSettings.business_tax_status&&taxStatusUnconfirmed(editSettings)&&<p data-testid="tax-status-unconfirmed" style={{fontSize:"var(--t-sm)",color:"var(--ink)",fontWeight:700,marginTop:6,lineHeight:1.5}}>{tr("הסוג הזה נרשם אצלנו כברירת מחדל ועוד לא אישרת אותו. לחצי על הסוג הנכון ושמרי, כדי שהקבלות ממורנינג ייצאו נכון.")}</p>}
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:4,lineHeight:1.5}}>{tr("הבחירה קובעת איזה מסמך חוקי מופק ללקוחות (אם חיברת תוכנת חשבוניות), ואיך מחושב אומדן המע\"מ במסך \"סיכום הכנסות\". סיכום ההכנסות הוא לנוחותך, לא דוח להגשה.")}</p></div>
 </>)}
 {inG("connections")&&(<CalendarFeedCard pc={pc} toast={toast} isDemo={isDemoTenantId(settings?.tenant_id)}/>)}
 {inG("connections")&&(<>
 <div style={{borderTop:"1px solid var(--line)",paddingTop:12,marginTop:4}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginBottom:4,fontWeight:700}}>{tr("התראות דפדפן")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginBottom:8,lineHeight:1.5}}>{tr("תור חדש וביטול תור מגיעים לכאן במקום בוואטסאפ. הפעילי כדי לקבל אותם גם כשהאפליקציה סגורה.")}</p>
 <PushSubscribeButton pc={pc} pcGrad={pcGrad} />
 </div>
 </>)}
 {inG("business")&&(<>
 <div style={{borderTop:"1px solid var(--line)",paddingTop:12,marginTop:4}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginBottom:8,fontWeight:700}}>{tr("תחומי עיסוק")}</p>
 <FieldPicker value={businessFieldsOf(editSettings)} onChange={fields=>setEditSettings({...editSettings,business_fields:fields})} accent={pc} accentTint={pcTint} />
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:6,lineHeight:1.5}}>{tr("קובע אילו טיפולים מוצעים לך ברשימה המוכנה, ואילו תמונות ברירת מחדל ותבניות שיווק מוצגות. כיבוי תחום לא מוחק שירותים או עיצובים שכבר יצרת בו.")}</p>
 </div>
 </>)}
 {inG("clients")&&(<>
 <div style={{borderTop:"1px solid var(--line)",paddingTop:12,marginTop:4}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginBottom:8,fontWeight:700}}>{tr("קישורים ללקוחות (לשליחה בוואטסאפ / ביו)")}</p>
 {/* The scanner link, as she should share it: signed (?t=…&s=…) so the page
     loads HER colour and details and the scan is attributed to her. Shown in
     full, copied from the same string, and the QR is drawn from that string -
     a printed code and a bio link can never drift apart. */}
 {skinScanVisible(editSettings)&&(<div style={{background:"var(--surface-2)",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"12px 12px 10px",marginBottom:8}}>
   <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--ink)",marginBottom:6}}>{tr("סורק העור, הקישור לשיתוף")}</p>
   <UpgradeChip pack="skinscan" meter style={{marginTop:0,marginBottom:10}}/>
   {scanLink ? (
     <>
       <div style={{display:"flex",gap:6,alignItems:"stretch",marginBottom:8}}>
         <input readOnly value={scanLink} onFocus={e=>e.target.select()} aria-label={tr("קישור סורק העור")} dir="ltr" style={{flex:1,minWidth:0,border:"1px solid var(--line-2)",borderRadius:"var(--r-xs)",padding:"9px 10px",fontSize:"var(--t-xs)",fontFamily:"ui-monospace, monospace",color:"var(--ink-2)",background:"var(--surface)",textOverflow:"ellipsis"}}/>
         <button onClick={()=>copyPublicLink("scan")} className="primary-btn" style={{padding:"9px 14px",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)",whiteSpace:"nowrap",boxShadow:"var(--shadow-accent)"}}>{tr("העתקת קישור")}</button>
       </div>
       {scanQr && (
         <div style={{display:"flex",gap:12,alignItems:"center"}}>
           {/* eslint-disable-next-line @next/next/no-img-element -- a data URL drawn on the client; next/image has nothing to optimise */}
           <img src={scanQr} alt={tr("קוד QR לסורק העור")} width={112} height={112} style={{width:112,height:112,borderRadius:"var(--r-xs)",border:"1px solid var(--line)",background:"#fff",flexShrink:0}}/>
           <div style={{flex:1,minWidth:0}}>
             <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.5,marginBottom:8}}>{tr("אותו קישור בדיוק, כקוד לסריקה: לשלט בעסק, לכרטיס ביקור או לסטורי.")}</p>
             <button onClick={downloadScanQr} style={{background:"var(--surface)",color:pcDeep,border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"8px 14px",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}><Icon name="download" size={13}/> {tr("הורדת ה-QR (PNG)")}</button>
           </div>
         </div>
       )}
       <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",lineHeight:1.5,marginTop:8}}>{tr("הקישור נושא את מזהה העסק והחתימה שלך, כך הסורק מציג את הצבע והפרטים שלך, והסריקה נרשמת אצלך. קישורים ישנים שכבר שיתפת (עם ‎?t=‎) ממשיכים לעבוד.")}</p>
     </>
   ) : scanLinkError ? (
     <div style={{display:"flex",gap:8,alignItems:"center",justifyContent:"space-between"}}>
       <p style={{fontSize:"var(--t-sm)",color:"var(--danger)"}}>{scanLinkError}</p>
       <button onClick={loadScanLink} className="primary-btn" style={{padding:"8px 14px",background:"var(--surface)",color:pcDeep,border:"1px solid var(--line-2)",fontSize:"var(--t-sm)"}}>{tr("נסי שוב")}</button>
     </div>
   ) : (
     <Spinner inline label={tr("מפיקה את הקישור")}/>
   )}
 </div>)}
 {/* The ceiling, shown BEFORE it is reached. When it is hit, the client sees
     the refusal and she is not in that request at all - so this is the only
     place she can find out, and it has to be visible early enough to act on. */}
 {scanQuota && !scanQuota.unknown && (()=>{
   const pct = scanQuota.limit>0 ? scanQuota.used/scanQuota.limit : 0;
   const tone = pct>=1 ? "var(--danger)" : pct>=0.8 ? "#B26B00" : "var(--ink-3)";
   return (
     <div style={{marginBottom:7}}>
       <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:4}}>
         <span style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>{tr("סריקות החודש")}</span>
         <span style={{fontSize:"var(--t-xs)",fontWeight:700,color:tone}}>{scanQuota.used} / {scanQuota.limit}</span>
       </div>
       <div style={{height:4,borderRadius:"var(--r-xs)",background:"var(--line-2)",overflow:"hidden"}}>
         <div style={{height:"100%",width:`${Math.min(100,Math.round(pct*100))}%`,background:tone==="var(--ink-3)"?pc:tone}}/>
       </div>
       {pct>=0.8 && (
         <p style={{fontSize:"var(--t-sm)",color:tone,marginTop:5,lineHeight:1.5}}>
           {pct>=1
             ? tr("הגעת למכסת הסריקות החודשית. לקוחות שינסו לסרוק יקבלו הודעה שאפשר לפנות אליך ישירות.")
             : tr("נשארו {0} סריקות החודש.", [scanQuota.remaining])}
         </p>
       )}
     </div>
   );
 })()}
 {!tillOnly&&<button data-tour="booking-link" onClick={()=>copyPublicLink("book")} style={{width:"100%",padding:"11px 0",background:"var(--surface)",color:pcDeep,border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}><Icon name="calendar" size={14}/> {tr("העתקת קישור לקביעת תור")}</button>}
 </div>
 </>)}
 {inG("advanced")&&(<>
 <div style={{borderTop:"1px solid var(--line)",paddingTop:12,marginTop:4}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginBottom:8,fontWeight:700}}>{tr("שינוי סיסמה")}</p>
 <div style={{display:"flex",flexDirection:"column",gap:7}}>
 <input type="password" value={pwCurrent} onChange={e=>setPwCurrent(e.target.value)} placeholder={tr("סיסמה נוכחית")} autoComplete="current-password" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface-2)"}}/>
 <input type="password" value={pwNew} onChange={e=>setPwNew(e.target.value)} placeholder={tr("סיסמה חדשה (לפחות 8 תווים)")} autoComplete="new-password" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface-2)"}}/>
 <input type="password" value={pwConfirm} onChange={e=>setPwConfirm(e.target.value)} placeholder={tr("אימות סיסמה חדשה")} autoComplete="new-password" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface-2)"}}/>
 <button onClick={handleChangePassword} disabled={isBusy("changePw")} className="primary-btn" style={{padding:"10px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)",marginTop:2}}>{isBusy("changePw")?<Spinner inline label={tr("מעדכנת")}/>:tr("עדכון סיסמה")}</button>
 </div>
 </div>

 </>)}
 {inG("advanced")&&(<>
                {/* Build identity.
                    Answers "am I actually running the latest version?" without
                    her needing to send a support message to find out - which is
                    literally how we answered it once. A diagnostic that needs a
                    round trip through me is not a diagnostic she has.
                    Falls back to "פיתוח" locally, where the Vercel env var is
                    absent. Tap to copy, so reporting it is one gesture. */}
 <div style={{borderTop:"1px solid var(--line)",paddingTop:12,marginTop:4}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginBottom:6,fontWeight:700}}>{tr("גרסה")}</p>
 <button type="button"
                    onClick={()=>{
                      const v=process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA||"";
                      if(!v){toast(tr("גרסת פיתוח, אין מזהה build"),"info");return;}
                      navigator.clipboard?.writeText(v).then(()=>toast(tr("מזהה הגרסה הועתק")),()=>toast(v,"info"));
                    }}
                    style={{background:"var(--surface-2)",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"8px 11px",width:"100%",textAlign:"start",cursor:"pointer",fontFamily:"inherit"}}>
 <span style={{fontSize:"var(--t-xs)",color:"var(--ink-2)",direction:"ltr",display:"block",fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace"}}>
                      {(process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA||"").slice(0,7)||tr("פיתוח")}
 </span>
 <span style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>{tr("לחצי להעתקה")}</span>
 </button>
 </div>
 </>)}
 </div>
              )}
              {inG("page")&&(()=>{
                const brand=(editSettings.branding&&typeof editSettings.branding==="object")?editSettings.branding:{};
                const setBrand=(k,v)=>setEditSettings(prev=>({...prev,branding:{...((prev?.branding&&typeof prev.branding==="object")?prev.branding:{}),[k]:v}}));
                const lbl={fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:5};
                const inp={width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface-2)"};
                const upBtn={background:"var(--pc-tint)",color:pcDeep,border:"none",borderRadius:"var(--r-sm)",padding:"8px 14px",fontSize:"var(--t-xs)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"};
                const swatches=SETTINGS_SWATCHES;
                const colorRow=(label,val,onPick)=>(<div><p style={lbl}>{trv(label)}</p><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{swatches.map(c=><button key={c} type="button" aria-label={swatchLabel(c)} title={swatchLabel(c)} aria-pressed={val===c} onClick={()=>onPick(c)} style={{width:32,height:32,borderRadius:"50%",background:c,border:val===c?"3px solid var(--ink)":"2px solid var(--line-2)",cursor:"pointer"}}/>)}</div></div>);
                const uploader=(key,current)=>(
                  current?(
 <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
 <img src={current} alt="" style={{maxHeight:52,maxWidth:120,objectFit:"contain",background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:6}}/>
 <label style={upBtn}>{brandUploading===key?<Spinner inline label={tr("מעלה")}/>:tr("החלפה")}<input type="file" accept="image/*" disabled={!!brandUploading} style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)uploadBrandAsset(f,key);e.target.value="";}}/></label>
 <button onClick={()=>setBrand(key,"")} style={{background:"var(--surface)",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"8px 12px",fontSize:"var(--t-xs)",fontWeight:600,color:"var(--danger)",cursor:"pointer",fontFamily:"inherit"}}>{tr("הסרה")}</button>
 </div>
                  ):(
 <label style={{display:"block",border:"1.5px dashed var(--line-2)",borderRadius:"var(--r-sm)",padding:"14px",textAlign:"center",cursor:"pointer",fontSize:"var(--t-sm)",fontWeight:600,color:pcDeep,background:"var(--surface-2)"}}>{brandUploading===key?<Spinner inline label={tr("מעלה")}/>:tr("העלאת תמונה")}<input type="file" accept="image/*" disabled={!!brandUploading} style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)uploadBrandAsset(f,key);e.target.value="";}}/></label>
                  )
                );
                return(
 <div style={{display:"flex",flexDirection:"column",gap:14}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",lineHeight:1.5}}>{tr("המיתוג מופיע בעמודי הלקוחות: הסורק, תוצאות הסריקה ודף קביעת התור. אם משאירים ריק, מוצג עיצוב ברירת המחדל.")}</p>
                    {/* She has never seen the page she is editing. Every field
                        below this line is filled in blind: there is no preview
                        anywhere in the dashboard, and the only way to look at
                        her own shop window has been to copy the booking link
                        out of another screen and open it herself.

                        Opens the SAVED page, which is the honest thing for a
                        link to a live URL to do - and the caption says so,
                        because a preview that quietly showed unsaved edits
                        would be a different promise than the one this makes. */}
                    {settings?.tenant_id&&(
 <div style={{border:"1px solid var(--line-2)",borderRadius:"var(--r-md)",padding:"12px 14px",display:"flex",flexDirection:"column",gap:6}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",fontWeight:600}}>{tr("הכתובת של העמוד שלך")}</p>
                        {slugDraft===null?(
 <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
 <span style={{fontSize:"var(--t-sm)",color:"var(--ink)",fontWeight:600,direction:"ltr",wordBreak:"break-all"}}>{origin.replace(/^https?:\/\//,"")}/{mySlug||"…"}</span>
 <button onClick={()=>{setSlugNote("");setSlugDraft(mySlug&&!/[א-ת]/.test(mySlug)?mySlug:(latinSlugFromName(settings.business_name||"")||mySlug||""));}} style={{background:"none",border:"none",color:pcDeep,fontSize:"var(--t-sm)",fontWeight:700,cursor:"pointer",fontFamily:"inherit",padding:0}}>{mySlug?tr("שינוי"):tr("בחירת כתובת")}</button>
 </div>
                        ):(<>
 <div style={{display:"flex",alignItems:"center",gap:6}}>
 <span style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",direction:"ltr"}}>/</span>
 <input value={slugDraft} onChange={e=>{setSlugDraft(e.target.value.trim());setSlugNote("");}} placeholder="dana-beauty" aria-label={tr("כתובת העמוד")} style={{flex:1,border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"8px 10px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",background:"var(--surface-2)",direction:"ltr",textAlign:"left"}}/>
 </div>
                          {(slugNote||slugError(slugDraft))&&<p style={{fontSize:"var(--t-xs)",color:"var(--danger)",fontWeight:600}}>{slugNote||slugError(slugDraft)}</p>}
 <div style={{display:"flex",gap:6}}>
 <button onClick={()=>{setSlugDraft(null);setSlugNote("");}} style={{flex:1,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"8px 0",fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink-2)",cursor:"pointer",fontFamily:"inherit"}}>{tr("ביטול")}</button>
 <button onClick={saveSlug} disabled={slugBusy||!!slugError(slugDraft)} style={{flex:2,background:pcGrad,border:"none",borderRadius:"var(--r-sm)",padding:"8px 0",fontSize:"var(--t-sm)",fontWeight:700,color:"var(--pc-contrast)",cursor:"pointer",fontFamily:"inherit",opacity:(slugBusy||!!slugError(slugDraft))?0.5:1}}>{slugBusy?<Spinner inline label={tr("שומרת")}/>:tr("שמירת הכתובת")}</button>
 </div>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",lineHeight:1.5}}>{tr("אפשר בעברית או באנגלית. כתובת באנגלית נשארת קצרה ונקייה כשמעתיקים אותה לאינסטגרם ולוואטסאפ. הקישור הישן ימשיך לעבוד תמיד.")}</p>
                        </>)}
                        {slugDraft===null&&mySlug&&/[א-ת]/.test(mySlug)&&<p data-testid="hebrew-slug-hint" style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",lineHeight:1.5}}>{tr("כתובת בעברית הופכת לרצף ארוך של סימנים כשמעתיקים אותה. כדאי לבחור כתובת באנגלית, והישנה תמשיך לעבוד.")}</p>}
 </div>
                    )}
                    {settings?.tenant_id&&(
 <div style={{background:"var(--pc-tint)",borderRadius:"var(--r-md)",padding:"12px 14px",display:"flex",flexDirection:"column",gap:6}}>
 <a href={mySlug ? `${origin}/${encodeURIComponent(mySlug)}` : `${origin}/book?t=${encodeURIComponent(settings.tenant_id)}`} target="_blank" rel="noreferrer"
   style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:7,textDecoration:"none",background:pcGrad,color:"var(--pc-contrast)",borderRadius:"var(--r-sm)",padding:"10px 16px",fontSize:"var(--t-sm)",fontWeight:700,boxShadow:"var(--shadow-accent)"}}>
                        {tr("✦ צפייה בעמוד שלי")}
 </a>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-2)",textAlign:"center",lineHeight:1.5}}>{tr("נפתח בלשונית חדשה. מוצגת הגרסה השמורה, שינויים שטרם נשמרו לא יופיעו.")}</p>
 </div>
                    )}
                    {/* Her booking link into Instagram, Google, Facebook and WhatsApp Business: guided steps, tagged links, ticks (lib/bookingButtons.ts). */}
                    {settings?.tenant_id&&(
 <BookingButtonsCard
   bookingUrl={mySlug ? `${origin}/${encodeURIComponent(mySlug)}` : `${origin}/book?t=${encodeURIComponent(settings.tenant_id)}`}
   automations={settings.automations}
   onCopy={(src,msg)=>copyPublicLink("book",src,msg)}
   onSaveDone={(next)=>saveAutomationsKey("booking_buttons",next)}
   pcDeep={pcDeep}/>
                    )}
 <div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",fontWeight:600,marginBottom:2}}>{tr("תמונה שלך")}</p>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",marginBottom:8,lineHeight:1.5}}>{tr("מוצגת בחלק \"נעים להכיר\" בעמוד העסק שלך, וגם כתמונת התצוגה כששולחים את הקישור בוואטסאפ. עד שתעלי תמונה, החלק הזה לא מוצג בעמוד.")}</p>
                      {uploader("portrait_url",brand.portrait_url)}
 </div>
 <div><p style={lbl}>{tr("התפקיד שלך (מוצג ליד השם)")}</p><input value={brand.therapist_title||""} onChange={e=>setBrand("therapist_title",e.target.value)} placeholder={tr("למשל: בעלת הסטודיו")} style={inp}/><p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",marginTop:4,lineHeight:1.5}}>{tr("מוצג בדף ההזמנות מתחת לתמונה, לצד השם שהוזן ב״שם המטפלת״.")}</p></div>
 <div><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",fontWeight:600,marginBottom:6}}>{tr("לוגו העסק")}</p>{uploader("logo_url",brand.logo_url)}</div>
                    {colorRow("צבע ראשי",editSettings.primary_color,(c)=>setEditSettings({...editSettings,primary_color:c}))}
                    {colorRow("צבע משני (לעיצובים ולפוסטים)",brand.secondary_color,(c)=>setBrand("secondary_color",c))}
 {/* Named for where it appears, because the old name - "opening headline" -
     described a slot rather than a consequence. What it actually did was
     replace the business name in the page's <h1>, so a clinic that filled it
     in got a shop window that never said whose shop it was. The page shows
     both now, and the label says which is which before she types. */}
 <div><p style={lbl}>{tr("כותרת ראשית בראש הדף")}</p><input value={brand.welcome_headline||""} onChange={e=>setBrand("welcome_headline",e.target.value)} placeholder={tr("למשל: {0}", [defaultHeroHeadline(businessFieldsOf(editSettings)).replace(/\n/," ")])} style={inp}/><p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",marginTop:4,lineHeight:1.5}}>{tr("הטקסט הגדול על התמונה הראשית. כל משפט (עד נקודה) יורד לשורה חדשה, ומהמשפט השני הצבע הוא צבע המותג.")}</p></div>
 <div><p style={lbl}>{tr("משפט פתיחה קצר (מוצג אם לא מילאת שורת יתרונות)")}</p><textarea value={brand.welcome_message||""} onChange={e=>setBrand("welcome_message",e.target.value)} rows={2} placeholder={tr("הזמנה חמה ללקוחה")} style={{...inp,resize:"none"}}/></div>
 <div><p style={lbl}>{tr("לפני שמגיעים (חניה, קומה, אינטרקום)")}</p><input value={brand.arrival_note||""} onChange={e=>setBrand("arrival_note",e.target.value)} placeholder={tr("למשל: חניה חופשית ברחוב, קומה 2")} style={inp}/><p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",marginTop:4,lineHeight:1.5}}>{tr("נשלח ללקוחה באישור התור. מונע את השיחה של \"איפה בדיוק?\" חמש דקות לפני.")}</p></div>
 <div><p style={lbl}>{tr("כתובת העסק (מוצגת ללקוחה)")}</p><input value={brand.public_address||""} onChange={e=>setBrand("public_address",e.target.value)} placeholder={tr("רחוב, עיר")} style={inp}/></div>
 <div><p style={lbl}>{tr("טקסט כפתור קביעת תור")}</p><input value={brand.booking_cta_label||""} onChange={e=>setBrand("booking_cta_label",e.target.value)} placeholder={tr("קביעת תור")} style={inp}/></div>
 <div><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",fontWeight:600,marginBottom:6}}>{tr("תמונת פתיחה (רקע הדף הראשי)")}</p>{!brand.hero_image_url&&<p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",marginBottom:8,lineHeight:1.5}}>{tr("כרגע מוצגת תמונת ברירת מחדל. העלי תמונה של העסק או של טיפול והיא תחליף אותה.")}</p>}{uploader("hero_image_url",brand.hero_image_url)}</div>
 <div><p style={lbl}>{tr("תיאור העסק (אודות)")}</p><textarea value={brand.business_description||""} onChange={e=>setBrand("business_description",e.target.value)} rows={3} placeholder={tr("ספרי בקצרה על העסק, ההתמחות והגישה שלך")} style={{...inp,resize:"none"}}/></div>
 <div>
 <p style={lbl}>{tr("איך אני עובדת (עד 4 שלבים)")}</p>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",marginBottom:8,lineHeight:1.5}}>{tr("מוצג בדף ההזמנות. שורה לכל שלב. אם תרוקני את כולן, הקטע יוסתר.")}</p>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {[0,1,2,3].map(i=>{
                      const steps=Array.isArray(brand.how_i_work)?brand.how_i_work:defaultHowIWork(businessFieldsOf(editSettings));
                      return <input key={i} value={steps[i]||""} onChange={e=>{ const next=[0,1,2,3].map(j=>steps[j]||""); next[i]=e.target.value; setBrand("how_i_work",next); }} placeholder={tr("שלב {0}", [i+1])} style={inp}/>;
                    })}
 </div>
 </div>
 <div style={{borderTop:"1px solid var(--line)",paddingTop:12,display:"flex",flexDirection:"column",gap:10}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink)",fontWeight:700,marginBottom:0}}>{tr("טקסטים בדף הראשי")}</p>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",lineHeight:1.5}}>{tr("כל שדה ריק מקבל טקסט ברירת מחדל, כך שהדף נראה שלם גם בלי למלא כלום.")}</p>
 <div><p style={lbl}>{tr("שורה מתחת ללוגו")}</p><input value={brand.logo_tagline||""} onChange={e=>setBrand("logo_tagline",e.target.value)} placeholder={tr("למשל: טיפוח שמתחיל בך")} style={inp}/></div>
 <div><p style={lbl}>{tr("שורת יתרונות (מתחת לכותרת)")}</p><input value={brand.hero_benefits||""} onChange={e=>setBrand("hero_benefits",e.target.value)} placeholder={tr("למשל: אבחון מקצועי · טיפול אישי · תוצאה שרואים")} style={inp}/></div>
 <div><p style={lbl}>{tr("משפט בכתב יד (בתמונה הראשית)")}</p><input value={brand.script_accent||""} onChange={e=>setBrand("script_accent",e.target.value)} placeholder={tr("למשל: טיפוח שמתחיל באהבה עצמית")} style={inp}/></div>
 <div><p style={lbl}>{tr("חתימה בסוף \"אודותיי\" (בכתב יד)")}</p><input value={brand.about_signoff||""} onChange={e=>setBrand("about_signoff",e.target.value)} placeholder={tr("למשל: מחכה לפגוש אותך")} style={inp}/></div>
 <div>
 <p style={lbl}>{tr("ארבעת הערכים שלך (שורה מתחת לכל סמל)")}</p>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {[0,1,2,3].map(i=>{
                      const dvp=defaultValueProps(businessFieldsOf(editSettings));
                      const vals=Array.isArray(brand.value_props)?brand.value_props:dvp;
                      return <input key={i} value={vals[i]||""} onChange={e=>{ const next=[0,1,2,3].map(j=>vals[j]||""); next[i]=e.target.value; setBrand("value_props",next); }} placeholder={dvp[i]} style={inp}/>;
                    })}
 </div>
 </div>
 </div>
 {/* Feeds the marketing AI only — these three are the fields loadBusinessProfile
     renders into every prompt as קהל יעד / סגנון מותג / יתרונות תחרותיים.
     They had no input anywhere, so they were always undefined and the
     generators wrote about her audience without being told who it is. */}
 <div style={{borderTop:"1px solid var(--line)",paddingTop:12}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink)",fontWeight:700,marginBottom:2}}>{tr("✦ מידע לתוכן השיווקי")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginBottom:10}}>{tr("לא מוצג בדף ההזמנות שלך. משמש את ה-AI כשהוא כותב לך פוסטים ורילסים. ככל שתמלאי, הטקסטים יהיו מדויקים יותר לעסק שלך.")}</p>
 <div style={{display:"flex",flexDirection:"column",gap:10}}>
 <div><p style={lbl}>{tr("קהל היעד שלך")}</p><textarea value={brand.target_audience||""} onChange={e=>setBrand("target_audience",e.target.value)} rows={2} placeholder={tr("למשל: נשים 30-50 מהאזור, אמהות עובדות שמחפשות שעה לעצמן")} style={{...inp,resize:"none"}}/></div>
 <div><p style={lbl}>{tr("סגנון הפנייה שלך")}</p><input value={brand.brand_tone||""} onChange={e=>setBrand("brand_tone",e.target.value)} placeholder={tr("למשל: חם ואישי / מקצועי ורגוע / כיפי וצעיר")} style={inp}/></div>
 <div><p style={lbl}>{tr("מה מייחד אותך (שורה לכל יתרון)")}</p><textarea value={brand.unique_selling_points||""} onChange={e=>setBrand("unique_selling_points",e.target.value)} rows={3} placeholder={tr("למשל:\nחניה חופשית ליד העסק\nמוצרים טבעיים בלבד\n12 שנות ניסיון")} style={{...inp,resize:"none"}}/></div>
 {/* "פוסטים שאני אוהבת": voice samples for every generator (lib/ai/voiceExamples.ts).
     Voice only - the prompt forbids taking facts from them and the claims guard never sees them. */}
 <div>
 <p style={lbl}>{tr("פוסטים שאת אוהבת (עד 3)")}</p>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",lineHeight:1.5,margin:"0 0 6px"}}>{tr("הדביקי טקסט של פוסט שכתבת ואת אוהבת איך הוא נשמע. ה-AI ילמד ממנו את הקול שלך: אורך המשפטים, איך את פותחת ואיך את פונה. הוא לא יעתיק ממנו מחירים, מבצעים או משפטים.")}</p>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {[0,1,2].map(i=>{
                      const vals=Array.isArray(brand.voice_examples)?brand.voice_examples:[];
                      if(i>0&&!(vals[i-1]||"").trim()&&!(vals[i]||"").trim()) return null;
                      return <textarea key={i} value={vals[i]||""} maxLength={1200} onChange={e=>{ const next=[0,1,2].map(j=>vals[j]||""); next[i]=e.target.value; setBrand("voice_examples",next); }} rows={4} placeholder={i===0?tr("הדביקי כאן פוסט שלך"):tr("פוסט נוסף (לא חובה)")} style={{...inp,resize:"vertical"}}/>;
                    })}
 </div>
 </div>
 </div>
 </div>
 <div style={{borderTop:"1px solid var(--line)",paddingTop:12}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink)",fontWeight:700,marginBottom:2}}><Icon name="image" size={14}/> {tr("תמונות הטיפולים")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginBottom:10}}>{tr("בעמוד העסק, טיפול שהעלית לו תמונה מוצג ככרטיס עם התמונה, וטיפול בלי תמונה מוצג ברשימה. בדף קביעת התור, טיפול בלי תמונה מקבל תמונת ברירת מחדל, והיא מסומנת כאן.")}</p>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {activeServices.map(sv=>{
                      const img=serviceImage(sv,brand.service_images);
                      return (
 <div key={sv.id||sv.name} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",background:"var(--surface-2)"}}>
 <img src={img.url} alt="" loading="lazy" decoding="async" onError={e=>{e.currentTarget.style.visibility="hidden";}} style={{width:52,height:52,borderRadius:"var(--r-xs)",objectFit:"cover",flexShrink:0,background:"var(--line)"}}/>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:"var(--t-md)",color:"var(--ink)",fontWeight:600,margin:0}}>{sv.name}</p>
 <p style={{fontSize:"var(--t-xs)",color:img.isDefault?"var(--ink-3)":pcDeep,margin:0}}>{img.isDefault?tr("תמונת ברירת מחדל"):tr("התמונה שלך")}</p>
 </div>
 <label style={upBtn}>{brandUploading==="svc:"+sv.id?<Spinner inline label={tr("מעלה")}/>:(img.isDefault?tr("העלאה"):tr("החלפה"))}<input type="file" accept="image/*" disabled={!!brandUploading} style={{display:"none"}} onChange={e=>{uploadServicePhoto(sv.id,e.target.files?.[0]);e.target.value="";}}/></label>
                        {!img.isDefault&&<button onClick={()=>setBrand("service_images",Object.fromEntries(Object.entries(brand.service_images||{}).filter(([k])=>k!==sv.id)))} style={{background:"none",border:"none",color:"var(--ink-3)",fontSize:"var(--t-xs)",cursor:"pointer",fontFamily:"inherit",textDecoration:"underline"}}>{tr("חזרה לברירת מחדל")}</button>}
 </div>
                      );
                    })}
 </div>
 </div>
 <ResultsManager tenantId={settings?.tenant_id} services={activeServices}/>
 <div style={{borderTop:"1px solid var(--line)",paddingTop:12}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink)",fontWeight:700,marginBottom:2}}><Icon name="image" size={14}/> {tr("תמונות אווירה מהעסק")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginBottom:8}}>{tr("עד 3 תמונות של החדר והאווירה, לא של עבודות. מוצגות בגלריה בעמוד העסק.")}</p>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(70px,1fr))",gap:6,marginBottom:8}}>
                    {(Array.isArray(brand.clinic_photos)?brand.clinic_photos:[]).map((g,i)=>(
 <div key={i} style={{position:"relative",aspectRatio:"1 / 1",borderRadius:"var(--r-sm)",overflow:"hidden",border:"1px solid var(--line)"}}>
 <img src={g} alt="" loading="lazy" decoding="async" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
 <button onClick={()=>setBrand("clinic_photos",(Array.isArray(brand.clinic_photos)?brand.clinic_photos:[]).filter((_,j)=>j!==i))} aria-label={tr("הסרת תמונה")} style={{position:"absolute",top:2,left:2,width:20,height:20,borderRadius:"50%",background:"rgba(0,0,0,0.55)",color:"var(--surface)",border:"none",fontSize:"var(--t-sm)",cursor:"pointer",lineHeight:1}}>×</button>
 </div>
                    ))}
 </div>
 {(Array.isArray(brand.clinic_photos)?brand.clinic_photos:[]).length<3&&<label style={{display:"block",border:"1.5px dashed var(--line-2)",borderRadius:"var(--r-sm)",padding:"12px",textAlign:"center",cursor:"pointer",fontSize:"var(--t-sm)",fontWeight:600,color:pcDeep,background:"var(--surface-2)"}}>{brandUploading==="clinic"?<Spinner inline label={tr("מעלה")}/>:tr("+ הוספת תמונת אווירה")}<input type="file" accept="image/*" disabled={!!brandUploading} style={{display:"none"}} onChange={e=>{uploadClinicPhoto(e.target.files?.[0]);e.target.value="";}}/></label>}
 </div>
 <div style={{borderTop:"1px solid var(--line)",paddingTop:12}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink)",fontWeight:700,marginBottom:2}}><Icon name="image" size={14}/> {tr("גלריית תמונות")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginBottom:8}}>{tr("התמונות יוצגו בגלריה בעמוד העסק שלך. לחיצה על תמונה מגדילה אותה.")}</p>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(70px,1fr))",gap:6,marginBottom:8}}>
                    {(Array.isArray(brand.gallery)?brand.gallery:[]).map((g,i)=>(
 <div key={i} style={{position:"relative",aspectRatio:"1 / 1",borderRadius:"var(--r-sm)",overflow:"hidden",border:"1px solid var(--line)"}}>
 <img src={g} alt="" loading="lazy" decoding="async" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
 <button onClick={()=>setBrand("gallery",(Array.isArray(brand.gallery)?brand.gallery:[]).filter((_,j)=>j!==i))} style={{position:"absolute",top:2,left:2,width:20,height:20,borderRadius:"50%",background:"rgba(0,0,0,0.55)",color:"var(--surface)",border:"none",fontSize:"var(--t-xs)",cursor:"pointer",lineHeight:1}}>✕</button>
 </div>
                    ))}
 </div>
 <label style={{display:"block",border:"1.5px dashed var(--line-2)",borderRadius:"var(--r-sm)",padding:"12px",textAlign:"center",cursor:"pointer",fontSize:"var(--t-sm)",fontWeight:600,color:pcDeep,background:"var(--surface-2)"}}>{brandUploading==="gallery"?<Spinner inline label={tr("מעלה")}/>:tr("+ הוספת תמונה לגלריה")}<input type="file" accept="image/*" disabled={!!brandUploading} style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)uploadGalleryImage(f);e.target.value="";}}/></label>
 </div>
 <div style={{borderTop:"1px solid var(--line)",paddingTop:12,display:"flex",flexDirection:"column",gap:8}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",fontWeight:600}}>{tr("קישורים ורשתות חברתיות (יוצגו רק אם מולאו)")}</p>
 <div><p style={lbl}>{tr("מספר וואטסאפ")}</p><input type="tel" inputMode="tel" autoComplete="tel-national" dir="ltr" value={brand.whatsapp_number||""} onChange={e=>setBrand("whatsapp_number",e.target.value)} placeholder="050-0000000" style={{...inp,direction:"ltr",textAlign:"left"}}/></div>
 <div><p style={lbl}>{tr("אינסטגרם")}</p><input value={brand.instagram||""} onChange={e=>setBrand("instagram",e.target.value)} placeholder={tr("@username או קישור מלא")} style={{...inp,direction:"ltr",textAlign:"left"}}/></div>
 <div><p style={lbl}>{tr("פייסבוק")}</p><input value={brand.facebook||""} onChange={e=>setBrand("facebook",e.target.value)} placeholder={tr("username או קישור מלא")} style={{...inp,direction:"ltr",textAlign:"left"}}/></div>
 <div><p style={lbl}>{tr("טיקטוק")}</p><input value={brand.tiktok||""} onChange={e=>setBrand("tiktok",e.target.value)} placeholder={tr("@username או קישור מלא")} style={{...inp,direction:"ltr",textAlign:"left"}}/></div>
 <div style={{gridColumn:"1 / -1",marginTop:6,padding:"12px 14px",border:"1px solid var(--line)",borderRadius:"var(--r-md)",background:"var(--surface-2)"}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--ink)",marginBottom:2}}>{tr("הקישורים שלך")}</p>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",marginBottom:8}}>{tr("העמודים הציבוריים שלך, בצבעים שלך. העתיקי ושלחי.")}</p>
 <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
 <button onClick={()=>copyPublicLink("book")} className="primary-btn" style={{padding:"8px 14px",background:"var(--surface)",color:"var(--pc-deep)",border:"1px solid var(--line-2)",fontSize:"var(--t-sm)"}}>{tr("עמוד ההזמנות")}</button>
 <button onClick={()=>copyPublicLink("scan")} className="primary-btn" style={{padding:"8px 14px",background:"var(--surface)",color:"var(--pc-deep)",border:"1px solid var(--line-2)",fontSize:"var(--t-sm)"}}>{tr("סורק העור")}</button>
                    {isTabVisible(settings,"community")&&<button onClick={()=>copyPublicLink("community")} className="primary-btn" style={{padding:"8px 14px",background:"var(--surface)",color:"var(--pc-deep)",border:"1px solid var(--line-2)",fontSize:"var(--t-sm)"}}>{tr("הקהילה")}</button>}
 </div>
 {/* The same booking link, tagged with where she pastes it (lib/bookingSource.ts): the source report then shows which channel brings bookings. */}
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",margin:"10px 0 6px"}}>{tr("קישור לקביעת תור לפי המקום שבו תדביקי אותו, כדי לדעת מה מביא תורים:")}</p>
 <div data-testid="tagged-links" style={{display:"flex",gap:6,flexWrap:"wrap"}}>
 {[["bio","לביו באינסטגרם"],["story","לסטורי"],["whatsapp","לסטטוס בוואטסאפ"],["facebook","לפייסבוק"],["tiktok","לטיקטוק"],["google","לגוגל"]].map(([ch,l])=>(
 <button key={ch} type="button" onClick={()=>copyPublicLink("book",ch)} style={{padding:"7px 12px",minHeight:36,background:"var(--surface)",color:"var(--ink)",border:"1px solid var(--line-2)",borderRadius:"var(--r-full)",fontSize:"var(--t-xs)",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>
 ))}
 </div>
 </div>
 <div><p style={lbl}>{tr("אתר אינטרנט")}</p><input value={brand.website||""} onChange={e=>setBrand("website",e.target.value)} placeholder="https://..." style={{...inp,direction:"ltr",textAlign:"left"}}/></div>
 {/* Google Business values she copies from her own Google profile. Stored in the branding jsonb (no migration);
     the public page shows the Google card and stats only when a rating between 1 and 5 is filled in (lib/publicLanding.ts). */}
 <div style={{borderTop:"1px solid var(--line)",paddingTop:10,display:"flex",flexDirection:"column",gap:8}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",fontWeight:600,margin:0}}>{tr("הדירוג שלך בגוגל (יוצג בדף רק אם מולא)")}</p>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",margin:0}}>{tr("העתיקי את המספרים מהפרופיל העסקי שלך בגוגל, בדיוק כפי שהם מופיעים שם.")}</p>
 <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
 <div><p style={lbl}>{tr("דירוג (1-5)")}</p><input inputMode="decimal" value={brand.google_rating??""} onChange={e=>setBrand("google_rating",e.target.value.replace(/[^0-9.,]/g,"").slice(0,3))} placeholder="4.9" style={{...inp,direction:"ltr",textAlign:"left"}}/></div>
 <div><p style={lbl}>{tr("מספר ביקורות")}</p><input inputMode="numeric" value={brand.google_reviews_count??""} onChange={e=>setBrand("google_reviews_count",e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="120" style={{...inp,direction:"ltr",textAlign:"left"}}/></div>
 </div>
 <div><p style={lbl}>{tr("קישור לפרופיל בגוגל")}</p><input value={brand.google_place_url||""} onChange={e=>setBrand("google_place_url",e.target.value.trim())} placeholder="https://maps.app.goo.gl/..." style={{...inp,direction:"ltr",textAlign:"left"}}/></div>
 </div>
 </div>
 <div style={{borderTop:"1px solid var(--line)",paddingTop:12}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink)",fontWeight:700,marginBottom:2}}><Icon name="star" size={14}/> {tr("ביקורות מלקוחות")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginBottom:8}}>{tr("נכתבות על ידי לקוחות אחרי הטיפול, דרך קישור שנשלח בוואטסאפ. אפשר להסתיר ביקורת, אבל לא לערוך אותה, וזה מה שנותן להן ערך.")}</p>
 <div style={{marginBottom:12}}><VisitFeedbackPanel variant="compact"/></div>
                    {clientReviewsError&&<p style={{fontSize:"var(--t-sm)",color:"var(--danger)",fontWeight:600,marginBottom:8}}>{tr("לא הצלחנו לטעון את הביקורות.")}</p>}
                    {!clientReviewsError&&clientReviews.length===0&&(
 <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
 <BrandImage width={44} height={44} aria-hidden alt="" src={ICON_HEART} style={{width:44,height:44,objectFit:"contain",flexShrink:0}}/>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",lineHeight:1.6,margin:0}}>{tr("עוד לא התקבלו ביקורות. אחרי כל טיפול מוכנה בשבילך בקשת ביקורת בתור ההודעות, ושולחים אותה בלחיצה.")}</p>
 </div>
                    )}
                    {clientReviews.map(rv=>(
 <div key={rv.id} style={{background:"var(--surface-2)",borderRadius:"var(--r-sm)",padding:"10px 12px",marginBottom:7,opacity:rv.status==="hidden"?0.55:1}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:4}}>
 <span style={{fontSize:"var(--t-sm)",color:pc,letterSpacing:1}}>{[1,2,3,4,5].map(n=><span key={n}>{n<=Number(rv.rating)?"★":"☆"}</span>)}</span>
 <button onClick={()=>toggleReviewHidden(rv)} style={{background:"none",border:"none",color:rv.status==="hidden"?pcDeep:"var(--ink-3)",fontSize:"var(--t-sm)",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{rv.status==="hidden"?tr("החזרה"):tr("הסתרה")}</button>
 </div>
                        {rv.body&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink)",lineHeight:1.6,marginBottom:3}}>{trv(rv.body)}</p>}
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)"}}>{rv.client_name||tr("לקוחה")} · {parseDb(rv.created_at).toLocaleDateString("he-IL")}{rv.status==="hidden"?tr(" · מוסתרת"):""}</p>
 </div>
                    ))}
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink)",fontWeight:700,marginTop:14,marginBottom:2}}>{tr("ביקורות שהוקלדו ידנית")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginBottom:8}}>{tr("מוצגות רק כל עוד אין אף ביקורת מלקוחה. ברגע שתגיע הראשונה, אלה יוחלפו בה.")}</p>
                    {(Array.isArray(brand.reviews)?brand.reviews:[]).map((rv,i)=>{
                      const revs=Array.isArray(brand.reviews)?brand.reviews:[];
                      const updRev=(patch)=>setBrand("reviews",revs.map((x,j)=>j===i?{...x,...patch}:x));
                      return (
 <div key={i} style={{background:"var(--surface-2)",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"10px 12px",marginBottom:8}}>
 <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
 <input value={rv.name||""} onChange={e=>updRev({name:e.target.value})} placeholder={tr("שם הלקוחה")} style={{...inp,flex:1,minWidth:0,padding:"7px 10px"}}/>
 <button onClick={()=>setBrand("reviews",revs.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:"var(--danger)",cursor:"pointer",fontSize:"var(--t-md)",fontFamily:"inherit"}}>✕</button>
 </div>
 <div style={{display:"flex",gap:3,marginBottom:6}}>
                          {[1,2,3,4,5].map(n=>(
 <button key={n} onClick={()=>updRev({rating:n})} style={{background:"none",border:"none",cursor:"pointer",fontSize:"var(--t-xl)",lineHeight:1,padding:0,color:(Number(rv.rating)||5)>=n?pc:"var(--line-2)"}}>★</button>
                          ))}
 </div>
 <textarea value={rv.text||""} onChange={e=>updRev({text:e.target.value})} rows={2} placeholder={tr("תוכן הביקורת")} style={{...inp,resize:"none"}}/>
 </div>
                      );
                    })}
 <button onClick={()=>setBrand("reviews",[...(Array.isArray(brand.reviews)?brand.reviews:[]),{name:"",rating:5,text:""}])} style={{background:"var(--pc-tint)",border:`1px dashed ${pc}`,borderRadius:"var(--r-sm)",padding:"9px 0",width:"100%",fontSize:"var(--t-sm)",color:pcDeep,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>{tr("+ הוספת ביקורת")}</button>
 </div>
 </div>
                );
              })()}

              {inG("messages","clients","connections","advanced")&&(()=>{
                // Default-ON reminder flags: undefined (column never set) counts
                // as ON, matching today's cron behavior. Only an explicit false
                // turns them off.
                //
                // These are live, not settings-only: send-reminders reads
                // reminders_enabled, and send-smart-reminders reads
                // winback_enabled, package_reminders_enabled and
                // review_requests_enabled. The master pause below
                // (automations.paused) gates all of them, plus gap-fill.
                const onDefaultTrue=(k)=>!(editSettings[k]===false||editSettings[k]==="false");
                // Preserve the existing default-OFF semantics for gap-fill and
                // auto-receipt exactly as they were in the General tab.
                // Off unless she turned it on (the webhook reads it the same way): app/api/whatsapp-webhook shouldBotReply.
                const botOn=editSettings.bot_active===true||editSettings.bot_active==="true";
                const gapOn=(editSettings.gap_fill_enabled===true);
                const receiptOn=(editSettings.send_receipt_auto===true||editSettings.send_receipt_auto==="true");
                const setFlag=(k,v)=>setEditSettings({...editSettings,[k]:v});
                // Structured automation config lives in the settings.automations JSONB
                // (same store as business_hours/faq). Read/write defensively.
                const autos=(editSettings.automations&&typeof editSettings.automations==="object")?editSettings.automations:{};
                const skinMode=(autos.skin_followup&&autos.skin_followup.mode)||"off";
                const masterPaused=autos.paused===true;
                const setAutos=(next)=>setEditSettings({...editSettings,automations:next});
                const setSkinMode=(m)=>setAutos({...autos,skin_followup:{...(autos.skin_followup||{}),mode:m}});
                const setPaused=(v)=>setAutos({...autos,paused:v});
                // Ready-made WhatsApp messages per lead status. A blank textarea
                // removes the key, so only real templates are persisted.
                const leadTemplates=(autos.lead_templates&&typeof autos.lead_templates==="object")?autos.lead_templates:{};
                const setLeadTemplate=(k,v)=>{
                  // Store "" rather than deleting the key: an explicit clear must
                  // stick, otherwise the default would reappear on the next open.
                  const next={...leadTemplates,[k]:v};
                  setAutos({...autos,lead_templates:next});
                };
                // True only when the tenant saved this status as empty on purpose.
                const isCleared=(k)=>Object.prototype.hasOwnProperty.call(leadTemplates,k)&&!String(leadTemplates[k]).trim();
                return(
 <div style={{display:"flex",flexDirection:"column",gap:9}}>
 {inG("messages")&&(<>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",lineHeight:1.5,marginBottom:2}}>{tr("הפעלה וכיבוי של כל התהליכים האוטומטיים במקום אחד.")}</p>
 </>)}

 {inG("messages")&&(<>
 <div style={{background:masterPaused?"rgba(242,184,75,0.12)":"var(--surface-2)",border:`1px solid ${masterPaused?"rgba(242,184,75,0.55)":"var(--line)"}`,borderRadius:"var(--r-sm)",padding:"2px 12px"}}>
 <AutoToggleRow pc={pc} label={tr("השהיית כל האוטומציות")} on={masterPaused} onChange={()=>setPaused(!masterPaused)} desc={tr("עצירה זמנית של כל התהליכים האוטומטיים בעסק. ההגדרות של כל אוטומציה נשמרות ויחזרו כשתבטלי את ההשהיה.")} />
 {/* Manual quiet mode. Turning it OFF stamps quiet_ended_at - that stamp is
     what makes the comeback question wait exactly a week (lib/quiet.js).
     Automatic quiet (a dark calendar) needs no toggle and shows no banner. */}
 <AutoToggleRow pc={pc} label={tr("מצב שקט, הפסקה יזומה")} on={autos.quiet===true} onChange={()=>{
   const on=autos.quiet===true;
   const stamp=new Date().toISOString();
   setAutos(on?{...autos,quiet:false,quiet_ended_at:stamp}:{...autos,quiet:true,quiet_started_at:stamp});
 }} desc={tr("חופשה, מילואים, לידה. כשמופעל, המערכת לא שואלת שאלות ולא מציעה הצעות. כשתכבי, נחכה שבוע ואז נציע לשלוח ללקוחות הודעת חזרנו. שימי לב: תזכורות ללקוחות והחזרת לקוחות ממשיכות. להפסקה מלאה של הכול, השתמשי ב\"השהיית כל האוטומציות\".")} />
 </div>
 {masterPaused&&<p style={{fontSize:"var(--t-sm)",color:"var(--warning)",fontWeight:700,margin:"-2px 0 2px"}}><Icon name="pause" size={13}/> {tr("כל האוטומציות מושהות כרגע.")}</p>}
 </>)}

 {inG("messages")&&(<>
 <div>
 {/* The WhatsApp copy of her alerts needs the central number: hidden until it sends (owner, 2026-11-03). The app alert always comes. */}
 {waCentralConnected===true&&(<>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:10,fontWeight:600}}>{tr("התראות אליך")}</p>
 <AutoToggleRow pc={pc} label={tr("התראה גם בוואטסאפ (בנוסף להתראה באפליקציה)")} on={(()=>{const a=(editSettings.automations&&typeof editSettings.automations==="object")?editSettings.automations:{};return a.owner_alert_whatsapp===true;})()} onChange={()=>{
   const a=(editSettings.automations&&typeof editSettings.automations==="object")?editSettings.automations:{};
   setEditSettings(prev=>({...prev,automations:{...a,owner_alert_whatsapp:!(a.owner_alert_whatsapp===true)}}));
 }} desc={tr("תור חדש וביטול תור תמיד מגיעים באפליקציה. כשמופעל, הם מגיעים גם כהודעת וואטסאפ למספר ההתראות שהגדרת (בקבוצה \"העסק שלי\"), ואם לא הגדרת, למספר העסק, שימושי אם האפליקציה לא תמיד פתוחה אצלך.")} />
          {waCentralConnected===false&&<p style={{fontSize:"var(--t-xs)",color:"var(--warning)",lineHeight:1.5,margin:"0 0 10px"}}>{tr("המספר המרכזי לא מחובר כרגע, ההתראה בוואטסאפ תחכה ב\"הודעות מוכנות לשליחה\", ותצטרכי ללחוץ כדי לקבל אותה. באפליקציה ההתראה תמיד מגיעה.")}</p>}
 </>)}
 </div>

 </>)}
 {inG("messages")&&(<>
 <div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:10,fontWeight:600}}>{tr("תזכורות ללקוחות")}</p>
 <AutoToggleRow pc={pc} label={tr("תזכורת לתור (יום לפני)")} on={onDefaultTrue("reminders_enabled")} onChange={()=>setFlag("reminders_enabled",!onDefaultTrue("reminders_enabled"))} desc={waCentralConnected===true?tr("נשלחת אוטומטית בוואטסאפ, יום לפני התור."):tr("מוכנה לשליחה בלחיצה אחת, כל יום אחר הצהריים, לקראת התורים של מחר.")} />
 <AutoToggleRow pc={pc} label={tr("בקשת ביקורת אחרי טיפול")} on={onDefaultTrue("review_requests_enabled")} onChange={()=>setFlag("review_requests_enabled",!onDefaultTrue("review_requests_enabled"))} desc={tr("מכינה שאלה קצרה (איך היה?) בתור השליחה הידנית שלך, לפי התזמון שבחרת למטה. מי שנהנתה מוזמנת לגוגל, ומי שלא, כותבת לך בפרטיות. את שולחת בלחיצה אחת מהוואטסאפ שלך.")} />
 <AutoToggleRow pc={pc} label={tr("החזרת לקוחות רדומות")} on={onDefaultTrue("winback_enabled")} onChange={()=>setFlag("winback_enabled",!onDefaultTrue("winback_enabled"))} desc={tr("מכינה הודעת התחדשות ללקוחות שלא ביקרו למעלה מ-90 יום, בתור השליחה הידנית שלך.")} />
 <RebookSetting autos={autos} setAutos={setAutos} pc={pc} Row={AutoToggleRow} />
 <AutoToggleRow pc={pc} label={tr("סיום חבילת טיפולים")} on={onDefaultTrue("package_reminders_enabled")} onChange={()=>setFlag("package_reminders_enabled",!onDefaultTrue("package_reminders_enabled"))} desc={tr("מכינה תזכורת ללקוחה שסיימה חבילת טיפולים, וגם שבועיים לפני שתוקף חבילה עם טיפולים שנותרו נגמר, בתור השליחה הידנית שלך.")} />
 </div>

 </>)}
 {inG("advanced")&&(<>
 {/* "More screens" and the skin-scan switch. They used to sit INSIDE the block below, which renders only for a tenant a WhatsApp
     instance is mapped to by hand - so no new tenant could ever reach them. They are plain settings; they live in Advanced. */}
 <div style={{marginTop:22}}>
 <p style={{fontSize:"var(--t-md)",fontWeight:700,color:"var(--ink)",marginBottom:2}}>{tr("מסכים נוספים")}</p>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",marginBottom:8}}>{tr("מה שכבוי כאן יוצא מהתפריט; הנתונים נשארים, ואפשר להחזיר בכל רגע.")}</p>
                    {/* settingsToggleTabs: protocols is offered only to a tenant who already has it on (lib/featureFlags.ts). */}
                    {settingsToggleTabs(settings).map((id)=>{
                      const on = isTabVisible(editSettings, id);
                      return <AutoToggleRow key={id} pc={pc} label={trv(SWITCHABLE_LABELS[id])} on={on} onChange={()=>{
                        const screens = (autos.screens&&typeof autos.screens==="object")?autos.screens:{};
                        setAutos({...autos, screens:{...screens, [id]: !on}});
                      }} />;
                    })}
                    {/* Not a nav tab (see lib/featureFlags.ts's skinScanVisible), same
                        flags bag, same toggle row, own key so it doesn't collide with
                        an actual tab id. */}
                    {(()=>{
                      const on = skinScanVisible(editSettings);
                      if (!on && !businessFieldsOf(editSettings).includes("cosmetics")) return null;
                      return <AutoToggleRow pc={pc} label={SKIN_SCAN_LABEL} on={on} onChange={()=>{
                        const screens = (autos.screens&&typeof autos.screens==="object")?autos.screens:{};
                        setAutos({...autos, screens:{...screens, skin_scan: !on}});
                      }} />;
                    })()}
 </div>
 </>)}
 {inG("advanced")&&(<>
 {/* The inbound bot answers messages that arrive on a GreenAPI instance
     mapped to this tenant (settings.green_api_instance). Nothing in the
     product writes that column any more - per-tenant instances were
     retired - so only a tenant mapped by hand can ever receive an inbound
     message. Showing bot toggles to everyone else configured a bot that
     could never be triggered. The section renders only for a mapped tenant. */}
 {!!(settings.green_api_instance&&String(settings.green_api_instance).trim())&&(
 <div style={{borderTop:"1px solid var(--line)",paddingTop:12,marginTop:4}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:10,fontWeight:600}}>{tr("וואטסאפ")}</p>
 <AutoToggleRow pc={pc} label={tr("בוט הוואטסאפ החכם פעיל")} on={botOn} onChange={()=>setFlag("bot_active",!botOn)} />

 {botOn&&(
 <div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:6}}>{tr("מתי הבוט יענה?")}</p>
 <div style={{display:"flex",gap:6}}>
 <button onClick={()=>setEditSettings({...editSettings,bot_mode:"always"})} style={{flex:1,padding:"9px 0",borderRadius:"var(--r-sm)",fontSize:"var(--t-xs)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:(editSettings.bot_mode||"always")==="always"?`2px solid ${pc}`:"1px solid var(--line)",background:(editSettings.bot_mode||"always")==="always"?pcTint:"var(--surface)",color:pc}}>{tr("תמיד")}</button>
 <button onClick={()=>setEditSettings({...editSettings,bot_mode:"after_hours"})} style={{flex:1,padding:"9px 0",borderRadius:"var(--r-sm)",fontSize:"var(--t-xs)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:editSettings.bot_mode==="after_hours"?`2px solid ${pc}`:"1px solid var(--line)",background:editSettings.bot_mode==="after_hours"?pcTint:"var(--surface)",color:pc}}>{tr("רק מחוץ לשעות העבודה")}</button>
 </div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:6}}>{editSettings.bot_mode==="after_hours"?tr("הבוט יענה רק כשאת לא בשעות/ימי העבודה. בשאר הזמן את עונה בעצמך."):tr("הבוט יענה לכל הודעה נכנסת, בכל שעה.")}</p>
 </div>
 )}
 </div>
 )}

 </>)}
 {inG("clients")&&(<>
 {skinScanVisible(editSettings)&&(<div style={{borderTop:"1px solid var(--line)",paddingTop:12,marginTop:4}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:8,fontWeight:600}}>{tr("מעקב עור חכם")}</p>
 <p style={{fontSize:"var(--t-xs)",fontWeight:600,color:"var(--ink-2)",marginBottom:2}}>{tr("הצעות מעקב לפי סריקות עור")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",lineHeight:1.5,marginBottom:8}}>{tr("הכנת הודעת המשך אישית ללקוחה לפי מגמת הסריקות שלה (למשל התקדמות שנעצרה או זמן להערכה מחדש). ההודעה תמיד ניתנת לעריכה לפני שליחה, ולעולם לא נשלח דבר ללא אישורך.")}</p>
 <div style={{display:"flex",gap:6,opacity:masterPaused?0.5:1}}>
                    {/* Two modes, not three. "אוטומטי" was offered with the
                        note "coming soon" and nothing behind it: no cron, no
                        sender. A mode that cannot do anything is not a mode. */}
                    {[["off","כבוי"],["approval","באישור"]].map(([m,l])=>(
 <button key={m} onClick={()=>!masterPaused&&setSkinMode(m)} disabled={masterPaused} style={{flex:1,padding:"9px 0",borderRadius:"var(--r-sm)",fontSize:"var(--t-xs)",fontWeight:600,cursor:masterPaused?"default":"pointer",fontFamily:"inherit",border:skinMode===m?`2px solid ${pc}`:"1px solid var(--line)",background:skinMode===m?pcTint:"var(--surface)",color:pc}}>{l}</button>
                    ))}
 </div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:6}}>{skinMode==="off"?tr("כבוי, לא נוצרות הצעות."):tr("באישור, נכין עבורך הצעות במסך הבית, ולחיצה פותחת את ההודעה בוואטסאפ שלך לשליחה.")}</p>
 </div>)}

 </>)}
 {inG("connections")&&(<>
 {/* The GreenAPI connect form that stood here is gone, by decision: a
     cosmetician's personal WhatsApp number was RESTRICTED for being
     connected to the API. No tenant should carry that risk, so the product
     no longer invites it. Utility messages (reminders, confirmations) go
     out from the central Kalmea number; marketing is sent by her, from
     her own WhatsApp, via the compose window's wa.me links. */}
 {/* Lead-intake API key: lets an external landing page or site form post
     leads straight into her list. The key is shown ONCE at generation; the
     server keeps only a hash. */}
 <div style={{borderTop:"1px solid var(--line)",paddingTop:12,marginTop:4}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:4}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",fontWeight:600}}>{tr("מפתח לקליטת פניות מהאתר שלך")}</p>
 {leadKeyConfigured!==null&&<span style={{fontSize:"var(--t-sm)",fontWeight:700,borderRadius:"var(--r-lg)",padding:"5px 11px",...(leadKeyConfigured?{color:"var(--success)",background:"rgba(70,179,123,0.12)"}:{color:"var(--ink-3)",background:"var(--surface-2)"})}}>{leadKeyConfigured?tr("פעיל ✓"):tr("לא הופק")}</span>}
 </div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",lineHeight:1.6,marginBottom:8}}>{tr("מאפשר לדף נחיתה או לאתר חיצוני לשלוח פניות ישירות לרשימה שלך. המפתח מוצג פעם אחת בלבד. העתיקי ושמרי אותו אצל בונה האתר. הפקה מחדש מבטלת את המפתח הקודם מיד.")}</p>
 {leadKeyJustGenerated&&(
 <div style={{background:"var(--pc-tint)",border:`1px solid ${pc}`,borderRadius:"var(--r-sm)",padding:"10px 12px",marginBottom:8}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:pcDeep,marginBottom:4}}>{tr("המפתח שלך, מוצג פעם אחת בלבד:")}</p>
 <p style={{fontSize:"var(--t-sm)",fontFamily:"monospace",direction:"ltr",textAlign:"left",wordBreak:"break-all",background:"var(--surface)",borderRadius:"var(--r-xs)",padding:"8px 10px",userSelect:"all"}}>{leadKeyJustGenerated}</p>
 <button onClick={()=>{copyText(leadKeyJustGenerated).then(ok=>ok?toast(tr("המפתח הועתק")):toast(tr("ההעתקה נכשלה, סמני והעתיקי ידנית"),"error"));}} className="primary-btn" style={{marginTop:8,background:pcGrad,color:"var(--pc-contrast)",padding:"7px 14px",fontSize:"var(--t-sm)"}}>{tr("העתקה")}</button>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",marginTop:8,marginBottom:4,fontWeight:600}}>{tr("לבונה האתר: שליחת פנייה")}</p>
 <pre style={{fontSize:"var(--t-xs)",fontFamily:"monospace",direction:"ltr",textAlign:"left",background:"var(--surface)",borderRadius:"var(--r-xs)",padding:"8px 10px",overflowX:"auto",whiteSpace:"pre",userSelect:"all"}}>{tr("curl -X POST {0}/api/leads/intake   -H \"Content-Type: application/json\"   -H \"x-api-key: {1}\"   -d '(\"name\":\"דנה לוי\",\"phone\":\"0501234567\",\"source\":\"landing-facebook\")'", [typeof window!=="undefined"?window.location.origin:"", leadKeyJustGenerated])}</pre>
 </div>
 )}
 <button onClick={async()=>{
   if(leadKeyBusy)return;
   const go=async()=>{
     setLeadKeyBusy(true);
     try{
       const r=await fetch("/api/settings/lead-key",{method:"POST"});
       const d=await r.json().catch(()=>null);
       if(d&&d.success&&d.key){setLeadKeyJustGenerated(d.key);setLeadKeyConfigured(true);}
       else toast((d&&d.error)||tr("לא הצלחנו להפיק את המפתח, אפשר לנסות שוב"),"error");
     }catch{toast(tr("לא הצלחנו להפיק את המפתח, כדאי לבדוק את החיבור"),"error");}
     finally{setLeadKeyBusy(false);}
   };
   if(leadKeyConfigured){
     askConfirm({title:tr("להפיק מפתח חדש?"),message:tr("המפתח הקיים יפסיק לעבוד מיד, וכל טופס שמשתמש בו יפסיק לשלוח פניות עד שיעודכן."),confirmText:tr("הפיקי חדש"),cancelText:tr("ביטול"),danger:true,onConfirm:go});
   } else { go(); }
 }} disabled={leadKeyBusy} className="primary-btn" style={{background:"var(--surface)",color:pcDeep,border:"1px solid var(--line-2)",padding:"8px 16px",fontSize:"var(--t-sm)",opacity:leadKeyBusy?0.6:1}}>{leadKeyBusy?<Spinner inline label={tr("מפיקה")}/>:leadKeyConfigured?tr("הפקת מפתח חדש"):tr("הפקת מפתח")}</button>
 </div>

 </>)}
 {inG("messages")&&(<>
 <div style={{borderTop:"1px solid var(--line)",paddingTop:12,marginTop:4}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",fontWeight:600,marginBottom:4}}>{tr("הודעות וואטסאפ")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",lineHeight:1.6}}>{waCentralConnected===true?tr("תזכורות, אישורי תורים ואישורי תשלום יוצאים אוטומטית מהמספר המרכזי של קלמיה, עם שם העסק שלך בגוף ההודעה. הודעה שלא יצאה מחכה בתור השליחה שלך, ולא נעלמת."):tr("תזכורות, אישורי תורים ואישורי תשלום מחכים לך מוכנים ב\"הודעות מוכנות לשליחה\", לחיצה אחת לכל הודעה מהוואטסאפ שלך. התזכורות לתורים של מחר מוכנות כל יום אחר הצהריים, ובמוצאי שבת בערב.")} {tr("הודעות שיווקיות (הצעות תור, חזרה ללקוחות ישנות, \"חזרנו\") תמיד ממתינות בתור, לא רק כשהמרכזי לא זמין, את שולחת אותן מהוואטסאפ האישי שלך, הודעה-הודעה. כך המספר שלך לעולם לא מחובר לשום מערכת אוטומטית.")}</p>
 </div>

 </>)}
 {inG("clients")&&(<>
 <div style={{borderTop:"1px solid var(--line)",paddingTop:12,marginTop:4}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:4,fontWeight:600}}>{tr("הודעות מוכנות לפי סטטוס פנייה")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",lineHeight:1.5,marginBottom:8}}>{tr("ההודעה תיפתח מוכנה לשליחה כשתשלחי הודעה לפי סטטוס במסך הפניות. אפשר לכתוב")} {"{name}"} {tr("לשם הפונה ו-")}{"{clinic}"} {tr("לשם העסק. הנוסח האפור הוא ברירת המחדל שתישלח אם לא תשני דבר; אם תמחקי הכל, אותו סטטוס ייפתח ריק.")}</p>
 {LEAD_STATUS_KEYS.map(k=>(
 <div key={k} style={{marginBottom:8}}>
 <p style={{fontSize:"var(--t-sm)",color:LEAD_STATUS_COLORS[k].color,fontWeight:700,marginBottom:3}}>{trv(LEAD_STATUS_LABELS[k])}</p>
 <textarea value={leadTemplates[k]||""} onChange={e=>setLeadTemplate(k,e.target.value)} rows={2}
   placeholder={DEFAULT_LEAD_TEMPLATES[k]||""}
   style={{width:"100%",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"8px 10px",fontSize:"var(--t-xs)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:pcTint,resize:"vertical",boxSizing:"border-box"}}/>
 {isCleared(k)&&<p style={{fontSize:"var(--t-xs)",color:"var(--warning)",fontWeight:700,marginTop:3}}>{tr("(נוקה, ייפתח ריק)")}</p>}
 </div>
 ))}
 </div>

 </>)}
 {inG("messages")&&(<>
 <div style={{borderTop:"1px solid var(--line)",paddingTop:12,marginTop:4}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:4,fontWeight:600}}>{tr("תזמון הודעות ללקוחות")}</p>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",lineHeight:1.5,marginBottom:8}}>{tr("מתי יוצאות בקשת הביקורת והחזרת הלקוחות הרדומות. כשההודעות לא יוצאות אוטומטית, הן מחכות ב\"הודעות מוכנות לשליחה\".")}</p>
 {(()=>{
   const t=(autos.timing&&typeof autos.timing==="object")?autos.timing:{};
   const {delayDays:rv,everyMonths:rvEvery}=reviewTimingOf(autos);
   const wb=Number(t.winback_days)>=30&&Number(t.winback_days)<=365?Number(t.winback_days):90;
   const setT=(patch)=>setAutos({...autos,timing:{...t,...patch}});
   const sel={border:"1px solid var(--line-2)",borderRadius:"var(--r-xs)",padding:"7px 8px",fontSize:"var(--t-sm)",fontFamily:"inherit",background:"var(--surface)"};
   return(
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
 <label style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,fontSize:"var(--t-sm)",color:"var(--ink-2)"}}><span>{tr("בקשת ביקורת אחרי הטיפול")}</span>
 <select aria-label={tr("בקשת ביקורת אחרי הטיפול")} value={rv} onChange={e=>setT({review_delay_days:Number(e.target.value)})} style={sel}>{[[0,"באותו יום, כמה שעות אחרי"],[1,"יום אחרי"],[2,"יומיים אחרי"],[3,"3 ימים אחרי"],[5,"5 ימים אחרי"],[7,"שבוע אחרי"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
 <label style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,fontSize:"var(--t-sm)",color:"var(--ink-2)"}}><span>{tr("לשאול כל לקוחה לכל היותר")}</span>
 <select aria-label={tr("לשאול כל לקוחה לכל היותר")} value={rvEvery} onChange={e=>setT({review_every_months:Number(e.target.value)})} style={sel}>{[[1,"פעם בחודש"],[2,"פעם בחודשיים"],[3,"פעם ב-3 חודשים"],[4,"פעם ב-4 חודשים"],[6,"פעם בחצי שנה"],[12,"פעם בשנה"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
 {rv===0&&<span style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",lineHeight:1.5}}>{tr("הבקשה מוכנה בערב, לפחות שעתיים אחרי שהטיפול נגמר. טיפול שנגמר מאוחר מקבל אותה למחרת. לא בשבת ולא בחג, ואף פעם לא למי שביקשה להסיר אותה מהודעות.")}</span>}
 <label style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,fontSize:"var(--t-sm)",color:"var(--ink-2)"}}><span>{tr("החזרת לקוחה שלא ביקרה")}</span>
 <select aria-label={tr("החזרת לקוחה שלא ביקרה")} value={wb} onChange={e=>setT({winback_days:Number(e.target.value)})} style={sel}>{[[60,"אחרי 60 יום"],[90,"אחרי 90 יום"],[120,"אחרי 120 יום"],[180,"אחרי חצי שנה"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
 <label style={{display:"flex",flexDirection:"column",gap:4,fontSize:"var(--t-sm)",color:"var(--ink-2)"}}><span>{tr("מתנת יום הולדת בהודעה")}</span>
 <input aria-label={tr("מתנת יום הולדת בהודעה")} maxLength={80} value={birthdayOfferOf(autos)} onChange={e=>setAutos({...autos,birthday_offer:e.target.value})} placeholder={tr("למשל: 15% הנחה על הטיפול הבא שלך")} style={{...sel,width:"100%",boxSizing:"border-box"}}/>
 <span style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",lineHeight:1.5}}>{tr("מה שתכתבי כאן יופיע בברכת יום ההולדת. השאירי ריק אם אין הנחה.")}</span></label>
 </div>
   );
 })()}
 </div>
 </>)}
 {inG("messages")&&(<>
 <div style={{borderTop:"1px solid var(--line)",paddingTop:12,marginTop:4}}><GreetingsPanel pc={pc} toast={toast}/></div>
 </>)}
 {inG("messages")&&(<>
 <div style={{borderTop:"1px solid var(--line)",paddingTop:12,marginTop:4}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:10,fontWeight:600}}>{tr("תפעול")}</p>
 <AutoToggleRow pc={pc} label={tr("מילוי תור שהתפנה (הצעה בוואטסאפ)")} on={gapOn} onChange={()=>setFlag("gap_fill_enabled",!gapOn)} desc={tr("כשמופעל ומתבטל תור, המערכת מכינה הצעה עם קישור לתפוס את התור שהתפנה ללקוחות מתאימות, ואת שולחת כל אחת בלחיצה מהוואטסאפ שלך; הראשונה שתלחץ על הקישור תופסת. כבוי כברירת מחדל.")} />
 <WaitlistOfferSetting autos={autos} setAutos={setAutos} pc={pc} Row={AutoToggleRow} />
 <WaAutoMessagesSetting autos={autos} setAutos={setAutos} pc={pc} Row={AutoToggleRow} />
 {/* Sent automatically only through the central number: hidden until it is connected (owner, 2026-11-03). A stored "on" is kept. */}
 {waCentralConnected===true&&(<AutoToggleRow pc={pc} label={tr("שליחת אישור תשלום ללקוחה מיד אחרי הרישום")} on={receiptOn} onChange={()=>setFlag("send_receipt_auto",!receiptOn)} desc={tr("כשמופעל, האישור יוצא אוטומטית בוואטסאפ כשהחיבור המרכזי פעיל (ועם קישור לקבלה, אם חיברת מורנינג), ואחרת ממתין בתור השליחה הידנית שלך (רק אם יש לה מספר טלפון). כשכבוי, רק לחיצה ידנית מכינה אותו.")} />)}
 </div>
 </>)}
 </div>
                );
              })()}
              {inG("booking")&&team.enabled&&(<TeamSettings services={services} settings={settings} pc={pc} pcTint={pcTint} toast={toast} isDemo={isDemoTenantId(settings?.tenant_id)}/>)}
              {inG("booking")&&(
 <div>
                  {(()=>{
                  // The whole tab reads from the draft, never from `services`.
                  // The row inputs used to write straight into the app-wide
                  // services array, so a half-typed treatment name was live in
                  // the appointment dropdown, the cashier and the public
                  // booking page before she had finished the word.
                  const draft = editServices || [];
                  const live = draft.map((s,i)=>({s,i})).filter(x=>!x.s._deleted);
                  // Buffer after the treatment (lib/serviceBuffer.ts). The column comes from add_service_buffer_2026-11-05.sql;
                  // a loaded row without the key means it has not run, and the field says so instead of pretending to save.
                  const bufferColumnReady = services.length===0 || services.some(sv=>Object.prototype.hasOwnProperty.call(sv,"buffer_minutes"));
                  const bufferDefaultHere = businessBufferDefault(editSettings?.branding);
                  // "להזכיר לחזור אחרי" (lib/reminders/rebookPlan.js), from add_service_rebook_days_2026-11-09.sql: the same "has it run" test.
                  const rebookColumnReady = services.length===0 || services.some(sv=>Object.prototype.hasOwnProperty.call(sv,"rebook_days"));
                  const rebookShown = rebookVisible(editSettings);
                  const gone = draft.map((s,i)=>({s,i})).filter(x=>x.s._deleted);
                  return (<>
                  {/* Shown whenever the list is empty and the picker is closed.
                      It used to be hidden by `!showNewService`, which meant the
                      one guided route in — the setup checklist, which opens
                      this tab with the blank add-row already expanded — was the
                      single path that never showed the explanation. */}
                  {live.length===0&&gone.length===0&&!showTemplatePicker&&(
 <div style={{textAlign:"center",padding:"22px 14px",background:pcTint,borderRadius:"var(--r-md)",marginBottom:8}}>
 <div style={{fontSize:"var(--t-3xl)",marginBottom:8}}>✦</div>
 <p style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)",marginBottom:4}}>{tr("עדיין לא הוספת שירותים")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.6,maxWidth:280,margin:"0 auto 12px"}}>{tr("הוסיפי את הטיפולים שאת מציעה עם המחיר ומשך הטיפול, הם יופיעו בקביעת תור, בקופה ובעמוד ההזמנות שלך.")}</p>
 <button onClick={()=>setShowTemplatePicker(true)} style={{background:pcGrad,color:"var(--pc-contrast)",border:"none",borderRadius:"var(--r-sm)",padding:"11px 20px",fontSize:"var(--t-sm)",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{tr("בחרי מרשימת טיפולים מוכנה")}</button>
 </div>
                  )}
                  {/* Rows marked for deletion. They leave the list immediately
                      so it reads as it will after saving, but the deletion has
                      not happened yet and she can still take it back. */}
                  {gone.length>0&&(
 <div style={{border:"1px dashed var(--danger)",borderRadius:"var(--r-sm)",padding:"9px 11px",marginBottom:8,background:"var(--surface-2)"}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--danger)",marginBottom:6}}>{gone.length===1?tr("שירות אחד יימחק בשמירה"):tr("{0} שירותים יימחקו בשמירה", [gone.length])}</p>
 {gone.map(({s,i})=>(
 <div key={s.id||`del-${i}`} style={{display:"flex",alignItems:"center",gap:8,marginTop:4}}>
 <span style={{flex:1,minWidth:0,fontSize:"var(--t-sm)",color:"var(--ink-2)",textDecoration:"line-through",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</span>
 <button onClick={()=>undeleteDraftService(i)} style={{background:"none",border:"none",color:pcDeep,fontSize:"var(--t-sm)",fontWeight:700,cursor:"pointer",fontFamily:"inherit",padding:"4px 6px",flexShrink:0}}>{tr("ביטול")}</button>
 </div>
                  ))}
 </div>
                  )}
                  {live.map(({s:svc,i:idx})=>{
                  const svcActive = svc.active !== false;
                  // Two lines, not one. Every control here is fixed-width except the
                  // name, so on a phone the name absorbed the entire shortfall and
                  // rendered as two letters — you could not tell which treatment you
                  // were editing. The two icon buttons are the bulk of it: the
                  // inline width:26 below is overridden by the mobile tap-target rule
                  // (.icon-btn{width:44px!important}), so they cost 88px, not 52.
                  // Both rules are right on their own; they cannot both fit on one
                  // line. The name is the only part that identifies the row, so it
                  // gets a line to itself and the numbers and actions sit under it.
                  return (
 <div key={svc.id||`new-${idx}`} style={{padding:"9px 10px",background:svcActive?pcTint:"var(--surface-2)",borderRadius:"var(--r-sm)",marginBottom:5,opacity:svcActive?1:0.62,border:svc._new?`1px solid ${pc}`:(svcActive?"none":"1px dashed var(--line-2)")}}>
 <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:7}}>
 <span style={{width:10,height:10,borderRadius:"50%",background:svcActive?(svc.color||"var(--warning)"):"var(--line-2)",flexShrink:0}}/>
 <input value={svc.name} aria-label={tr("שם השירות")} onChange={e=>patchDraftService(idx,{name:e.target.value})} style={{flex:1,minWidth:0,border:"none",background:"transparent",fontSize:"var(--t-md)",fontFamily:"inherit",outline:"none",fontWeight:600,color:"var(--ink)",textOverflow:"ellipsis"}}/>
 {svc._new&&<span style={{fontSize:"var(--t-xs)",fontWeight:700,color:pcDeep,flexShrink:0}}>{tr("חדש")}</span>}
 {!svcActive&&<span style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",flexShrink:0}}>{tr("בארכיון")}</span>}
 </div>
 {/* One line under the name: what the client gets. Lands on the booking page
     under the service name — the biggest conversion gap there was a bare name
     next to a price. Optional; empty renders nothing. */}
 <input value={svc.description||""} aria-label={tr("תיאור קצר ללקוחה")} placeholder={tr("תיאור קצר לעמוד ההזמנות. ה-AI כותב פוסטים רק על מה שכתוב כאן (למשל איך מרגישים, כמה זמן) - בלי תיאור הוא יישאר כללי")} onChange={e=>patchDraftService(idx,{description:e.target.value})} maxLength={140} style={{width:"100%",border:"none",background:"transparent",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",color:"var(--ink-2)",marginBottom:7,paddingRight:17}}/>
 <div style={{display:"flex",alignItems:"center",gap:6}}>
 <input type="number" value={svc.price} aria-label={tr("מחיר בשקלים")} onChange={e=>patchDraftService(idx,{price:Number(e.target.value)})} onBlur={e=>{const v=Number(e.target.value);const fixed=Math.max(0,Math.round(v||0));if(fixed!==v)patchDraftService(idx,{price:fixed});}} min={0} style={{width:54,flexShrink:0,border:"1px solid var(--line)",borderRadius:"var(--r-xs)",padding:"4px 6px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",textAlign:"center",background:"var(--surface)"}}/>
 <span aria-hidden="true" style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",flexShrink:0}}>₪</span>
 <input type="number" value={svc.duration} aria-label={tr("משך בדקות")} onChange={e=>patchDraftService(idx,{duration:Number(e.target.value)})} onBlur={e=>{const v=Number(e.target.value);const fixed=Math.min(600,Math.max(5,Math.round(v||60)));if(fixed!==v)patchDraftService(idx,{duration:fixed});}} min={5} max={600} style={{width:44,flexShrink:0,border:"1px solid var(--line)",borderRadius:"var(--r-xs)",padding:"4px 6px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",textAlign:"center",background:"var(--surface)"}}/>
 <span aria-hidden="true" style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",flexShrink:0}}>{tr("דק׳")}</span>
 {/* Which business field this service belongs to — the only place in the
     product that sets or fixes it after creation. Drives the default photo
     (lib/defaultImages.js) and whether it appears in a field-filtered view.
     Every service gets this, not only a multi-field tenant's: a hand-typed
     or hand-edited row on ANY tenant never got a field written otherwise. */}
 <ServiceDepositToggle checked={svc.requires_deposit===true} onChange={v=>patchDraftService(idx,{requires_deposit:v})}/>
 <select value={svc.field||""} aria-label={tr("תחום השירות")} onChange={e=>patchDraftService(idx,{field:e.target.value||null})} style={{flexShrink:0,maxWidth:88,border:"1px solid var(--line)",borderRadius:"var(--r-xs)",padding:"4px 4px",fontSize:"var(--t-xs)",fontFamily:"inherit",outline:"none",background:"var(--surface)",color:svc.field?"var(--ink)":"var(--ink-3)"}}>
 <option value="">{tr("לא מסומן")}</option>
                    {BUSINESS_FIELDS.map(f=><option key={f.key} value={f.key}>{f.label.split(" ")[0]}</option>)}
 </select>
 <div style={{flex:1,minWidth:0}}/>
 {/* Archive / restore. The treatment stays in every past appointment and
     receipt either way — those store its name, not a reference to this row.
     Inline SVG, not the archive-box / hooked-arrow codepoints: both carry an
     emoji presentation that iOS picks, so they rendered as full-colour emoji
     beside monochrome stroked icons. Same fix as the settings gear. */}
 <button onClick={()=>toggleDraftServiceActive(idx)} className="icon-btn sm" style={{}} title={svcActive?tr("העברה לארכיון, לא יופיע בקביעת תור ובעמוד הציבורי"):tr("החזרה לרשימה")} aria-label={svcActive?tr("העברה לארכיון"):tr("החזרה לרשימה")}>
 {svcActive
   ? <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style={{fill:"none",stroke:"currentColor",strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round"}}><rect x="2.8" y="3.8" width="18.4" height="4.6" rx="1.3"/><path d="M4.6 8.4V19a1.6 1.6 0 0 0 1.6 1.6h11.6a1.6 1.6 0 0 0 1.6-1.6V8.4M9.7 12.4h4.6"/></svg>
   : <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style={{fill:"none",stroke:"currentColor",strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round"}}><path d="M3.5 9.5h11.2a5 5 0 0 1 0 10H8.2M3.5 9.5l4.3-4.3M3.5 9.5l4.3 4.3"/></svg>}
 </button>
 {/* Permanent delete. Refuses, with a count, when anything references it. */}
 <button onClick={()=>handleDeleteService(svc,idx)} disabled={isBusy("deleteService")} className="icon-btn sm" style={{color:"var(--danger)"}} title={tr("מחיקה לצמיתות: רק אם השירות לא מופיע בשום תור, תשלום, חבילה או ליד")} aria-label={tr("מחיקה")}>✕</button>
 </div>
 {/* Minutes kept free after this treatment: the public page and the calendar treat them as taken. Empty = the
     business default from "כללי קביעת תור". */}
 <label data-testid="service-buffer" style={{display:"flex",alignItems:"center",gap:6,marginTop:7,fontSize:"var(--t-xs)",color:"var(--ink-2)"}}>
 <span style={{flex:1,minWidth:0}}>{SERVICE_BUFFER_LABEL_HE}</span>
 <input type="number" inputMode="numeric" min={0} max={120} disabled={!bufferColumnReady} aria-label={SERVICE_BUFFER_LABEL_HE} value={svc.buffer_minutes==null?"":svc.buffer_minutes} placeholder={String(bufferDefaultHere)} onChange={e=>patchDraftService(idx,{buffer_minutes:e.target.value===""?null:cleanBufferMinutes(e.target.value)})} style={{width:54,flexShrink:0,border:"1px solid var(--line)",borderRadius:"var(--r-xs)",padding:"4px 6px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",textAlign:"center",background:bufferColumnReady?"var(--surface)":"var(--surface-2)"}}/>
 </label>
 {!bufferColumnReady&&<p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",margin:"3px 0 0",lineHeight:1.5}}>{tr("יופעל אחרי עדכון קטן במערכת. עד אז חל זמן ההפסקה הכללי מ״כללי קביעת תור״.")}</p>}
 <ServiceIntakeToggle ready={intakeColumnReady(services)} value={svc.intake} settings={settings} onChange={v=>patchDraftService(idx,{intake:v})}/>
 {/* Days after a visit of this treatment until the "time for the next one" nudge. Empty = automatic (her rhythm, else a
     suggestion by the name, shown as the placeholder); 0 = never for this treatment. */}
 {rebookShown&&(()=>{const sug=suggestedRebookDays(svc.name,svc.field);return(<>
 <label data-testid="service-rebook" style={{display:"flex",alignItems:"center",gap:6,marginTop:7,fontSize:"var(--t-xs)",color:"var(--ink-2)"}}>
 <span style={{flex:1,minWidth:0}}>{tr("להזכיר לחזור אחרי (ימים)")}</span>
 <input type="number" inputMode="numeric" min={0} max={365} disabled={!rebookColumnReady} aria-label={tr("להזכיר לחזור אחרי, בימים")} value={svc.rebook_days==null?"":svc.rebook_days} placeholder={sug?String(sug):tr("אוטו׳")} onChange={e=>patchDraftService(idx,{rebook_days:typedRebookDays(e.target.value)})} onBlur={e=>{const v=cleanRebookDays(e.target.value);if(v!==svc.rebook_days)patchDraftService(idx,{rebook_days:v});}} style={{width:54,flexShrink:0,border:"1px solid var(--line)",borderRadius:"var(--r-xs)",padding:"4px 6px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",textAlign:"center",background:rebookColumnReady?"var(--surface)":"var(--surface-2)"}}/>
 </label>
 {rebookColumnReady&&svc.rebook_days===0&&<p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",margin:"3px 0 0",lineHeight:1.5}}>{tr("0 = בלי תזכורת לטיפול הזה.")}</p>}
 {!rebookColumnReady&&<p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",margin:"3px 0 0",lineHeight:1.5}}>{tr("יופעל אחרי עדכון קטן במערכת. עד אז התזכורת נקבעת לפי הקצב של כל לקוחה ולפי סוג הטיפול.")}</p>}
 </>);})()}
 </div>
                  );})}
                  </>);})()}
                  {/* The suggested menu. Same component onboarding uses, so
                      skipping it at signup is not a door that closes: nothing
                      here is a one-time step. */}
                  {showTemplatePicker&&(
 <div style={{border:`1px solid ${pc}`,borderRadius:"var(--r-md)",padding:"12px 11px",marginTop:8,background:"var(--surface)"}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--ink)",marginBottom:3}}>{tr("רשימת טיפולים מוכנה")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.6,marginBottom:10}}>{tr("סימני רק את מה שאת מבצעת. המחירים הם הצעה לפי המקובל בשוק. אפשר לשנות אותם כאן או אחר כך. טיפול שכבר במחירון שלך מסומן ולא ייווסף פעמיים.")}</p>
 <ServiceTemplatePicker
   value={templatePicks}
   onChange={setTemplatePicks}
   fields={businessFieldsOf(settings)}
   existingNames={(editServices||[]).filter(s=>!s._deleted).map(s=>s.name)}
   accent={pc}
   accentTint={pcTint}
 />
 <div style={{display:"flex",gap:7,marginTop:12}}>
 <button onClick={()=>{setShowTemplatePicker(false);setTemplatePicks([]);}} style={{flex:1,background:"var(--surface)",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"11px 0",fontSize:"var(--t-sm)",color:"var(--ink-2)",cursor:"pointer",fontFamily:"inherit"}}>{tr("ביטול")}</button>
 <button onClick={handleAddTemplateServices} disabled={templatePicks.length===0} style={{flex:2,background:templatePicks.length===0?"var(--line-2)":pcGrad,color:templatePicks.length===0?"var(--ink-3)":"var(--pc-contrast)",border:"none",borderRadius:"var(--r-sm)",padding:"11px 0",fontSize:"var(--t-sm)",fontWeight:700,cursor:templatePicks.length===0?"default":"pointer",fontFamily:"inherit"}}>
   {templatePicks.length===0?tr("סימני טיפולים להוספה"):tr("הוספת {0} טיפולים", [templatePicks.length])}
 </button>
 </div>
 </div>
                  )}
                  {showNewService?(
 <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",background:"var(--pc-tint)",borderRadius:"var(--r-sm)",marginTop:6}}>
 <input value={newService.name} onChange={e=>setNewService({...newService,name:e.target.value})} placeholder={tr("שם שירות")} style={{flex:1,minWidth:0,border:"1px solid var(--line)",borderRadius:"var(--r-xs)",padding:"4px 8px",fontSize:"var(--t-xs)",fontFamily:"inherit",outline:"none",background:"var(--surface)"}}/>
 <input type="number" value={newService.price} onChange={e=>setNewService({...newService,price:Number(e.target.value)})} placeholder="₪" style={{width:54,flexShrink:0,border:"1px solid var(--line)",borderRadius:"var(--r-xs)",padding:"4px 6px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",textAlign:"center",background:"var(--surface)"}}/>
 {/* Defaults to her one active field so the common case (single-field
     tenant) needs no extra tap; two active fields leave it unset here and
     handleAddService falls back to null rather than guessing. */}
 <select value={newService.field??(businessFieldsOf(settings).length===1?businessFieldsOf(settings)[0]:"")} aria-label={tr("תחום השירות")} onChange={e=>setNewService({...newService,field:e.target.value||null})} style={{flexShrink:0,maxWidth:80,border:"1px solid var(--line)",borderRadius:"var(--r-xs)",padding:"4px 4px",fontSize:"var(--t-xs)",fontFamily:"inherit",outline:"none",background:"var(--surface)"}}>
 <option value="">{tr("לא מסומן")}</option>
                    {BUSINESS_FIELDS.map(f=><option key={f.key} value={f.key}>{f.label.split(" ")[0]}</option>)}
 </select>
 <button onClick={handleAddService} className="icon-btn sm" style={{}} title={tr("הוספה לרשימה, נשמר בלחיצה על שמירה")} aria-label={tr("הוספה לרשימה")}>+</button>
 </div>
                  ):!showTemplatePicker&&(
 <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
 <button onClick={()=>setShowNewService(true)} style={{flex:"2 1 130px",background:pcTint,border:`1px dashed ${pc}`,borderRadius:"var(--r-sm)",padding:"10px 0",fontSize:"var(--t-sm)",color:pc,cursor:"pointer",fontFamily:"inherit"}}>{tr("+ הוסיפי שירות")}</button>
 <button onClick={()=>setShowTemplatePicker(true)} style={{flex:"2 1 130px",background:"var(--surface)",border:`1px solid ${pc}`,borderRadius:"var(--r-sm)",padding:"10px 0",fontSize:"var(--t-sm)",color:pc,cursor:"pointer",fontFamily:"inherit"}}>{tr("רשימה מוכנה")}</button>
 {/* Same wizard as the client import, pointed at service_prices. */}
 <button onClick={openImportHub} style={{flex:"1 1 100px",background:"var(--surface)",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"10px 0",fontSize:"var(--t-sm)",color:"var(--ink-2)",cursor:"pointer",fontFamily:"inherit"}}>{tr("ייבוא מחירון")}</button>
 </div>
                  )}
 </div>
              )}
              {inG("business")&&(<GoalsEditor automations={editSettings.automations} pc={pc} pcTint={pcTint} onChange={(next)=>setEditSettings(prev=>({...prev,automations:next}))}/>)}
              {inG("business")&&giftVouchersVisible(settings)&&(<GiftVoucherSettings automations={editSettings.automations} services={services} pc={pc} pcTint={pcTint} toast={toast} tenantId={settings?.tenant_id||null} brandPrimary={editSettings.primary_color||settings?.primary_color} businessName={editSettings.business_name||settings?.business_name||""} logoUrl={editSettings.branding?.logo_url||settings?.branding?.logo_url||null} onChange={(next)=>setEditSettings(prev=>({...prev,automations:next}))}/>)}
              {inG("business")&&(<ProductSettings api={productsApi} automations={editSettings.automations} pc={pc} onChange={(next)=>setEditSettings(prev=>({...prev,automations:next}))}/>)}
              {inG("connections")&&(<GrowCard pc={pc} pcTint={pcTint} toast={toast} isDemo={isDemoTenantId(settings?.tenant_id)} onOpenPolicy={()=>setSettingsGroup("payments")}/>)}
              {inG("payments")&&(()=>{
   // Settings > תשלומים: every deposit in one place (app/PaymentsSettings.jsx). Writes the same branding.booking_rules fields the
   // booking rules wrote before, and shows the Grow deposit policy when she is connected.
   const b=(editSettings.branding&&typeof editSettings.branding==="object")?editSettings.branding:{};
   const r=(b.booking_rules&&typeof b.booking_rules==="object")?b.booking_rules:{};
   const setRule=(patch)=>setEditSettings(prev=>{const pb=(prev.branding&&typeof prev.branding==="object")?prev.branding:{};const cur=(pb.booking_rules&&typeof pb.booking_rules==="object")?pb.booking_rules:{};return {...prev,branding:{...pb,booking_rules:{...cur,...patch}}};});
   return(<PaymentsSettings rules={r} setRule={setRule} pc={pc} pcTint={pcTint} toast={toast} isDemo={isDemoTenantId(settings?.tenant_id)} onOpenServices={()=>setSettingsGroup("booking")}/>);
 })()}
              {inG("clients")&&(
 <div>
 <ImportFromSystem pc={pc} pcTint={pcTint} pcGrad={pcGrad} zIndex={1070} onImported={()=>{ loadAll(); }}/>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.7,marginBottom:16}}>{tr("יש לך רשימה באקסל, בטלפון או בתוכנה אחרת? אפשר להעביר אותה לכאן בכמה דקות, בלי להקליד הכל מחדש. בחרי מה להעביר:")}</p>
                  {renderImportChooser()}
 <LeadSourcesEditor sources={resolveLeadSources(editSettings.automations)} pc={pc} pcTint={pcTint} onChange={(list)=>setEditSettings(prev=>{const a=(prev.automations&&typeof prev.automations==="object")?prev.automations:{};return {...prev,automations:{...a,lead_sources:list}};})}/>
 </div>
              )}
              {inG("advanced")&&(
 <div className="glass-card" style={{padding:"14px 16px",marginBottom:14}} data-testid="account-deletion">
 <p style={{fontSize:"var(--t-md)",fontWeight:700,color:"var(--ink)",marginBottom:4}}>{tr("הנתונים שלך הם שלך")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.65,marginBottom:10}}>{tr("אם החלטת לעצור, אפשר לבקש שנמחק את החשבון וכל מה שבו. אנחנו מטפלים בזה ידנית, ובדרך כלל תוך כמה ימים, ונחזור אלייך לאשר.")}</p>
 <a href={"mailto:kalmea.app@gmail.com?subject="+encodeURIComponent("בקשת מחיקת חשבון קלמיה")+"&body="+encodeURIComponent("היי, אני רוצה למחוק את החשבון שלי בקלמיה ואת כל המידע בו.")} style={{display:"inline-block",fontSize:"var(--t-sm)",fontWeight:700,color:pcDeep,border:"1px solid var(--line-2)",borderRadius:"var(--r-md)",padding:"8px 14px",textDecoration:"none"}}>{tr("לבקש מחיקת חשבון")}</a>
 </div>
 )}
              {/* The answers here feed only the WhatsApp bot, which is connected by hand per business; without it this editor promised a bot she cannot
                  connect. Shown only where the bot runs. */}
              {inG("advanced")&&!!(settings.green_api_instance&&String(settings.green_api_instance).trim())&&(
 <div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",lineHeight:1.6,marginBottom:10}}>{tr("שאלות ותשובות שתמלאי כאן ישמשו את הבוט בוואטסאפ. כשלקוחה תשאל שאלה דומה, הבוט יענה לפי התשובה שכתבת, במקום תשובה כללית.")}</p>
                  {(editSettings.faq||[]).length===0&&(
 <div style={{textAlign:"center",padding:"22px 14px",background:pcTint,borderRadius:"var(--r-md)",marginBottom:8}}>
 <BrandImage width={48} height={48} aria-hidden alt="" src={ICON_QUESTION} style={{width:48,height:48,objectFit:"contain",marginBottom:8}}/>
 <p style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)",marginBottom:4}}>{tr("עדיין לא הוספת שאלות ותשובות")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.6,maxWidth:260,margin:"0 auto"}}>{tr("הוסיפי שאלות נפוצות של לקוחות (חניה, ביטולים, מה כדאי להביא) עם התשובה שלך, והבוט יענה בדיוק כמוך.")}</p>
 </div>
                  )}
                  {(editSettings.faq||[]).map((f,idx)=>(
 <div key={idx} style={{background:pcTint,borderRadius:"var(--r-sm)",padding:"10px 10px 8px",marginBottom:6,position:"relative"}}>
 <button onClick={()=>setEditSettings({...editSettings,faq:(editSettings.faq||[]).filter((_,i)=>i!==idx)})} className="icon-btn sm" style={{position:"absolute",top:8,left:8}} title={tr("מחיקה")} aria-label={tr("מחיקת שאלה")}>✕</button>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>{tr("שאלה")}</p>
 <input value={f.q||""} onChange={e=>setEditSettings({...editSettings,faq:(editSettings.faq||[]).map((x,i)=>i===idx?{...x,q:e.target.value}:x)})} placeholder={tr("למשל: יש חניה?")} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-xs)",padding:"7px 10px",fontSize:"var(--t-xs)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface)",fontWeight:600,color:"var(--ink)",marginBottom:6}}/>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>{tr("תשובה")}</p>
 <textarea value={f.a||""} onChange={e=>setEditSettings({...editSettings,faq:(editSettings.faq||[]).map((x,i)=>i===idx?{...x,a:e.target.value}:x)})} placeholder={tr("התשובה שהבוט ייתן ללקוחה")} rows={2} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-xs)",padding:"7px 10px",fontSize:"var(--t-xs)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface)",resize:"vertical",lineHeight:1.5}}/>
 </div>
                  ))}
 <button onClick={()=>setEditSettings({...editSettings,faq:[...(editSettings.faq||[]),{q:"",a:""}]})} style={{background:pcTint,border:`1px dashed ${pc}`,borderRadius:"var(--r-sm)",padding:"8px 0",width:"100%",fontSize:"var(--t-xs)",color:pc,cursor:"pointer",fontFamily:"inherit",marginTop:6}}>{tr("+ הוספת שאלה")}</button>
 </div>
              )}
              {inG("booking","messages")&&(()=>{
                // Per-day hours live in the business_hours JSONB. We edit a
                // normalized { 0..6: {open,close}|null } map and, on every
                // change, also refresh the legacy start/end + working_days on
                // editSettings so the existing handleSaveSettings persists both
                // — keeping un-migrated readers correct. Save logic unchanged.
                const bh=normalizeBusinessHours(editSettings);
                const commit=(next)=>setEditSettings({...editSettings,business_hours:next,...legacyHoursFromMap(next)});
                // Any hour, any day. Opening runs 00:00–23:00 and closing
                // 01:00–24:00, so an evening clinic, a Friday morning and a
                // Saturday night after Shabbat are all describable. The clamps
                // below only keep close > open; they no longer pull the value
                // back into a 07:00–20:00 window that was never anyone's rule.
                const toggleDay=(d)=>{const next={...bh};next[d]=bh[d]?null:{open:9,close:18};commit(next);};
                const setOpen=(d,val)=>{const cur=bh[d]||{open:9,close:18};const open=Number(val);let close=cur.close;if(close<=open)close=Math.min(open+1,24);commit({...bh,[d]:{open,close}});};
                const setClose=(d,val)=>{const cur=bh[d]||{open:9,close:18};const close=Number(val);let open=cur.open;if(close<=open)open=Math.max(close-1,0);commit({...bh,[d]:{open,close}});};
                return(
 <div style={{display:"flex",flexDirection:"column",gap:6}}>
 {inG("booking")&&(<>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.6,marginBottom:4}}>{tr("הגדירי לכל יום אם את עובדת ובאילו שעות, כל שעה בין 00:00 ל-24:00, בכל אחד משבעת הימים. יום כבוי מסומן כ״סגור״.")}</p>
 {DAYS_HE.map((label,d)=>{
   const dh=bh[d];const isOpen=!!dh;
   return(
 <div key={d} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:"var(--r-sm)",border:"1px solid var(--line-2)",background:isOpen?"var(--surface-2)":"var(--surface)",opacity:isOpen?1:0.6,transition:"opacity .2s"}}>
 <span style={{width:52,fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)"}}>{trv(label)}</span>
 <Toggle on={isOpen} onChange={()=>toggleDay(d)} pc={pc} label={tr("פתוח ביום {0}", [label])} />
 {isOpen?(
 <div style={{display:"flex",alignItems:"center",gap:6,marginRight:"auto"}}>
 <select aria-label={tr("שעת פתיחה ביום {0}", [label])} value={dh.open} onChange={e=>setOpen(d,e.target.value)} style={hourSelectStyle}>{HOURS_ALL.map((h,i)=><option key={h} value={i}>{h}</option>)}</select>
 <span style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>–</span>
 <select aria-label={tr("שעת סגירה ביום {0}", [label])} value={dh.close} onChange={e=>setClose(d,e.target.value)} style={hourSelectStyle}>{CLOSE_HOURS.map(o=><option key={o.value} value={o.value}>{trv(o.label)}</option>)}</select>
 </div>
 ):(
 <span style={{marginRight:"auto",fontSize:"var(--t-xs)",color:"var(--ink-3)",fontWeight:600}}>{tr("סגור")}</span>
 )}
 </div>
   );
 })}
 </>)}
 {inG("booking")&&(()=>{
   // A break clients cannot book into. Stored in branding.lunch_break and saved
   // with the rest of the settings (lib/lunchBreak); she can still book into it herself.
   const b=(editSettings.branding&&typeof editSettings.branding==="object")?editSettings.branding:{};
   const lb=(b.lunch_break&&typeof b.lunch_break==="object")?b.lunch_break:{};
   const on=lb.on===true;
   const startMin=Number.isInteger(lb.start_minute)?lb.start_minute:LUNCH_DEFAULT.start_minute;
   const mins=Number.isFinite(Number(lb.minutes))?Number(lb.minutes):LUNCH_DEFAULT.minutes;
   const setLb=(patch)=>setEditSettings(prev=>{const pb=(prev.branding&&typeof prev.branding==="object")?prev.branding:{};const cur=(pb.lunch_break&&typeof pb.lunch_break==="object")?pb.lunch_break:{};return {...prev,branding:{...pb,lunch_break:{on:cur.on===true,start_minute:Number.isInteger(cur.start_minute)?cur.start_minute:LUNCH_DEFAULT.start_minute,minutes:Number.isFinite(Number(cur.minutes))?Number(cur.minutes):LUNCH_DEFAULT.minutes,...patch}}};});
   const starts=[];for(let m=10*60;m<=16*60;m+=30)starts.push(m);
   const hhmm=(m)=>String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");
   return(
 <div style={{marginTop:10,padding:"12px 14px",borderRadius:"var(--r-sm)",border:"1px solid var(--line-2)",background:on?"var(--surface-2)":"var(--surface)"}}>
 <div style={{display:"flex",alignItems:"center",gap:10}}>
 <div style={{flex:1}}>
 <p style={{fontSize:"var(--t-md)",fontWeight:600,color:"var(--ink)",margin:0}}>{tr("הפסקה שלי")}</p>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",lineHeight:1.5,margin:0}}>{tr("לקוחות שקובעות דרך הדף לא יוכלו לקחת אותה, גם כשהיומן נראה פנוי. את עדיין יכולה.")}</p>
 </div>
 <Toggle on={on} onChange={()=>setLb({on:!on})} pc={pc} label={tr("הפסקה שלי")} />
 </div>
 {on&&(
 <div style={{display:"flex",alignItems:"center",gap:8,marginTop:10}}>
 <select aria-label={tr("תחילת ההפסקה")} value={startMin} onChange={e=>setLb({start_minute:Number(e.target.value)})} style={hourSelectStyle}>{starts.map(m=><option key={m} value={m}>{hhmm(m)}</option>)}</select>
 <span style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>{tr("למשך")}</span>
 <select aria-label={tr("אורך ההפסקה")} value={mins} onChange={e=>setLb({minutes:Number(e.target.value)})} style={hourSelectStyle}>{[15,30,45,60,90].map(m=><option key={m} value={m}>{m} {tr("דקות")}</option>)}</select>
 </div>
 )}
 </div>
   );
 })()}
{inG("booking")&&(()=>{
   // How far ahead, and how late, a client may book on her own page. Stored in branding.booking_rules and enforced by the
   // public page AND /api/book-appointment from one function (lib/bookingPolicy.ts). She can still book anything herself.
   const b=(editSettings.branding&&typeof editSettings.branding==="object")?editSettings.branding:{};
   const r=(b.booking_rules&&typeof b.booking_rules==="object")?b.booking_rules:{};
   const notice=Number.isFinite(Number(r.min_notice_hours))&&r.min_notice_hours!==""&&r.min_notice_hours!==null&&r.min_notice_hours!==undefined?Number(r.min_notice_hours):2;
   const ahead=Number.isFinite(Number(r.max_days_ahead))&&r.max_days_ahead?Number(r.max_days_ahead):21;
   const setRule=(patch)=>setEditSettings(prev=>{const pb=(prev.branding&&typeof prev.branding==="object")?prev.branding:{};const cur=(pb.booking_rules&&typeof pb.booking_rules==="object")?pb.booking_rules:{};return {...prev,branding:{...pb,booking_rules:{...cur,...patch}}};});
   const sel={border:"1px solid var(--line-2)",borderRadius:"var(--r-xs)",padding:"7px 8px",fontSize:"var(--t-sm)",fontFamily:"inherit",background:"var(--surface)"};
   return(
 <div style={{marginTop:10,padding:"12px 14px",borderRadius:"var(--r-sm)",border:"1px solid var(--line-2)",background:"var(--surface-2)"}}>
 <p style={{fontSize:"var(--t-md)",fontWeight:600,color:"var(--ink)",margin:"0 0 2px"}}>{tr("כללי קביעת תור בדף שלך")}</p>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",lineHeight:1.5,margin:"0 0 10px"}}>{tr("מה לקוחות יכולות לקבוע בעצמן דרך הדף. את תמיד יכולה לקבוע כל תור ידנית ביומן.")}</p>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
 <label style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,fontSize:"var(--t-sm)",color:"var(--ink-2)"}}><span>{tr("הודעה מראש לפחות")}</span>
 <select aria-label={tr("הודעה מראש לפחות")} value={notice} onChange={e=>setRule({min_notice_hours:Number(e.target.value)})} style={sel}>{[[0,"בלי הגבלה"],[1,"שעה"],[2,"שעתיים"],[4,"4 שעות"],[12,"12 שעות"],[24,"יום"],[48,"יומיים"],[72,"3 ימים"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
 <label style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,fontSize:"var(--t-sm)",color:"var(--ink-2)"}}><span>{tr("עד כמה זמן קדימה")}</span>
 <select aria-label={tr("עד כמה זמן קדימה")} value={ahead} onChange={e=>setRule({max_days_ahead:Number(e.target.value)})} style={sel}>{[[7,"שבוע"],[14,"שבועיים"],[21,"3 שבועות"],[30,"30 יום"],[45,"45 יום"],[60,"60 יום"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
 {/* Yom tov is closed to self-booking unless she ticks this (lib/holidayClosure.ts). */}
 <label style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,fontSize:"var(--t-sm)",color:"var(--ink-2)",minHeight:40}}><span>{tr("לקבל הזמנות בדף גם בחגים")}</span>
 <input type="checkbox" data-testid="open-on-holidays" checked={r.open_on_holidays===true} onChange={e=>setRule({open_on_holidays:e.target.checked})} style={{width:18,height:18,accentColor:pc}}/></label>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",lineHeight:1.5,margin:"-4px 0 0"}}>{tr("כשזה כבוי, ראש השנה, יום כיפור, החג הראשון והאחרון של סוכות ופסח ושבועות סגורים להזמנה בדף. את עדיין יכולה לקבוע בהם תור ידנית ביומן.")}</p>
 <label style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,fontSize:"var(--t-sm)",color:"var(--ink-2)"}}><span>{tr("זמן הפסקה אחרי כל טיפול")}</span>
 <select aria-label={tr("זמן הפסקה אחרי כל טיפול")} data-testid="business-buffer" value={businessBufferDefault(b)} onChange={e=>setRule({buffer_minutes:Number(e.target.value)})} style={sel}>{(BUFFER_OPTIONS.includes(businessBufferDefault(b))?BUFFER_OPTIONS:[...BUFFER_OPTIONS,businessBufferDefault(b)]).map(v=><option key={v} value={v}>{v===0?tr("בלי"):tr("{0} דקות", [v])}</option>)}</select></label>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",lineHeight:1.5,margin:"-4px 0 0"}}>{tr("הזמן הזה נשאר פנוי אחרי כל תור, גם בדף וגם ביומן שלך. אפשר לקבוע זמן אחר לשירות מסוים ברשימת השירותים.")}</p>
 <label style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,fontSize:"var(--t-sm)",color:"var(--ink-2)"}}><span>{tr("ביטול ללא חיוב עד")}</span>
 <select aria-label={tr("חלון ביטול")} value={Number(r.cancel_window_hours)||0} onChange={e=>setRule({cancel_window_hours:Number(e.target.value)})} style={sel}>{[[0,"בלי מגבלה"],[12,"12 שעות לפני"],[24,"יום לפני"],[48,"יומיים לפני"],[72,"3 ימים לפני"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
 {/* The deposit moved to Settings > תשלומים (app/PaymentsSettings.jsx), the one place for deposits. Same field; here only a link. */}
 <div data-testid="booking-deposit-link" style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,fontSize:"var(--t-sm)",color:"var(--ink-2)",flexWrap:"wrap"}}><span>{tr("מקדמה בקביעת תור:")} {Number(r.deposit_amount)>0?`₪${Number(r.deposit_amount)}`:tr("ללא")}</span>
 <button type="button" onClick={()=>setSettingsGroup("payments")} style={{background:"none",border:"none",padding:"8px 0",minHeight:40,color:"var(--pc-deep)",fontWeight:700,fontSize:"var(--t-sm)",textDecoration:"underline",cursor:"pointer",fontFamily:"inherit"}}>{tr("לשינוי בתשלומים ←")}</button></div>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",lineHeight:1.5,margin:0}}>{tr("כשיש מקדמה או חלון ביטול, הלקוחה רואה את התנאים בדף ההזמנה ומאשרת אותם לפני שהתור נקבע. הקישור לביטול בהודעה לא יבטל תור שנמצא בתוך החלון. המקדמה משולמת אלייך ישירות, והמערכת לא גובה אותה.")}</p>
 </div>
 </div>
   );
 })()}
 {inG("messages")&&(()=>{
   // A message to HER the evening before: how many clients tomorrow, who is first,
   // who has not confirmed. Off unless she turns it on. Stored in automations.evening_summary; the old
   // branding.evening_summary is still read (lib/eveningSummarySetting.ts) and never written again.
   const on=eveningSummaryOn(editSettings);
   return(
 <div style={{marginTop:10,padding:"12px 14px",borderRadius:"var(--r-sm)",border:"1px solid var(--line-2)",background:on?"var(--surface-2)":"var(--surface)",display:"flex",alignItems:"center",gap:10}}>
 <div style={{flex:1}}>
 <p style={{fontSize:"var(--t-md)",fontWeight:600,color:"var(--ink)",margin:0}}>{tr("סיכום ערב")}</p>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",lineHeight:1.5,margin:0}}>{tr("התראה אליך בערב (באפליקציה, ובדפדפן אם הפעלת התראות דפדפן (בקבוצה \"חיבורים\")): כמה לקוחות מחר, מי הראשונה ומי עוד לא אישרה. לא נשלח בימי שישי ושבת, ולא ביום בלי תורים.")}</p>
 </div>
 <Toggle on={on} onChange={()=>setEditSettings(prev=>withEveningSummary(prev,!on))} pc={pc} label={tr("סיכום ערב")} />
 </div>
   );
 })()}
 </div>
                );
              })()}
              {inG("business","connections")&&(
 <div style={{display:"flex",flexDirection:"column",gap:9}}>
 {inG("business")&&(<>
 <div><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>{tr("טלפון העסק (וואטסאפ ויצירת קשר, וגם ביט)")}</p><input type="tel" inputMode="tel" dir="ltr" value={editSettings.business_phone||""} onChange={e=>setEditSettings({...editSettings,business_phone:e.target.value})} placeholder="050-0000000" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface-2)"}}/></div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",lineHeight:1.5}}>{tr("זה המספר שלקוחות רואות בדף הקביעה ובהודעות, וגם הוא ישמש לבקשות תשלום בביט. אפשר להשאיר ריק.")}</p>
 <div style={{marginTop:6}}><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>{tr("המספר שלך לקבלת התראות (לא מוצג ללקוחות)")}</p><input type="tel" inputMode="tel" dir="ltr" value={(editSettings.automations&&typeof editSettings.automations==="object"&&editSettings.automations.owner_phone)||""} onChange={e=>setEditSettings(prev=>{const a=(prev.automations&&typeof prev.automations==="object")?prev.automations:{};return {...prev,automations:{...a,owner_phone:e.target.value}};})} placeholder="050-0000000" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface-2)"}}/>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",lineHeight:1.5,marginTop:4}}>{tr("התראות אליך בוואטסאפ (תור חדש, ביטול) יגיעו למספר הזה. אם תשאירי ריק, הן יגיעו למספר העסק.")}</p></div>
 </>)}
 {inG("connections")&&(<>
 <div style={{marginTop:6,padding:"14px",border:"1px solid var(--line-2)",borderRadius:"var(--r-md)",background:"var(--surface-2)",display:"flex",flexDirection:"column",gap:8}}>
 <p style={{fontSize:"var(--t-md)",fontWeight:700,color:"var(--ink)",margin:0}}>{tr("קבלות וחשבוניות חוקיות (מורנינג)")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",lineHeight:1.6,margin:0}}>{tr("קבלה וחשבונית מס חייבות לצאת מתוכנה רשומה ברשות המסים, ולכן אנחנו לא מפיקות אותן בעצמנו. חברי את חשבון מורנינג שלך והמסמכים יונפקו שם, בחשבון שלך ובמספר העסק שלך. עד שתחברי, התשלומים נרשמים כאישורי תשלום, שהם לא קבלה.")}</p>
                    {legalAccount?.environment==="sandbox"&&<p style={{fontSize:"var(--t-xs)",color:"var(--warning)",lineHeight:1.5,margin:0}}>{tr("מצב בדיקות: החיבור עדיין מקבל רק חשבון בדיקות של מורנינג, ולא חשבון אמיתי.")}</p>}
                    {legalAccount?.migrationMissing&&<p style={{fontSize:"var(--t-xs)",color:"var(--danger)",lineHeight:1.5,margin:0}}>{tr("החיבור עדיין לא זמין אצלך. אפשר לכתוב לנו ב\"תקועה?\" למטה ונפעיל אותו.")}</p>}
                    {legalAccount?.connected?(
 <div style={{display:"flex",flexDirection:"column",gap:6}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--success)",fontWeight:700,margin:0}}>{tr("✓ מחוברת")}{legalAccount.businessName?" לחשבון: "+legalAccount.businessName:""}</p>
                        {legalAccount.needsReconnect&&<p style={{fontSize:"var(--t-xs)",color:"var(--danger)",lineHeight:1.5,margin:0}}>{legalAccount.lastError||tr("החיבור לא תקין. חברי מחדש.")}</p>}
 <button onClick={()=>askConfirm({ title:tr("לנתק את מורנינג?"), message:tr("כדי לחבר שוב יהיה צריך להזין מחדש את מפתח ה-API. המסמכים שכבר הונפקו נשארים."), confirmText:tr("כן, לנתק"), cancelText:tr("ביטול"), danger:true, onConfirm: async()=>{ setLegalMsg(""); try{ const r=await fetch("/api/legal-receipts/account",{method:"DELETE"}); if(r.ok){ setLegalAccount(a=>({...(a||{}),connected:false,businessName:"",needsReconnect:false})); toast(tr("החיבור למורנינג נותק. המסמכים שכבר הונפקו נשארים בחשבון שלך.")); } else { const d=await r.json().catch(()=>null); setLegalMsg((d&&d.error)||STUCK_HE); } }catch{ setLegalMsg(STUCK_HE); } } })} style={{alignSelf:"flex-start",background:"none",border:"none",color:"var(--ink-3)",fontSize:"var(--t-xs)",textDecoration:"underline",cursor:"pointer",fontFamily:"inherit",padding:0}}>{tr("ניתוק החשבון")}</button>
 </div>
                    ):(
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",lineHeight:1.6,margin:0}}>{tr("מפתח נוצר במורנינג: הגדרות, כלים למפתחים, מפתחות API. נדרש מסלול שכולל API (Best ומעלה).")}</p>
 <input value={legalKeyId} onChange={e=>setLegalKeyId(e.target.value)} placeholder={tr("מזהה המפתח (API key id)")} autoComplete="off" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:"ltr",textAlign:"left",background:"var(--surface)"}}/>
 <input value={legalSecret} onChange={e=>setLegalSecret(e.target.value)} type="password" placeholder={tr("הסוד (API secret)")} autoComplete="off" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:"ltr",textAlign:"left",background:"var(--surface)"}}/>
 {!settings.business_tax_status&&<p style={{fontSize:"var(--t-xs)",color:"var(--danger)",lineHeight:1.5,margin:0,fontWeight:700}}>{tr("קודם בחרי סטטוס עוסק (בקבוצה \"העסק שלי\") ושמרי, ואז אפשר לחבר. הסטטוס קובע איזה מסמך יופק.")}</p>}
 <button disabled={isBusy("legalConnect")||!legalKeyId.trim()||!legalSecret.trim()||!settings.business_tax_status} onClick={async()=>{
                          setLegalMsg(""); setBusyKey("legalConnect",true);
                          try{
                            const r=await fetch("/api/legal-receipts/account",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({keyId:legalKeyId,secret:legalSecret})});
                            const d=await r.json().catch(()=>null);
                            if(r.ok&&d&&d.success){ setLegalAccount(a=>({...(a||{}),connected:true,provider:"morning",businessName:d.businessName||"",environment:d.environment,needsReconnect:false})); setLegalKeyId(""); setLegalSecret(""); toast(tr("החשבון חובר. מעכשיו כל תשלום יונפק כמסמך במורנינג ✦")); }
                            else setLegalMsg((d&&d.error)||STUCK_HE);
                          }catch{ setLegalMsg(STUCK_HE); } finally { setBusyKey("legalConnect",false); }
                        }} className="primary-btn" style={{padding:"10px 16px",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)"}}>{isBusy("legalConnect")?<Spinner inline label={tr("מתחברת")}/>:tr("חיבור החשבון")}</button>
 </div>
                    )}
                    {legalMsg&&<p style={{fontSize:"var(--t-xs)",color:"var(--danger)",lineHeight:1.5,margin:0}}>{legalMsg}</p>}
 </div>
 </>)}
 </div>
              )}
 </div>
 <div>
                {/* Botanical pass: a hairline-flower-hairline divider instead
                    of a plain grey rule, ahead of the Close/Save bar. One of
                    ~20 similar borderTop separators in this panel alone
                    (mostly field-group breaks a few lines apart) - converting
                    all of them would stack far more than two flowers on one
                    screen, so only this single, structurally distinct one
                    (content vs. the sticky action bar) got the treatment. */}
 <div style={{display:"flex",alignItems:"center",gap:8,padding:"0 24px"}}>
 <span style={{flex:1,height:1,background:ROSE_DIVIDER}}/>
 <BrandImage src={FLOWER_64} alt="" width={64} height={64} style={{width:22,height:22,opacity:0.7,display:"block"}}/>
 <span style={{flex:1,height:1,background:ROSE_DIVIDER}}/>
 </div>
 <div style={{display:"flex",gap:6,padding:"14px 24px"}}>
 <button onClick={()=>closeSettings()} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line)",background:"var(--surface)",fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{tr("סגירה")}</button>
 <button onClick={saveSettingsPanel} disabled={isBusy("saveSettings")||!panelDirty} className="primary-btn" style={{flex:2,padding:"11px 0",background:panelDirty?pcGrad:"var(--line-2)",color:panelDirty?"var(--pc-contrast)":"var(--ink-3)",fontSize:"var(--t-sm)",cursor:panelDirty?"pointer":"default",display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6}}>{isBusy("saveSettings")?<Spinner inline label={tr("שומרת")}/>:panelDirty?(<><BrandImage width={14} height={14} aria-hidden alt="" src={FLOWER_64} style={{width:14,height:14,objectFit:"contain"}}/>{tr("שמירה ✓")}</>):tr("אין שינויים")}</button>
 </div>
 </div>
 </Sheet>/* @screen-end */
  );
}
