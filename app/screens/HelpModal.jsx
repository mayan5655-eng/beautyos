"use client";
// app/screens/HelpModal.jsx — {showHelp && ...} of the owner's app.
//
// Moved out of app/beautyos.jsx by scripts/extract-screen.mjs, byte for byte: nothing between the two markers below was
// rewritten. Everything it reads from the app arrives in one `ctx` object, whose names scripts/check-screens.mjs holds
// equal to what beautyos.jsx passes. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back
// in its place, so the tests that protect these words still read them where they always were.
//
// To change this screen: edit it here. To give it something new from the app: add the name to the destructuring below
// AND to the ctx={{...}} of <HelpModal> in app/beautyos.jsx (the check fails until both sides agree).
import { ICON_QUESTION, ICON_FLOWER } from "@/lib/brand";
import BrandImage from "@/app/BrandImage";
import Sheet from "../Sheet";
import Spinner from "../Spinner";
import { supportWhatsAppUrl, SUPPORT_WHATSAPP_MESSAGE, SUPPORT_TEAM_HE } from "@/lib/support";
import HelpChat from "../HelpChat";
import { tr } from "@/lib/i18n/tr";

export default function HelpModal({ ctx }) {
  const {
    activeTab, askHumanFromChat, helpChat, helpState, helpText, helpTextRef, pcDeep, pcGrad, sendHelp,
    setHelpChat, setHelpState, setHelpText, setShowHelp,
  } = ctx;
  return (
    /* @screen-body */<Sheet open onClose={() => setShowHelp(false)} width={420} zIndex={5200} ariaLabel={tr("עזרה")}>
            {helpState === "sent" ? (
              <div style={{textAlign:"center"}}>
                <BrandImage width={52} height={52} aria-hidden alt="" src={ICON_FLOWER} style={{width:52,height:52,margin:"0 auto 10px",display:"block"}}/>
                <h3 className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,marginBottom:6,color:"var(--ink)"}}>{tr("ההודעה נשלחה")}</h3>
                <p style={{fontSize:"var(--t-md)",color:"var(--ink-3)",lineHeight:1.7,marginBottom:18}}>
                  {tr("קיבלנו.")} {SUPPORT_TEAM_HE} {tr("יחזרו אלייך בוואטסאפ, בדרך כלל עד סוף היום הבא. אפשר להמשיך לעבוד בינתיים.")}
                </p>
                <button type="button" onClick={()=>{setShowHelp(false);setHelpText("");setHelpState("idle");}} className="primary-btn" style={{width:"100%",padding:"12px 0",background:pcGrad,color:"var(--pc-contrast)",borderRadius:"var(--r-xl)",fontSize:"var(--t-md)"}}>{tr("סגירה")}</button>
              </div>
            ) : (
              <>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <BrandImage width={48} height={48} aria-hidden alt="" src={ICON_QUESTION} style={{width:48,height:48,objectFit:"contain",flexShrink:0}}/>
                  <h3 className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,margin:0,color:"var(--ink)"}}>{tr("תקועה?")}</h3>
                </div>
                <HelpChat messages={helpChat} setMessages={setHelpChat} activeTab={activeTab} onAskHuman={askHumanFromChat} pcGrad={pcGrad} pcDeep={pcDeep}/>
                <div role="separator" aria-hidden style={{height:1,background:"var(--line-2)",margin:"16px 0 14px"}}/>
                <h4 className="serif" data-testid="help-human-title" style={{fontSize:"var(--t-lg)",fontWeight:600,margin:"0 0 4px",color:"var(--ink)"}}>{tr("לא מצאת תשובה? שלחי לנו הודעה")}</h4>
                <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",lineHeight:1.6,marginBottom:12}}>
                  {tr("כתבי מה קרה, ותקבלי תשובה מ")}{SUPPORT_TEAM_HE}{tr(". נשלח גם באיזה מסך את נמצאת, כדי שלא תצטרכי להסביר.")}
                </p>
                <textarea
                  ref={helpTextRef}
                  aria-label={tr("ההודעה שלך אלינו")}
                  value={helpText}
                  onChange={(e)=>{setHelpText(e.target.value); if(helpState==="failed") setHelpState("idle");}}
                  rows={5}
                  maxLength={4000}
                  placeholder={tr("מה קרה? אפשר גם רק במשפט אחד.")}
                  style={{width:"100%",padding:"11px 12px",borderRadius:"var(--r-sm)",border:"1px solid var(--line-2)",fontSize:"var(--t-md)",fontFamily:"inherit",resize:"vertical",lineHeight:1.6,boxSizing:"border-box",background:"var(--surface-2)",color:"var(--ink)"}}
                />
                {helpState === "failed" && (
                  <div style={{marginTop:10,padding:"11px 12px",borderRadius:"var(--r-sm)",background:"var(--brand-cream, #FBF8F1)",border:"1px solid var(--line-2)"}}>
                    <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--danger)",marginBottom:4}}>{tr("ההודעה לא נשלחה")}</p>
                    <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.6,marginBottom:9}}>
                      {tr("לא הצלחנו לשלוח אותה מכאן. מה שכתבת עדיין כאן")}{supportWhatsAppUrl()?tr(", ואפשר לשלוח אותו ישירות בוואטסאפ"):tr(", אפשר לנסות שוב עוד רגע")}.
                    </p>
                    {supportWhatsAppUrl(helpText.trim() || SUPPORT_WHATSAPP_MESSAGE) && (
                    <a
                      href={supportWhatsAppUrl(helpText.trim() || SUPPORT_WHATSAPP_MESSAGE)}
                      target="_blank"
                      rel="noreferrer"
                      style={{display:"block",textAlign:"center",padding:"10px 0",borderRadius:"var(--r-xl)",background:"#25D366",color:"#fff",fontSize:"var(--t-sm)",fontWeight:700,textDecoration:"none"}}
                    >
                      {tr("✆ שליחה בוואטסאפ")}
                    </a>
                    )}
                  </div>
                )}
                <div style={{display:"flex",gap:8,marginTop:12}}>
                  <button type="button" onClick={()=>setShowHelp(false)} className="primary-btn" style={{flex:1,minHeight:44,padding:"11px 0",border:"1.5px solid var(--line-2)",borderRadius:"var(--r-xl)",background:"var(--surface)",fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{tr("ביטול")}</button>
                  <button type="button" onClick={sendHelp} disabled={!helpText.trim()||helpState==="sending"} className="primary-btn" style={{flex:2,minHeight:44,padding:"11px 0",background:pcGrad,color:"var(--pc-contrast)",borderRadius:"var(--r-xl)",fontSize:"var(--t-sm)",opacity:(!helpText.trim()||helpState==="sending")?0.55:1}}>
                    {helpState==="sending"?<Spinner inline label={tr("שולחת")}/>:helpState==="failed"?tr("נסי לשלוח שוב"):tr("שליחה")}
                  </button>
                </div>
                <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:10,lineHeight:1.5,textAlign:"center"}}>
                  {tr("לא נשלחים שמות לקוחות, טלפונים או פרטי טיפול. רק מה שכתבת כאן.")}
                </p>
              </>
            )}
          </Sheet>/* @screen-end */
  );
}
