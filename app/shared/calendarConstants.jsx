"use client";
// app/shared/calendarConstants.jsx — the calendar's fixed numbers and lists: row height, hours offered, day names, the skin scan's steps.
//
// Moved out of app/beautyos.jsx by scripts/extract-module.mjs, byte for byte: nothing between the two markers below was
// rewritten. app/beautyos.jsx imports every name this file exports; scripts/check-screens.mjs holds the two lists and the
// declarations equal. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back in its place.
import { uiDir } from "@/lib/i18n/tr";

/* @module-body */
// ============================================================
// CONSTANTS
// ============================================================

// No default/demo services: a new cosmetician starts with an empty list and is
// guided (empty state + first-run checklist) to add her own real services.

// Pixels per 30-minute row in the week grid. 28 gives a 60-minute
// appointment 56px - enough for a name plus one detail line at 62px wide.
const WK_ROW_H = 28;
// Every hour of the day, indexed BY THE HOUR: HOURS_ALL[9] === "09:00".
//
// This was 07:00–20:00, which meant a cosmetician who works evenings could not
// describe her own week — the hours simply were not in the list, and every
// reader compensated with a hardcoded -7 offset. Cosmeticians do not share a
// schedule: some start at 07:00, some finish at 22:00, some work Saturday night
// after Shabbat. The list is now the whole day and the index IS the hour, so
// there is no offset left to get wrong.
const HOURS_ALL = Array.from({length:24},(_,h)=>`${String(h).padStart(2,"0")}:00`);
// Closing times run 01:00–24:00: a day that ends at midnight is a real answer,
// and "24:00" is how it reads on a Hebrew price list.
const CLOSE_HOURS = Array.from({length:24},(_,i)=>({value:i+1,label:`${String(i+1).padStart(2,"0")}:00`}));
// 12.5px rather than the 11px these were: a 24-entry list is read, not glanced
// at. On a phone the .sheet rule raises every select to 16px anyway.
const hourSelectStyle = {border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"7px 9px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface)",color:"var(--ink)"};
const DAYS_HE = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
// Reassuring steps cycled through while the AI skin scan is processing, so the
// wait feels alive and progressing rather than frozen.
const SCAN_STEPS = ["בודקת גוון עור...","מזהה מרקם ולחות...","מאתרת אזורי טיפול...","מכינה המלצות מותאמות..."];
/* @module-end */
export {
  CLOSE_HOURS, DAYS_HE, HOURS_ALL, hourSelectStyle, SCAN_STEPS, WK_ROW_H,
};
