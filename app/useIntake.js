'use client';

// app/useIntake.js
//
// The intake badges for every card on screen (app/api/intake): ONE request serves all of them, refreshed every five minutes
// and when a service setting is saved. Silent and empty when nothing is gated, before the migration, or on any error, so a
// business that never turned the gate on sees nothing at all (owner rule 2026-11-09).
//
// Once per visit (useIntakeQueueSync) it also asks the server to put "send the form" in her manual send queue for the next days' gated
// appointments whose form is still missing (POST { sync: true }); then the queue list refreshes itself on the
// onQueued callback.
import { useEffect, useState } from 'react';

const store = { items: new Map(), loaded: false, anyGated: false };
const subs = new Set();
let timer = null;
let inflight = null;
let synced = false;

const notify = () => subs.forEach((f) => f({}));

async function reload() {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch('/api/intake', { cache: 'no-store' });
      const j = await r.json().catch(() => null);
      const next = new Map();
      if (r.ok && j && j.success && Array.isArray(j.items)) for (const it of j.items) next.set(String(it.appointmentId), it.badges || []);
      store.items = next;
      store.anyGated = !!(r.ok && j && j.success && j.ready && j.items.length > 0);
    } catch { store.items = new Map(); store.anyGated = false; }
    store.loaded = true;
    inflight = null;
    notify();
  })();
  return inflight;
}

if (typeof window !== 'undefined') window.addEventListener('kalmea:intake-changed', () => { reload(); });

/**
 * Once per visit: "send the form" lines in her manual queue for the next days' gated appointments still missing one
 * (POST { sync: true }). Only when the status read showed at least one gated appointment. `onQueued` refreshes her queue list.
 */
export function useIntakeQueueSync(onQueued) {
  useEffect(() => {
    let gone = false;
    (store.loaded ? Promise.resolve() : reload()).then(() => {
      if (gone || synced || !store.anyGated) return;
      synced = true;
      fetch('/api/intake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sync: true }) })
        .then((x) => x.json()).then((x) => { if (!gone && x && x.queued > 0 && typeof onQueued === 'function') onQueued(); })
        .catch(() => {});
    });
    return () => { gone = true; };
    // Once per mount on purpose: onQueued is a fresh function on every render of the dashboard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** The badges of one appointment ([{ kind, label }]), or [] when its service has no gate. */
export function useIntakeBadges(appointmentId) {
  const [, force] = useState({});
  useEffect(() => {
    subs.add(force);
    if (!store.loaded) reload();
    if (!timer && typeof window !== 'undefined') timer = setInterval(() => { reload(); }, 5 * 60 * 1000);
    return () => { subs.delete(force); if (subs.size === 0 && timer) { clearInterval(timer); timer = null; } };
  }, []);
  if (appointmentId == null) return [];
  return store.items.get(String(appointmentId)) || [];
}
