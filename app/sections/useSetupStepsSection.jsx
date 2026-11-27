"use client";
// app/sections/useSetupStepsSection.jsx — part of the owner's app: 32 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
//
// `late`: copyPublicLink is declared further down the component than this hook's call. A handler here may call
// it (handlers run after the whole component body has), but reading it while rendering would be an error. So it arrives as a getter and is
// wrapped below: read only when called.
import { useState } from "react";
import { tr } from "@/lib/i18n/tr";

export function useSetupStepsSection(ctx) {
  const {
    appointments, linkShared, openSetupTab, services, settings, late,
  } = ctx;
  const copyPublicLink = (...args) => late.copyPublicLink(...args);
  /* @section-body */const _sb = (settings.branding && typeof settings.branding === "object") ? settings.branding : {};
  const setupSteps = [
    { key:"details",  done: !!(settings.business_name && settings.business_name.trim() && settings.business_name.trim()!=="העסק שלי") && !!(settings.business_phone && String(settings.business_phone).trim()), label:tr("פרטי העסק"), hint:tr("שם וטלפון ליצירת קשר"), onClick:()=>openSetupTab("general") },
    { key:"tax",      done: !!settings.business_tax_status, label:tr("סוג העסק (פטור, מורשה או חברה)"), hint:tr("קובע איזה מסמך חוקי אפשר להפיק"), onClick:()=>openSetupTab("general") },
    { key:"services", done: services.length>0, label:tr("שירותים ומחירים"), hint:tr("רשימת הטיפולים והמחירים"), onClick:()=>openSetupTab("services","newService") },
    { key:"hours",    done: !!(settings.business_hours && typeof settings.business_hours==="object" && Object.keys(settings.business_hours).length>0) || (settings.working_hours_start!=null && settings.working_hours_end!=null), label:tr("שעות פעילות"), hint:tr("מתי העסק פתוח"), onClick:()=>openSetupTab("hours") },
    { key:"link",     done: linkShared||!!settings?.automations?.link_shared_at||appointments.length>0, label:tr("שליחת הקישור לקביעת תור ללקוחה"), hint:tr("כך התור הראשון נקבע לבד"), cta:tr("העתקת הקישור"), onClick:()=>copyPublicLink("book") },
    { optional:true, key:"branding", done: !!_sb.logo_url && !!settings.primary_color && !!(_sb.welcome_headline||_sb.welcome_message), label:tr("מיתוג"), hint:tr("לוגו, צבעים וטקסט פתיחה"), onClick:()=>openSetupTab("branding") },
    { optional:true, key:"gallery",  done: Array.isArray(_sb.gallery) && _sb.gallery.length>0, label:tr("גלריית תמונות"), hint:tr("תמונות לעמוד העסק"), onClick:()=>openSetupTab("branding") },
    { optional:true, key:"social",   done: !!(_sb.whatsapp_number||_sb.instagram||_sb.facebook||_sb.tiktok||_sb.website), label:tr("רשתות חברתיות וקישורים"), hint:tr("וואטסאפ, אינסטגרם, אתר ועוד"), onClick:()=>openSetupTab("branding") },
    // Was: settings.green_api_token, which the browser no longer receives.
  ];
  // Guided, one step at a time - deliberately NOT an accordion. Only the next
  // incomplete step can be opened; completed ones sit collapsed with their tick
  // and the ones beyond the next are visible but not yet actionable. Everything
  // starts collapsed, so the card is a short list of single lines instead of
  // seven expanded blocks.
  // UX pass 2026-11-08: five core steps count; branding, gallery and social are "לא חובה, אבל עוזר" and live only
  // in the Settings checklist, so "הגדרת המערכת" leaves Today once the core five are done.
  const coreSetupSteps = setupSteps.filter(s=>!s.optional);
  const extraSetupSteps = setupSteps.filter(s=>s.optional);
  const nextSetupKey = (coreSetupSteps.find(s=>!s.done)||extraSetupSteps.find(s=>!s.done)||{}).key || null;
  // Holds the key she expanded, not a boolean. Once that step is completed the
  // key stops matching nextSetupKey on its own, so the following step arrives
  // collapsed and no effect is needed to reset anything.
  const [expandedSetupKey, setExpandedSetupKey] = useState(null);
  // Help page accordion: the key she opened; null = the first section.
  const [expandedHelpKey, setExpandedHelpKey] = useState(null);

  const setupDone = coreSetupSteps.filter(s=>s.done).length;
  const setupTotal = coreSetupSteps.length;
  const setupPct = Math.round((setupDone/setupTotal)*100);/* @section-end */
  return { coreSetupSteps, expandedHelpKey, expandedSetupKey, extraSetupSteps, nextSetupKey, setExpandedHelpKey,
    setExpandedSetupKey, setupDone, setupPct, setupTotal };
}
