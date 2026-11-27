"use client";
// app/sections/useAdvisorActionsSection.jsx — part of the owner's app: 37 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
import { waMsg } from "../shared/datesAndLinks";
import { tr } from "@/lib/i18n/tr";

export function useAdvisorActionsSection(ctx) {
  const {
    clients, openSettings, queueApproved, setActiveTab, setMarketingView, setQueueApproved, toast,
  } = ctx;
  /* @section-body */const approveSkinFollowup = (it) => {
    if(queueApproved.has(it.key)) return; // double-click / repeated-approval guard
    const c = clients.find(x=>String(x.id)===String(it.clientId));
    if(!c){ toast(tr("הלקוחה כבר לא קיימת, הפעולה בוטלה. אפשר לרענן את המסך."),"error"); return; }
    if(!(c.phone&&String(c.phone).trim())){ toast(tr("אין ללקוחה מספר טלפון, אז אי אפשר לשלוח לה"),"error"); return; }
    const text = String(it.message||"").trim();
    if(!text){ toast(tr("אין הודעה מוכנה לכרטיס הזה"),"error"); return; }
    const link = waMsg(c.phone, text);
    if(!link){ toast(tr("מספר הטלפון של הלקוחה לא תקין"),"error"); return; }
    window.open(link, "_blank", "noopener");
    setQueueApproved(prev=>{const n=new Set(prev);n.add(it.key);return n;});
    toast(tr("נפתחה שיחת וואטסאפ עם ההודעה מוכנה, שלחי משם ✓"),"success");
  };

  // Connect a free-text Advisor reply to ONE existing next action. The Advisor
  // returns unstructured prose (no client/scan/appointment references), so this
  // does NOT change the AI or invent recommendation types — it matches the KNOWN
  // topics the advisor already covers and routes to the relevant existing module.
  // Returns {label, run} or null. First match wins (priority order); idempotent
  // navigation (no entity mutation, no duplicates, safe to click repeatedly).
  const advisorAction = (text) => {
    const t = String(text||"");
    const has = (...ws)=>ws.some(w=>t.includes(w));
    // Dormant / win-back advice -> the unified approval queue, where the per-client
    // rebooking + skin-follow-up suggestions already exist (no new items invented).
    if(has("רדומ","לא ביקר","לא הגיע","החזרת לקוחות","להחזיר לקוחות","נטש"))
      return { label:tr("פתחי משימות ממתינות"), run:()=>setActiveTab("dashboard") };
    if(has("קמפיין","מבצע","שיווק","פוסט","סושיאל","אינסטגרם","פייסבוק"))
      return { label:tr("צרי קמפיין"), run:()=>{ setMarketingView("campaigns"); setActiveTab("campaigns"); } };
    if(has("ליד","פנייה","פניות","לידים"))
      return { label:tr("פתחי פניות"), run:()=>setActiveTab("leads") };
    if(has("יומן","תור פנוי","תורים פנויים","למלא את היומן","זמינות"))
      return { label:tr("פתחי יומן"), run:()=>setActiveTab("calendar") };
    if(has("תמחור","העלאת מחיר","המחיר","חבילת","חבילות"))
      return { label:tr("פתחי שירותים ומחירים"), run:()=>openSettings("services") };
    return null;
  };/* @section-end */
  return { advisorAction, approveSkinFollowup };
}
