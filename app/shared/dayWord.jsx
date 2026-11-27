"use client";
// app/shared/dayWord.jsx — the word for a day next to today ('היום', 'מחר'), for the text of a message.
//
// Moved out of app/beautyos.jsx by scripts/extract-module.mjs, byte for byte: nothing between the two markers below was
// rewritten. app/beautyos.jsx imports every name this file exports; scripts/check-screens.mjs holds the two lists and the
// declarations equal. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back in its place.


/* @module-body */
// " היום" / " מחר" from the appointment's own date at the moment the text is built, never assumed (2026-11-02 audit).
function dayWordFor(dateStr) {
  const todayIL = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  const diff = Math.round((Date.parse(String(dateStr).slice(0, 10)) - Date.parse(todayIL)) / 86_400_000);
  return diff === 0 ? " היום" : diff === 1 ? " מחר" : "";
}
/* @module-end */
export {
  dayWordFor,
};
