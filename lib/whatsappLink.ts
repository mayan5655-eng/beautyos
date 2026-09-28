// lib/whatsappLink.ts
//
// One wa.me link builder, shared. Mirrors the local waLink()/waMsg() pair
// that has lived inline in app/beautyos.jsx since before this file existed
// (that copy is untouched — this is for new server/lib code, starting with
// lib/design/mapBranding.ts's whatsapp_url variable source, that has no
// business importing from an 11,000-line client component).
//
// Israeli-number rule: a local number starts with a trunk "0" that an
// international link must not carry — "050-1234567" becomes "972501234567",
// never "9720501234567".

/** "https://wa.me/972501234567", or null when there is no usable phone. */
export function waLink(phone: string | null | undefined): string | null {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const intl = digits.startsWith('0') ? '972' + digits.slice(1) : digits;
  return `https://wa.me/${intl}`;
}

/** The same link, with a pre-filled message. */
export function waMsgLink(phone: string | null | undefined, msg: string): string | null {
  const base = waLink(phone);
  return base ? `${base}?text=${encodeURIComponent(msg)}` : null;
}
