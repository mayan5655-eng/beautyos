// lib/design/limitText.ts
//
// The one rule for a text field's maximum length: text never exceeds the
// field's maxLength, and is cut at the last whole word that fits. Only a
// single unbroken run has no word boundary, so it is cut at maxLength.

export function limitText(value: string, max?: number | null): string {
  const s = value.trim();
  if (!max || s.length <= max) return s;
  const cut = s.slice(0, max);
  if (/\s/.test(s[max])) return cut.trim();
  const at = cut.search(/\s\S*$/);
  return (at > 0 ? cut.slice(0, at) : cut).trim();
}
