// lib/personName.js
//
// "Is this a NAME, or a login handle that ended up in the name field?"
//
// settings.therapist_name used to be pre-filled from the email's local part ("maya.cohen",
// "mayan5655") and saved as-is if she skipped the field. It then appeared, as if it were her name,
// on her public booking page ("נעים מאוד, אני maya.cohen"), in her own greeting, in the bot's replies
// and in booking confirmations - found 2026-10-06 on a brand-new tenant. The AI profile already
// refused such a name (lib/ai/profileHygiene.ts); this is that rule, moved here so everything that
// shows a name to a person uses the same one. Better no name than a wrong one: with no name the copy
// is written in the first person, which is what it wants anyway.
//
// Digits or an @ are the giveaway; so is an all-lowercase ASCII token with no spaces. A real name -
// Hebrew, or capitalised Latin - passes.

export function looksLikeLoginHandle(name) {
  const s = String(name || '').trim();
  if (!s) return true;
  if (/\d/.test(s)) return true;
  if (s.includes('@')) return true;
  if (/^[a-z0-9._\-]+$/.test(s)) return true; // "mayan", "maya.cohen", "maayan_b"
  return false;
}

/** The name, or '' when it is a handle (or empty). Safe to drop straight into a sentence. */
export function displayName(name) {
  const s = typeof name === 'string' ? name.trim() : '';
  return s && !looksLikeLoginHandle(s) ? s : '';
}
