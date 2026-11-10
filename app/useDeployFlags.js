'use client';

// app/useDeployFlags.js
//
// The deployment switches the browser cannot read (/api/feature-visibility), as { loaded, grow, billing, autoSend }. ONE request per
// page load serves every caller. Until it answers, and on any failure, every switch reads false: what is not known to be active is
// hidden, never promised (2026-11-09 owner rule).
import { useEffect, useState } from 'react';

const OFF = { grow: false, billing: false, autoSend: false };
const store = { loaded: false, ...OFF };
const subs = new Set();
let inflight = null;

async function load() {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch('/api/feature-visibility', { cache: 'no-store' });
      const j = await r.json().catch(() => null);
      const ok = r.ok && j && j.success;
      store.grow = ok && j.grow === true;
      store.billing = ok && j.billing === true;
      store.autoSend = ok && j.autoSend === true;
    } catch { Object.assign(store, OFF); }
    store.loaded = true;
    inflight = null;
    subs.forEach((f) => f({}));
  })();
  return inflight;
}

export function useDeployFlags() {
  const [, force] = useState({});
  useEffect(() => {
    subs.add(force);
    if (!store.loaded) load();
    return () => { subs.delete(force); };
  }, []);
  return { loaded: store.loaded, grow: store.grow, billing: store.billing, autoSend: store.autoSend };
}
