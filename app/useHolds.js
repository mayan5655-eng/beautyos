'use client';

// app/useHolds.js
//
// The deposit holds waiting for a payment (see app/api/grow/holds): ONE request serves every card on screen, refreshed once a minute, and a ticking
// clock so the "minutes left" stay true. Empty and silent while the Grow screens are off (the route answers 404).
import { useEffect, useState } from 'react';

const store = { holds: [], loaded: false, hidden: false };
const subs = new Set();
let timer = null;
let inflight = null;

const notify = () => subs.forEach((f) => f({}));

async function reload() {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch('/api/grow/holds');
      const j = await r.json().catch(() => null);
      if (r.ok && j && j.success) { store.holds = j.holds || []; store.hidden = false; } else { store.holds = []; store.hidden = true; }
    } catch { store.holds = []; store.hidden = true; }
    store.loaded = true;
    inflight = null;
    notify();
  })();
  return inflight;
}

if (typeof window !== 'undefined') window.addEventListener('kalmea:holds-changed', () => { reload(); });

/** The hold of one appointment as { expiresAt, minutesLeft } (minutesLeft rounded up, at least 1), or null. */
export function useHold(appointmentId) {
  const [, force] = useState({});
  useEffect(() => {
    subs.add(force);
    if (!store.loaded) reload();
    if (!timer && typeof window !== 'undefined') timer = setInterval(() => { if (!store.hidden) { if (Date.now() % 60000 < 30000) reload(); notify(); } }, 30000);
    return () => { subs.delete(force); if (subs.size === 0 && timer) { clearInterval(timer); timer = null; } };
  }, []);
  if (store.hidden || appointmentId == null) return null;
  const h = store.holds.find((x) => String(x.appointmentId) === String(appointmentId));
  if (!h) return null;
  const left = Math.ceil((new Date(h.expiresAt).getTime() - Date.now()) / 60000);
  return left > 0 ? { expiresAt: h.expiresAt, minutesLeft: left } : null;
}
