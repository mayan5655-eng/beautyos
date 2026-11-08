// lib/serviceColors.ts
//
// The colour palette a service row gets when it is created.
//
// Lifted out of app/beautyos.jsx so that the three places that now create
// services — the settings form, the paste import, and the onboarding template
// picker — assign colours from one list instead of three copies. The picker
// lives on /onboarding, which does not import the app component at all, so a
// shared module was the only way to keep the cycle in step.

/** Used when a service has no colour of its own. */
export const DEFAULT_SERVICE_COLOR = '#D9B98C';

/**
 * Cycled through in order as services are created, so a fresh menu comes out
 * varied instead of eight identical dots. Callers continue the cycle from the
 * number of services that already exist rather than restarting at 0.
 */
export const SERVICE_COLOR_CYCLE = [
  '#F4A7B9',
  '#A7C4F4',
  '#B5EAD7',
  '#FFDAC1',
  '#E2CFEA',
  '#F9C6D0',
  '#D9B98C',
  '#C7E9E4',
];

/** The colour for the nth service created, continuing the cycle. */
export function serviceColorAt(index: number): string {
  const n = SERVICE_COLOR_CYCLE.length;
  return SERVICE_COLOR_CYCLE[((index % n) + n) % n];
}

const HEX = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;
/** A real stored colour, or null. "var(--pc)" and other CSS expressions are not colours a calendar row can keep. */
export function hexOrNull(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return HEX.test(s) ? s : null;
}

/**
 * The colour an appointment booked from her public page is stored with: the service's own colour, else what the page sent
 * (only if it is a real hex), else her primary colour (settings.primary_color), else the default service colour. The booking
 * page used to send the literal "var(--pc)" for a service with no colour, and that string was written to appointments.color,
 * where it means nothing outside her public page (the calendar, exports and the app all read it as a colour).
 */
export function bookedAppointmentColor(serviceColor: unknown, sentColor: unknown, primaryColor: unknown): string {
  return hexOrNull(serviceColor) || hexOrNull(sentColor) || hexOrNull(primaryColor) || DEFAULT_SERVICE_COLOR;
}
