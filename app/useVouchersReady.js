'use client';
// app/useVouchersReady.js
//
// "Are gift vouchers installed for this business?" (app/api/vouchers?probe=1). Before add_gift_vouchers_2026-11-08.sql runs the
// till button, the settings card and the marketing card render NOTHING (owner decision: no "missing update" sentence for every
// business). One request per page load, shared by every caller.
import { useEffect, useState } from 'react';

let pending = null;
function probe() {
  if (!pending) {
    pending = fetch('/api/vouchers?probe=1')
      .then((r) => r.json().catch(() => null))
      .then((j) => ({ ready: !!(j && j.success && j.ready), slug: (j && j.slug) || null }))
      .catch(() => { pending = null; return { ready: false, slug: null }; });
  }
  return pending;
}

/** { ready: boolean | null, slug } - null while asking. `enabled` false skips the request (the feature is switched off). */
export function useVouchersReady(enabled = true) {
  const [s, setS] = useState({ ready: null, slug: null });
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    probe().then((v) => { if (live) setS(v); });
    return () => { live = false; };
  }, [enabled]);
  return enabled ? s : { ready: false, slug: null };
}
