// lib/safeNext.ts
//
// Where to go after signing in, from a ?next= address. Only a path on this same site is accepted (it starts with one
// "/", has no scheme, no "//" and no backslash), so a crafted link can never send her to another site after login.
// Anything else falls back to the home screen.
export function safeNext(raw: unknown, fallback = '/'): string {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!v || v.length > 500) return fallback;
  if (!v.startsWith('/') || v.startsWith('//') || v.includes(String.fromCharCode(92)) || /^\/[a-z][a-z0-9+.-]*:/i.test(v)) return fallback;
  if (/[\u0000-\u001f]/.test(v)) return fallback;
  return v;
}
