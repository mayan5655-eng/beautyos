// lib/intakeCopy.ts
//
// The client-facing lines of the intake gate (lib/intakeGate.ts), in a file of their own so the public booking page can show
// them without pulling every form template into its bundle. Warm, feminine, no em dashes.

/** The line on the booking confirmation screen above the form link. */
export const INTAKE_CONFIRM_HE = 'לפני הטיפול יש למלא טופס קצר. אפשר כבר עכשיו, זה לוקח כמה דקות:';
export const INTAKE_CONFIRM_BTN_HE = 'למילוי הטופס';

/** The patch-test line on the confirmation screen, for a first-time client on a gated service. */
export function patchTestConfirmHe(businessName?: string | null): string {
  const who = String(businessName || '').trim() || 'העסק';
  return `לפני טיפול ראשון כזה צריך בדיקת רגישות קצרה. ${who} תתאם איתך מתי לעשות אותה.`;
}
