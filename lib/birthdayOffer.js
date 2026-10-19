// lib/birthdayOffer.js
//
// The birthday gift is HER offer, not ours. The manual birthday message used to
// promise "15% הנחה" to every client of every business, a discount nobody chose.
// Now it is a line she sets in Settings > messages (automations.birthday_offer):
//
//   key absent      -> the old default, so nothing changes for her until she edits it
//   ""  (cleared)   -> no discount line at all
//   any other text  -> her words, trimmed and capped
//
// The automatic birthday message (lib/reminders/smartReminders.js) carries the
// line only when she wrote one herself: it never promised a discount, and an
// automated promise she did not type should not appear on its own.

export const DEFAULT_BIRTHDAY_OFFER = "15% הנחה על הטיפול הבא שלך";
const MAX = 80;

/** Her offer text, or "" for none. */
export function birthdayOfferOf(automations) {
  const a = automations && typeof automations === "object" ? automations : {};
  if (!Object.prototype.hasOwnProperty.call(a, "birthday_offer")) return DEFAULT_BIRTHDAY_OFFER;
  return String(a.birthday_offer ?? "").replace(/\s+/g, " ").trim().slice(0, MAX);
}

/** Only an offer she typed herself (for the automatic message). */
export function explicitBirthdayOffer(automations) {
  const a = automations && typeof automations === "object" ? automations : {};
  if (!Object.prototype.hasOwnProperty.call(a, "birthday_offer")) return "";
  return birthdayOfferOf(a);
}

/** The manual birthday message body (before the marketing footer). */
export function birthdayMessage(name, businessName, automations) {
  const b = (businessName || "").trim();
  const bs = b && b !== "העסק שלי" ? b : "";
  const offer = birthdayOfferOf(automations);
  return `שלום ${name}! \nיום הולדת שמח! \n${bs ? `מ${bs} ` : ""}אנחנו שולחים לך ברכות חמות!\n${offer ? `לרגל היום המיוחד - ${offer} \n` : ""}נחכה לך! ✦`;
}
