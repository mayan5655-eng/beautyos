'use client';

// app/pendingSaves.js
//
// Settings cards that save to their own table (the cancellation policy, for one) have their own save button, but she sees one sticky
// "שמירה" bar at the bottom of Settings. Before this, a change in such a card left that bar on "אין שינויים" and disabled, and "סגירה"
// threw the change away without asking: the change looked impossible to save. A card with an unsaved change registers its save here;
// the bar counts it as a change, its "שמירה" runs it, and closing asks first.
import { useSyncExternalStore } from 'react';

const pending = new Map(); // key -> async () => boolean (true when saved)
const subs = new Set();
const emit = () => subs.forEach((f) => f());

/** Register (or, with null, clear) the save of a card that has an unsaved change. */
export function setPendingSave(key, save) {
  if (save) pending.set(key, save); else if (pending.has(key)) pending.delete(key); else return;
  emit();
}

const subscribe = (f) => { subs.add(f); return () => { subs.delete(f); }; };
const count = () => pending.size;

/** How many cards have an unsaved change. */
export function usePendingSaveCount() {
  return useSyncExternalStore(subscribe, count, () => 0);
}

/** Runs every pending save; true only when all of them saved. A card clears its own entry once it saved. */
export async function flushPendingSaves() {
  let ok = true;
  for (const save of [...pending.values()]) {
    try { if (!(await save())) ok = false; } catch { ok = false; }
  }
  return ok;
}

/** Forget every pending change (she chose to leave without saving). */
export function clearPendingSaves() {
  if (!pending.size) return;
  pending.clear();
  emit();
}
