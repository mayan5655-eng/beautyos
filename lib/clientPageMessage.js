// lib/clientPageMessage.js
//
// The WhatsApp text that goes with the personal results page. Written like the cosmetician writing to her own client, in the
// feminine; the app opens it in HER WhatsApp from a tap (lib/whatsappLink) - it is never sent automatically.

/** @param {{name?: string, businessName?: string, url: string, hasPhotos?: boolean, signoff?: string}} p */
export function clientPageMessage({ name, businessName, url, hasPhotos = false, signoff = '' } = {}) {
  const first = String(name || '').trim().split(/\s+/)[0];
  const hi = first ? `היי ${first}! 🌸` : 'היי! 🌸';
  const what = hasPhotos
    ? 'הכנתי לך דף אישי: התמונות מהטיפולים שלך, מה עשינו, והמלצות לשמירה על התוצאה.'
    : 'הכנתי לך דף אישי: מה עשינו, והמלצות לשמירה על התוצאה.';
  const lines = [hi, what, 'ומשם אפשר לקבוע גם את הטיפול הבא בלחיצה אחת.', '', String(url || '').trim()];
  const sign = String(signoff || '').trim() || String(businessName || '').trim();
  if (sign) lines.push('', sign);
  return lines.join('\n');
}
