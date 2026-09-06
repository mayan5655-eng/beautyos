// lib/cleanText.ts
// Printable line, trimmed and length-capped; empty string when unusable.
// Strips ASCII control characters (0x00-0x1F, 0x7F) so header injection and
// invisible-character games die at the door.
//
// The character class is built with fromCharCode rather than written as
// escape sequences: every attempt to type the escapes inline was mangled into
// literal control bytes on the way to disk, turning the source file binary.
// Constructed code cannot be mangled - there is nothing to misinterpret.
const CONTROL_CHARS = new RegExp(
  '[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']',
  'g'
);

export function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(CONTROL_CHARS, ' ').trim().slice(0, max);
}
