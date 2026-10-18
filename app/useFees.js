'use client';

// app/useFees.js
//
// The cancellation-fee questions waiting for her (pending fees, and deposit refunds that failed), shared by every place that shows them: the home
// screen, an appointment, a client card. ONE request serves them all, and a window event ("kalmea:fees-changed") reloads it after she cancels an
// appointment or marks a no-show. When the Grow screens are off the route answers 404 and this stays empty and silent.
import { useEffect, useState } from 'react';

const store = { items: [], hidden: false, loaded: false };
const subs = new Set();
let inflight = null;

const notify = () => subs.forEach((f) => f({}));

export async function reloadFees() {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch('/api/grow/fees');
      const j = await r.json().catch(() => null);
      if (r.ok && j && j.success) { store.items = j.items || []; store.hidden = false; } else { store.items = []; store.hidden = true; }
    } catch { store.items = []; store.hidden = true; }
    store.loaded = true;
    inflight = null;
    notify();
  })();
  return inflight;
}

if (typeof window !== 'undefined') window.addEventListener('kalmea:fees-changed', () => { reloadFees(); });

export function useFees() {
  const [, force] = useState({});
  useEffect(() => {
    subs.add(force);
    if (!store.loaded) reloadFees();
    return () => { subs.delete(force); };
  }, []);
  return { items: store.items, hidden: store.hidden, reload: reloadFees };
}

/** Tell every list that something changed (she cancelled, marked a no-show, or undid one). Safe to call when Grow is off. */
export function feesChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('kalmea:fees-changed'));
}
