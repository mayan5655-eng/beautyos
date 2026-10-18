'use client';

// app/useGrowPolicy.js
//
// Whether this business is connected to Grow and which cancellation mode it uses, as { loaded, connected, mode }. ONE request serves every place that
// needs it (the per-service "requires deposit" switch, the "request deposit?" switch when she books by hand). Everything that uses it renders nothing
// while the Grow screens are off (the route answers 404) or before she is connected.
import { useEffect, useState } from 'react';

const store = { loaded: false, connected: false, mode: 'off' };
const subs = new Set();
let inflight = null;

async function load() {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch('/api/grow/policy');
      const j = await r.json().catch(() => null);
      if (r.ok && j && j.success) { store.connected = !!j.connected; store.mode = j.policy?.mode || 'off'; } else { store.connected = false; store.mode = 'off'; }
    } catch { store.connected = false; store.mode = 'off'; }
    store.loaded = true;
    inflight = null;
    subs.forEach((f) => f({}));
  })();
  return inflight;
}

/** Call after the policy was saved, so the switches reflect the new mode. */
export function growPolicyChanged() { store.loaded = false; load(); }

export function useGrowPolicy() {
  const [, force] = useState({});
  useEffect(() => {
    subs.add(force);
    if (!store.loaded) load();
    return () => { subs.delete(force); };
  }, []);
  return { loaded: store.loaded, connected: store.connected, mode: store.mode };
}
