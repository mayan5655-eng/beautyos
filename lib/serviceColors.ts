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
