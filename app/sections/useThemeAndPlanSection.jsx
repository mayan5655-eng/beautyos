"use client";
// app/sections/useThemeAndPlanSection.jsx — part of the owner's app: 62 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
import { useCallback } from "react";
import { planState } from "@/lib/planState";
import { WRITE_BLOCKED_TOAST_HE } from "@/lib/planCopy";
import { hexToRgb, lighten, darken, DEFAULT_ACCENT } from "@/lib/theme";
import { formatDate, getWeekDates } from "../shared/datesAndLinks";

export function useThemeAndPlanSection(ctx) {
  const {
    planRow, settings, toast, weekStart,
  } = ctx;
  /* @section-body */const weekDates = getWeekDates(weekStart);
  const now    = new Date();
  const today  = formatDate(now);
  // One CALENDAR day, not 24 hours: on the night before Israel's spring clock change, now+24h lands on the day after tomorrow.
  const tomorrow = formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, 12));
  const thisMonth = now.getMonth();
  const thisYear  = now.getFullYear();
  const lastMonth = thisMonth===0?11:thisMonth-1;
  const lastMonthYear = thisMonth===0?thisYear-1:thisYear;
  // Kalmea chrome accent (Stage 2 of the rebrand). Before this, this whole
  // family (pc/pc2/pcDeep/pcTint/pcGrad...) was derived from
  // settings.primary_color, and "hybrid theming" meant the ENTIRE dashboard
  // shell - nav, buttons, calendar highlights, every one of the ~345 uses
  // below - re-tinted to match whatever color a tenant picked. That mixed two
  // different things a client could read as branding into one variable: HER
  // business, and Kalmea the product. The shell is now fixed to Kalmea's
  // deep green regardless of her choice; her real color still exists, as
  // herAccent below, for the few things reached from inside this shell that
  // are genuinely hers (the printed receipt; DesignStudio, which re-applies
  // it locally further down since it otherwise inherits whatever this
  // component sets here).
  const pc = "#1F3A30";
  // Her actual accent (or the Kalmea product default if she hasn't chosen one
  // yet) - deliberately NOT what `pc` holds anymore. Read this, never `pc`,
  // anywhere that renders something a client attributes to her business.
  const herAccent = (settings&&settings.primary_color)||DEFAULT_ACCENT;
  // Derived theme shades from the CHROME accent above - the dashboard no
  // longer recolors when she picks a color in settings; only her own
  // public-facing surfaces do, via herAccent.
  // hexToRgb / lighten / darken now live in lib/theme.ts so every page can use
  // the same derivation. Same maths, same output - see the imports at the top.
  const pcRgb = hexToRgb(pc);
  const pc2 = lighten(pc, 0.22);                 // lighter partner for gradients
  const pcDeep = darken(pc, 0.16);               // deeper partner for premium depth
  const pcSoft = `rgba(${pcRgb.r},${pcRgb.g},${pcRgb.b},0.10)`;  // soft tint backgrounds
  const pcTint = lighten(pc, 0.90);                              // light selected/hover bg
  const pcTint2 = lighten(pc, 0.82);                             // slightly stronger tint
  const pcGrad = `linear-gradient(135deg,${pc2} 0%,${pcDeep} 100%)`;  // elegant diagonal
  const pcShadow = `rgba(${pcRgb.r},${pcRgb.g},${pcRgb.b},0.28)`;

  // ── TRIAL / SUBSCRIPTION STATE ──────────────────────────────────────────
  //    Derived from the tenants row loaded in loadAll, and rendered by
  //    <TrialBanner/> inside <main>. Phase 3 adds the access gate; today this
  //    state only decides what the banner says.
  //    planState() fails OPEN: an unreadable row, a missing column or an
  //    unrecognised status all report an unblocked tenant with tone 'none', so
  //    no banner appears. Blocking only ever happens on a definite 'expired'
  //    or 'paused'.
  const planInfo = planState(planRow);

  // Read-only mode: an expired or paused tenant keeps FULL read access to her
  // calendar, clients and reports, and loses only the ability to write. Call
  // guardWrite() first in every mutating handler: it explains the situation in
  // Hebrew and returns true, meaning "stop here". The RLS restrictive policies
  // are the actual enforcement; this exists so she gets a clear explanation
  // instead of a failed request, and so no pointless round trip is made.
  const readOnly = planInfo.isBlocked;
  const guardWrite = useCallback(() => {
    if (!planInfo.isBlocked) return false;
    toast(WRITE_BLOCKED_TOAST_HE, "error");
    return true;
  }, [planInfo.isBlocked, toast]);/* @section-end */
  return { guardWrite, herAccent, lastMonth, lastMonthYear, now, pc, pc2, pcDeep, pcGrad, pcShadow, pcTint, planInfo,
    readOnly, thisMonth, thisYear, today, tomorrow, weekDates };
}
