// lib/intakeCopy.ts
//
// The client-facing lines of the intake gate (lib/intakeGate.ts), in a file of their own so the public booking page can show
// them without pulling every form template into its bundle. Warm, feminine, no em dashes.

/** The line on the booking confirmation screen above the form link. */
export const INTAKE_CONFIRM_HE = 'לפני הטיפול יש למלא טופס קצר. אפשר כבר עכשיו, זה לוקח כמה דקות:';
export const INTAKE_CONFIRM_BTN_HE = 'למילוי הטופס';

/**
 * The line for a booker who does not get the link on screen (a client already in her book): the business sends it. Worded so it
 * holds whether or not she already filled it, because the public page must not say which (it would tell a stranger about her record).
 */
export function intakeFromBusinessHe(businessName?: string | null): string {
  const who = String(businessName || '').trim() || 'העסק';
  return `לפני הטיפול יש למלא טופס קצר. אם עוד לא מילאת אותו, ${who} תשלח לך קישור אליו.`;
}

/**
 * The patch-test line on the confirmation screen, for every booking of a service with a patch test. Conditional on purpose: the
 * public page is not told whether this is her first visit (that would reveal a client's history to whoever typed her number).
 */
export function patchTestConfirmHe(businessName?: string | null): string {
  const who = String(businessName || '').trim() || 'העסק';
  return `אם זה הטיפול הראשון שלך מהסוג הזה, צריך לפני כן בדיקת רגישות קצרה. ${who} תתאם איתך מתי לעשות אותה.`;
}
