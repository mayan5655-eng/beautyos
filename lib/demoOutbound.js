// lib/demoOutbound.js
// The demo dashboard must never reach a real person.
//
// The demo clients carry real-looking Israeli mobiles (050-100-xxxx), and every
// "שלחי" / "שליחה" / call button opens WhatsApp or the dialer at that number.
// /demo promises "שום הודעה לא יוצאת באמת", yet a prospect who pressed send in
// WhatsApp would have written to a stranger (found live 2026-10-23). Rather
// than touch the dozens of places that build a wa.me link, the demo blocks the
// one thing they all end in: a link or a window to WhatsApp or tel:.

const OUTBOUND = /^(?:https?:\/\/(?:wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|chat\.whatsapp\.com)\b|whatsapp:|tel:|sms:)/i;

/** True for a URL that would open a conversation or a call with someone. */
export function isOutboundContactUrl(url) {
  return typeof url === "string" && OUTBOUND.test(url.trim());
}

/**
 * Blocks outbound contact for as long as it is installed. `onBlocked()` is
 * called each time something was stopped (to tell her why nothing opened).
 * Returns the uninstall function. Browser only.
 */
export function installDemoOutboundGuard(onBlocked) {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  const realOpen = window.open;
  // Capture phase, so it runs before the browser follows the link. The click
  // still reaches React: in the demo a button may mark its row as handled.
  const onClick = (e) => {
    const a = e.target && typeof e.target.closest === "function" ? e.target.closest("a[href]") : null;
    if (a && isOutboundContactUrl(a.getAttribute("href") || "")) { e.preventDefault(); onBlocked(); }
  };
  document.addEventListener("click", onClick, true);
  window.open = function demoGuardedOpen(url, ...rest) {
    if (isOutboundContactUrl(String(url || ""))) { onBlocked(); return null; }
    const w = realOpen.call(window, url, ...rest);
    // A blank window opened first and pointed at the link afterwards (the
    // popup-blocker workaround): close it instead of letting it navigate out.
    if (w && !url) {
      try {
        let target = "";
        return new Proxy(w, {
          get(t, k) {
            if (k === "location") return new Proxy({}, {
              set(_, prop, v) { if (prop === "href" && isOutboundContactUrl(String(v))) { try { t.close(); } catch {} onBlocked(); return true; } target = String(v); t.location.href = target; return true; },
              get(_, prop) { return t.location[prop]; },
            });
            const v = t[k]; return typeof v === "function" ? v.bind(t) : v;
          },
        });
      } catch { return w; }
    }
    return w;
  };
  return () => { document.removeEventListener("click", onClick, true); window.open = realOpen; };
}
