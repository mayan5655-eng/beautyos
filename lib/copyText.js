// lib/copyText.js
//
// Copy text to the clipboard and say truthfully whether it worked.
//
// Found in the 2026-10-24 phone review: three copy buttons called navigator.clipboard.writeText bare. Where the page has no clipboard
// object at all (the Instagram / Facebook in-app browsers), that is a TypeError: "copy the whole reel" did nothing, "copy" on a content
// post showed the raw English message "Cannot read properties of undefined", and the lead-key button said "copied" for a write the browser
// had refused. This tries the clipboard, then the old selection copy that iPhone and in-app browsers still allow inside a tap, and resolves
// true only when one of them took.
export async function copyText(text, env = {}) {
  const nav = env.navigator || (typeof navigator !== 'undefined' ? navigator : null);
  const doc = env.document || (typeof document !== 'undefined' ? document : null);
  const value = String(text ?? '');
  try {
    if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') { await nav.clipboard.writeText(value); return true; }
  } catch { /* refused: try the selection copy */ }
  try {
    if (!doc || typeof doc.execCommand !== 'function') return false;
    const ta = doc.createElement('textarea');
    ta.value = value; ta.setAttribute('readonly', ''); ta.setAttribute('aria-hidden', 'true');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px'; // 16px: iPhone zooms a smaller field it focuses
    doc.body.appendChild(ta);
    ta.focus(); ta.select(); ta.setSelectionRange(0, value.length);
    const ok = doc.execCommand('copy');
    ta.remove();
    return !!ok;
  } catch { return false; }
}
